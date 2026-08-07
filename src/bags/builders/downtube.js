// Downtube bag builder (mm-local, parented to the downtube anchor).

import * as THREE from 'three';
import { v3 } from '../../lib.js';
import { strapAssembly } from '../hardware.js';
import { featuresOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';

export function buildDowntube(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const r = Math.min(Math.max(p.mm.hgt, p.mm.wid), 150) / 2;
  const len = Math.min(p.mm.len, 380);
  const ang = Math.atan2(ctx.points.headBottom.y, ctx.points.headBottom.x);
  const body = soft(new THREE.CapsuleGeometry(r, len - 2 * r, 8, 24), main, {
    amp: vr.range(1.7, 2.4), freq: vr.range(0.04, 0.05), seed: vr.seed % 911,
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.82, aoSpan: 0.5,
  });
  body.rotation.z = ang - Math.PI / 2;
  grp.add(body);
  // The bag is centred on the anchor, so it projects len/2 up the tube toward
  // the front wheel. The down tube is only ~620mm and the anchor sits mid-tube,
  // which leaves ~55mm of tyre clearance against bags up to 380mm long — so
  // long packs speared the wheel. Slide back until the FRONT tip is clear.
  const dTube = v3(Math.cos(ang), Math.sin(ang), 0);
  const axle = ctx.points.frontAxle;
  const anchorP = ctx.anchors.downtube.position;
  const R = ctx.points.tireR + ctx.geo.tireWidth / 2 + 18;   // + clearance
  const A = v3(anchorP.x - axle.x, anchorP.y - axle.y, 0);
  const b2 = A.dot(dTube);
  const disc = b2 * b2 - (A.lengthSq() - R * R);
  if (disc > 0) {
    const sEnter = -b2 - Math.sqrt(disc);      // where the tube line meets the tyre
    const shift = len / 2 - sEnter;
    if (shift > 0) grp.position.addScaledVector(dTube, -shift);
  }
  const wm = webbing();
  const hwm = hardware();
  for (const t of [-0.26, 0.26]) {
    const st = strapAssembly(wm, hwm, { r, width: 15, angle: -Math.PI / 2 });
    st.quaternion.setFromUnitVectors(v3(0, 0, 1), v3(Math.cos(ang), Math.sin(ang), 0));
    st.position.set(Math.cos(ang) * t * len, Math.sin(ang) * t * len, 0);
    grp.add(st);
  }
  // bolt-on straps closing around the down tube itself
  const hd = v3(ctx.points.hd.x, ctx.points.hd.y, 0);
  const dtHead = ctx.points.headBottom.clone().addScaledVector(hd, -12);
  const dtFoot = v3(10, 6, 0);
  const wraps = [];
  for (let i = 0; i < 2; i++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(27, 2.0, 6, 28), wm);
    band.scale.z = 6;
    band.userData.noCollide = true;
    grp.add(band);
    wraps.push(band);
  }
  grp.userData.reseat = (toLocal, toLocalDir) => {
    const a = toLocal(dtFoot), b = toLocal(dtHead);
    const u = b.clone().sub(a).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), u);
    const along = -a.dot(u); // project the bag's origin onto the tube axis
    wraps.forEach((band, i) => {
      band.quaternion.copy(q);
      band.position.copy(a).addScaledVector(u, along + (i === 0 ? -1 : 1) * len * 0.26);
    });
  };
  patch(grp, brand, 0, 0, r + 1.6, 54, 0);
  return shadowify(grp);
}
