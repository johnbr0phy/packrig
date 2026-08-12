// Top tube bag builders (mm-local). buildToptubeRear is buildToptube mirrored
// and placed at the seat-tube end of the tube, so both live here.
//
// AXIS MAPPING — every record in this slot agrees (`mount.axes` reads
// len: along_toptube, wid: z, hgt: y on all 14 Apidura packs), and the makers'
// side elevations in assets/products/<brand>/full/*/dimensions-*.png confirm it:
//   p.mm.len -> group +x, along the top tube, +x pointing FORWARD to the stem
//   p.mm.hgt -> group +y, up from the tube crown; y = 0 is the bag's base
//   p.mm.wid -> group +z, across the bike
// The geometry's -x end is therefore the REAR of the bag and its +x end the
// stem end. Everything positional is derived from ctx.points / ctx.anchors; the
// only literals are millimetre offsets off those (EMBED, the 38mm stem setback).

import * as THREE from 'three';
import { v3, tubeAlong, tubeBetween } from '../../lib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boxBulge, deformScale } from '../deform.js';
import { seamStrip } from '../hardware.js';
import { reflectiveMat } from '../features.js';
import { axesOf, geomOf, stiffnessOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';

const DEG = Math.PI / 180;

/**
 * The falloff `boxBulge` applies across each face — deform.js:139, copied
 * (it is not exported) so this builder can predict where the finished surface
 * ends up and hang its trim ON it instead of at the pre-bulge core.
 */
const fall = (t) => Math.max(0, 1 - Math.min(Math.abs(t), 1) ** 2.2) ** 0.6;

/**
 * Repaint the body's per-vertex shade so a panel split reads as a colour
 * change ON the shell.
 *
 * shadeAO() writes a greyscale multiplier into the geometry's `color`
 * attribute and soft() returns the mesh with a vertexColors material, so this
 * attribute is the one place a two-tone panel, a lid or a seam can live
 * WITHOUT a second mesh. That matters here: the v2 review's two standing
 * complaints about this slot were "the same featureless soft black pillow" and
 * "zero-thickness hardware ... paper stuck to the bag", and a flat accent slab
 * floating 1mm off the side — which is what this builder used to draw — is
 * both at once.
 *
 * `at` is called with the BODY-LOCAL vertex position and normal and returns a
 * multiplier: >1 lightens (a grey panel over a black shell), <1 darkens (the
 * stitch line at its edge), 1 leaves the vertex alone.
 */
function tint(geo, at) {
  const col = geo.attributes.color;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  if (!col || !nor) return;
  for (let i = 0; i < col.count; i++) {
    const k = at(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i));
    if (k === 1) continue;
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  col.needsUpdate = true;
}

/**
 * The top line of a top tube pack, measured off the makers' own dimensioned
 * side elevations rather than guessed.
 *
 * Every one of these bags used to be drawn as a single curve tapering over its
 * whole length to a knife edge at the rear. Not one drawing shows that. Column
 * scans of Apidura's elevations (tools were throwaway; the numbers are below,
 * as fractions of length from the REAR and of full height) show the same three
 * pieces every time:
 *
 *   a rear END FACE raked steeply back up from the base, then a straight
 *   CHAMFER over the rear-upper corner, then a DEAD FLAT top over the front.
 *
 *   drawing (dimensions-*.png)          rake ends at   flat top starts at
 *   expedition 0.6L   23.5 x 7          x .043  h .65        x .34
 *   expedition 1L     23.5 x 10         x .120  h .60        x .42
 *   expedition bolt-on 1L 23 x 10       x .085  h .53        x .39
 *   backcountry 1L    23 x 10           x .050  h .50        x .46
 *   racing 1L         23.5 x 10         x .130  h .65        x .39
 *   canyon collab 1L  23.5 x 10         x .130  h .65        x .38
 *   backcountry long 1.8L 37 x 10       x .032  h .60        x .51
 *   racing long 2L    44 x 10           x .090  h .55        x .61
 *
 * The rake measures 58-74 degrees off horizontal (62 used here). The chamfer
 * is the piece that splits by `form`: 29-31 degrees on the six short
 * `trapezoid_panel` packs, 13 degrees on the two long `tapered_wedge` blades —
 * which is why the long ones reach full height so much further forward. A
 * `slab` (Apidura's Aero modules) has no chamfer at all: its elevation is a
 * constant-depth parallelogram whose rear end is a single ~52-degree rake
 * (measured 215px of run against 273px of rise on aero-top-tube-module
 * dimensions-1.png, where 22cm = 990px).
 *
 * `tail` is the record's `geometry.taper.tail` — the height the rear end still
 * stands at, where the rake meets the chamfer. It is a ratio, so it survives a
 * dimension correction underneath it.
 *
 * Returns { at(t), tip, tJ, tF } with t = 0 at the geometry's rear end and 1 at
 * its stem end.
 */
function topProfile({ len, h, tail, form, topLine }) {
  // The extreme rear corner is a rounded cap, not the top of the rake: the
  // drawings bottom out at 0.10-0.28 of full height there. A slab's rear
  // corner is a sharp parallelogram edge, so it runs down almost to the base.
  const tip = form === 'slab' ? 0.06 : Math.min(0.18, tail * 0.4);
  // THE SECOND FAMILY. Everything below this line — rear rake, chamfer, dead
  // flat over the front — was measured off five Apidura elevations and is
  // documented as such in this function's header. It is right for Apidura and
  // it is not universal: Tailfin publish a CONTINUOUS fall over the whole
  // length for their top tube packs (115mm to 68mm on the 3L Long), which is
  // the "teardrop design for an unobstructed ride" the range is sold on.
  // Drawn with the stepped profile, such a bag is full-depth over its front
  // two thirds and does all its tapering in the back third — which is a
  // different object, and it was reported as "no taper at all" even though the
  // taper ratio was arriving intact.
  //
  // Absent means stepped, so the 95 products that have not measured a top line
  // keep exactly the shape they have.
  if (topLine === 'continuous') {
    // The extreme rear corner still caps off — a rolled or welded end is not a
    // knife edge on any drawing in the slot — but from there the top rises in
    // ONE straight run to full height at the stem end.
    const tJ = 0.08;
    return {
      tip,
      tJ,
      tF: 1,
      at(t) {
        if (t <= 0) return tip;
        if (t < tJ) return tip + (tail - tip) * (t / tJ);
        return tail + (1 - tail) * ((t - tJ) / (1 - tJ));
      },
    };
  }
  const rakeDeg = form === 'slab' ? 52 : 62;
  const chamDeg = form === 'tapered_wedge' ? 13 : 30;
  let rakeRun = ((tail - tip) * h) / Math.tan(rakeDeg * DEG);
  let chamRun = ((1 - tail) * h) / Math.tan(chamDeg * DEG);
  // A short bag with a deep taper wants more run than it has length. Scale both
  // pieces together rather than clipping one, so the rake:chamfer proportion —
  // the thing that distinguishes a wedge from a trapezoid panel — survives, and
  // the bag simply becomes a full-length wedge with no flat top.
  const span = Math.max(rakeRun + chamRun, 1e-6);
  if (span > len * 0.92) {
    const k = (len * 0.92) / span;
    rakeRun *= k;
    chamRun *= k;
  }
  const tJ = Math.max(rakeRun / len, 1e-4);             // top of the rear end face
  const tF = Math.max((rakeRun + chamRun) / len, tJ);   // where the flat top begins
  return {
    tip,
    tJ,
    tF,
    at(t) {
      if (t <= 0) return tip;
      if (t < tJ) return tip + (tail - tip) * (t / tJ);
      if (t < tF) return tail + (1 - tail) * ((t - tJ) / (tF - tJ));
      return 1;
    },
  };
}

/**
 * How the bag actually attaches, read from the catalogue's own prose.
 *
 * Four Apidura SKUs bolt through a base plate into the frame's threaded
 * mounts and carry no top-tube straps at all — their records say so twice
 * (`straps: []` or steerer-only, and `mount.attachesTo: top_tube_bosses`) —
 * but neither block is merged into data/brands.json, so the only signal that
 * reaches a builder is `features.attachment`. All 14 Apidura packs in this slot
 * carry it and it parses cleanly; 84 of the 100 products in the slot do not,
 * and those keep the two-straps-plus-steerer default the builder always used.
 */
function mountPlanOf(p) {
  const txt = String(p?.features?.attachment || '');
  const DEFAULT = { bolted: false, tubeStraps: 2, steerer: true, post: 0, boltSpan: 64 };
  if (!txt) return DEFAULT;
  const WORD = { one: 1, two: 2, three: 3, four: 4 };
  const count = (s, dflt) => {
    const m = /\b(\d+|one|two|three|four)\b/i.exec(s || '');
    if (!m) return dflt;
    const w = m[1].toLowerCase();
    return Math.max(0, Math.min(4, WORD[w] ?? parseInt(w, 10)));
  };
  const clauses = txt.split('+');
  const bolted = /\bbolt/i.test(clauses[0]);
  const postClause = clauses.find((c) => /seatpost/i.test(c));
  // "bolt spacing 6.4 cm" is on every bolt-on record's dims_raw and is
  // dimensioned on the drawings (apidura-x-canyon dimensions-1, second view).
  const span = /bolt spacing\s*([\d.]+)\s*cm/i.exec(String(p?.dims_raw || ''));
  return {
    bolted,
    tubeStraps: bolted ? 0 : count(clauses[0], 2),
    steerer: /steerer/i.test(txt),
    post: postClause ? count(postClause, 1) : 0,
    boltSpan: span ? Math.max(30, Math.min(120, parseFloat(span[1]) * 10)) : 64,
  };
}

/**
 * Rear top-tube sack: the same construction mirrored, standing in the
 * seat-tube corner instead of behind the stem.
 */
export function buildToptubeRear(p, brand, main, accent, ctx, side) {
  return buildToptube(p, brand, main, accent, ctx, side, 'toptubeRear');
}

// NOTE: the builder call signature is (product, brand, main, accent, ctx, side) —
// anchorName must come AFTER `side`, or it receives the side integer and the
// anchor lookup silently becomes ctx.anchors[1].
export function buildToptube(p, brand, main, accent, ctx, side, anchorName = 'toptube') {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const geom = geomOf(p);
  const axes = axesOf(p);
  const plan = mountPlanOf(p);
  // brands.json's own per-product feature flags. They are the finest-grained
  // thing that reaches this builder — they vary WITHIN a maker's range, not
  // across it — and nothing in this slot read them: 12 of the 14 Apidura packs
  // carry `reflective`, 11 carry `cablePort`, exactly the three Aero modules
  // carry `transferPanel`, and the Canyon collab carries none of the three.
  const ft = (p && p.features) || {};
  // The brand's own accent colour, from the brand record's `palette` — index 3
  // is the accent slot in every one of the 48 brand records (Apidura #e2572b,
  // Ortlieb #c1121f, Restrap #f4661b, Tailfin #d0021b). Where a brand record is
  // shorter than four entries there is no accent and the hardware colour stands.
  const hiHex = Array.isArray(brand?.palette) && brand.palette.length > 3 ? brand.palette[3] : null;
  // soft | semi | rigid, from the model records — see stiffnessOf().
  const stiff = stiffnessOf(p);
  const len = Math.min(p.mm.len, 460), h = Math.min(p.mm.hgt, 220), w = Math.min(p.mm.wid, 170);
  // A rear top-tube pack is the same bag turned round: it butts the seat tube
  // with its TALL end and slopes away forward. Apidura's Backcountry Rear pack
  // record says exactly that ("the rear edge is vertical and hugs the
  // seatpost, the front edge slopes forward-down onto the top tube").
  //
  // It is decided by the RECORD, not only by which slot routed the call.
  // data/brands.json files that pack under `slot: "toptube"`, so it arrives
  // here through buildToptube and used to be drawn behind the stem, mirrored —
  // the fault the owner rejected in v2. Its own model record has said
  // `slot_should_be: "toptube_rear"` all along and apply-models.mjs only
  // REPORTS that field, by design ("reslotting ... is a decision, not a
  // merge"). Straps to the SEATPOST are the thing that actually distinguishes
  // this bag, they are already parsed out of the record's own prose by
  // mountPlanOf, and across all 101 products in this slot exactly one carries
  // them — so keying on it moves that pack and nothing else.
  const rear = anchorName === 'toptubeRear' || plan.post > 0;
  const P = ctx.points;
  // The bag is parented to the anchor its UI SLOT names (system.js:52), so the
  // anchor stays whatever we were handed — everything positional below is a
  // world coordinate with the anchor subtracted back off at the end, which is
  // what lets a pack filed under `toptube` still be placed at the seat-tube end.
  const anchor = ctx.anchors[anchorName].position;
  const hd = v3(P.hd.x, P.hd.y, 0);
  const sd = v3(P.sd.x, P.sd.y, 0);
  const ttSeat = P.seatTop.clone().addScaledVector(sd, -12);
  const ttHead = P.headTop.clone().addScaledVector(hd, 30);
  // The top tube's TRUE angle: bike.js:108-110 draws the tube mesh between
  // exactly these two points, so this is the frame's own line, not a guess at
  // it. It measures 7.15 degrees nose-up on the stock geometry.
  const ang = Math.atan2(ttHead.y - ttSeat.y, ttHead.x - ttSeat.x);
  // Both top-tube anchors are built as <tube end> + (dx, ttR, 0) — bike.js:906
  // for the stem end, :909 for the seat-tube end — so the tube radius reads
  // back as the anchor's height above the tube end it was built from. Measuring
  // against ttHead unconditionally is why buildToptubeRear got 10mm instead of
  // 16 and sat its bag down inside the tube.
  const ttEnd = Math.abs(anchor.x - ttHead.x) <= Math.abs(anchor.x - ttSeat.x) ? ttHead : ttSeat;
  const ttR = Math.min(Math.max(anchor.y - ttEnd.y, 10), 26); // anchor sits on the tube crown
  const EMBED = 10;
  // The measured rear-end height, from the record, with the old guess kept only
  // where the record is silent. BUILDER-BRIEF §1: use the measured value.
  const tail = Math.min(Math.max(geom.taperRatio ?? vr.range(0.5, 0.65), 0.15), 1);
  const prof = topProfile({ len, h, tail, form: geom.form, topLine: geom.topLine });
  const hFactor = (t) => prof.at(t);

  // ---- PILLOW BUDGET ----------------------------------------------------
  //
  // THE SIZE BUG, and it is one line of arithmetic repeated on two axes.
  //
  // A maker publishes the size of the FINISHED bag, measured across the widest
  // point of the stuffed panel. This builder was cutting the core box at
  // exactly the published figure and THEN running soft() over it — and soft()
  // adds the pillow bulge (`min(len,h,w) * 0.09`, which in this slot is always
  // 0.09*wid because width is always the smallest of the three) plus the noise
  // amplitude OUTSIDE that figure, on every face. So every pack came out one
  // whole pillow too big in each direction. Measured on run
  // 2026-08-10T16-05-02-v2-fixes: bbox z was 54.0mm against a published 45 and
  // 60.6mm against a published 50 — +20% to +23% on all 14 packs, +4.5 to
  // +5.0mm per side, which is exactly `0.09*wid + noise`.
  //
  // The core is now cut UNDER the published size by that budget, so the pillow
  // crests ON it. Nothing is scaled: length is untouched (it measured +1 to
  // +3%, already inside tolerance, and the rake at the rear end cancels most
  // of the tilt) and the profile, taper and plan curves are all unchanged.
  const noiseAmp = vr.range(1.7, 2.5);
  const noiseFreq = vr.range(0.034, 0.046);
  const puffAmt = Math.min(len, h, w) * 0.09;
  // soft() scales the bulge AND the noise by deformScale(stiffness) and skips
  // the pass entirely at `rigid` — so a moulded shell (Topeak's DryShell,
  // VAUDE's Trailtop, the other structured boxes in this slot) budgets nothing
  // and keeps its full published section. The noise is signed fbm and only
  // rarely peaks, so it is budgeted at half amplitude; the bulge is budgeted in
  // full because it is a one-sided push that peaks at the centre of every face.
  const K = deformScale(stiff);
  const puff = (puffAmt + noiseAmp * 0.5) * K;
  const wCore = Math.max(w - 2 * puff, w * 0.55);
  // Height is budgeted at the CROWN only. The downward half of the pillow goes
  // into EMBED — the 10mm the base already sits inside the tube crown — so
  // taking it all off the top keeps the base flat on the tube instead of
  // lifting the bag off it, which is the failure the v2 seat packs shipped.
  const hCore = Math.max(h - puff, h * 0.55);
  // With the base plane parallel to the tube, the tube centreline stays at a
  // constant height in bag space — so the underside can be a fixed channel.
  const tubeY = EMBED - ttR;
  // The trough the tube nests into. Its radius is set by the TUBE, not by the
  // bag's width — the channel surface sits exactly `chanR` from the tube axis,
  // so any chanR below ttR is penetration by construction. Tying it to the
  // half-width (as `w/2 - 3` did) meant the pillow budget above, which narrows
  // the core, would have dug every pack 2.5mm deeper into the tube: measured
  // -8.4mm against the -5.9mm of the v2 run, past the audit's 8mm contact
  // allowance. Where the trough is wider than the bag the clamp to 0 below
  // simply flattens it out at the edges. Capped so it cannot swallow a shallow
  // bag whole.
  const chanR = Math.min(ttR + 2, Math.max(-tubeY + hCore * 0.42, 4));
  // Corner radius from the record's own `geometry.shoulder`, which
  // apply-models.mjs has been merging since 8 Aug and this builder ignored: it
  // reads `squared` on the Expedition, Aero and Canyon packs and `rounded` on
  // every Backcountry and Racing one. A flat 0.22 of the width drew all four
  // ranges as the same softly rounded box, which is the first reason fourteen
  // different packs read as one. Still clamped against the height so the base
  // stays broad and flat on the tube.
  const SHOULDER_K = { squared: 0.10, chamfered: 0.13, none: 0.16, rounded: 0.26, pointed: 0.30 };
  const corner = Math.min(wCore * (SHOULDER_K[geom.shoulder] ?? 0.22), hCore * 0.3, 12);
  const bulge = boxBulge(len / 2, hCore / 2, wCore / 2, puffAmt);
  // Plan view. The drawings dimension these as a constant width ("Width: 4.5
  // cm" on the whole Backcountry/Racing line, "Tapered Width: 5 - 4 cm" across
  // the SECTION on the Expedition) — the old builder pinched the whole length
  // to 0.62 and made every pack read as a pencil. Only the rear cap converges,
  // over the same run as the end-face rake.
  const PLAN_TIP = 0.66;
  const wFactor = (t) => PLAN_TIP + (1 - PLAN_TIP) * Math.min(1, Math.max(t / prof.tJ, 0));
  // Which end the taper narrows at. Apidura's convention in this slot — and the
  // majority one — is nose = stem end, tail = rear end, so `tail` above is the
  // rear. Nine products in the slot write it the other way round (Tailfin's two
  // Rear Top Tube Bags, Rockgeist's saddle-side medic pack, Restrap Race Short,
  // Green Guru Tanker …, all nose < tail = 1), and geomOf exposes which it is.
  // The old builder ignored it and pinned the narrow end at -x, so every one of
  // those nine was drawn back to front — the bug geomOf's own doc warns about.
  const flip = geom.taperNarrowEnd === 'nose';
  // true when the DEEP end faces forward instead of rearward
  const mirrored = rear !== flip;
  /** t along the body: 0 at the rear end, 1 at the stem end. */
  const tAt = (t) => (mirrored ? 1 - t : t);
  /** Fraction along the geometry at a group-local x. 0 = its rear end. */
  const uAt = (x) => Math.min(Math.max((x - 10) / len + 1, 0), 1);
  /** Where the pillow has pushed a face out, at a group-local x. deform.js:145. */
  const puffAt = (x, other = 0) => puffAmt * K * fall((x - 10 + len / 2) / (len / 2)) * fall(other);
  /**
   * Height of the FINISHED crown at a group-local x — core profile plus the
   * pillow that sits on top of it. Trim hung at the old `h * hFactor(t)` was
   * buried by the bulge, which is why the v2 review found no zip line on any
   * of the 14: the zip rode 3mm under a surface the pillow had lifted ~4mm.
   */
  const hAtLocal = (x) => hCore * hFactor(tAt(uAt(x))) + puffAt(x);
  /**
   * Half-width of the finished side face at a group-local x and height y —
   * the plan taper plus the pillow. Side trim used to sit at a flat `w/2+1.6`,
   * which floats it clear of a rear cap the plan curve pinches to 0.66.
   */
  const zAtLocal = (x, y) => (wCore / 2) * wFactor(tAt(uAt(x)))
    + puffAt(x, (y - hCore / 2) / (hCore / 2));
  const shapedBox = (() => {
    // A SUBDIVIDED box, rounded by hand, not RoundedBoxGeometry.
    //
    // This is why every pack in this slot came out as one straight wedge no
    // matter what profile the builder asked for. RoundedBoxGeometry subdivides
    // only its corner fillets: at the segment count we used, its 235mm-long top
    // face held exactly TWO vertex columns, 211mm apart. Scaling y per vertex
    // across a single quad can only ever produce a straight ramp between the
    // ends, so a flat top with a chamfer behind it was not expressible — the
    // taper was linear by construction. 44 length segments put a column every
    // ~5mm, and 8 across the width give the underside channel below something
    // to bite on (it also had two, one per bottom corner).
    const g = new THREE.BoxGeometry(len, hCore, wCore, 44, 8, 8);
    const pos = g.attributes.position;
    // Round the edges by projection: clamp into the inner box, then push back
    // out by the corner radius. Vertices on a flat face are already at radius
    // and do not move, so this keeps the panel flat and only fillets the edges.
    const ex = Math.max(len / 2 - corner, 0), ey = Math.max(hCore / 2 - corner, 0), ez = Math.max(wCore / 2 - corner, 0);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const cx = Math.min(Math.max(x, -ex), ex), cy = Math.min(Math.max(y, -ey), ey), cz = Math.min(Math.max(z, -ez), ez);
      const dx = x - cx, dy = y - cy, dz = z - cz;
      const d = Math.hypot(dx, dy, dz);
      if (d > 1e-6) pos.setXYZ(i, cx + (dx / d) * corner, cy + (dy / d) * corner, cz + (dz / d) * corner);
    }
    for (let i = 0; i < pos.count; i++) {
      const t = tAt(Math.min(Math.max(pos.getX(i) / len + 0.5, 0), 1));
      // scale about the BASE, not the centre — scaling about the centre lifts
      // the underside as it lowers the crown, floating the bag off the tube
      pos.setY(i, -hCore / 2 + (pos.getY(i) + hCore / 2) * hFactor(t));
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
    // Every vertex that lies inside the trough is lifted ONTO it, whichever way
    // its normal happens to point. The old test (`normal.y < -0.6`) relieved the
    // flat bottom face and nothing else, so the two end-cap fillets were left on
    // the bag's base plane — which sits EMBED below the tube crown, making them
    // the deepest points of the whole bag: 8.2mm inside the top tube against the
    // 8mm the clearance audit allows for a contact face, at both ends, on every
    // pack in the slot. A trough is where the tube goes; it does not stop at the
    // last vertex whose normal points straight down.
    for (let i = 0; i < pos.count; i++) {
      const s = chanR * chanR - pos.getZ(i) ** 2;
      if (s <= 0) continue;
      const floorY = -hCore / 2 + Math.max(tubeY + Math.sqrt(s), 0);
      if (pos.getY(i) < floorY) pos.setY(i, floorY);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  })();
  const body = soft(shapedBox, main, {
    amp: noiseAmp, freq: noiseFreq, seed: vr.seed % 937,
    stiffness: stiff,
    bulge,
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.45,
  });
  // The core is hCore tall and its base is the bag's base, so the body sits at
  // hCore/2, not h/2 — parking it at h/2 would lift the whole bag `puff` clear
  // of the tube it is strapped to.
  body.position.set(-len / 2 + 10, hCore / 2, 0);
  grp.add(body);
  const wm = webbing();
  const hwm = hardware();
  // Cord pulls, tags and zip grabs take the brand's accent where the brand
  // record names one. This replaces nothing in this file but is the same
  // channel stembag.js now uses in place of its `{ Apidura: 0xf2d21c }` table.
  const hiMat = hiHex != null
    ? new THREE.MeshStandardMaterial({ color: new THREE.Color(hiHex), roughness: 0.5 })
    : hwm;
  // ---- closure ----------------------------------------------------------
  // `magnetic` is exactly the fold-over-lid family: Apidura's Racing packs,
  // the Racing bolt-on, the Canyon collab and the Aero modules. Their records
  // spell it out — "magnetic flip-top lid ... There is NO zip on this pack" —
  // and we were drawing a zip along the crown of every one of them.
  const magnetic = p?.closure?.type === 'magnetic';
  // +1.2 sits the trim ON the finished surface. It used to be -3 against a
  // pre-pillow crown, i.e. ~4mm INSIDE the bag — which is why the v2 critics
  // reported "no zip line" on all fourteen: it was there, and buried.
  const crownAt = (t) => { const x = 10 - len * (1 - t); return v3(x, hAtLocal(x) + 1.2, 0); };
  /** A welt: a raised binding in the shell colour, lifted so it catches light. */
  const weltMat = main.clone();
  weltMat.color.multiplyScalar(1.9);
  const welt = (points, r) => {
    const m = tubeAlong(points, r, weltMat, { segments: Math.max(24, points.length * 8), radialSegments: 6 });
    m.userData.noCollide = true;
    return m;
  };
  // The fold-over lid line, shared by the seam that draws it and the tint that
  // shades the panel it bounds, so the two can never disagree. Read off
  // racing-top-tube-pack dimensions-2 and apidura-x-canyon dimensions-1: one
  // line leaves the rear-upper corner, runs forward and DOWN to about 0.62 of
  // the length at a fifth of the height, then sweeps back up to the stem-end
  // corner. `t` is the fraction along the geometry, `y` a fraction of h.
  const lidLine = mirrored
    ? [[0.06, 0.86], [0.38, 0.22], [0.72, 0.58], [0.9, tail]]
    : [[0.1, tail], [0.28, 0.58], [0.62, 0.22], [0.94, 0.86]];
  /** The lid boundary height (absolute, group mm) at a fraction u along the geometry. */
  const lidYAt = (u) => {
    if (u <= lidLine[0][0]) return h * lidLine[0][1];
    for (let i = 0; i < lidLine.length - 1; i++) {
      const [t0, y0] = lidLine[i], [t1, y1] = lidLine[i + 1];
      if (u <= t1) return h * (y0 + (y1 - y0) * ((u - t0) / (t1 - t0)));
    }
    return h * lidLine[lidLine.length - 1][1];
  };
  if (magnetic && geom.form === 'slab') {
    // The Aero modules close with "a fast-entry magnetic slit along the top
    // ridge", and their records carry `zips: []`. A slit is a seam, not a zip.
    grp.add(welt([0.08, 0.34, 0.66, 0.96].map(crownAt), 1.4));
  } else if (magnetic) {
    const sx = (t) => 10 - len * (1 - t);
    const pts = lidLine.map(([t, y]) => v3(sx(t), h * y, 0));
    for (const s of [1, -1]) {
      grp.add(welt(pts.map((q) => v3(q.x, q.y, s * (zAtLocal(q.x, q.y) + 1.1))), 2));
    }
    // The magnet patch, a moulded diamond proud of the lid on
    // racing-top-tube-pack studio-2 — given real thickness and seated into the
    // shell rather than drawn as a sheet (v3 brief, "zero-thickness hardware").
    const magnet = new THREE.Mesh(new RoundedBoxGeometry(Math.min(38, len * 0.2), 3.4, Math.min(26, w * 0.6), 2, 1.4), hwm);
    const mx = 10 - len * (mirrored ? 0.82 : 0.18);
    magnet.position.set(mx, hAtLocal(mx) - 0.6, 0);
    magnet.userData.noCollide = true;
    grp.add(magnet);
  } else {
    // the zip rides the crown in two runs — one up the chamfer, one along the
    // flat top — because a single straight chord between the ends sinks into
    // the body wherever the profile is not straight.
    const stations = [0.06, 0.3, 0.6, 0.96].map(crownAt);
    for (let i = 0; i < stations.length - 1; i++) {
      grp.add(tubeBetween(stations[i], stations[i + 1], 2, 2, hwm, 8));
    }
    // The slider and its pull tab: a cord through a moulded hexagonal grab tab
    // off the side of the zip, in the brand's accent where it has one. It is
    // the detail that reads first in these makers' own photographs.
    //
    // `zip_two_way` means TWO sliders, one parked at each end, and it is
    // carried per product in the controlled `closure.type` apply-models merges.
    // Exactly the two long blades in this range have it (Backcountry Long 1.8L,
    // Racing Long 2L); drawing every pack with one slider at the stem end is
    // part of why the whole slot read as fourteen copies of one bag.
    const ends = p?.closure?.type === 'zip_two_way' ? [0.08, 0.92] : [mirrored ? 0.9 : 0.1];
    for (const f of ends) {
      const sx = 10 - len * f;
      const slider = new THREE.Mesh(new RoundedBoxGeometry(13, 4, 6, 2, 1.6), hwm);
      slider.position.set(sx, hAtLocal(sx) + 1.2, 0);
      const tabZ = zAtLocal(sx, hAtLocal(sx) - 8);
      const grab = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 2.2, 6), hiMat);
      grab.rotation.x = Math.PI / 2;
      grab.position.set(sx, hAtLocal(sx) - 8, tabZ + 1.4);
      for (const o of [slider, grab]) { o.userData.noCollide = true; grp.add(o); }
    }
  }
  // ---- panels -----------------------------------------------------------
  // Side panel seam, riding the finished surface (zAtLocal) rather than a flat
  // w/2+1.6 that floats clear of a rear cap the plan curve pinches to 0.66.
  {
    const sx0 = -len / 2 + 10;
    for (const s of [1, -1]) {
      const sm = seamStrip(main, len * 0.9, 2.4, 2.2);
      sm.position.set(sx0, h * 0.34, s * (zAtLocal(sx0, h * 0.34) + 1.1));
      grp.add(sm);
    }
  }
  // ---- two-tone ---------------------------------------------------------
  //
  // A two-tone shell is a property of the COLOURWAY, and it is read off the
  // colourway. This test used to be `/backcountry/i.test(p.line)` — a string
  // match on one maker's range name, in a file that draws 100 top tube packs
  // for 30-odd brands — and it leaked exactly as you would expect: anything
  // with "Backcountry" in its line came out wearing Apidura's grey side panel.
  //
  // The channel already exists end to end. A colourway may carry `accentHex`
  // beside its `hex`; identity.js colorwayFor() resolves the pair, system.js
  // builds a material from each, and this builder is handed both. Where a
  // colourway names one colour `accent` arrives equal to `main` and the pack is
  // plain, which is the right answer for the 84 products in this slot that are.
  //
  // Apidura's records now carry the accent (data/models/apidura.json,
  // `colorways[].accentHex`). It does NOT reach the browser yet: apply-models
  // merges dims/render/geometry/closure/axes/structure and not `colorways`.
  // See the report — that is a four-line addition and it is the whole fix.
  const twoTone = !accent.color.equals(main.color);
  const foldLid = magnetic && geom.form !== 'slab';
  if (twoTone || foldLid) {
    // How far to lift the shell colour for the second panel. Vertex colours
    // multiply the base colour in linear space, so the multiplier that turns
    // `main` into `accent` is just the ratio of their luminances — derived from
    // the two materials, so a grey-on-black pack and a black-on-sand one both
    // land on the colour the catalogue actually authored. With no accent (the
    // fold-over lid case below) fall back to the old derivation toward mid-grey.
    const lumOf = (c) => Math.max(0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, 1e-4);
    const lum = lumOf(main.color);
    // The multiplier that carries `main` onto `accent`. Signed either way: it
    // darkens where the accent is the darker of the pair and lightens where it
    // is not, so a black-harness-over-grey-body colourway and a grey-panel-in-
    // black-caps one are the same code path.
    const trim = Math.min(Math.max(lumOf(accent.color) / lum, 0.2), 8);
    const lift = Math.min(Math.max(0.085 / lum, 1.35), 6.5);   // fold-over lid only
    const SEAM = 0.5;                                          // the stitch line at its edge
    tint(shapedBox, (x, y, z, nx, ny, nz) => {
      const u = Math.min(Math.max(x / len + 0.5, 0), 1);
      const yG = y + hCore / 2;
      if (twoTone) {
        // Which way round the two colours go is the catalogue's decision, and
        // data/models/apidura.json states it: "`hex` is the mid-grey laminated
        // BODY panel and `accentHex` the black structured centre wrap / harness
        // panels". So `main` paints the body panel and `accent` everything
        // structural — the end caps, the base band, the top band, the crown and
        // the harness wedge that climbs toward the stem end. The panel is the
        // EXCEPTION carved out of the trim, not the other way round; drawing it
        // the other way round painted the caps grey and the body black.
        const s = tAt(u);
        const local = Math.max(hCore * hFactor(s), 1);
        const v = yG / local;
        // distance INSIDE the body panel, in units of the local height. The
        // crown, the underside and both ends are never in it, whatever the
        // bands say — hence the side-face test folded in as a hard reject.
        const d = Math.abs(nz) < 0.55 ? -1
          : Math.min(v - 0.17, 0.87 - v, (s - 0.15) * 0.9,
            v - (0.20 + 0.45 * Math.max(0, s - 0.55) / 0.45));
        return d > SEAM * 0.06 ? 1 : d > -SEAM * 0.06 ? SEAM * Math.min(1, trim) : trim;
      }
      // The fold-over lid: one big panel over the top and upper side. Shading
      // it a touch lighter than the body is what makes it read as a separate
      // piece of fabric in profile, which is what these packs actually are.
      if (ny < -0.55) return 1;                                // never the underside
      const d = (yG - lidYAt(u)) / Math.max(h, 1);
      return d > 0.02 ? 1 + (lift - 1) * 0.16 : d > -0.02 ? SEAM + 0.2 : 1;
    });
  }
  // ---- Aero swallowtail --------------------------------------------------
  // "At the rear the two side faces continue past the body as splayed
  // triangular fins (the transfer panel) that wrap the tube — a distinctive
  // swallowtail that no other Apidura pack has." Without it the three Aero
  // modules are a plain black slab and read as another Racing pack. The fins
  // are `noCollide` for the same reason the strap wraps are: they are meant to
  // reach past the bag and grip the tube.
  //
  // Keyed on the record's own `features.transferPanel` rather than on the form
  // term: the panel is a named feature of the product, all three Aero modules
  // carry it and nothing else in the slot does. `slab` stays as the fallback so
  // a record that describes the silhouette but not the feature still gets fins.
  if (ft.transferPanel || geom.form === 'slab') {
    const finLen = Math.min(len * 0.22, 52);
    const finX = 10 - len + (mirrored ? len - finLen / 2 : finLen / 2);
    const finH = Math.max(hCore * (mirrored ? hFactor(0) : hFactor(0)), 14);
    for (const s of [1, -1]) {
      // a real plate, 2.4mm thick, splayed out and down to sit on the tube —
      // same fabric as the shell (studio-1/2/3 show one continuous panel), so
      // what has to read is the shape, not a colour change
      const fin = new THREE.Mesh(new RoundedBoxGeometry(finLen, finH + ttR, 2.4, 2, 1), main);
      fin.position.set(finX, (finH + ttR) / 2 - ttR * 0.7, s * (wCore / 2 - 1));
      fin.rotation.x = s * -14 * DEG;
      fin.userData.noCollide = true;
      grp.add(fin);
    }
  }
  // ---- attachment -------------------------------------------------------
  if (plan.bolted) {
    // A bolt-on SKU has no straps under it at all. What is visible instead is a
    // hard base rail: on apidura-x-canyon dimensions-1 the second view is that
    // plate, 6.5 cm wide against a 4.5 cm body, with two holes 6.4 cm apart. It
    // is wider than the bag on purpose, so the rail shows as a flange down each
    // side where the strap wraps used to be — which is the only thing that
    // tells this SKU from the strapped one at a glance.
    const bolt = new THREE.Group();
    const plate = new THREE.Mesh(
      new RoundedBoxGeometry(len * 0.66, 5, Math.min(65, w + 20), 2, 2), hwm);
    plate.position.set(10 - len * 0.5, tubeY + chanR - 1, 0);
    bolt.add(plate);
    for (const s of [1, -1]) {
      // the bolts themselves run down the centreline into the frame's threaded
      // mounts, so they are mostly behind the tube — they are here for the
      // three-quarter view, not the silhouette
      const head = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 9, 12), hwm);
      head.position.set(10 - len * 0.5 + (s * plan.boltSpan) / 2, tubeY + chanR - 5, 0);
      bolt.add(head);
    }
    // mounting hardware is meant to touch the tube, exactly as the strap wraps
    // below are — the clearance audit would otherwise read the bolt heads
    // seating in the frame's threaded mounts as penetration
    bolt.traverse((o) => { o.userData.noCollide = true; });
    grp.add(bolt);
  }
  // Velcro/cam wraps under the tube, as many as the record's prose names: two
  // on the short packs, three on the two long blades, one on the rear pack.
  const wrapAt = plan.tubeStraps === 1 ? [0.5]
    : plan.tubeStraps === 2 ? [0.2, 0.74]
      : Array.from({ length: plan.tubeStraps }, (_, i) => 0.16 + (0.66 * i) / (plan.tubeStraps - 1));
  for (const t of wrapAt) {
    const px = 10 - len * (rear ? 1 - t : t);
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
  // Anchor strap round the steerer (front packs) or round the seatpost (the
  // rear pack, whose record says two of them). Repositioned after collision
  // resolution so it keeps reaching the tube if the bag gets nudged back.
  // Aero modules and the Canyon collab name neither, and now get neither.
  const anchorTube = plan.post ? sd : hd;
  const target = plan.post
    ? P.seatTop.clone().addScaledVector(sd, 34)
    : P.headTop.clone().addScaledVector(hd, 34);
  const rings = [];
  for (let i = 0; i < (plan.post || (plan.steerer ? 1 : 0)); i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(28, 2.1, 6, 28), wm);
    ring.scale.z = 4;
    ring.userData.noCollide = true;
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(1, 4.5, 22).translate(0.5, 0, 0), wm);
    tongue.userData.noCollide = true;
    grp.add(ring, tongue);
    rings.push({ ring, tongue, off: (i - ((plan.post || 1) - 1) / 2) * 26 });
  }
  if (rings.length) {
    grp.userData.reseat = (toLocal, toLocalDir) => {
      const dir = toLocalDir(anchorTube).normalize();
      for (const r of rings) {
        const lp = toLocal(target).addScaledVector(dir, r.off);
        r.ring.position.copy(lp);
        r.ring.quaternion.setFromUnitVectors(v3(0, 0, 1), dir);
        const from = v3(rear ? 10 - len : 6, h * 0.12, 0);
        const d = lp.clone().sub(from);
        r.tongue.position.copy(from);
        r.tongue.rotation.z = Math.atan2(d.y, d.x);
        r.tongue.scale.x = Math.max(d.length() - 4, 2);
      }
    };
  }
  // ---- applied details ---------------------------------------------------
  // Both read straight off brands.json's per-product `features`, so they vary
  // inside a maker's range rather than across it — which is the whole answer to
  // "all fourteen render as the same body". Both are noCollide for the same
  // reason patch() is: a printed tag and a grommet are surface, not section,
  // and the size gate measures the body box over everything not so marked.
  if (ft.reflective) {
    // A size / reflective tag low on the rear-side chamfer, in the brand's own
    // accent where it has one. On the FINISHED side face (zAtLocal), not at a
    // flat w/2 that floats clear of a rear cap the plan curve pinches to 0.66.
    const tx = 10 - len * (mirrored ? 0.76 : 0.24);
    const ty = Math.max(Math.min(h * 0.26, hAtLocal(tx) - 8), h * 0.12);
    for (const s of [1, -1]) {
      const tag = new THREE.Mesh(
        new THREE.BoxGeometry(Math.min(30, len * 0.14), Math.min(7, h * 0.11), 1.2),
        hiHex != null ? hiMat : reflectiveMat());
      tag.position.set(tx, ty, s * (zAtLocal(tx, ty) + 0.8));
      tag.userData.noCollide = true;
      grp.add(tag);
    }
  }
  if (ft.cablePort) {
    // The grommeted cable port, at the stem end and low on the side face.
    const cx = 10 - len * (mirrored ? 0.88 : 0.12);
    const cy = Math.max(Math.min(h * 0.22, hAtLocal(cx) - 6), h * 0.1);
    for (const s of [1, -1]) {
      const port = new THREE.Mesh(new THREE.TorusGeometry(4.2, 1.3, 5, 16), hwm);
      port.position.set(cx, cy, s * (zAtLocal(cx, cy) + 0.6));
      port.userData.noCollide = true;
      grp.add(port);
    }
  }
  // The brand mark rides the side panel and has to stay under the profile: at
  // 0.65 of the length back it used to sit at a flat h*0.55, which is off the
  // top of a long blade whose crown is only half that far up back there.
  //
  // Sized as a screen PRINT, not a plaque. patch() draws a translucent card at
  // 0.82 x 0.31 of the width it is given, and at `min(70, len*0.6)` that card
  // was 57mm long and 22mm tall on a 70mm-tall pack — the "identical grey
  // APIDURA rectangle no real pack has". The same call at a third of the size
  // reads as what these makers actually print on the panel.
  const px = 10 - len * (mirrored ? 0.35 : 0.65);
  const py = Math.max(Math.min(h * 0.55, hAtLocal(px) - 14), h * 0.2);
  const pz = zAtLocal(px, py) + 1.2;   // on the finished side face, not at w/2
  const pw = Math.min(46, len * 0.26, h * 0.62);
  patch(grp, brand, px, py, pz, pw, 0);
  patch(grp, brand, px, py, -pz, pw, Math.PI);
  grp.rotation.z = ang;
  // Front packs butt the steerer 38mm behind headTop; a rear pack butts the
  // seat tube with its rear face, so its +x (front) end lands a body-length
  // ahead of it. The rear anchor exists but buildToptubeRear was still deriving
  // its x from headTop, which put the Rear TT Sack up by the stem.
  const originX = rear ? ttSeat.x + 20 + len - 10 : P.headTop.x - 38;
  /*
   * WHICH SIDE OF THE TUBE, and why it is no longer read off `axes.hgt`.
   *
   * This used to say `below = axes.hgt === '-y'`, which put six packs — the two
   * Blackburns, Swift's Moxie, Andrew The Maker's, and both Nuke Sunrise
   * Titans — hanging under the top tube. Measured, they sat 109-140mm below the
   * crown line while the other 95 sat within +-14mm of it, which on screen is a
   * bag floating in the middle of the frame triangle. Reported as exactly that.
   *
   * `axes.hgt` describes WHICH WAY THE MAKER'S DRAWING MEASURED HEIGHT. `-y`
   * means their height dimension runs downward on the elevation they published.
   * It says nothing about which side of the tube the bag straps to, and reading
   * it as if it did is the same class of mistake as the 95 records that were
   * measuring the wrong axis entirely. All six of these are classic gas-tank
   * packs that sit ON the tube.
   *
   * So: a top tube bag stands on the crown unless the record says otherwise IN
   * WORDS. A genuine under-tube product needs `features.attachment` to say so,
   * which is a claim someone has to make deliberately rather than a side effect
   * of how a drawing was dimensioned.
   */
  const below = /under|beneath|below/i.test(String(p?.features?.attachment || ''));

  // ---- STAND THE PACK ON THE TUBE ---------------------------------------
  //
  // ONE SPACE: frame-local millimetres, the space `ctx.points` lives in and the
  // space `grp.position` is expressed in (the anchor is a plain Object3D under
  // the frame group, unrotated and unscaled). `ttSeat`→`ttHead` is not a
  // reconstruction of the top tube — it is the very pair of points bike.js:108
  // builds the tube mesh from, so `ang` below is the tube's true angle and this
  // line is its true axis.
  //
  // What was wrong: the previous version took the assembled group's bounding
  // box in a WORLD-PARALLEL frame and stood its lowest point EMBED under the
  // anchor. The tube climbs toward the stem, so on a pack rotated to match it
  // the lowest point in world y is the rear-bottom CORNER, sitting about
  // `len * sin(ang)` below the group origin — 53mm on the 440mm Racing Long
  // against 20mm on a 170mm module. Lifting the group by that amount lifts the
  // whole base clear of a tube that has itself dropped by the same amount, so
  // the daylight under the pack grew with its length: measured 16.5mm on the
  // Racing 0.5L against 45.3mm on the Racing Long 2L.
  //
  // The distance that matters is PERPENDICULAR to the tube, and in the group's
  // own frame that is simply local y — the group is rotated by exactly `ang`,
  // so projecting a rotated local point onto the tube's normal returns its
  // local y unchanged. Hence one measurement (lowest local y over the pack) and
  // one line of trigonometry, and every pack in the slot lands the same
  // perpendicular distance off the tube whatever its length or where along the
  // tube it sits.
  let loY = Infinity, hiY = -Infinity;
  {
    const v = new THREE.Vector3();
    grp.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(grp.matrixWorld).invert();
    grp.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      // straps, bolt heads, fins and applied trim are meant to reach past the
      // shell onto the tube; the pack stands on its BODY, as the audit measures
      if (o.userData?.noCollide) return;
      const M = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      const pos = o.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 400));
      for (let i = 0; i < pos.count; i += step) {
        const y = v.fromBufferAttribute(pos, i).applyMatrix4(M).y;
        if (y < loY) loY = y;
        if (y > hiY) hiY = y;
      }
    });
    // Measuring rather than trusting `h` is deliberate: this slot's body, lid,
    // chamfer and bolt plate have each changed shape across several rounds, and
    // any constant derived from the published height goes stale the next time
    // one of them moves. The fallback is the nominal base/crown pair.
    if (!Number.isFinite(loY)) { loY = 0; hiY = h; }
  }
  // Perpendicular distance from the tube AXIS that the pack's contact face is
  // to end up at.
  //
  // Standing on the crown, that face is the base PLANE, and EMBED sinks it
  // 10mm below the crown so no daylight shows under the pack — which costs
  // nothing in clearance, because the trough carved above it is what actually
  // meets the tube (it is `chanR` = ttR + 2 from the axis, so the shell rides
  // 2mm clear and the audit measures -0.6 to -4mm of soft-goods contact).
  //
  // A pack that HANGS has no trough: its contact face is the flat top of the
  // body, and whatever it is set below the tube's underside is penetration,
  // one for one. Reusing EMBED there buried all six of them 10mm inside the
  // tube — past the 8mm the audit allows — so a hanging pack beds in by the
  // fabric's give and no more, which is nothing at all on a moulded shell.
  const bed = 3 * deformScale(stiff);
  const wantN = below ? -(ttR - bed) - hiY : (ttR - EMBED) - loY;
  // Solve (anchor + grp.position − ttEnd) · n = wantN for grp.position.y, with
  // n = (−sin ang, cos ang) the tube's own normal and grp.position.x already
  // fixed by originX. `ttEnd` is the end of the tube this anchor was built
  // from, so it is a point ON the axis whichever end of the bike we are at.
  grp.position.set(
    originX - anchor.x,
    (wantN + Math.sin(ang) * (originX - ttEnd.x)) / Math.cos(ang) - (anchor.y - ttEnd.y),
    0,
  );

  grp.userData.bodyLen = len;
  return shadowify(grp);
}
