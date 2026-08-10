// Half frame bag builder (mm-local, parented to the framebag anchor).
//
// AXIS MAPPING (BUILDER-BRIEF Rule 2) — checked against `mount.axes` on all 16
// Apidura records in this slot, every one of which reads
// { len: "along_toptube", wid: "z", hgt: "y" }:
//
//   p.mm.len -> ALONG the top tube, running seat-tube end -> head-tube end.
//   p.mm.hgt -> perpendicular to the top tube, DOWNWARD into the main triangle,
//               and it is the bag's DEEPEST height — Apidura's "mid" figure —
//               not either end face. Racing 1L publishes "20.5 cm long; 7 cm
//               front and 13.5 cm mid heights; 3.5 cm rear": len 20.5, hgt 13.5,
//               and the 7/3.5 pair is the taper, see THE SILHOUETTE below.
//   p.mm.wid -> world z, the extrusion depth.
//
// Everything positional comes from ctx.framePoly (the tube CENTRELINES) and
// framePanelPoly(ctx) (the same walk offset out to each tube's surface). There
// is no literal position and no literal angle in here: in particular the
// lower-front edge takes its angle from the bike's own down tube.
//
// THE SILHOUETTE. Until 9 Aug this builder drew a slab whose bottom ran in one
// straight line, deepest at the seat-tube end and shallowest at the head tube.
// Every Apidura dimension drawing shows the opposite — a downward-pointing kite,
// shallow at BOTH ends, with the deepest belly between 40% and 75% of the
// length and a straight lower-front edge lying along the down tube:
//
//   product              len   seat-end face   belly   head-end face
//   racing 1L           20.5        7.0         13.5        3.5
//   racing 4L           42          7.0         14.0        5.0
//   canyon collab 4.5L  42          8.0         14.5        6.5
//   expedition 5.7L     49         15.0         18.0        7.5
//   aero module L       31.5       (10.3)       16.5        6.5
//
// (all cm, off the maker's dimensions-*.png; the aero seat-end face is measured
// off the drawing because Apidura publishes the bounding height for that one.)
// Those three numbers per bag are now in each record as hgt + geometry.taper —
// see THE TAPER CONVENTION below.
//
// The belly POSITION is not in the records and must not be: it falls out of the
// frame. The lower-front edge is the edge that lies on the down tube, so it
// descends at the top-tube-to-down-tube angle, and the belly is simply where it
// has got `hgt` deep. Measured off the built geometry on this frame's 39.2
// degrees, against the drawings: racing 1L 43% of the length (drawn 40%),
// racing 4L 72% (71%), expedition 2.8L 66% (26/38.5 = 68%), expedition 5.7L 68%
// (36/49 = 73%), canyon 4.5L 74% (~70%), aero L 51% (53%). That is the whole
// shape, from one angle taken off the bike.
//
// The one family it does not fit is the Backcountry, whose drawing puts the
// belly at 35-40% on a lower-front edge of only ~27 degrees — shallower than any
// frame's down tube, so that bag simply is not drawn touching it. We give it 57%
// / 62%. Left as is rather than adding a per-product belly fraction: there is no
// merged field to carry one (see strapPlan below for the same problem).

