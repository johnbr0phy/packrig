// Downtube bag builder (mm-local, parented to the `downtube` anchor).
//
// ---- WHAT IT IS (owner) ----------------------------------------------------
// "A downtube bag is a slim wedge under the tube." Long, slim, tapered,
// strapped under the down tube with thin straps (straps.js ribbons, <= 25 mm,
// 1.5 mm thick, each one round bag AND tube), >= 15 mm from the front tyre.
// Placement (HANDOVER): the FRONT edge is anchored, as far toward the head
// tube as the tyre allows, and the bag extends back toward the bottom
// bracket from there.
//
// ---- AXIS MAPPING (BUILDER-BRIEF Rule 2) -----------------------------------
// Checked 25 Sep against `mount.axes` for all 12 records in this slot:
//   p.mm.len -> ALONG the down tube (`along_downtube` on 11 of 12). t = 0 is
//               the bottom-bracket end (closed, chamfered where the record
//               says so), t = 1 the head-tube end (the roll).
//   p.mm.hgt -> the down tube's outward perpendicular: how far the bag hangs
//               off the tube. Apidura writes `perp_downtube`; Revelate, Tailfin
//               write `y`, EVOC `x`, Restrap `-y`. All mean the same thing on a
//               bag lying along a 46 degree tube, and all are read as perp.
//   p.mm.wid -> across the bike, world z (`z` on every record).
// Suspect records: Rockgeist's Bolt-on Stake Bag writes `len: along_forkleg`
// and attaches to three-pack bolts (it is a fork/down tube bolt-on bag filed
// here; drawn along the down tube); Lezyne Caddy Sack M has no `mount` block.
//
// Everything is built in one frame, `rig`, whose axes ARE those three:
//   x = perpendicular distance from the down tube centreline (away from frame,
//       i.e. DOWNWARD off the tube)
//   y = distance along that centreline from its bottom-bracket end
//   z = across the bike
// The centreline and its radius come from ctx.framePoly / ctx.frameEdgeR, the
// bottom bracket is the frame origin, and the tyre from ctx.points; no
// placement number in this file is measured off a screenshot.
//
// ---- SILHOUETTE ----------------------------------------------------------
// A wedge in side view: the back panel flat on the tube, the depth growing
// from the BB end (`taperRatio` of the full depth where the record has one,
// else a narrow vr.range) to full depth three quarters of the way to the head
// tube, then pinching into a flattened rolled lip across the bike. The prow
// cut and the drive-side plan sweep at the BB end are the Apidura drawing's,
// applied only where the record says the shape is chamfered/asymmetric.

import * as THREE from 'three';
import { v3 } from '../../lib.js';
import { seamCurve } from '../hardware.js';
import { featuresOf, geomOf, stiffnessOf, variantOf } from '../identity.js';
import { loftBody, measuredProfile, sectionFor, sectionUnit } from '../loft.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';
import { buckle, meshOf, ribbonLoop, strapRun } from '../straps.js';

const norm2 = (x, y) => { const d = Math.hypot(x, y) || 1; return [x / d, y / d]; };
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * The measured silhouette, but only when it is a measurement of the BAG.
 *
 * v2 fed `measuredProfile()` straight into the loft for all three products in
 * this slot and the owner preferred the OLD version of every one of them. The
 * curves are why. They are peak-normalised half-depths at 40 stations, and:
 *
 *   apidura-expedition-e-bike-charger-pack-1-6l
 *     ... 0.798, 0.048, 0.044, 0.040, 0.809 ...   (stations 8-12)
 *   apidura-sleeved-downtube-pack-1-8l
 *     0.621, 0.754, 0.000, 0.000, 0.663 ...       (stations 2-3)
 *     ... 0.835, 0.000, 0.000, 0.000, 0.339 ...   (stations 24-26)
 *
 * Those are not waists, they are holes: tools/diagram-outline.mjs traces the
 * maker's SVG and loses the outline wherever a dimension leader crosses it.
 * `measuredProfile` floors them at 0.06, so the loft's depth collapses to 6% of
 * the bag for three consecutive rings and springs back — which is precisely the
 * round-2 report of "a grey open-topped scoop gapes around the down tube with a
 * separate black lump sitting loose inside it and a mirrored APIDURA plate
 * visible in the cavity". The lump is the roll-top, positioned off the section
 * centre, left hanging in the hole; the mirrored plate is the far flank's logo
 * seen through it. It is also the clash: the roll is placed at the collapsed
 * section's centre, which is 26 mm inside the down tube.
 *
 * So: intact, and an orthographic elevation rather than a photograph. The
 * third curve (apidura-expedition-downtube-pack-1-5l) is a photo trace, smooth
 * but symmetric — 0.61 at one end, 0.53 at the other, peak dead centre — and a
 * down tube pack is definitionally NOT symmetric: one end is a chamfer, the
 * other is a roll. A lit object at an unknown angle cannot supply an elevation,
 * and the record already fully determines this shape. All three are rejected
 * today; a clean drawing trace would be used the moment one lands.
 */
function usableProfile(p) {
  const rec = p?.profile;
  const a = rec?.profile;
  if (!a?.length) return null;
  for (let i = 1; i < a.length - 1; i++) {
    if (a[i] < 0.25) return null;                       // the trace lost the outline
    if (Math.abs(a[i] - a[i - 1]) > 0.35) return null;  // ...and jumped back onto it
  }
  if (rec.source_kind !== 'diagram' || rec.view_ambiguous) return null;
  return measuredProfile(p);
}

