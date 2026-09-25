// Handlebar bag builder (mm-local, parented to the barroll anchor), plus the
// `barpocket` slot — the accessory pocket that clips to the FRONT of a roll.
//
// ---- AXIS MAPPING (BUILDER-BRIEF Rule 2) ------------------------------------
// Checked against `mount.axes` in the records (70 of the 74 barbag records):
//
//   catalogue len -> grp-local z   across the bike
//   catalogue wid -> grp-local x   fore-aft, +x forward (the belly)
//   catalogue hgt -> grp-local y   up
//
// Four records say `len` runs fore-aft — Apidura's Racing Aerobar Pack,
// Revelate's Speedbag and Pitchfork, Andrew The Maker's Granny's Pantry. They
// are read off `axesOf(p)` and get len/wid swapped, as before this round; that
// mapping was already right. The barpocket records (Apidura Expedition Front
// Accessory Pack, Revelate Scrambler, Rockgeist Horton) all carry the same
// { len: across, wid: fore-aft depth, hgt: up }.
//
// ---- THREE FAMILIES IN ONE SLOT ----------------------------------------------
//  * ROLLS. Nineteen products in this slot are cylinders or barrels lying
//    across the bar (Salsa's Manzanita cradle and bag, Fairweather's Road Bar
//    Bag, Vincita Strada, EVOC Boa, Topeak Tubular, Wizard Works Lil' Presto,
//    Miss Grape Moon, SILCA Grinta …): `geometry.form` cylinder / barrel /
//    truncated_cylinder with the length across and at least 1.25 × the
//    diameter. They were drawn as boxes (Salsa) or as capsules with domed ends
//    (every dims_cm.dia product). They go to barroll.js `buildBarroll`, which
//    owns the handlebar roll: flattened rolled ends or flat sewn end panels,
//    webbing round bar and body, spacers or cradle as the record says.
//  * BOXES / BUCKETS / DRUMS hung from the bar: this file. Back panel flat on
//    the bar, belly forward, the record's taper carved in, a closure that
//    reads (fold-over musette flap, buckled flap, roll-top as a flattened roll
//    of fabric along the top, zip along the top edge), straps from straps.js
//    round the bar and down the back panel, the head-tube anti-sway strap.
//    Upright cylinders and buckets (Speedbag, Dr. Jones) are lofted round, not
//    boxed.
//  * POCKETS (`barpocket`): `buildPocket` below — a slim lozenge that lies flat
//    on the front of the roll, concave behind to follow it, strapped to it.
//
// The historic "lid jutting forward as a shelf" (flap params pre-swapped and
// rotated 90°) cannot recur: no lid here is a rotated slab any more. The flap
// is two fabric sheets built in place on the body (top and front), the same
// way the musette flap is.
//
// ---- PLACEMENT (Rule 1) ---------------------------------------------------------
// The back panel stands CABLE_GAP off the bar tube the bike DRAWS (BAR_TUBE_R),
// so the brake hoses pass behind it; the top
// sits at the bar and the bag hangs from it, riding up only as far as the
// front tyre (frontAxle, tireR + tireWidth/2) demands; the anti-sway strap runs
// to the head tube (headTop, hd, frameEdgeR[2]). The pocket is placed by
// src/bags/system.js on its host's front face; its own origin is set so that
// the CENTRE of its back meets that face (see buildPocket).

import * as THREE from 'three';
import { v3, deg } from '../../lib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boxBulge } from '../deform.js';
import { addPockets, bungeeLattice, daisyChain, drawcordEnd, meshPanelMat, reflectiveStrip, zipperRun } from '../features.js';
import { axesOf, featuresOf, geomOf, stiffnessOf, variantOf } from '../identity.js';
import { loftBody } from '../loft.js';
import { hardware, patch, seamMat, shadowify, soft, webbing } from '../materials.js';
import { buckle, meshOf, ribbonLoop, strapRun, tubeWrap } from '../straps.js';
import { buildBarroll } from './barroll.js';


const clamp01 = (t) => Math.min(Math.max(t, 0), 1);

/**
 * Fabric twin of `mat` at a different value.
 *
 * The lid, the flap and the hem take `accent`, and for a product whose record
 * carries ONE colourway `accent` is the same object as `main` — which is true of
 * every fold-over pack in this slot. The flap was therefore being drawn, 3.5mm
 * proud of the belly, in exactly the body's colour, and read as part of the box:
 * that is the round-4 critique's "the same parallel-sided box with NO FLAP" on
 * all three Apidura musettes. The flap is there; it was invisible.
 *
 * x5 is in LINEAR space, where THREE keeps colour, and lifts a #1c1c1e body to
 * about #454547 on screen — the value difference a laminated flap lying on a
 * matte body actually shows. Same trick, same reason, as barroll.js `tonedMat`.
 */
function tonedMat(mat, k) {
  const m = mat.clone();
  m.color = mat.color.clone().multiplyScalar(k);
  return m;
}

/**
 * The panel colour for a lid or flap: the product's accent where it HAS one,
 * and a toned twin of the body where its record only ever names one colour.
 */
function panelMat(main, accent) {
  return accent.color.getHex() === main.color.getHex() ? tonedMat(main, 4.2) : accent;
}

/**
 * The radius the handlebar TOPS are actually drawn at.
 *
 * src/bike.js:688 builds them with `tubeAlong([...], 11.9, M.aluDark)` and
 * lib.js:36 takes that argument as a radius. `barMount().barR` is 16, so every
 * bar-facing number derived from it — the back panel's standoff, the bore of
 * the strap loops — sits 4.1 mm clear of the tube it is supposed to be pulled
 * tight against. That is the whole of the visible daylight around the straps.
 * mount.js is shared, so this is corrected here and reported there.
 */
const BAR_TUBE_R = 11.9;

/**
 * Which closure to DRAW.
 *
 * `p.closure.type` is the controlled vocabulary apply-models.mjs merges out of
 * the records; `features.closure` is free text a human wrote ("fold-over with
 * velcro strips, full-width access"). This builder used to switch on the free
 * text, and not one of the three Apidura musette strings ever equalled 'flap' —
 * so all three fell through to the plain slab lid and the fold-over flap that
 * dominates every photo of them was never drawn at all.
 *
 * `musette` is the velcro fold-over below; `flap` is a strapped/buckled rando
 * lid, which is what features.js `flapLid` already builds.
 */