import * as THREE from 'three';
import { v3 } from '../../lib.js';
import { deformScale, shapeBulge } from '../deform.js';
import { addPockets, cordMat, reflectiveStrip, zipperRun } from '../features.js';
import { TUBE_R, frameStraps, seamStrip } from '../hardware.js';
import { featuresOf, geomOf, stiffnessOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';
import { crossSpan, framePanelPoly, subdivideXY } from '../panels.js';

/**
 * THE TAPER CONVENTION for framebag_half, stated once so the next reader can
 * check a record against a drawing without guessing.
 *
 *   geometry.taper.nose = head-tube end face depth / hgt   (the bike's FRONT)
 *   geometry.taper.tail = seat-tube end face depth / hgt
 *
 * Both are fractions of the PUBLISHED hgt and both describe the FINISHED bag,
 * so both take the bevel deduction the belly takes — see THE KITE below.
 *
 * identity.js documents that reviewers do not agree which end of a bag is its
 * "nose", and this slot was one of the casualties: Apidura's own spec sheets
 * call the SEAT-tube end "front" and the HEAD-tube end "rear", and the records
 * had copied those labels straight through, so every bag in the slot was drawn
 * back to front. All 16 records were rewritten to the convention above on
 * 10 Aug. `geomOf(p).taperRatio` is min/max and cannot tell the two ends apart,
 * so read the pair directly — that is what this helper is for.
 */
function endFractions(p, vr) {
  const t = (p && p.geometry && p.geometry.taper) || {};
  const ok = (v) => (Number.isFinite(v) && v > 0.05 && v <= 1 ? v : null);
  return {
    // Fallbacks are the Apidura family's own spread, not a wild guess: across
    // the 16 drawings the head-tube face runs 0.21-0.42 of the belly and the
    // seat-tube face 0.50-0.85. A product whose record is silent still varies
    // deterministically (BUILDER-BRIEF §1).
    nose: ok(t.nose) ?? vr.range(0.24, 0.40),
    tail: ok(t.tail) ?? vr.range(0.52, 0.72),
  };
}

/**
 * How many straps wrap each tube.
 *
 * The model records carry an exact `straps` array — Apidura's records name the
 * tube for every one of them — but tools/apply-models.mjs merges only dims,
 * render, fits, geometry, axes, closure and structure, so `p.straps` does not
 * reach the browser today. Read it anyway, so the day that merge lands this
 * builder is already right, and fall back to a rule fitted to what those 16
 * records actually say:
 *   - top tube: 2 under 36 cm, 3 at or above it. Exact on all 16.
 *   - down tube: 2 on a soft pack over 24 cm, otherwise 1. Also exact on all
 *     16, and not a coincidence — the structured packs (Expedition's fibreglass
 *     rails, the Aero module's HDPE frame) are held by one big cam strap
 *     because the shell itself resists swinging; the soft ones need two.
 *   - seat tube: only the Bombtrack collab has one and nothing else in the
 *     merged data distinguishes it, so the fallback is 0 and that bag will not
 *     get its rear-end-cap strap until `straps` is merged.
 *   - head tube: the three elastic cords are unique to the Aero Frame Module,
 *     which is also the only `rigid` product in the slot.
 */
function strapPlan(p, runLen, stiff) {
  const rows = Array.isArray(p && p.straps) ? p.straps : null;
  if (rows) {
    const n = (...names) => rows
      .filter((s) => names.includes(String(s && s.wrapsAround)))
      .reduce((a, s) => a + (Number.isFinite(s.count) ? s.count : 1), 0);
    return {
      topTube: n('top_tube', 'toptube'),
      downTube: n('downtube', 'down_tube'),
      seatTube: n('seat_tube', 'seattube'),
      headTube: n('head_tube', 'headtube'),
    };
  }
  return {
    topTube: runLen < 360 ? 2 : 3,
    downTube: stiff === 'soft' && runLen >= 240 ? 2 : 1,
    seatTube: 0,
    headTube: stiff === 'rigid' ? 3 : 0,
  };
}

/**
 * The largest dome `shapeBulge` will actually deliver on THIS outline, 0..1.
 *
 * The width solve below has to run backwards from the finished surface to the
 * extrusion depth, so it needs to know how far the faces will move. Two things
 * make that a property of the shape rather than a constant: shapeBulge fades to
 * nothing within `reach` of the outline, so a shallow bag never reaches full
 * dome anywhere, and it pinches back at every seam. Sampling the returned
 * function on a grid inside the polygon is exact to the grid, and the function
 * is smooth over tens of millimetres, so a ~5mm grid is plenty.
 */
function peakBulge(poly, seams, reach) {
  const w = shapeBulge(poly, 1, seams, reach);
  const xs = poly.map((q) => q.x), ys = poly.map((q) => q.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const inside = (x, y) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  };
  const nx = Math.max(8, Math.min(72, Math.round((x1 - x0) / 5)));
  const ny = Math.max(8, Math.min(72, Math.round((y1 - y0) / 5)));
  let best = 0;
  for (let i = 1; i < nx; i++) {
    const x = x0 + ((x1 - x0) * i) / nx;
    for (let j = 1; j < ny; j++) {
      const y = y0 + ((y1 - y0) * j) / ny;
      if (inside(x, y)) best = Math.max(best, w(x, y));
    }
  }
  return best;
}

/**
 * The moulded hexagonal grab tab and its cord, hanging off the zip slider.
 *
 * Apidura put one on every zip in this slot and the round-2 critics called its
 * absence out by name; it is drawn here rather than in `zipperRun` because that
 * helper is shared with slots whose zips have a plain webbing tab.
 * `dimensions-1.png` hangs it below the zip line on the down-tube blade, tab
 * first and then a cord loop in the accent colour.
 */
function grabTab(grp, hwm, accent, at, down, z) {
  const tab = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 3.2, 6), hwm);
  tab.rotation.x = Math.PI / 2;                 // hex faces point along z
  tab.rotation.z = Math.atan2(down.y, down.x) + Math.PI / 2;
  // 12mm down puts the hexagon on the END of the pull zipperRun already draws,
  // which is how the moulded tab is fitted, and the cord loop hangs below it.
  tab.position.copy(at).addScaledVector(down, 12).setZ(z + 1.6);
  const cord = new THREE.Mesh(new THREE.TorusGeometry(5.4, 1.35, 5, 16), accent);
  cord.position.copy(at).addScaledVector(down, 21.5).setZ(z + 1.6);
  for (const o of [tab, cord]) { o.userData.noCollide = true; grp.add(o); }
}

