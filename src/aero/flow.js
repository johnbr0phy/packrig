// Analytic airflow field for the wind-tunnel view.
//
// This is deliberately NOT a Navier-Stokes solve. We need a field that can be
// point-sampled tens of thousands of times a frame on the CPU while the app is
// already paying for GTAO + bloom + SMAA, and what the user has to *read* off
// the screen is qualitative: "that bag is making a mess". So the field is a
// freestream plus a superposition of closed-form obstacle terms:
//
//   v(p) = U                        freestream, -X rotated by yaw
//        + Σ deflect(p, chunk)      potential-flow-ish push around each solid
//        + Σ wake(p, body)          velocity deficit + shed vortices behind it
//        + curl(noise)(p,t) · T(p)  divergence-free jitter, gated on turbulence
//
// Obstacles are boxes because the app already computes boxes: every bag carries
// a `proxy` grid of Box3 for the collision resolver, and BagSystem builds a set
// of bike-side colliders for the same purpose. Reusing them means the flow can
// never disagree with what the collision system thinks the bike's shape is.
//
// Two separate obstacle lists come out of that harvest, and the distinction
// matters:
//
//   CHUNKS  a body split into up to three boxes. Deflection has to follow the
//           real silhouette — flow goes over the top of a long bar roll, not
//           diagonally off its centre — so it reads the chunks.
//   HULLS   one box per body. A wake belongs to the whole body: chopping a
//           wheel into three slabs gave three stubby wakes that had died out
//           before they were a metre behind the bike, when a wheel sheds for
//           well over a metre.
//
// Everything in here is world space, metres, SI. See CONTRACT.md.

import * as THREE from 'three';

// ---- tuning ---------------------------------------------------------------
// Named so the reasoning survives; every one of these was set by looking at
// renders, not by deriving it from anything.
const DEFLECT_K = 1.5;    // stagnation push, only on faces the wind runs into
// Streamline displacement: a body pushes air aside all around itself, not just
// where the wind hits it square. The stagnation term above is weighted by how
// directly the flow meets the surface, which is ZERO on a horizontal top face —
// so threads passing over a bag were running dead straight, and the whole
// picture read as parallel lines that happened to have a bicycle behind them.
// This term is facing-blind and is what makes smoke visibly lift over a bag.
// Kept deliberately small. At 0.95 the push at the surface was comparable to
// the freestream itself: threads were thrown a metre wide of the bike, sailed
// over everything and never came back, so almost none of them ever entered a
// wake (0.4% of particles in turbulent air, with 29% of the volume turbulent).
// Keeping a thread OUT of a solid is the WALL term's job below — that one is
// local, 55mm thick, and cannot fling anything across the frame.
const DISPLACE_K = 0.35;
const SQUEEZE_K = 0.55;   // tangential speed-up at the shoulder of an obstacle
// Deflection falls off as (R/(R+d))^2 where R is the chunk's OWN cross-stream
// radius: a doublet-like 1/d^2 tail that is also size-aware. A fixed distance
// scale was tried first and is wrong twice over — a 40mm stem bag threw the
// same weight around as a pannier, and since a bag is three chunks, every bag
// pushed three times as hard as it should. Threads bent a metre and a half
// before they reached the bike and crossed each other on the way in.
const REACH = 2.4;        // multiples of R at which a chunk stops mattering
const REACH_PAD = 0.1;    // m; floor on that, so small chunks still have an edge
// Absolute ceiling on that reach. The ghost rider's torso is big enough that
// 2.4 radii is ~0.8m — it pushed every thread clear of the entire bike, the
// bags sat inside a bubble no smoke ever entered, and a full kit measured the
// same turbulence at the threads as a bare bike (0.034 either way). Physically
// a big body does reach further; for a visualisation whose whole job is to show
// what the BAGS do, it must not reach past them.
const REACH_MAX = 0.4;    // m
const D_MIN = 0.008;      // m; keeps the falloff finite on the surface itself
// A no-slip stand-off that does not care which way the wind is blowing. The
// facing-weighted deflection above is zero on a horizontal top face, so a
// thread skimming the top of a bag had nothing holding it out and sank through.
const WALL_D = 0.055;     // m; thickness of that stand-off layer
const WALL_K = 1.25;      // its strength, in multiples of U

const WAKE_LEN_K = 6.0;   // wake persists this many cross-stream radii downwind
// ...but never more than this. The ghost rider's hull is big enough that 6
// radii is the entire downwind domain, and a wake that reaches everywhere marks
// every thread: with the rider in, the turbulent volume went from 10%→34%
// bare-vs-loaded (legible) to 63%→74% (nearly the same picture either way).
// Capping it keeps the rider dominant without drowning out the bags.
const WAKE_LEN_MAX = 1.6;
const WAKE_DEFICIT = 0.6; // along-wind speed drops to (1 - this) at the core
const RECIRC_K = 0.55;    // upstream pull immediately behind a body
const ENTRAIN_K = 0.42;   // inward pull along the whole wake
const SHED_K = 0.5;       // Karman street amplitude
const STROUHAL = 0.21;    // fSt = St · U / d, the textbook bluff-body value
const NOISE_K = 1.15;      // curl-noise amplitude, scaled by turbulence
const NOISE_SCALE = 3.4;  // 1/m; feature size of the turbulent eddies
const NOISE_GATE = 0.05;  // below this turbulence we skip the noise entirely —
                          //    this gate is most of the performance budget
