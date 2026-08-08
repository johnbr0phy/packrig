// Rando / basket bag builder (mm-local, parented to the basket anchor).

import * as THREE from 'three';
import { v3 } from '../../lib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boxBulge } from '../deform.js';
import { addPockets, bungeeLattice, daisyChain, flapLid, reflectiveStrip, zipperRun } from '../features.js';
import { rollTop, seamStrip, webbingRun } from '../hardware.js';
import { featuresOf, stiffnessOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';

export function buildRandobag(p, brand, main, accent) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  // soft | semi | rigid, from the model records — see stiffnessOf().
  const stiff = stiffnessOf(p);
  const w = Math.min(p.mm.len, 440), h = Math.min(p.mm.hgt, 380), d = Math.min(p.mm.wid, 340);
  const body = soft(new RoundedBoxGeometry(d, h, w, 7, Math.min(20, d * 0.28)), main, {
    amp: vr.range(2.4, 3.4), freq: vr.range(0.024, 0.032), seed: vr.seed % 971,
    stiffness: stiff,
    bulge: boxBulge(d / 2, h / 2, w / 2, Math.min(d, h, w) * vr.range(0.08, 0.13)),
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.45,
  });
  body.position.y = h / 2;
  grp.add(body);
  const wm = webbing();
  const hwm = hardware();
  const closure = feats.closure || 'flap';
  if (closure === 'flap') {
    const fl = flapLid(accent, wm, hwm, { w: w * 1.02, d: d * 1.02, drop: h * 0.4 });
    fl.rotation.y = Math.PI / 2;
    fl.position.y = h + 2;
    grp.add(fl);
  } else if (closure === 'rolltop') {
    const cap = rollTop(main, hwm, { r: Math.min(d, w) * 0.42, depth: 10 });
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = h;
    grp.add(cap);
  } else {
    const lid = new THREE.Mesh(new RoundedBoxGeometry(d * 1.04, 16, w * 1.05, 4, 8), accent);
    lid.position.y = h - 2;
    grp.add(lid);
    if (closure === 'zip') {
      grp.add(zipperRun(v3(d / 2 + 1, h - 12, -w * 0.46), v3(d / 2 + 1, h - 12, w * 0.46), hwm, { accentMat: accent }));
    }
  }
  const seam = seamStrip(main, d + 2.4, 2.6, w * 0.97);
  seam.position.y = h * vr.range(0.3, 0.42);
  grp.add(seam);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(d * 0.9, 6, 26), wm);
  strap.position.set(0, h + 4, 0);
  grp.add(strap);
  const nStraps = feats.compressionStraps ?? 2;
  for (let i = 0; i < nStraps; i++) {
    const f = nStraps === 1 ? 0 : (i / (nStraps - 1) - 0.5) * 2;
    webbingRun(grp, wm, hwm, {
      from: v3(d / 2, h * 0.98, f * w * 0.28), to: v3(d / 2, h * 0.12, f * w * 0.28),
      width: 22, normal: 'x', proud: 1.0, buckleAt: 0.7,
    });
  }
  if (feats.cord) {
    const lat = bungeeLattice(hwm, { w: w * 0.8, h: h * 0.55, n: 3 });
    lat.rotation.y = Math.PI / 2;
    lat.position.set(d / 2 + 2, h * 0.5, 0);
    grp.add(lat);
  }
  if (feats.reflective) {
    const rs = reflectiveStrip(w * 0.6, 11);
    rs.rotation.y = Math.PI / 2;
    rs.position.set(d / 2 + 2, h * 0.2, 0);
    grp.add(rs);
  }
  if (feats.daisyChains) {
    const dcn = daisyChain(wm, { len: w * 0.7, rows: 2, band: 16 });
    dcn.rotation.set(0, Math.PI / 2, Math.PI / 2);
    dcn.position.set(d / 2 + 2, h * 0.62, 0);
    grp.add(dcn);
  }
  addPockets(grp, feats, main, hwm, {
    front: (make, i) => {
      const g = make(Math.min(w * 0.55, 190), h * 0.34);
      g.position.set(d / 2 + 1, h * (0.3 + i * 0.06), 0);
      g.rotation.y = Math.PI / 2;
    },
    side: (make, i) => {
      const s2 = i % 2 === 0 ? 1 : -1;
      const g = make(Math.min(d * 0.7, 150), h * 0.4);
      g.position.set(0, h * 0.42, s2 * (w / 2 + 1));
      if (s2 < 0) g.rotation.y = Math.PI;
    },
    lid: (make) => {
      const g = make(Math.min(w * 0.5, 160), Math.min(d * 0.6, 130));
      g.position.set(0, h + 10, 0);
      g.rotation.x = -Math.PI / 2;
    },
  });
  patch(grp, brand, d / 2 + 1.6, h * vr.range(0.5, 0.62), vr.j(w * 0.08), 84, 0).rotation.set(0, Math.PI / 2, 0);
  return shadowify(grp);
}