function closureOf(p, feats) {
  const t = String(p?.closure?.type || '');
  if (t === 'rolltop') return 'rolltop';
  if (t.startsWith('zip') || t === 'clamshell') return 'zip';
  if (t === 'drawcord') return 'drawcord';
  if (t === 'hook_and_loop_flap' || t === 'velcro' || t === 'magnetic') return 'musette';
  if (t === 'flap_buckle' || t === 'flap_strap') return 'flap';
  const s = String(feats.closure || '').toLowerCase();
  if (/roll/.test(s)) return 'rolltop';
  if (/zip/.test(s)) return 'zip';
  if (/drawcord|drawstring|cinch/.test(s)) return 'drawcord';
  if (/velcro|hook.and.loop|fold.over/.test(s)) return 'musette';
  if (/flap/.test(s)) return 'flap';
  return 'lid';
}

/**
 * How much of a bar bag's rim→base narrowing has happened at height fraction
 * `v` (0 at the base, 1 at the rim). Returned as a fraction of the record's own
 * `taperRatio`, so a product with a different taper keeps this shape rather
 * than inheriting one drawing's absolute numbers.
 *
 * This is the SHAPE of the curve only. How much narrowing there is comes from
 * the product's own `geometry.taper`, so two bags with different records get
 * different bags; what they share is that a soft-sided bucket does most of its
 * closing low down rather than leaning in evenly from the rim, which is a
 * property of the form and not of any one maker.
 *
 * The exponent was calibrated against a drawing that happened to be Apidura's
 * (racing-handlebar-pack/dimensions-1.png at 40.8 px/cm: the widest section is
 * 896px at v=0.25 and the base 797px). `(1-v)**1.5` follows it within half a
 * percent — 0.947 of full width at mid-height against the drawing's 0.954 —
 * and, unlike a table with a pinch in it, it leaves the rim at exactly the
 * published width.
 */
const waistK = (v) => (1 - clamp01(v)) ** 1.5;

/**
 * How much of the height, at the bottom, is the rounded FLOOR rather than the
 * side wall.
 *
 * Only applied where the record measured a narrowing base. A bucket does not
 * stand on a square-cut slab — every fold-over record in this slot says "both
 * lower corners are chamfered inwards" — and the critique's "shorter rounded
 * base" is this. A record that measures parallel sides (taper 1.0, e.g. the
 * Expedition Front Accessory Pack) keeps its square bottom.
 */
const BASE_ROUND = 0.17;

/** Where the belly sits at height fraction `v` (0 base, 1 rim), in bag-local x. */
const frontX = (v, d, baseFrac) => -d / 2 + d * (1 - (1 - baseFrac) * 0.5 * waistK(v));

/**
 * The bag's own taper, carved into the geometry.
 *
 * The three Apidura musette records all say "the bottom edge is shorter than
 * the top and both lower corners are chamfered inwards", with taper 1.0 → 0.85,
 * and both the drawing (797px across the base against 896px at the widest) and
 * the head-on shots agree that it closes toward the base. We were drawing a
 * parallel-sided box for every one of them. The record's ratio is what gets
 * applied; the drawing only settles the shape of the curve between the ends.
 *
 * This is structural, not padding, so it goes into the vertices rather than
 * through the `bulge` callback — BUILDER-BRIEF §1: a rigid product skips the
 * whole deform pass, and a taper expressed as a bulge would vanish with it.
 * Normals are deliberately NOT recomputed: RoundedBoxGeometry is non-indexed,
 * so computeVertexNormals() would facet every panel. `soft()` re-derives them
 * across welded groups for soft/semi bags, and for the four rigid packs in this
 * slot the residual error is the ~6 degrees the side panel leans.
 */
function taperBody(geo, { h, d, baseFrac, foreAft }) {
  if (baseFrac >= 0.999) return geo;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (foreAft) {
      // A bag lying along the bike tapers along its length; the records that
      // measure one (Apidura's aerobar pack, 0.8) pinch it at the rolled nose,
      // which is the forward end.
      const u = clamp01(pos.getX(i) / d + 0.5);
      const s = 1 - (1 - baseFrac) * u;
      pos.setY(i, pos.getY(i) * s);
      pos.setZ(i, pos.getZ(i) * s);
      continue;
    }
    const v = clamp01(pos.getY(i) / h + 0.5);
    const k = waistK(v);
    // …and the floor itself rolls under. A quarter-ellipse over the bottom
    // BASE_ROUND of the height, on both plan axes, so the bag closes onto a
    // rounded base instead of meeting the floor at a corner. The vertices are
    // there to move: RoundedBoxGeometry's bottom corner arcs occupy roughly this
    // band, which is why the effect lands even though its flat faces have no
    // interior vertices (see frontSheet).
    const u = v < BASE_ROUND ? (BASE_ROUND - v) / BASE_ROUND : 0;
    const floor = u > 0 ? Math.sqrt(Math.max(0, 1 - u * u)) : 1;
    pos.setZ(i, pos.getZ(i) * (1 - (1 - baseFrac) * k) * floor);
    // crossSection `flat_back`: the back panel stays flat against the bar and
    // the cables, so the depth closes on the belly side only, and by half as
    // much as the width.
    pos.setX(i, -d / 2 + (pos.getX(i) + d / 2) * (1 - (1 - baseFrac) * 0.5 * k) * floor);
  }
  pos.needsUpdate = true;
  return geo;
}

/**
 * A sheet of fabric lying on the belly, with its lower corners cut away.
 *
 * It is built from a PlaneGeometry grid and NOT from a RoundedBoxGeometry: the
 * addon collapses every interior vertex of a flat face onto the corner arcs
 * (RoundedBoxGeometry.js sets each position to `box * sign(position)`), so a
 * slab has no vertices between its corners — a per-row width cut and a per-row
 * bulge both flatten into one straight quad. That is worth knowing beyond this
 * file: it is also why the pillow `bulge` on a boxy body only ever acts in the
 * band the corner radius covers.
 *
 * `top` is where the sheet's upper edge sits, `drop` how far it hangs, `hem`
 * the leading edge's width as a fraction of the rim, `cut` the point down the
 * drop where the corners start to be cut away. z is mirrored so the winding
 * leaves the finished normal pointing +x, out of the belly.
 */
