// Stem bag builder (mm-local, parented to the stemL/stemR anchors).

import * as THREE from 'three';
import { deg } from '../../lib.js';
import { addPockets, bungeeArc, reflectiveArc } from '../features.js';
import { seamRing, strapAssembly } from '../hardware.js';
import { featuresOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';

export function buildStembag(p, brand, main, accent) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const r = Math.min(p.mm.dia, 130) / 2;
  const h = Math.min(p.mm.hgt, 240);
  const taper = vr.range(0.82, 0.95);
  const body = soft(new THREE.CylinderGeometry(r, r * taper, h, 30, 8), main, {
    amp: vr.range(1.7, 2.5), freq: vr.range(0.04, 0.052), seed: vr.seed % 929,
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.5,
  });
  body.position.y = -h / 2;
  grp.add(body);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.86, 5, 8, 26), accent);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -4;
  grp.add(rim);
  const sr = seamRing(main, r * 0.98, 1.2);
  sr.rotation.x = Math.PI / 2;
  sr.position.y = -h * 0.62;
  grp.add(sr);
  const wm = webbing();
  const hwm = hardware();
  const st = strapAssembly(wm, hwm, { r: r * 0.97, width: 16, angle: Math.PI });
  st.rotation.x = Math.PI / 2;
  st.position.y = -h * 0.3;
  grp.add(st);
  const cinch = new THREE.Mesh(new THREE.BoxGeometry(10, 14, 10), hwm);
  cinch.position.set(r * 0.7, -10, 0);
  grp.add(cinch);
  if (feats.cord) {
    const lat = bungeeArc(hwm, { R: r + 4, arc: deg(96), len: h * 0.5, n: 3 });
    lat.position.y = -h * 0.45;
    grp.add(lat);
  }
  if (feats.reflective) {
    const rs = reflectiveArc({ R: r + 4, arc: deg(70), width: 7 });
    rs.position.y = -h * 0.78;
    grp.add(rs);
  }
  addPockets(grp, feats, main, hwm, {
    side: (make) => {
      const g = make.arc(r + 4, h * 0.4, deg(80));
      g.position.y = -h * 0.42;
      grp.add(g);
    },
  });
  patch(grp, brand, 0, -h * vr.range(0.4, 0.52), r + 1.6, 58, 0);
  grp.userData.radius = r;
  return shadowify(grp);
}
