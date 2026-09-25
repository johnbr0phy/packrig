/**
 * The archetype kit: every item in the gear catalogue is one of ~30 archetypes
 * plus its packed dimensions and a colour. Built procedurally, in millimetres,
 * in the same material language as the bags, deterministic from the item id.
 *
 * WHY PROCEDURAL. Three hundred hand-made meshes would not scale, would not
 * look like one world, and would not run on a phone. A parametric archetype
 * gets the silhouette right at the sizes items are actually seen (40–300 px
 * inside an open bag) and costs a few hundred triangles.
 *
 * CONVENTION. `buildItem(arch, { dims, color, seed })` returns a Group whose
 * content fits the box dims = [L, M, S] mm (sorted, L ≥ M ≥ S), centred on the
 * origin, with L along local x, M along y, S along z. Placement code rotates
 * and scales that box onto whatever box the solver hands it — so a phone, a
 * tent and a bag are all drawn at their true size in the same mm space as the
 * bags, and scale errors cannot happen per-item.
 *
 * Every item is merged into one mesh per material (usually 1–3 draw calls),
 * and its geometry is cached by (archetype, rounded dims, seed), so two
 * identical bottles share one geometry.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---- deterministic randomness ----------------------------------------------
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- materials (shared, cached) ----------------------------------------------
const matCache = new Map();
function mat(kind, color) {
  const key = `${kind}:${color}`;
  let m = matCache.get(key);
  if (m) return m;
  const c = new THREE.Color(color);
  switch (kind) {
    case 'fabric': m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.82, metalness: 0 }); break;
    case 'sil': m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0 }); break;
    case 'ti': m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.38, metalness: 0.85 }); break;
    case 'alu': m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.42, metalness: 0.6 }); break;
    case 'plastic': m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0 }); break;
    case 'rubber': m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, metalness: 0 }); break;
    case 'glass': m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.12, metalness: 0.3 }); break;
    case 'emit': m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, emissive: c, emissiveIntensity: 0.4 }); break;
    default: m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  }
  m.envMapIntensity = kind === 'ti' || kind === 'alu' ? 0.9 : 0.35;
  m.userData.kitKind = kind;
  matCache.set(key, m);
  return m;
}
export const kitMaterials = () => [...matCache.values()];

const TI = '#9c9ca2';
const BLACK = '#18191b';
const WEB = '#1f2023';

// ---- geometry helpers ---------------------------------------------------------
/** Collector: parts grouped by material, merged at the end. */
class Parts {
  constructor() { this.by = new Map(); }
  add(geo, material, m4 = null) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (m4) g.applyMatrix4(m4);
    if (!this.by.has(material)) this.by.set(material, []);
    this.by.get(material).push(g);
    return g;
  }
  build() {
    const grp = new THREE.Group();
    for (const [m, list] of this.by) {
      const merged = mergeGeometries(list.map((g) => {
        // keep only the attributes every part has
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        return g;
      }), false);
      if (!merged) continue;
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      grp.add(mesh);
    }
    return grp;
  }
}
const M = () => new THREE.Matrix4();
const T = (x, y, z) => M().makeTranslation(x, y, z);
const RX = (a) => M().makeRotationX(a);
const RY = (a) => M().makeRotationY(a);
const RZ = (a) => M().makeRotationZ(a);
const S = (x, y, z) => M().makeScale(x, y, z);
const mul = (...ms) => ms.reduce((a, b) => a.multiply(b), M());

/** Cylinder whose axis is local x. */
const cylX = (r, len, seg = 20, r2 = r) => new THREE.CylinderGeometry(r2, r, len, seg, 1).applyMatrix4(RZ(-Math.PI / 2));
/** Cylinder whose axis is local z. */
const cylZ = (r, len, seg = 20, r2 = r) => new THREE.CylinderGeometry(r2, r, len, seg, 1).applyMatrix4(RX(Math.PI / 2));
const rbox = (x, y, z, r) => new RoundedBoxGeometry(x, y, z, 2, Math.max(0.1, Math.min(r, x / 2 - 0.01, y / 2 - 0.01, z / 2 - 0.01)));

/** Soft lumpy displacement for fabric things, radial about local x. */
function lumpy(geo, amp, seed) {
  const r = rng(seed);
  const a = [r() * 6, r() * 6, r() * 6];
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 0.045 + a[0]) * Math.sin(y * 0.06 + a[1]) + Math.sin(z * 0.05 + a[2] + x * 0.02) * 0.6;
    const len = Math.hypot(y, z) || 1;
    const k = 1 + (n * amp) / Math.max(len, 1);
    p.setY(i, y * k); p.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A stuffed sack along x: a capsule, squashed to (M,S) and made lumpy. */