/** Polygon -> Shape with a per-vertex corner radius. Soft goods have no corners. */
function roundedShape(pts, radii) {
  const n = pts.length;
  const s = new THREE.Shape();
  const toward = (i, j) => pts[j].clone().sub(pts[i]);
  const rAt = (i) => {
    const a = toward(i, (i - 1 + n) % n).length(), b = toward(i, (i + 1) % n).length();
    return Math.max(0, Math.min(radii[i] || 0, a * 0.45, b * 0.45));
  };
  const at = (i, j) => {
    const d = toward(i, j);
    const l = d.length();
    return l < 1e-4 ? pts[i].clone() : pts[i].clone().addScaledVector(d.multiplyScalar(1 / l), rAt(i));
  };
  const start = at(0, 1);
  s.moveTo(start.x, start.y);
  for (let i = 1; i <= n; i++) {
    const k = i % n;
    const a = at(k, (k - 1 + n) % n), b = at(k, (k + 1) % n);
    s.lineTo(a.x, a.y);
    if (rAt(k) > 0.05) s.quadraticCurveTo(pts[k].x, pts[k].y, b.x, b.y);
  }
  return s;
}

/**
 * A strap that runs from a point on the bag out to a FRAME TUBE and wraps it.
 *
 * This replaces the `frameStraps` call the down-tube strap used to make. That
 * helper lifts a closed band off the bag's own edge by `tubeR` along a normal,
 * which is right for the top tube — the bag's top edge IS on the top tube — and
 * wrong for every other tube, because a half frame pack's lower edge is nowhere
 * near the down tube on a 56 cm frame. The result was a closed loop of webbing
 * hanging in mid-air attached to nothing, on all 16 products. Apidura's own
 * down-tube straps are long adjustable nylon webbing precisely because the gap
 * they cross depends on the frame, so draw the tail and land the band on the
 * tube centreline the bike gives us.
 *
 * `tubeA`/`tubeB` are the tube's real centreline ends in bag-local mm.
 */
