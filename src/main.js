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

const params = new URLSearchParams(location.search);
const SHOT_MODE = params.has('shot');

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: SHOT_MODE });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
gtao.updateGtaoMaterial({ radius: 0.2, distanceExponent: 1.5, thickness: 0.6, scale: 1.1, samples: 12 });
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.11, 0.4, 1.08);
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.addPass(new SMAAPass(window.innerWidth, window.innerHeight));

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
      passes: { gtao, bloom },
    });
    app.bags.onChange(() => app.aero.onKitChange());
  }
  app.aero.toggle();
  app.ui?.sync();
};

if (!SHOT_MODE) {
  app.ui = initUI(app);
  // hover half-selects a bag; clicking commits it and centres the zoom on it
  app.focus = initFocus(app, { camera, controls, renderer });
  // centre the bike in the viewport area to the right of the mounts panel
  camera.setViewOffset(window.innerWidth, window.innerHeight, -165, 0, window.innerWidth, window.innerHeight);
} else {
  document.getElementById('ui-root').style.display = 'none';
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  if (!SHOT_MODE) camera.setViewOffset(window.innerWidth, window.innerHeight, -165, 0, window.innerWidth, window.innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
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
