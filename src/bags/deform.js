// Soft-goods deformation: value noise, welded-normal displacement, panel
// bulge falloffs and baked occlusion. Pure geometry — no materials, no THREE
// scene objects beyond BufferGeometry.

import * as THREE from 'three';

// ---- soft-goods deformation ---------------------------------------------
// Stuffed luggage never reads as a primitive: the fabric bulges between the
// seams. We displace vertices along a *welded* normal so hard-edge geometry
// (rounded boxes, extrusions) can't crack open at its duplicated seams.

function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return L(
    L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v),
    L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v),
    w
  ) * 2 - 1;
}

function fbm(x, y, z, freq, seed, octaves) {
  let amp = 1, tot = 0, sum = 0, f = freq;
  const o = seed * 13.37 + 2.5;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * f + o, y * f + o * 1.7, z * f + o * 2.3);
    tot += amp;
    amp *= 0.5;
    f *= 2.17;
  }
  return sum / tot;
}

/** Position-welded vertex groups: key → { n: averaged normal, idx: [...] }. */
function weldGroups(geo) {
  const pos = geo.attributes.position;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  const groups = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * 16)},${Math.round(pos.getY(i) * 16)},${Math.round(pos.getZ(i) * 16)}`;
    let g = groups.get(k);
    if (!g) { g = { n: new THREE.Vector3(), idx: [] }; groups.set(k, g); }
    g.n.x += nor.getX(i); g.n.y += nor.getY(i); g.n.z += nor.getZ(i);
    g.idx.push(i);
  }
  for (const g of groups.values()) {
    if (g.n.lengthSq() < 1e-8) g.n.set(0, 1, 0); else g.n.normalize();
  }
  return groups;
}

/** Re-derive smooth normals across welded groups (computeVertexNormals facets non-indexed meshes). */
function smoothNormals(geo, groups) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  for (const g of groups.values()) g.n.set(0, 0, 0);
  const byIndex = new Array(pos.count);
  for (const g of groups.values()) for (const i of g.idx) byIndex[i] = g;
  const idx = geo.index;
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), fn = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3;
    const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    ab.subVectors(b, a); ac.subVectors(c, a);
    fn.crossVectors(ab, ac);
    for (const i of [i0, i1, i2]) { const g = byIndex[i]; if (g) g.n.add(fn); }
  }
  for (const g of groups.values()) {
    if (g.n.lengthSq() < 1e-12) continue;
    g.n.normalize();
    for (const i of g.idx) nor.setXYZ(i, g.n.x, g.n.y, g.n.z);
  }
  nor.needsUpdate = true;
}

/**
 * Push vertices out along their (welded) normals with a few octaves of value
 * noise — the difference between a smooth primitive and a packed dry bag.
 * `flatAxis` restricts displacement to the two big faces of an extrusion.
 */
export function stuffed(geometry, { amp = 3, freq = 0.03, seed = 1, octaves = 3, flatAxis = null, bulge = null } = {}) {
  const pos = geometry.attributes.position;
  const groups = weldGroups(geometry);
  const axis = flatAxis === 'z' ? 'z' : flatAxis === 'y' ? 'y' : flatAxis === 'x' ? 'x' : null;
  for (const g of groups.values()) {
    let dx = g.n.x, dy = g.n.y, dz = g.n.z;
    if (axis) {
      const c = g.n[axis];
      if (Math.abs(c) < 0.8) continue; // leave the bevel band alone: silhouette holds
      dx = dy = dz = 0;
      if (axis === 'x') dx = Math.sign(c); else if (axis === 'y') dy = Math.sign(c); else dz = Math.sign(c);
    }
    const i0 = g.idx[0];
    const px = pos.getX(i0), py = pos.getY(i0), pz = pos.getZ(i0);
    let d = fbm(px, py, pz, freq, seed, octaves) * amp;
    if (bulge) d += bulge(px, py, pz, dx, dy, dz);
    for (const i of g.idx) {
      pos.setXYZ(i, pos.getX(i) + dx * d, pos.getY(i) + dy * d, pos.getZ(i) + dz * d);
    }
  }
  pos.needsUpdate = true;
  smoothNormals(geometry, groups);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Noise alone is invisible on a 500mm panel. What actually reads as "packed"
 * is the panel doming between its seams, so bulge each flat face toward its
 * centre and pinch it back in at the stitch lines.
 */
function pillowFalloff(t, power = 0.6) {
  const a = Math.min(Math.abs(t), 1);
  return Math.max(0, 1 - a ** 2.2) ** power;
}

/** Dome the six faces of a boxy bag. */
export function boxBulge(hx, hy, hz, amount) {
  return (x, y, z, nx, ny, nz) => {
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const m = Math.max(ax, ay, az);
    if (m < 0.72) return 0;
    if (m === ax) return amount * pillowFalloff(y / hy) * pillowFalloff(z / hz);
    if (m === ay) return amount * pillowFalloff(x / hx) * pillowFalloff(z / hz);
    return amount * pillowFalloff(x / hx) * pillowFalloff(y / hy);
  };
}

/** Dome an extruded outline, pinched back at its stitch lines. */
export function shapeBulge(poly, amount, seams = [], reach = 60) {
  const segs = poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
  const edgeDist = (x, y) => {
    let best = Infinity;
    for (const [a, b] of segs) {
      const vx = b.x - a.x, vy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy || 1)));
      best = Math.min(best, Math.hypot(x - (a.x + vx * t), y - (a.y + vy * t)));
    }
    return best;
  };
  return (x, y) => {
    let w = Math.min(edgeDist(x, y) / reach, 1) ** 0.55;
    for (const s of seams) {
      const v = s.axis === 'y' ? y : x;
      w *= 1 - 0.72 * Math.exp(-(((v - s.at) / 24) ** 2));
    }
    return amount * w;
  };
}

/**
 * Baked occlusion: fabric bunches and shades toward the bottom of a bag.
 * Stored as a greyscale multiplier so it composes with the material colour.
 */
export function shadeAO(geo, { dir = new THREE.Vector3(0, -1, 0), k = 0.82, span = 0.45 } = {}) {
  const pos = geo.attributes.position;
  const d = dir.clone().normalize();
  let lo = Infinity, hi = -Infinity;
  const proj = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const p = pos.getX(i) * d.x + pos.getY(i) * d.y + pos.getZ(i) * d.z;
    proj[i] = p;
    if (p < lo) lo = p;
    if (p > hi) hi = p;
  }
  const range = Math.max(hi - lo, 1e-6);
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = (proj[i] - lo) / range;            // 1 = furthest along `dir` (the underside)
    const w = t <= 1 - span ? 0 : ((t - (1 - span)) / span) ** 1.4;
    const m = 1 - w * (1 - k);
    cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = m;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}
