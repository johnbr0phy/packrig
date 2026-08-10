// Downtube bag builder — mm-local, parented to the `downtube` anchor.
//
// AXIS MAPPING (BUILDER-BRIEF Rule 2). Checked against `mount.axes` in
// data/models/apidura.json ("len: along_downtube, wid: z, hgt: perp_downtube")
// and against Apidura's own drawing,
// assets/products/apidura/full/expedition-downtube-pack/dimensions-1.png,
// which carries exactly the two views this slot needs:
//
//   p.mm.len -> ALONG the down tube. t = 0 is the bottom-bracket end (the
//               closed, chamfered one), t = 1 the head-tube end (the roll).
//               MIN 21 / MAX 27 cm on the drawing: the roll shortens THIS axis,
//               which is why the records now carry `render.len_cm`.
//   p.mm.hgt -> the down tube's outward perpendicular — how far the bag hangs
//               off the tube. 6.5 cm on the drawing's side view. This is a
//               DIAGONAL in world space (the reference frame's down tube lies
//               at 46.35 degrees), which is why `mount.axes.hgt` had to stop
//               claiming world `y` — see the note under "the bag's own numbers".
//   p.mm.wid -> across the bike, world z. 8 cm on the drawing's top view.
//
// Everything is built in one frame, `rig`, whose axes ARE those three:
//   x = perpendicular distance from the down tube centreline (away from frame,
//       i.e. DOWNWARD off the tube — the drawing's side view has this axis
//       pointing down the page, tube side at the top)
//   y = distance along that centreline from its bottom-bracket end
//   z = across the bike
// The centreline and its radius come from ctx.framePoly / ctx.frameEdgeR, the
// bottom bracket is the frame origin, and the tyre from ctx.points — no
// placement number in this file is measured off a screenshot.

import * as THREE from 'three';
import { v3 } from '../../lib.js';
import { rollTop, seamCurve } from '../hardware.js';
import { featuresOf, geomOf, stiffnessOf, variantOf } from '../identity.js';
import { loftBody, measuredProfile, sectionFor, sectionUnit } from '../loft.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';

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
 *   apidura-backcountry-downtube-pack-1-8l
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

/**
 * A closed band around an arbitrary convex outline: the outline as the band's
 * inner edge, the same outline pushed out along its own vertex normals as the
 * outer edge, extruded `width` along +z.
 *
 * This is what lets ONE strap encircle the bag AND the down tube as a single
 * loop, which is how the real one is fastened — the down tube passes through
 * the loop, which is why the loop stands proud of the bag's tube-side face in
 * studio-2.jpg with the bag stood on end.
 */