function frontSheet({ w, drop, top, h, d, baseFrac, bulge, proud, hem = 1, cut = 1, segW = 20, segH = 14 }) {
  const g = new THREE.PlaneGeometry(1, drop, segW, segH);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i);                             // -0.5 … 0.5
    const y = pos.getY(i) + top - drop / 2;
    const f = clamp01((y - (top - drop)) / drop);      // 1 at the fold, 0 at the leading edge
    const z = -u * w * (f >= cut ? 1 : hem + (1 - hem) * (f / cut));
    // the sheet has to follow the body or it floats: the belly recedes with the
    // taper AND domes forward under boxBulge, by more than a flap is thick
    const fx = frontX(clamp01(y / h + 0.5), d, baseFrac);
    pos.setXYZ(i, fx + bulge(fx, y, z, 1, 0, 0) + proud, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** The same, over the domed top face; z mirrored so the normal points +y. */
function topSheet({ w, d, h, bulge, proud, segW = 16, segD = 10 }) {
  const g = new THREE.PlaneGeometry(d, 1, segD, segW);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = -pos.getY(i) * w;
    pos.setXYZ(i, x, h / 2 + bulge(x, h / 2, z, 0, 1, 0) + proud, z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * The musette flap: one panel hinged at the top-rear that folds over the mouth
 * and down the front, its lower corners cut away so the leading edge is
 * narrower than the rim.
 *
 * Measured off racing-handlebar-pack/dimensions-1.png at 40.8 px/cm — the rim
 * spans the full 23cm, the leading edge 13.9cm (0.60 of the rim), and it hangs
 * 8.2cm below the rim, 0.55 of the 15cm body. The head-on shots read a little
 * deeper (racing-handlebar-pack/on-bike-2.jpg and city-handlebar-pack/
 * on-bike-1.jpg both put the leading edge around 0.67 of the way down a bag
 * whose rim is at the bar), because the drawing's rim is the flat pattern's and
 * the object loses some of it to the fold. `drop` takes the middle of the two.
 *
 * The drawing runs the sides in one straight line from the rim; on the object
 * the top corners wrap round the sides and the cut starts about halfway down,
 * which is the pentagon the critic reads on apidura-x-canyon-handlebar-pack/
 * studio-1.jpg and which both on-bike shots confirm.
 */
function musetteFlap(grp, mat, hwm, { w, h, d, baseFrac, bulge, lightMount }) {
  const th = 4;                       // laminated softshell, doubled at the hem
  const proud = 3.5;                  // clear of the shell's own noise
  const drop = h * 0.62;
  const hem = 0.58;
  const cut = 0.5;
  const top = h / 2;

  grp.add(new THREE.Mesh(
    frontSheet({ w, drop, top, h, d, baseFrac, bulge, proud, hem, cut }), mat));

  // the fold over the mouth itself — without it the bag reads as an open box
  // with a bib hung on the front
  grp.add(new THREE.Mesh(topSheet({ w, d, h, bulge, proud }), mat));

  // doubled hem along the leading edge, the one hard line in the drawing —
  // a strip of the hem's own width, so it needs no cut of its own
  const hemH = 5;
  grp.add(new THREE.Mesh(
    frontSheet({
      w: w * hem, drop: hemH, top: top - drop + hemH, h, d, baseFrac, bulge,
      proud: proud + 1.2, segW: 16, segH: 2,
    }),
    seamMat(mat)
  ));

  const onFace = (mesh, yy, lift) => {
    const fx = frontX(clamp01(yy / h + 0.5), d, baseFrac);
    mesh.position.set(fx + bulge(fx, yy, 0, 1, 0, 0) + proud + th / 2 + lift, yy, 0);
    grp.add(mesh);
  };
  if (lightMount) {
    // Two horizontal light-mount loops on the flap's centreline, at 20% and 30%
    // of the body height below the rim — the two dashes centred on the flap in
    // racing-handlebar-pack/on-bike-2.jpg, which is the view that fixes their
    // height against the fold rather than against the flat pattern. Sized off
    // the flap they sit on (a third of its leading edge) rather than off the one
    // pack the heights were read from.
    for (const f of [0.2, 0.3]) {
      onFace(new THREE.Mesh(new RoundedBoxGeometry(3, 8, w * hem * 0.36, 2, 1), hwm), h / 2 - h * f, 1);
    }
  } else {
    // No light mount: a pull tab centred on the leading edge, which is what a
    // fold-over closes with when there is nothing else on the flap. A THIRD of
    // the leading edge, not the literal 7.5 cm read off city-handlebar-pack/
    // dimensions-1.png — every other maker's fold-over was inheriting that.
    onFace(new THREE.Mesh(new RoundedBoxGeometry(3, 16, w * hem * 0.34, 2, 1.5), seamMat(mat)),
      h / 2 - drop + 12, 1);
  }
}

/**
 * straps.js `ribbonLoop` takes each vertex's tangent from its neighbours with
 * wrap-around, even for an open path — so the first and last vertex of an
 * open strap take their tangent across the gap and the band twists 90° over
 * its end segments. Pad each end with a vertex a hundredth of a millimetre
 * further on: the twist is then confined to a segment nobody can see.
 */
function padOpen(pts) {
  const a = pts[0], b = pts[1], y = pts[pts.length - 1], z = pts[pts.length - 2];
  return [a.clone().addScaledVector(a.clone().sub(b).normalize(), 0.01), ...pts, y.clone().addScaledVector(y.clone().sub(z).normalize(), 0.01)];
}

/**
 * Is this product a ROLL lying across the bar? Then barroll.js draws it.
 * Cylinders, barrels and truncated cylinders whose length runs across and is
 * at least 1.25 × their diameter — plus anything whose record publishes a
 * `dia`, which is what a round barrel is.
 */
function isRoll(p) {
  const f = p.geometry?.form;
  if (axesOf(p).isForeAft('len')) return false;
  if (p.dims_cm?.dia) return true;
  if (!['cylinder', 'barrel', 'truncated_cylinder'].includes(f)) return false;
  return p.mm.len >= 1.25 * Math.max(p.mm.wid, p.mm.hgt);
}

/**
 * The webbing a handlebar bag hangs from: a flat band round the bar tube and
 * a run down the back panel, where it threads through the bag's loops.
 * straps.js only — BUILDER-BRIEF §9.1: a torus scaled into a band reads as a
 * ring. The count is the records' `attachment × 2`.
 */
function barStraps(geos, hw, { w, d, barLocal, z0 = 0.26, top }) {
  for (const s of [-1, 1]) {
    // just outboard of the stem faceplate (bike.js draws it 40 mm across)
    const z = s * Math.max(w * z0, 30);
    geos.push(tubeWrap(v3(barLocal.x, barLocal.y, z), v3(0, 0, 1), BAR_TUBE_R + 0.2, { width: 22 }));
    const xb = -d / 2 - 1.2;
    const y0 = Math.min(barLocal.y - 14, top - 4), y1 = y0 - 46;
    // bar → back panel across the cable gap, then down the panel's loops
    const a = v3(barLocal.x + BAR_TUBE_R * 0.8, barLocal.y - BAR_TUBE_R * 0.6, z), b = v3(xb, y0, z);
    const ab = b.clone().sub(a);
    if (ab.length() > 2) geos.push(strapRun(a, b, v3(ab.y, -ab.x, 0).normalize(), { width: 22 }));
    geos.push(strapRun(v3(xb, y0, z), v3(xb, y1, z), v3(-1, 0, 0), { width: 22 }));
    hw.push(...buckle(v3(xb, y1 + 14, z), v3(0, -1, 0), v3(-1, 0, 0), { width: 20 }));
  }
}

/**
 * A roll-top mouth, rolled: a flattened bundle of fabric lying along the top
 * of a box bag (or standing across the front end of one that lies fore-aft),
 * with a buckle strap down each end of it. Not a slab, not a cap.
 */
function rollBundle(grp, mat, geos, hw, { len, r, at, axis, rolls, sideNormal = null, drop = null }) {
  const prof = [
    [0, -len / 2], [r * 0.7, -len / 2], [r * 0.95, -len / 2 + 3], [r, -len / 2 + 7],
    [r, len / 2 - 7], [r * 0.95, len / 2 - 3], [r * 0.7, len / 2], [0, len / 2],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(prof, 20);
  g.scale(1, 1, 0.8);
  const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), axis.clone().normalize());
  g.applyQuaternion(q);
  g.translate(at.x, at.y, at.z);
  const m = new THREE.Mesh(g, mat);
  grp.add(m);
  // the turned edge of the last roll
  for (let i = 0; i < Math.min(rolls, 3); i++) {
    const cr = new THREE.Mesh(new THREE.BoxGeometry(1.2, len * 0.92, 1.2), seamMat(mat));
    cr.quaternion.copy(q);
    const off = v3(Math.cos(deg(40 + i * 35)) * r, 0, Math.sin(deg(40 + i * 35)) * r * 0.8).applyQuaternion(q);
    cr.position.copy(at).add(off);
    cr.userData.noCollide = true;
    grp.add(cr);
  }
  // a buckle strap from each end of the bundle down the face beside it
  if (sideNormal) {
    for (const s of [-1, 1]) {
      const e = at.clone().addScaledVector(axis.clone().normalize(), s * (len / 2 - 14));
      const n = sideNormal.clone();
      const a = e.clone().addScaledVector(n, r + 0.6);
      const b = a.clone().add(drop);
      geos.push(strapRun(a, b, n, { width: 18 }));
      hw.push(...buckle(a.clone().addScaledVector(drop, 0.62), drop.clone().normalize(), n, { width: 18 }));
    }
  }
  return m;
}

/** Radius of a rolled mouth on a bag `depth` deep: ~4 mm a turn, 8–20 mm. */
function topRollR(depth, p) {
  const rolls = Math.min(Math.max(Number(p.closure?.rolls) || 3, 1), 5);
  return Math.min(Math.max(depth * 0.1 * (0.7 + rolls * 0.12), 8), 20);
}

// ---------------------------------------------------------------------------
// POCKET (`barpocket`)
// ---------------------------------------------------------------------------
/**
 * The accessory pocket that clips to the front of a roll: Apidura's Expedition
 * Front Accessory Pack, Revelate's Scrambler, Rockgeist's Horton.
 *
 * Owner: "sits on the front of the roll like a lozenge, never jutting forward
 * like a shelf". So: a slim pillow, its depth the record's `wid` (7–7.6 cm on
 * all three, inside the owner's 5–8), thickest in the middle and closing to a
 * welded rim all round; its BACK is concave, an arc about the host roll's axis,
 * so it lies on the roll's front instead of touching it along one line; its
 * top is the rolled mouth (all three are roll-tops), and two straps go up over
 * that roll and back to the host.
 *
 * Placement is src/bags/system.js's: the pocket's origin goes to
 * (host box max x + this box's half depth, host centre − 10 % of its height).
 * That assumes the pocket is centred on its own origin — true of a box, false
 * of anything concave behind, where the box's back is set by the curled top
 * and bottom and the middle of the back would float. So the whole pocket is
 * shifted inside its group until the CENTRE OF ITS BACK sits at −½ × its box
 * depth: that is the point system.js lands on the host's front face.
 */
function buildPocket(p, brand, main, accent, ctx) {
  const outer = new THREE.Group();
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const stiff = stiffnessOf(p);
  const wm = webbing();
  const hwm = hardware();
  const geos = [], hw = [];

  const w = Math.min(Math.max(p.mm.len, 120), 360);          // across
  const T = Math.min(Math.max(p.mm.wid, 50), 80);            // depth: owner's 5–8 cm
  const h = Math.min(Math.max(p.mm.hgt, 100), 280);          // tall
  // The back's arc: a roll of this slot is 12–20 cm across, but a pocket
  // taller than the roll cannot wrap it tighter than its own height allows
  // without curling over the top — so the arc eases out with the height.
  const Rb = Math.max(110, h * 0.72);
  // Below the middle the arc eases to half: the lower rim curling back under
  // the roll is what reaches toward the front tyre's crown.
  const xb = (y) => (Math.sqrt(Math.max(Rb * Rb - y * y, 0)) - Rb) * (y < 0 ? 0.45 : 1);
  // thickness: fuller toward the rolled top, rounded at the bottom and sides
  const fv = (v) => (v >= 0 ? (1 - v ** 6) ** 0.45 : (1 - (-v) ** 2.2) ** 0.55);
  const fu = (u) => (1 - Math.abs(u) ** 3.2) ** 0.4;
  const thick = (u, v) => T * fu(u) * fv(v);

  // the pillow: a front sheet and a back sheet meeting at the rim
  const NU = 28, NV = 24;
  const pos = [], idx = [];
  const vert = (u, v, front) => {
    const y = v * h / 2, z = u * w / 2;
    const x = xb(y) + (front ? thick(u, v) : 0);
    pos.push(x, y, z);
  };
  for (const front of [true, false]) {
    const base = pos.length / 3;
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) vert(-1 + (2 * i) / NU, -1 + (2 * j) / NV, front);
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const a = base + j * (NU + 1) + i, b = a + 1, c = a + NU + 2, d = a + NU + 1;
      if (front) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);   // front faces +x
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const body = soft(geo, main, {
    amp: 1.2, freq: 0.04, seed: vr.seed % 977, stiffness: stiff,
    aoDir: v3(0, -1, 0), aoK: 0.84, aoSpan: 0.45,
  });
  // The curled rim wraps BEHIND the host's front face, and src/bags/resolve.js
  // grids a bag into axis-aligned boxes — so the concave pillow, measured as
  // it is, overlaps its own host's front cell and the resolver drops the
  // pocket. The drawn pillow is therefore flagged noCollide, and what the
  // resolver, bagshot and the packing cavity measure is an ENVELOPE: the same
  // pillow with nothing behind the plane ENV_X, a closed, invisible volume
  // lying wholly in front of the host.
  body.userData.noCollide = true;
  grp.add(body);
  {
    const ENV_X = 3;
    const ep = [];
    const eIdx = [];
    for (const front of [true, false]) {
      const base = ep.length / 3;
      for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
        const u = -1 + (2 * i) / NU, v = -1 + (2 * j) / NV;
        const y = v * h / 2, z = u * w / 2;
        const xf = Math.max(xb(y) + thick(u, v), ENV_X);
        ep.push(front ? xf : ENV_X, y, z);
      }
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
        const a = base + j * (NU + 1) + i, b = a + 1, c = a + NU + 2, d = a + NU + 1;
        if (front) eIdx.push(a, c, b, a, d, c); else eIdx.push(a, b, c, a, c, d);
      }
    }
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3));
    eg.setIndex(eIdx);
    eg.computeVertexNormals();
    const env = new THREE.Mesh(eg, main);
    env.visible = false;
    env.userData.envelope = true;
    grp.add(env);
  }

  // the welded rim, piped
  const rim = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const u = Math.cos(a), v = Math.sin(a);
    // a superellipse round the pillow's outline
    const su = Math.sign(u) * Math.abs(u) ** 0.35, sv = Math.sign(v) * Math.abs(v) ** 0.35;
    rim.push(v3(xb(sv * h / 2) + 0.6, sv * h / 2 * 0.995, su * w / 2 * 0.995));
  }
  const pipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 128, 1.8, 5, true), seamMat(main));
  pipe.userData.noCollide = true;
  grp.add(pipe);

  // the rolled mouth along the top
  const yTop = h / 2 * 0.93;
  const tTop = T * fv(0.93);
  const rr = Math.min(Math.max(tTop * 0.42, 8), 16);
  const rolls = Math.min(Math.max(Number(p.closure?.rolls) || 2, 1), 4);
  if (p.closure?.type === 'rolltop' || !p.closure?.type) {
    // part of the drawn pillow, behind the envelope plane like the rim
    rollBundle(grp, main, geos, hw, {
      len: w * 0.86, r: rr, at: v3(xb(yTop) + tTop * 0.5, yTop + rr * 0.35, 0), axis: v3(0, 0, 1), rolls,
      sideNormal: null,
    }).userData.noCollide = true;
  }
  // the host straps: from the face, up over the roll, back to the host roll
  for (const s of [-1, 1]) {
    const z = s * w * 0.3;
    const path = [];
    for (let j = 0; j <= 8; j++) {
      const v = 0.25 + (0.93 - 0.25) * (j / 8);
      const y = v * h / 2;
      path.push(v3(xb(y) + thick(z / (w / 2), v) + 1.4, y, z));
    }
    const cxr = xb(yTop) + tTop * 0.5, cyr = yTop + rr * 0.35;
    for (let k = 1; k <= 8; k++) {
      const a = (k / 8) * Math.PI * 0.95;
      path.push(v3(cxr + Math.cos(a) * (rr + 1.4), cyr + Math.sin(a) * (rr * 0.8 + 1.4), z));
    }
    const end = path[path.length - 1];
    path.push(v3(end.x - 30, end.y + 2, z));
    geos.push(ribbonLoop(padOpen(path), v3(0, 0, 1), v3(cxr - 10, cyr - 20, z), { width: 20, lift: 0.2, closed: false }));
    hw.push(...buckle(path[3].clone().add(v3(0.4, 0, 0)), v3(0, 1, 0), v3(1, 0, 0), { width: 20 }));
    // the hook that catches the host's strap
    const hook = new THREE.Mesh(new THREE.TorusGeometry(7, 2.2, 6, 14, Math.PI * 1.3), hwm);
    hook.position.set(end.x - 32, end.y + 2, z);
    hook.rotation.set(0, Math.PI / 2, Math.PI / 2);
    hook.userData.noCollide = true;
    grp.add(hook);
  }
  // an external mesh pocket over the lower front, where the record has one
  if (/mesh/i.test(String(p.features?.pockets || '')) || feats.pockets.some((x) => x?.type === 'mesh')) {
    const mg = new THREE.PlaneGeometry(1, 1, 18, 10);
    const mp = mg.attributes.position;
    for (let i = 0; i < mp.count; i++) {
      const u = mp.getX(i) * 1.7, v = -0.85 + (mp.getY(i) + 0.5) * 0.9;
      mp.setXYZ(i, xb(v * h / 2) + thick(u, v) * 1.04 + 2.2, v * h / 2, -u * w / 2);
    }
    mg.computeVertexNormals();
    const mm = new THREE.Mesh(mg, meshPanelMat());
    mm.material.side = THREE.DoubleSide;
    mm.userData.noCollide = true;
    grp.add(mm);
  }
  if (feats.cord) {
    const lat = bungeeLattice(hwm, { w: w * 0.62, h: h * 0.45, n: 2 });
    lat.rotation.y = Math.PI / 2;
    lat.position.set(xb(0) + T + 3, -h * 0.08, 0);
    grp.add(lat);
  } else if (feats.daisyChains) {
    for (let i = 0; i < 4; i++) {
      const y = -h * 0.3 + i * h * 0.13;
      const x = xb(y) + thick(0, y / (h / 2)) + 0.4;
      geos.push(strapRun(v3(x, y, -w * 0.12), v3(x, y, w * 0.12), v3(1, 0, 0), { width: 12 }));
    }
  }
  patch(grp, brand, xb(-h * 0.1) + T * 0.99 + 1.5, -h * 0.1, vr.j(w * 0.06), Math.min(w * 0.34, 80), Math.PI / 2);
  if (geos.length) grp.add(meshOf(geos, wm));
  if (hw.length) grp.add(meshOf(hw, hwm));

  outer.add(grp);
  // see the doc comment: the back's centre goes to −½ × box depth
  // …less 3 mm, which is where the envelope (above) starts: the envelope then
  // meets the host's front face exactly and the drawn back lies on the roll.
  const box = new THREE.Box3().setFromObject(grp);
  grp.position.x = -(box.max.x - box.min.x) / 2 - 3;
  // system.js hangs the pocket's centre 10 % of the host's height below the
  // host's centre. A pocket taller than a roll (the Apidura and Revelate ones
  // are 23 cm against 12–20 cm rolls) then hangs its whole excess below it,
  // toward the tyre; riders hook these to the bar, so it rides up by part of it.
  grp.position.y = Math.min(Math.max((h - 150) * 0.3, 0), 26);
  outer.userData.backCentre = grp.position.x;
  return shadowify(outer);
}