function sack(L, Mx, Sx, seed, { ends = 0.5 } = {}) {
  const r = Math.min(Mx, Sx) / 2;
  const cap = Math.min(r * ends * 2, L * 0.3);
  const pts = [];
  const n = 18;
  // lathe profile along y (converted to x): flat-ish ends with rounded shoulders
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = -L / 2 + t * L;
    const e = Math.min(t * L, (1 - t) * L) / cap;           // 0 at ends → 1 in the body
    const rad = e >= 1 ? 1 : Math.sqrt(Math.max(1 - (1 - e) ** 2, 0));
    pts.push(new THREE.Vector2(Math.max(rad * r, 0.6), y));
  }
  const g = new THREE.LatheGeometry(pts, 22).applyMatrix4(RZ(-Math.PI / 2));
  g.applyMatrix4(S(1, (Mx / 2) / r, (Sx / 2) / r));
  return lumpy(g, Math.min(Mx, Sx) * 0.035, seed);
}

/** A cinched drawcord end at x = ±L/2. */
function drawcordEnd(P, x, r, color, dir = 1) {
  P.add(new THREE.ConeGeometry(r * 0.45, r * 0.5, 12).applyMatrix4(mul(T(x + dir * r * 0.18, 0, 0), RZ(-dir * Math.PI / 2))), mat('fabric', color));
  P.add(rbox(r * 0.35, r * 0.5, r * 0.3, 2).applyMatrix4(T(x + dir * r * 0.5, 0, 0)), mat('plastic', BLACK));
}

/** Flat webbing band around a sack at x, radii ry/rz. */
function band(P, x, ry, rz, w = 14) {
  const g = new THREE.TorusGeometry(1, 0.08, 4, 28).applyMatrix4(mul(RY(Math.PI / 2), S(1, 1, 1)));
  g.applyMatrix4(S(w / 0.16 / 10, ry * 1.03, rz * 1.03));
  P.add(g.applyMatrix4(T(x, 0, 0)), mat('rubber', WEB));
}

// ---- the archetypes -------------------------------------------------------------
// Each takes (P, [L, Mx, Sx], colour, rnd, seed) and adds parts centred on the origin.
const A = {};

A.stuffsack = (P, [L, Mx, Sx], col, rnd, seed) => {
  P.add(sack(L * 0.92, Mx, Sx, seed), mat('sil', col));
  drawcordEnd(P, L * 0.46, Math.min(Mx, Sx) / 2, col, 1);
};

A.sleeping_bag = (P, [L, Mx, Sx], col, rnd, seed) => {
  // a compression sack: a fat lumpy body, a dark lid on one end, and the
  // girth straps pulled into it (they cinch, so they sit IN the fabric)
  P.add(sack(L * 0.92, Mx, Sx, seed, { ends: 0.32 }), mat('sil', col));
  const ry = Mx / 2, rz = Sx / 2;
  P.add(cylX(1, 5, 26).applyMatrix4(mul(T(L * 0.455, 0, 0), S(1, ry * 0.93, rz * 0.93))), mat('fabric', BLACK));
  for (const f of [-0.22, 0.12]) band(P, L * f, ry * 0.97, rz * 0.97, 16);
  drawcordEnd(P, -L * 0.45, Math.min(Mx, Sx) / 2, BLACK, -1);
};

A.tent_bundle = (P, [L, Mx, Sx], col, rnd, seed) => {
  P.add(sack(L * 0.94, Mx, Sx, seed, { ends: 0.4 }), mat('sil', col));
  // a contrasting band where the pole bag rides, and two tie straps
  band(P, -L * 0.28, Mx / 2, Sx / 2, 16);
  band(P, L * 0.22, Mx / 2, Sx / 2, 16);
  drawcordEnd(P, L * 0.47, Math.min(Mx, Sx) / 2, col, 1);
};

A.chair = (P, [L, Mx, Sx], col, rnd, seed) => {
  P.add(sack(L * 0.86, Mx, Sx, seed, { ends: 0.3 }), mat('sil', col));
  // pole ends poking out of the sack, as a Chair Zero bag always shows
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    P.add(cylX(3.2, L * 0.12, 8).applyMatrix4(T(L * 0.45, Math.cos(a) * Mx * 0.18, Math.sin(a) * Sx * 0.18)), mat('alu', '#2b2d31'));
  }
  drawcordEnd(P, -L * 0.44, Math.min(Mx, Sx) / 2, col, -1);
};

