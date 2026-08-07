// Rack trunk bag builder (mm-local, parented to the rackTop anchor).

import * as THREE from 'three';
import { v3 } from '../../lib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boxBulge } from '../deform.js';
import { addPockets, bungeeLattice, daisyChain, flapLid, reflectiveStrip, zipperRun } from '../features.js';
import { rollTop, seamStrip } from '../hardware.js';
import { featuresOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';

export function buildTrunk(p, brand, main, accent) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const w = Math.min(p.mm.len, 500), h = Math.min(p.mm.hgt, 340), d = Math.min(p.mm.wid, 300);
  const body = soft(new RoundedBoxGeometry(w, h, d, 8, Math.min(22, d * 0.26)), main, {
    amp: vr.range(2.4, 3.6), freq: vr.range(0.024, 0.032), seed: vr.seed % 941,
    bulge: boxBulge(w / 2, h / 2, d / 2, Math.min(w, h, d) * vr.range(0.09, 0.14)),
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.42,
  });
  body.position.y = h / 2 + 6;
  grp.add(body);
  const wm = webbing();
  const hwm = hardware();
  const closure = feats.closure || 'zip';
  if (closure === 'flap') {
    const fl = flapLid(accent, wm, hwm, { w: w * 1.01, d: d * 1.01, drop: h * 0.34 });
    fl.position.y = h + 8;
    grp.add(fl);
  } else if (closure === 'rolltop') {
    const cap = rollTop(main, hwm, { r: Math.min(w, d) * 0.4, depth: 10 });
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = h + 6;
    grp.add(cap);
  } else {
    const lid = new THREE.Mesh(new RoundedBoxGeometry(w * 1.02, 14, d * 1.02, 4, 8), accent);
    lid.position.y = h + 8;
    grp.add(lid);
    if (closure === 'zip') {
      grp.add(zipperRun(v3(-w * 0.46, h + 1, d / 2 + 1), v3(w * 0.46, h + 1, d / 2 + 1), hwm, { accentMat: accent }));
    }
  }
  const seam = seamStrip(main, w * 0.99, 2.6, d + 2.4);
  seam.position.y = h * vr.range(0.3, 0.42);
  grp.add(seam);
  const nStraps = feats.compressionStraps ?? 2;
  for (let i = 0; i < nStraps; i++) {
    const f = nStraps === 1 ? 0 : (i / (nStraps - 1) - 0.5) * 2;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(22, h * 0.86, d + 2.6), wm);
    strip.position.set(f * w * 0.32, h / 2 + 8, 0);
    grp.add(strip);
    const bk = new THREE.Mesh(new THREE.BoxGeometry(26, 14, 9), hwm);
    bk.position.set(f * w * 0.32, h * 0.24, d / 2 + 4);
    grp.add(bk);
  }
  if (feats.cord) {
    const lat = bungeeLattice(hwm, { w: w * 0.7, h: d * 0.6, n: 3 });
    lat.rotation.x = -Math.PI / 2;
    lat.position.y = h + 14;
    grp.add(lat);
  }
  if (feats.reflective) {
    const rs = reflectiveStrip(w * 0.62, 12);
    rs.position.set(0, h * 0.2, d / 2 + 2);
    grp.add(rs);
  }
  if (feats.daisyChains) {
    const dcn = daisyChain(wm, { len: w * 0.66, rows: 2, band: 16 });
    dcn.rotation.x = -Math.PI / 2;
    dcn.position.set(0, h + 12, 0);
    grp.add(dcn);
  }
  addPockets(grp, feats, main, hwm, {
    side: (make, i) => {
      const s2 = i % 2 === 0 ? 1 : -1;
      const g = make(Math.min(w * 0.6, 200), Math.min(h * 0.5, 140));
      g.position.set(vr.j(w * 0.05), h * 0.45, s2 * (d / 2 + 1));
      if (s2 < 0) g.rotation.y = Math.PI;
    },
    front: (make, i) => {
      const g = make(Math.min(d * 0.7, 150), Math.min(h * 0.5, 140));
      g.position.set(w / 2 + 1, h * (0.45 - i * 0.12), 0);
      g.rotation.y = Math.PI / 2;
    },
    lid: (make) => {
      const g = make(Math.min(w * 0.55, 190), Math.min(d * 0.6, 150));
      g.position.set(0, h + 14, 0);
      g.rotation.x = -Math.PI / 2;
    },
  });
  patch(grp, brand, -w / 2 - 1.6, h * 0.55, 0, 70, -Math.PI / 2);
  patch(grp, brand, 0, h * 0.55, d / 2 + 1.6, 84, 0);
  return shadowify(grp);
}
