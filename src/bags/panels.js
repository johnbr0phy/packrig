// Frame-panel geometry shared by the full and half frame-bag builders:
// outline offsetting, half-plane clipping, seam spans and face subdivision.

import * as THREE from 'three';
import { v3 } from '../lib.js';

/** Where a seam line crosses the outline — keeps stitching inside the panel. */
export function crossSpan(poly, at, axis) {
  const a = axis === 'x' ? 'x' : 'y', b = axis === 'x' ? 'y' : 'x';
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    if ((p[a] - at) * (q[a] - at) > 0) continue;
    const denom = q[a] - p[a];
    if (Math.abs(denom) < 1e-6) continue;
    const t = (at - p[a]) / denom;
    const v = p[b] + (q[b] - p[b]) * t;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return hi > lo ? { lo, hi } : null;
}

function insetPoly(points, inset) {
  const c = points.reduce((a, p) => a.add(p.clone()), new THREE.Vector3()).multiplyScalar(1 / points.length);
  return points.map((p) => p.clone().lerp(c, inset / p.distanceTo(c)));
}

/**
 * Offset each EDGE along its own inward normal by its own amount, then
 * re-intersect to rebuild the corners. insetPoly moves vertices toward the
 * centroid instead, which gives a wildly uneven perpendicular clearance —
 * acute corners barely move, obtuse ones move a lot — so a frame bag ended up
 * sunk into the down tube at one corner and floating off the seat tube at
 * another. `insets[i]` applies to the edge points[i] → points[i+1].
 */
function offsetPolyEdges(points, insets) {
  const n = points.length;
  const c = points.reduce((a, p) => a.add(p.clone()), new THREE.Vector3()).multiplyScalar(1 / n);
  const lines = points.map((p, i) => {
    const q = points[(i + 1) % n];
    const d = q.clone().sub(p).setZ(0).normalize();
    let nor = v3(-d.y, d.x, 0);
    if (nor.dot(c.clone().sub(p)) < 0) nor.negate();   // point it inward
    return { p: p.clone().addScaledVector(nor, insets[i] ?? 0), d };
  });
  const out = [];
  for (let i = 0; i < n; i++) {
    const A = lines[(i - 1 + n) % n], B = lines[i];
    const den = A.d.x * B.d.y - A.d.y * B.d.x;
    if (Math.abs(den) < 1e-6) { out.push(B.p.clone()); continue; }   // parallel: no corner to build
    const t = ((B.p.x - A.p.x) * B.d.y - (B.p.y - A.p.y) * B.d.x) / den;
    out.push(A.p.clone().addScaledVector(A.d, t));
  }
  return out;
}

/** Frame-bag boundary: hug the tubes. */
export function framePanelPoly(ctx) {
  const r = ctx.frameEdgeR;
  if (!r) return insetPoly(ctx.framePoly, 14);
  // edges are [seat tube, top tube, head tube, down tube].
  // The top tube used to be inset a shade UNDER its radius so the fabric
  // disappeared behind the tube. The extrusion bevel then grew that outline
  // back outward by 5–6 mm and the bag punched a visible notch in the silver.
  // Sit the panel on the inner surface (+1 mm) and let each builder pull the
  // pre-bevel shape down by its own bevel, so the finished edge lands here.
  return offsetPolyEdges(ctx.framePoly, [r[0] + 3, r[1] + 1, r[2] + 3, r[3] + 2]);
}

/** Sutherland–Hodgman against one half-plane; keeps the side where (q−p0)·n ≤ 0. */
export function clipHalfPlane(poly, p0, n) {
  const out = [];
  const d = (q) => (q.x - p0.x) * n.x + (q.y - p0.y) * n.y;
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    const dA = d(A), dB = d(B);
    if (dA <= 0) out.push(A.clone());
    if ((dA < 0 && dB > 0) || (dA > 0 && dB < 0)) out.push(A.clone().lerp(B, dA / (dA - dB)));
  }
  return out;
}

/** Split large triangles of an extruded face so displacement has vertices to move. */
export function subdivideXY(geo, target) {
  const src = geo.toNonIndexed();
  const pos = src.attributes.position;
  const nor = src.attributes.normal;
  const uv = src.attributes.uv;
  const outP = [], outN = [], outU = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const na = new THREE.Vector3(), nb = new THREE.Vector3(), nc = new THREE.Vector3();
  const ua = new THREE.Vector2(), ub = new THREE.Vector2(), uc = new THREE.Vector2();
  const push = (p0, p1, p2, n0, n1, n2, t0, t1, t2, depth) => {
    const e = Math.max(p0.distanceTo(p1), p1.distanceTo(p2), p2.distanceTo(p0));
    if (e < target || depth > 4) {
      outP.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      outN.push(n0.x, n0.y, n0.z, n1.x, n1.y, n1.z, n2.x, n2.y, n2.z);
      outU.push(t0.x, t0.y, t1.x, t1.y, t2.x, t2.y);
      return;
    }
    const m01 = p0.clone().lerp(p1, 0.5), m12 = p1.clone().lerp(p2, 0.5), m20 = p2.clone().lerp(p0, 0.5);
    const q01 = n0.clone().lerp(n1, 0.5).normalize(), q12 = n1.clone().lerp(n2, 0.5).normalize(), q20 = n2.clone().lerp(n0, 0.5).normalize();
    const w01 = t0.clone().lerp(t1, 0.5), w12 = t1.clone().lerp(t2, 0.5), w20 = t2.clone().lerp(t0, 0.5);
    push(p0, m01, m20, n0, q01, q20, t0, w01, w20, depth + 1);
    push(m01, p1, m12, q01, n1, q12, w01, t1, w12, depth + 1);
    push(m20, m12, p2, q20, q12, n2, w20, w12, t2, depth + 1);
    push(m01, m12, m20, q01, q12, q20, w01, w12, w20, depth + 1);
  };
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    na.fromBufferAttribute(nor, i); nb.fromBufferAttribute(nor, i + 1); nc.fromBufferAttribute(nor, i + 2);
    if (uv) { ua.fromBufferAttribute(uv, i); ub.fromBufferAttribute(uv, i + 1); uc.fromBufferAttribute(uv, i + 2); }
    push(a.clone(), b.clone(), c.clone(), na.clone(), nb.clone(), nc.clone(), ua.clone(), ub.clone(), uc.clone(), 0);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(outP, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(outN, 3));
  // ExtrudeGeometry hands back UVs in raw millimetres, which tiles the weave
  // thousands of times and greys it out — re-derive them at fabric scale.
  for (let i = 0; i < outP.length / 3; i++) {
    outU[i * 2] = outP[i * 3] / 150;
    outU[i * 2 + 1] = outP[i * 3 + 1] / 150;
  }
  out.setAttribute('uv', new THREE.Float32BufferAttribute(outU, 2));
  geo.dispose();
  src.dispose();
  return out;
}
