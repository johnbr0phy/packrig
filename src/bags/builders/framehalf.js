// Half frame bag builder (mm-local, parented to the framebag anchor).

import * as THREE from 'three';
import { v3 } from '../../lib.js';
import { shapeBulge } from '../deform.js';
import { addPockets, reflectiveStrip, zipperRun } from '../features.js';
import { TUBE_R, frameStraps, seamStrip } from '../hardware.js';
import { featuresOf, stiffnessOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';
import { crossSpan, framePanelPoly, subdivideXY } from '../panels.js';

export function buildFrameHalf(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const anchor = ctx.anchors.framebag.position;
  const panel = framePanelPoly(ctx);
  const a = panel[1].clone(), b = panel[2].clone(); // seat-side → head-side along TT
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  // soft | semi | rigid, from the model records — see stiffnessOf().
  const stiff = stiffnessOf(p);
  const h = Math.min(p.mm.hgt, 300);
  // Honour the catalogue length. Spanning 4%→96% of the top tube regardless of
  // p.mm.len made a 205mm Racing pack the same object as a 490mm Expedition.
  // Real half packs are pushed forward against the head tube.
  const ttDir = b.clone().sub(a).normalize();
  const ttLen = a.distanceTo(b);
  const runLen = Math.min(p.mm.len, ttLen - 36);
  const inB = b.clone().addScaledVector(ttDir, -18);
  const inA = inB.clone().addScaledVector(ttDir, -runLen);
  const shape = new THREE.Shape();
  // wedge: full depth at the seat-tube end, tapering toward the head tube
  const hFront = h * 0.62;
  const pts = [inA, inB, v3(inB.x - 22, inB.y - hFront), v3(inA.x + 16, inA.y - h)];
  const L = pts.map((pt) => v3(pt.x - anchor.x, pt.y - anchor.y, 0));
  shape.moveTo(L[0].x, L[0].y);
  shape.lineTo(L[1].x, L[1].y);
  // soft goods, not plywood — round the two lower corners
  const fillet = Math.min(26, h * 0.3, runLen * 0.2);
  shape.lineTo(L[2].x + fillet * 0.2, L[2].y + fillet);
  shape.quadraticCurveTo(L[2].x, L[2].y, L[2].x - fillet, L[2].y);
  shape.lineTo(L[3].x + fillet, L[3].y);
  shape.quadraticCurveTo(L[3].x, L[3].y, L[3].x, L[3].y + fillet);
  shape.lineTo(L[0].x, L[0].y);
  const depth = Math.min(p.mm.wid, 130);
  const bevel = 6;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4, steps: 1,
  });
  geo.translate(0, 0, -depth / 2);
  const mid = v3((pts[0].x + pts[2].x) / 2 - anchor.x, (pts[0].y + pts[2].y) / 2 - anchor.y + 6);
  const local = pts.map((pt) => ({ x: pt.x - anchor.x, y: pt.y - anchor.y }));
  const hA = mid.x + vr.j(22) + 40, hB = mid.x + vr.j(22) - 120;
  const seams = [{ axis: 'x', at: hA }, { axis: 'x', at: hB }];
  const bulgeAmt = Math.min(depth * vr.range(0.2, 0.28), 18);
  grp.add(soft(subdivideXY(geo, 30), main, {
    amp: vr.range(2.4, 3.6), freq: vr.range(0.018, 0.026), seed: vr.seed % 953, flatAxis: 'z',
    stiffness: stiff,
    bulge: shapeBulge(local, bulgeAmt, seams, 48),
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.78, aoSpan: 0.5,
  }));
  const za = pts[0].clone().sub(anchor).add(v3(14, -12, depth / 2 - 6));
  const zbv = pts[1].clone().sub(anchor).add(v3(-14, -12, depth / 2 - 6));
  grp.add(zipperRun(za, zbv, hardware(), { accentMat: accent }));
  const seamZ = depth / 2 + bevel + bulgeAmt * 0.28 + 1.4;
  for (const s of [1, -1]) {
    for (const sx of [hA, hB]) {
      const v = crossSpan(local, sx, 'x');
      if (!v) continue;
      const sm = seamStrip(main, 2.6, Math.max(v.hi - v.lo - 16, 18), 2.4);
      sm.position.set(sx, (v.lo + v.hi) / 2, s * seamZ);
      grp.add(sm);
    }
  }
  if (feats.reflective) {
    for (const s of [1, -1]) {
      const rs = reflectiveStrip(120, 9);
      rs.position.set(mid.x - 30, mid.y - h * 0.3, s * seamZ);
      grp.add(rs);
    }
  }
  addPockets(grp, feats, main, hardware(), {
    side: (make, i) => {
      const s2 = i % 2 === 0 ? 1 : -1;
      const g = make(150, Math.min(h * 0.5, 80));
      g.position.set(mid.x + vr.j(16), mid.y - i * 10, s2 * seamZ);
      if (s2 < 0) g.rotation.y = Math.PI;
    },
  });
  // straps to the top tube (and one down low toward the down tube)
  const strapCounts = feats.straps || {};
  frameStraps(grp, webbing(), hardware(), {
    edge: [L[0].clone(), L[1].clone()],
    count: strapCounts.topTube ?? 3, tubeR: TUBE_R.topTube, depth,
  });
  const patchZ = depth / 2 + bevel + bulgeAmt * 0.85 + 1.4;
  const patchW = Math.max(38, Math.min(56, p.mm.len * 0.16, h * 0.34));
  patch(grp, brand, mid.x - 40, mid.y, patchZ, patchW, 0);
  patch(grp, brand, mid.x - 40, mid.y, -patchZ, patchW, Math.PI);
  return shadowify(grp);
}