function tubeStrap(grp, wm, hwm, { from, tubeA, tubeB, tubeR, width = 22, buckle = true }) {
  const axis = tubeB.clone().sub(tubeA);
  const len2 = axis.lengthSq();
  if (len2 < 1) return;
  const t = Math.max(0, Math.min(1, from.clone().sub(tubeA).dot(axis) / len2));
  const at = tubeA.clone().addScaledVector(axis, t);       // nearest point on the tube
  const gap = from.clone().sub(at);
  const span = gap.length();
  if (span < 1) return;
  const dir = gap.clone().multiplyScalar(1 / span);
  const band = new THREE.Group();
  // Same flattened torus frameStraps uses, so a bag's down-tube band reads as
  // the same piece of webbing as the bands over its top tube.
  const loop = new THREE.Mesh(new THREE.TorusGeometry(tubeR + 4, 2.6, 6, 24), wm);
  loop.scale.z = width / 5.2;
  loop.quaternion.setFromUnitVectors(v3(0, 0, 1), axis.clone().normalize());
  loop.position.copy(at);
  band.add(loop);
  const reach = span - tubeR - 2;
  if (reach > 3) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(reach, 2.4, width), wm);
    strip.position.copy(at).addScaledVector(dir, tubeR + 2 + reach / 2);
    strip.rotation.z = Math.atan2(dir.y, dir.x);
    band.add(strip);
    if (buckle) {
      const bk = new THREE.Mesh(new THREE.BoxGeometry(13, 7.5, width * 0.8), hwm);
      bk.position.copy(at).addScaledVector(dir, tubeR + 2 + Math.min(reach * 0.5, 30));
      bk.rotation.z = strip.rotation.z;
      band.add(bk);
    }
  }
  // The band is meant to be inside the tube it wraps; exempt it from the
  // clearance test exactly as frameStraps does for the top-tube bands.
  band.traverse((o) => { o.userData.noCollide = true; });
  grp.add(band);
}

