// Pannier builder (mm-local, parented to the pannierL/pannierR anchors).

import * as THREE from 'three';
import { v3 } from '../../lib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boxBulge } from '../deform.js';
import { addPockets, bungeeLattice, daisyChain, drawcordEnd, flapLid, reflectiveStrip, zipperRun } from '../features.js';
import { seamStrip } from '../hardware.js';
import { featuresOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';

export function buildPannier(p, brand, main, accent, ctx, side) {
  const grp = new THREE.Group();
  // panniers hang tall and narrow: biggest listed dimension is the drop
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const dims = [p.mm.len, p.mm.wid, p.mm.hgt].sort((a, b) => b - a);
  const h = Math.min(dims[0], 520), w = Math.min(dims[1], 440), d = Math.min(dims[2], 260);
  // The stuffing pushes the face out by `bulgeAmt`; trim placed on the
  // undeformed half-depth therefore sinks INSIDE the shell — which is why
  // reflectors, straps and half the brand patch were invisible.
  const bulgeAmt = Math.min(w, h, d) * vr.range(0.09, 0.14);
  const faceZ = d / 2 + bulgeAmt;
  const body = soft(new RoundedBoxGeometry(w, h, d, 8, Math.min(24, d * 0.28)), main, {
    amp: vr.range(2.6, 3.8), freq: vr.range(0.02, 0.028), seed: vr.seed % 947,
    bulge: boxBulge(w / 2, h / 2, d / 2, bulgeAmt),
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.42,
  });
  grp.add(body);
  const wm = webbing();
  const hwm = hardware();
  const closure = feats.closure || 'rolltop';
  if (closure === 'rolltop') {
    const roll = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const rr = d * 0.23 * (1 - i * 0.16);
      const fold = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, w * (0.94 - i * 0.05), 18), main);
      fold.rotation.z = Math.PI / 2;
      fold.position.set(0, i * rr * 0.34, i * rr * 0.62);
      roll.add(fold);
    }
    roll.position.y = h / 2 - d * 0.06;
    grp.add(roll);
    const rollBuckle = new THREE.Mesh(new THREE.BoxGeometry(18, 12, 24), hwm);
    rollBuckle.position.set(0, h / 2 + d * 0.11, 0);
    grp.add(rollBuckle);
  } else if (closure === 'flap') {
    const fl = flapLid(accent, wm, hwm, { w: w * 1.01, d: d * 1.01, drop: h * 0.3 });
    fl.position.y = h / 2 + 3;
    if (side < 0) fl.rotation.y = Math.PI;
    grp.add(fl);
  } else if (closure === 'zip') {
    const lid = new THREE.Mesh(new RoundedBoxGeometry(w * 1.01, 16, d * 1.01, 4, 8), accent);
    lid.position.y = h / 2 + 2;
    grp.add(lid);
    grp.add(zipperRun(v3(-w * 0.46, h / 2 - 8, side * (faceZ + 1)), v3(w * 0.46, h / 2 - 8, side * (faceZ + 1)), hwm, { accentMat: accent }));
  } else {
    const dc = drawcordEnd(main, hwm, { r: Math.min(w, d) * 0.4, depth: 12 });
    dc.rotation.x = -Math.PI / 2;
    dc.position.y = h / 2;
    grp.add(dc);
  }
  // horizontal panel seam a third up + flat vertical webbing on the outer face
  const seam = seamStrip(main, w * 0.99, 2.6, d + 2.4);
  seam.position.y = -h / 6 + vr.j(h * 0.05);
  grp.add(seam);
  const nStraps = feats.compressionStraps ?? 2;
  for (let i = 0; i < nStraps; i++) {
    const f = nStraps === 1 ? 0 : (i / (nStraps - 1) - 0.5) * 2;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(24, h * 0.92, 2.4), wm);
    strip.position.set(f * w * 0.28, -h * 0.02, side * (faceZ + 0.8));
    grp.add(strip);
    const bk = new THREE.Mesh(new THREE.BoxGeometry(28, 15, 9), hwm);
    bk.position.set(f * w * 0.28, -h * 0.3, side * (faceZ + 4));
    grp.add(bk);
  }
  if (feats.cord) {
    const lat = bungeeLattice(hwm, { w: w * 0.7, h: h * 0.5, n: 4 });
    lat.position.set(0, -h * 0.05, side * (faceZ + 2));
    if (side < 0) lat.rotation.y = Math.PI;
    grp.add(lat);
  }
  if (feats.reflective) {
    const rs = reflectiveStrip(w * 0.7, 12);
    rs.position.set(0, -h * 0.4, side * (faceZ + 2));
    grp.add(rs);
  }
  if (feats.daisyChains) {
    const dcn = daisyChain(wm, { len: h * 0.55, rows: 2, band: 16 });
    dcn.rotation.z = Math.PI / 2;
    dcn.rotation.y = side < 0 ? Math.PI : 0;
    dcn.position.set(-w * 0.32, 0, side * (faceZ + 2));
    grp.add(dcn);
  }
  addPockets(grp, feats, main, hwm, {
    side: (make, i) => {
      const g = make(Math.min(w * 0.62, 210), Math.min(h * 0.34, 150));
      g.position.set(vr.j(w * 0.05), h * (0.16 - i * 0.24), side * (faceZ + 1));
      if (side < 0) g.rotation.y = Math.PI;
    },
    front: (make, i) => {
      const g = make(Math.min(d * 0.7, 130), Math.min(h * 0.35, 150));
      g.position.set(w / 2 + bulgeAmt + 1, h * (0.1 - i * 0.2), 0);
      g.rotation.y = Math.PI / 2;
    },
  });
  // QL-style mount: a plate on the inboard face carrying the upper hooks, plus
  // a lower stabiliser hook. The hooks used to sit h/2 + d*0.3 + 6 up, i.e.
  // clear ABOVE the bag's own top edge, so they read as loose blocks floating
  // beside the tyre instead of hardware gripping the rack rail.
  const inZ = -side * (d / 2 + 1);
  const plate = new THREE.Mesh(new RoundedBoxGeometry(w * 0.62, 46, 7, 3, 3), hwm);
  plate.position.set(-w * 0.04, h / 2 - 34, inZ);
  plate.userData.noCollide = true;
  grp.add(plate);
  for (const sx of [-0.24, 0.24]) {
    const hook = new THREE.Mesh(new THREE.BoxGeometry(24, 26, 15), hwm);
    hook.position.set(sx * w, h / 2 - 20, inZ - side * 7);
    hook.userData.noCollide = true;
    grp.add(hook);
    // the lip that closes over the rack rail
    const lip = new THREE.Mesh(new THREE.BoxGeometry(24, 8, 26), hwm);
    lip.position.set(sx * w, h / 2 - 8, inZ - side * 13);
    lip.userData.noCollide = true;
    grp.add(lip);
  }
  const lowHook = new THREE.Mesh(new THREE.BoxGeometry(20, 30, 12), hwm);
  lowHook.position.set(-w * 0.22, -h * 0.3, inZ - side * 5);
  lowHook.userData.noCollide = true;
  grp.add(lowHook);
  patch(grp, brand, -w * 0.16 + vr.j(w * 0.06), h * 0.05 + vr.j(h * 0.06), side > 0 ? faceZ + 2 : -(faceZ + 2), 96, side > 0 ? 0 : Math.PI);
  // hang outboard of the rack rails (|z| ≈ 72) with the top just under the top rail
  const anchor = ctx.anchors[side > 0 ? 'pannierR' : 'pannierL'].position;
  const rackTopY = ctx.anchors.rackTop ? ctx.anchors.rackTop.position.y : ctx.points.rearAxle.y + 300;
  grp.position.y = rackTopY - 24 - h / 2 - anchor.y;
  grp.position.z = side * (76 + d / 2) - anchor.z;
  return shadowify(grp);
}
