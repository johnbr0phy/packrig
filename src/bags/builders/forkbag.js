// Fork bag / cargo cage builder (mm-local, parented to the forkL/forkR anchors).

import * as THREE from 'three';
import { v3, deg } from '../../lib.js';
import { addPockets, orientArc, reflectiveArc } from '../features.js';
import { rollTop, seamRing, strapAssembly } from '../hardware.js';
import { featuresOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';

export function buildForkbag(p, brand, main, accent, ctx, side) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  // A fork bag stands UP the blade, so its long axis is whichever catalogue
  // dimension is largest — not `len`. Andrew The Maker's Many Things Sack is
  // 8.9 x 25.4 x 16.5cm, where `len` is the 3.5in depth; taking len as the
  // height gave CapsuleGeometry a negative cylinder section, which collapses
  // silently to a perfect sphere. Sort the dims and never let that happen.
  const dims = [p.mm.len, p.mm.wid, p.mm.hgt].filter((d) => d > 0).sort((a, b) => b - a);
  const len = Math.min(dims[0] ?? 300, 400);
  const girth = Math.min(dims[1] ?? 120, 150);
  const r = Math.min(girth / 2, len / 2 - 6);   // keep a real cylinder section
  const anchorZ = Math.abs(ctx.anchors[side > 0 ? 'forkR' : 'forkL'].position.z) || 62;
  grp.position.z = side * Math.max(r + 64 - anchorZ, 8);
  const body = soft(new THREE.CapsuleGeometry(r, Math.max(len - 2 * r, 8), 10, 28), main, {
    amp: vr.range(2.5, 3.5), freq: vr.range(0.028, 0.038), seed: vr.seed % 919,
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.81, aoSpan: 0.5,
  });
  grp.add(body);
  const wm = webbing();
  const hwm = hardware();
  const nStraps = feats.compressionStraps ?? 3;
  for (let i = 0; i < nStraps; i++) {
    const t = nStraps === 1 ? 0 : (i / (nStraps - 1) - 0.5) * 0.56;
    // ring axis → −Y; local +Y maps to world +Z, so the buckle lands outboard
    const st = strapAssembly(wm, hwm, { r, width: 18, angle: side > 0 ? Math.PI / 2 : -Math.PI / 2 });
    st.rotation.x = Math.PI / 2;
    st.position.y = t * len;
    grp.add(st);
  }
  const sr = seamRing(main, r * 0.99, 1.2);
  sr.rotation.x = Math.PI / 2;
  sr.position.y = -len * 0.42;
  grp.add(sr);
  // roll-top closure on the upper end
  const cap = rollTop(main, hwm, { r: r * 0.72, depth: 8, rings: 3 });
  cap.rotation.x = -Math.PI / 2;
  cap.position.y = len / 2 - 4;
  grp.add(cap);
  // cargo cage: struts and a base hoop on the inboard face, against the leg
  const cageMat = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, metalness: 0.8, roughness: 0.45 });
  // the cage is *meant* to reach the blade, so it sits out of the collision proxy
  for (const xc of [-r * 0.5, r * 0.5]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, len * 0.76, 8), cageMat);
    strut.position.set(xc, 0, -side * (r + 3));
    strut.userData.noCollide = true;
    grp.add(strut);
  }
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(r * 0.62, 2.4, 6, 20, Math.PI), cageMat);
  hoop.rotation.set(Math.PI / 2, 0, 0);
  hoop.position.set(0, -len * 0.38, -side * r * 0.35);
  hoop.userData.noCollide = true;
  grp.add(hoop);
  // mounting arms reaching back to the fork blade
  for (const yc of [-len * 0.3, len * 0.3]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(9, 7, r + 22), cageMat);
    arm.position.set(0, yc, -side * (r * 0.6 + 14));
    arm.userData.noCollide = true;
    grp.add(arm);
  }
  if (feats.reflective) {
    const rs = reflectiveArc({ R: r + 5, arc: deg(40), width: 8 });
    orientArc(rs, v3(0, 1, 0), v3(0, 0, side));
    rs.position.y = -len * 0.16;
    grp.add(rs);
  }
  addPockets(grp, feats, main, hwm, {
    side: (make) => {
      const g = make.arc(r + 5, len * 0.3, deg(70));
      orientArc(g, v3(0, 1, 0), v3(0, 0, side));
      g.position.y = len * 0.08;
      grp.add(g);
    },
  });
  patch(grp, brand, 0, vr.j(len * 0.08), side * (r + 2), 60, side > 0 ? 0 : Math.PI);
  // lean with the fork blade
  grp.rotation.z = deg(-(90 - ctx.geo.headAngle));
  return shadowify(grp);
}