/** 2D convex hull (monotone chain) over [x, y] pairs; returns them CCW. */
function hull2(pts) {
  const s = pts.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (src) => {
    const h = [];
    for (const p of src) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(s), ...half(s.slice().reverse())];
}

export function buildDowntube(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const geom = geomOf(p);
  // soft | semi | rigid, from the model records — see stiffnessOf().
  const stiff = stiffnessOf(p);
  const wm = webbing();
  const hwm = hardware();

  // ---- the down tube, from the bike --------------------------------------
  // framePoly is walked seat tube -> top tube -> head tube -> down tube, so
  // edge 3 (framePoly[3] -> framePoly[0]) IS the down tube and frameEdgeR[3] is
  // its radius. Taking the edge rather than atan2(headBottom) also gets the BB
  // end right: the tube stops at framePoly[0], not at the BB centre.
  const dtHeadP = ctx.framePoly[3], dtFootP = ctx.framePoly[0];
  const dTube = v3(dtHeadP.x - dtFootP.x, dtHeadP.y - dtFootP.y, 0).normalize();
  const perp = v3(dTube.y, -dTube.x, 0);        // out of the triangle, under the tube
  const dtR = ctx.frameEdgeR[3];
  const foot = v3(dtFootP.x, dtFootP.y, 0);
  // The frame is built around the bottom bracket at the origin (bike.js
  // computePoints), so the tube's own BB end lands at these tube coordinates.
  const along0 = foot.dot(dTube);
  const perp0 = foot.dot(perp);

  // ---- the bag's own numbers ---------------------------------------------
  // WHERE THE "+147% TOO TALL" COMES FROM, with every intermediate value, since
  // four rounds have now been spent hunting for a height bug in this file.
  //
  // The chain from the published figure to the geometry is four steps and no
  // step scales anything:
  //   data/models/apidura.json  render.hgt_cm = 6.5
  //   catalog.js:74             p.mm.hgt = 6.5 * 10 = 65
  //   here                      aH = min(65, 150) / 2 = 32.5
  //   loftBody sectionAt        a = secA(t), which is aH at full depth
  // so the lofted body is 65.0mm across its own perpendicular. Measured on the
  // built geometry (three.js, no renderer, straight out of loftBody + the
  // channel and rake passes below) the rig-local perp extent of the three
  // products is 65.0 / 70.0 / 90.0mm against published 65 / 70 / 90. Exact.
  //
  // What tools/eval-auto.mjs grades is not that. `axisOf` sends this record's
  // `hgt: "y"` — and its `perp_downtube` too, via TUBE_AXIS at eval-auto.mjs:83
  // — onto the y axis of the WORLD bounding box, and this bag lies on a tube at
  // 46.35 degrees (framePoly gives a down tube vector of (420.9, 441.2)). A bag
  // of length L on that tube with depth D on its own perpendicular occupies
  //     bbox y = L*sin(46.35) + D*cos(46.35) = 0.724L + 0.690D
  //     bbox x = L*cos(46.35) + D*sin(46.35) = 0.690L + 0.724D
  // The measured 186.6mm of bbox y on the 1.5L is 0.724*208 + 0.690*65 = 195
  // less what the end cuts take off the corners — it is the LENGTH, read onto
  // the height axis. No geometry satisfies the +25% gate on that axis: a 210mm
  // bag on this tube stands 152mm in world y with no depth at all, already 134%
  // over the published 65. The same mirror image inflates `along_downtube -> x`
  // with the depth.
  //
  // The fix is a measurement, not a geometry change and not a record rename:
  // tools/bagshot.mjs already has `pts` and `bagRoot.matrixWorld`, so one extra
  // box built in the bag root's own frame gives a `bbox_mount_mm` in which the
  // along_/perp_ axes are exact for every slot in the catalogue, and axisOf()
  // can read tube-relative names off that instead of projecting.
  const aH = Math.min(p.mm.hgt, 150) / 2;             // half-depth, on `perp`
  const bH = Math.min(p.mm.wid, 150) / 2;             // half-width, across the bike
  const len = Math.min(p.mm.len, 380);
  const xs = sectionFor(geom.crossSection, 'd_shape');

  // The chainring-clearance cut. The record calls it "the defining silhouette
  // feature and must not be modelled as a square end", and it has TWO halves.
  // Both are now taken off the maker's own vector drawing rather than argued
  // from chainring geometry — assets/products/apidura/full/
  // expedition-downtube-pack/dimensions-1.svg, which is orthographic, carries
  // both views, and whose path coordinates can be read exactly. Its scale is
  // fixed by three independent dimension arrows that agree to 0.4%: 14.10 svg
  // units per cm.
  //
  // Rounds 2-4 all cut the TUBE-side corner back furthest, reasoning that the
  // chainring is a disc about the BB and so reaches the tube-side corner first.
  // The drawing says the opposite, and the drawing is the product. In its side
  // elevation (path 39, and the strap tab at path 47 fixes the tube side as the
  // TOP of that view) the closed end is a prow, not a plane:
  //
  //   tube-side face begins at   x 19.63  ->  10.4mm back from the extreme
  //   extreme point at           y 236.80 ->  27.0 units = 29% of the depth
  //                                           down from the tube face
  //   outer face begins at       x 41.46  ->  25.9mm back from the extreme
  //
  // 10.4 and 25.9mm on a 65mm-deep bag are 0.16 and 0.40 of the depth. Held as
  // fractions of THIS bag's own depth, so a 9cm-deep Backcountry gets a
  // proportionally longer prow and no Apidura millimetre reaches another brand.
  const chamfered = /asymmetric|chainring|crank|diagonal|angled/i.test(feats.shape || '')
    || (geom.taperNarrowEnd === 'tail' && (geom.taperRatio ?? 1) < 1);
  const PROW_APEX = 0.29, PROW_TUBE = 0.16, PROW_OUTER = 0.40;
  // x is the section coordinate: -aH is the flat back against the tube, +aH the
  // outer face. Two straight runs meeting at the apex, because the drawing is
  // two straight runs meeting at a corner radius.
  const rakeAt = (x) => {
    if (!chamfered) return 0;
    const u = clamp01((x + aH) / (2 * aH));
    return u < PROW_APEX
      ? PROW_TUBE * 2 * aH * (1 - u / PROW_APEX)
      : PROW_OUTER * 2 * aH * (u - PROW_APEX) / (1 - PROW_APEX);
  };
  const rakeMax = chamfered ? PROW_OUTER * 2 * aH : 0;

  // The second half is the drawing's TOP view (paths 22 and 29): the plan is
  // full width the whole way down the NON-drive side, and swept in on the drive
  // side. That one-sidedness is what "asymmetric" means — a symmetric taper
  // cannot clear a chainring that is only on one side of the bike.
  //
  // How deep the sweep goes is a per-product number and now comes from the
  // record instead of a constant in this file, which was applying one Apidura
  // measurement to all twelve down tube packs in the catalogue. `taper.tail` is
  // the plan WIDTH at the BB end as a fraction of the full width; the whole
  // reduction comes off one side, so the drive-side half-width there is
  // 2*ratio - 1. On the 1.5L the drawing gives 55.68 of 112.5 units across the
  // tip, i.e. taper.tail 0.60 -> a drive-side half-width of 0.20.
  const planKeep = chamfered ? Math.max(0, 2 * (geom.taperRatio ?? 0.85) - 1) : 1;
  // …reaching full width at 123.9 units from the tip, which against the 21cm
  // rolled length is 42% of the way along.
  const PLAN_T = 0.42;
  const planAt = (t) => Math.min(1, planKeep + (1 - planKeep) * (t / PLAN_T));

  // Depth: CONSTANT end to end. The drawing's side elevation is two parallel
  // straight lines from the prow to the roll — the 6.5cm holds the whole way —
  // and rounds 2-4 all put the record's `taper` on this axis instead, which
  // pinched the body to 85% at the BB end and drew all three products 2.4 to
  // 3.4mm under their published depth. With it gone the measured rig-local perp
  // extent is 65.0 / 70.0 / 90.0mm on the three, exact against 6.5 / 7 / 9cm.
  //
  // Only the NOSE gets an ease, and only over the last tenth: the prow clamps
  // five or six rings onto one surface and those rings keep the section they
  // were lofted with, so easing the tail as well builds the cut face out of
  // pinched sections and the prow comes out as a funnel. The cut IS the tail
  // treatment.
  const meas = usableProfile(p);
  // The WEDGE (owner: "a slim wedge under the tube"): full depth at the BB
  // end, where the space between the down tube and the front wheel is widest,
  // thinning toward the head tube, where the tyre comes up under the tube. The
  // depth ratio at the nose is the record's taper where it has one; a record
  // measuring no taper (the Joeys, 1.0) still gets a slight one, because the
  // owner's description of the slot wins over a cylinder template. Which end
  // is thin is decided by the bike, not by the record's nose/tail labels.
  const rolled = p.closure?.type === 'rolltop';
  const WEDGE_T0 = 0.22;
  const dNose = Math.min(Math.max(geom.taperRatio ?? vr.range(0.72, 0.8), 0.62), 0.84);
  const wedge = meas ? (t) => meas(t) : (t) => 1 - (1 - dNose) * clamp01((t - WEDGE_T0) / (1 - WEDGE_T0));
  // The mouth: over the last NECK of the length the depth pinches to the roll
  // and the section recentres, so the rolled lip sits across the middle of
  // the end, not against the tube. A zipped bag gets a short rounded end.
  const NECK = rolled ? 0.14 : 0;
  const rollR = rolled ? Math.max(5, Math.min(aH * 0.42, 15)) : 0;
  const smooth01 = (u) => { const c = clamp01(u); return c * c * (3 - 2 * c); };
  const neckS = (t) => (NECK ? smooth01((t - (1 - NECK)) / NECK) : 0);
  const secA = (t) => {
    let a = aH * wedge(t);
    if (NECK) a += (rollR * 0.95 - a) * neckS(t);
    else a *= 1 - 0.2 * smooth01((t - 0.9) / 0.1);
    return a;
  };
  const secB = (t) => bH * (NECK ? 1 + 0.04 * neckS(t) : 1 - 0.12 * smooth01((t - 0.9) / 0.1));
  // back pinned flat on the tube (-aH) until the neck, then released
  const secCu = (t) => -(aH - secA(t)) * (1 - neckS(t));
  const outerAt = (t) => secCu(t) + secA(t);

  const loft = loftBody({
    len, rings: 34, shape: xs,
    sectionAt: (t) => ({
      // The back panel of a flat-backed bag is FLAT. Scaling the section
      // symmetrically lifted its back off the tube at both ends, which is half
      // of the daylight the review measured (11-15px of bare background along
      // the joint); pin every station's back edge to -aH instead.
      a: secA(t), b: secB(t), cu: secCu(t),
    }),
  });

  // ---- how far off the tube it hangs -------------------------------------
  // The record's moulded V-channel: "the face against the downtube is flat with
  // a moulded V-channel pressed into it", and "the moulded channel in the back
  // panel is what keeps it from rotating". Carved into the geometry, not pushed
  // in through soft()'s bulge — a semi/rigid pack skips the deform pass
  // entirely (BUILDER-BRIEF §1) and would have sat beside the tube.
  // Capped at a third of the depth: the 1.5L is only 65mm deep in total.
  const chan = Math.min(dtR * 0.5, aH * 0.30);
  // A velcro band pulled tight flattens the back panel onto the tube, so the
  // two touch with a whisker of fabric compression — no daylight, no burial.
  // v2 used 4mm, which was inside the 8mm bagshot allows but is a bag pressed
  // into a tube rather than sitting on it.
  const SQUISH = 2.5;
  const Pc = dtR + aH - chan - SQUISH;                 // section centre, off the tube axis

  {
    const pos = loft.geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      let y = pos.getY(i);
      const z = pos.getZ(i);
      // The rake, first: it is a clamp against a plane, so it turns the loft's
      // flat start cap INTO the raked face rather than adding a second surface
      // in front of it. Taken off the pre-channel x — the groove is 10mm deep
      // on the back panel and would otherwise nibble the cut back at one edge.
      const need = rakeAt(x);
      if (y < need) { y = need; pos.setY(i, y); }
      const t = clamp01(y / len);
      // The channel follows the tube's own circle, so the groove floor tracks
      // the surface at a constant SQUISH the whole way across it.
      const onBack = Math.min(Math.max((-x / aH - 0.82) / 0.14, 0), 1);   // back panel only
      if (onBack > 0) {
        const dip = chan - Math.min(chan, dtR - Math.sqrt(Math.max(dtR * dtR - z * z, 0)));
        pos.setX(i, x + dip * onBack);
      }
      // The chainring cut, in plan. Clamping rather than scaling is deliberate:
      // it leaves a genuinely PLANAR swept face on the drive side, which is what
      // the drawing shows. bike.js puts the chainring web at z = +50, so +z is
      // the side that has to give.
      if (chamfered && z > 0) {
        const lim = secB(t) * planAt(t);
        if (z > lim) pos.setZ(i, lim);
      }
    }
    pos.needsUpdate = true;
    loft.geo.computeVertexNormals();
  }

  // ---- where along the tube it sits --------------------------------------
  // "the closed, chamfered end sitting just clear of the chainring and crank
  // arm" (mount.notes). src/bike.js draws a 40-tooth ring on half-inch pitch
  // about the BB, so its tip circle is pitch / (2 sin(pi/N)) plus a tooth.
  // RING_TEETH is a local const inside buildBike and cannot be imported — see
  // the report; this is the same expression, not a number off a screenshot.
  const ringR = 12.7 / (2 * Math.sin(Math.PI / 40)) + 6;
  // Solved against the PROW, not against a square end. `clearAt` is how far up
  // the tube a point sitting `w` off the centreline has to start, and it falls
  // away as w grows; `rakeAt` is how far up the tube that point already sits
  // inside the bag. The binding station is wherever the two are closest, so
  // walk the section instead of testing one corner — with the prow apex 29% of
  // the way down the face, neither corner is it.
  //
  // This is a 2D solve against the ring's tip circle at every z, which is
  // conservative for exactly the reason the plan cut exists: the ring lives at
  // one z on the drive side and the tail's drive-side flank has been swept away
  // from it. Where it and the tyre bound cannot both be met the tyre wins
  // below, and the pack ends up a little inside the tip circle in projection
  // while still clear of it in space.
  const clearAt = (w) => Math.sqrt(Math.max((ringR + 8) ** 2 - (w + perp0) ** 2, 0)) - along0;
  let sRing = -Infinity;
  for (let i = 0; i <= 12; i++) {
    const x = -aH + 2 * aH * (i / 12);
    sRing = Math.max(sRing, clearAt(Pc + x) - rakeAt(x));
  }

  // …and the front tyre at the other end. Never allowed to touch, so it is
  // solved against the bag's ACTUAL outer face at each station, not against its
  // bounding depth: the nose is a roll and pinches to about half.
  const axle = ctx.points.frontAxle;
  // 17 mm: the owner's 15 plus a margin for the drawn tyre, and no more, since
  // every millimetre spent here pushes a long pack back into the crank.
  const tyreR = ctx.points.tireR + ctx.geo.tireWidth / 2 + 17;
  const enterAt = (w) => {
    const A = v3(foot.x + perp.x * w - axle.x, foot.y + perp.y * w - axle.y, 0);
    const h = A.dot(dTube);
    const disc = h * h - (A.lengthSq() - tyreR * tyreR);
    return disc > 0 ? -h - Math.sqrt(disc) : Infinity;
  };
  let sTyre = Infinity;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;                                  // every station: the tail is the deep end
    sTyre = Math.min(sTyre, enterAt(Pc + outerAt(t)) - t * len);
  }
  // FRONT-ANCHORED (owner / HANDOVER): the head-tube end goes as far forward
  // as the tyre allows (sTyre is the tail station that puts the nose exactly
  // on the tyre's 20 mm envelope), never past the tube's own head end, and the
  // bag extends back toward the BB from there. A pack too long for the window
  // reaches toward the crank; the tyre is never traded for it. Floored at the
  // tube's BB end, where the resolver's escape route takes over.
  // A pack too long or too deep for the window between the chainring and the
  // tyre keeps the tyre rule and runs its tail back past the tube's BB end,
  // beside the shell: the crank is a part this slot is allowed to touch, the
  // tyre never is. Those products are reported as not fitting this frame.
  const tubeLen = v3(dtHeadP.x - dtFootP.x, dtHeadP.y - dtFootP.y, 0).length();
  const headEnd = tubeLen - ctx.frameEdgeR[2] - len;       // nose short of the head tube
  const sTail = Math.min(sTyre, headEnd);
  grp.userData.dtFit = { sTyre: +sTyre.toFixed(1), sRing: +sRing.toFixed(1), headEnd: +headEnd.toFixed(1), len, aH, Pc: +Pc.toFixed(1) };
  // how far the tail sits inside the chainring's clearance circle (0 = clear)
  grp.userData.ringShortMm = Math.max(0, sRing - sTail);


  // ---- assemble in tube coordinates --------------------------------------
  const anchorP = ctx.anchors.downtube.position;
  const rig = new THREE.Group();
  rig.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(perp, dTube, v3(0, 0, 1)));
  rig.position.set(foot.x - anchorP.x, foot.y - anchorP.y, -anchorP.z);
  grp.add(rig);

  const bag = new THREE.Group();
  bag.position.set(Pc, sTail, 0);
  rig.add(bag);

  // ---- colour ------------------------------------------------------------
  // Apidura weld Hypalon panels onto a ripstop or hex-weave shell: a different
  // finish, and on two of the three products a different colour. The Backcountry
  // is the odd one out — its colourway is listed "Black / Grey" with black as
  // the primary, but the black is the SLEEVE and the grey is the body it wraps
  // ("a black Hypalon sleeve wraps the lower two thirds with a cut-out chevron
  // window showing the grey body, and the roll section above it is grey"), so
  // the two swap roles here. NOTE: today all three arrive black, because
  // data/brands.json still carries a stale one-entry "Black" colourway for each
  // and tools/apply-models.mjs does not merge `colorways` at all — see report.
  // The moment that lands, this mapping puts the right colour on each panel.
  // Does this bag have a Hypalon SLEEVE wrapping its lower body, with the roll
  // section above it in the other colour? That is a construction fact about the
  // product, so it comes from the record (`geometry.sleeve`), not from a match
  // on an Apidura line name.
  //
  // It used to read `/sleeved/i.test(p.line)`. This builder draws 12
  // products across the catalogue, so a test on one maker's line name silently
  // handed Apidura's construction to any other brand that happened to use the
  // word, and withheld it from every brand that builds the same way. The same
  // mistake put Apidura strap stubs on an Ortlieb handlebar pack.
  const sleeved = !!(p.geometry && p.geometry.sleeve);
  const twoTone = !!accent && !accent.color.equals(main.color);
  const shell = sleeved && twoTone ? accent : main;
  const hyp = shell.clone();
  // Hypalon is a shade glossier than the ripstop it is welded to, not a
  // different class of surface. A 0.45 drop put it at roughness 0.45 under the
  // lake environment, which blew the chevron arms and the strap backing out to
  // a near-white specular on a bag that is black-on-black in studio-2.jpg —
  // "a row of scratches" was the round-2 note and this is what replaced it.
  hyp.roughness = Math.max(0.45, (shell.roughness ?? 0.9) - 0.25);
  if (twoTone) hyp.color.copy(sleeved ? main.color : accent.color);
  else {
    // Monochrome colourway: Hypalon still has to read as a different material
    // or the welded panels vanish, which is what "a uniform black lozenge"
    // means. Shift it clear of the shell in whichever direction there is room.
    const hsl = { h: 0, s: 0, l: 0 };
    shell.color.getHSL(hsl);
    hyp.color.copy(shell.color).lerp(new THREE.Color(hsl.l < 0.35 ? 0xffffff : 0x000000), 0.12);
  }

  const body = soft(loft.geo, shell, {
    amp: vr.range(1.7, 2.4), freq: vr.range(0.04, 0.05), seed: vr.seed % 911,
    stiffness: stiff,
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.82, aoSpan: 0.5,
  });
  bag.add(body);

  // Welded seam down both outer corners — visible as a crease the full length
  // of the bag in studio-2.jpg, and the cheapest thing that stops a laminated
  // drybag reading as an extruded blob. Corner order out of loftBody is
  // (+u+v), (-u+v), (-u-v), (+u-v); 0 and 3 are the outboard pair.
  for (const i of [0, 3]) if (loft.seams[i]) bag.add(seamCurve(shell, loft.seams[i]));

  // ---- the Backcountry's Hypalon sleeve ----------------------------------
  // "a black Hypalon sleeve wraps the lower two thirds with a cut-out chevron
  // window showing the grey body" — studio-1.jpg: the sleeve's top edge is not
  // straight, it notches down over the middle of each flank. Built as its own
  // open shell rather than as a stripe painted on the body, so it reads as a
  // second layer with an edge.
  const SLEEVE_T = 0.66;
  if (sleeved) {
    // The sleeve stands 1mm proud on the flanks and 2mm on the outer face, and
    // its tube-side edge is tucked 4mm INSIDE the shell's back panel. Wrapping
    // it right round instead put two surfaces on the same plane against the
    // tube — z-fighting, and the contact clamp below then pushed both onto
    // exactly the same radius, which welds the artefact in place.
    const sleeve = loftBody({
      len: len * SLEEVE_T, rings: 24, shape: xs, capStart: false, capEnd: false,
      sectionAt: (u) => {
        const t = u * SLEEVE_T;
        return { a: secA(t) - 1.0, b: secB(t) + 1.0, cu: secCu(t) + 3.0 };
      },
    });
    const pos = sleeve.geo.attributes.position;
    const topY = len * SLEEVE_T;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      let y = pos.getY(i);
      const z = pos.getZ(i);
      // The sleeve wraps the lower two thirds, so it wraps the cut end: put it
      // on the same prow, 1.5mm short of the shell's, or it hangs over the cut
      // as a flap of Hypalon in front of the chainring.
      const needR = rakeAt(x - 4.0) + 1.5;
      if (y < needR) { y = needR; pos.setY(i, y); }
      // The same V-channel the shell has. Without it the sleeve's back panel
      // stayed on the un-grooved plane, ended up 12mm inside the tube, and was
      // dragged back out by the contact clamp onto the shell's own surface.
      const onBack = Math.min(Math.max((-(x - 4.0) / aH - 0.82) / 0.14, 0), 1);
      if (onBack > 0) {
        const dip = chan - Math.min(chan, dtR - Math.sqrt(Math.max(dtR * dtR - z * z, 0)));
        pos.setX(i, x + dip * onBack);
      }
      // The chevron window, cut against DEPTH rather than width: the rim rides
      // high at the tube-side and outer-face corners and notches down across
      // the middle of the flank, which is the face a side-on render sees. Cut
      // against z instead, the notch sits on the outer face and the flank rim
      // is a straight line from every angle the harness shoots.
      const edge = topY - len * 0.09 * (1 - Math.min(1, Math.abs(x / aH)));
      if (y > edge) pos.setY(i, edge);
      // and the sleeve stops short of the drive-side cut rather than hanging
      // in the air where the body has been sliced away
      if (chamfered && z > 0) {
        const lim = secB(clamp01(y / len)) * planAt(clamp01(y / len)) + 1.0;
        if (z > lim) pos.setZ(i, lim);
      }
    }
    pos.needsUpdate = true;
    sleeve.geo.computeVertexNormals();
    const sm = hyp.clone();
    sm.side = THREE.DoubleSide;            // an open shell, seen from the rim
    bag.add(new THREE.Mesh(sleeve.geo, sm));
  }

  // ---- the straps ----------------------------------------------------------
  // Thin webbing (straps.js), each one a single loop round the bag AND the
  // tube, which is how a velcro down tube strap holds: the tube passes through
  // the loop. How many: a record whose attachment names ONE strap (Apidura's
  // "stability strap") gets one, with its Hypalon backing panel; everything
  // else gets two, clear of the prow and of the roll.
  const attach = String(p.features?.attachment || '');
  const oneStrap = /\bstrap\b/i.test(attach) && !/\bstraps\b/i.test(attach);
  const hypalon = /hypalon/i.test(attach);
  const strapW = Math.max(16, Math.min(25, bH * 0.6));
  const tStraps = oneStrap ? [sleeved ? 0.36 : 0.45] : [0.3, 0.66];
  const tStrap = tStraps[0];
  const { pts: unit } = sectionUnit(xs, { detail: 5 });
  const secAt = (t) => unit.map(([u, v]) => [u * secA(t) + secCu(t), v * secB(t)]);
  // Everything that lies ON the bag has to clear whatever is already there. On
  // the Backcountry that is the sleeve, which stands 1mm proud on the flanks
  // and 2mm on the outer face.
  const over = sleeved ? 2.2 : 0;
  const bodyLift = 1.6 + over;               // soft()'s stuffing, plus the sleeve
  const ring = [];
  for (let i = 0; i < 26; i++) {
    const th = (i / 26) * Math.PI * 2;
    ring.push([Math.cos(th) * (dtR + 0.4), Math.sin(th) * (dtR + 0.4)]);
  }
  const strapGeos = [], panelGeos = [], hwGeos = [];
  for (const t of tStraps) {
    const y = sTail + t * len;
    // push the section outward by the stuffing so the band sits ON the fabric
    const sec = secAt(t).map(([x, z]) => {
      const cx = secCu(t), dx = x - cx, r = Math.hypot(dx, z) || 1;
      return [cx + dx * (r + bodyLift) / r, z * (r + bodyLift) / r];
    });
    const loop = hull2([...sec.map(([x, z]) => [x + Pc, z]), ...ring]);
    strapGeos.push(ribbonLoop(loop.map(([x, z]) => v3(x, y, z)), v3(0, 1, 0), v3(Pc * 0.5, y, 0),
      { width: strapW, lift: 0.4, thick: 1.5 }));
    // velcro overlap on the frame side of the tube: a second flat layer
    hwGeos.push(strapRun(v3(-(dtR + 2.2), y, -dtR * 0.55), v3(-(dtR + 2.2), y, dtR * 0.55), v3(-1, 0, 0),
      { width: strapW * 0.92, thick: 1.5 }));
    if (hypalon && oneStrap) {
      // the Hypalon panel the velcro is stitched to, round the bag's girth only
      const panel = hull2(sec).map(([x, z]) => v3(x + Pc, y, z));
      panelGeos.push(ribbonLoop(panel, v3(0, 1, 0), v3(Pc + secCu(t), y, 0),
        { width: strapW * 1.5, lift: 0.1, thick: 1.1 }));
    }
  }
  rig.add(meshOf(strapGeos, wm));
  rig.add(meshOf(hwGeos, wm));
  if (panelGeos.length) rig.add(meshOf(panelGeos, hyp));

  // ---- the Hypalon chevron on the flank ----------------------------------
  // Apidura's signature, and the biggest single thing on the side of all three
  // bags: studio-2.jpg (Expedition) and studio-1.jpg (charger) both show one
  // large arrow, not a row of thin ribs. On dimensions-1.png's side view it is
  // the wide "A" under the strap — apex at the tube-side edge level with the
  // strap, arms splaying out to the outer face fore and aft of it. v2 drew four
  // 7mm sticks per flank, which at render scale is a row of scratches.
  //
  // Not on the Backcountry: there the chevron is a WINDOW cut in the sleeve,
  // not a panel welded on top of it, and Hypalon-coloured arms lying on a
  // Hypalon sleeve are both invisible and co-planar with it.
  if (!sleeved && hypalon) {
    const yS = tStrap * len;
    // …and the rearward arm has to stop above the cut end, or it hangs off the
    // prow into the space the cut was made to clear.
    const armY = Math.min(len * 0.26, len * (1 - tStrap) * 0.7, (yS - rakeMax) * 0.9);
    const armT = Math.max(9, len * 0.055);              // the band's own width
    const xA = -aH * 0.30;                              // apex, up toward the tube
    const xE = aH * 0.92;                               // out at the outer face
    for (const s of [-1, 1]) {
      const zF = s * (secB(tStrap) + 1.2);
      for (const dir of [-1, 1]) {
        const dx = xE - xA, dy = dir * armY;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(armT, Math.hypot(dx, dy), 2.6), hyp);
        arm.position.set((xA + xE) / 2, yS + dy / 2, zF);
        arm.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
        arm.userData.noCollide = true;
        bag.add(arm);
      }
    }
  }

  // ---- roll-top at the head-tube end -------------------------------------
  // All twelve records in this slot say rolltop and v1 drew none of them, which
  // is most of why three different bags read as the same sausage. On the
  // Backcountry the roll is ABOVE the sleeve and is the body colour, not the
  // Hypalon (studio-1.jpg); on the other two it is the trim.
  if (rolled) {
    // A flattened roll of fabric lying ACROSS the end, the mouth pinched flat
    // by the neck above and rolled over itself; its ends pinched thinner than
    // its middle. Seated inside `len`, which is the rolled length.
    const lipLen = secB(1) * 2 * 1.02;
    const rg = new THREE.CylinderGeometry(rollR, rollR, lipLen, 20, 8);
    {
      const pos = rg.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const yy = pos.getY(i) / (lipLen / 2);
        const k = 1 - 0.26 * Math.max(0, Math.abs(yy) - 0.7) / 0.3;
        pos.setX(i, pos.getX(i) * k);
        pos.setZ(i, pos.getZ(i) * k);
      }
    }
    rg.rotateX(Math.PI / 2);                     // cylinder axis -> z, across the bike
    rg.scale(1, 0.8, 1);                         // folded flat along the bag
    const rcX = secCu(1), rcY = len - rollR * 0.8;
    rg.translate(rcX, rcY, 0);
    rg.computeVertexNormals();
    const rollMat = sleeved ? shell : main;
    bag.add(soft(rg, rollMat, { amp: 0.5, freq: 0.08, seed: (vr.seed % 97) + 5, stiffness: stiff }));
    const crease = new THREE.MeshStandardMaterial({ color: rollMat.color.clone().multiplyScalar(0.55), roughness: 0.95 });
    const cg = [];
    for (const [dx, dy] of [[rollR * 0.62, rollR * 0.35], [-rollR * 0.55, rollR * 0.45]]) {
      const c = new THREE.BoxGeometry(1.1, 1.1, lipLen * 0.9);
      c.translate(rcX + dx, rcY + dy, 0);
      cg.push(c);
    }
    bag.add(meshOf(cg, crease));
    // One strap over the roll: up the outer face, round the end of the roll,
    // tucked under toward the tube; its buckle on the outer face.
    const rStrap = [], rHw = [];
    const tA = 1 - NECK - 0.1;
    const path = [];
    for (let i = 0; i <= 7; i++) {               // up the outer face and down the neck
      const t = tA + (1 - tA) * (i / 7);
      if (t * len > rcY) break;
      path.push(v3(outerAt(t) + 1.8, t * len, 0));
    }
    const rr = rollR + 1.6;
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 1.05;       // outer side -> over the end -> tube side
      path.push(v3(rcX + Math.cos(a) * rr, rcY + Math.sin(a) * rr * 0.8, 0));
    }
    const sw = Math.min(16, secB(1));
    rStrap.push(ribbonLoop(path, v3(0, 0, 1), v3(rcX, rcY - rollR * 2, 0), { width: sw, lift: 0.2, closed: false }));
    const by = (1 - NECK - 0.05) * len;
    rHw.push(...buckle(v3(outerAt(by / len) + 2, by, 0), v3(0, 1, 0), v3(1, 0, 0), { width: sw }));
    bag.add(meshOf(rStrap, wm));
    bag.add(meshOf(rHw, hwm));
  }

  // Logo on the flank, reading ALONG the bag as it does on the real one — the
  // patch plane is laid out long-axis-on-x, so it needs the quarter turn.
  // Kept clear of the chevron, down at the BB end where studio-2.jpg has it —
  // but ABOVE the cut. A fixed 0.42 * len patch at t = 0.15 started 30mm below
  // the cut on every one of these three and hung in the air off the tail.
  const yA = rakeMax + len * 0.04, yB = tStrap * len - len * 0.05;
  const logoLen = Math.max(Math.min(len * 0.30, (yB - yA) * 0.9), len * 0.12);
  const tLogo = clamp01((yA + yB) / 2 / len);
  const tag = patch(bag, brand, secCu(tLogo) + secA(tLogo) * 0.1, tLogo * len, secB(tLogo) + 1.4 + over, logoLen, 0);
  tag.rotation.z = -Math.PI / 2;

  // ---- nothing in this slot may be inside the down tube -------------------
  // Fabric cannot pass through a tube. v2 clamped the lofted body and nothing
  // else, so the roll-top — placed off the section centre, and with the broken
  // profile that centre was 26mm in — carried the e-bike charger pack 9.5mm
  // into the tube on its own. Doing it over the whole rig, once, after every
  // part is placed and after soft() has perturbed the shell, makes the
  // guarantee structural instead of per-part: anything closer to the centreline
  // than dtR - SQUISH is pushed radially back out onto the surface, which is
  // exactly what a strap pulled tight does. Hardware flagged noCollide is
  // supposed to reach the tube and is left alone.
  {
    rig.updateMatrixWorld(true);
    const toRig = rig.matrixWorld.clone().invert();
    const lim = dtR - SQUISH;
    const q = new THREE.Vector3();
    // ...and nothing through the cables. The rear brake hose runs under the
    // down tube (src/bike.js routes it 6 mm off the tube, non-drive side), and
    // a strap pulled tight lays the fabric OVER it, so the fabric is pushed
    // off every thin tube (a TubeGeometry path under 4 mm radius) found on the
    // frame, to HOSE_GAP off its surface. Found by scanning the bike, so a
    // re-routed hose moves the dent with it.
    const HOSE_GAP = 4.5;
    const hoses = [];      // thin tubes and BB cylinders, as polylines + radius
    ctx.frameGroup?.children?.forEach((o) => {
      const par = o.isMesh && o.geometry?.parameters;
      if (!par?.path || !(par.radius < 4) || o.userData?.part) return;
      o.updateMatrix();
      const pts = par.path.getSpacedPoints(96).map((v) =>
        v.clone().applyMatrix4(o.matrix).sub(anchorP).applyMatrix4(toRig));
      hoses.push({ pts, r: par.radius + HOSE_GAP });
    });
    // The same for the bottom-bracket shell and spindle (cylinders round the
    // BB): a pack too long for this frame tucks its tail against the shell
    // rather than through it.
    ctx.frameGroup?.children?.forEach((o) => {
      const par = o.isMesh && o.geometry?.type === 'CylinderGeometry' && o.geometry.parameters;
      if (!par || par.height < 40 || par.radiusTop > 60) return;
      o.updateMatrix();
      const c = new THREE.Vector3().applyMatrix4(o.matrix);
      if (Math.hypot(c.x - foot.x, c.y - foot.y) > 150) return;
      const ends = [new THREE.Vector3(0, par.height / 2, 0), new THREE.Vector3(0, -par.height / 2, 0)]
        .map((v) => v.applyMatrix4(o.matrix).sub(anchorP).applyMatrix4(toRig));
      hoses.push({ pts: ends, r: Math.max(par.radiusTop, par.radiusBottom) + 1.5 });
    });
    const seg = new THREE.Line3(), near = new THREE.Vector3();
    const offHoses = (v) => {
      let hit = false;
      for (const h of hoses) {
        for (let j = 0; j < h.pts.length - 1; j++) {
          seg.set(h.pts[j], h.pts[j + 1]);
          seg.closestPointToPoint(v, true, near);
          const d = near.distanceTo(v);
          if (d < h.r) {
            if (d < 1e-3) continue;
            v.sub(near).multiplyScalar(h.r / d).add(near);
            hit = true;
          }
        }
      }
      return hit;
    };
    rig.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      for (let n = o; n && n !== rig; n = n.parent) if (n.userData?.noCollide) return;
      const M = new THREE.Matrix4().multiplyMatrices(toRig, o.matrixWorld);
      const Mi = M.clone().invert();
      const pos = o.geometry.attributes.position;
      let moved = false;
      for (let i = 0; i < pos.count; i++) {
        q.fromBufferAttribute(pos, i).applyMatrix4(M);
        let hit = offHoses(q);
        const d = Math.hypot(q.x, q.z);
        if (d < lim && d >= 1e-3) {
          const k = lim / d;
          q.x *= k; q.z *= k;
          hit = true;
        }
        if (!hit) continue;
        q.applyMatrix4(Mi);
        pos.setXYZ(i, q.x, q.y, q.z);
        moved = true;
      }
      if (moved) { pos.needsUpdate = true; o.geometry.computeVertexNormals(); }
    });
  }

  return shadowify(grp);
}
