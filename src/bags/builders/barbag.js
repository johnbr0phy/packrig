// Handlebar bag builder (mm-local, parented to the barroll anchor). Handles
// both the barrel form (dims_cm.dia) and the boxy form.

import * as THREE from 'three';
import { v3, deg } from '../../lib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boxBulge } from '../deform.js';
import { addPockets, bungeeArc, bungeeLattice, daisyChain, drawcordEnd, flapLid, orientArc, reflectiveArc, reflectiveStrip, zipperRun } from '../features.js';
import { rollTop, seamRing, seamStrip, strapAssembly, webbingRun } from '../hardware.js';
import { featuresOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';
import { barMount } from '../mount.js';

export function buildBarbag(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const wm = webbing();
  const hwm = hardware();
  const hasDia = p.dims_cm && p.dims_cm.dia;
  if (hasDia) {
    // barrel bag: soft cylinder along the bars
    const r = Math.min(p.mm.dia, 230) / 2;
    const mount = barMount(ctx, r);
    const len = Math.min(p.mm.len, mount.maxHalfLen * 2);
    const bodyAmp = vr.range(2.6, 3.8);
    const lift = bodyAmp + 1.5;
    const body = soft(new THREE.CapsuleGeometry(r * 0.98, Math.max(len - 2 * r, 6), 10, 30), main, {
      amp: bodyAmp, freq: vr.range(0.024, 0.034), seed: vr.seed % 983,
      bulge: feats.shape === 'barrel' ? boxBulge(r, len / 2, r, r * 0.1) : null,
      aoDir: new THREE.Vector3(0, 0, 1), aoK: 0.81, aoSpan: 0.5,
    });
    body.rotation.x = Math.PI / 2;
    grp.add(body);
    const closure = feats.closure || 'drawcord';
    for (const sgn of [1, -1]) {
      if (closure === 'rolltop') {
        const cap = rollTop(main, hwm, { r: r * 0.7, depth: 8 });
        cap.position.z = sgn * (len / 2 - 3);
        if (sgn < 0) cap.rotation.y = Math.PI;
        grp.add(cap);
      } else {
        const dc = drawcordEnd(main, hwm, { r: r * 0.76, depth: 10 });
        dc.position.z = sgn * (len / 2 - 3);
        if (sgn < 0) dc.rotation.y = Math.PI;
        grp.add(dc);
      }
      const sr = seamRing(main, r * 0.99, 1.2);
      sr.position.z = sgn * (len / 2 - Math.min(28, len * 0.09));
      grp.add(sr);
    }
    const nStraps = feats.compressionStraps ?? 2;
    for (let i = 0; i < nStraps; i++) {
      const f = nStraps === 1 ? 0 : (i / (nStraps - 1) - 0.5) * 2;
      const st = strapAssembly(wm, hwm, { r, width: 20, angle: -Math.PI / 2 });
      st.position.z = f * len * vr.range(0.22, 0.28);
      grp.add(st);
    }
    if (feats.cord) {
      const lat = bungeeArc(hwm, { R: r + lift, arc: deg(70), len: len * 0.55, n: 3 });
      orientArc(lat, v3(0, 0, 1), v3(1, 0, 0));
      grp.add(lat);
    }
    if (feats.reflective) {
      const rs = reflectiveArc({ R: r + lift, arc: deg(30), width: 9 });
      orientArc(rs, v3(0, 0, 1), v3(1, -0.5, 0));
      rs.scale.y = len * 0.45 / 9;
      grp.add(rs);
    }
    addPockets(grp, feats, main, hwm, {
      front: (make, i) => {
        const g = make.arc(r + lift, Math.min(len * 0.32, 180), deg(68));
        orientArc(g, v3(0, 0, 1), v3(1, -0.1, 0));
        g.position.z = (i % 2 === 0 ? -1 : 1) * len * 0.22;
        grp.add(g);
      },
    });
    patch(grp, brand, r + 2.5, vr.j(r * 0.1), vr.j(len * 0.05), 70, 0).rotation.set(0, Math.PI / 2, 0);
    grp.position.set(mount.x, mount.y, 0);
    grp.userData.halfLen = len / 2;
    grp.userData.radius = r;
    return shadowify(grp);
  }
  const w = Math.min(p.mm.len, 400), h = Math.min(p.mm.hgt, 300), d = Math.min(p.mm.wid, 260);
  const body = soft(new RoundedBoxGeometry(d, h, w, 7, Math.min(20, d * 0.3)), main, {
    amp: vr.range(2.2, 3.2), freq: vr.range(0.026, 0.034), seed: vr.seed % 977,
    bulge: boxBulge(d / 2, h / 2, w / 2, Math.min(d, h, w) * vr.range(0.08, 0.13)),
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.45,
  });
  grp.add(body);
  const closure = feats.closure || 'flap';
  if (closure === 'flap') {
    // params are NOT pre-swapped: the rotation below already maps the lid's
    // local X (width) across the bike and its Z (depth) fore-aft. Swapping here
    // too made the lid a shelf as deep as the bag is wide.
    const fl = flapLid(accent, wm, hwm, { w: w * 0.99, d: d * 0.99, drop: h * 0.42 });
    fl.rotation.y = Math.PI / 2;
    fl.position.y = h / 2 + 2;
    grp.add(fl);
  } else if (closure === 'zip') {
    const lid = new THREE.Mesh(new RoundedBoxGeometry(d * 0.94, 18, w * 1.02, 4, 9), accent);
    lid.position.y = h / 2 - 4;
    grp.add(lid);
    grp.add(zipperRun(v3(d / 2 + 1, h / 2 - 12, -w * 0.44), v3(d / 2 + 1, h / 2 - 12, w * 0.44), hwm, { accentMat: accent }));
  } else if (closure === 'rolltop') {
    const cap = rollTop(main, hwm, { r: Math.min(d, w) * 0.4, depth: 9 });
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = h / 2 - 2;
    grp.add(cap);
  } else {
    const lid = new THREE.Mesh(new RoundedBoxGeometry(d * 0.94, 18, w * 1.02, 4, 9), accent);
    lid.position.y = h / 2 - 4;
    grp.add(lid);
  }
  // horizontal panel seam a third of the way up
  const seam = seamStrip(main, d + 2.4, 2.6, w * 0.97);
  seam.position.y = -h / 6 + vr.j(h * 0.05);
  grp.add(seam);
  const nStraps = feats.compressionStraps ?? 2;
  for (let i = 0; i < nStraps; i++) {
    const f = nStraps === 1 ? 0 : (i / (nStraps - 1) - 0.5) * 2;
    webbingRun(grp, wm, hwm, {
      from: v3(d / 2, h * 0.42, f * w * 0.3), to: v3(d / 2, -h * 0.46, f * w * 0.3),
      width: 22, normal: 'x', proud: 1.0,
    });
  }
  if (feats.cord) {
    const lat = bungeeLattice(hwm, { w: w * 0.8, h: h * 0.6, n: 3 });
    lat.rotation.y = Math.PI / 2;
    lat.position.x = d / 2 + 2;
    grp.add(lat);
  }
  if (feats.reflective) {
    const rs = reflectiveStrip(w * 0.62, 10);
    rs.rotation.y = Math.PI / 2;
    rs.position.set(d / 2 + 2, -h * 0.34, 0);
    grp.add(rs);
  }
  if (feats.daisyChains) {
    const dcn = daisyChain(wm, { len: w * 0.7, rows: 2, band: Math.min(h * 0.16, 16) });
    dcn.rotation.y = Math.PI / 2;
    dcn.rotation.z = Math.PI / 2;
    dcn.position.set(d / 2 + 2, h * 0.1, 0);
    grp.add(dcn);
  }
  addPockets(grp, feats, main, hwm, {
    front: (make, i) => {
      const g = make(Math.min(w * 0.5, 170), h * 0.5);
      g.position.set(d / 2 + 1, -h * 0.08 - i * 4, 0);
      g.rotation.y = Math.PI / 2;
    },
    side: (make, i) => {
      const s2 = i % 2 === 0 ? 1 : -1;
      const g = make(Math.min(d * 0.7, 120), h * 0.5);
      g.position.set(0, -h * 0.05, s2 * (w / 2 + 1));
      if (s2 < 0) g.rotation.y = Math.PI;
    },
    top: (make) => {
      const g = make(Math.min(w * 0.5, 150), Math.min(d * 0.7, 120));
      g.position.set(0, h / 2 + 1, 0);
      g.rotation.x = -Math.PI / 2;
    },
  });
  patch(grp, brand, d / 2 + 1.6, h * 0.12 + vr.j(h * 0.06), vr.j(w * 0.08), 76, 0).rotation.set(0, Math.PI / 2, 0);
  const P = ctx.points;
  const bc = P.barCenter, anchor = ctx.anchors.barroll.position;
  // a deep bag would otherwise hang into the front wheel: ride it high enough
  // that its underside clears the tyre at the bag's forwardmost point
  const wheelR = P.tireR + ctx.geo.tireWidth / 2;
  const dx = Math.abs(bc.x + 18 + d - P.frontAxle.x);
  const wheelTop = P.frontAxle.y + (dx < wheelR ? Math.sqrt(wheelR * wheelR - dx * dx) : 0);
  const bottomY = Math.max(wheelTop + 24, bc.y - h + 14);
  grp.position.set(bc.x + 18 + d / 2 - anchor.x, bottomY + h / 2 - anchor.y, 0);
  return shadowify(grp);
}
