// Lofted panel bodies: a bag built as flat panels meeting at piped seams,
// rather than a surface of revolution.
//
// Why this exists. Almost every builder drew its body with LatheGeometry — a
// solid of revolution, i.e. round in section. The fidelity records disagree:
// of the 699 products carrying `geometry.crossSection`, only 97 say `round`.
// 602 say rounded_rect, flat_back, d_shape, flat_bottom, oval or teardrop, and
// every one of them was being drawn as a tube. The first human review of the
// Apidura Expedition Saddle Pack put it plainly: "it's not cylindrical, it's
// not flat bits sewn together."
//
// A sewn bag is flat panels with a small radius where they join, not a
// mathematical crease — so the sections here have genuinely straight runs and
// tight corners. Smooth normals over a tight corner already read as an edge;
// what sells it beyond that is the seam piping, which is why loftBody hands
// back the corner polylines for the caller to run tape along.

import * as THREE from 'three';
import { v3 } from '../lib.js';

const TAU = Math.PI * 2;

/**
 * One cross-section as unit boundary points, traversed once around.
 *
 * `u` is the section's own "tall" axis and `v` its "wide" axis, both in
 * [-1, 1]; the caller scales them by the half-height and half-width it wants
 * at that station. Ordering runs +u → +v → −u → −v (counter-clockwise looking
 * down the length axis) and every shape returns the SAME point count, because
 * a loft needs matching rings.
 *
 * `corners` marks the indices that sit at the middle of a corner radius — the
 * seam lines. flat-sided shapes have four; round ones have none.
 */
export function sectionUnit(shape, { detail = 5 } = {}) {
  // Angles are measured with u as the cosine axis and v as the sine axis, so
  // a = 0 points at +u and a = π/2 at +v. The samples are strictly INTERIOR to
  // [a0, a1]: each corner's two endpoints already exist as the last point of
  // the run before it and the first point of the run after, and repeating them
  // would seed the loft with coincident vertices.
  const arc = (cu, cv, ru, rv, a0, a1, n, out) => {
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * ((i + 1) / (n + 1));
      out.push([cu + Math.cos(a) * ru, cv + Math.sin(a) * rv]);
    }
  };
  const line = (u0, v0, u1, v1, n, out) => {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      out.push([u0 + (u1 - u0) * t, v0 + (v1 - v0) * t]);
    }
  };

  // Every shape is built as: four runs and four corners, so the ring counts
  // line up and a builder can switch shape per product without the loft caring.
  const N = detail;                       // points per corner arc
  const L = 3;                            // points per straight run
  const pts = [], corners = [];
  const push = (fn) => { const before = pts.length; fn(pts); return before; };

  // r[0..3] = corner radii at (+u+v), (+u−v), (−u−v), (−u+v) — i.e. the first
  // pair is the +u end of the section and the second pair the −u end, which is
  // what makes `d_shape` and `flat_bottom` come out round on top and flat
  // underneath.
  let r, flatTop = true, flatBottom = true;
  switch (shape) {
    case 'round':
    case 'oval':        r = [1, 1, 1, 1]; break;
    case 'teardrop':    r = [0.95, 0.95, 0.34, 0.34]; break;   // fat at +u, drawn to a nose at −u
    case 'd_shape':     r = [0.9, 0.9, 0.22, 0.22]; flatBottom = true; break;
    case 'flat_bottom': r = [0.42, 0.42, 0.16, 0.16]; break;
    case 'flat_back':   r = [0.34, 0.34, 0.14, 0.14]; break;
    // Stuffed wedge hung off a rail: flatter on top (sits under the saddle),
    // pillow-round on the belly. rounded_rect's equal 0.30 radii leave a flat
    // underside that reads as two keels with a dent between them.
    case 'round_belly': r = [0.24, 0.24, 0.72, 0.72]; break;
    case 'rounded_rect':
    default:            r = [0.30, 0.30, 0.30, 0.30]; break;
  }
  const round = shape === 'round' || shape === 'oval';

  if (round) {
    // A plain ellipse still needs the same ring count as everything else: the
    // flat shapes come to four runs of L plus four corners of N.
    for (let i = 0; i < 4 * (N + L); i++) {
      const a = (i / (4 * (N + L))) * TAU;
      pts.push([Math.cos(a), Math.sin(a)]);
    }
    return { pts, corners: [] };
  }

  // Each run ends exactly where the corner after it begins, and each corner
  // ends exactly where the next run begins, so the ring is one simple closed
  // polygon. Get an angle range backwards, or centre a corner on the wrong
  // quadrant, and the ring crosses itself — which the loft then sweeps into a
  // facet slicing straight through the bag.
  const H = Math.PI / 2;
  // top run (+u), from −v side to +v side
  line(1, -(1 - r[1]), 1, 1 - r[0], L, pts);
  corners.push(push((o) => arc(1 - r[0], 1 - r[0], r[0], r[0], 0, H, N, o)) + (N >> 1));
  // +v side, +u end to −u end
  line(1 - r[0], 1, -(1 - r[3]), 1, L, pts);
  corners.push(push((o) => arc(-(1 - r[3]), 1 - r[3], r[3], r[3], H, 2 * H, N, o)) + (N >> 1));
  // bottom run (−u), from +v side to −v side
  line(-1, 1 - r[3], -1, -(1 - r[2]), L, pts);
  corners.push(push((o) => arc(-(1 - r[2]), -(1 - r[2]), r[2], r[2], 2 * H, 3 * H, N, o)) + (N >> 1));
  // −v side, −u end back to +u end
  line(-(1 - r[2]), -1, 1 - r[1], -1, L, pts);
  corners.push(push((o) => arc(1 - r[1], -(1 - r[1]), r[1], r[1], 3 * H, 4 * H, N, o)) + (N >> 1));

  void flatTop; void flatBottom;
  return { pts, corners };
}

