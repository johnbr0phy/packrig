import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createBike, PAINTS, FRAME_SIZES } from './bike.js';
import { disposeObject } from './lib.js';
import { Environments } from './environments.js';
import { BagSystem, SLOTS } from './bags.js';
import { loadCatalog } from './catalog.js';
import { initUI } from './ui.js';
import { initFocus } from './focus.js';
import { createAuth } from './auth.js';
import { createRigStore } from './rigstore.js';
import { rigFromParams, applyRig } from './rig.js';
import { applyRendererProfile, applyViewOffset, fitToBox, measureProfile } from './mobile.js';
import { initScrim } from './ui/scrim.js';
import { initSurfaces } from './ui/surfaces.js';
import { initSheets } from './ui/sheet.js';

const params = new URLSearchParams(location.search);
const SHOT_MODE = params.has('shot');
// `?review=1` embeds the scene in the eval harness: no app chrome, but live
// orbit controls and a postMessage API for swapping the bag and hiding the
// bicycle. See src/review.js.
const REVIEW_MODE = params.has('review');

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
let bike = createBike({
  paint: params.get('paint') || 'Slate',
  size: params.get('size') || 'M',
});
function plantBike(b) {
  const P = b.points;
  const wheelBottom = (P.rearAxle.y - (P.tireR + b.geo.tireWidth / 2)) * 0.001;
  b.group.position.y = -wheelBottom;
}
plantBike(bike);
let bikeCenter = new THREE.Vector3(
  ((bike.points.rearAxle.x + bike.points.frontAxle.x) / 2) * 0.001, 0.62, 0,
);
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
  state: {
    env: params.get('env') || 'mountain',
    paint: params.get('paint') || 'Slate',
    size: bike.size || 'M',
    kit: {},
  },
  setEnv(name) {
    app.state.env = name;
    envs.set(name);
    app.ui?.sync();
    // A new HDRI changes the substrate under every panel. Re-read now rather
    // than waiting out the 500ms move throttle (§3.3).
    app.scrim?.invalidate();
  },
  setPaint(name) {
    app.state.paint = name;
    app.bike.setPaint(name);
    app.ui?.sync();
  },
  setSize(size) {
    if (!FRAME_SIZES[size] || app.bike?.size === size) {
      app.state.size = app.bike?.size || 'M';
      return;
    }
    const paint = app.state.paint || 'Slate';
    const bidon = app.bike.bottleColor?.('st');
    const kit = app.bags
      ? Object.entries(app.bags.equipped).map(([slot, e]) => ({
        slot, brand: e.brand, product: e.product, cw: e.colorwayIndex || 0,
      }))
      : [];
    app.bags?.clearAll();
    scene.remove(app.bike.group);
    disposeObject(app.bike.group);
    bike = createBike({ paint, size });
    plantBike(bike);
    bikeCenter.set(
      ((bike.points.rearAxle.x + bike.points.frontAxle.x) / 2) * 0.001, 0.62, 0,
    );
    scene.add(bike.group);
    app.bike = bike;
    if (app.bags) app.bags.bike = bike;
    app.state.size = bike.size;
    if (bidon != null) {
      bike.setBottleColor('st', bidon);
      bike.setBottleColor('dt', bidon);
    }
    for (const e of kit) app.bags?.equip(e.slot, e.brand, e.product, e.cw);
    frameBike();
    app.ui?.sync();
    app.scrim?.invalidate();
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
// tools/measure-loadouts.mjs mounts each curated rig and reads the tunnel's
// numbers back, to bake them into data/loadouts.json as build output.
app.__applyRig = (rig) => applyRig(app, rig);
app.__aeroReadout = () => app.aero?.readout?.() || null;

// ---- Boot --------------------------------------------------------------
let readyResolve;
window.__READY = new Promise((r) => (readyResolve = r));

const catalog = await loadCatalog();
app.catalog = catalog;
app.bags = new BagSystem(bike, catalog);
await envs.set(app.state.env); // HDRI must be lit before first frame
applyCam(params.get('cam') || 'hero');

// Accounts and saved rigs. Both work with no backend configured: rigs go to
// this browser, and `auth.enabled` is false so nothing offers to sign in.
app.auth = createAuth();
app.rigs = createRigStore(app, app.auth);
if (app.auth.enabled) app.auth.hydrate();

// A shared rig arrives in the URL. `?r=` is the durable form — it names the
// maker and model of every bag, so it still resolves the same bike after the
// catalogue is re-sorted. `?kit=` is the old positional form and is still read,
// because it is the only one in anyone's history.
const shared = rigFromParams(params, catalog);
const kitParam = params.get('kit');
if (shared) {
  // Somebody has been handed a specific bike to look at. Dropping them on the
  // root menu instead would make them find it again, so ui.js reads this and
  // skips the menu when it is set.
  app.__cameWithRig = true;
  const { missing } = applyRig(app, shared, { clear: false });
  if (missing.length) console.warn('[packrig] shared link references bags no longer in the catalogue:', missing);
} else if (kitParam === 'rand') {
  app.__cameWithRig = true;      // the screenshot harness drives these
  const seed = parseInt(params.get('seed') || '42', 10);
  app.bags.randomKit(seed);
} else if (kitParam === 'full') {
  app.__cameWithRig = true;
  app.bags.fullKit();
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
    // This block runs AFTER applyCam() and used to overwrite camera.position
    // unconditionally, which silently discarded `?cam=` entirely. Because
    // bagshot always passes `focus=<slot>`, every "angle" it rendered was the
    // same three-quarter shot: side, tq, rear and front differed by ~5% of
    // pixels, i.e. only by the bag changing shape. Three rounds of critics
    // believed they were judging four views of each bag and were judging one.
    //
    // So honour `cam` here by orbiting the focus position around the anchor.
    // The radius and height are the old vector's, so `tq` is bit-for-bit what
    // this always produced and the other three are genuinely new viewpoints.
    const R = Math.hypot(0.45, 0.85);          // 0.962, the original stand-off
    const AZ = { side: 0, tq: Math.atan2(0.45, 0.85), front: Math.PI / 2, rear: -Math.PI / 2 };
    const th = AZ[params.get('cam')] ?? AZ.tq;
    camera.position.set(
      wp.x + Math.sin(th) * R * pull,
      wp.y + 0.18 * pull,
      wp.z + Math.cos(th) * R * pull,
    );
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
  // ...and on #ui-root, because every rule in ui/v2/builder.css is scoped under
  // that id — including the one that stands the rig column down while the
  // tunnel is open (R4). Set on `body` alone, that rule matched nothing, and
  // the desktop showed 1032px of chrome with a slit of bike between it.
  document.getElementById('ui-root')?.classList.toggle('aero-open', app.aero.active);
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
  if (SHOT_MODE || REVIEW_MODE) return;   // review mode owns its own framing
  applyViewOffset(camera);
  _fitBox.setFromObject(app.bike.group);
  if (!_fitBox.isEmpty()) fitToBox(camera, controls, _fitBox);
  // applyViewOffset has just overwritten the camera's view offset with the
  // no-sheet value. If a sheet is open, put the sheet's framing back, or a
  // resize silently un-does the reframe and drops the bike behind the sheet.
  app.sheets?.resync();
  app.surfaces?.sync();
}

if (REVIEW_MODE) {
  document.getElementById('ui-root').style.display = 'none';
  const { initReview } = await import('./review.js');
  app.review = initReview(app, { SLOTS, applyCam });
} else if (!SHOT_MODE) {
  app.ui = initUI(app);
  // DESIGN-SYSTEM §12 steps 1-2, after initUI because both attach to surfaces
  // that initUI creates. Order matters: the wells must exist before scrim.js
  // looks for `.scrim-sampled`, and the sheet shell needs somewhere to put its
  // own well.
  // Sheets FIRST: initSurfaces walks the DOM once and the sheet has to be in
  // it, or the one surface that most needs a scrim well never gets one. The
  // first smoke test found 4 wells where there should be 6.
  app.sheets = initSheets(app, { applyBase: () => applyViewOffset(camera) });
  app.openSheet = app.sheets?.openSheet;
  app.surfaces = initSurfaces(document.getElementById('ui-root'));
  app.scrim = initScrim(app);
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
  app.reframe?.tick();
  envs.tick(t * 0.001);
  composer.render();
  // AFTER the draw: scrim.js samples the real framebuffer, so it needs a frame
  // to exist. Sampling a re-render into an offscreen target instead gave a
  // scene that had skipped tone mapping and the whole post chain, and desert
  // read barely brighter than mountain dawn.
  app.scrim?.tick();
  if (++frames === 10) { readyResolve(true); window.__READY_DONE = true; }
});
