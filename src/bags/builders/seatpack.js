// Seat pack builder (mm-local, parented to the seatpack anchor).
//
// ---- AXIS MAPPING (BUILDER-BRIEF Rule 2) ---------------------------------
// Checked against `mount.axes` on every Apidura record — { len: '-x',
// wid: 'z', hgt: 'y' } on all eleven — and against the maker's drawings:
//
//   p.mm.len → grp-local −x    plate face at x = 0, rolled tail at x = −len
//   p.mm.hgt → grp-local  y    the bag's DEPTH, crown to underside
//   p.mm.wid → grp-local  z    across the bike
//
// The body is lofted along the loft's own +y and turned onto −x by `rolled`,
// so the loft parameter t runs 0 at the seatpost → 1 at the rolled tail.
//
// ---- WHICH END IS FAT ----------------------------------------------------
// The narrow end is ALWAYS the seatpost end. The full, blunt, rolled end is
// ALWAYS the tail. The measured station lists say so and so do the drawings —
// see the ORIENTATION CONTRACT block at the sweep, below, before you touch
// anything that decides the taper. Three rounds of edits have now flipped it.
//
// ---- STANDING INVARIANTS -------------------------------------------------
//  1. LENGTH is the OUTSIDE dimension of the finished pack, not the length of
//     the fabric body. racing-saddle-pack/dimensions-1.png runs "MAX 24 cm"
//     from the leading edge of the seatpost plate to the tip of the unrolled
//     tail. So local x = 0 is the front face of the nose hardware and
//     x = −len the back of the roll, and the plate, the body and the roll are
//     all fitted BETWEEN them. Hanging a plate off the front of a len-long
//     body cost +28-40% on the short packs.
//  2. The traced outlines carry the COMPRESSION STRAPS drawn on the maker's
//     drawing: racing-saddle-pack-3l dips 0.95 → 0.82 → 0.95 at 77% of its
//     length, backcountry-saddle-pack-10l the same at 13% and 38%. Swept as
//     rings those notches are cinch grooves and the bag reads as a caterpillar
//     of inflated segments, so the outline goes through a unimodal envelope
//     (silhouetteOf) first and the notches are used for what they are: strap
//     POSITIONS (grooveStations).
//  3. HARDWARE HAS THICKNESS and is seated into the body — no zero-thickness
//     plates standing in the mid-plane, no fold stack bolted onto a flat cut.
//
// Every placement value comes from ctx.points / ctx.rails / ctx.anchors /
// ctx.geo / ctx.framePoly; nothing here is a literal offset off a screenshot.

import * as THREE from 'three';
import { v3, deg, tubeAlong } from '../../lib.js';
import { addPockets, cordMat, daisyChain, drawcordEnd, flapArc, orientArc, pocketArc, reflectiveArc, valveDisc, zipperRun } from '../features.js';
import { seamCurve, strapAssembly, wrapStrap } from '../hardware.js';
import { loftBody, measuredProfile, sectionFor, sectionUnit } from '../loft.js';
import { featuresOf, geomOf, stiffnessOf, variantOf } from '../identity.js';
import { deformScale } from '../deform.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';

/**
 * loft.js's own sampler, run over a filtered station list.
 *
 * `measuredProfile` is THE definition of how a measured station list is read:
 * linear interpolation over t in [0,1], mounting-end-first, floored at 0.06
 * because a swept zero is a crease and not a taper. It takes a product and
 * reads `p.profile.profile`, so hand it a shim — that keeps one sampler in the
 * codebase instead of a second copy that can drift, and it lets the same call
 * serve the plan (width) outline, which loft.js has no separate export for.
 *
 * `silhouetteOf` runs first because the tracing carries the straps; see below.
 */
const stationSampler = (a) => measuredProfile({ profile: { profile: silhouetteOf(a) } });

/**
 * The SILHOUETTE of a traced outline, with its hardware taken back out.
 *
 * tools/diagram-outline.mjs traces the maker's drawing, and the maker's drawing
 * has the compression straps on it. Every station where a strap crosses comes
 * back as a local dip of 3-13% — and a dip swept around 30 rings is a hard
 * cinch groove, which is exactly the "three or four separate inflated sections"
 * the owner rejected. A seat pack's side view is unimodal: it rises from the
 * seatpost, reaches one full section, and falls away to the roll. So enforce
 * that — non-decreasing up to the peak, non-increasing after it — which fills
 * every interior notch while leaving the nose rise and the tail roll-off, the
 * two things the outline is actually there for, bit-for-bit intact.
 *
 * A 3-tap pass afterwards softens the shoulders the envelope leaves behind.
 */
function silhouetteOf(a) {
  if (!Array.isArray(a) || a.length < 4) return null;
  const n = a.length;
  let peak = 0;
  for (let i = 1; i < n; i++) if (a[i] > a[peak]) peak = i;
  const e = a.slice();
  for (let i = 1; i <= peak; i++) e[i] = Math.max(e[i], e[i - 1]);
  for (let i = n - 2; i >= peak; i--) e[i] = Math.max(e[i], e[i + 1]);
  const out = e.slice();
  for (let i = 1; i < n - 1; i++) out[i] = e[i - 1] * 0.25 + e[i] * 0.5 + e[i + 1] * 0.25;
  return out;
}

/**
 * Where the straps are, read off the same traced outline.
 *
 * The notches `silhouetteOf` fills are not noise — they are the webbing. Rather
 * than throw that away and guess a fraction, hand the strap stations back with
 * their depth, so a Racing pack's two bands land where the drawing puts them
 * (0.33 and 0.77 on the 3L) instead of on a hand-written 0.34 / 0.58.
 */
function grooveStations(a) {
  if (!Array.isArray(a) || a.length < 12) return [];
  const n = a.length, out = [];
  for (let i = 3; i < n - 4; i++) {
    let isMin = true;
    for (let k = -2; k <= 2; k++) if (a[i + k] < a[i] - 1e-9) isMin = false;
    if (!isMin) continue;
    let hi = 0;
    for (let k = -3; k <= 3; k++) hi = Math.max(hi, a[i + k]);
    const prom = hi - a[i];
    const t = i / (n - 1);
    if (prom < 0.03 || t < 0.18 || t > 0.9) continue;
    if (out.length && t - out[out.length - 1].t < 0.09) continue;
    out.push({ t, prom });
  }
  return out;
}