A.mat_rolled = (P, [L, Mx, Sx], col) => {
  // a rolled inflatable: a cylinder whose end faces show the spiral of the
  // roll, a valve on one end, and the stuff sack's cinch strap
  const r = Math.min(Mx, Sx) / 2;
  P.add(cylX(r, L * 0.96, 28).applyMatrix4(S(1, (Mx / 2) / r, (Sx / 2) / r)), mat('sil', col));
  const turns = 4;
  for (const s of [-1, 1]) {
    for (let i = 1; i <= turns; i++) {
      const rr = r * (i / (turns + 0.4));
      P.add(new THREE.TorusGeometry(rr, 0.9, 4, 30).applyMatrix4(mul(T(s * L * 0.48, 0, 0), RY(Math.PI / 2), S((Mx / 2) / r, (Sx / 2) / r, 1))), mat('fabric', shade(col, 0.72)));
    }
  }
  P.add(cylX(5.5, 9, 12).applyMatrix4(T(L * 0.48 + 4, r * 0.25, 0)), mat('plastic', '#d8d6cf'));
  band(P, 0, Mx / 2, Sx / 2, 18);
};

A.mat_folded = (P, [L, Mx, Sx], col) => {
  // accordion foam: stacked panels with the egg-crate ridges showing on top
  const n = Math.max(4, Math.round(Sx / 18));
  for (let i = 0; i < n; i++) {
    const z = -Sx / 2 + (i + 0.5) * (Sx / n);
    P.add(rbox(L, Mx, Sx / n * 0.92, 3).applyMatrix4(T(0, 0, z)), mat('fabric', i % 2 ? shade(col, 0.85) : col));
  }
  for (let j = 0; j < 7; j++) {
    const x = -L / 2 + (j + 0.5) * (L / 7);
    P.add(new THREE.BoxGeometry(L / 16, Mx * 0.96, 2).applyMatrix4(T(x, 0, Sx / 2 + 0.6)), mat('fabric', shade(col, 0.8)));
  }
};

A.pole_bundle = (P, [L, Mx, Sx], col, rnd) => {
  // shock-corded sections in a slim sack: show the sack and the tips
  const r = Math.min(Mx, Sx) / 2;
  P.add(cylX(r, L * 0.92, 14).applyMatrix4(S(1, (Mx / 2) / r, (Sx / 2) / r)), mat('sil', col));
  const n = Math.max(3, Math.min(8, Math.round((Mx * Sx) / 90)));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd();
    P.add(cylX(Math.max(1.8, r * 0.18), L * 0.07, 8).applyMatrix4(T(L * 0.47, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5)), mat('alu', '#55595f'));
  }
  band(P, -L * 0.3, Mx / 2, Sx / 2, 10);
};