function bandMesh(outline, mat, { thick = 2.4, width = 34, lift = 1 }) {
  const n = outline.length;
  // `lift` holds the webbing off the surfaces it wraps. It has to beat soft()'s
  // noise amplitude or the fabric pokes through the strap.
  const offset = (d) => outline.map((p, i) => {
    const a = outline[(i - 1 + n) % n], b = outline[(i + 1) % n];
    const nA = norm2(p[1] - a[1], a[0] - p[0]);      // outward normal of edge a->p
    const nB = norm2(b[1] - p[1], p[0] - b[0]);      // outward normal of edge p->b
    const m = norm2(nA[0] + nB[0], nA[1] + nB[1]);
    const k = d / Math.max(0.35, m[0] * nA[0] + m[1] * nA[1]);
    return [p[0] + m[0] * k, p[1] + m[1] * k];
  });
  const inner = offset(lift), outer = offset(lift + thick);
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  shape.holes = [new THREE.Path(inner.slice().reverse().map(([x, y]) => new THREE.Vector2(x, y)))];
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -width / 2);
  const m = new THREE.Mesh(geo, mat);
  // The band closes around the down tube on purpose; it is not the bag's shell.
  m.userData.noCollide = true;
  // extrude runs along local +z; -90 about x turns that into the rig's +y
  m.rotation.x = -Math.PI / 2;
  return m;
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
  // NOTE ON THE SIZE GATE — settled, with the arithmetic, because three rounds
  // have now been spent hunting for a height bug in this file that is not here.
  //
  // tools/eval-auto.mjs measures each spec axis against the axis of the WORLD
  // bounding box that `mount.axes` names, and `TUBE_AXIS` (eval-auto.mjs:83)
  // resolves this record's `perp_downtube` onto world y, disclosing that it
  // "slightly overstates the measured extent on the steepest tubes". On this
  // tube it does not slightly overstate it; the term it adds is the bag's whole
  // LENGTH, and the length is three times the height.
  //
  // framePoly gives a down tube of (420.9, 441.2), i.e. 46.35
  // degrees, so a bag of length L lying along it with depth D on its own
  // perpendicular occupies L*sin46.35 + D*cos46.35 = 0.724L + 0.690D in world
  // y. Run 2026-08-10T18-50-14 reported, for the three products:
  //
  //   1.5L   L 210  D 64.0   predicted 180.0   measured bbox_body y 180.2
  //   1.6L   L 205  D 69.0   predicted 179.4   measured             177.5
  //   1.8L   L 160  D 88.6   predicted 159.3   measured             160.9
  //
  // Every one inside 2mm, which is soft()'s own noise amplitude. The bodies are
  // drawn at their published depth to better than a millimetre; the 177 / 154 /
  // 79 percent "too tall" is the projection and nothing else, and no geometry
  // can satisfy it — a 210mm bag on a 46-degree tube stands 152mm in world y if
  // it has no depth at all, which is already 134% over the published 65.
  // `along_downtube -> x` has the same fault mirrored: bbox x = 0.690L + 0.724D,
  // so the length reads the DEPTH into itself.
  //
  // The fix is a measurement, not a geometry change and not a record rename.
  // tools/bagshot.mjs already has `pts` and `bagRoot.matrixWorld`; one extra box
  // built in the bag root's own frame gives a `bbox_mount_mm` in which
  // along_/perp_ axes are exact for every slot in the catalogue, and axisOf()
  // can read tube-relative names off that instead of projecting. Until then the
  // drawn dimensions here are unchanged and remain straight off dims_cm/render:
  // the depth is right, the gate is measuring the diagonal.
  const aH = Math.min(p.mm.hgt, 150) / 2;             // half-depth, on `perp`
  const bH = Math.min(p.mm.wid, 150) / 2;             // half-width, across the bike
  const len = Math.min(p.mm.len, 380);
  const xs = sectionFor(geom.crossSection, 'd_shape');

  // The chainring-clearance cut. The record calls it "the defining silhouette
  // feature and must not be modelled as a square end", and it has TWO halves.
  //
  // The one that makes it a silhouette is a RAKE in the side elevation: the
  // whole bottom-bracket end face is a diagonal, the corner against the tube
  // cut back furthest and the outer corner barely at all. That is the only
  // direction the cut can run. The ring is a disc about the bottom bracket, so
  // the distance a point on the tail may sit from the BB along the tube is
  //     s(w) = sqrt(R^2 - (w + perp0)^2) - along0,
  // which SHRINKS as the point moves out on the perpendicular — the tube-side
  // corner is the one the ring reaches first, so the tube-side corner is the
  // one that has to go. A bevel taken off the outer corner (v2) or a 14%-deep
  // shave over 22% of the length (v3) both leave the binding corner square,
  // which is why the tail has run into the cranks for three rounds running and
  // why the resolver had to keep pushing the whole pack back up the tube.
  //
  // The second half is the drawing's TOP view: the 8cm plan is full width down
  // the whole non-drive side and swept in on the drive side from ~68% of the
  // width at the BB end out to full width at about 42% of the length. That is
  // the rest of what "asymmetric" means — a symmetric taper cannot clear a
  // chainring that is only on one side of the bike.
  const chamfered = /asymmetric|chainring|crank|diagonal|angled/i.test(feats.shape || '')
    || (geom.taperNarrowEnd === 'tail' && (geom.taperRatio ?? 1) < 1);
  const PLAN_KEEP = 0.68, PLAN_T = 0.42;
  // Run of the rake along the tube. Sized off the DEPTH — a diagonal across a
  // deeper bag is a longer diagonal — and capped at a fifth of the length so it
  // stays a cut corner on the short packs instead of eating the Backcountry's
  // 16cm body a third of the way up.
  const RAKE = chamfered ? Math.min(2 * aH * 0.62, len * 0.22) : 0;
  // x is the section coordinate: -aH is the flat back against the tube, +aH the
  // outer face. Linear, because the cut is a plane.
  const rakeAt = (x) => (RAKE > 0 ? RAKE * (1 - clamp01((x + aH) / (2 * aH))) : 0);
  const planAt = (t) => (chamfered ? Math.min(1, PLAN_KEEP + (1 - PLAN_KEEP) * (t / PLAN_T)) : 1);

  // Both ends of the drawing are close to full depth with a generous corner
  // round, not a taper into a point: on dimensions-1.png the BB end face still
  // stands ~86% of the 6.5cm depth. v2 used 0.65 with a square-root ease, which
  // pulled both ends in hard and is half of why the bag read as a lozenge.
  //
  // Only the NOSE gets it where there is a rake. The rake clamps six or seven
  // rings onto one plane, and those rings keep the section they were lofted
  // with — so easing the tail as well built the cut face out of the pinched
  // 66%-depth sections and the diagonal came out as a funnel instead of a flat
  // cut through a full-depth bag. The cut IS the tail treatment.
  const END_KEEP = 0.78;
  const endEase = (t) => {
    const e = RAKE > 0 ? 1 - t : Math.min(t, 1 - t);
    return END_KEEP + (1 - END_KEEP) * Math.min(1, e / 0.10) ** 0.6;
  };

  const meas = usableProfile(p);
  const taper = geom.taperRatio ?? vr.range(0.86, 0.94);
  const narrowAtBB = geom.taperNarrowEnd !== 'nose';   // every record here says tail
  const taperAt = (t) => 1 + (taper - 1) * (narrowAtBB ? 1 - t : t);

  // Depth carries the record's nose->tail taper; width does NOT taper, because
  // the drawing's plan view runs dead straight down the non-drive side and does
  // all of its narrowing with the one-sided cut below. Tapering `b` as well
  // narrowed both sides and turned the cut into a nub. Neither carries the
  // chamfer any more: a section scale shrinks the bag ABOUT ITS OWN CENTRE and
  // can only ever round the tail off, where the cut is a flat raked face.
  const kA = meas ? (t) => meas(t) : (t) => endEase(t) * taperAt(t);
  const kB = meas ? (t) => meas(t) : (t) => endEase(t);

  const loft = loftBody({
    len, rings: 34, shape: xs,
    sectionAt: (t) => ({
      // The back panel of a flat-backed bag is FLAT. Scaling the section
      // symmetrically lifted its back off the tube at both ends, which is half
      // of the daylight the review measured (11-15px of bare background along
      // the joint); pin every station's back edge to -aH instead.
      a: aH * kA(t), b: bH * kB(t), cu: -aH * (1 - kA(t)),
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
        const lim = bH * kB(t) * planAt(t);
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
  // Solved against the RAKED tail, not against a square one. `clearAt` is how
  // far up the tube a point sitting `w` off the centreline has to start, and it
  // falls away as w grows; `rakeAt` is how far up the tube that point already
  // sits inside the bag. The binding station is wherever the two are closest,
  // which for a 62%-of-depth rake is out in the middle of the face rather than
  // at either corner — so walk the section instead of testing one corner. This
  // is the whole point of drawing the cut: the pack ends up ~30mm further down
  // toward the bottom bracket, which is where every product photo has it.
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
  const tyreR = ctx.points.tireR + ctx.geo.tireWidth / 2 + 20;
  const enterAt = (w) => {
    const A = v3(foot.x + perp.x * w - axle.x, foot.y + perp.y * w - axle.y, 0);
    const h = A.dot(dTube);
    const disc = h * h - (A.lengthSq() - tyreR * tyreR);
    return disc > 0 ? -h - Math.sqrt(disc) : Infinity;
  };
  let sTyre = Infinity;
  for (let i = 0; i <= 12; i++) {
    const t = 0.4 + 0.6 * (i / 12);                    // only the nose half can reach it
    sTyre = Math.min(sTyre, enterAt(Pc - aH + 2 * aH * kA(t)) - t * len);
  }
  // The tyre wins where the two fight — a tail inside the chainring's tip
  // circle is contact with something this slot MOUNTS to and is allowed 8mm,
  // a tyre is never allowed anything. Floored at the tube's own BB end: a pack
  // too long to fit in the window between them (see report — several are, on
  // this frame) is the resolver's problem, and its escape route for this slot
  // is already back down the tube. Reversing it through the bottom bracket here
  // would only move the clash somewhere the resolver cannot see.
  const sTail = Math.max(0, Math.min(sRing, sTyre));

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
  const backcountry = /backcountry/i.test(p.line || '');
  const twoTone = !!accent && !accent.color.equals(main.color);
  const shell = backcountry && twoTone ? accent : main;
  const hyp = shell.clone();
  hyp.roughness = Math.max(0.3, (shell.roughness ?? 0.9) - 0.45);
  if (twoTone) hyp.color.copy(backcountry ? main.color : accent.color);
  else {
    // Monochrome colourway: Hypalon still has to read as a different material
    // or the welded panels vanish, which is what "a uniform black lozenge"
    // means. Shift it clear of the shell in whichever direction there is room.
    const hsl = { h: 0, s: 0, l: 0 };
    shell.color.getHSL(hsl);
    hyp.color.copy(shell.color).lerp(new THREE.Color(hsl.l < 0.35 ? 0xffffff : 0x000000), 0.22);
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
  if (backcountry) {
    // The sleeve stands 1mm proud on the flanks and 2mm on the outer face, and
    // its tube-side edge is tucked 4mm INSIDE the shell's back panel. Wrapping
    // it right round instead put two surfaces on the same plane against the
    // tube — z-fighting, and the contact clamp below then pushed both onto
    // exactly the same radius, which welds the artefact in place.
    const sleeve = loftBody({
      len: len * SLEEVE_T, rings: 24, shape: xs, capStart: false, capEnd: false,
      sectionAt: (u) => {
        const t = u * SLEEVE_T;
        return { a: aH * kA(t) - 1.0, b: bH * kB(t) + 1.0, cu: -aH * (1 - kA(t)) + 3.0 };
      },
    });
    const pos = sleeve.geo.attributes.position;
    const topY = len * SLEEVE_T;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      let y = pos.getY(i);
      const z = pos.getZ(i);
      // The sleeve wraps the lower two thirds, so it wraps the raked end: cut
      // it on the same plane, 1.5mm short of the shell's, or it hangs over the
      // cut as a flap of Hypalon in front of the chainring.
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
        const lim = bH * kB(clamp01(y / len)) * planAt(clamp01(y / len)) + 1.0;
        if (z > lim) pos.setZ(i, lim);
      }
    }
    pos.needsUpdate = true;
    sleeve.geo.computeVertexNormals();
    const sm = hyp.clone();
    sm.side = THREE.DoubleSide;            // an open shell, seen from the rim
    bag.add(new THREE.Mesh(sleeve.geo, sm));
  }

  // ---- the strap ---------------------------------------------------------
  // One strap: "there is one connection point on the bag, and you have two on
  // the bike in the 3D model." Width tracks the bag's own girth — the 1.8L
  // record quotes a 4cm strap on a 9.5cm-wide bag.
  const strapW = Math.max(24, Math.min(44, bH * 0.84));
  // A little under half way along, from the drawing: the band crosses the body
  // well tailward of the roll so the roll can still be turned down over it.
  const tStrap = backcountry ? 0.36 : 0.45;
  const { pts: unit } = sectionUnit(xs, { detail: 5 });
  const secAt = (t) => unit.map(([u, v]) => [u * (aH * kA(t)) - aH * (1 - kA(t)), v * (bH * kB(t))]);
  const secPts = secAt(tStrap);
  // Everything that lies ON the bag has to clear whatever is already there. On
  // the Backcountry that is the sleeve, which stands 1mm proud on the flanks
  // and 2mm on the outer face; without this the strap panel, the band and the
  // logo were all buried inside it or co-planar with it.
  const over = backcountry ? 2.2 : 0;

  // The Hypalon backing panel the velcro is stitched to, around the bag's girth
  // only, then the band itself around bag AND tube together.
  const backing = bandMesh(hull2(secPts), hyp, { thick: 1.7, width: strapW * 1.5, lift: 0.8 + over });
  backing.position.set(0, tStrap * len, 0);
  bag.add(backing);

  const ring = [];
  for (let i = 0; i < 26; i++) {
    const th = (i / 26) * Math.PI * 2;
    ring.push([Math.cos(th) * dtR, Math.sin(th) * dtR]);
  }
  const band = bandMesh(hull2([...secPts.map(([x, z]) => [x + Pc, z]), ...ring]), wm,
    { thick: 2.6, width: strapW, lift: 2.6 + over });
  band.position.set(0, sTail + tStrap * len, 0);
  rig.add(band);

  // Where the velcro overlaps, on the frame side of the tube (on-bike-1.jpg).
  const tab = new THREE.Mesh(new THREE.BoxGeometry(3, strapW * 0.92, dtR * 1.15), wm);
  tab.position.set(-(dtR + 6), sTail + tStrap * len, 0);
  tab.userData.noCollide = true;
  rig.add(tab);

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
  if (!backcountry) {
    const yS = tStrap * len;
    // …and the rearward arm has to stop above the raked end, or it hangs off
    // the cut face into the space the cut was made to clear.
    const armY = Math.min(len * 0.26, len * (1 - tStrap) * 0.7, (yS - RAKE) * 0.9);
    const armT = Math.max(9, len * 0.055);              // the band's own width
    const xA = -aH * 0.30;                              // apex, up toward the tube
    const xE = aH * 0.92;                               // out at the outer face
    for (const s of [-1, 1]) {
      const zF = s * (bH * kB(tStrap) + 1.2);
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
  if (p.closure?.type === 'rolltop') {
    const kN = kA(1);
    const rN = Math.max(aH * kN, 4);
    const rolls = p.closure.rolls || 3;
    const foldH = Math.max(rN * 0.3, 5);
    const roll = rollTop(backcountry ? shell : hyp, hwm, {
      r: rN, depth: rN * 0.9, rings: rolls,
      widthScale: (bH * kB(1)) / rN, back: false,
    });
    // rollTop is built in ITS xy plane stacking toward +z, x being the lip's
    // width: send x across the bike and z up the tube. Its buckle sits at
    // NEGATIVE local y, so local y has to point back at the tube for the
    // buckle to end up on the outer face — mapped the other way round the tab
    // hangs 10mm inside the down tube.
    roll.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(v3(0, 0, -1), v3(-1, 0, 0), v3(0, 1, 0)));
    // …and it is seated INSIDE `len`. `len` is render.len_cm, the maker's MIN —
    // the length WITH the roll turned down — so a roll stacked on top of a
    // full-length body overshoots the published figure by its own stack height.
    const stack = rN * 0.9 * 0.16 + foldH * rolls * 0.66 + foldH * 0.6;
    roll.position.set(-aH * (1 - kN), len - stack, 0);
    bag.add(roll);
  }

  // Logo on the flank, reading ALONG the bag as it does on the real one — the
  // patch plane is laid out long-axis-on-x, so it needs the quarter turn.
  // Kept clear of the chevron, down at the BB end where studio-2.jpg has it —
  // but ABOVE the rake. A fixed 0.42 * len patch at t = 0.15 started 30mm below
  // the cut on every one of these three and hung in the air off the tail.
  const yA = RAKE + len * 0.04, yB = tStrap * len - len * 0.05;
  const logoLen = Math.max(Math.min(len * 0.30, (yB - yA) * 0.9), len * 0.12);
  const tLogo = clamp01((yA + yB) / 2 / len);
  const tag = patch(bag, brand, aH * 0.1, tLogo * len, bH * kB(tLogo) + 1.4 + over, logoLen, 0);
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
    rig.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      for (let n = o; n && n !== rig; n = n.parent) if (n.userData?.noCollide) return;
      const M = new THREE.Matrix4().multiplyMatrices(toRig, o.matrixWorld);
      const Mi = M.clone().invert();
      const pos = o.geometry.attributes.position;
      let moved = false;
      for (let i = 0; i < pos.count; i++) {
        q.fromBufferAttribute(pos, i).applyMatrix4(M);
        const d = Math.hypot(q.x, q.z);
        if (d >= lim || d < 1e-3) continue;
        const k = lim / d;
        q.x *= k; q.z *= k;
        q.applyMatrix4(Mi);
        pos.setXYZ(i, q.x, q.y, q.z);
        moved = true;
      }
      if (moved) { pos.needsUpdate = true; o.geometry.computeVertexNormals(); }
    });
  }

  return shadowify(grp);
}