/**
 * The blunt rolled end of a dry-bag closure, built in grp-local mm.
 *
 * `rollTop` in hardware.js stacks rounded boxes along the bag's axis, which on
 * a seat pack reads as a flat-cut cylinder with a rim stuck on the end — the
 * "lathe cut" the owner called out. A rolled mouth is nothing like that: the
 * section pinches into a wide flat lip, the lip folds over ACROSS the bike, and
 * a strap pulls the resulting bar down onto the body. racing-saddle-pack/
 * dimensions-1.png draws it as the bow-tie a folded bar makes in side view;
 * backcountry-saddle-pack/dimensions-5.png the same. So the roll axis runs
 * along z, not x, and the blunt end is the roll itself.
 */
function rolledTail(mat, hwm, wm, { cx, r, half }) {
  const g = new THREE.Group();
  const bar = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(r, r, half * 2, 20, 1), mat);
  outer.rotation.x = Math.PI / 2;             // cylinder axis +y → +z, across the bike
  bar.add(outer);
  // NO spherical end caps. A previous version put a full sphere of radius r on
  // each end of this bar; they stood a whole radius proud of the widest point
  // of the pack and, on the packs whose tail was pinched, read as the balls on
  // a "pointed, ball-tipped tail" in the review. A folded fabric lip ends flat
  // across the bike, which is what the cylinder's own caps already draw.
  // A rolled bar is squashed, not round: the fabric folds flat before it turns.
  bar.scale.set(0.9, 0.86, 1);
  bar.position.x = cx;
  g.add(bar);
  // second turn, tucked in front of and above the first — two visible folds is
  // what the drawings show, and it is what stops the end reading as one tube
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.72, r * 0.72, half * 1.86, 16, 1), mat);
  inner.rotation.x = Math.PI / 2;
  inner.position.set(cx + r * 0.95, r * 0.34, 0);
  inner.scale.set(0.9, 0.86, 1);
  g.add(inner);
  // the strap that pulls the roll down onto the body
  const strap = new THREE.Mesh(new THREE.BoxGeometry(r * 3.4, 2.6, half * 0.34), wm);
  strap.position.set(cx + r * 0.7, r * 1.02, 0);
  strap.rotation.z = deg(-9);
  g.add(strap);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(15, 8.5, half * 0.4), hwm);
  buckle.position.set(cx + r * 1.9, r * 0.86, 0);
  g.add(buckle);
  return g;
}

