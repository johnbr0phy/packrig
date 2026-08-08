import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createBike, PAINTS } from './bike.js';
import { Environments } from './environments.js';
import { BagSystem, SLOTS } from './bags.js';
import { loadCatalog } from './catalog.js';
import { initUI } from './ui.js';
import { initFocus } from './focus.js';
import { applyRendererProfile, applyViewOffset, fitToBox, measureProfile } from './mobile.js';

const params = new URLSearchParams(location.search);
const SHOT_MODE = params.has('shot');

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: SHOT_MODE });
// Decide the device profile BEFORE the post chain is built: `post` says which
// passes to construct at all, and a GTAOPass that is merely disabled still
// allocates its render targets — memory a phone has better uses for. On a
// desktop pointer this returns today's exact settings.
const profile = applyRendererProfile(renderer);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(27, window.innerWidth / window.innerHeight, 0.05, 600);

// ---- Post pipeline: GTAO ambient occlusion, subtle bloom, SMAA ----------
const composer = new EffectComposer(renderer);
composer.setPixelRatio(profile.pixelRatio);
composer.addPass(new RenderPass(scene, camera));
// GTAO is the first thing to go on a phone: it is the most expensive pass and
// its contribution is subtlest at phone size. SMAA is the last, because
// aliasing on 32 spokes is very visible. Measured cost at 393x852 on an M1:
// all three at DPR 2 = 13.3ms; bloom+SMAA at DPR 1.5 = 4.5ms.
let gtao = null;
if (profile.post.gtao) {
  gtao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
  gtao.updateGtaoMaterial({ radius: 0.2, distanceExponent: 1.5, thickness: 0.6, scale: 1.1, samples: 12 });
  composer.addPass(gtao);
}
let bloom = null;
if (profile.post.bloom) {
  bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.11, 0.4, 1.08);
  composer.addPass(bloom);
}
composer.addPass(new OutputPass());
if (profile.post.smaa) composer.addPass(new SMAAPass(window.innerWidth, window.innerHeight));

// ---- Bike --------------------------------------------------------------
const bike = createBike({ paint: params.get('paint') || 'Slate' });
// centre the bike: its BB sits at origin; wheels touch y = bbDrop - tireR (negative)
const P = bike.points;
const wheelBottom = (P.rearAxle.y - (P.tireR + bike.geo.tireWidth / 2)) * 0.001;
bike.group.position.y = -wheelBottom; // wheels rest on y=0
const bikeCenter = new THREE.Vector3(((P.rearAxle.x + P.frontAxle.x) / 2) * 0.001, 0.62, 0);
scene.add(bike.group);

// ---- Camera presets ----------------------------------------------------
const CAMS = {
  // slightly elevated, longer-lens compositions: horizon lands in the upper
  // quarter of frame and the environment overlaps the full silhouette
  side:  { pos: [bikeCenter.x, 0.92, 3.7], tgt: [bikeCenter.x, 0.55, 0] },
  tq:    { pos: [bikeCenter.x + 1.8, 1.05, 2.85], tgt: [bikeCenter.x, 0.53, 0] },
  rear:  { pos: [bikeCenter.x - 2.15, 1.0, 2.4], tgt: [bikeCenter.x, 0.53, 0] },
  front: { pos: [bikeCenter.x + 2.85, 0.92, 1.6], tgt: [bikeCenter.x, 0.54, 0] },
  hero:  { pos: [bikeCenter.x + 1.05, 0.88, 3.25], tgt: [bikeCenter.x, 0.53, 0] },
};
function applyCam(name) {
  const c = CAMS[name] || CAMS.hero;
  camera.position.set(...c.pos);
  controls.target.set(...c.tgt);
  controls.update();
}

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 1.2;
controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.autoRotate = false;
controls.autoRotateSpeed = 0.9;

// ---- Environments ------------------------------------------------------
const envs = new Environments(scene, renderer);

// ---- App state + bag system -------------------------------------------
const app = {
  scene, camera, renderer, controls, bike, envs,
  catalog: null,
  bags: null,
  state: { env: params.get('env') || 'mountain', paint: params.get('paint') || 'Slate', kit: {} },
  setEnv(name) {
    app.state.env = name;
    envs.set(name);
    app.ui?.sync();
  },
  setPaint(name) {
    app.state.paint = name;
    bike.setPaint(name);
    app.ui?.sync();
  },
  randomize() {
    app.bags.randomKit();
    app.ui?.sync();
  },
  clearAll() {
    app.bags.clearAll();
    app.ui?.sync();
  },
};
window.app = app;
window.__THREE = THREE;   // headless audits need it to measure bounds
window.__SLOTS = SLOTS;   // tools/audit-exclusions.mjs reads the exclusion table

// ---- Boot --------------------------------------------------------------
let readyResolve;
window.__READY = new Promise((r) => (readyResolve = r));