// ---------------------------------------------------------------------------
// BAGS
// ---------------------------------------------------------------------------
export function buildBarbag(p, brand, main, accent, ctx) {
  if (p.slot === 'barpocket') return buildPocket(p, brand, main, accent, ctx);
  if (isRoll(p)) return buildBarroll(p, brand, main, accent, ctx);

  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const geom = geomOf(p);
  const ax = axesOf(p);
  const stiff = stiffnessOf(p);
  const closure = closureOf(p, feats);
  const panel = panelMat(main, accent);
  const wm = webbing();
  const hwm = hardware();
  const geos = [], hw = [];

  // See the axis mapping at the top of this file: `len` is across the bike
  // except where the record says otherwise.
  const foreAft = ax.isForeAft('len');
  const wPub = Math.min(foreAft ? p.mm.wid : p.mm.len, 400);
  const hPub = Math.min(p.mm.hgt, 300);
  const dPub = Math.min(foreAft ? p.mm.len : p.mm.wid, 260);
  // The measured rim→base narrowing: 0.85 for the three Apidura musettes, 1.0
  // for the parallel-sided. Where a record is silent, the old narrow guess.
  const baseFrac = geom.taperRatio ?? (foreAft ? 1 : vr.range(0.92, 1));
  const amp = vr.range(2.2, 3.2);
  const freq = vr.range(0.026, 0.034);
  const bulgeAmt = Math.min(dPub, hPub, wPub) * vr.range(0.08, 0.13);
  // Upright cylinders and buckets are lofted round, not boxed: Revelate's
  // Speedbag is a 9 cm tube standing 15 cm tall, Rockgeist's Dr. Jones a
  // drawcord bucket.
  const round = !foreAft && ['cylinder', 'truncated_cylinder', 'bucket'].includes(geom.form)
    || (foreAft && geom.form === 'truncated_cylinder' && p.mm.hgt > p.mm.len);

  let w = wPub, h = hPub, d = dPub, bulge = () => 0, body = null;
  /** belly x at height fraction v (0 base, 1 rim), on the drawn surface */
  let bellyX;
  if (round) {
    const kAt = (v) => 1 - (1 - baseFrac) * waistK(v);
    const xs = ['flat_back', 'd_shape'].includes(geom.crossSection) ? geom.crossSection : 'round';
    const loft = loftBody({
      len: h, rings: 24, shape: xs,
      sectionAt: (t) => ({ a: (d / 2) * kAt(t) * (t < 0.08 ? 0.9 + 0.1 * (t / 0.08) : 1), b: (w / 2) * kAt(t) }),
      capStart: true, capEnd: true,
    });
    // loft: u → x (−u is the flat side: the back), y → y, v → z
    loft.geo.translate(0, -h / 2, 0);
    body = soft(loft.geo, main, { amp: amp * 0.6, freq, seed: vr.seed % 977, stiffness: stiff, aoDir: v3(0, -1, 0), aoK: 0.8, aoSpan: 0.45 });
    bellyX = (v) => (d / 2) * kAt(v) + amp * 0.3;
  } else {
    // ---- fit the PACKED shell to the published dims -------------------------
    // `soft()` domes each panel outside the pattern it is handed, so a box cut
    // to the published depth finishes over it every time (v2: Canyon 2 L wid
    // +29%). Build once, measure, cut the pattern back by the difference, build
    // again. One pass converges: the standoff is an absolute.
    // a roll-top's published (minimum) height includes the rolled mouth on top
    const proud = closure === 'musette' || closure === 'flap'
      ? { x: bulgeAmt + 4.7, y: bulgeAmt + 3.5, z: 0 }
      : { x: 3 + 1.2, y: closure === 'rolltop' && !foreAft ? topRollR(dPub, p) * 1.25 : 3, z: 0 };
    for (let pass = 0; pass < 2; pass++) {
      bulge = boxBulge(d / 2, h / 2, w / 2, bulgeAmt);
      body = soft(
        taperBody(new RoundedBoxGeometry(d, h, w, 7, Math.min(20, d * 0.3)), { h, d, baseFrac, foreAft }),
        main,
        { amp, freq, seed: vr.seed % 977, stiffness: stiff, bulge, aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.45 }
      );
      if (pass) break;
      if (!body.geometry.boundingBox) body.geometry.computeBoundingBox();
      const got = body.geometry.boundingBox.getSize(new THREE.Vector3());
      const fit = (pub, drawn, was, pr) => {
        const reach = Math.max((drawn - was) / 2, 0);
        return Math.max(pub - reach - Math.max(reach, pr), pub * 0.55);
      };
      d = fit(dPub, got.x, d, proud.x);
      h = fit(hPub, got.y, h, proud.y);
      w = fit(wPub, got.z, w, proud.z);
      body.geometry.dispose();
    }
    const bf = foreAft ? 1 : baseFrac;
    bellyX = (v) => { const fx = frontX(v, d, bf); return fx + bulge(fx, (v - 0.5) * h, 0, 1, 0, 0); };
  }
  grp.add(body);

  // ---- closure --------------------------------------------------------------------
  if (closure === 'musette' && !round) {
    musetteFlap(grp, panel, hwm, { w, h, d, baseFrac, bulge, lightMount: !!p.features?.lightMount });
  } else if (closure === 'flap' && !round) {
    // A buckled flap: the SAME two sheets as the musette, laid on the body in
    // place — over the mouth and down the belly — with two straps and buckles
    // running down it. Nothing is a rotated slab, so nothing can be a shelf.
    const proud = 3.5, drop = h * 0.42;
    grp.add(new THREE.Mesh(frontSheet({ w: w * 0.98, drop, top: h / 2, h, d, baseFrac, bulge, proud, hem: 0.94, cut: 0.25 }), panel));
    grp.add(new THREE.Mesh(topSheet({ w: w * 0.98, d, h, bulge, proud }), panel));
    for (const s of [-1, 1]) {
      const z = s * w * 0.27;
      const path = [];
      for (let j = 0; j <= 10; j++) {
        const v = 1 - (j / 10) * 0.62;
        path.push(v3(bellyX(v) + proud + 1.6, (v - 0.5) * h, z));
      }
      geos.push(ribbonLoop(padOpen(path), v3(0, 0, 1), v3(0, 0, z), { width: 20, lift: 0.2, closed: false }));
      const bq = path[6];
      hw.push(...buckle(bq, v3(0, -1, 0), v3(1, 0, 0), { width: 20 }));
    }
  } else if (closure === 'rolltop') {
    const rolls = Math.min(Math.max(Number(p.closure?.rolls) || 3, 1), 5);
    const rr = topRollR(foreAft ? h : d, p);
    if (foreAft) {
      // lying along the bike, the roll is the forward END: a bundle standing
      // across it (Apidura's aerobar pack, Pitchfork)
      rollBundle(grp, main, geos, hw, {
        len: Math.min(h, w) * 0.92, r: rr, at: v3(d / 2 + rr * 0.35, 0, 0), axis: v3(0, 1, 0), rolls,
        sideNormal: null,
      });
    } else {
      rollBundle(grp, main, geos, hw, {
        len: w * 0.97, r: rr, at: v3(-d * 0.04, h / 2 + rr * 0.45, 0), axis: v3(0, 0, 1), rolls,
        sideNormal: null,
      });
      // buckle straps from the ends of the roll down the sides
      for (const s of [-1, 1]) {
        const zS = s * (w / 2 + (round ? 0 : bulgeAmt) + 1);
        const a = v3(-d * 0.04, h / 2 + rr * 0.45 + rr * 0.8, zS);
        const b = v3(-d * 0.04, h * 0.12, zS);
        geos.push(strapRun(a.clone().setY(h / 2 - 2), b, v3(0, 0, s), { width: 18 }));
        const over = [];
        for (let k = 0; k <= 6; k++) {
          const t = (k / 6) * Math.PI;
          over.push(v3(-d * 0.04 + Math.cos(t) * (rr + 1.5), h / 2 + rr * 0.45 + Math.sin(t) * (rr * 0.8 + 1.5), s * (w * 0.485 - 10)));
        }
        geos.push(ribbonLoop(padOpen(over), v3(0, 0, 1), v3(-d * 0.04, h / 2, s * (w * 0.485 - 10)), { width: 16, lift: 0.2, closed: false }));
        hw.push(...buckle(v3(-d * 0.04, h * 0.3, zS), v3(0, -1, 0), v3(0, 0, s), { width: 18 }));
      }
    }
  } else if (closure === 'drawcord') {
    const r = Math.min(foreAft ? h : d, w) * 0.45;
    const cap = drawcordEnd(main, hwm, { r, depth: 10 });
    if (foreAft && !round) { cap.rotation.y = Math.PI / 2; cap.position.x = d / 2 - 2; } else { cap.rotation.x = -Math.PI / 2; cap.position.y = h / 2 - 2; }
    grp.add(cap);
  } else {
    // zip (straight, horseshoe, two-way, dual slider) and anything unnamed: the
    // zip itself is the closure. A straight run along the top front edge; a
    // horseshoe also runs back along both sides of the lid.
    const yz = h / 2 - Math.min(10, h * 0.06);
    const xz = (round ? bellyX(0.97) : d / 2 - Math.min(20, d * 0.3) * 0.35) + 1.2;
    grp.add(zipperRun(v3(xz, yz, -w * 0.43), v3(xz, yz, w * 0.43), hwm, { accentMat: accent }));
    if (/horseshoe/.test(String(p.closure?.type || '')) && !round) {
      for (const s of [-1, 1]) grp.add(zipperRun(v3(xz, yz, s * w * 0.43), v3(-d * 0.3, yz + 3, s * w * 0.46), hwm, { accentMat: accent }));
    }
  }
  // (No horizontal seam strip: a straight box round a tapered body stood
  // proud of the lower belly as a ledge — the shelf this file exists to avoid.)

  // ---- compression straps, flat on the belly ----------------------------------------
  const nStraps = closure === 'flap' || closure === 'musette' ? 0 : Math.min(feats.compressionStraps ?? 0, 3);
  for (let i = 0; i < nStraps; i++) {
    const f = nStraps === 1 ? 0 : (i / (nStraps - 1) - 0.5) * 2;
    const z = f * w * 0.3;
    const path = [];
    for (let j = 0; j <= 10; j++) {
      const v = 0.94 - (j / 10) * 0.88;
      path.push(v3(bellyX(v) + 1.2, (v - 0.5) * h, z));
    }
    geos.push(ribbonLoop(padOpen(path), v3(0, 0, 1), v3(0, 0, z), { width: 20, lift: 0.2, closed: false }));
    hw.push(...buckle(path[4], v3(0, -1, 0), v3(1, 0, 0), { width: 20 }));
  }
  if (feats.cord) {
    const lat = bungeeLattice(hwm, { w: w * 0.72, h: h * 0.5, n: 3 });
    lat.rotation.y = Math.PI / 2;
    lat.position.set(bellyX(0.45) + 3, -h * 0.05, 0);
    grp.add(lat);
  }
  if (feats.reflective) {
    const rs = reflectiveStrip(w * 0.62, 10);
    rs.rotation.y = Math.PI / 2;
    rs.position.set(bellyX(0.16) + 2, -h * 0.34, 0);
    grp.add(rs);
  }
  if (feats.daisyChains && !feats.cord) {
    for (const v of [0.62, 0.42]) for (let i = 0; i < 5; i++) {
      const z = (i / 4 - 0.5) * w * 0.66;
      const x = bellyX(v) + 0.6;
      geos.push(strapRun(v3(x, (v - 0.5) * h, z - 10), v3(x, (v - 0.5) * h, z + 10), v3(1, 0, 0), { width: 12 }));
    }
  }
  addPockets(grp, feats, main, hwm, {
    front: (make, i) => {
      const g = make(Math.min(w * 0.5, 170), h * 0.5);
      g.position.set(bellyX(0.42) + 1, -h * 0.08 - i * 4, 0);
      g.rotation.y = Math.PI / 2;
    },
    side: (make, i) => {
      const s2 = i % 2 === 0 ? 1 : -1;
      const g = make(Math.min(d * 0.7, 120), h * 0.5);
      g.position.set(0, -h * 0.05, s2 * (w / 2 + 1));
      if (s2 < 0) g.rotation.y = Math.PI;
    },
    top: (make) => {
      const g = make(Math.min(w * 0.5, 150), Math.min(d * 0.7, 120));
      g.position.set(0, h / 2 + 1, 0);
      g.rotation.x = -Math.PI / 2;
    },
  });
  // the brand mark on the belly, under the flap's leading edge
  const pv = 0.38 + vr.j(0.05);
  patch(grp, brand, bellyX(pv) + 3, (pv - 0.5) * h, vr.j(w * 0.08), 76, 0).rotation.set(0, Math.PI / 2, 0);

  // ---- placement ---------------------------------------------------------------------
  const P = ctx.points;
  const bc = P.barCenter, anchor = ctx.anchors.barroll.position;
  const wheelR = P.tireR + ctx.geo.tireWidth / 2;
  // The back panel lies ON the bar: every record in this slot carries
  // `mount.clearance.bar_mm: 0` and "back panel flat against the bar and the
  // cables" — 2 mm off the tube the bike draws.
  // …but the brake hoses leave the bar just forward of it and run down past
  // the head tube (bike.js starts them 20 mm ahead of and 18 mm below the bar
  // centre, 2.6 mm thick); a back panel 2 mm off the tube sits on them. The
  // pack's own spacer/strap standoff is what clears them, so leave that gap.
  const CABLE_GAP = 16;
  const rearFace = bc.x + BAR_TUBE_R + CABLE_GAP;
  // the highest the tyre gets anywhere under the bag's footprint
  const ax0 = rearFace, ax1 = rearFace + d;
  const dx = P.frontAxle.x >= ax0 && P.frontAxle.x <= ax1
    ? 0 : Math.min(Math.abs(ax0 - P.frontAxle.x), Math.abs(ax1 - P.frontAxle.x));
  const wheelTop = P.frontAxle.y + (dx < wheelR ? Math.sqrt(wheelR * wheelR - dx * dx) : 0);
  // …clear of it under the bag's own droop (BUILDER-BRIEF §3), measured
  if (!body.geometry.boundingBox) body.geometry.computeBoundingBox();
  const sag = Math.max(0, -body.geometry.boundingBox.min.y - h / 2);
  const bottomY = Math.max(wheelTop + 24 + sag, bc.y - h + 14);
  const org = v3(rearFace + d / 2, bottomY + h / 2, 0);

  // the bar, in bag-local mm — what the straps wrap
  barStraps(geos, hw, { w, d, barLocal: v3(bc.x - org.x, bc.y - org.y, 0), top: h / 2 });

  // The lower anti-sway strap to the head tube, for a bag that HANGS from the
  // bar with a flap (the records that carry { role:'stability', wrapsAround:
  // 'head_tube' } are the fold-over family).
  const headR = (ctx.frameEdgeR?.[2] ?? 24);
  const antiSway = !foreAft && (closure === 'musette' || closure === 'flap');
  const corner = v3(org.x - d / 2, org.y - h / 2, 0);
  const rel = v3(corner.x - P.headTop.x, corner.y - P.headTop.y, 0);
  const ht = ctx.geo.headTube;
  const t = Math.min(Math.max(rel.x * P.hd.x + rel.y * P.hd.y, ht * 0.18), ht * 0.55);
  const onTube = v3(P.headTop.x + P.hd.x * t - org.x, P.headTop.y + P.hd.y * t - org.y, 0);
  const foot = v3(-d / 2, -h / 2 + 8, 0);
  const run = onTube.clone().sub(foot);
  const runLen = run.length();
  if (antiSway && runLen > headR + 6) {
    const end = foot.clone().addScaledVector(run, (runLen - headR) / runLen);
    geos.push(strapRun(foot, end, v3(-run.y, run.x, 0).normalize(), { width: 16 }));
    geos.push(tubeWrap(onTube, v3(P.hd.x, P.hd.y, 0), headR + 0.6, { width: 16 }));
  }
  if (geos.length) grp.add(meshOf(geos, wm));
  if (hw.length) grp.add(meshOf(hw, hwm));
  grp.position.set(org.x - anchor.x, org.y - anchor.y, 0);
  return shadowify(grp);
}
