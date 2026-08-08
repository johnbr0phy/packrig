// Wind-tunnel smoke: a rake of nozzles upwind of the bike, each drawing one
// continuous streakline downstream, plus the machine that is supposedly making
// them.
//
// The look being chased is a smoke-rake photograph, not fog: a comb of thin
// parallel white threads that stay parallel until something gets in the way,
// then bend over it, pinch, and tear into an amber mess behind it. Everything
// here exists to serve that read.
//
// Structure:
//   rakeSpec()      one definition of where the nozzles are, shared by the
//                   machine geometry and the emitter so they cannot drift
//   buildMachine()  the prop
//   streaklines     N ring buffers of M particles, advected on the CPU
//   LineSegments    one draw call for every thread, written into preallocated
//                   typed arrays each frame
//
// World space, metres. See CONTRACT.md.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { disposeObject, tubeAlong } from '../lib.js';

// ---- tuning ---------------------------------------------------------------
const STACKS = 9;          // vertical nozzle tubes across the rake
// Ports up each tube. 28 was the first try and from the side, where all nine
// stacks project on top of each other, the threads merged into a solid white
// slab — a smoke rake photograph is mostly black between the threads. 20 rows
// leaves a clear gap between them at every camera distance the app uses.
const ROWS = 20;           // → 180 streaklines
const POINTS = 42;         // particles per streakline
const SUBSTEP = 1 / 60;    // s; fixed integration step. RK2 within it, halved
                           //    again for any particle in disturbed air — see
                           //    the deviation test in tick().
const MAX_SUBSTEPS = 2;    // never spiral on a stalled tab

// How fast a thread accumulates visible damage. Tuned so that a thread through
// the rider's wake alone lands around half-amber and still has headroom for the
// bags to push it further — pegging at 1 makes every kit look identical.
const TURB_GAIN = 4.5;
const TURB_DECAY = 0.35;    // 1/s; it recovers, but slowly — a wrecked thread
                           //      stays wrecked long enough to trace back to
                           //      the bag that wrecked it
const BASE_ALPHA = 0.80;
const FADE_IN = 2.5;       // particles over which a fresh thread fades up
const FADE_OUT = 6;        // ...and over which the tail fades away
const PUFFS = 32;
// Hard sanity bound on a particle coordinate, metres from world origin. The
// flow domain is a few metres; anything beyond this is a blown-up integration
// step, and one such point stretches its quad across the whole viewport.
const LIM = 200;

// Clean air reads as fine DARK threads, not white ones. The tunnel set is a
// bright white cove over a pale floor, so white-on-white vanished everywhere the
// backdrop actually covered — the only place the smoke read was against a patch
// of uncovered background. Same contrast strategy the floor markings use, and it
// is how a real smoke rake photographs against a lit screen.
const CLEAN = new THREE.Color(0x232a31);
const ACCENT = new THREE.Color(0xe8a848);   // --accent, the app's hot colour

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _size = new THREE.Vector2();
const _m4 = new THREE.Matrix4();

/**
 * disposeObject() from lib.js also disposes materials, which is exactly wrong
 * when the machine is rebuilt: its six materials are shared across rebuilds and
 * would come back already disposed. Rebuild frees geometry only; the materials
 * are freed once, in dispose().
 */