const MIN_DRIFT = 0.12;   // fraction of U that always survives downwind, so no
                          //    particle can be trapped in a recirculation cell
const MAX_PERTURB = 1.6;  // multiples of U that the obstacle terms may add

// Uniform-grid cell for the broad phase. 0.3 was the first guess and it put a
// dozen chunks in every cell around the bike; the deflection loop is linear in
// that number and it was 80% of the frame cost. Smaller cells cost memory
// (~1MB here) and buy back most of it.
const CELL = 0.18;

// chunk record: cx cy cz hx hy hz round strength radius rejectR2
const C_STRIDE = 10;
// hull record: cx cy cz hx hy hz strength radius support wakeLen shedHz
const H_STRIDE = 11;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _box = new THREE.Box3();

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ---- box harvesting -------------------------------------------------------

/**
 * Merge a run of boxes down to at most `k`, bucketing along whichever axis they
 * are most spread over. The collision system slices a wheel into nine chevrons
 * and the head tube into five; that resolution matters when you are deciding
 * whether a bag fits, but for airflow it just multiplies the inner-loop cost
 * for no visible difference. Three chunks still follow a wheel's round profile
 * well enough that smoke curves over the top of it.
 */
function coarsen(boxes, k) {
  if (boxes.length <= k) return boxes;
  const cs = boxes.map((b) => b.getCenter(new THREE.Vector3()));
  let axis = 'x', best = -1;
  for (const a of ['x', 'y', 'z']) {
    let lo = Infinity, hi = -Infinity;
    for (const c of cs) { if (c[a] < lo) lo = c[a]; if (c[a] > hi) hi = c[a]; }
    if (hi - lo > best) { best = hi - lo; axis = a; }
  }
  const order = boxes.map((b, i) => i).sort((a, b) => cs[a][axis] - cs[b][axis]);
  const out = [];
  for (let i = 0; i < k; i++) {
    const from = Math.floor((i * order.length) / k);
    const to = Math.floor(((i + 1) * order.length) / k);
    if (to <= from) continue;
    const acc = boxes[order[from]].clone();
    for (let j = from + 1; j < to; j++) acc.union(boxes[order[j]]);
    out.push(acc);
  }
  return out;
}

function makeBody(boxes, k, strength, kind) {
  const chunks = coarsen(boxes, k);
  const hull = chunks[0].clone();
  for (let i = 1; i < chunks.length; i++) hull.union(chunks[i]);
  return { chunks, hull, strength, kind };
}

/** Bike-side obstacles, lifted straight out of the collision system. */
function bikeBodies(bike, bags) {
  const F = bike.frameGroup;
  if (!F) return [];
  bike.group.updateMatrixWorld(true);
  const m = F.matrixWorld;

  // BagSystem._staticColliders() is the same set of volumes the resolver uses
  // to decide whether a bag fits. Building a second, independent idea of where
  // the bike is would let the flow bend around air while ignoring a fork blade.
  let tagged = null;
  try { tagged = bags?._staticColliders?.(); } catch { tagged = null; }
  if (!tagged || !tagged.length) return fallbackBikeBodies(bike);

  // How many chunks each tag is worth, and how solid it is to the air. A wheel
  // is mostly spokes: it deflects and it sheds, but it does not block like a
  // pannier, and letting it read as solid put amber down the whole bare bike.
  const BUDGET = { wheel: 3, head: 2, fork: 1, bars: 2, stem: 1, saddle: 1, seatpost: 1 };
  const SOLID = { wheel: 0.42, head: 0.6, fork: 0.4, bars: 0.5, stem: 0.5, saddle: 0.7, seatpost: 0.4 };

  const groups = new Map();
  for (const { tag, box } of tagged) {
    // fork/wheel come in left/right or front/rear runs that must not be merged
    // into one slab across the bike, so key the group by side and by which end
    // of the bike it is at
    const c = box.getCenter(_v);
    const key = `${tag}|${c.z > 20 ? 1 : c.z < -20 ? -1 : 0}|${tag === 'wheel' ? (c.x > 0 ? 'f' : 'r') : ''}`;
    if (!groups.has(key)) groups.set(key, { tag, boxes: [] });
    groups.get(key).boxes.push(box.clone().applyMatrix4(m));
  }
  const out = [];
  for (const { tag, boxes } of groups.values()) {
    out.push(makeBody(boxes, BUDGET[tag] ?? 2, SOLID[tag] ?? 0.6, 'bike'));
  }
  return out;
}

/** If BagSystem ever stops exposing its colliders, at least block the wheels. */
function fallbackBikeBodies(bike) {
  const P = bike.points, g = bike.geo, R = (P.tireR + g.tireWidth / 2) * 0.001;
  const m = bike.frameGroup.matrixWorld;
  const out = [];
  for (const a of [P.rearAxle, P.frontAxle]) {
    const c = new THREE.Vector3(a.x, a.y, 0).applyMatrix4(m);
    const box = new THREE.Box3().setFromCenterAndSize(c, new THREE.Vector3(2 * R, 2 * R, 0.05));
    out.push({ chunks: [box], hull: box.clone(), strength: 0.42, kind: 'bike' });
  }
  return out;
}

