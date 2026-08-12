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
import { rollTop, seamCurve, seamStrip, strapAssembly, wrapStrap } from '../hardware.js';
import { axesOf, featuresOf, geomOf, stiffnessOf, variantOf } from '../identity.js';
import { loftBody, sectionFor } from '../loft.js';
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

  // A GIRTH compression strap is not standard equipment on this slot. Revelate's
  // Shrew has one — the red cam strap in every photo, and where the builder got
  // it — but the Apidura Expedition Tool Pack has no strap round its body at
  // all: its record ENUMERATES its straps, "one Hypalon stability strap on
  // saddle rails + one soft-touch velcro strap on seatpost", and neither is one.
  // On a bag published 4cm wide the strap assembly reached 38mm off the
  // centreline by itself.
  //
  // Silence is not evidence of absence, so 19 of the 24 wedges in this slot —
  // which say nothing about their attachment — keep the strap they had. It is
  // dropped only where the record positively lists its straps and no compression
  // strap is among them.
  const strapText = [p?.features?.attachment, p?.features?.compression, p?.features?.straps]
    .map((s) => (typeof s === 'string' ? s : '')).join(' ').trim();
  const girth = (featuresOf(p).compressionStraps ?? 0) > 0
    || !strapText || /compress|girth|cam strap|cinch strap/i.test(strapText);

  if (wedge) {
    buildWedgeBody(grp, { deep, across, h, geom, vr, brand, main, accent, wm, hwm, stiff, closure, girth, rolls: p.closure?.rolls });
  } else {
    buildBoxBody(grp, { deep, across, h, vr, main, accent, wm, hwm, stiff, closure });
    // The flap and its buckles are the rear face of a boxy saddlebag, so the
    // brand mark goes there. A wedge has a rolled tail at that end and puts its
    // logo on the SIDE panel — buildWedgeBody places its own.
    patch(grp, brand, -deep / 2 - 2, 0, 0, 56, -Math.PI / 2);
  }

  // SAG. A classic flap saddlebag hangs off the loops and droops nose-down; a
  // wedge seat pack does not — it is strapped hard up under the saddle with its
  // top face flat against the base, which is exactly the face buildWedgeBody
  // goes to the trouble of levelling. The Expedition Tool Pack's own record
  // says `mount.sag_deg: 0` and "render it hugging the saddle base, not hanging
  // below it", and the 8 degrees applied to it regardless turned 28cm of length
  // into 39mm of height: measured 139.5mm against a published 80 (+74%), of
  // which the tilt alone is 49 points. It also rotated the nose 4mm forward
  // into the seatpost, which is the -4.1mm seatpost reading in that run.
  //
  // `mount.sag_deg` is in the model records but tools/apply-models.mjs does not
  // carry it into the catalogue, so the form is standing in for it — see the
  // report.
  grp.rotation.z = wedge ? 0 : deg(-8);

  // A saddlebag hangs BEHIND the seatpost. The old fixed +30 offset took no
  // account of where the post actually is, so the post ran straight through
  // the bag. Seat the bag's front face just aft of the post instead.
  const sd = ctx?.points?.sd;
  const anchorPos = ctx?.anchors?.seatpack?.position;
  let frontX = 30 + deep / 2;
  let post = null;
  if (sd && anchorPos && ctx.points.seatTop) {
    const postR = (ctx.geo?.seatpostDia || 27.2) / 2;
    const yFrame = anchorPos.y + 4 - h / 2;
    const postX = ctx.points.seatTop.x + sd.x * ((yFrame - ctx.points.seatTop.y) / sd.y);
    frontX = Math.min(frontX, postX - anchorPos.x - postR - 6);
    post = { x: postX, y: yFrame, r: postR };
  }
  grp.position.x = frontX - deep / 2;
  grp.position.y = 4 - h / 2; // hang clear beneath the saddle rails
  grp.userData.noseX = 30 + deep / 2;

  // A saddlebag hangs from the saddle RAILS. The compression strap above only
  // wraps the bag, so nothing connected it to the bike — it read as a box
  // floating under the saddle. Run a strap up each side onto the real rail.
  const toLocal = (pFrame) => pFrame.clone().sub(ctx.anchors.seatpack.position).sub(grp.position)
    .applyAxisAngle(v3(0, 0, 1), -grp.rotation.z);
  if (ctx?.rails && ctx.anchors?.seatpack) {
    for (const side of [1, -1]) {
      const bar = side > 0 ? ctx.rails.right : ctx.rails.left;
      const railPt = toLocal(bar[0].clone().lerp(bar[1], 0.55));
      // On a wedge the rail webbing leaves the DEEP end, which is the end under
      // the saddle, not the middle of the bag — anchoring it at the centre on a
      // bag that tapers away left the strap running out into free air.
      const anchorX = wedge ? deep * 0.22 : -deep * 0.04;
      const from = v3(anchorX, h / 2 - 4, side * across * 0.32);
      const to = v3(railPt.x, railPt.y, side * ctx.rails.z);
      const st = wrapStrap(wm, hwm, { from, to, tubeR: ctx.rails.r, width: 14 });
      // noCollide: this webbing crosses the gap to the rails and CLOSES ROUND
      // them, so tools/bagshot.mjs measures it both as bag volume it is not and
      // as a -1mm collision with the saddle it is meant to grip. Same rule the
      // frame-bag straps already run under.
      st.userData.noCollide = true;
      grp.add(st);
    }
  }

  // The seatpost strap, where the record names one. The Expedition Tool Pack
  // carries two attachments — "one Hypalon stability strap on saddle rails +
  // one soft-touch velcro strap on seatpost" — and only the rail pair was ever
  // drawn, so the nose end that presses on the post held onto nothing.
  if (post && ctx?.anchors?.seatpack && /seat ?post/i.test(String(p?.features?.attachment || ''))) {
    const at = toLocal(v3(post.x, post.y, 0));
    const dir = v3(sd.x, sd.y, 0).normalize();
    const band = new THREE.Mesh(new THREE.TorusGeometry(post.r + 3.4, 2.8, 6, 24), wm);
    band.quaternion.setFromUnitVectors(v3(0, 0, 1), dir);
    band.scale.z = 5;
    band.position.copy(at);
    band.userData.noCollide = true;
    grp.add(band);
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(at.x - deep / 2) + 6, 16, 4), wm);
    tongue.position.set((at.x + deep / 2) / 2, at.y, 0);
    tongue.userData.noCollide = true;
    grp.add(tongue);
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
 * The small seat pack: deep at the end under the saddle, tapering back and DOWN
 * to a rolled tail, with a flat top face pressed against the saddle base.
 *
 * Built as a LOFT over the recorded cross-section, not as a lathe. The lathe was
 * the fault the Apidura critic named: the Expedition Tool Pack came out "a
 * smooth circular-section cone roughly 9cm in diameter" when dimensions-1 gives
 * 4cm across on an 8cm height — a thin faceted slab, half the width we drew,
 * made of flat panels with a hard pentagonal wedge at the seatpost end. A
 * `crossSection` field has been on every one of these records all along; a solid
 * of revolution can never honour it, and the plan width was being faked
 * afterwards with `body.scale.z`, which squashed the seams and the strap with
 * it. Same construction seatpack.js already uses — these are the same object at
 * a different scale.
 *
 * `taperNarrowEnd` decides which end is pinched. Reviewers genuinely disagree:
 * Revelate's Shrew is written nose 1.0 → tail 0.45 and Ortlieb's Saddle-Bag
 * nose 0.45 → tail 1.0, and both are describing a bag that is fat at one end.
 */