A.canister = (P, dims, col) => {
  // Icon. A gas canister's silhouette is the domed shoulder and the valve,
  // and the brand band. Axis = the odd dimension (height).
  const { axis, d, h } = axial(dims);
  const r = d / 2;
  const body = new THREE.LatheGeometry([
    [0, -h / 2], [r * 0.9, -h / 2], [r, -h / 2 + 3], [r, h * 0.18], [r * 0.96, h * 0.27],
    [r * 0.62, h * 0.4], [r * 0.3, h * 0.43], [r * 0.24, h * 0.44], [0, h * 0.44],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 32);
  P.add(orient(body, axis), mat('alu', '#c5c7cb'));
  P.add(orient(new THREE.CylinderGeometry(r * 1.004, r * 1.004, h * 0.34, 32, 1, true).applyMatrix4(T(0, -h * 0.05, 0)), axis), mat('plastic', col || '#2a7ab8'));
  P.add(orient(new THREE.CylinderGeometry(r * 0.2, r * 0.22, h * 0.07, 16).applyMatrix4(T(0, h * 0.475, 0)), axis), mat('alu', '#8e9095'));
};

A.stove = (P, dims) => {
  // Icon. Folded canister stove: body, burner head, three folded pot
  // supports hugging it, and the wire valve key.
  const { axis, d, h } = axial(dims);
  const r = d / 2;
  const body = new THREE.LatheGeometry([
    [0, -h / 2], [r * 0.42, -h / 2], [r * 0.46, -h * 0.25], [r * 0.34, -h * 0.05], [r * 0.4, h * 0.2],
    [r * 0.62, h * 0.3], [r * 0.62, h * 0.38], [0, h * 0.4],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 20);
  P.add(orient(body, axis), mat('alu', '#b8babd'));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const g = new THREE.BoxGeometry(2.4, h * 0.8, r * 0.3).applyMatrix4(mul(T(Math.cos(a) * r * 0.62, 0, Math.sin(a) * r * 0.62), RY(-a)));
    P.add(orient(g, axis), mat('ti', '#6c6f75'));
  }
  const key = new THREE.TorusGeometry(r * 0.5, 1.2, 5, 16, Math.PI * 1.4).applyMatrix4(mul(T(0, -h * 0.3, r * 0.3), RY(0.3)));
  P.add(orient(key, axis), mat('ti', '#c1462d'));
};

A.pot = (P, dims, col) => {
  // Icon. Titanium pot: straight walls, rolled rim, lid with a tab, two
  // folding wire handles lying against the side.
  const { axis, d, h } = axial(dims);
  const r = d / 2 - 4;
  P.add(orient(new THREE.CylinderGeometry(r, r * 0.985, h * 0.9, 36, 1, true).applyMatrix4(T(0, -h * 0.03, 0)), axis), mat('ti', col || TI));
  P.add(orient(new THREE.CylinderGeometry(r * 0.985, r * 0.985, 1.2, 36).applyMatrix4(T(0, -h * 0.48, 0)), axis), mat('ti', col || TI));
  P.add(orient(new THREE.TorusGeometry(r, 1.1, 5, 36).applyMatrix4(mul(T(0, h * 0.42, 0), RX(Math.PI / 2))), axis), mat('ti', col || TI));
  // lid
  P.add(orient(new THREE.CylinderGeometry(r * 1.02, r * 1.04, 3, 36).applyMatrix4(T(0, h * 0.44, 0)), axis), mat('ti', shade(col || TI, 0.9)));
  P.add(orient(rbox(12, 3, 8, 1).applyMatrix4(T(0, h * 0.47, 0)), axis), mat('rubber', '#c9582e'));
  // handles folded flat against the wall
  for (const s of [-1, 1]) {
    const g = new THREE.TorusGeometry(h * 0.22, 1.6, 5, 16, Math.PI).applyMatrix4(mul(T(0, h * 0.18, s * (r + 2.5)), RZ(Math.PI / 2), RX(Math.PI / 2)));
    P.add(orient(g, axis), mat('rubber', '#2a2a2a'));
  }
};

A.mug = (P, dims, col) => {
  const { axis, d, h } = axial(dims);
  const r = d / 2 - 6;
  P.add(orient(new THREE.CylinderGeometry(r, r * 0.96, h, 28, 1, true), axis), mat('ti', col || TI));
  P.add(orient(new THREE.CylinderGeometry(r * 0.96, r * 0.96, 1.2, 28).applyMatrix4(T(0, -h / 2, 0)), axis), mat('ti', col || TI));
  P.add(orient(new THREE.TorusGeometry(h * 0.25, 1.6, 5, 16, Math.PI).applyMatrix4(mul(T(r, 0, 0), RZ(-Math.PI / 2))), axis), mat('ti', col || TI));
};

A.bottle = (P, [L, Mx, Sx], col) => {
  // bidon: a waist for the grip, a shoulder, a push-pull valve
  const r = Math.min(Mx, Sx) / 2;
  const prof = [[0, -L / 2], [r * 0.92, -L / 2], [r, -L / 2 + 6], [r, -L * 0.1], [r * 0.9, L * 0.02], [r, L * 0.14], [r, L * 0.3],
    [r * 0.72, L * 0.4], [r * 0.5, L * 0.41], [0, L * 0.41]];
  P.add(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 28).applyMatrix4(RZ(-Math.PI / 2)), mat('plastic', col || '#dfe6e3'));
  P.add(cylX(r * 0.5, L * 0.06, 16).applyMatrix4(T(L * 0.44, 0, 0)), mat('plastic', BLACK));
  P.add(cylX(r * 0.22, L * 0.05, 12).applyMatrix4(T(L * 0.49, 0, 0)), mat('plastic', BLACK));
};

A.bladder = (P, [L, Mx, Sx], col, rnd, seed) => {
  P.add(sack(L * 0.9, Mx, Sx, seed, { ends: 0.22 }), mat('plastic', col || '#6db3d6'));
  P.add(new THREE.TorusGeometry(Mx * 0.22, 3.5, 6, 24).applyMatrix4(mul(T(L * 0.2, 0, Sx / 2 + 2), S(1, 1, 0.5))), mat('plastic', '#2d3238'));
  P.add(cylX(Mx * 0.12, 8, 14).applyMatrix4(T(-L * 0.44, 0, 0)), mat('plastic', '#2d3238'));
};