/**
 * Sweep a section along +y, from y = 0 to y = len.
 *
 * `sectionAt(t)` returns `{ a, b, cu }` for t in [0,1]: half-height on the
 * section's u axis, half-width on its v axis, and an optional shift of the
 * section's centre along u (a bag that sits flat on a rack is not centred on
 * its own axis).
 *
 * Returns the geometry plus the seam polylines, in the same local space, so
 * the caller can run piping down them without re-deriving the taper.
 */
export function loftBody({ len, rings = 26, shape = 'rounded_rect', sectionAt, capStart = true, capEnd = true, detail = 5 }) {
  const { pts: unit, corners } = sectionUnit(shape, { detail });
  const M = unit.length;

  const P = [];                                   // rings × M positions
  const sec = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const s = sectionAt(t) || {};
    const a = Math.max(s.a ?? 1, 0.4);
    const b = Math.max(s.b ?? a, 0.4);
    const cu = s.cu || 0;
    sec.push({ t, a, b, cu });
    const ring = [];
    for (let j = 0; j < M; j++) ring.push(v3(unit[j][0] * a + cu, t * len, unit[j][1] * b));
    P.push(ring);
  }

  const pos = [], uv = [], idx = [];
  const at = (i, j) => i * M + j;
  for (const ring of P) for (const p of ring) pos.push(p.x, p.y, p.z);
  for (let i = 0; i <= rings; i++) for (let j = 0; j < M; j++) uv.push((j / M) * (Math.PI * (sec[i].a + sec[i].b)) / 150, (sec[i].t * len) / 150);
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < M; j++) {
      const k = (j + 1) % M;
      idx.push(at(i, j), at(i, k), at(i + 1, k));
      idx.push(at(i, j), at(i + 1, k), at(i + 1, j));
    }
  }

  // Flat end caps rather than a collapsed point: the nose of a seat pack is a
  // stiffened vertical face that presses on the seatpost, not a cone tip.
  const cap = (i, flip) => {
    const c = pos.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (const p of P[i]) { cx += p.x; cy += p.y; cz += p.z; }
    pos.push(cx / M, cy / M, cz / M);
    uv.push(0.5, (sec[i].t * len) / 150);
    for (let j = 0; j < M; j++) {
      const k = (j + 1) % M;
      if (flip) idx.push(c, at(i, k), at(i, j)); else idx.push(c, at(i, j), at(i, k));
    }
  };
  if (capStart) cap(0, true);
  if (capEnd) cap(rings, false);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  // Winding is easy to get backwards and the symptom — a bag lit from inside —
  // is subtle enough to ship. Check one side vertex against its own outward
  // direction and flip the whole index buffer if it points inward.
  const nor = geo.attributes.normal;
  const mid = Math.floor(rings / 2);
  const probe = at(mid, 0);
  const out = v3(P[mid][0].x - sec[mid].cu, 0, P[mid][0].z).normalize();
  if (v3(nor.getX(probe), 0, nor.getZ(probe)).dot(out) < 0) {
    const a = geo.index.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    geo.index.needsUpdate = true;
    geo.computeVertexNormals();
  }

  const seams = corners.map((j) => P.map((ring) => ring[j].clone()));
  return { geo, seams, sections: sec, M };
}

/**
 * The product's own silhouette, measured off the maker's photograph by
 * tools/silhouette.mjs, as a sampler over t in [0,1].
 *
 * Returns null where nothing was measured — a lifestyle shot the segmenter
 * refused, or a product with no local photograph — and every builder falls back
 * to its parametric curve. That is what lets this arrive one slot at a time
 * instead of as a rewrite.
 *
 * The curve is peak-normalised and oriented mounting-end-first, so it carries
 * SHAPE only: the caller still takes every dimension from the catalogue.
 */
export function measuredProfile(p) {
  const a = p?.profile?.profile;
  if (!a?.length) return null;
  const n = a.length;
  return (t) => {
    const x = Math.min(Math.max(t, 0), 1) * (n - 1);
    const i = Math.floor(x), f = x - i;
    const v = a[i] + (a[Math.min(i + 1, n - 1)] - a[i]) * f;
    return Math.max(v, 0.06);          // never zero: a swept zero is a crease
  };
}

/** Map a record's `geometry.crossSection` to a section this module can draw. */
export const sectionFor = (crossSection, fallback = 'rounded_rect') => {
  const k = String(crossSection || '').toLowerCase();
  return ['round', 'oval', 'teardrop', 'd_shape', 'flat_bottom', 'flat_back', 'rounded_rect'].includes(k) ? k : fallback;
};