function disposeGeometries(root) {
  root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

/** Support of an axis-aligned box's half-extents along a unit direction. */
function support(half, d) {
  return Math.abs(half.x * d.x) + Math.abs(half.y * d.y) + Math.abs(half.z * d.z);
}

// ---- the rake -------------------------------------------------------------

/**
 * One definition of the smoke rake, in a local frame where
 *   +X = downwind, +Y = up, +Z = across the wind.
 * The machine is built in this frame and the emitter transforms nozzle
 * positions out of it with the same basis, so a nozzle can never end up
 * somewhere the smoke does not come from.
 *
 * Every dimension is derived from the bike's own bounding box.
 */
function rakeSpec(flow, bounds) {
  const dir = flow.dir.clone().normalize();       // downwind
  const side = _v.copy(dir).cross(UP).normalize().clone(); // local +Z
  const centre = bounds.getCenter(new THREE.Vector3());
  const half = bounds.getSize(_v2).multiplyScalar(0.5).clone();
  const ground = flow.bounds.min.y;

  // Stand off far enough upwind that the machine is clear of the bike but
  // still inside the flow domain, measured against the bike's own footprint
  // rather than a fixed distance — a long bike pushes the rake further out.
  const standoff = support(half, dir) + 0.95;
  const origin = centre.clone()
    .addScaledVector(dir, -standoff);
  origin.y = ground;

  // Nozzle field: tall enough to clear the bars and the saddle (and a rider,
  // whose height is already in `bounds` when one exists), wide enough that the
  // outermost threads pass well clear of the panniers, and low enough that the
  // bottom of both tyres is in the flow — the wheels are a third of the drag
  // and leaving them below the rake made the picture look like it started at
  // the hubs.
  const yLo = 0.1;
  const yHi = (bounds.max.y - ground) + 0.24;
  const halfW = support(half, side) + 0.34;

  const nozzles = [];   // local-space {x,y,z}
  const stackZ = [];
  const rowY = [];
  for (let s = 0; s < STACKS; s++) {
    stackZ.push(STACKS === 1 ? 0 : -halfW + (2 * halfW * s) / (STACKS - 1));
  }
  for (let r = 0; r < ROWS; r++) {
    rowY.push(ROWS === 1 ? (yLo + yHi) / 2 : yLo + ((yHi - yLo) * r) / (ROWS - 1));
  }
  const stackR = 0.017;
  const nozzleLen = 0.03;
  for (let s = 0; s < STACKS; s++) {
    for (let r = 0; r < ROWS; r++) {
      // the smoke leaves the tip of the nozzle, which stands proud of the tube
      nozzles.push({ x: stackR + nozzleLen, y: rowY[r], z: stackZ[s] });
    }
  }

  // how far a particle has to travel before it is out of the domain
  let runLength = 0;
  const b = flow.bounds;
  for (let i = 0; i < 8; i++) {
    _v3.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
    runLength = Math.max(runLength, _v3.sub(origin).dot(dir));
  }

  return {
    dir, side, origin, ground,
    yLo, yHi, halfW, stackZ, rowY, stackR, nozzleLen,
    nozzles, runLength,
    rakeH: yHi - yLo,
    rakeW: 2 * halfW,
  };
}

// ---- the machine ----------------------------------------------------------

function machineMaterials() {
  return {
    // dark powder coat: rough, only mildly metallic, the way a painted steel
    // road case reads
    shell: new THREE.MeshStandardMaterial({ color: 0x2a2d32, roughness: 0.66, metalness: 0.45 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x3d4249, roughness: 0.55, metalness: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x767c83, roughness: 0.38, metalness: 0.9 }),
    // the fan housing is an open cylinder seen from both sides
    housing: new THREE.MeshStandardMaterial({ color: 0x3d4249, roughness: 0.55, metalness: 0.6, side: THREE.DoubleSide }),
    dark: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.82, metalness: 0.3 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.95, metalness: 0 }),
    accent: new THREE.MeshStandardMaterial({
      color: ACCENT, roughness: 0.4, metalness: 0.2,
      emissive: ACCENT, emissiveIntensity: 0.55,
    }),
  };
}

/**
 * The smoke generator: a low powder-coated trolley with a fan grille facing
 * into the wind, a manifold across its nose and nine vertical nozzle stacks
 * rising off it. Chunky and slightly agricultural on purpose — it has to read
 * as equipment, not as UI.
 */