A.utensil = (P, [L, Mx, Sx], col) => {
  // Icon. Spork: long flat handle with a hang hole, a bowl with three tines.
  const hw = Mx * 0.35;
  const shape = new THREE.Shape();
  shape.moveTo(-L / 2, -hw / 2);
  shape.lineTo(L * 0.18, -hw * 0.4);
  shape.quadraticCurveTo(L * 0.26, -Mx / 2, L * 0.4, -Mx * 0.42);
  shape.lineTo(L / 2, -Mx * 0.3);
  shape.lineTo(L / 2, Mx * 0.3);
  shape.quadraticCurveTo(L * 0.26, Mx / 2, L * 0.18, hw * 0.4);
  shape.lineTo(-L / 2, hw / 2);
  shape.lineTo(-L / 2, -hw / 2);
  const hole = new THREE.Path();
  hole.absarc(-L * 0.44, 0, hw * 0.22, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(Sx * 0.35, 1), bevelEnabled: false, curveSegments: 8 });
  g.applyMatrix4(T(0, 0, -Sx * 0.2));
  P.add(g, mat('ti', col || TI));
  // tines: slots cut read as darker strokes
  for (const y of [-Mx * 0.1, Mx * 0.1]) P.add(new THREE.BoxGeometry(L * 0.1, 1, Sx * 0.4).applyMatrix4(T(L * 0.45, y, 0)), mat('plastic', '#2b2b2e'));
  // the bowl dip
  P.add(new THREE.SphereGeometry(Mx * 0.36, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).applyMatrix4(mul(T(L * 0.3, 0, Sx * 0.1), RX(Math.PI), S(1.2, 1, 0.3))), mat('ti', shade(col || TI, 0.8)));
};

A.lighter = (P, [L, Mx, Sx], col) => {
  P.add(rbox(L * 0.8, Mx, Sx, Sx * 0.45).applyMatrix4(T(-L * 0.1, 0, 0)), mat('plastic', col || '#d23b2b'));
  P.add(rbox(L * 0.2, Mx * 0.9, Sx * 0.9, 1.5).applyMatrix4(T(L * 0.4, 0, 0)), mat('alu', '#c8c9cc'));
};

A.clothing_folded = (P, [L, Mx, Sx], col, rnd, seed) => {
  // a folded garment: soft slab, fold lines on the top face, a darker hem
  // RoundedBox with generous radius and enough segments to pillow; then sag
  // the top face a little so it reads as cloth, not a block
  const g = new RoundedBoxGeometry(L, Mx, Sx, 4, Math.min(Sx * 0.48, 22));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (L / 2), y = p.getY(i) / (Mx / 2);
    if (p.getZ(i) > 0) p.setZ(i, p.getZ(i) * (0.82 + 0.18 * (1 - Math.min(1, x * x + y * y))));
  }
  g.computeVertexNormals();
  lumpy(g, Sx * 0.06, seed);
  P.add(g, mat('fabric', col));
  for (const f of [-0.18, 0.2]) P.add(new THREE.BoxGeometry(1.2, Mx * 0.92, 1.2).applyMatrix4(T(L * f, 0, Sx / 2 - 0.2)), mat('fabric', shade(col, 0.6)));
  P.add(new THREE.BoxGeometry(L * 0.96, 2.5, Sx * 0.7).applyMatrix4(T(0, -Mx / 2 + 1, 0)), mat('fabric', shade(col, 0.78)));
};

A.clothing_rolled = (P, [L, Mx, Sx], col, rnd, seed) => {
  // ranger-rolled: a cylinder with the roll's spiral showing on its ends
  const r = Math.min(Mx, Sx) / 2;
  const g = cylX(r, L * 0.95, 20).applyMatrix4(S(1, (Mx / 2) / r, (Sx / 2) / r));
  lumpy(g, r * 0.06, seed);
  P.add(g, mat('fabric', col));
  for (const s of [-1, 1]) for (let i = 1; i <= 2; i++) {
    P.add(new THREE.TorusGeometry(r * i * 0.33, 0.7, 4, 20).applyMatrix4(mul(T(s * L * 0.475, 0, 0), RY(Math.PI / 2), S((Mx / 2) / r, (Sx / 2) / r, 1))), mat('fabric', shade(col, 0.65)));
  }
};

