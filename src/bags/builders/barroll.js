// Handlebar roll builder (mm-local, parented to the barroll anchor).

import * as THREE from 'three';
import { v3, deg } from '../../lib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { addPockets, bungeeArc, drawcordEnd, harnessCradle, orientArc, reflectiveArc } from '../features.js';
import { rollTop, seamRing, strapAssembly } from '../hardware.js';
import { featuresOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';
import { barMount } from '../mount.js';

export function buildBarroll(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const r = Math.min(p.mm.dia, 260) / 2;
  const mount = barMount(ctx, r);
  const len = Math.min(p.mm.len, mount.maxHalfLen * 2);
  const shape = feats.shape || 'cylindrical';
  const endFlat = vr.range(0.06, 0.1);
  // stuffed roll: cylinder body with gently domed (not spherical) ends
  const prof = [];
  const NP = 28;
  for (let i = 0; i <= NP; i++) {
    const t = i / NP;
    const dome = Math.min(t, 1 - t) / endFlat; // ends flatten quickly (rolled closure)
    let rr = r * (dome >= 1 ? 1 : 0.55 + 0.45 * Math.sqrt(1 - (1 - dome) ** 2));
    if (shape === 'barrel') rr *= 0.9 + 0.1 * Math.sin(t * Math.PI) * 2.2;   // fat waist
    else if (shape === 'tapered') rr *= 1 - 0.16 * t;                         // one end slimmer
    prof.push(new THREE.Vector2(Math.max(Math.min(rr, r * 1.12), 3), (t - 0.5) * len));
  }
  // The profile opens at 0.55r, and a lathe does not cap its ends — so the bag
  // was a tube you could see straight through. Close both mouths.
  prof.unshift(new THREE.Vector2(0.4, -len / 2));
  prof.push(new THREE.Vector2(0.4, len / 2));
  // lathe axis local +y → rotated to +z, so world "down" is local +z
  const bodyAmp = vr.range(2.8, 4.0);
  const lift = bodyAmp + 1.5;
  const body = soft(new THREE.LatheGeometry(prof, 40), main, {
    amp: bodyAmp, freq: vr.range(0.022, 0.032), seed: vr.seed % 991,
    aoDir: new THREE.Vector3(0, 0, 1), aoK: 0.8, aoSpan: 0.5,
  });
  body.rotation.x = Math.PI / 2; // axis along Z
  grp.add(body);
  const wm = webbing();
  const hwm = hardware();
  const closure = feats.closure || 'rolltop';
  for (const s of [1, -1]) {
    if (closure === 'drawcord') {
      const dc = drawcordEnd(main, hwm, { r: r * 0.8, depth: 11 });
      dc.position.z = s * (len / 2 - 2);
      if (s < 0) dc.rotation.y = Math.PI;
      grp.add(dc);
    } else if (closure !== 'harness') {
      // Apidura's roll-down ends: the lip spans nearly the pack's full width.
      // At r*0.72 with no width scale it read as a porthole in a flat disc.
      const cap = rollTop(main, hwm, { r: r * 0.86, depth: 9, widthScale: 1.28, back: false });
      cap.position.z = s * (len / 2 - 3);
      if (s < 0) cap.rotation.y = Math.PI;
      grp.add(cap);
    }
    // seam ring just inboard of each end
    const sr = seamRing(main, r * 0.985, 1.3);
    sr.position.z = s * (len / 2 - Math.min(34, len * 0.1));
    grp.add(sr);
    // Mount. Apidura's Expedition pack rides on two BarSpace spacer modules
    // that hold the pack off the bar, with a stability cord round bar and stem.
    // A thin angled slab bridging nothing was why the roll looked levitated.
    const zAt = s * Math.min(78, len * 0.32);
    const standoff = new THREE.Mesh(new RoundedBoxGeometry(mount.gap + 10, 26, 30, 3, 4), hwm);
    standoff.position.set(-r - mount.gap / 2 + 4, -r * 0.15, zAt);
    standoff.userData.noCollide = true;
    grp.add(standoff);
    // webbing wrapping the bar itself, just behind the standoff. The bar runs
    // along Z, so the torus keeps its default +Z axis — rotating it to X laid
    // the strap across the pack's end face instead of round the bar.
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(mount.barR + 5, 2.6, 6, 20), wm);
    wrap.scale.z = 3.4;
    wrap.position.set(-r - mount.gap - mount.barR + 2, -r * 0.15, zAt);
    wrap.userData.noCollide = true;
    grp.add(wrap);
  }
  if (closure === 'harness') {
    grp.add(harnessCradle(wm, { r, len }));
  } else {
    const nStraps = feats.compressionStraps ?? 2;
    for (let i = 0; i < nStraps; i++) {
      const f = nStraps === 1 ? 0 : (i / (nStraps - 1) - 0.5) * 2;
      const st = strapAssembly(wm, hwm, { r, width: 22, angle: -Math.PI / 2 });
      st.position.z = f * len * vr.range(0.24, 0.3);
      grp.add(st);
    }
  }
  if (feats.cord) {
    const lat = bungeeArc(hwm, { R: r + lift, arc: deg(72), len: len * 0.6, n: 4 });
    orientArc(lat, v3(0, 0, 1), v3(1, 0, 0));
    grp.add(lat);
  }
  if (feats.reflective) {
    // "Reflective graphics" — a pair of short marks near each end, not one
    // white panel down half the pack. scale.y = len*0.5/9 made a billboard.
    for (const s of [1, -1]) {
      const rs = reflectiveArc({ R: r + lift, arc: deg(26), width: 9 });
      orientArc(rs, v3(0, 0, 1), v3(1, -0.5, 0));
      rs.scale.y = Math.min(len * 0.13, 60) / 9;
      rs.position.z = s * len * 0.3;
      grp.add(rs);
    }
  }
  addPockets(grp, feats, main, hwm, {
    front: (make, i) => {
      const g = make.arc(r + lift, Math.min(len * 0.34, 200), deg(70));
      orientArc(g, v3(0, 0, 1), v3(1, -0.15, 0));
      g.position.z = (i % 2 === 0 ? -1 : 1) * len * 0.24;
      grp.add(g);
    },
    side: (make, i) => {
      const g = make.arc(r + lift, Math.min(len * 0.3, 180), deg(62));
      orientArc(g, v3(0, 0, 1), v3(1, 0.5, 0));
      g.position.z = (i % 2 === 0 ? -1 : 1) * len * 0.22;
      grp.add(g);
    },
  });
  patch(grp, brand, r + 2.5, vr.j(r * 0.12), vr.j(len * 0.06), 92, 0).rotation.set(0, Math.PI / 2, 0);
  grp.position.set(mount.x, mount.y, 0);
  grp.userData.halfLen = len / 2;
  grp.userData.radius = r;
  return shadowify(grp);
}