/** Every equipped bag, from the collision proxy it already carries. */
function bagBodies(bags) {
  const out = [];
  const equipped = bags?.equipped || {};
  for (const [slot, rec] of Object.entries(equipped)) {
    if (!rec?.mesh || !rec.proxy?.length) continue;
    rec.mesh.updateWorldMatrix(true, false);
    // proxy boxes are in the mesh's own local space; matrixWorld carries the
    // frameGroup's 0.001 scale, so this lands in world metres in one step
    const world = rec.proxy.map((b) => b.clone().applyMatrix4(rec.mesh.matrixWorld));
    // three chunks along the bag's long axis: enough for a 500mm bar roll to
    // deflect differently at its ends than at its middle, cheap enough to keep
    const body = makeBody(world, 3, 1, 'bag');
    body.slot = slot;
    out.push(body);
  }
  return out;
}

/**
 * The ghost rider, if one has been built. Its meshes are limbs and a torso, so
 * per-mesh AABBs already give a body-shaped set of blockers — far better than
 * one box around the whole person, which would put a wall where the gap between
 * the arms is.
 */
function riderBodies(riderGroup, explicit) {
  // An auto-discovered rider is only counted when it is actually on screen —
  // outside the tunnel the ghost exists but is hidden, and the air should not
  // be flowing around a person who is not there. A rider passed in explicitly
  // is counted regardless: rider.js hides the group below alpha 0.002, and the
  // tunnel builds its flow field on enter() while the ghost is still fading up,
  // so the visibility test would race and leave the biggest blocker on the bike
  // out of the field entirely.
  if (!riderGroup || (!explicit && !riderGroup.visible)) return [];
  riderGroup.updateWorldMatrix(true, true);
  const parts = [];
  riderGroup.traverse((o) => {
    if (!o.isMesh || o.userData?.noCollide) return;
    const b = new THREE.Box3().setFromObject(o);
    if (b.isEmpty()) return;
    const s = b.getSize(_v);
    if (s.x * s.y * s.z < 1e-5) return; // straps, buckles, seams
    parts.push(b);
  });
  if (!parts.length) {
    const b = new THREE.Box3().setFromObject(riderGroup);
    if (b.isEmpty()) return [];
    parts.push(b);
  }
  // keep the six biggest so a rider made of fifty little meshes cannot blow the
  // per-sample budget on its own
  parts.sort((a, b) => b.getSize(_v).length() - a.getSize(_v2).length());
  // A rider is not a solid box: there is air through the gap under the chest,
  // between the arms and between the legs, and treating the torso as a slab put
  // more turbulence in the picture than the bags could ever add to.
  return parts.slice(0, 6).map((box) => ({
    chunks: [box], hull: box.clone(), strength: 0.6, kind: 'rider',
  }));
}

// ---- value noise with analytic gradients ----------------------------------
// Used only through curlNoise below, which takes the curl of a vector potential
// so the jitter is divergence-free: turbulence that swirls instead of
// inflating, which is the whole visual difference between smoke and a particle
// system.
//
// The gradients are analytic rather than finite-differenced. Central
// differences would need nine scalar noise evaluations for one curl; the
// closed-form partials come almost free out of the same eight corner hashes, so
// three channels cost about four evaluations instead of nine. Curl noise was
// a third of the frame budget before this.