function buildWedgeBody(grp, { deep, across, h, geom, vr, brand, main, accent, wm, hwm, stiff, closure, girth, rolls }) {
  const narrowAtTail = geom.taperNarrowEnd !== 'nose';
  // 0.22 floor: below it the section pinches to a knife edge with no room for
  // the roll or the zip that has to terminate there.
  const ratio = Math.min(Math.max(geom.taperRatio ?? vr.range(0.42, 0.58), 0.22), 1);
  // Drawn inside the published box by the amount soft() then displaces the shell
  // back out along its normals. On a 4cm-wide tool pack that displacement is
  // most of a tenth of the axis, so it cannot be ignored the way it can on a
  // 40cm saddle pack. See the same constant in stembag.js and forkbag.js.
  // 0.8, not the 1.5 the two bar-mounted builders use: measured headless, the
  // loft's own extremes come in about 3mm inside the drawn section here (the
  // noise pulls in as often as it pushes out on a body this slim), so a bigger
  // inset lands the tool pack at -10% rather than -5%.
  const SKIN = 0.8;
  const halfH = Math.max(h / 2 - SKIN, 6);
  const halfW = Math.max(across / 2 - SKIN, 5);
  const squared = geom.shoulder === 'squared';
  // A squared shoulder holds its depth further back before falling away.
  const shoulder = squared ? 0.84 : 0.68;

  const rolled = closure === 'rolltop';
  // A roll closure is not a taper to a point: the body STOPS where the mouth is
  // and the folds take over. Running the body to t=1 drew a spike with the roll
  // as a nub on the end of it — the same mistake seatpack.js documents.
  const bodyEnd = rolled ? 0.9 : 1;
  // The fat end, in t. Everything shaped like an end — the wedge cut, the girth
  // strap, the logo — is measured from here rather than from t=0.
  const fatEnd = narrowAtTail ? 0 : 1;

  // t = 0 at the FRONT of the bike (under the saddle), 1 at the rear.
  // u = 0 at the fat end, 1 at the pinched end.
  const uAt = (t) => (narrowAtTail ? t : 1 - t);
  // Half-HEIGHT at station t.
  const profH = (t) => {
    const u = uAt(t);
    const k = Math.min(u / shoulder, 1);
    // Exponent > 1 holds the depth through the fat third before it falls away.
    // A linear ramp drew a megaphone: these bags have a belly, not a cone.
    const curve = geom.profile === 'convex' ? 2.1 : geom.profile === 'concave' ? 0.9 : 1.45;
    let r = halfH - (halfH - halfH * ratio) * k ** curve;
    // Past the shoulder a zipped or drawcorded bag closes over; a rolled one
    // does not — it keeps its section right up to the mouth.
    if (!rolled && u > shoulder) {
      r *= Math.sqrt(Math.max(0, 1 - 0.82 * ((u - shoulder) / (1 - shoulder)) ** 2));
    }
    return Math.max(r, 0.5);
  };
  // Plan half-WIDTH factor. The old `taperAndFlatten` could only narrow toward
  // its +y end, so a record that pinches the NOSE instead kept a constant plan
  // width; doing it per-station off `u` narrows the right end either way.
  const widF = (t) => {
    const u = uAt(t);
    let w = 1 + (ratio - 1) * u ** 0.85;
    if (rolled && u > shoulder) w *= 1 + 0.18 * ((u - shoulder) / (1 - shoulder));
    return Math.max(w, 0.14);
  };
  // The hard wedge at the mounting end. dimensions-1 on the tool pack shows a
  // vertical end face over roughly the top half, with the underside cut away
  // toward it at about 40° — the "hard pentagonal wedge at the seatpost end"
  // the critic asked for. Only a record that calls its shoulder `squared` gets
  // it; a rounded shoulder keeps its rounded nose.
  const CHAMF = squared ? 0.13 : 0;
  const chamfK = (t) => {
    const d = Math.abs(t - fatEnd);
    return CHAMF && d < CHAMF ? 0.52 + 0.48 * (d / CHAMF) : 1;
  };
  // A rolled mouth collapses in HEIGHT into a lip past the shoulder.
  const squash = rolled ? 0.42 : 1;
  const aRef = profH(fatEnd);
  // Where the taper is taken from. These bags hang from the rails with their
  // top face flat against the saddle base — the record for the tool pack says
  // so in as many words — so a squared bag loses its depth off the UNDERSIDE
  // and keeps a level top. Centring the section instead pulled the top away
  // from the saddle and dropped the tail toward the tyre.
  //
  // 1, not 0.95: at 0.95 the fat end's top edge still climbed 5% of the section
  // above the reference plane, so the "flat" face was a shallow ridge and the
  // bag measured 2mm over its published height before any noise was added. A
  // face that presses on the saddle base is flat or it is not that face.
  const topBias = squared ? 1 : 0.55;
  const sectionAt = (u01) => {
    const t = u01 * bodyEnd;
    let a = profH(t) * chamfK(t);
    if (squash !== 1) {
      const u = uAt(t);
      if (u > shoulder) {
        const k = Math.min((u - shoulder) / (1 - shoulder), 1);
        a *= 1 + (squash - 1) * k * k;
      }
    }
    a = Math.max(a, 0.5);
    return { a, b: Math.max(halfW * widF(t), 0.5), cu: (aRef - a) * topBias };
  };

  const xs = sectionFor(geom.crossSection, 'rounded_rect');
  const loft = loftBody({ len: bodyEnd * deep, rings: 30, shape: xs, sectionAt });
  const bodyAmp = vr.range(1.2, 1.8);   // flat panels have to stay flat
  const lift = bodyAmp + 1.5;
  const shell = soft(loft.geo, main, {
    amp: bodyAmp, freq: vr.range(0.03, 0.042), seed: vr.seed % 907,
    stiffness: stiff,
    aoDir: new THREE.Vector3(-1, 0, 0), aoK: 0.8, aoSpan: 0.5,
  });
  // The loft runs along its +y with the section's tall axis on +x. Rotate it
  // onto −x, exactly as seatpack.js does, so t grows toward the REAR of the
  // bike and the section's tall axis becomes world up: t=0 (the fat end) ends
  // up under the saddle and the pinched tail runs back over the wheel.
  // Rotating it onto +x instead — which this did first — builds the bag inside
  // out, fat end aft and a cone pointing at the seatpost.
  const swept = new THREE.Group();
  swept.rotation.z = Math.PI / 2;
  swept.add(shell);
  // Piping down every panel join, nudged out along the section normal so it
  // sits proud of the stuffing rather than sinking into it. These are the real
  // corner lines of the recorded section, not two guessed stripes down a tube.
  loft.seams.forEach((line) => {
    const sp = line.filter((_, i) => i % 2 === 0).map((q, i) => {
      const cu = loft.sections[Math.min(i * 2, loft.sections.length - 1)].cu;
      const n = v3(q.x - cu, 0, q.z);
      if (n.lengthSq() > 1e-6) n.normalize().multiplyScalar(bodyAmp * 0.2 + 0.5);
      return q.clone().add(n);
    });
    if (sp.length > 2) swept.add(seamCurve(main, sp, 0.9));
  });
  const body = new THREE.Group();
  body.add(swept);
  // t=0 sits at local x=0 and t=1 at x=−deep, so shift forward to centre the
  // bag on the group origin and leave the placement code below untouched.
  body.position.x = deep / 2;
  grp.add(body);

  // Closure, at the pinched end.
  const tEnd = narrowAtTail ? bodyEnd : 0;
  const endSec = sectionAt(narrowAtTail ? 1 : 0);
  if (rolled) {
    // The mouth is pinched into a lip, so a flattened section is WIDER than the
    // body — size the fold stack from the body's own half-width at that
    // station, not from the tapered height.
    const cap = rollTop(main, hwm, {
      r: endSec.a, depth: 13, rings: Math.min(Math.max(rolls ?? 3, 1), 4), back: false,
      widthScale: (endSec.b * 2) / (1.68 * endSec.a),
    });
    cap.rotation.y = narrowAtTail ? -Math.PI / 2 : Math.PI / 2;
    cap.position.set(-tEnd * deep, endSec.cu, 0);
    body.add(cap);
  } else if (closure && closure.startsWith('zip')) {
    // a wedge saddlebag zips along its top ridge, which is now level
    body.add(zipperRun(
      v3(-deep * 0.1, aRef + lift * 0.4, 0),
      v3(-deep * 0.9, aRef + lift * 0.4, 0), hwm, { accentMat: accent }));
  }

  // The girth compression strap, where the record carries one — Revelate's is
  // the red cam strap in every Shrew photo. Sits at the fat end's shoulder,
  // where there is body for it to bite, not slung round the pinched tail.
  //
  // `tail: false`. strapAssembly's loose end is drawn 85 degrees out of the
  // band's own plane, so on the tool pack it stood 38mm off the centreline of a
  // bag published 4cm wide and 45mm above one published 8cm tall — between them
  // the whole of that bag's +60% width and a third of its +74% height.
  if (girth) {
    const tGirth = narrowAtTail ? 0.34 : 0.66;
    const gs = sectionAt(tGirth / bodyEnd);
    const st = strapAssembly(wm, hwm, {
      r: gs.a + lift, width: 18, tail: false,
      ellipse: gs.b / Math.max(gs.a + lift, 1), angle: deg(-20),
    });
    st.rotation.y = Math.PI / 2;
    st.position.set(-tGirth * deep, gs.cu, 0);
    body.add(st);
  }

  // Logo on the SIDE panel: studio-1 and studio-3 both put the Apidura mark on
  // the flank, and the rear of a wedge is a rolled tail with nothing flat to
  // print on. Sized off the bag's own length so a 28cm tool pack and a 20cm
  // Shrew both get a mark in proportion.
  const tLogo = narrowAtTail ? 0.42 : 0.58;
  const ls = sectionAt(tLogo / bodyEnd);
  patch(grp, brand, deep / 2 - tLogo * deep, ls.cu, ls.b + 1.5, Math.min(deep * 0.30, 72), 0);
}
