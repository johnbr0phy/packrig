// Under-saddle bag builder (mm-local, parented to the seatpack anchor).
//
// AXIS MAPPING — per product, not per slot. This is the whole point of the
// rewrite. `mount.axes` in the model records states which world direction each
// catalogue axis points, and 25 of the 44 products in this slot say `len` runs
// FORE-AFT while the other 11 say it runs ACROSS the bike. The builder used to
// hard-code "len is across", which is the same 90-degree transposition
// BUILDER-BRIEF Rule 2 lists as the `buildSaddlebag` suitcase bug — fixed once
// in the across direction and thereby broken for everything that disagreed.
// It also silently undid NEXT-RUN §11: the Carradice axis work concluded that
// the Nelson and Barley are deep fore-aft and the Camper and SQR Slim are wide
// across, wrote that into the records, and then no builder read it.
//
//   x  fore-aft, +x toward the front wheel        `deep`   across the bike is z
//   y  up                                         `h`
//   z  across the bike                            `across`
//
// Everything positional derives from ctx.points.sd / seatTop (the seatpost line)
// and ctx.rails, never from a literal offset.
//
// TWO FAMILIES, one slot. `geometry.form` decides which:
//   saddlebag_flap / box / slab / cylinder / halfmoon → a boxy bag with a flap
//     (Carradice Nelson, Brooks Challenge, Atelier Bivouac)
//   tapered_wedge / teardrop → a small seat pack: deep under the saddle,
//     tapering to a rolled or zipped tail (Revelate Shrew, Ortlieb Saddle-Bag,
//     Topeak Wedge DryBag). 24 of the 44 are these, and every one of them was
//     being drawn as a rounded box with a flap glued to its back.