function hash(i, j, k, seed) {
  let h = (i * 374761393) ^ (j * 668265263) ^ (k * 2147483647) ^ (seed * 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296 - 0.5;
}

// gradient of the last vnoiseGrad call
let ngx = 0, ngy = 0, ngz = 0;

function vnoiseGrad(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  // smootherstep: C2, so the curl (a first derivative) is C1 and the swirl has
  // no grid-aligned creases
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const w = zf * zf * zf * (zf * (zf * 6 - 15) + 10);
  const du = 30 * xf * xf * (xf - 1) * (xf - 1);
  const dv = 30 * yf * yf * (yf - 1) * (yf - 1);
  const dw = 30 * zf * zf * (zf - 1) * (zf - 1);

  const a = hash(xi, yi, zi, seed), b = hash(xi + 1, yi, zi, seed);
  const c = hash(xi, yi + 1, zi, seed), d = hash(xi + 1, yi + 1, zi, seed);
  const e = hash(xi, yi, zi + 1, seed), f = hash(xi + 1, yi, zi + 1, seed);
  const g = hash(xi, yi + 1, zi + 1, seed), h = hash(xi + 1, yi + 1, zi + 1, seed);

  const k1 = b - a, k2 = c - a, k3 = e - a;
  const k4 = a - b - c + d, k5 = a - b - e + f, k6 = a - c - e + g;
  const k7 = -a + b + c - d + e - f - g + h;

  ngx = du * (k1 + k4 * v + k5 * w + k7 * v * w);
  ngy = dv * (k2 + k4 * u + k6 * w + k7 * u * w);
  ngz = dw * (k3 + k5 * u + k6 * v + k7 * u * v);
  return a + k1 * u + k2 * v + k3 * w + k4 * u * v + k5 * u * w + k6 * v * w + k7 * u * v * w;
}

let curlX = 0, curlY = 0, curlZ = 0;

/** curl of ψ = (n_11, n_29, n_53) at p, left in curlX/Y/Z. */
function curlNoise(x, y, z) {
  vnoiseGrad(x, y, z, 11);
  const ax = ngy, axz = ngz;          // ∂ψx/∂y, ∂ψx/∂z
  vnoiseGrad(x, y, z, 29);
  const byx = ngx, byz = ngz;         // ∂ψy/∂x, ∂ψy/∂z
  vnoiseGrad(x, y, z, 53);
  const czx = ngx, czy = ngy;         // ∂ψz/∂x, ∂ψz/∂y

  curlX = czy - byz;
  curlY = axz - czx;
  curlZ = byx - ax;
  const len = Math.sqrt(curlX * curlX + curlY * curlY + curlZ * curlZ);
  // the raw curl of value noise has a long tail; clamping rather than
  // normalising keeps the calm patches calm
  if (len > 1) {
    const inv = 1 / len;
    curlX *= inv; curlY *= inv; curlZ *= inv;
  }
}

// ---- the field ------------------------------------------------------------

/**
 * @param {object} bike   from createBike()
 * @param {object} bags   the BagSystem
 * @param {object} [opts] yawDeg, speedKph, rider (Object3D), riderName
 */
export function buildFlowField(bike, bags, opts = {}) {
  const {
    yawDeg = 0,
    speedKph = 28,
    rider = null,
    riderName = 'ghostRider',
  } = opts;

  // the rider is built by another module and may simply not exist yet
  const riderGroup = rider
    || bike.frameGroup?.getObjectByName(riderName)
    || bike.group?.getObjectByName(riderName)
    || null;

  const bodies = [
    ...bikeBodies(bike, bags),
    ...bagBodies(bags),
    ...riderBodies(riderGroup, !!rider),
  ];

  // ---- pack ----
  const hullCount = bodies.length;
  let chunkCount = 0;
  for (const b of bodies) chunkCount += b.chunks.length;
  const cData = new Float32Array(chunkCount * C_STRIDE);
  const hData = new Float32Array(hullCount * H_STRIDE);
  const boxes = [];
  let ci = 0;
  for (let i = 0; i < hullCount; i++) {
    const body = bodies[i];
    for (const box of body.chunks) {
      boxes.push(box);
      const c = box.getCenter(_v), s = box.getSize(_v2);
      const o = ci * C_STRIDE;
      cData[o] = c.x; cData[o + 1] = c.y; cData[o + 2] = c.z;
      // The rounding radius comes out of the half-extents so the SDF describes
      // the same volume. A sharp AABB puts a visible crease in the smoke at
      // every corner, and nothing on a bike has a sharp corner.
      const round = Math.min(0.055, Math.min(s.x, s.y, s.z) * 0.34);
      cData[o + 3] = Math.max(s.x * 0.5, round + 1e-4);
      cData[o + 4] = Math.max(s.y * 0.5, round + 1e-4);
      cData[o + 5] = Math.max(s.z * 0.5, round + 1e-4);
      cData[o + 6] = round;
      cData[o + 7] = body.strength;
      ci++;
    }
    const c = body.hull.getCenter(_v), s = body.hull.getSize(_v2);
    const o = i * H_STRIDE;
    hData[o] = c.x; hData[o + 1] = c.y; hData[o + 2] = c.z;
    hData[o + 3] = s.x * 0.5; hData[o + 4] = s.y * 0.5; hData[o + 5] = s.z * 0.5;
    hData[o + 6] = body.strength;
  }

  // ---- domain ----
  const bounds = new THREE.Box3().setFromObject(bike.group);
  if (riderGroup) bounds.union(new THREE.Box3().setFromObject(riderGroup));
  if (bounds.isEmpty()) {
    bounds.setFromCenterAndSize(new THREE.Vector3(0, 0.6, 0), new THREE.Vector3(2, 1.4, 0.6));
  }
  // wind runs down -X, so the domain needs a short run-in ahead of the bike for
  // the rake to sit in and a long run-out behind it for the wakes to develop.
  // Widened laterally because a yawed freestream sweeps smoke across the bike.
  const dom = bounds.clone();
  dom.min.x -= 2.6; dom.max.x += 1.7;
  dom.min.z -= 1.25; dom.max.z += 1.25;
  dom.max.y += 0.5;
  dom.min.y = Math.min(dom.min.y, 0);

  // ---- broad phase: two uniform grids, CSR layout ----
  // Separate grids because the two influence volumes have wildly different
  // shapes: a chunk reaches a few centimetres, a wake reaches two metres. One
  // shared grid meant every cell behind the bike listed every chunk as well,
  // and the deflection loop paid for it on every sample.
  const gmin = dom.min.clone().addScalar(-CELL);
  const nx = Math.max(1, Math.ceil((dom.max.x - gmin.x) / CELL) + 1);
  const ny = Math.max(1, Math.ceil((dom.max.y - gmin.y) / CELL) + 1);
  const nz = Math.max(1, Math.ceil((dom.max.z - gmin.z) / CELL) + 1);
  const nCells = nx * ny * nz;
  let cStart = new Int32Array(nCells + 1), cItems = new Int32Array(0);
  let hStart = new Int32Array(nCells + 1), hItems = new Int32Array(0);

  const field = {
    boxes,
    bounds: dom,
    bikeBounds: bounds,
    kinds: bodies.map((b) => b.kind),
    slots: bodies.map((b) => b.slot || null),
    time: 0,
    speed: 0,
    yawDeg: 0,
    dir: new THREE.Vector3(-1, 0, 0),      // unit, points DOWNWIND
    freestream: new THREE.Vector3(),        // dir * speed
    boxCount: chunkCount,
    bodyCount: hullCount,
    riderIncluded: !!riderGroup,
  };

  // hoisted copies of the wind, read once per sample instead of chasing three
  // properties through the field object 45,000 times a frame
  let fx = -1, fy = 0, fz = 0, U = 7.8;

  // ---- wind-dependent per-hull terms ----
  // Wake extent, shedding frequency and grid footprint all depend on which way
  // the wind is blowing, so they are recomputed when yaw or speed changes
  // rather than baked in at build time.
  function setWind(deg, kph) {
    field.yawDeg = deg;
    field.speed = Math.max(0.5, kph / 3.6);
    const a = (deg * Math.PI) / 180;
    // yaw sweeps the apparent wind about +Y; at 0 it blows straight down -X
    field.dir.set(-Math.cos(a), 0, -Math.sin(a)).normalize();
    field.freestream.copy(field.dir).multiplyScalar(field.speed);
    fx = field.dir.x; fy = field.dir.y; fz = field.dir.z;
    U = field.speed;

    // two unit vectors spanning the plane across the wind, for each body's
    // cross-stream footprint — the thing that actually sets wake width
    const ux = 0, uy = 1, uz = 0;
    const wx = -fz, wy = 0, wz = fx;   // dir × up, already unit (dir is level)
    for (let i = 0; i < hullCount; i++) {
      const o = i * H_STRIDE;
      const hx = hData[o + 3], hy = hData[o + 4], hz = hData[o + 5];
      // AABB support along an axis is |h · |axis||
      const su = Math.abs(hx * ux) + Math.abs(hy * uy) + Math.abs(hz * uz);
      const sw = Math.abs(hx * wx) + Math.abs(hy * wy) + Math.abs(hz * wz);
      const rb = Math.max(0.5 * (su + sw), 0.02);
      hData[o + 7] = rb;
      hData[o + 8] = Math.abs(hx * fx) + Math.abs(hy * fy) + Math.abs(hz * fz);
      hData[o + 9] = Math.min(WAKE_LEN_K * rb, WAKE_LEN_MAX);
      // Strouhal: bigger bodies shed slower. 2*rb is the cross-stream diameter.
      hData[o + 10] = (STROUHAL * U) / (2 * rb);
    }
    // a chunk's own cross-stream radius sets its deflection reach
    for (let i = 0; i < chunkCount; i++) {
      const o = i * C_STRIDE;
      const hx = cData[o + 3], hy = cData[o + 4], hz = cData[o + 5];
      const su = Math.abs(hy);
      const sw = Math.abs(hx * wx) + Math.abs(hz * wz);
      const rB = Math.max(0.5 * (su + sw), 0.02);
      cData[o + 8] = rB;
      // squared rejection radius, so the common case — a chunk listed in this
      // cell but too far to matter — costs no square root
      const rej = Math.min(rB * REACH + REACH_PAD, REACH_MAX) + cData[o + 6];
      cData[o + 9] = rej * rej;
    }
    rebuildGrids();
  }

  /** Rasterise an AABB into the grid, calling fn for every cell it touches. */
  function forCells(lox, loy, loz, hix, hiy, hiz, fn, item) {
    const i0 = Math.max(0, Math.floor((lox - gmin.x) / CELL));
    const i1 = Math.min(nx - 1, Math.floor((hix - gmin.x) / CELL));
    const j0 = Math.max(0, Math.floor((loy - gmin.y) / CELL));
    const j1 = Math.min(ny - 1, Math.floor((hiy - gmin.y) / CELL));
    const k0 = Math.max(0, Math.floor((loz - gmin.z) / CELL));
    const k1 = Math.min(nz - 1, Math.floor((hiz - gmin.z) / CELL));
    for (let k = k0; k <= k1; k++) {
      for (let j = j0; j <= j1; j++) {
        const base = (k * ny + j) * nx;
        for (let i = i0; i <= i1; i++) fn(base + i, item);
      }
    }
  }

  // Scratch for buildCSR, reused across rebuilds. setYaw() re-grids on every
  // tick of the panel's yaw slider, and at CELL = 0.18 that is ~100k cells;
  // allocating four fresh Int32Arrays of that size per drag event cost ~7ms a
  // step and handed the GC a large object on every pointermove.
  let csrCounts = new Int32Array(0);
  let csrCursor = new Int32Array(0);
  const csrOut = [
    { start: new Int32Array(0), items: new Int32Array(0), cap: 0 },
    { start: new Int32Array(0), items: new Int32Array(0), cap: 0 },
  ];

  function buildCSR(slot, count, visit) {
    if (csrCounts.length < nCells) {
      csrCounts = new Int32Array(nCells);
      csrCursor = new Int32Array(nCells);
    } else {
      csrCounts.fill(0, 0, nCells);
    }
    for (let i = 0; i < count; i++) visit(i, (c) => { csrCounts[c]++; });

    const out = csrOut[slot];
    if (out.start.length < nCells + 1) out.start = new Int32Array(nCells + 1);
    const start = out.start;
    let total = 0;
    for (let c = 0; c < nCells; c++) { start[c] = total; total += csrCounts[c]; }
    start[nCells] = total;
    if (out.cap < total) {
      // grow with slack so a yaw sweep does not reallocate at every step
      out.items = new Int32Array(Math.ceil(total * 1.5) + 64);
      out.cap = out.items.length;
    }
    const items = out.items;
    csrCursor.set(start.subarray(0, nCells));
    for (let i = 0; i < count; i++) visit(i, (c) => { items[csrCursor[c]++] = i; });
    return out;
  }

  function rebuildGrids() {
    const chunks = buildCSR(0, chunkCount, (i, fn) => {
      const o = i * C_STRIDE;
      const r = Math.min(cData[o + 8] * REACH + REACH_PAD, REACH_MAX);
      forCells(
        cData[o] - cData[o + 3] - r, cData[o + 1] - cData[o + 4] - r, cData[o + 2] - cData[o + 5] - r,
        cData[o] + cData[o + 3] + r, cData[o + 1] + cData[o + 4] + r, cData[o + 2] + cData[o + 5] + r,
        fn
      );
    });
    cStart = chunks.start; cItems = chunks.items;

    const hulls = buildCSR(1, hullCount, (i, fn) => {
      const o = i * H_STRIDE;
      const rb = hData[o + 7], wl = hData[o + 9], sup = hData[o + 8];
      // the wake cone, as its bounding box: from the body out to the tip,
      // fattened by the widest the wake ever gets
      const spread = rb * 2.4;
      const tx = hData[o] + fx * (sup + wl), ty = hData[o + 1] + fy * (sup + wl), tz = hData[o + 2] + fz * (sup + wl);
      _box.makeEmpty();
      _box.expandByPoint(_v.set(hData[o] - hData[o + 3], hData[o + 1] - hData[o + 4], hData[o + 2] - hData[o + 5]));
      _box.expandByPoint(_v.set(hData[o] + hData[o + 3], hData[o + 1] + hData[o + 4], hData[o + 2] + hData[o + 5]));
      _box.expandByPoint(_v.set(tx - spread, ty - spread, tz - spread));
      _box.expandByPoint(_v.set(tx + spread, ty + spread, tz + spread));
      forCells(_box.min.x, _box.min.y, _box.min.z, _box.max.x, _box.max.y, _box.max.z, fn);
    });
    hStart = hulls.start; hItems = hulls.items;
  }

  function cellOf(x, y, z) {
    const i = Math.floor((x - gmin.x) / CELL);
    if (i < 0 || i >= nx) return -1;
    const j = Math.floor((y - gmin.y) / CELL);
    if (j < 0 || j >= ny) return -1;
    const k = Math.floor((z - gmin.z) / CELL);
    if (k < 0 || k >= nz) return -1;
    return (k * ny + j) * nx + i;
  }

  // ---- the inner loop -------------------------------------------------------
  // Hand-unrolled onto scalars. This runs ~30k times a frame; a Vector3
  // allocated in here would be 30k allocations a frame.
  let vx = 0, vy = 0, vz = 0;

  /**
   * Shared core. Returns turbulence 0..1 and leaves the velocity in vx/vy/vz
   * when `wantVel` is true. Split this way because the smoke needs both at the
   * same point and the cell lookups are worth doing once.
   */
  function evaluate(px, py, pz, wantVel) {
    if (wantVel) { vx = fx * U; vy = fy * U; vz = fz * U; }
    const cell = cellOf(px, py, pz);
    if (cell < 0) return 0;

    // ---- deflection, over the chunks near this point ----
    if (wantVel) {
      const s0 = cStart[cell], s1 = cStart[cell + 1];
      for (let s = s0; s < s1; s++) {
        const o = cItems[s] * C_STRIDE;
        const dx = px - cData[o], dy = py - cData[o + 1], dz = pz - cData[o + 2];
        const r = cData[o + 6];
        const qx = Math.abs(dx) - cData[o + 3] + r;
        const qy = Math.abs(dy) - cData[o + 4] + r;
        const qz = Math.abs(dz) - cData[o + 5] + r;
        const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0;
        const out2 = mx * mx + my * my + mz * mz;
        // rejection first, squared, so far-but-listed chunks cost no sqrt
        if (out2 > cData[o + 9]) continue;
        const outLen = Math.sqrt(out2);
        const rB = cData[o + 8];

        // rounded-box SDF and its analytic outward gradient. "Push away from
        // the centre" was tried and makes a long bag deflect flow diagonally
        // along its whole length instead of over its top face, which is the
        // single most obviously-wrong thing this could do.
        let gx, gy, gz;
        if (outLen > 1e-9) {
          const inv = 1 / outLen;
          gx = mx * inv * (dx < 0 ? -1 : 1);
          gy = my * inv * (dy < 0 ? -1 : 1);
          gz = mz * inv * (dz < 0 ? -1 : 1);
        } else {
          // interior: nearest face wins
          gx = 0; gy = 0; gz = 0;
          if (qx >= qy && qx >= qz) gx = dx < 0 ? -1 : 1;
          else if (qy >= qz) gy = dy < 0 ? -1 : 1;
          else gz = dz < 0 ? -1 : 1;
        }
        const maxq = qx > qy ? (qx > qz ? qx : qz) : (qy > qz ? qy : qz);
        const d = outLen + (maxq < 0 ? maxq : 0) - r;

        const str = cData[o + 7];
        const dd = d > D_MIN ? d : D_MIN;
        const t = rB / (rB + dd);
        const fall = t * t;                      // doublet-like, size-aware
        const dotFN = fx * gx + fy * gy + fz * gz;
        // only deflect where the wind is running into this face; the lee face
        // must not blow smoke back upstream
        const facing = dotFN < 0 ? -dotFN : 0;
        const k = U * str * fall;
        // Displacement acts everywhere except in the chunk's own lee, where the
        // wake term takes over. This gate has to be SHARP: at 2.5 radii it was
        // still pushing air outward well behind each body, threads skirted the
        // whole bike without entering a single wake, and nothing ever went
        // turbulent — a fully loaded bike measured the same clean white as a
        // bare one.
        const along = dx * fx + dy * fy + dz * fz;
        const lee = along > 0 ? clamp01(along / (rB * 0.6)) : 0;
        const push = DEFLECT_K * facing + DISPLACE_K * (1 - lee);
        vx += gx * (push * k);
        vy += gy * (push * k);
        vz += gz * (push * k);

        // Continuity: at the shoulder, where the wind grazes the surface, the
        // streamtube is pinched and the air has to speed up. Without this the
        // smoke merely avoids the bag; with it, it visibly accelerates over it.
        const graze = 1 - (dotFN < 0 ? -dotFN : dotFN);
        const tx = fx - gx * dotFN, ty = fy - gy * dotFN, tz = fz - gz * dotFN;
        const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
        if (tl > 1e-6) {
          const ta = (SQUEEZE_K * graze * k) / tl;
          vx += tx * ta; vy += ty * ta; vz += tz * ta;
        }

        // Direction-blind stand-off. The facing term above is zero on a face
        // parallel to the wind, so nothing stopped a thread skimming the top of
        // a bag from sinking into it. This is what keeps smoke off the surface.
        if (d < WALL_D) {
          const wall = U * str * WALL_K * (1 - d / WALL_D);
          vx += gx * wall; vy += gy * wall; vz += gz * wall;
          // and a bounded ejection for anything that did get inside: enough to
          // be out within a step or two, not enough to fire it across the frame
          if (d < 0) {
            const e = U * str * (0.8 + (-d > 0.12 ? 0.12 : -d) * 8);
            vx += gx * e; vy += gy * e; vz += gz * e;
          }
        }
      }
    }

    // ---- wakes, over the bodies whose wake reaches this point ----
    let turb = 0, deficit = 0;
    const w0 = hStart[cell], w1 = hStart[cell + 1];
    for (let s = w0; s < w1; s++) {
      const o = hItems[s] * H_STRIDE;
      const wx = px - hData[o], wy = py - hData[o + 1], wz = pz - hData[o + 2];
      const sAx = wx * fx + wy * fy + wz * fz;    // downwind distance from centre
      const sup = hData[o + 8];
      if (sAx <= sup) continue;
      const sd = sAx - sup;
      const wlen = hData[o + 9];
      if (sd > wlen) continue;
      const rb = hData[o + 7];
      const rx = wx - fx * sAx, ry = wy - fy * sAx, rz = wz - fz * sAx;
      const rr = Math.sqrt(rx * rx + ry * ry + rz * rz);
      const spread = rb * (1 + 0.55 * (sd / rb));  // wakes widen downstream
      const q = rr / spread;
      // The outer band matters more than it looks: a thread grazing the edge of
      // a wake has to get pulled in and marked, or the only threads that ever
      // go turbulent are the handful aimed straight at a bag.
      if (q > 1.7) continue;
      const str = hData[o + 6];
      const axial = 1 - sd / wlen;
      const radial = q < 1 ? 1 - q * q * 0.5 : clamp01((1.7 - q) / 0.7) * 0.5;
      const wk = axial * radial * str;
      if (wk <= 0) continue;

      turb += wk;
      if (wk > deficit) deficit = wk;    // max, not sum: two overlapping wakes
                                         // do not stop the air dead
      if (!wantVel) continue;

      // Entrainment: a wake is a low-pressure region and it pulls the
      // surrounding flow in along its whole length. This is what closes the
      // flow back up behind the bike, and without it the displacement term
      // above throws every thread wide and none of them ever gets shredded.
      if (rr > 1e-5) {
        const pull = (U * wk * ENTRAIN_K) / rr;
        vx -= rx * pull; vy -= ry * pull; vz -= rz * pull;
      }

      // Near wake: air also rolls back toward the body itself.
      const near = 1 - sd / (1.15 * rb);
      if (near > 0) {
        const amp = U * near * wk * RECIRC_K;
        vx -= fx * amp; vy -= fy * amp; vz -= fz * amp;
      }

      // Karman street: alternating cross-stream kicks convected downstream at
      // the local speed. This is what makes a wake fishtail instead of just
      // fading, and it is the strongest "that bag is a problem" cue there is.
      const phase = 2 * Math.PI * hData[o + 10] * (field.time - sd / (U * 0.6));
      const sw = Math.sin(phase) * SHED_K * U * wk;
      vx += -fz * sw; vz += fx * sw;            // (dir × up), already unit
      vy += Math.sin(phase * 0.73 + 1.7) * SHED_K * 0.45 * U * wk;
    }

    if (wantVel && deficit > 0) {
      // Momentum deficit: scale down only the along-wind component, leaving the
      // recirculation intact. The core ends up near 0.4 U once the radial
      // profile is taken into account.
      const along = vx * fx + vy * fy + vz * fz;
      const cut = along * WAKE_DEFICIT * clamp01(deficit);
      vx -= fx * cut; vy -= fy * cut; vz -= fz * cut;
    }

    // Soft saturation instead of a hard clamp. `turb` is a SUM over every wake
    // covering this point, and clamping it meant the ghost rider's wake — which
    // blankets the same volume the bags' wakes do — pegged the value at 1 on its
    // own. Adding a full kit then changed the picture by 0.15%: measurably, but
    // not visibly, which defeats the entire point of the mode. This curve is
    // strictly increasing, so another wake always shows up.
    turb = turb / (turb + 0.8);

    if (wantVel && turb > NOISE_GATE) {
      // Curl noise is the most expensive thing in the sample, so it is gated on
      // turbulence: laminar threads outside every wake never pay for it, and
      // that is most of the domain and most of the samples.
      const dr = field.time * 0.55;
      curlNoise(px * NOISE_SCALE + dr, py * NOISE_SCALE, pz * NOISE_SCALE - dr * 0.3);
      const amp = U * NOISE_K * turb * turb * Math.sqrt(turb);   // ^2.5: calm
                                                                 // stays calm
      vx += curlX * amp; vy += curlY * amp; vz += curlZ * amp;
    }

    if (wantVel) {
      // Ceiling on the perturbation. Real flow around a bluff body tops out
      // near 1.5 U; inside a frame bag, three overlapping chunks all firing
      // their stand-off terms at once reached 27 m/s against a 7.8 m/s stream
      // and shot threads out of frame. Clamp what the obstacles added, not the
      // freestream itself.
      const ex = vx - fx * U, ey = vy - fy * U, ez = vz - fz * U;
      const e2 = ex * ex + ey * ey + ez * ez;
      const cap = MAX_PERTURB * U;
      if (e2 > cap * cap) {
        const k = cap / Math.sqrt(e2);
        vx = fx * U + ex * k; vy = fy * U + ey * k; vz = fz * U + ez * k;
      }
      // Nothing may ever be trapped. Without this floor, particles caught in a
      // recirculation cell orbit forever and the streakline collapses into a
      // scribble that never clears.
      const along = vx * fx + vy * fy + vz * fz;
      const floor = MIN_DRIFT * U;
      if (along < floor) {
        const add = floor - along;
        vx += fx * add; vy += fy * add; vz += fz * add;
      }
    }
    return turb;
  }

  // ---- public surface -------------------------------------------------------

  field.sample = function sample(pos, out) {
    const o = out || new THREE.Vector3();
    evaluate(pos.x, pos.y, pos.z, true);
    return o.set(vx, vy, vz);
  };

  /**
   * Velocity and turbulence in one call. Not in CONTRACT.md, but the smoke
   * needs both at every advected point and this halves the broad-phase work;
   * `sample` and `turbulenceAt` are both thin wrappers over it.
   */
  field.sampleFull = function sampleFull(pos, out) {
    const t = evaluate(pos.x, pos.y, pos.z, true);
    out.set(vx, vy, vz);
    return t;
  };

  /** Scalar-argument form, so the advection loop never builds a Vector3. */
  field.sampleAt = function sampleAt(x, y, z, out) {
    const t = evaluate(x, y, z, true);
    out.set(vx, vy, vz);
    return t;
  };

  field.turbulenceAt = function turbulenceAt(pos) {
    return evaluate(pos.x, pos.y, pos.z, false);
  };

  /**
   * True when no obstacle and no wake can reach this point, so the field there
   * is EXACTLY the freestream — not approximately, exactly: evaluate() would
   * run two empty loops and return the vector it started with.
   *
   * Most of a streakline's life is spent in air like that, out at the edge of
   * the rake or a couple of metres downwind, and skipping the two RK2 samples
   * for those particles is worth more than every micro-optimisation in the
   * inner loop put together. The caller checks both ends of its step so a
   * particle cannot hop over a disturbed cell.
   */
  field.quietAt = function quietAt(x, y, z) {
    const c = cellOf(x, y, z);
    if (c < 0) return true;                       // outside the grid entirely
    return cStart[c] === cStart[c + 1] && hStart[c] === hStart[c + 1];
  };

  /** Yaw without rebuilding: the panel slider drives this every pointermove. */
  field.setYaw = function setYaw(deg) {
    if (deg === field.yawDeg) return field;
    setWind(deg, field.speed * 3.6);
    return field;
  };

  field.setSpeedKph = function setSpeedKph(kph) {
    setWind(field.yawDeg, kph);
    return field;
  };

  /** Advance the unsteady terms (vortex shedding + curl-noise drift). */
  field.advance = function advance(dt) {
    field.time += dt;
    return field;
  };

  field.dispose = function dispose() {
    cStart = new Int32Array(1); cItems = new Int32Array(0);
    hStart = new Int32Array(1); hItems = new Int32Array(0);
    field.boxes.length = 0;
  };

  setWind(yawDeg, speedKph);
  return field;
}