const catalog = await loadCatalog();
app.catalog = catalog;
app.bags = new BagSystem(bike, catalog);
await envs.set(app.state.env); // HDRI must be lit before first frame
applyCam(params.get('cam') || 'hero');

// kit from URL: kit=rand | kit=seatpack:0:1,barroll:2:0 | kit=full
const kitParam = params.get('kit');
if (kitParam === 'rand') {
  const seed = parseInt(params.get('seed') || '42', 10);
  app.bags.randomKit(seed);
} else if (kitParam === 'full') {
  app.bags.fullKit();
} else if (kitParam) {
  for (const part of kitParam.split(',')) {
    const [slot, bi, pi] = part.split(':');
    app.bags.equip(slot, catalog[+bi], catalog[+bi]?.products[+pi]);
  }
}

// ?focus=<slot>: close-up camera on that bag for product-vs-spec review shots
const focusSlot = params.get('focus');
if (focusSlot) {
  // slot names are not anchor names (framebag_full → 'framebag', trunk → 'rackTop'),
  // so go through SLOTS or the close-up silently degrades to a wide shot
  const anchorName = (SLOTS[focusSlot] && SLOTS[focusSlot].anchor)
    || (focusSlot === 'pannier' ? 'pannierR' : focusSlot);
  const a = bike.anchors[anchorName];
  if (a) {
    // frame bags span the whole main triangle; back off so the outline fits
    const pull = focusSlot.startsWith('framebag') ? 2.1 : 1;
    const wp = new THREE.Vector3();
    a.getWorldPosition(wp);
    camera.position.set(wp.x + 0.45 * pull, wp.y + 0.18 * pull, wp.z + 0.85 * pull);
    controls.target.copy(wp);
    controls.update();
  } else {
    console.warn('[focus] no anchor for slot', focusSlot);
  }
}

// ---- Wind tunnel -------------------------------------------------------
// Loaded on demand: the tunnel pulls in a measurement pass, a particle system
// and a rider model, none of which should cost anything on a first paint that
// most visits never spend.
app.aero = null;
app.openWindTunnel = async () => {
  if (!app.aero) {
    const { initAero } = await import('./aero/index.js');
    app.aero = initAero(app, {
      scene, camera, renderer, controls, composer,
      passes: { gtao, bloom },   // either may be null on a phone; tunnel.js no-ops
      measure: measureProfile(),
    });
    app.bags.onChange(() => app.aero.onKitChange());
  }
  app.aero.toggle();
  // One sheet at a time. On a phone both panels are bottom sheets anchored to
  // the same edge, so the kit list has to get out of the way entirely rather
  // than merely collapse — collapsed, its peek header still overlaps the HUD
  // and still steals a hit-test region. ui.css hides it on this class.
  document.body.classList.toggle('aero-open', app.aero.active);
  app.ui?.sync();
};

/**
 * The view offset shifts the bike right of the DESKTOP kit panel. On a phone
 * both panels are bottom sheets, there is nothing to the left to clear, and a
 * fixed 165px is over a third of a 393px viewport — it shoved the bike off the
 * right edge and left the render cropped to a rear wheel.
 *
 * This is the single owner of the offset. It is re-evaluated on resize and on
 * the media query itself changing, so a device rotation cannot leave a stale
 * offset behind. The query mirrors COMPACT in ui.js — keep them in step.
 */
const DESKTOP_LAYOUT = window.matchMedia('(min-width: 901px) and (pointer: fine)');

/**
 * Camera framing is owned by src/mobile.js. It knows the sheet lift, and it
 * raises `controls.maxDistance` alongside the fit — the default ceiling of 9 is
 * BELOW the portrait fit distance, so without that the clamp silently re-crops
 * the bike and the fix looks like it did not work.
 */
const _fitBox = new THREE.Box3();
function frameBike() {
  if (SHOT_MODE) return;
  applyViewOffset(camera);
  _fitBox.setFromObject(bike.group);
  if (!_fitBox.isEmpty()) fitToBox(camera, controls, _fitBox);
}

if (!SHOT_MODE) {
  app.ui = initUI(app);
  // hover half-selects a bag; clicking commits it and centres the zoom on it
  app.focus = initFocus(app, { camera, controls, renderer });
  frameBike();
} else {
  document.getElementById('ui-root').style.display = 'none';
}

DESKTOP_LAYOUT.addEventListener('change', () => {
  frameBike();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  frameBike();
});

let frames = 0;
let prevT = 0;
renderer.setAnimationLoop((t) => {
  const dt = prevT ? Math.min((t - prevT) * 0.001, 0.05) : 0;
  prevT = t;
  app.focus?.tick(dt);
  app.aero?.tick(dt);
  controls.update();
  envs.tick(t * 0.001);
  composer.render();
  if (++frames === 10) { readyResolve(true); window.__READY_DONE = true; }
});