function buildMachine(spec, M) {
  const g = new THREE.Group();
  g.name = 'smokeMachine';

  const bodyD = Math.max(0.44, spec.rakeH * 0.42);   // downwind depth
  const bodyH = Math.max(0.30, spec.rakeH * 0.30);
  const bodyW = Math.max(0.55, spec.rakeW * 0.58);
  const footH = 0.055;
  const bodyX = -(bodyD * 0.5 + 0.16);               // sits behind the rake plane
  const bodyY = footH + bodyH * 0.5;

  const add = (mesh, x, y, z) => {
    if (x !== undefined) mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };

  // ---- body ----
  const body = add(new THREE.Mesh(
    new RoundedBoxGeometry(bodyD, bodyH, bodyW, 3, 0.028), M.shell
  ), bodyX, bodyY, 0);
  // a raised lid, so the silhouette is not one slab
  add(new THREE.Mesh(
    new RoundedBoxGeometry(bodyD * 0.86, 0.05, bodyW * 0.9, 2, 0.018), M.trim
  ), bodyX, bodyY + bodyH * 0.5 + 0.02, 0);
  // corner posts: the thing that makes a box look built rather than modelled
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      add(new THREE.Mesh(
        new RoundedBoxGeometry(0.05, bodyH + 0.05, 0.05, 2, 0.014), M.trim
      ), bodyX + sx * (bodyD * 0.5 - 0.012), bodyY, sz * (bodyW * 0.5 - 0.012));
      // foot + rubber pad
      const footY = footH * 0.5;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, footH, 12), M.dark),
        bodyX + sx * (bodyD * 0.5 - 0.045), footY, sz * (bodyW * 0.5 - 0.045));
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.012, 12), M.rubber),
        bodyX + sx * (bodyD * 0.5 - 0.045), 0.006, sz * (bodyW * 0.5 - 0.045));
    }
  }
  // hazard stripe along the leading top edge, in the app's accent
  add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, bodyW * 0.88), M.accent),
    bodyX + bodyD * 0.5 - 0.006, bodyY + bodyH * 0.5 - 0.022, 0);

  // ---- fan, in the upwind face ----
  const fanR = Math.min(bodyH, bodyW) * 0.36;
  const fanX = bodyX - bodyD * 0.5;
  const fanGroup = new THREE.Group();
  fanGroup.position.set(fanX - 0.035, bodyY, 0);
  fanGroup.rotation.z = Math.PI / 2;   // cylinder axis +Y → machine +X
  g.add(fanGroup);
  // housing ring. fanGroup's local +Y points UPWIND, so anything at positive
  // local y is on the outside of the machine, facing the bike's oncoming air.
  fanGroup.add(new THREE.Mesh(
    new THREE.CylinderGeometry(fanR * 1.16, fanR * 1.16, 0.07, 28, 1, true), M.housing
  ));
  // recessed backplate so you cannot see through the machine; its face is
  // turned outward so the grille has something lit behind it
  const back = new THREE.Mesh(new THREE.CircleGeometry(fanR * 1.16, 28), M.dark);
  back.rotation.x = -Math.PI / 2;
  back.position.y = -0.034;
  fanGroup.add(back);
  // blades — the only moving part
  const blades = new THREE.Group();
  blades.position.y = -0.005;
  fanGroup.add(blades);
  blades.add(new THREE.Mesh(new THREE.CylinderGeometry(fanR * 0.22, fanR * 0.26, 0.05, 14), M.steel));
  const bladeGeo = new THREE.BoxGeometry(fanR * 0.86, 0.008, fanR * 0.42);
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(bladeGeo, M.steel);
    const a = (i / 5) * Math.PI * 2;
    b.position.set(Math.cos(a) * fanR * 0.5, 0, Math.sin(a) * fanR * 0.5);
    b.rotation.y = -a;
    b.rotation.x = 0.42;   // pitch
    blades.add(b);
  }
  // grille: outer ring, two concentric rings, eight radial bars
  const grille = new THREE.Group();
  grille.position.y = 0.031;   // outboard of the blades
  fanGroup.add(grille);
  for (const rr of [fanR * 1.14, fanR * 0.74, fanR * 0.4]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.005, 6, 30), M.trim);
    ring.rotation.x = Math.PI / 2;
    grille.add(ring);
  }
  const barGeo = new THREE.BoxGeometry(fanR * 2.28, 0.006, 0.008);
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(barGeo, M.trim);
    bar.rotation.y = (i / 4) * Math.PI;
    grille.add(bar);
  }

  // ---- control panel on the near face ----
  const panel = new THREE.Group();
  panel.position.set(bodyX + bodyD * 0.18, bodyY + bodyH * 0.16, bodyW * 0.5 + 0.004);
  g.add(panel);
  panel.add(new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.085, 0.008, 2, 0.008), M.dark));
  for (let i = 0; i < 2; i++) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.016, 14), M.steel);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(-0.035 + i * 0.07, -0.018, 0.01);
    panel.add(knob);
  }
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), M.accent);
  led.position.set(-0.05, 0.022, 0.008);
  panel.add(led);

  // ---- manifold + ducting ----
  const manY = Math.max(0.045, spec.yLo - 0.055);
  const manifold = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.042, spec.rakeW + 0.12, 20), M.steel
  );
  manifold.rotation.x = Math.PI / 2;
  add(manifold, 0, manY, 0);
  for (const s of [-1, 1]) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.018, 20), M.trim),
      0, manY, s * (spec.rakeW * 0.5 + 0.06)).rotation.x = Math.PI / 2;
  }
  // two elbows from the body's nose down into the manifold
  for (const s of [-1, 1]) {
    const z = s * bodyW * 0.26;
    const duct = tubeAlong([
      new THREE.Vector3(bodyX + bodyD * 0.5 - 0.02, bodyY - bodyH * 0.14, z),
      new THREE.Vector3(bodyX + bodyD * 0.5 + 0.09, bodyY - bodyH * 0.28, z),
      new THREE.Vector3(-0.05, manY + 0.06, z * 0.85),
      new THREE.Vector3(0.0, manY, z * 0.8),
    ], 0.032, M.dark, { segments: 26, radialSegments: 12 });
    g.add(duct);
  }

  // ---- nozzle stacks ----
  const stackTop = spec.yHi + 0.075;
  for (const z of spec.stackZ) {
    const h = stackTop - manY;
    const tube = add(new THREE.Mesh(
      new THREE.CylinderGeometry(spec.stackR, spec.stackR, h, 14), M.steel
    ), 0, manY + h * 0.5, z);
    tube.castShadow = true;
    // base collar where it enters the manifold
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.045, 14), M.trim), 0, manY + 0.03, z);
    // domed cap
    add(new THREE.Mesh(new THREE.SphereGeometry(spec.stackR, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.trim),
      0, stackTop, z);
  }
  // cross braces, so nine free-standing tubes look like one rigid rake
  for (const f of [0.36, 0.8]) {
    const y = spec.yLo + (spec.yHi - spec.yLo) * f;
    const brace = add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.009, spec.rakeW + 0.05, 10), M.trim
    ), -0.028, y, 0);
    brace.rotation.x = Math.PI / 2;
  }

  // ---- nozzles: one instance per streakline ----
  // A cylinder tapered to a tip, rotated once in the geometry so every instance
  // is a pure translation and the instance matrix costs nothing to build.
  const nozGeo = new THREE.CylinderGeometry(0.0045, 0.009, spec.nozzleLen, 9);
  nozGeo.rotateZ(-Math.PI / 2);                    // axis +Y → +X (downwind)
  nozGeo.translate(-spec.nozzleLen * 0.5, 0, 0);   // tip at the origin
  const noz = new THREE.InstancedMesh(nozGeo, M.trim, spec.nozzles.length);
  noz.castShadow = true;
  const m4 = new THREE.Matrix4();
  spec.nozzles.forEach((n, i) => {
    noz.setMatrixAt(i, m4.makeTranslation(n.x, n.y, n.z));
  });
  noz.instanceMatrix.needsUpdate = true;
  g.add(noz);

  // ---- power lead, coiled off the back ----
  const lead = tubeAlong([
    new THREE.Vector3(bodyX - bodyD * 0.5 + 0.04, bodyY - bodyH * 0.3, bodyW * 0.4),
    new THREE.Vector3(bodyX - bodyD * 0.62, bodyY - bodyH * 0.5, bodyW * 0.48),
    new THREE.Vector3(bodyX - bodyD * 0.9, 0.02, bodyW * 0.3),
    new THREE.Vector3(bodyX - bodyD * 1.35, 0.014, -bodyW * 0.1),
  ], 0.011, M.rubber, { segments: 30, radialSegments: 8 });
  g.add(lead);

  // Orient the whole prop: local +X downwind, +Z across the wind.
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(spec.dir, UP, spec.side));
  g.position.copy(spec.origin);
  g.traverse((o) => { o.userData.aeroProp = true; });
  return { group: g, blades };
}

