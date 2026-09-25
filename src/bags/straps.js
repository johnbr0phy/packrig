// Straps that look like webbing: thin, flat, and on the thing they hold.
//
// Every builder used to draw straps as tori — a 2.6 mm round tube scaled into
// a band — which reads as a ring or a spring at any viewing distance: frame
// bags with "vertebrae", fork cages with coils. Real webbing is 20–25 mm wide
// and 1.5 mm thick, lies flat against what it wraps and has a buckle. These
// primitives draw exactly that, and nothing else in this project should draw
// a strap any other way (BUILDER-BRIEF §4).
//
// New module, not a change to hardware.js: those helpers are shared and the
// brief forbids changing their behaviour under other builders.

import * as THREE from 'three';

export const STRAP_T = 1.5;       // webbing thickness, mm
export const STRAP_W = 20;        // default webbing width, mm

/**
 * A closed ribbon following a loop of points (a section perimeter, a tube's
 * circumference), offset outward by `lift` so it lies ON the surface, `width`
 * wide along `axis`. Flat, like webbing.
 *
 * @param pts    THREE.Vector3[] — the loop, in order (closed implicitly)
 * @param axis   THREE.Vector3   — the direction the strap's width runs
 * @param centre THREE.Vector3   — a point inside the loop, to find "outward"
 */
export function ribbonLoop(pts, axis, centre, { width = STRAP_W, lift = 1.2, thick = STRAP_T, closed = true } = {}) {
  const n = pts.length;
  const a = axis.clone().normalize();
  const pos = [];
  const idx = [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
    const tan = next.clone().sub(prev).normalize();
    let o = new THREE.Vector3().crossVectors(tan, a).normalize();
    // make sure it points away from the centre
    if (o.dot(p.clone().sub(centre)) < 0) o.negate();
    out.push(o);
  }
  // four rows: outer-left, outer-right, inner-right, inner-left (a flat band with thickness)
  for (let i = 0; i < n; i++) {
    const p = pts[i], o = out[i];
    const base = p.clone().addScaledVector(o, lift);
    const top = base.clone().addScaledVector(o, thick);
    for (const [q, s] of [[top, -1], [top, 1], [base, 1], [base, -1]]) {
      const v = q.clone().addScaledVector(a, (s * width) / 2);
      pos.push(v.x, v.y, v.z);
    }
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    for (let k = 0; k < 4; k++) {
      const a0 = i * 4 + k, a1 = i * 4 + ((k + 1) % 4);
      const b0 = j * 4 + k, b1 = j * 4 + ((k + 1) % 4);
      idx.push(a0, b0, b1, a0, b1, a1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A strap loop hugging a round tube: centre, tube axis, tube radius. */
export function tubeWrap(centre, axis, tubeR, { width = STRAP_W, thick = STRAP_T, seg = 28, startAngle = 0, sweep = Math.PI * 2 } = {}) {
  const a = axis.clone().normalize();
  // any vector perpendicular to the axis
  const p0 = Math.abs(a.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(a, p0).normalize();
  const v = new THREE.Vector3().crossVectors(a, u).normalize();
  const pts = [];
  const closed = sweep >= Math.PI * 2 - 1e-6;
  const n = closed ? seg : seg + 1;
  for (let i = 0; i < n; i++) {
    const t = startAngle + (sweep * i) / seg;
    pts.push(centre.clone().addScaledVector(u, Math.cos(t) * tubeR).addScaledVector(v, Math.sin(t) * tubeR));
  }
  return ribbonLoop(pts, a, centre, { width, thick, lift: 0.4, closed });
}

/** A flat strip of webbing from a to b, lying on a face whose outward normal is `normal`. */
export function strapRun(a, b, normal, { width = STRAP_W, thick = STRAP_T } = {}) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const g = new THREE.BoxGeometry(len, thick, width);
  // box x → dir, box y → normal
  const x = dir.normalize();
  const y = normal.clone().normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  const y2 = new THREE.Vector3().crossVectors(z, x).normalize();
  g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y2, z));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  g.translate(...y2.clone().multiplyScalar(thick / 2).toArray());
  return g;
}

/** A side-release buckle, flat, sitting on a face: at `at`, long axis along `dir`, face normal `normal`. */
export function buckle(at, dir, normal, { width = STRAP_W } = {}) {
  const g = new THREE.Group();
  const x = dir.clone().normalize();
  const y = normal.clone().normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  const y2 = new THREE.Vector3().crossVectors(z, x).normalize();
  const basis = new THREE.Matrix4().makeBasis(x, y2, z);
  const body = new THREE.BoxGeometry(width * 1.45, 5.5, width * 1.12);
  body.applyMatrix4(basis);
  body.translate(at.x, at.y, at.z);
  body.translate(...y2.clone().multiplyScalar(3.2).toArray());
  const tongue = new THREE.BoxGeometry(width * 0.5, 3.2, width * 0.8);
  tongue.translate(width * 0.9, 0, 0);
  tongue.applyMatrix4(basis);
  tongue.translate(at.x, at.y, at.z);
  tongue.translate(...y2.clone().multiplyScalar(2.6).toArray());
  return [body, tongue];
}

/** Merge a list of geometries into one mesh (one draw call per material). */
export function meshOf(geos, material, { noCollide = true } = {}) {
  const list = geos.filter(Boolean).map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of list) {
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
  }
  const merged = list.length === 1 ? list[0] : mergeAll(list);
  const m = new THREE.Mesh(merged, material);
  m.castShadow = true;
  m.receiveShadow = true;
  if (noCollide) m.userData.noCollide = true;
  return m;
}

function mergeAll(list) {
  let count = 0;
  for (const g of list) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}