A.shoes = (P, [L, Mx, Sx], col) => {
  // a pair, sole to sole: a foot-shaped sole (heel narrower than the ball),
  // a rounded upper, and a strap across the instep
  const foot = new THREE.Shape();
  const w = Mx / 2;
  foot.moveTo(-L / 2, 0);
  foot.bezierCurveTo(-L / 2, w * 0.75, -L * 0.2, w * 0.8, L * 0.15, w);
  foot.bezierCurveTo(L * 0.42, w * 1.02, L / 2, w * 0.55, L / 2, 0);
  foot.bezierCurveTo(L / 2, -w * 0.6, L * 0.3, -w * 0.95, L * 0.1, -w * 0.92);
  foot.bezierCurveTo(-L * 0.25, -w * 0.8, -L / 2, -w * 0.72, -L / 2, 0);
  for (const s of [-1, 1]) {
    const hz = Sx / 2;
    const sole = new THREE.ExtrudeGeometry(foot, { depth: hz * 0.35, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.5, bevelSegments: 2, curveSegments: 10 });
    sole.applyMatrix4(T(0, 0, s > 0 ? 0.5 : -hz * 0.35 - 0.5));
    P.add(sole.applyMatrix4(S(1, s, 1)), mat('rubber', BLACK));
    const up = new THREE.SphereGeometry(1, 20, 12).applyMatrix4(mul(T(L * 0.06, 0, s * hz * 0.55), S(L * 0.46, w * 0.82, hz * 0.5)));
    P.add(up, mat('rubber', col || '#3b4a4f'));
    P.add(new THREE.TorusGeometry(w * 0.85, 2.2, 4, 18, Math.PI).applyMatrix4(mul(T(-L * 0.1, 0, s * hz * 0.35), RY(Math.PI / 2), RZ(s > 0 ? 0 : Math.PI), S(1, 1, 1))), mat('rubber', shade(col || '#3b4a4f', 0.6)));
  }
};

A.inner_tube = (P, [L, Mx, Sx], col) => {
  // folded tube held in a band: a flattened loop bundle
  const g = new THREE.TorusGeometry(Mx * 0.28, Sx * 0.36, 8, 24).applyMatrix4(S(L / (Mx * 0.56 + Sx * 0.72), 1, 1));
  P.add(g, mat('rubber', col || '#1f1f21'));
  P.add(new THREE.BoxGeometry(10, Mx * 0.9, Sx * 1.05).applyMatrix4(T(L * 0.15, 0, 0)), mat('rubber', '#b53a2a'));
};

A.pump = (P, [L, Mx, Sx], col) => {
  // Icon. Frame/mini pump: barrel, fluted handle, chuck head with lever.
  const r = Math.min(Mx, Sx) / 2;
  P.add(cylX(r * 0.8, L * 0.7, 20).applyMatrix4(T(-L * 0.02, 0, 0)), mat('alu', col || '#2b2c30'));
  P.add(cylX(r, L * 0.16, 16).applyMatrix4(T(-L * 0.42, 0, 0)), mat('rubber', BLACK));
  P.add(cylX(r * 0.9, L * 0.12, 16).applyMatrix4(T(L * 0.42, 0, 0)), mat('plastic', '#3a3b3f'));
  P.add(rbox(L * 0.08, r * 0.45, r * 1.6, 1).applyMatrix4(T(L * 0.4, r * 0.9, 0)), mat('alu', '#b7b9bd'));
  P.add(new THREE.TorusGeometry(r * 0.82, 0.7, 4, 16).applyMatrix4(mul(T(L * 0.33, 0, 0), RY(Math.PI / 2))), mat('alu', '#b7b9bd'));
};

A.phone = (P, [L, Mx, Sx], col) => {
  // Icon. Rounded slab, black glass front, camera bump on the back.
  P.add(rbox(L, Mx, Sx * 0.86, Math.min(Mx * 0.14, 10)), mat('alu', col || '#4a4d52'));
  P.add(rbox(L * 0.97, Mx * 0.94, 0.6, Math.min(Mx * 0.12, 9)).applyMatrix4(T(0, 0, Sx * 0.43)), mat('glass', '#0b0d10'));
  P.add(rbox(Mx * 0.42, Mx * 0.42, Sx * 0.2, 5).applyMatrix4(T(L * 0.32, Mx * 0.22, -Sx * 0.45)), mat('alu', shade(col || '#4a4d52', 0.8)));
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1]]) {
    P.add(cylZ(Mx * 0.07, Sx * 0.12, 14).applyMatrix4(T(L * 0.32 + dx * Mx * 0.1, Mx * 0.22 + dy * Mx * 0.1, -Sx * 0.56)), mat('glass', '#101216'));
  }
};