// ---- line material --------------------------------------------------------
function smokeLineMaterial() {
  // LineBasicMaterial, to match the plain LineSegments draw path above. three
  // sets USE_COLOR_ALPHA itself when the colour attribute has itemSize 4, so
  // per-particle alpha works with no shader patching — the hand-written
  // onBeforeCompile patch this replaced was a standing hazard: it and its
  // USE_COLOR_ALPHA define were a pair, and dropping either one silently
  // produced a GLSL type error or opaque threads.
  return new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    toneMapped: false,   // smoke is a light source, not a surface
  });
}

function puffTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.32)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- the smoke ------------------------------------------------------------

/**
 * @param {object}   opts
 * @param {FlowField} opts.flow    from buildFlowField()
 * @param {THREE.Box3} [opts.bounds] the BIKE's world-space extent, which sizes
 *        and places the rake. Defaults to flow.bikeBounds.
 * @param {THREE.WebGLRenderer} [opts.renderer] accepted for API compatibility;
 *        the plain-GL line path needs no screen-size uniform.
 */
export function createSmoke({ flow, bounds, renderer } = {}) {
  const group = new THREE.Group();
  group.name = 'smoke';

  const mats = machineMaterials();
  const lineMat = smokeLineMaterial();
  const puffTex = puffTexture();
  const puffMat = new THREE.PointsMaterial({
    map: puffTex, color: 0xffffff, size: 0.26, sizeAttenuation: true,
    transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false,
  });

  let field = flow;
  let spec = null;
  let machine = null;
  let N = 0;                     // streaklines
  const M = POINTS;

  // particle state, flat. index = line * M + j, where j = 0 is the OLDEST
  // particle (furthest downstream) and j = M-1 is the one at the nozzle. Age
  // therefore falls out of the index and needs no array of its own.
  let px = new Float32Array(0), py = new Float32Array(0), pz = new Float32Array(0);
  let pt = new Float32Array(0);  // accumulated turbulence, 0..1
  let emitT = new Float32Array(0);
  let nozzleW = new Float32Array(0);   // nozzle world positions, xyz per line

  let geo = null, line = null;
  let posBuf = null, colBuf = null, posAttr = null, colAttr = null;
  const lineCol = new Float32Array(M * 4);   // per-particle rgba scratch

  let puffs = null, puffPos = null, puffSeed = null;

  let enabled = true;
  let emitInterval = 0.01;
  const stats = { advectMs: 0, writeMs: 0, totalMs: 0 };

  const vel = new THREE.Vector3();
  const vel2 = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  // No resolution plumbing: plain GL lines are rasterised at driver width and
  // need no screen-size uniform. Kept as a no-op so setResolution() callers and
  // the resize listener teardown stay valid.
  const onResize = () => {};

  // ---- allocation ---------------------------------------------------------
  function allocate(count) {
    if (count === N && geo) return;
    N = count;
    px = new Float32Array(N * M);
    py = new Float32Array(N * M);
    pz = new Float32Array(N * M);
    pt = new Float32Array(N * M);
    emitT = new Float32Array(N);
    nozzleW = new Float32Array(N * 3);

    if (line) { group.remove(line); geo.dispose(); }
    const segs = N * (M - 1);
    posBuf = new Float32Array(segs * 6);
    colBuf = new Float32Array(segs * 8);
    // Plain GL LineSegments, NOT LineSegments2.
    //
    // The fat-line path renders a screen-filling black rectangle here and I
    // could not find why. Measured, so the next person does not repeat it:
    // with `instanceCount` bisected down to ONE segment — a sane 26cm segment
    // at (-4.671, 0.112, 0.584) — the artifact still covered 36% of the frame,
    // and the covered fraction was IDENTICAL (0.3601) at linewidth 0.05, 0.5,
    // 1.9 and 8, and at resolution 1000x700 through 20000x14000. It is
    // independent of every parameter that should control the quad. The program
    // links with no diagnostics and no shader error. Geometry is clean: 7,380
    // instances, min -4.602, max 1.894, no NaN.
    //
    // The buffer layouts already match what LineSegments wants — posBuf is
    // segs*6 = two vec3 per segment, colBuf is segs*8 = two vec4 — so this is a
    // swap of the draw path only. three enables USE_COLOR_ALPHA automatically
    // for a 4-component colour attribute, so the per-particle fade survives.
    // Cost: no linewidth control (GL lines are 1px on most drivers), which for
    // a smoke rake is an acceptable look rather than a compromise.
    geo = new THREE.BufferGeometry();
    posAttr = new THREE.BufferAttribute(posBuf, 3);
    colAttr = new THREE.BufferAttribute(colBuf, 4);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    colAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('color', colAttr);

    line = new THREE.LineSegments(geo, lineMat);
    line.name = 'streaklines';
    // ~7,400 fat-line segments would dominate the hover raycast in focus.js,
    // and there is nothing to pick here anyway
    line.raycast = () => {};
    line.frustumCulled = false;
    line.renderOrder = 3;
    line.userData.aeroProp = true;
    group.add(line);

    if (!puffs) {
      puffPos = new Float32Array(PUFFS * 3);
      puffSeed = new Float32Array(PUFFS);
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(puffPos, 3));
      puffs = new THREE.Points(pg, puffMat);
      puffs.frustumCulled = false;
      puffs.raycast = () => {};
      puffs.renderOrder = 2;
      puffs.userData.aeroProp = true;
      group.add(puffs);
    }
  }

  // ---- seeding ------------------------------------------------------------
  function seed() {
    // Fill every thread by integrating it all the way downstream once, so the
    // very first frame already shows finished streaklines. Growing them in
    // would mean the first second of the tunnel — and every screenshot — is a
    // rake of stubs.
    for (let i = 0; i < N; i++) {
      const b = i * 3;
      let x = nozzleW[b], y = nozzleW[b + 1], z = nozzleW[b + 2];
      let turb = 0;
      const base = i * M;
      px[base + M - 1] = x; py[base + M - 1] = y; pz[base + M - 1] = z; pt[base + M - 1] = 0;
      for (let j = M - 2; j >= 0; j--) {
        const t = advect(x, y, z, emitInterval, tmp);
        x = tmp.x; y = tmp.y; z = tmp.z;
        turb = Math.min(1, turb * Math.exp(-TURB_DECAY * emitInterval) + t * TURB_GAIN * emitInterval);
        px[base + j] = x; py[base + j] = y; pz[base + j] = z; pt[base + j] = turb;
      }
      // Stagger emission by the golden ratio so the threads do not all step in
      // lockstep — in unison it reads as a marching band, not as smoke.
      emitT[i] = emitInterval * ((i * 0.6180339887) % 1);
    }
    for (let i = 0; i < PUFFS; i++) respawnPuff(i, Math.random());
  }

  /** One RK2 step. Returns the turbulence sampled at the start point. */
  function advect(x, y, z, h, out) {
    const t = field.sampleAt(x, y, z, vel);
    field.sampleAt(x + vel.x * h * 0.5, y + vel.y * h * 0.5, z + vel.z * h * 0.5, vel2);
    out.set(x + vel2.x * h, y + vel2.y * h, z + vel2.z * h);
    return t;
  }

  function respawnPuff(i, frac) {
    // scatter across the rake plane, then push a random way downstream so they
    // are not all born in a line
    const y = spec.yLo + Math.random() * (spec.yHi - spec.yLo);
    const z = (Math.random() * 2 - 1) * spec.halfW;
    const s = frac * spec.runLength;
    const o = spec.origin, d = spec.dir, sd = spec.side;
    puffPos[i * 3] = o.x + UP.x * y + sd.x * z + d.x * s;
    puffPos[i * 3 + 1] = o.y + UP.y * y + sd.y * z + d.y * s;
    puffPos[i * 3 + 2] = o.z + UP.z * y + sd.z * z + d.z * s;
    puffSeed[i] = 0.6 + Math.random() * 0.9;
  }

  // ---- rebuild ------------------------------------------------------------
  function rebuild(newFlow) {
    if (newFlow) field = newFlow;
    // `bounds` is the BIKE's extent, not the flow domain — the rake is sized
    // and positioned from it. Intersecting with the field's own bike box means
    // a caller who hands over `flow.bounds` (five metres of domain, per the
    // contract's naming) still gets a rake the size of a bicycle.
    const bb = (bounds ? bounds.clone() : null);
    if (bb && field.bikeBounds) bb.intersect(field.bikeBounds);
    const prev = spec;
    spec = rakeSpec(field, (bb && !bb.isEmpty()) ? bb : (field.bikeBounds || field.bounds).clone());

    // A yaw change swings the whole rig around the bike but does not change one
    // dimension of it, so the machine is re-aimed rather than rebuilt. index.js
    // calls rebuild() on every tick of the yaw slider; rebuilding ~120 meshes
    // per pointermove would stutter the drag it is supposed to be driving.
    const sameRig = prev && machine
      && prev.nozzles.length === spec.nozzles.length
      && Math.abs(prev.rakeH - spec.rakeH) < 1e-4
      && Math.abs(prev.rakeW - spec.rakeW) < 1e-4
      && Math.abs(prev.yLo - spec.yLo) < 1e-4;
    if (!sameRig) {
      if (machine) { group.remove(machine.group); disposeGeometries(machine.group); }
      machine = buildMachine(spec, mats);
      group.add(machine.group);
    } else {
      machine.group.quaternion.setFromRotationMatrix(
        _m4.makeBasis(spec.dir, UP, spec.side)
      );
      machine.group.position.copy(spec.origin);
    }

    allocate(spec.nozzles.length);

    // How far the nozzles have moved. A small yaw nudge leaves the existing
    // threads in place and lets them sweep across into the new field over the
    // next second, which is what air would do; only a real change — different
    // kit, a big jump — is worth the visible discontinuity of a re-seed.
    const moved = prev ? prev.dir.distanceTo(spec.dir) * spec.runLength : Infinity;
    const reseed = !sameRig || moved > 0.25;

    // nozzle world positions, from the same table the geometry was built from
    const o = spec.origin, d = spec.dir, sd = spec.side;
    spec.nozzles.forEach((n, i) => {
      nozzleW[i * 3] = o.x + d.x * n.x + UP.x * n.y + sd.x * n.z;
      nozzleW[i * 3 + 1] = o.y + d.y * n.x + UP.y * n.y + sd.y * n.z;
      nozzleW[i * 3 + 2] = o.z + d.z * n.x + UP.z * n.y + sd.z * n.z;
    });

    // one particle per emission, spread over the time it takes to cross the
    // domain, so a full thread spans the whole run. The 0.82 is the average
    // slow-down through the wakes; without it threads run short of the frame.
    emitInterval = spec.runLength / (field.speed * 0.82 * (M - 1));

    if (reseed) seed();
    writeGeometry();
    return api;
  }

  // ---- per-frame ----------------------------------------------------------
  function tick(dt) {
    if (!enabled || !spec) return;
    const t0 = performance.now();
    const step = Math.min(Math.max(dt, 1e-4), MAX_SUBSTEPS * SUBSTEP);
    const n = Math.max(1, Math.min(MAX_SUBSTEPS, Math.round(step / SUBSTEP)));
    const h = step / n;
    field.advance?.(step);

    const total = N * M;
    const decay = Math.exp(-TURB_DECAY * h);
    const ux = field.dir.x * field.speed;
    const uy = field.dir.y * field.speed;
    const uz = field.dir.z * field.speed;
    // Threshold on how far the local velocity has strayed from freestream.
    // Below it the field is effectively uniform and one RK2 step is exact;
    // above it — near a bag, in a wake — the step is halved. Most threads spend
    // most of their life in clean air, so this is close to free where nothing
    // is happening and accurate where the picture is actually being made.
    const devLim = field.speed * 0.12;
    const quiet = field.quietAt;
    const dux = ux * h, duy = uy * h, duz = uz * h;
    for (let s = 0; s < n; s++) {
      for (let k = 0; k < total; k++) {
        let x = px[k], y = py[k], z = pz[k];
        // Fast path: if neither end of this step is anywhere an obstacle or a
        // wake can reach, the field there IS the freestream and the whole step
        // is a translation. Around half of every thread is in air like that —
        // out past the rake's edges, or a couple of metres downwind — and
        // skipping its two field samples is the single biggest saving in the
        // system, worth more than every micro-optimisation inside the sample.
        if (quiet && quiet(x, y, z) && quiet(x + dux, y + duy, z + duz)) {
          px[k] = x + dux; py[k] = y + duy; pz[k] = z + duz;
          pt[k] *= decay;
          continue;
        }
        const t = field.sampleAt(x, y, z, vel);
        const dx = vel.x - ux, dy = vel.y - uy, dz = vel.z - uz;
        if (dx * dx + dy * dy + dz * dz < devLim * devLim && t < 0.05) {
          field.sampleAt(x + vel.x * h * 0.5, y + vel.y * h * 0.5, z + vel.z * h * 0.5, vel2);
          x += vel2.x * h; y += vel2.y * h; z += vel2.z * h;
        } else {
          const hh = h * 0.5;
          field.sampleAt(x + vel.x * hh * 0.5, y + vel.y * hh * 0.5, z + vel.z * hh * 0.5, vel2);
          x += vel2.x * hh; y += vel2.y * hh; z += vel2.z * hh;
          field.sampleAt(x, y, z, vel);
          field.sampleAt(x + vel.x * hh * 0.5, y + vel.y * hh * 0.5, z + vel.z * hh * 0.5, vel2);
          x += vel2.x * hh; y += vel2.y * hh; z += vel2.z * hh;
        }
        px[k] = x; py[k] = y; pz[k] = z;
        // integrated damage: what the colour reads. Decays slowly so a thread
        // stays amber downstream of the bag that ruined it instead of healing
        // the moment it leaves the wake.
        const a = pt[k] * decay + t * TURB_GAIN * h;
        pt[k] = a > 1 ? 1 : a;
      }
    }

    // emission: shift each ring buffer down and plant a new particle at the
    // nozzle. Timers were staggered at seed time.
    for (let i = 0; i < N; i++) {
      emitT[i] -= step;
      let guard = 0;
      while (emitT[i] <= 0 && guard++ < 4) {
        const base = i * M, last = base + M - 1;
        px.copyWithin(base, base + 1, base + M);
        py.copyWithin(base, base + 1, base + M);
        pz.copyWithin(base, base + 1, base + M);
        pt.copyWithin(base, base + 1, base + M);
        const b3 = i * 3;
        px[last] = nozzleW[b3];
        py[last] = nozzleW[b3 + 1];
        pz[last] = nozzleW[b3 + 2];
        pt[last] = 0;
        emitT[i] += emitInterval;
      }
    }

    const t1 = performance.now();
    tickPuffs(step);
    writeGeometry();
    if (machine) machine.blades.rotation.y -= step * 2.4;   // local axis is +Y
    // three timestamps a frame is nothing next to what they measure, and having
    // the advect/upload split to hand is the only way to tune this honestly
    const t2 = performance.now();
    stats.advectMs = stats.advectMs * 0.9 + (t1 - t0) * 0.1;
    stats.writeMs = stats.writeMs * 0.9 + (t2 - t1) * 0.1;
    stats.totalMs = stats.advectMs + stats.writeMs;
  }

  function tickPuffs(dt) {
    const b = field.bounds;
    for (let i = 0; i < PUFFS; i++) {
      const o = i * 3;
      const x = puffPos[o], y = puffPos[o + 1], z = puffPos[o + 2];
      // single Euler step: these are atmosphere, nobody traces their path
      field.sampleAt(x, y, z, vel);
      puffPos[o] = x + vel.x * dt * puffSeed[i];
      puffPos[o + 1] = y + vel.y * dt * puffSeed[i];
      puffPos[o + 2] = z + vel.z * dt * puffSeed[i];
      if (puffPos[o] < b.min.x || puffPos[o] > b.max.x
        || puffPos[o + 1] < b.min.y || puffPos[o + 1] > b.max.y
        || puffPos[o + 2] < b.min.z || puffPos[o + 2] > b.max.z) respawnPuff(i, 0);
    }
    puffs.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * Pack the particle rings into the instanced line buffers. Both arrays are
   * preallocated and written in place — building LineGeometry objects per frame
   * would allocate ~600KB a frame and hand the GC a job it cannot win.
   */
  function writeGeometry() {
    const b = field.bounds;
    const segPerLine = M - 1;
    for (let i = 0; i < N; i++) {
      const base = i * M;
      // per-particle colour first: every particle is shared by two segments, so
      // computing it once halves the work
      for (let j = 0; j < M; j++) {
        const k = base + j;
        // Perceptual curve on the accumulated damage. Linear, the first hint of
        // turbulence was invisible and only a saturated thread showed any
        // colour at all, so the picture read as "clean" for kit that was in
        // fact making a mess. ^0.6 puts the interesting range where the eye is.
        const t = Math.pow(pt[k], 0.75);
        const age = M - 1 - j;                       // 0 = at the nozzle
        // fade up out of the nozzle and away at the tail
        let a = BASE_ALPHA * smooth(age / FADE_IN) * smooth(j / FADE_OUT);
        // ...and out at the walls of the domain, so nothing is cut off square
        const dx = Math.max(b.min.x - px[k], px[k] - b.max.x, 0);
        const dy = Math.max(b.min.y - py[k], py[k] - b.max.y, 0);
        const dz = Math.max(b.min.z - pz[k], pz[k] - b.max.z, 0);
        const outside = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (outside > 0) a *= Math.max(0, 1 - outside / 0.3);
        // torn threads thin out as they diffuse
        a *= 1 - 0.28 * t;
        const c = j * 4;
        // graphite → the app's accent. Boosted hard on the amber end so the
        // bloom pass catches the hot cores and they read as glowing: a wrecked
        // thread should be the brightest thing in frame, a clean one the finest.
        const boost = 1 + 1.6 * t;
        lineCol[c] = (CLEAN.r + (ACCENT.r - CLEAN.r) * t) * boost;
        lineCol[c + 1] = (CLEAN.g + (ACCENT.g - CLEAN.g) * t) * boost;
        lineCol[c + 2] = (CLEAN.b + (ACCENT.b - CLEAN.b) * t) * boost;
        lineCol[c + 3] = a;
      }
      for (let s = 0; s < segPerLine; s++) {
        const seg = i * segPerLine + s;
        const po = seg * 6, co = seg * 8;
        const k0 = base + s, k1 = k0 + 1;
        // The flow field can emit a non-finite point: an SDF gradient is 0/0 at
        // an obstacle's exact centre, and a particle landing there poisons its
        // thread. Collapse such a segment to a point rather than letting it
        // stretch to infinity. A plain isFinite check is not enough — 1e30 is
        // finite and still spans the scene — so bound it to the domain.
        const sane = (x, y, z) => x > -LIM && x < LIM && y > -LIM && y < LIM && z > -LIM && z < LIM;
        const ok = sane(px[k0], py[k0], pz[k0]) && sane(px[k1], py[k1], pz[k1]);
        if (ok) {
          posBuf[po] = px[k0]; posBuf[po + 1] = py[k0]; posBuf[po + 2] = pz[k0];
          posBuf[po + 3] = px[k1]; posBuf[po + 4] = py[k1]; posBuf[po + 5] = pz[k1];
        } else {
          const nx = nozzleW[i * 3], ny = nozzleW[i * 3 + 1], nz = nozzleW[i * 3 + 2];
          posBuf[po] = nx; posBuf[po + 1] = ny; posBuf[po + 2] = nz;
          posBuf[po + 3] = nx; posBuf[po + 4] = ny; posBuf[po + 5] = nz;
        }
        const c0 = s * 4, c1 = c0 + 4;
        colBuf[co] = lineCol[c0]; colBuf[co + 1] = lineCol[c0 + 1];
        colBuf[co + 2] = lineCol[c0 + 2]; colBuf[co + 3] = lineCol[c0 + 3];
        colBuf[co + 4] = lineCol[c1]; colBuf[co + 5] = lineCol[c1 + 1];
        colBuf[co + 6] = lineCol[c1 + 2]; colBuf[co + 7] = lineCol[c1 + 3];
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    // computeBoundingSphere() over 11k segments every frame is pure waste; the
    // object is frustumCulled = false and never raycast, so one generous sphere
    // set at rebuild is enough.
    if (!geo.boundingSphere) geo.boundingSphere = new THREE.Sphere();
    field.bounds.getBoundingSphere(geo.boundingSphere);
  }

  // ---- api ----------------------------------------------------------------
  const api = {
    group,
    tick,
    rebuild,
    /** Stop ALL per-frame work, not just hide the group. */
    setEnabled(b) {
      enabled = !!b;
      group.visible = enabled;
      return api;
    },
    get enabled() { return enabled; },
    /** Retained for API compatibility; GL lines need no screen size. */
    setResolution() { return api; },   // no-op: GL lines need no screen size
    /** Rolling ms/frame, split advect vs. buffer write. */
    stats,
    /** Threads per frame, for the panel or a perf readout. */
    get lineCount() { return N; },
    get pointsPerLine() { return M; },
    get spec() { return spec; },
    dispose() {
      window.removeEventListener('resize', onResize);
      group.parent?.remove(group);
      disposeObject(group);
      geo?.dispose();
      lineMat.dispose();
      puffMat.dispose();
      puffTex.dispose();
      for (const m of Object.values(mats)) m.dispose();
      px = py = pz = pt = emitT = nozzleW = new Float32Array(0);
      posBuf = colBuf = null;
      machine = null;
      spec = null;
    },
  };

  rebuild(flow);
  return api;
}
