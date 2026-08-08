// Full frame bag builder (mm-local, parented to the framebag anchor).

import * as THREE from 'three';
import { v3 } from '../../lib.js';
import { shapeBulge } from '../deform.js';
import { addPockets, daisyChain, reflectiveStrip, zipperRun } from '../features.js';
import { TUBE_R, frameStraps, rollTop, seamStrip } from '../hardware.js';
import { featuresOf, stiffnessOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';
import { clipHalfPlane, crossSpan, framePanelPoly, subdivideXY } from '../panels.js';

export function buildFrameFull(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  // soft | semi | rigid, from the model records — see stiffnessOf().
  const stiff = stiffnessOf(p);
  const full = framePanelPoly(ctx);
  // Fit the catalogue panel INSIDE the triangle instead of always filling it.
  // Ignoring p.mm.len/hgt drew a 300x180mm Backcountry 2.5L at the same size as
  // a 546x502mm Ripio XL — every full pack was the same object.
  const ttA = full[1], ttB = full[2];              // seat-side → head-side along TT
  const ttDir = ttB.clone().sub(ttA).normalize();
  const down = v3(ttDir.y, -ttDir.x, 0).normalize();
  const downSign = down.y > 0 ? -1 : 1;            // make sure it points at the BB
  down.multiplyScalar(downSign);
  const runLen = Math.min(p.mm.len, ttA.distanceTo(ttB));
  const drop = Math.min(p.mm.hgt, 520);
  let poly = clipHalfPlane(full, ttB.clone().addScaledVector(ttDir, -runLen), ttDir.clone().negate());
  poly = clipHalfPlane(poly, ttA.clone().addScaledVector(down, drop), down);
  if (poly.length < 3) poly = full;                // degenerate catalogue dims: fall back
  const anchor = ctx.anchors.framebag.position;
  const shape = new THREE.Shape();
  poly.forEach((pt, i) => (i === 0 ? shape.moveTo(pt.x - anchor.x, pt.y - anchor.y) : shape.lineTo(pt.x - anchor.x, pt.y - anchor.y)));
  const depth = Math.min(p.mm.wid, 140);
  const bevel = 7;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3,
    curveSegments: 4, steps: 1,
  });
  geo.translate(0, 0, -depth / 2);
  const local = poly.map((pt) => ({ x: pt.x - anchor.x, y: pt.y - anchor.y }));
  const mid = poly.reduce((acc, q) => acc.add(q.clone()), new THREE.Vector3()).multiplyScalar(1 / poly.length).sub(anchor);
  // Trim must key off the panel's real extent — the old fixed offsets (−150,
  // −120, 170×90 pockets) assumed a full-triangle panel and now that small
  // products get small panels they would hang in open air beside the bag.
  const bx = local.reduce((m, q) => Math.max(m, Math.abs(q.x - mid.x)), 0);
  const by = local.reduce((m, q) => Math.max(m, Math.abs(q.y - mid.y)), 0);
  const sA = mid.x + vr.j(bx * 0.1) - bx * 0.42, sB = mid.x + vr.j(bx * 0.1) + bx * 0.3, sY = mid.y + by * 0.3;
  const seams = [{ axis: 'x', at: sA }, { axis: 'x', at: sB }, { axis: 'y', at: sY }];
  const bulgeAmt = Math.min(depth * vr.range(0.2, 0.28), 20);
  // tessellate the flat faces so the panels can actually bulge
  const body = soft(subdivideXY(geo, 34), main, {
    amp: vr.range(2.6, 3.8), freq: vr.range(0.017, 0.024), seed: vr.seed % 967, flatAxis: 'z',
    stiffness: stiff,
    bulge: shapeBulge(local, bulgeAmt, seams),
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.78, aoSpan: 0.5,
  });
  grp.add(body);
  const seamZ = depth / 2 + bevel + bulgeAmt * 0.28 + 1.6;
  const patchZ = depth / 2 + bevel + bulgeAmt * 0.85 + 1.6;
  // zipper along the top edge
  const a = poly[1].clone().sub(anchor), b = poly[2].clone().sub(anchor);
  a.z = b.z = depth / 2 - 8;
  const zipDir = b.clone().sub(a);
  const za = a.clone().addScaledVector(zipDir, 0.06).add(v3(0, -9, 0));
  const zb = a.clone().addScaledVector(zipDir, 0.94).add(v3(0, -9, 0));
  // Use the real zip helper (tape + teeth + slider + pull) rather than a bare
  // rod, and honour a declared roll closure — the Ortlieb RC line was rendering
  // identically to its Tizip siblings because nothing branched on it.
  if (feats.closure === 'rolltop') {
    const mouth = rollTop(main, hardware(), { r: zipDir.length() * 0.5, depth: 14, rings: 2, widthScale: 0.5 });
    mouth.rotation.x = -Math.PI / 2;
    mouth.position.copy(za.clone().lerp(zb, 0.5)).add(v3(0, 6, 0));
    grp.add(mouth);
  } else {
    grp.add(zipperRun(za, zb, hardware(), { accentMat: accent }));
  }
  // quilted panel divisions, sitting in the pinch the bulge leaves for them
  const hSpan = crossSpan(local, sY, 'y');
  for (const s of [1, -1]) {
    for (const sx of [sA, sB]) {
      const v = crossSpan(local, sx, 'x');
      if (!v) continue;
      const sm = seamStrip(main, 3.0, Math.max(v.hi - v.lo - 18, 20), 2.8);
      sm.position.set(sx, (v.lo + v.hi) / 2, s * seamZ);
      grp.add(sm);
    }
    if (hSpan) {
      const horiz = seamStrip(main, Math.max(hSpan.hi - hSpan.lo - 18, 20), 3.0, 2.8);
      horiz.position.set((hSpan.lo + hSpan.hi) / 2, sY, s * seamZ);
      grp.add(horiz);
    }
  }
  const wmF = webbing();
  const hwmF = hardware();
  if (feats.closure === 'zip') {
    const zy = mid.y - by * 0.35;
    const zs = crossSpan(local, zy, 'y');
    if (zs) grp.add(zipperRun(v3(zs.lo + 14, zy, seamZ), v3(zs.hi - 14, zy, seamZ), hwmF, { accentMat: accent }));
  }
  if (feats.daisyChains) {
    const dcn = daisyChain(wmF, { len: Math.min(150, bx * 1.1), rows: 2, band: 15 });
    dcn.position.set(mid.x - bx * 0.1, mid.y - by * 0.55, seamZ);
    grp.add(dcn);
  }
  if (feats.reflective) {
    const ry = mid.y - by * 0.62;
    const rspan = crossSpan(local, ry, 'y');
    for (const s of [1, -1]) {
      const rs = reflectiveStrip(Math.min(150, rspan ? (rspan.hi - rspan.lo) * 0.6 : bx), 10);
      rs.position.set(rspan ? (rspan.lo + rspan.hi) / 2 : mid.x, ry, s * seamZ);
      grp.add(rs);
    }
  }
  addPockets(grp, feats, main, hwmF, {
    side: (make, i) => {
      const s2 = i % 2 === 0 ? 1 : -1;
      const g = make(Math.min(170, bx * 1.2), Math.min(90, by * 0.8));
      g.position.set(mid.x + vr.j(bx * 0.1) - bx * 0.14, mid.y + by * 0.18 - i * 12, s2 * seamZ);
      if (s2 < 0) g.rotation.y = Math.PI;
    },
  });
  // Stability straps to the three tubes the panel actually touches. Apidura
  // quotes eight on the Expedition Full (3 top / 3 down / 2 seat); without any
  // of them the panel read as a decal floating in the triangle.
  const straps = feats.straps || {};
  const asLocal = (q) => v3(q.x - anchor.x, q.y - anchor.y, 0);
  const edgeOf = (i, j) => [asLocal(poly[i % poly.length]), asLocal(poly[j % poly.length])];
  const ttI = poly.indexOf(poly.reduce((hi, q) => (q.y > hi.y ? q : hi), poly[0]));
  frameStraps(grp, wmF, hwmF, {
    edge: [asLocal(ttA), asLocal(ttB)], count: straps.topTube ?? 3,
    tubeR: TUBE_R.topTube, depth, normal: v3(0, 1, 0),
  });
  // lower edge of the clipped panel rides the down tube only when it reaches it
  const lowest = poly.reduce((lo, q) => (q.y < lo.y ? q : lo), poly[0]);
  if (lowest.distanceTo(ctx.framePoly[0]) < 90) {
    frameStraps(grp, wmF, hwmF, {
      edge: edgeOf(poly.indexOf(lowest), poly.indexOf(lowest) + 1),
      count: straps.downTube ?? 3, tubeR: TUBE_R.downTube, depth, normal: down.clone().negate(),
    });
  }
  const patchW = Math.max(40, Math.min(60, p.mm.len * 0.15, p.mm.hgt * 0.3));
  patch(grp, brand, mid.x, mid.y - 60, patchZ, patchW, 0);
  patch(grp, brand, mid.x, mid.y - 60, -patchZ, patchW, Math.PI);
  return shadowify(grp);
}