import * as THREE from 'three';
import { v3, deg } from '../../lib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boxBulge } from '../deform.js';
import { zipperRun } from '../features.js';
import { rollTop, seamCurve, seamStrip, strapAssembly, taperAndFlatten, widAt, wrapStrap } from '../hardware.js';
import { axesOf, geomOf, stiffnessOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';

const WEDGE_FORMS = new Set(['tapered_wedge', 'teardrop']);

export function buildSaddlebag(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const geom = geomOf(p);
  const axes = axesOf(p);
  // soft | semi | rigid, from the model records — see stiffnessOf().
  const stiff = stiffnessOf(p);
  const wedge = WEDGE_FORMS.has(geom.form);
  const closure = p.closure?.type || null;

  // Where `mount.axes` is silent (8 of 44), fall back on the form rather than on
  // a slot-wide assumption: a bag whose own record calls it a tapered wedge
  // tapers along the bike, and a boxy saddlebag keeps the previous mapping so
  // nothing that was already right moves.
  const lenForeAft = axes.len ? axes.isForeAft('len') : wedge;
  const deep = lenForeAft ? Math.min(p.mm.len, 380) : Math.min(p.mm.wid, 220);
  const across = lenForeAft ? Math.min(p.mm.wid, 260) : Math.min(p.mm.len, 380);
  const h = Math.min(p.mm.hgt, 220);

  const wm = webbing();
  const hwm = hardware();

  if (wedge) {
    buildWedgeBody(grp, { deep, across, h, geom, vr, main, accent, wm, hwm, stiff, closure });
  } else {
    buildBoxBody(grp, { deep, across, h, vr, main, accent, wm, hwm, stiff, closure });
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
    const toLocal = (pFrame) => pFrame.clone().sub(ctx.anchors.seatpack.position).sub(grp.position)
      .applyAxisAngle(v3(0, 0, 1), -grp.rotation.z);
    for (const side of [1, -1]) {
      const bar = side > 0 ? ctx.rails.right : ctx.rails.left;
      const railPt = toLocal(bar[0].clone().lerp(bar[1], 0.55));
      // On a wedge the rail webbing leaves the DEEP end, which is the end under
      // the saddle, not the middle of the bag — anchoring it at the centre on a
      // bag that tapers away left the strap running out into free air.
      const anchorX = wedge ? deep * 0.22 : -deep * 0.04;
      const from = v3(anchorX, h / 2 - 4, side * across * 0.32);
      const to = v3(railPt.x, railPt.y, side * ctx.rails.z);
      grp.add(wrapStrap(wm, hwm, { from, to, tubeR: ctx.rails.r, width: 14 }));
    }
  }
  return shadowify(grp);
}

/**
 * The classic flap saddlebag: a rounded box, wide across the bike, with its
 * flap and buckles facing rearward. Unchanged behaviour except that the flap is
 * no longer glued onto bags that do not have one — an Outer Shell Rolltop
 * Saddlebag was getting a Carradice flap.
 */
function buildBoxBody(grp, { deep, across, h, vr, main, accent, wm, hwm, stiff, closure }) {
  const body = soft(new RoundedBoxGeometry(deep, h, across, 8, Math.min(18, deep * 0.28)), main, {
    amp: vr.range(1.6, 2.3), freq: vr.range(0.042, 0.054), seed: vr.seed % 907,
    stiffness: stiff,
    bulge: boxBulge(deep / 2, h / 2, across / 2, Math.min(deep, h, across) * vr.range(0.09, 0.13)),
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.5,
  });
  grp.add(body);
  if (!closure || closure.startsWith('flap') || closure === 'hook_and_loop_flap' || closure === 'magnetic') {
    const flap = new THREE.Mesh(new RoundedBoxGeometry(20, h * 0.9, across * 1.03, 4, 8), accent);
    flap.position.x = -deep / 2 + 6;
    grp.add(flap);
  } else if (closure.startsWith('zip')) {
    grp.add(zipperRun(v3(-deep / 2 + 4, h / 2 - 3, -across * 0.44), v3(-deep / 2 + 4, h / 2 - 3, across * 0.44), hwm, {}));
  }
  for (const s of [1, -1]) {
    const sm = seamStrip(main, deep * 0.9, 2.2, 2.0);
    sm.position.set(2, -h / 6, s * (across / 2 + 1.4));
    grp.add(sm);
  }
  // two vertical compression straps over the top, spread along the width
  for (const f of [-0.26, 0.26]) {
    const st = strapAssembly(wm, hwm, { r: Math.max(h, deep) * 0.52, width: 16, angle: -Math.PI / 2 });
    st.position.z = f * across;
    st.scale.set(1, h / Math.max(h, deep), 1);
    grp.add(st);
  }
}

/**
 * The small seat pack: deep and rounded at the end under the saddle, tapering
 * back and down to a rolled tail, with a curved underside. Built as a lathe
 * running toward −x and flattened in plan by the measured taper, the same
 * construction `seatpack.js` uses — these are the same object at a different
 * scale.
 *
 * `taperNarrowEnd` decides which end is pinched. Reviewers genuinely disagree:
 * Revelate's Shrew is written nose 1.0 → tail 0.45 and Ortlieb's Saddle-Bag
 * nose 0.45 → tail 1.0, and both are describing a bag that is fat at one end.
 */
function buildWedgeBody(grp, { deep, across, h, geom, vr, main, accent, wm, hwm, stiff, closure }) {
  const narrowAtTail = geom.taperNarrowEnd !== 'nose';
  // 0.22 floor: below it the lathe pinches to a knife edge with no room for the
  // roll or the zip that has to terminate there.
  const ratio = Math.min(Math.max(geom.taperRatio ?? vr.range(0.42, 0.58), 0.22), 1);
  const rBig = h / 2;
  const rSmall = rBig * ratio;
  // A squared shoulder holds its depth further back before falling away.
  const shoulder = geom.shoulder === 'squared' ? 0.84 : 0.68;

  const rolled = closure === 'rolltop';
  // A roll closure is not a taper to a point: the body STOPS where the mouth is
  // and the folds take over. Running the lathe to t=1 drew a spike with the roll
  // as a nub on the end of it — the same mistake seatpack.js documents.
  const bodyEnd = rolled ? 0.9 : 1;

  // t = 0 at the FRONT of the bike (under the saddle), 1 at the rear.
  // u = 0 at the fat end, 1 at the pinched end.
  const profileR = (t) => {
    const u = narrowAtTail ? t : 1 - t;
    const k = Math.min(u / shoulder, 1);
    // Exponent > 1 holds the depth through the fat third before it falls away.
    // A linear ramp drew a megaphone: these bags have a belly, not a cone.
    const curve = geom.profile === 'convex' ? 2.1 : geom.profile === 'concave' ? 0.9 : 1.45;
    let r = rBig - (rBig - rSmall) * k ** curve;
    // Past the shoulder a zipped or drawcorded bag closes over; a rolled one
    // does not — it keeps its section right up to the mouth.
    if (!rolled && u > shoulder) {
      r *= Math.sqrt(Math.max(0, 1 - 0.82 * ((u - shoulder) / (1 - shoulder)) ** 2));
    }
    // round the front over so the lathe closes instead of ending on a flat disc
    const e = Math.min(t / 0.10, rolled ? 1 : (1 - t) / 0.10, 1);
    return Math.max(r * Math.sqrt(Math.max(0, 2 * e - e * e)), 0.5);
  };

  const N = 30;
  const pts = [new THREE.Vector2(0.5, 0)];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * bodyEnd;
    pts.push(new THREE.Vector2(profileR(t), t * deep));
  }
  pts.push(new THREE.Vector2(0.5, bodyEnd * deep));

  // taperAndFlatten only ever narrows toward its +y end, which becomes the tail
  // here. A record that pinches the NOSE instead keeps a constant plan width
  // rather than being drawn inverted — same call seatpack.js makes.
  const tailWid = narrowAtTail ? ratio : 1;
  const geo = taperAndFlatten(new THREE.LatheGeometry(pts, 36), {
    len: deep, shoulder, tailWid, squash: rolled ? 0.3 : 1,
  });
  const bodyAmp = vr.range(1.8, 2.6);
  const lift = bodyAmp + 1.5;
  const widScale = Math.min(across / Math.max(h, 1), 1.4);
  const lathe = soft(geo, main, {
    amp: bodyAmp, freq: vr.range(0.03, 0.042), seed: vr.seed % 907,
    stiffness: stiff,
    aoDir: new THREE.Vector3(-1, 0, 0), aoK: 0.8, aoSpan: 0.5,
  });
  // Lathe axis is local +y. Rotate it onto −x, exactly as seatpack.js does, so
  // t grows toward the REAR of the bike: t=0 (the fat end) ends up under the
  // saddle and the pinched tail runs back over the wheel. Rotating it onto +x
  // instead — which this did first — builds the bag inside out, fat end aft and
  // a cone pointing at the seatpost.
  lathe.rotation.z = Math.PI / 2;
  const body = new THREE.Group();
  body.add(lathe);
  // longitudinal seams down each flank, following the taper
  for (const s of [1, -1]) {
    const sp = [];
    for (let i = 1; i <= 12; i++) {
      const t = (i / 13) * bodyEnd;
      sp.push(v3(-t * deep, 0, s * (profileR(t) * widAt(t, tailWid) + 0.6)));
    }
    body.add(seamCurve(main, sp, 1.2));
  }
  body.scale.z = widScale;
  // t=0 sits at local x=0 and t=1 at x=−deep, so shift forward to centre the
  // bag on the group origin and leave the placement code below untouched.
  body.position.x = deep / 2;
  grp.add(body);

  // Closure, at the pinched end.
  const tEnd = narrowAtTail ? bodyEnd : 0;
  if (rolled) {
    // taperAndFlatten has pinched the mouth into a lip, so a flattened round
    // mouth is WIDER than the tube — size the fold stack from the body's own
    // half-width at that station, not from the tapered radius.
    const cap = rollTop(main, hwm, {
      r: profileR(tEnd), depth: 13,
      widthScale: widScale * widAt(tEnd, tailWid) * 1.4,
    });
    cap.rotation.y = narrowAtTail ? -Math.PI / 2 : Math.PI / 2;
    cap.position.x = -tEnd * deep;
    body.add(cap);
  } else if (closure && closure.startsWith('zip')) {
    // a wedge saddlebag zips along its top ridge, not across a face
    body.add(zipperRun(
      v3(-deep * 0.1, profileR(0.1) + lift * 0.4, 0),
      v3(-deep * 0.9, profileR(0.9) + lift * 0.4, 0), hwm, { accentMat: accent }));
  }

  // The single girth compression strap these bags all carry — Revelate's is the
  // red cam strap in every Shrew photo. Sits at the fat end's shoulder, where
  // there is body for it to bite, not slung round the pinched tail.
  const tGirth = narrowAtTail ? 0.34 : 0.66;
  const st = strapAssembly(wm, hwm, {
    r: profileR(tGirth) + lift, width: 18,
    ellipse: widScale * widAt(tGirth, tailWid), angle: deg(-20),
  });
  st.rotation.y = Math.PI / 2;
  st.position.x = -tGirth * deep;
  body.add(st);
}
