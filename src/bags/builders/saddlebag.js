// Classic saddlebag builder (mm-local, parented to the seatpack anchor).

import * as THREE from 'three';
import { v3, deg } from '../../lib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boxBulge } from '../deform.js';
import { seamStrip, strapAssembly, wrapStrap } from '../hardware.js';
import { featuresOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';

export function buildSaddlebag(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  // A classic saddlebag (Carradice Barley, Restrap Adventure) is WIDE ACROSS the
  // bike and shallow fore-aft, with its flap and buckles facing rearward. The
  // catalogue's `len` is that across-bike width, not the depth — mapping it to
  // X made the bag project backwards like a suitcase, 90 degrees out.
  const across = Math.min(p.mm.len, 380);          // long axis, across the bike (Z)
  const h = Math.min(p.mm.hgt, 220);
  const deep = Math.min(p.mm.wid, 220);            // fore-aft (X)
  const body = soft(new RoundedBoxGeometry(deep, h, across, 8, Math.min(18, deep * 0.28)), main, {
    amp: vr.range(1.6, 2.3), freq: vr.range(0.042, 0.054), seed: vr.seed % 907,
    bulge: boxBulge(deep / 2, h / 2, across / 2, Math.min(deep, h, across) * vr.range(0.09, 0.13)),
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.5,
  });
  grp.add(body);
  // flap closes over the REAR face
  const flap = new THREE.Mesh(new RoundedBoxGeometry(20, h * 0.9, across * 1.03, 4, 8), accent);
  flap.position.x = -deep / 2 + 6;
  grp.add(flap);
  for (const s of [1, -1]) {
    const sm = seamStrip(main, deep * 0.9, 2.2, 2.0);
    sm.position.set(2, -h / 6, s * (across / 2 + 1.4));
    grp.add(sm);
  }
  const wm = webbing();
  const hwm = hardware();
  // two vertical compression straps over the top, spread along the width
  for (const f of [-0.26, 0.26]) {
    const st = strapAssembly(wm, hwm, { r: Math.max(h, deep) * 0.52, width: 16, angle: -Math.PI / 2 });
    st.position.z = f * across;
    st.scale.set(1, h / Math.max(h, deep), 1);
    grp.add(st);
  }
  patch(grp, brand, -deep / 2 - 2, 0, 0, 56, -Math.PI / 2);
  grp.rotation.z = deg(-8);
  // A saddlebag hangs BEHIND the seatpost. The old fixed +30 offset took no
  // account of where the post actually is, so the post ran straight through
  // the bag. Seat the bag's front face just aft of the post instead.
  const sd = ctx?.points?.sd;
  const anchorPos = ctx?.anchors?.seatpack?.position;
  let frontX = 30 + deep / 2;
  if (sd && anchorPos && ctx.points.seatTop) {
    const postR = (ctx.geo?.seatpostDia || 27.2) / 2;
    const yFrame = anchorPos.y + 4 - h / 2;
    const postX = ctx.points.seatTop.x + sd.x * ((yFrame - ctx.points.seatTop.y) / sd.y);
    frontX = Math.min(frontX, postX - anchorPos.x - postR - 6);
  }
  grp.position.x = frontX - deep / 2;
  grp.position.y = 4 - h / 2; // hang clear beneath the saddle rails
  grp.userData.noseX = 30 + deep / 2;

  // A saddlebag hangs from the saddle RAILS. The compression strap above only
  // wraps the bag, so nothing connected it to the bike — it read as a box
  // floating under the saddle. Run a strap up each side onto the real rail.
  if (ctx?.rails && ctx.anchors?.seatpack) {
    const anchorPos = ctx.anchors.seatpack.position;
    const toLocal = (pFrame) => pFrame.clone().sub(anchorPos).sub(grp.position)
      .applyAxisAngle(v3(0, 0, 1), -grp.rotation.z);
    for (const side of [1, -1]) {
      const bar = side > 0 ? ctx.rails.right : ctx.rails.left;
      const railPt = toLocal(bar[0].clone().lerp(bar[1], 0.55));
      const from = v3(-deep * 0.04, h / 2 - 4, side * across * 0.32);
      const to = v3(railPt.x, railPt.y, side * ctx.rails.z);
      grp.add(wrapStrap(wm, hwm, { from, to, tubeR: ctx.rails.r, width: 14 }));
    }
  }
  return shadowify(grp);
}