A.power_bank = (P, [L, Mx, Sx], col) => {
  P.add(rbox(L, Mx, Sx, Math.min(Sx * 0.3, 6)), mat('plastic', col || '#2f3136'));
  P.add(new THREE.BoxGeometry(2, Mx * 0.3, Sx * 0.25).applyMatrix4(T(L / 2, 0, 0)), mat('plastic', BLACK));
  for (let i = 0; i < 4; i++) P.add(cylZ(1.4, 1, 8).applyMatrix4(T(L * 0.3 + i * 5, -Mx * 0.3, Sx / 2)), mat('emit', '#4fb7ff'));
};

A.action_camera = (P, [L, Mx, Sx], col) => {
  // Icon. The GoPro read: a near-cube, a big lens barrel off-centre on the
  // front, a front screen, and the two folding mount fingers underneath.
  const [w, h, d] = [L, Mx * 0.84, Sx];
  P.add(rbox(w, h, d, 4).applyMatrix4(T(0, Mx * 0.08, 0)), mat('rubber', col || '#1c1d20'));
  P.add(cylZ(h * 0.3, d * 0.2, 24).applyMatrix4(T(-w * 0.22, Mx * 0.1, d * 0.55)), mat('plastic', '#2a2b2f'));
  P.add(cylZ(h * 0.18, d * 0.06, 24).applyMatrix4(T(-w * 0.22, Mx * 0.1, d * 0.66)), mat('glass', '#0a0c10'));
  P.add(rbox(w * 0.36, h * 0.46, 0.8, 2).applyMatrix4(T(w * 0.22, Mx * 0.12, d / 2 + 0.2)), mat('glass', '#0e1419'));
  for (const s of [-1, 1]) P.add(rbox(3, Mx * 0.18, d * 0.5, 1).applyMatrix4(T(s * 4, -Mx * 0.42, 0)), mat('plastic', '#2a2b2f'));
};

A.headlamp = (P, [L, Mx, Sx], col) => {
  // Icon. Lamp body with a lens, and the elastic band coiled beside it.
  const lw = Math.min(L * 0.45, 60);
  P.add(rbox(lw, Mx * 0.6, Sx * 0.8, 6).applyMatrix4(T(-L * 0.2, 0, 0)), mat('plastic', col || '#e05a1f'));
  P.add(cylZ(Mx * 0.16, 2, 18).applyMatrix4(T(-L * 0.2 - lw * 0.15, 0, Sx * 0.4)), mat('emit', '#fff6d8'));
  P.add(new THREE.TorusGeometry(Mx * 0.33, Sx * 0.18, 5, 22).applyMatrix4(mul(T(L * 0.2, 0, 0), S(1.25, 1, 1))), mat('rubber', '#2b2d31'));
};

A.cable_coil = (P, [L, Mx, Sx], col) => {
  // a coiled cable with a plug hanging off the coil
  const r = Math.min(L, Mx) * 0.36;
  for (let i = 0; i < 3; i++) {
    P.add(new THREE.TorusGeometry(r * (1 - i * 0.07), Math.max(Sx * 0.18, 1.2), 5, 26).applyMatrix4(mul(T(0, 0, (i - 1) * Sx * 0.22), S(L / Mx, 1, 1))), mat('plastic', col || '#e8e8e6'));
  }
  P.add(rbox(Math.max(L * 0.18, 8), Math.max(Mx * 0.1, 5), Math.max(Sx * 0.5, 4), 1).applyMatrix4(T(r * L / Mx, 0, 0)), mat('plastic', shade(col || '#e8e8e6', 0.85)));
};

A.pouch = (P, [L, Mx, Sx], col, rnd, seed) => {
  // soft zipped pouch: pillowed box, a zip along the top edge with a pull
  const g = rbox(L, Mx, Sx, Math.min(Sx * 0.45, 14));
  lumpy(g, Sx * 0.04, seed);
  P.add(g, mat('fabric', col));
  P.add(new THREE.BoxGeometry(L * 0.9, 1.8, 2.4).applyMatrix4(T(0, Mx / 2 - 0.4, 0)), mat('rubber', BLACK));
  P.add(rbox(6, 10, 2, 1).applyMatrix4(T(L * 0.38, Mx / 2 + 3, 0)), mat('plastic', '#c7c7c7'));
};

A.box = (P, [L, Mx, Sx], col) => {
  P.add(rbox(L, Mx, Sx, Math.min(Sx * 0.25, 5)), mat('plastic', col || '#3a3d42'));
};

