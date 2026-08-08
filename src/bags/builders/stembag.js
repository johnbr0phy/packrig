// Stem bag builder (mm-local, parented to the stemL/stemR anchors).

import * as THREE from 'three';
import { deg } from '../../lib.js';
import { addPockets, bungeeArc, reflectiveArc } from '../features.js';
import { seamRing, strapAssembly } from '../hardware.js';
import { featuresOf, stiffnessOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';

// Axis mapping for this slot: the bag is a vertical cylinder hanging from the
// stemL/stemR anchor. Local +y is world up; the bag hangs into -y. `p.mm.dia`
// is its across-bike / fore-aft girth, `p.mm.hgt` its drop. Lateral placement is
// derived from the bag's own radius and the anchor the bike gives us — never a
// literal offset.
export function buildStembag(p, brand, main, accent, ctx, side = 1) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  // soft | semi | rigid, from the model records — see stiffnessOf().
  const stiff = stiffnessOf(p);
  const r = Math.min(p.mm.dia, 130) / 2;
  const h = Math.min(p.mm.hgt, 240);

  // A stem bag hangs BESIDE the stem, off the frame's centre plane. This builder
  // used to take no bike reference at all and simply hung off the anchor, so a
  // fat bag's inner face reached back across the centreline: the Randi Jo
  // Bartender Plus (r = 65mm on an 80mm anchor) sat 8.5mm inside the top tube
  // and grazed the down tube, and the drop bar passed straight through it.
  // Real ones are strapped to bar, stem and head tube and hang clearly outboard.
  // Push out only as far as this bag's own radius requires, never inboard.
  // The obstacle is the head tube, not the top tube: bike.js draws it at
  // frameEdgeR[2] (24mm) with headset cups 2.5mm proud of that. Straps, cinch
  // and patch also carry the bag ~10mm past its own radius, so clear from the
  // hardware envelope rather than from `r`.
  const anchorZ = Math.abs(ctx?.anchors?.[side > 0 ? 'stemR' : 'stemL']?.position.z ?? 80);
  const headR = (ctx?.frameEdgeR?.[2] ?? 24) + 2.5;
  const CLEAR = 8;
  grp.position.z = side * Math.max(headR + (r + 10) + CLEAR - anchorZ, 0);
  const taper = vr.range(0.82, 0.95);
  const body = soft(new THREE.CylinderGeometry(r, r * taper, h, 30, 8), main, {
    amp: vr.range(1.7, 2.5), freq: vr.range(0.04, 0.052), seed: vr.seed % 929,
    stiffness: stiff,
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
