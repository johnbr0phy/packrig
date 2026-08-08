// Top tube bag builders (mm-local). buildToptubeRear is buildToptube placed
// under the tube at the seat end, so both live here.

import * as THREE from 'three';
import { v3, tubeBetween } from '../../lib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boxBulge } from '../deform.js';
import { seamStrip } from '../hardware.js';
import { featuresOf, stiffnessOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';

/**
 * Rear top-tube sack: same construction, but it hangs UNDER the tube at the
 * seat end rather than sitting on top of it by the stem.
 */
export function buildToptubeRear(p, brand, main, accent, ctx, side) {
  const grp = buildToptube(p, brand, main, accent, ctx, side, 'toptubeRear');
  const h = Math.min(p.mm.hgt, 220);
  grp.position.y -= h + 26;   // below the tube, not perched on it
  return grp;
}

// NOTE: the builder call signature is (product, brand, main, accent, ctx, side) —
// anchorName must come AFTER `side`, or it receives the side integer and the
// anchor lookup silently becomes ctx.anchors[1].
export function buildToptube(p, brand, main, accent, ctx, side, anchorName = 'toptube') {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  // soft | semi | rigid, from the model records — see stiffnessOf().
  const stiff = stiffnessOf(p);
  const len = Math.min(p.mm.len, 460), h = Math.min(p.mm.hgt, 220), w = Math.min(p.mm.wid, 170);
  const P = ctx.points;
  const anchor = ctx.anchors[anchorName].position;
  const hd = v3(P.hd.x, P.hd.y, 0);
  const ttSeat = P.seatTop.clone().addScaledVector(v3(P.sd.x, P.sd.y, 0), -12);
  const ttHead = P.headTop.clone().addScaledVector(hd, 30);
  const ang = Math.atan2(ttHead.y - ttSeat.y, ttHead.x - ttSeat.x);
  const slope = (ttHead.y - ttSeat.y) / (ttHead.x - ttSeat.x);
  const ttR = Math.min(Math.max(anchor.y - ttHead.y, 10), 26); // anchor sits on the tube crown
  const EMBED = 10;
  // With the base plane parallel to the tube, the tube centreline stays at a
  // constant height in bag space — so the underside can be a fixed channel.
  const tubeY = EMBED - ttR;
  const chanR = Math.min(ttR + 2, w / 2 - 3);
  const corner = Math.min(w * 0.22, h * 0.3, 12); // keep the base broad and flat
  const bulge = boxBulge(len / 2, h / 2, w / 2, Math.min(len, h, w) * 0.09);
  // Tailfin's own copy: "specially sculpted 3D welded shapes eliminate knee
  // rub". These bags are full height at the seat-tube end and taper to a slim
  // nose at the stem, narrowing in plan too. A constant-section box reads as a
  // pencil case strapped on top.
  const NOSE_H = 0.46, NOSE_W = 0.62;        // fraction of full size at the nose
  // t = 0 at the geometry's -x end, 1 at its +x end. The nose (slim end) is the
  // -x end, which is the one that points forward once the group is placed.
  const hFactor = (t) => 1 + (NOSE_H - 1) * (1 - t) ** 1.35;
  const wFactor = (t) => 1 + (NOSE_W - 1) * (1 - t) ** 1.35;
  /** Body height at a group-local x, so trim can follow the taper. */
  const hAtLocal = (x) => {
    const t = Math.min(Math.max((x - (-len / 2 + 10)) / len + 0.5, 0), 1);
    return h * hFactor(t);
  };
  const shapedBox = (() => {
    const g = new RoundedBoxGeometry(len, h, w, 8, corner);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(Math.max(pos.getX(i) / len + 0.5, 0), 1);
      // scale about the BASE, not the centre — scaling about the centre lifts
      // the underside as it lowers the crown, floating the bag off the tube
      pos.setY(i, -h / 2 + (pos.getY(i) + h / 2) * hFactor(t));
      pos.setZ(i, pos.getZ(i) * wFactor(t));
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    // Hollow the underside so the top tube nests into it instead of the bag
    // hovering on the tube's crown.
    //
    // This is carved into the geometry, NOT passed as a `bulge` to soft(),
    // which is where it used to live. The channel is placement, not padding:
    // without it the bag sits EMBED (10mm) deep in the tube, which the
    // clearance audit reads as penetration. A `bulge` is part of the
    // soft-goods pass, and that pass is now skipped entirely for products the
    // model records call rigid — Topeak's faceted DryShell, VAUDE's Trailtop,
    // EVOC's and Lezyne's structured boxes, Cedaero's Tank Top, all of them
    // top tube bags. Those five would have lost their channel and sat on the
    // tube. Rigid means "does not pillow", never "does not fit the bike".
    const nor = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      if (nor.getY(i) > -0.6) continue;
      const s = chanR * chanR - pos.getZ(i) ** 2;
      if (s > 0) pos.setY(i, pos.getY(i) + Math.max(tubeY + Math.sqrt(s), 0));
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  })();
  const body = soft(shapedBox, main, {
    amp: vr.range(1.7, 2.5), freq: vr.range(0.034, 0.046), seed: vr.seed % 937,
    stiffness: stiff,
    bulge,
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.45,
  });
  body.position.set(-len / 2 + 10, h / 2, 0);
  grp.add(body);
  // the zip must ride the tapered crown, or it juts out past the thin end
  const zip = tubeBetween(
    v3(-len + 24, hAtLocal(-len + 24) - 3, 0),
    v3(-2, hAtLocal(-2) - 3, 0), 2, 2, hardware(), 8);
  grp.add(zip);
  // side panel seams
  for (const s of [1, -1]) {
    const sm = seamStrip(main, len * 0.92, 2.4, 2.2);
    sm.position.set(-len / 2 + 10, h * 0.34, s * (w / 2 + 1.6));
    grp.add(sm);
  }
  const wm = webbing();
  const hwm = hardware();
  // velcro wraps that close around the tube; their upper arc hides inside the bag
  for (const t of [0.14, 0.5, 0.86]) {
    const px = 10 - len * t;
    const wrap = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(ttR + 3, 1.9, 6, 28), wm);
    band.scale.z = 6;
    wrap.add(band);
    const tab = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 24), hwm);
    tab.position.set(0, -(ttR + 5), 0);
    wrap.add(tab);
    wrap.rotation.y = Math.PI / 2;
    wrap.position.set(px, tubeY, 0);
    wrap.traverse((o) => { o.userData.noCollide = true; });
    grp.add(wrap);
  }
  // front anchor strap around the head tube — repositioned after collision
  // resolution so it keeps reaching the tube if the bag gets nudged back
  const ring = new THREE.Mesh(new THREE.TorusGeometry(28, 2.1, 6, 28), wm);
  ring.scale.z = 4;
  ring.userData.noCollide = true;
  grp.add(ring);
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(1, 4.5, 22).translate(0.5, 0, 0), wm);
  tongue.userData.noCollide = true;
  grp.add(tongue);
  const target = P.headTop.clone().addScaledVector(hd, 34);
  grp.userData.reseat = (toLocal, toLocalDir) => {
    const lp = toLocal(target);
    ring.position.copy(lp);
    ring.quaternion.setFromUnitVectors(v3(0, 0, 1), toLocalDir(hd).normalize());
    const from = v3(6, h * 0.12, 0);
    const d = lp.clone().sub(from);
    tongue.position.copy(from);
    tongue.rotation.z = Math.atan2(d.y, d.x);
    tongue.scale.x = Math.max(d.length() - 4, 2);
  };
  patch(grp, brand, -len / 2, h * 0.55, w / 2 + 1.6, Math.min(70, len * 0.6), 0);
  patch(grp, brand, -len / 2, h * 0.55, -(w / 2 + 1.6), Math.min(70, len * 0.6), Math.PI);
  grp.rotation.z = ang;
  const originX = P.headTop.x - 38;
  const crownY = ttHead.y + (originX - ttHead.x) * slope + ttR;
  grp.position.set(originX - anchor.x, crownY - EMBED - anchor.y, 0);
  grp.userData.bodyLen = len;
  return shadowify(grp);
}