A.multitool = (P, [L, Mx, Sx], col) => {
  // stacked side plates, bolts, and tool tips fanned between them
  P.add(rbox(L, Mx, Sx * 0.3, Mx * 0.3).applyMatrix4(T(0, 0, -Sx * 0.35)), mat('alu', col || '#3d4046'));
  P.add(rbox(L, Mx, Sx * 0.3, Mx * 0.3).applyMatrix4(T(0, 0, Sx * 0.35)), mat('alu', col || '#3d4046'));
  P.add(rbox(L * 0.94, Mx * 0.8, Sx * 0.42, 1).applyMatrix4(T(0, 0, 0)), mat('alu', '#b9bbbf'));
  for (const s of [-1, 1]) P.add(cylZ(Mx * 0.14, Sx * 1.05, 12).applyMatrix4(T(s * L * 0.4, 0, 0)), mat('alu', '#8d9095'));
};

A.tube_bottle = (P, [L, Mx, Sx], col) => {
  const r = Math.min(Mx, Sx) / 2;
  P.add(cylX(r, L * 0.8, 18).applyMatrix4(mul(T(-L * 0.08, 0, 0), S(1, (Mx / 2) / r, (Sx / 2) / r))), mat('plastic', col || '#f3f1ea'));
  P.add(cylX(r * 0.7, L * 0.18, 14).applyMatrix4(T(L * 0.41, 0, 0)), mat('plastic', '#27292d'));
};

// fallbacks for anything the catalogue grows before the kit does
A.default = A.pouch;

// ---- helpers used by the axial icons -----------------------------------------
/**
 * Round things (pot, canister, mug, stove) have two equal dimensions (the
 * diameter) and one odd one (the axis). Find the odd one out — it is not
 * always the longest: a 100 g canister is wider than it is tall.
 */
function axial([L, Mx, Sx]) {
  const pairs = [[Math.abs(L - Mx), 'z', (L + Mx) / 2, Sx], [Math.abs(Mx - Sx), 'x', (Mx + Sx) / 2, L], [Math.abs(L - Sx), 'y', (L + Sx) / 2, Mx]];
  pairs.sort((a, b) => a[0] - b[0]);
  const [, axis, d, h] = pairs[0];
  return { axis, d, h };
}
/** Geometry built along +y → rotate onto the requested local axis. */
function orient(g, axis) {
  if (axis === 'x') g.applyMatrix4(RZ(-Math.PI / 2));
  else if (axis === 'z') g.applyMatrix4(RX(Math.PI / 2));
  return g;
}
function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

// ---- public -------------------------------------------------------------------
const geoCache = new Map();

/**
 * @param {string} archetype
 * @param {{ dims:number[] (mm, any order), color?:string, seed?:string|number }} o
 * @returns {THREE.Group} content fits [L,M,S] along x,y,z, centred
 */
export function buildItem(archetype, { dims, color = '#5a6470', seed = 0 } = {}) {
  const d = [...dims].map((x) => Math.max(+x || 1, 1)).sort((a, b) => b - a);
  const sd = typeof seed === 'number' ? seed : hashStr(String(seed));
  const key = `${archetype}|${d.map((x) => Math.round(x)).join('x')}|${color}|${sd % 997}`;
  let proto = geoCache.get(key);
  if (!proto) {
    const P = new Parts();
    (A[archetype] || A.default)(P, d, color, rng(sd), sd);
    proto = P.build();
    // Normalise to the box exactly: whatever the archetype drew, the item is
    // its catalogue size — the one guarantee that makes scale errors
    // impossible (a phone the size of a tent was the failure named up front).
    const bb = new THREE.Box3().setFromObject(proto);
    const sz = bb.getSize(new THREE.Vector3());
    const c = bb.getCenter(new THREE.Vector3());
    const fit = Math.min(d[0] / Math.max(sz.x, 1e-3), d[1] / Math.max(sz.y, 1e-3), d[2] / Math.max(sz.z, 1e-3));
    for (const m of proto.children) {
      m.geometry.translate(-c.x, -c.y, -c.z);
      m.geometry.scale(fit, fit, fit);
      m.geometry.computeBoundingBox();
      m.geometry.computeBoundingSphere();
    }
    geoCache.set(key, proto);
  }
  // meshes share geometry and material with the cached prototype
  const g = new THREE.Group();
  for (const m of proto.children) {
    const mm = new THREE.Mesh(m.geometry, m.material);
    mm.castShadow = true;
    mm.receiveShadow = true;
    g.add(mm);
  }
  g.userData.kit = { archetype, dims: d };
  return g;
}

export const KIT_ARCHETYPES = Object.keys(A).filter((k) => k !== 'default');

/** Drop the geometry cache (e.g. between contact-sheet runs). */
export function clearKitCache() {
  for (const p of geoCache.values()) for (const m of p.children) m.geometry.dispose();
  geoCache.clear();
}