export function buildFrameHalf(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const anchor = ctx.anchors.framebag.position;
  const panel = framePanelPoly(ctx);
  // framePoly is walked [BB, top of seat tube, top tube at head, down tube at
  // head] with edge i running point i -> i+1; framePanelPoly offsets each edge
  // out to that tube's surface and keeps the same order.
  const [pBB, pSeatTop, pHeadTop, pHeadBot] = panel;
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const geom = geomOf(p);
  // soft | semi | rigid, from the model records — see stiffnessOf().
  const stiff = stiffnessOf(p);
  const local = (pt) => v3(pt.x - anchor.x, pt.y - anchor.y, 0);

  // ---- the frame's own directions -----------------------------------------
  const ttDir = pHeadTop.clone().sub(pSeatTop).normalize();     // seat end -> head end
  const ttLen = pSeatTop.distanceTo(pHeadTop);
  const down = v3(ttDir.y, -ttDir.x, 0);                        // into the triangle
  if (down.y > 0) down.negate();
  // The down tube, head end -> BB, taken off the OFFSET panel edge: a bag whose
  // lower-front edge lies on this line is touching the tube, not buried in it.
  const dtBack = pBB.clone().sub(pHeadBot).normalize();
  const dtDrop = dtBack.dot(down);          // depth gained per mm along the down tube
  const dtRun = -dtBack.dot(ttDir);         // and how far back that mm carries us
  // Inward normals of the two edges the bag can run into, for the guards below.
  const dtIn = v3(dtBack.y, -dtBack.x, 0);
  if (dtIn.dot(pHeadTop.clone().sub(pHeadBot)) < 0) dtIn.negate();
  const stIn = v3(pSeatTop.y - pBB.y, pBB.x - pSeatTop.x, 0).normalize();
  if (stIn.dot(pHeadTop.clone().sub(pBB)) < 0) stIn.negate();

  // ---- the top edge --------------------------------------------------------
  // Honour the catalogue length. Spanning 4%->96% of the top tube regardless of
  // p.mm.len made a 205mm Racing pack the same object as a 490mm Expedition.
  // Real half packs are pushed hard into the head-tube corner: 8mm off the
  // panel's head-tube edge leaves the nose ~6mm clear of the tube itself.
  const ends = endFractions(p, vr);
  const runLen = Math.min(p.mm.len, ttLen - 36);
  const noseTop = pHeadTop.clone().addScaledVector(ttDir, -8);
  const rearTop = noseTop.clone().addScaledVector(ttDir, -runLen);

  // ---- the kite ------------------------------------------------------------
  // The extrusion bevel below rounds the outline outward by `bevel` on every
  // side, so the drawn shape has to start that much shallower or the finished
  // belly sits a bevel below the published depth. Length is left alone: both
  // ends of a real pack are genuinely rounded off.
  //
  // THE END FACES TAKE THE SAME DEDUCTION, and until 10 Aug they did not: they
  // were `frac * (hgt - bevel)`, which finishes at `frac*hgt + bevel*(1-frac)`.
  // On a deep seat-tube face that is a millimetre, but on the Expedition 2.8L's
  // 2.5cm head-tube face it is +4mm on 25 — the face renders 16% over, and the
  // round-2 critics read the whole head-tube end as too fat. Deduct it once, on
  // the published figure, exactly as the belly does.
  const bevel = 6;
  const cap = Math.min(p.mm.hgt, 300);
  let h = Math.max(24, cap - bevel);
  // Held as FRACTIONS of h so the down-tube guard below stays closed-form.
  const fNose = Math.min(Math.max(ends.nose * cap - bevel, 5) / h, 0.90);
  const fTail = Math.min(Math.max(ends.tail * cap - bevel, 6) / h, 0.96);
  // Guard, not a fudge: nothing here may reach past the down tube. Both bottom
  // corners sit `frac * h` along `down` from a point on the top tube, and the
  // clearance to the down-tube edge falls off linearly in h, so the ceiling is
  // closed-form. On this frame it never binds — the tightest product (Expedition
  // 5.7L) still has 1.8x the headroom it uses — but it is what stops the next
  // dimension correction, or a smaller frame, from burying a pack in the tube.
  const drop = -down.dot(dtIn);
  if (drop > 0.05) {
    const room = (topPt, frac) => (topPt.clone().sub(pHeadBot).dot(dtIn) - 6) / (frac * drop);
    h = Math.max(24, Math.min(h, room(noseTop, fNose), room(rearTop, fTail)));
  }
  const noseD = h * fNose, tailD = h * fTail;
  const noseBot = noseTop.clone().addScaledVector(down, noseD);
  const rearBot = rearTop.clone().addScaledVector(down, tailD);
  // Guard: the seat tube leans FORWARD as it descends, so on a long pack the
  // bottom-rear corner reaches it well before the top edge does — the Expedition
  // 5.7L's would sit 25mm inside it. Slide that ONE corner forward rather than
  // shortening the bag: p.mm.len is the published top-edge length and stays
  // exact, and a rear face that leans forward at the bottom is what the maker's
  // own dimensions-4.png draws on the longest pack in the range.
  {
    const reach = ttDir.dot(stIn);
    const near = rearBot.clone().sub(pSeatTop).dot(stIn);
    if (reach > 0.05 && near < 6) {
      rearBot.addScaledVector(ttDir, Math.min((6 - near) / reach, runLen * 0.4));
    }
  }
  // The lower-front edge runs from the nose corner PARALLEL TO THE DOWN TUBE;
  // the belly is where it has reached full depth. Clamp it so it can never run
  // out behind the rear face — a bag shorter than (hgt - nose)/tan(TT^DT) is
  // then a plain forward-deepening wedge, which is what such a bag would be.
  const wantRun = dtDrop > 0.05 ? (h - noseD) / dtDrop : 0;
  const maxRun = dtRun > 0.05 ? Math.max(0, (runLen - 14) / dtRun) : 0;
  const bellyRun = Math.min(wantRun, maxRun);
  const belly = noseBot.clone().addScaledVector(dtBack, bellyRun);

  // Walk the outline: forward along the top tube, down the nose face, back along
  // the down-tube edge to the belly, back along the lower-rear edge, up the
  // rear face.
  const pts = [rearTop, noseTop, noseBot, belly, rearBot];
  const L = pts.map(local);
  // `shoulder` is 'squared' on the Expedition/Racing/Aero and 'rounded' on the
  // Backcountry, and a rigid shell keeps its creases.
  const soften = stiff === 'rigid' ? 0.35 : geom.shoulder === 'rounded' ? 1.25 : 0.85;
  const fil = (r) => Math.max(1.5, r * soften);
  // Corner radii, read off the maker's dimension drawings. `roundedShape` caps
  // every radius at 0.45 of the shorter adjacent edge, so asking for half the
  // end face at BOTH of its corners — which is what the old
  // `min(noseD*0.5, 22)` did on a small nose — leaves no flat between the two
  // arcs at all. That is the "big blank rounded corner where the drawings
  // specify a small squared end face" the round-2 critics saw on all 16.
  // dimensions-1.png (Expedition 2.8L) draws that 2.5cm face with a generous
  // radius where it meets the top tube and a tight one where the down-tube
  // blade runs into it; keep at least half the face flat.
  const shape = roundedShape(L, [
    fil(9),                                  // top edge into the seat-tube face
    fil(Math.min(11, noseD * 0.30)),         // top edge into the head-tube face
    fil(Math.min(9, noseD * 0.22)),          // head-tube face into the blade
    fil(Math.min(11, h * 0.09)),             // the belly: a crease, not a bowl
    fil(Math.min(22, tailD * 0.45)),         // the rear-bottom corner
  ]);

  const poly = L.map((pt) => ({ x: pt.x, y: pt.y }));
  const mid = poly.reduce((a, q) => ({ x: a.x + q.x / poly.length, y: a.y + q.y / poly.length }), { x: 0, y: 0 });
  // How far each face domes, as a fraction of the extrusion depth. Drawn from
  // `vr` HERE, before the seam jitter, only to keep every product's established
  // random stream in the order it has always had — reordering the draws would
  // reshuffle the cosmetic variation on all 16 bags for nothing.
  const bulgeFrac = vr.range(0.2, 0.28);
  // Panel seams run vertically, at thirds along the top tube.
  const seamAt = (f) => local(rearTop.clone().addScaledVector(ttDir, runLen * f)).x;
  const hA = seamAt(0.34) + vr.j(14), hB = seamAt(0.68) + vr.j(14);
  const seams = [{ axis: 'x', at: hA }, { axis: 'x', at: hB }];

  // The published width is the FINISHED width of the bag, but two things push
  // the faces outward after extrusion: the bevel on each side, and the pillow
  // bulge that domes each flat face. Extruding to the published figure and then
  // adding both made every frame pack 60-75% too wide — the single largest
  // dimensional error in the catalogue. Solve backwards: pick the extrusion
  // depth that lands the finished surface on the published number.
  //
  // The dome that solve has to cancel is NOT `bulgeAmt`. soft() scales every
  // displacement by deformScale(structure) — 0.4 on a semi shell, ZERO on a
  // rigid one — and shapeBulge only reaches its full amount deep inside the
  // outline. Cancelling the full amount regardless left the two rigid Aero
  // modules 18% under their published 4.5cm (measured 37mm of 45) and the four
  // semi Expeditions 7-9% under, while the soft packs, which do get the whole
  // dome, came out 4-11% over. One factor, `k * peak`, explains all sixteen.
  const wantW = Math.min(p.mm.wid, 130);
  const k = deformScale(stiff);
  const peak = peakBulge(poly, seams, 48);
  const gain = 2 * bulgeFrac * k * peak;           // finished mm per mm of depth
  let depth = Math.max((wantW - 2 * bevel) / (1 + gain), 8);
  // shapeBulge is capped at 18mm, so on a very wide bag the solve is linear.
  if (depth * bulgeFrac > 18) depth = Math.max(wantW - 2 * bevel - 36 * k * peak, 8);
  const bulgeAmt = Math.min(depth * bulgeFrac, 18);
  const bulgeAt = shapeBulge(poly, bulgeAmt, seams, 48);
  // Where the finished skin actually is, at a point on the drive-side face.
  // Everything that sits ON the bag goes through this: a fixed offset floats
  // hardware off a domed face and buries it in a flat one.
  const skin = (x, y, proud = 0) => depth / 2 + bevel + bulgeAt(x, y) * k + proud;

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4, steps: 1,
  });
  geo.translate(0, 0, -depth / 2);
  grp.add(soft(subdivideXY(geo, 30), main, {
    amp: vr.range(2.4, 3.6), freq: vr.range(0.018, 0.026), seed: vr.seed % 953, flatAxis: 'z',
    stiffness: stiff,
    bulge: bulgeAt,
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.78, aoSpan: 0.5,
  }));

  // ---- closure -------------------------------------------------------------
  // Every record in the slot says one full-length welded zip on the drive side,
  // and it is the most prominent single feature in every Apidura drawing and
  // photograph. It was already being built — at `depth/2 - 5`, which is five
  // millimetres INSIDE the extrusion core with the finished skin another bevel
  // and dome further out again, so it rendered inside the bag and not one of
  // the sixteen showed a zip. That is what `skin()` above is for.
  //
  // The line is off dimensions-1.png (Expedition 2.8L) and dimensions-2.png
  // (Racing 4L): parallel to the top edge, about a third of the belly depth
  // down, running from just inside the seat-tube end to the point where the
  // down-tube blade rises to meet it — so it STOPS short of the head-tube face
  // rather than running to it. zipperRun puts its slider at 0.78 of a->b, which
  // on that run lands at 0.72 of the pack, exactly where both drawings hang the
  // hexagonal grab tab.
  const zipD = Math.min(h * 0.34, tailD * 0.72);
  const bladeF = zipD <= noseD
    ? 0.95
    : 1 - ((bellyRun * dtRun) / runLen) * ((zipD - noseD) / Math.max(h - noseD, 1));
  const zipAt = (f) => local(rearTop.clone().addScaledVector(ttDir, runLen * f).addScaledVector(down, zipD));
  const za = zipAt(0.045), zb = zipAt(Math.max(0.35, Math.min(bladeF, 0.95) - 0.03));
  // zipperRun draws a straight tape, so it has to clear the HIGHEST point of
  // the dome under it or it submerges mid-run — the panel between the seams
  // stands a couple of millimetres proud of both ends of the line.
  let zipZ = 0;
  for (let i = 0; i <= 10; i++) {
    const q = za.clone().lerp(zb, i / 10);
    zipZ = Math.max(zipZ, skin(q.x, q.y, 1.2));
  }
  za.setZ(zipZ);
  zb.setZ(zipZ);
  grp.add(zipperRun(za, zb, hardware(), { accentMat: accent }));
  grabTab(grp, hardware(), accent, za.clone().lerp(zb, 0.78), down, zipZ);

  for (const s of [1, -1]) {
    for (const sx of [hA, hB]) {
      const v = crossSpan(poly, sx, 'x');
      if (!v) continue;
      const sm = seamStrip(main, 2.6, Math.max(v.hi - v.lo - 16, 18), 2.4);
      const my = (v.lo + v.hi) / 2;
      sm.position.set(sx, my, s * skin(sx, my, 0.6));
      grp.add(sm);
    }
  }
  if (feats.reflective) {
    // On the lower-rear panel, which on the real bags is the flat area below
    // the zip and behind the belly.
    const rp = local(rearTop.clone().addScaledVector(ttDir, runLen * 0.42).addScaledVector(down, h * 0.62));
    for (const s of [1, -1]) {
      const rs = reflectiveStrip(Math.min(runLen * 0.34, 130), 9);
      rs.position.set(rp.x, rp.y, s * skin(rp.x, rp.y, 0.8));
      grp.add(rs);
    }
  }
  addPockets(grp, feats, main, hardware(), {
    side: (make, i) => {
      const s2 = i % 2 === 0 ? 1 : -1;
      const g = make(Math.min(runLen * 0.55, 150), Math.min(h * 0.5, 80));
      const px = mid.x + vr.j(16), py = mid.y - i * 10;
      g.position.set(px, py, s2 * skin(px, py, 0.6));
      if (s2 < 0) g.rotation.y = Math.PI;
    },
  });

  // ---- attachment ----------------------------------------------------------
  const plan = strapPlan(p, runLen, stiff);
  // Top tube: the bag's own top edge lies on the tube, so frameStraps' lift is
  // the right model here. Give it the true edge perpendicular — the default
  // (0,1,0) is world-up and the top tube is 7 degrees off horizontal.
  frameStraps(grp, webbing(), hardware(), {
    edge: [L[0].clone(), L[1].clone()],
    count: plan.topTube, tubeR: TUBE_R.topTube, depth, normal: down.clone().negate(),
  });
  // The tubes these next straps have to reach, as the bike itself reports them:
  // frameEdgeR[i] is the radius of the tube along framePoly[i] -> framePoly[i+1].
  // TUBE_R is only the fallback for a ctx that has no radii (framePanelPoly
  // handles the same case), because a strap sized off the wrong radius either
  // floats around the tube or sinks into it.
  const R = ctx.frameEdgeR || [TUBE_R.seatTube, TUBE_R.topTube, 24, TUBE_R.downTube];
  const tube = (i) => ({ tubeA: local(ctx.framePoly[i]), tubeB: local(ctx.framePoly[(i + 1) % 4]), tubeR: R[i] });
  // Down tube: hung off the lower-FRONT edge (noseBot -> belly), which is the
  // edge that faces it. Two straps sit near each end of that edge, which is
  // where the drawings and the on-bike photos put them.
  for (let i = 0; i < plan.downTube; i++) {
    const f = plan.downTube === 1 ? 0.5 : 0.15 + (0.7 * i) / (plan.downTube - 1);
    tubeStrap(grp, webbing(), hardware(), { from: L[2].clone().lerp(L[3], f), ...tube(3) });
  }
  // Seat tube: off the rear end cap (Bombtrack collab).
  for (let i = 0; i < plan.seatTube; i++) {
    const f = plan.seatTube === 1 ? 0.5 : 0.3 + (0.4 * i) / (plan.seatTube - 1);
    tubeStrap(grp, webbing(), hardware(), { from: L[0].clone().lerp(L[4], f), ...tube(0) });
  }
  // Head tube: the Aero Frame Module's three thin ELASTIC bands, not webbing —
  // the record calls them the giveaway detail of that product.
  for (let i = 0; i < plan.headTube; i++) {
    const f = 0.18 + (0.64 * i) / Math.max(1, plan.headTube - 1);
    tubeStrap(grp, cordMat(), hardware(), {
      from: L[1].clone().lerp(L[2], f), ...tube(2), width: 5, buckle: false,
    });
  }

  const patchW = Math.max(38, Math.min(56, runLen * 0.16, h * 0.34));
  // Apidura print the wordmark high and forward, just behind the head-tube end
  // and ABOVE the zip — on-bike-4.jpg puts it on the top panel, and the zip line
  // now occupies the depth this used to sit at.
  const lp = local(rearTop.clone().addScaledVector(ttDir, runLen * 0.74).addScaledVector(down, zipD * 0.45));
  const patchZ = skin(lp.x, lp.y, 1.4);
  patch(grp, brand, lp.x, lp.y, patchZ, patchW, 0);
  patch(grp, brand, lp.x, lp.y, -patchZ, patchW, Math.PI);
  return shadowify(grp);
}