export function buildSeatpack(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const geom = geomOf(p);
  // soft | semi | rigid, from the model records — see stiffnessOf().
  const stiff = stiffnessOf(p);
  // trust the catalogue: caps here are sanity guards, not size levellers
  const len = Math.min(p.mm.len, 720);

  // ---- how much of the section the stuffing owns ---------------------------
  // `soft()` displaces the shell along its normal by up to ±amp, so a loft cut
  // to the published half-section renders one amp OVER it at every peak — 6-7%
  // of the width and depth budget on a small pack, before a single strap. The
  // loft is the mid-surface; the published figure is the outside of the packed
  // bag. Subtract most of the amplitude so the PEAKS land on the spec.
  const bodyAmp = Math.min(Math.max(Math.min(p.mm.hgt, 260) * 0.024, 1.6), 4.2);
  const softK = deformScale(stiff);            // 0 on a rigid shell — no swell
  const swell = bodyAmp * softK;
  // Not the same allowance on both axes. The depth is at or near its maximum
  // over a long run of stations — every one of them a fresh chance for the
  // noise to peak — and the 8-degree tail-up tilt then adds the bag's own
  // length × sin(tilt) on top, so the depth axis overshoots hardest. The width
  // peaks at one ring and the noise rarely lands on it.
  const maxD = Math.min(p.mm.hgt, 260) / 2 - swell * 0.8;   // half-depth, fullest station
  const maxW = Math.min(p.mm.wid, 260) / 2 - swell * 0.5;   // half-width, widest station
  // trim that lies ON the fabric rather than hovering a whole amplitude off it
  const trim = swell * 0.5;
  const lift = swell + 1.5;    // clearance for trim that must arch OVER the shell

  // ---- how narrow the mounting end is --------------------------------------
  // In this slot the mounting end is ALWAYS the narrow one: it is the end that
  // clamps the seatpost, and the volume you stuff hangs behind the saddle.
  //
  // `geometry.taper` is a magnitude we trust and a direction we do not. Across
  // the 78 seat packs the two labellings run 52 narrow-at-tail against 15
  // narrow-at-nose while describing the same physical object — reviewers
  // disagree about which end of a seat pack is its "nose", which geomOf()'s own
  // comment says out loud. So take the RATIO and impose the direction from the
  // drawings. (Apidura's eleven records have been corrected to narrow-at-nose
  // to match; this deliberately does not depend on that, because the other 67
  // have not been.)
  //
  // Floored at 0.22: below that the loft pinches to a knife edge with nothing
  // for the seatpost plate to be sewn to. Capped at 0.86 — INCLUDING where the
  // record says taper 1.0 — so a "barely tapered" pack still reads as a wedge.
  // An earlier version let 1.0 through as a real answer, and the result was a
  // parallel-sided tube that the tail roll-off then closed at one end only:
  // fat at the post, pointed at the tail, which is the exact failure the
  // ORIENTATION CONTRACT below exists to stop. Nothing in this slot is
  // untapered — the end that clamps a 27 mm seatpost cannot be the fat one.
  const noseFrac = geom.taperRatio !== null
    ? Math.min(Math.max(geom.taperRatio, 0.22), 0.86)
    : vr.range(0.30, 0.42);

  // ---- the parametric fallback curve ---------------------------------------
  // 11 of the 78 seat packs have an outline measured off the maker's drawing;
  // the other 67 get this. It is shaped like the measured Apidura curves: a
  // narrow mounting end, a rise to full section, then a blunt roll-off — never
  // a blade, because a roll closure needs a mouth to sit on.
  //
  // Where the section reaches full is what separates the families. Apidura's
  // Expedition (tapered_wedge, squared shoulder) is still climbing at 60% of
  // its length in dimensions-1.png; the Racing (its own record calls it "a
  // clean teardrop") is within 5% of full depth by 20% in dimensions-1.png.
  const shape = feats.shape || 'tapered';
  const tFull = shape === 'cylindrical' ? 0.12
    : geom.form === 'teardrop' || geom.form === 'truncated_cylinder' ? 0.35
    : geom.form === 'holster' || geom.form === 'rounded_box' || geom.form === 'slab' ? 0.25
    : geom.shoulder === 'rounded' ? 0.48
    : 0.68;
  // `geometry.taper.profile` says how it gets there: convex bellies out early,
  // concave hollows in and arrives late.
  const curve = geom.profile === 'convex' ? 0.55
    : geom.profile === 'concave' ? 1.7
    : geom.profile === 'linear' ? 1
    : 0.8;
  const tRoll = 0.9;                    // where the blunt end starts rounding
  /**
   * @param t   station, 0 at the seatpost
   * @param tf  where the section reaches full
   * @param t0  where the blunt end starts rounding off
   * @param floor how much is left at t = 1 — never 0, a roll needs a mouth
   */
  const parametric = (t, tf, t0, floor) => {
    const rise = noseFrac + (1 - noseFrac) * Math.min(t / tf, 1) ** curve;
    const off = t <= t0 ? 1
      : floor + (1 - floor) * Math.sqrt(Math.max(0, 1 - ((t - t0) / (1 - t0)) ** 2));
    return rise * off;
  };

  // ==== ORIENTATION CONTRACT — READ BEFORE TOUCHING THE TAPER ==============
  //
  // `data/diagram-profiles.json` holds this bag's TRUE side outline, traced by
  // tools/diagram-outline.mjs off the maker's own dimensioned drawing, and
  // src/catalog.js hangs it on the product as `p.profile`. It is stored
  // **MOUNTING-END-FIRST**: index 0 is the end that clamps the seatpost, index
  // 39 is the tail. For apidura-expedition-saddle-pack-13l it reads
  //
  //     profile[0..4]   = 0.299, 0.489, 0.571, 0.610, 0.636   <- POST, NARROW
  //     profile[35..39] = 0.845, 0.802, 0.740, 0.641, 0.466   <- TAIL, FULL
  //                                                              then rolling
  //                                                              closed
  //
  // i.e. shallow at the post, swelling rearward, closing to a blunt roll. All
  // eleven Apidura packs read that way, and so do the drawings, the on-bike
  // photos and the owner's review. THIS SWEEP MUST NOT REVERSE IT, and neither
  // may the parametric fallback (see `parametric` above, which rises from
  // `noseFrac` at t = 0 to 1 and then rolls off — same direction).
  //
  // The loft parameter t therefore runs 0 = seatpost → 1 = rolled tail, which
  // is the same convention as the station index, so the outline is sampled
  // straight through with NO FLIP. If you are looking at a render that is fat
  // at the post and pointed at the tail, do NOT add a `1 - t`, a `.reverse()`
  // or a second taper term — that has been tried and it is how this ended up
  // flip-flopping across three rounds. The outline here has been correct
  // throughout; every time the render came out reversed it was because
  // something DOWNSTREAM closed the tail a second time (`lipA`, below) or let
  // `noseFrac` reach 1.0 and leave a parallel-sided tube (above). Check those.
  //
  // Both lists are peak-normalised, so they carry SHAPE only — every
  // millimetre still comes from the catalogue via maxD / maxW.
  const rawSide = Array.isArray(p?.profile?.profile) ? p.profile.profile : null;
  const sampleD = stationSampler(rawSide);
  const samplePlan = stationSampler(p?.profile?.plan);
  /** Half-depth in mm at t. */
  const depthAt = (t) => maxD * (sampleD ? sampleD(t) : parametric(t, tFull, tRoll, 0.5));
  /** Half-width in mm at t. The plan view of these packs peaks LATER than the
   *  side view and narrows again toward the mouth — Expedition dimensions-1.png
   *  is at full depth by 62% of the length but only at full width at 75%, and
   *  the plan is back to 0.69 at the blunt end where the side view is still at
   *  0.87. Only the three Expedition drawings carry both views, so everything
   *  else gets those proportions parametrically. */
  const widthAt = (t) => maxW * (samplePlan ? samplePlan(t)
    : parametric(t, Math.min(tFull * 1.2, 0.9), 0.8, 0.72));

  // `p.closure.type` is the controlled-vocabulary field apply-models.mjs
  // merges. The old code switched on `features.closure`, which is free text —
  // "rolltop with quick-release buckle" is not `=== 'rolltop'`, so all 65
  // roll-top packs in this slot took the full-length branch and stacked their
  // folds inside the shell.
  const rawClosure = String(p.closure?.type || feats.closure || 'rolltop').toLowerCase();
  const closure = /roll/.test(rawClosure) ? 'rolltop'
    : /drawcord|cinch/.test(rawClosure) ? 'drawcord'
    : /zip|clamshell/.test(rawClosure) ? 'zip'
    : /flap/.test(rawClosure) ? 'flap'
    : 'rolltop';

  // ---- which kind of nose hardware this product has ------------------------
  // Apidura call it three different things and the drawings show three
  // different shapes, so switch on what the records actually carry:
  //
  //   teardrop + rounded shoulder (Racing, Canyon, MAAP) — "a large flat
  //     pentagonal seatpost plate that stands out past the bag body; that plate
  //     is the whole anti-sway system". racing-saddle-pack/studio-2.jpg shows
  //     it standing proud forward of the nose with the logo on it.
  //   oval + rounded shoulder (Backcountry) — "a large moulded black harness
  //     plate that wraps the underside and both cheeks".
  //     backcountry-saddle-pack/studio-2.jpg: a dark shell round the nose with
  //     the velcro post strap looped through its leading edge.
  //   everything else (Expedition and the other makers' wedges) — "a separate
  //     flat Hypalon tongue drops below the body at the nose to spread load
  //     onto the seatpost; render it as a thin plate, not as bag volume".
  const cradled = geom.crossSection === 'oval' && geom.shoulder === 'rounded'
    && geom.form !== 'teardrop';
  const finned = geom.form === 'teardrop';

  // ---- the envelope --------------------------------------------------------
  // x = 0 is the leading face of the nose hardware, x = −len the back of the
  // roll. Everything the pack is made of lives between them, because that is
  // what the published length measures (see the header note).
  const d0 = depthAt(0.02), w0 = widthAt(0.04);
  // How far the hardware stands ahead of the fabric nose. On a Racing the plate
  // IS the front of the pack and racing-saddle-pack/dimensions-1.png gives it
  // roughly an eighth of the length; on a Backcountry the harness wraps the
  // nose and barely projects; the Expedition tongue drops BELOW rather than
  // forward (expedition-saddle-pack/on-bike-2.jpg). Capped against the nose's
  // own section so it scales with the product instead of being a literal.
  const plateOut = finned ? Math.min(len * 0.13, d0 * 1.4)
    : cradled ? Math.min(len * 0.08, d0 * 0.9)
    : Math.min(len * 0.07, d0 * 0.8);
  // How far the hardware hangs below the bag's centreline. The frame floor
  // below has to know this: on a wedge the tongue reaches further down than the
  // nose section does, and it is the first thing that would touch the top tube.
  // Capped against the bag's own maximum depth as well as its nose: on a barely
  // tapered pack (Ortlieb's Seat-Pack records taper 0.85) the nose IS most of
  // the bag, and a plate at 1.9x that would hang half a bag below it.
  const plateDrop = Math.min(
    d0 * (cradled ? 1.1 : finned ? 1.3 : 1.9), maxD * (cradled ? 0.9 : 0.6));
  // How far the hardware reaches ABOVE the centreline, and how tall the
  // Backcountry tongue is. Hoisted out of the two branches below because the
  // seatpost set-back at the bottom of this function has to know the shape of
  // the face it is setting back.
  const hUp = finned ? d0 * 1.05 : d0 * 0.45;
  const tongueH = Math.max(d0 * 0.85, 12);

  // The rolled lip is flatter than the body section it comes from — used to
  // SIZE the roll, never to squash the loft. The station lists are traced from
  // drawings whose `drawn_state` is "rolled_down", so the closing-down is
  // already IN them (0.845 → 0.466 over the last five stations on the
  // Expedition 13L); pinching the last tenth again on top of that counted the
  // roll twice and left the tail shallower than the seatpost end. That double
  // count is why the taper read backwards even though the outline was right.
  const lipA = depthAt(1) * 0.62;
  // Roll radius: about two-thirds of the flattened lip, which is what a
  // three-turn roll of that lip comes to. Bounded so a 54 cm Expedition does
  // not grow a bolster and a 24 cm Racing still gets a visible roll.
  const rollR = closure === 'rolltop'
    ? Math.min(Math.max(lipA * 0.62, 4), len * 0.075) : 0;
  // What the tail closure costs out of the envelope, so the BODY gets the rest.
  const tailRes = closure === 'rolltop' ? rollR * 1.45
    : closure === 'drawcord' ? 14 : 0;
  const bodyLen = Math.max(len - plateOut - tailRes, len * 0.35);
  const xNose = -plateOut;
  /** grp-local x of body station t. Every piece of trim is placed through this
   *  — the old code multiplied fractions by `len`, which now overshoots the
   *  body at both ends. */
  const bx = (t) => xNose - t * bodyLen;

  // ---- body ----------------------------------------------------------------
  // The shell is lofted from the recorded cross-section, not turned on a lathe:
  // 50 of the 78 seat packs record `rounded_rect` and 8 `d_shape`, and a solid
  // of revolution draws every one of them as a tube. The seams are the corner
  // lines of that section.
  //
  // The loft runs the WHOLE station range — an earlier version stopped it at
  // t = 0.9 and bolted the closure on, leaving the loft's flat end cap showing
  // ("flat-cut cylinder" in the review). The outline closes the tail itself, so
  // there is no extra pinch here: see the note on `lipA`.
  const xs = sectionFor(geom.crossSection, 'rounded_rect');
  const sectionAt = (t) => ({
    a: Math.max(depthAt(t), 0.5), b: Math.max(widthAt(t), 0.5),
  });
  const loft = loftBody({ len: bodyLen, rings: 30, shape: xs, sectionAt });
  const shell = soft(loft.geo, main, {
    amp: bodyAmp, freq: vr.range(0.02, 0.03), seed: vr.seed % 997,
    stiffness: stiff,
    aoDir: new THREE.Vector3(-1, 0, 0), aoK: 0.8, aoSpan: 0.5,
  });
  const body = new THREE.Group();
  const rolled = new THREE.Group();
  rolled.rotation.z = Math.PI / 2;   // loft axis +y → −x: tail behind the saddle
  rolled.position.x = xNose;         // ...starting at the fabric nose, not at 0
  rolled.add(shell);
  // Piping down every panel join. Nudged out along the section normal so it
  // sits proud of the stuffing rather than sinking into it.
  const seamLines = loft.seams.slice();
  // `sectionUnit` returns no corners for round/oval sections, so the Racing and
  // Backcountry bodies came back with no seams at all — one bare inflated
  // surface, which is half of why they read as balloons. A real oval-section
  // pack still has the flank seam where the side panel meets the wrap
  // (racing-saddle-pack/studio-2.jpg runs it the whole length), so draw that.
  if (!seamLines.length) {
    for (const s of [1, -1]) {
      const line = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        line.push(v3(0, t * bodyLen, s * sectionAt(t).b));
      }
      seamLines.push(line);
    }
  }
  for (const line of seamLines) {
    const sp = line.filter((_, i) => i % 2 === 0).map((q) => {
      const n = v3(q.x, 0, q.z);
      if (n.lengthSq() > 1e-6) n.normalize().multiplyScalar(trim + 0.5);
      return q.clone().add(n);
    });
    if (sp.length > 2) rolled.add(seamCurve(main, sp, 0.9));
  }
  body.add(rolled);
  // No body.scale.z any more. The loft now takes its half-width straight from
  // p.mm.wid at every station, so squashing the finished mesh would apply the
  // width twice — and it used to stretch the soft() displacement with it,
  // which is why the noise read as combed along the bag.
  grp.add(body);

  const wm = webbing();
  const hwm = hardware();
  /** Mount hardware that reaches PAST the pack — here, only the collar round
   *  the seatpost and its buckle.
   *
   *  bagshot.mjs measures `bbox_body_mm` over everything not flagged like this,
   *  and its own comment says why that is wrong for a strap: "no straps, buckles
   *  or cage arms. Those stand off the bag by design and wrap the frame". A
   *  collar round a 27.2 mm post reaches 38 mm FORWARD of the pack it holds —
   *  5% of a 54 cm Expedition's published length and 15% of a 24 cm Racing's,
   *  which is the shape of a measurement artefact, not of a modelling error.
   *  The bag still has to TOUCH the post to pass the attachment gate, and it
   *  does: the plate face below sits 2 mm off it.
   *
   *  Deliberately NOT applied to the rail straps — see the note down there. */
  const mount = (o) => { o.traverse((q) => { q.userData.noCollide = true; }); return o; };

  // ---- seatpost plate ------------------------------------------------------
  // Sized from the bag's own nose section, so it scales with the product.
  if (cradled) {
    // Moulded shell over the nose. v2 lathed a single surface, which has no
    // thickness at all — from behind it was a curved sheet with a visible edge
    // of nothing. This lathes a CLOSED profile instead: out along the outer
    // radius, back along the inner, so the part has a wall and reads as the
    // moulded harness cradle in backcountry-saddle-pack/studio-2.jpg.
    const span = 0.34, N = 9, wall = 4.5;
    const prof = [];
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * span;
      prof.push(new THREE.Vector2(Math.max(depthAt(t), 1) + 2.5, t * bodyLen));
    }
    for (let i = N; i >= 0; i--) {
      const t = (i / N) * span;
      prof.push(new THREE.Vector2(Math.max(depthAt(t) + 2.5 - wall, 1), t * bodyLen));
    }
    prof.push(prof[0].clone());
    const cradle = new THREE.Mesh(
      new THREE.LatheGeometry(prof, 26, deg(-115), deg(230)), wm);
    // lathe axis +y → −x (nose → tail), arc centred on −y (the underside).
    // orientArc leaves the lathe's local x on world z, so the section is round
    // until we squash it: the body is an ellipse (the Backcountry 10L is 18cm
    // wide against 16cm deep) and a circular shell would stand off the
    // underside by a centimetre. Scale x by the section's own width/depth.
    orientArc(cradle, v3(-1, 0, 0), v3(0, -1, 0));
    const mid = span / 2;
    cradle.scale.x = widthAt(mid) / Math.max(depthAt(mid), 1);
    cradle.position.x = xNose;
    grp.add(cradle);
    // The tongue the velcro post strap threads through. It runs from the front
    // face of the pack (x = 0) BACK into the cradle, so there is no daylight
    // between the two — v2 floated it forward of a nose it never reached.
    const tl = plateOut + len * 0.04;
    const tongue = new THREE.Mesh(
      // Segmented in z so a vertex lands on the centreline: the clearance test
      // in bagshot.mjs samples VERTICES, and an 8-corner box whose only points
      // sit out at ±w/2 reads as 18mm off a post its middle is touching.
      new THREE.BoxGeometry(tl, tongueH, Math.max(w0 * 1.3, 22), 2, 2, 2), wm);
    tongue.position.set(-tl / 2, -d0 * 0.3, 0);
    grp.add(tongue);
  } else {
    // Flat plate in the bag's own mid-plane: five-sided and standing proud all
    // round on a Racing, a narrower tongue dropping below the nose on a wedge.
    //
    // Thickness is the whole point. v2 extruded 5 mm and the review called it
    // "a zero-thickness sheet sticking out sideways with nothing behind it".
    // A Racing plate is a stiffened, foam-backed panel roughly half as thick as
    // the nose is wide, with a rounded edge — bevelled here so the silhouette
    // is not a razor — and its rear edge is BURIED in the fabric nose so the
    // two are one object.
    const plateT = Math.min(Math.max(w0 * 0.45, 8), 24);
    const back = xNose - len * 0.05;               // buried in the nose
    const s = new THREE.Shape();
    s.moveTo(back, hUp);
    s.lineTo(-plateOut * 0.30, hUp);               // upper shoulder of the pentagon
    s.lineTo(0, hUp * 0.25);                       // upper corner of the front face
    s.lineTo(0, -plateDrop * (finned ? 0.55 : 0.40));
    s.lineTo(-plateOut * 0.45, -plateDrop);
    s.lineTo(back, -plateDrop * 0.85);
    s.closePath();
    const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(s, {
      depth: Math.max(plateT - 4, 1), bevelEnabled: true,
      bevelThickness: 2, bevelSize: 2, bevelSegments: 2,
    }), wm);
    plate.position.z = -Math.max(plateT - 4, 1) / 2;
    grp.add(plate);
  }

  // ---- tail closure --------------------------------------------------------
  if (closure === 'drawcord') {
    const dc = drawcordEnd(main, hwm, { r: depthAt(1) * 0.9, depth: 12 });
    dc.rotation.y = -Math.PI / 2;
    dc.position.x = bx(1) - 4;
    grp.add(dc);
  } else if (closure === 'zip') {
    grp.add(zipperRun(v3(bx(0.2), depthAt(0.2) * 0.78, 0),
      v3(bx(0.9), depthAt(0.9) * 0.72, 0), hwm, { accentMat: accent }));
  } else if (closure === 'flap') {
    const t = 0.72;
    const fl = flapArc(accent, wm, hwm, { R: depthAt(t) + lift, len: bodyLen * 0.4, arc: deg(165) });
    orientArc(fl, v3(-1, 0, 0), v3(0, 1, 0));
    fl.position.x = bx(t);
    body.add(fl);
  } else {
    // The mouth is a wide flat lip; roll it across the bike. The bar runs to
    // the body's own half-width at the tail so it finishes the section instead
    // of standing out past it.
    body.add(rolledTail(main, hwm, wm, {
      cx: bx(1) - rollR * 0.45, r: rollR, half: Math.max(widthAt(1), rollR * 1.2),
    }));
  }

  // ---- compression ---------------------------------------------------------
  // Body compression straps, which every one of these drawings shows: expedition
  // dimensions-1.png has one crossing the body to a side-release buckle, racing
  // dimensions-1.png the same, backcountry dimensions-5.png two.
  // `features.compressionStraps` carries the count.
  //
  // These are NOT the row of girth hoops that once made these read as
  // barrel-banded, and v2's separate band at the tail is gone: that made a
  // third ring right next to the roll and the pack came out looking like a
  // caterpillar. The roll now carries its own cinch strap (see rolledTail), so
  // what is left here is exactly the recorded count of body straps.
  const nGirth = Math.min(feats.compressionStraps ?? 1, 2);
  // Where the drawing puts them, when the drawing says. Only used at two or
  // more: the single-strap Expedition is read off on-bike-2.jpg, which puts it
  // about a third of the way back, and that is the version the owner kept.
  const grooves = grooveStations(rawSide).sort((a, b) => b.prom - a.prom);
  const bands = nGirth >= 2 && grooves.length >= nGirth
    ? grooves.slice(0, nGirth).map((g) => g.t).sort((a, b) => a - b)
    : Array.from({ length: nGirth }, (_, i) => (nGirth === 1 ? 0.36 : 0.34 + 0.24 * i));
  bands.forEach((t, i) => {
    const st = strapAssembly(wm, hwm, {
      // Bedded into the fabric, not hooped over it. A band standing a whole
      // displacement amplitude off the shell is a ring; a band the shell bulges
      // around on either side is a strap.
      // Webbing width scaled to the pack: strapAssembly hangs a loose tail
      // 1.35 × the width off the buckle, and on a 24 cm Racing pack a 20mm
      // strap put that tail 10mm past the widest point of the bag.
      r: depthAt(t) + trim * 0.5, width: Math.min(Math.max(maxW * 0.3, 12), 22),
      ellipse: widthAt(t) / Math.max(depthAt(t), 1),
      // Buckle low on the flank, where racing-saddle-pack/studio-2.jpg and
      // backcountry-saddle-pack/studio-2.jpg both put it. Not out on the
      // equator: strapAssembly centres the buckle block ON the band AND hangs
      // its loose tail further out again, so an equatorial angle puts a
      // centimetre of webbing past the widest point of the bag — 30mm over spec
      // on the Backcountry, and still 12mm over at 55 degrees on the Racing.
      angle: deg(-66 + 8 * i), tail: true,
    });
    st.rotation.y = Math.PI / 2;   // ring axis +z → +x: the band girths the body
    st.rotation.x = deg(5);        // the drawings run these slightly diagonal
    st.position.x = bx(t);
    grp.add(st);
  });

  // ---- surface -------------------------------------------------------------
  if (feats.daisyChains) {
    // sit on the shell at its own station, not at the body's widest radius —
    // a long span referenced to the deepest section overhangs a tapering back
    const dc = daisyChain(wm, { len: bodyLen * 0.3, rows: 2, band: Math.min(maxD * 0.34, 17) });
    dc.position.set(bx(0.5), depthAt(0.5) + trim, 0);
    dc.rotation.z = deg(4);
    grp.add(dc);
  }
  // No `else` any more. It used to drop a bare webbing bar on every pack that
  // records no daisy chain — including the Racing, whose record is explicit:
  // "no external pockets and no daisy chain".
  if (feats.cord) {
    // ONE lash cord along the top deck, which is what
    // backcountry-saddle-pack/dimensions-5.png shows: a thin cord running back
    // over the crown to the roll, tied off at each end. This used to be
    // `bungeeArc(..., n: 4)` — a four-strand criss-cross lattice that no pack
    // in this slot has, and the critic called it out on the MAAP by name.
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const t = 0.42 + (0.5 * k) / 8;
      pts.push(v3(bx(t), depthAt(t) + trim + 1.5, 0));
    }
    body.add(tubeAlong(pts, 1.7, cordMat(), { segments: 18, radialSegments: 5 }));
    for (const t of [0.42, 0.92]) {
      const hook = new THREE.Mesh(new THREE.BoxGeometry(8, 7, 6), hwm);
      hook.position.set(bx(t), depthAt(t) + trim, 0);
      body.add(hook);
    }
  }
  if (feats.valve) {
    // Set INTO the flank. Sitting it on top of the half-width put the nub 9mm
    // past the widest point of the bag, which is a tenth of the width budget on
    // a Racing pack — and a valve is a moulded fitting flush with the fabric.
    const vd = valveDisc(hwm);
    vd.position.set(bx(0.34), depthAt(0.34) * 0.3, widthAt(0.34) - 5.5);
    grp.add(vd);
  }
  if (feats.reflective) {
    // On the rear shoulder, where traffic sees it and where
    // racing-saddle-pack/studio-2.jpg carries the reflective chevrons — up on
    // the flank/crown fold, not out on the equator. At the equator the strip's
    // own standoff was pushing the measured width 10% past spec.
    for (const s of [1, -1]) {
      const t = 0.78;
      const rs = reflectiveArc({ R: widthAt(t) + trim, arc: deg(74), width: 16 });
      orientArc(rs, v3(-1, 0, 0), v3(0, 0.55, s));
      rs.position.x = bx(t);
      body.add(rs);
    }
  }
  // Mesh side pockets. The record's machine-readable `pockets` block
  // (`[{ type: 'mesh', count: 2, location: 'side' }]`) is NOT merged into
  // brands.json by tools/apply-models.mjs, so featuresOf(p).pockets is empty
  // for the whole slot and addPockets draws nothing; what does arrive is the
  // free-text `features.pockets`. Read that here so the Expedition gets the
  // large flank mesh panel that is half its silhouette in dimensions-1.png.
  // Reported as a data-pipeline gap rather than papered over any further.
  const pocketText = typeof p.features?.pockets === 'string' ? p.features.pockets : '';
  if (/mesh/i.test(pocketText) && /side|flank/i.test(pocketText)) {
    for (const s of [1, -1]) {
      const t = 0.5;
      const g = pocketArc(main, hwm, {
        R: widthAt(t) + trim, len: Math.min(bodyLen * 0.42, 210), arc: deg(70),
        proud: 4, mesh: true,
      });
      orientArc(g, v3(-1, 0, 0), v3(0, -0.15, s));
      g.position.x = bx(t);
      body.add(g);
    }
  }
  addPockets(grp, feats, main, hwm, {
    side: (make, i) => {
      const s = i % 2 === 0 ? 1 : -1;
      const t = 0.52 + 0.1 * Math.floor(i / 2);
      const g = make.arc(widthAt(t) + trim, Math.min(bodyLen * 0.28, 150), deg(74));
      orientArc(g, v3(-1, 0, 0), v3(0, 0.1, s));
      g.position.x = bx(t);
      body.add(g);
    },
    top: (make) => {
      const t = 0.5;
      const g = make.arc(depthAt(t) + trim, Math.min(bodyLen * 0.26, 140), deg(58));
      orientArc(g, v3(-1, 0, 0), v3(0, 1, 0));
      g.position.x = bx(t);
      body.add(g);
    },
  });

  // Tail UP: a rail-and-post pack is clamped low on the post at the nose and
  // rises toward the rear. (+z rotation drops the tail, so this must be
  // negative — the old comment claimed 'kicks up' while doing the opposite.)
  //
  // Eight degrees matches expedition-saddle-pack/on-bike-2.jpg, where the
  // pack's axis rises gently from the post, and still lifts the tail clear of
  // the tyre — see tyreFloor, which measures the droop the tilt costs at the
  // axle station. It is also as much as the length budget will take: the size
  // gate is an axis-aligned box in frame coords, so every degree of tilt adds
  // the bag's own depth × sin(tilt) to its measured length.
  grp.rotation.z = deg(-8);

  // ---- mounting ----------------------------------------------------------
  // Everything above is built in grp-local mm. The bike's seatpost and saddle
  // rails live in frame coords, so derive the placement from them instead of
  // guessing offsets — a fixed nose X is what left the pack hanging in clear
  // air between the post and the rails.
  const postR = (ctx.geo.seatpostDia || 27.2) / 2;
  const sd = ctx.points.sd;
  const anchorPos = ctx.anchors.seatpack.position;
  // where the seatpost crosses a given frame height
  const postXAt = (yFrame) => ctx.points.seatTop.x + sd.x * ((yFrame - ctx.points.seatTop.y) / sd.y);
  const rails = ctx.rails;
  const railR = rails?.r ?? 4;
  const tilt = grp.rotation.z;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  // The section's own half-depth at a given fraction of its half-width — i.e.
  // how far the shell has fallen away by the time it reaches the rail's z.
  // Sampled off the same unit section the loft sweeps, so a rounded_rect
  // Expedition (flat-topped, still at full depth 70% of the way out) and an
  // oval Racing (down to 85% by then) get different answers, which is exactly
  // the difference the rail gap turned on.
  const unit = sectionUnit(sectionFor(geom.crossSection, 'rounded_rect')).pts;
  const shoulderU = (f) => {
    let best = 0;
    for (let i = 0; i < unit.length; i++) {
      const [u0, v0] = unit[i], [u1, v1] = unit[(i + 1) % unit.length];
      if (u0 <= 0 && u1 <= 0) continue;
      if (f < Math.min(v0, v1) || f > Math.max(v0, v1)) continue;
      const k = Math.abs(v1 - v0) < 1e-9 ? 0 : (f - v0) / (v1 - v0);
      best = Math.max(best, u0 + (u1 - u0) * k);
    }
    return best;
  };
  /**
   * The drop that tucks the pack under the saddle rails, solved along the whole
   * rail rather than at one station.
   *
   * Two things v2 (and the first cut of this) got wrong. The pack is tilted
   * tail-up, so its crown RISES as it runs back under the rails and the first
   * thing to touch is the REAR end of the rail, not the station under the rail's
   * midpoint. And the rails stand out at ±`rails.z`, so what meets them is the
   * shell's shoulder at that z, not its crown — on an Expedition that shoulder
   * is 17 mm lower. Measuring the crown at one station left 9-33 mm of daylight
   * under the saddle on packs whose straps are supposed to be pulling on it.
   */
  const railDropFor = (gx, dyPrev) => {
    if (!rails) return anchorPos.y + 46 - anchorPos.y - depthAt(0.12) - swell - 12;
    let need = Infinity;
    for (let k = 0; k <= 4; k++) {
      const rp = rails.right[0].clone().lerp(rails.right[1], k / 4);
      // rail point in the pack's own untilted frame (y only shifts with dropY,
      // which the outer loop is iterating to a fixed point)
      const dx = rp.x - anchorPos.x - gx, dy = rp.y - anchorPos.y - dyPrev;
      const lx = dx * ct + dy * st;
      const t = Math.min(Math.max((-lx - plateOut) / bodyLen, 0), 1);
      const sy = depthAt(t) * shoulderU(Math.min(rails.z / Math.max(widthAt(t), 1), 1)) + swell;
      need = Math.min(need, rp.y - railR - 3 - (lx * st + sy * ct) - anchorPos.y);
    }
    return need;
  };
  // points.tireR is the tyre's CENTRELINE radius, so the casing reaches a
  // further tireWidth/2 beyond it — using tireR alone under-clears by ~22mm and
  // the pack still fouls the wheel (and gets deleted by the resolver).
  const tyreOuter = ctx.points.tireR + ctx.geo.tireWidth / 2;
  // The pack is tilted by grp.rotation.z, so its underside keeps rising as it
  // runs back over the wheel. Clearing the tyre at the NOSE is not enough —
  // measure at the station above the rear axle, where the tyre is highest.
  const postXHere = postXAt(anchorPos.y);
  const runToAxle = Math.max(0, Math.min(len, postXHere - ctx.points.rearAxle.x));
  const droopAtAxle = runToAxle * Math.tan(tilt);
  // Measure the bag's depth AT the station above the axle, not at some fixed
  // "belly": the pack swells rearward, so the deepest part of it is the part
  // hanging over the wheel and sampling near the nose under-reads it badly.
  const tAxle = Math.min(Math.max((runToAxle - plateOut) / bodyLen, 0), 1);
  const depthOverTyre = Math.max(depthAt(tAxle), depthAt(0.5)) + swell;
  const tyreFloor = ctx.points.rearAxle.y + tyreOuter + 18 + depthOverTyre
    + droopAtAxle - anchorPos.y;
  // Third floor: the nose hangs `noseDrop` below the bag's centreline and can
  // land on the top tube / seat-tube junction on the big packs. framePoly[1] is
  // that junction, frameEdgeR[1] its tube radius. The seatpost plate reaches
  // lower than the nose section does, so measure the deeper of the two.
  const noseDrop = Math.max(depthAt(0.02), plateDrop);
  const ttJoint = ctx.framePoly?.[1];
  const frameFloor = ttJoint
    ? ttJoint.y + (ctx.frameEdgeR?.[1] ?? 16) + 12 + noseDrop - anchorPos.y
    : -Infinity;
  // Set back off the post by the LEADING EDGE, point by point.
  //
  // The seatpost leans, and the pack is tilted tail-up by `tilt`, so the two
  // things that decide the set-back are the same thing: where each point of the
  // pack's front face ends up once the pack is rotated, against where the post
  // is at that height. v2 collapsed this into "the post at the lowest point of
  // the nose, minus a tilt swing over the same span", which is a bound rather
  // than a measurement — on a plate hanging 44 mm below the centreline it left
  // 13-22 mm of daylight between the bag and the post it is strapped to.
  //
  // These are the points that can touch first: the plate's flat front face, its
  // two rear shoulders, and the fabric nose behind them.
  const leadEdge = cradled
    ? [[0, -d0 * 0.3 + tongueH / 2], [0, -d0 * 0.3 - tongueH / 2],
       [xNose, depthAt(0.02)], [xNose, -depthAt(0.02) - 3]]
    : [[0, hUp * 0.25], [0, -plateDrop * (finned ? 0.55 : 0.40)],
       [-plateOut * 0.30, hUp], [-plateOut * 0.45, -plateDrop],
       [xNose, depthAt(0.02)], [xNose, -depthAt(0.02)]];
  // x = 0 is now the plate's own front face, so the clearance is just the post
  // radius and a couple of millimetres of webbing — no `- plateOut` term any
  // more. That term used to push the whole pack a plate's length further back
  // than it belongs, on top of counting the plate outside the published length.
  // Two millimetres is also what keeps the attachment gate satisfied without
  // the post collar: the plate is the part that presses on the post.
  const setBackFor = (dy) => {
    let s = Infinity;
    for (const [lx, ly] of leadEdge) {
      const wx = lx * ct - ly * st, wy = lx * st + ly * ct;
      s = Math.min(s, postXAt(anchorPos.y + dy + wy) - postR - 2 - wx);
    }
    return s - anchorPos.x;
  };
  // The two are coupled — the rail solve needs to know where along the bag the
  // rails cross it, and that depends on the set-back, which depends on how far
  // down the post the pack has slid. The post leans at about a quarter of a
  // millimetre per millimetre of drop, so two passes is well past convergence.
  let dropY = -2, gx = setBackFor(dropY);
  for (let pass = 0; pass < 2; pass++) {
    dropY = Math.min(Math.max(railDropFor(gx, dropY), tyreFloor, frameFloor), -2);
    gx = setBackFor(dropY);
  }
  grp.position.set(gx, dropY, 0);
  grp.userData.noseX = grp.position.x;

  const toLocal = (pFrame) => pFrame.clone().sub(anchorPos).sub(grp.position)
    .applyAxisAngle(v3(0, 0, 1), -grp.rotation.z);
  const postDir = v3(sd.x, sd.y, 0).normalize().applyAxisAngle(v3(0, 0, 1), -grp.rotation.z);
  const postAtLocalY = (ly) => {
    const yFrame = ly + grp.position.y + anchorPos.y;
    return toLocal(v3(postXAt(yFrame), yFrame, 0));
  };
  // ONE Hypalon collar round the seatpost — the review counted a single strap
  // there. Two collars read as a clamp bracket rather than a webbing wrap.
  for (const dy of [-4]) {
    const post = postAtLocalY(dy);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(postR + 4.5, 4.2, 6, 24), wm);
    collar.quaternion.setFromUnitVectors(v3(0, 0, 1), postDir);
    collar.position.set(post.x, dy, 0);
    grp.add(mount(collar));
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(9, 13, 15), hwm);
    buckle.position.set(post.x - postR - 4, dy, 0);
    grp.add(mount(buckle));
    // webbing from the collar back onto the plate face at x = 0, not onto thin
    // air: the run is short and the strap visibly terminates on the thing it is
    // sewn to.
    const gap = post.x - postR;
    if (gap > 2) {
      const web = new THREE.Mesh(new THREE.BoxGeometry(gap + 4, 15, 3.2), wm);
      web.position.set(gap / 2 - 2, dy, 0);
      grp.add(mount(web));
    }
  }
  // Rail straps: exactly two (one per side), each terminating in a loop that
  // closes around the real rail rather than stopping in mid-air. Running both
  // ends at the rail's own z keeps each strap in a single vertical plane, so it
  // leaves the pack's shoulder and reaches the rail square on — `wrapStrap`
  // only rotates its riser about z, and a from/to at different z drew the strap
  // on a plane that met neither the bag nor the rail.
  if (rails) {
    const nRail = feats.railStraps ?? 2;
    const perSide = Math.max(1, Math.round(nRail / 2));
    for (const side of [1, -1]) {
      const bar = side > 0 ? rails.right : rails.left;
      for (let i = 0; i < perSide; i++) {
        const f = nRail <= 2 ? 0.45 : 0.3 + 0.35 * i;
        const railPt = toLocal(bar[0].clone().lerp(bar[1], f));
        // Take off from the station the rail is actually over, and from the
        // SHOULDER at the rail's own z rather than the crown — a strap that
        // starts on the centreline and lands 21mm out is a diagonal strut.
        const tBody = Math.min(Math.max((-railPt.x - plateOut) / bodyLen, 0.04), 0.6);
        const fz = Math.min(rails.z / Math.max(widthAt(tBody), 1), 1);
        const from = v3(bx(tBody), depthAt(tBody) * shoulderU(fz) + trim, side * rails.z);
        const to = v3(railPt.x, railPt.y, side * rails.z);
        // NOT flagged as mount hardware: unlike the post collar these run
        // BACKWARD from the rails onto the bag, so they cost the measured
        // length nothing, and leaving them collidable gives the attachment gate
        // a second, direct reading on the rails.
        grp.add(wrapStrap(wm, hwm, { from, to, tubeR: rails.r, width: 20 }));
      }
    }
  }
  // On the plate, not amidships. racing-saddle-pack/studio-2.jpg and
  // backcountry-saddle-pack/studio-2.jpg both carry the logo on the stiffened
  // nose panel that takes the load onto the post; on a wedge whose tongue is a
  // narrow strip there is no room for it there, so it falls back to the nose
  // flank, which is where the Expedition wears it.
  if (finned || cradled) {
    const pz = Math.max(w0 * 0.22, 6);
    patch(grp, brand, -plateOut * 0.35, -d0 * 0.45, pz, Math.min(len * 0.22, 74), 0);
    patch(grp, brand, -plateOut * 0.35, -d0 * 0.45, -pz, Math.min(len * 0.22, 74), Math.PI);
  } else {
    const patchT = 0.22;
    const patchZ = widthAt(patchT) + trim + 1.5;
    patch(grp, brand, bx(patchT), -depthAt(patchT) * 0.15, patchZ, 74, 0);
    patch(grp, brand, bx(patchT), -depthAt(patchT) * 0.15, -patchZ, 74, Math.PI);
  }
  return shadowify(grp);
}
