// Handlebar bag builder (mm-local, parented to the barroll anchor). Handles
// both the barrel form (dims_cm.dia) and the boxy form.
//
// AXIS MAPPING — BUILDER-BRIEF Rule 2. Checked against `mount.axes` in the
// model records and against assets/products/apidura/full/*/on-bike-*.jpg:
//
//   catalogue len -> world  z   (across the bike)      70 of the 74 records in
//   catalogue wid -> world +x   (fore-aft, forward)    this slot say exactly
//   catalogue hgt -> world +y   (up)                   this
//
// Four records disagree and say `len` runs fore-aft — Apidura's Racing Aerobar
// Pack, Revelate's Speedbag and Pitchfork, Andrew The Maker's Granny's Pantry.
// They are read off `axesOf(p)` and get len/wid swapped. Drawing a fore-aft bag
// across the bar is exactly the transposition Rule 2 exists to stop: it is why
// the aerobar pack rendered as a barrel skewered through the handlebar.
//
// Local frame of the returned group: -x is the flat back panel, which sits 2mm
// off the bar surface; +x is the belly; +y up; z across. Every placement value
// comes from ctx.points (barCenter, frontAxle, headTop, hd), ctx.geo and
// ctx.frameEdgeR — no literal offsets.

import * as THREE from 'three';
import { v3, deg } from '../../lib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boxBulge } from '../deform.js';
import { addPockets, bungeeArc, bungeeLattice, daisyChain, drawcordEnd, flapLid, orientArc, reflectiveArc, reflectiveStrip, zipperRun } from '../features.js';
import { rollTop, seamRing, seamStrip, strapAssembly, webbingRun } from '../hardware.js';
import { axesOf, featuresOf, geomOf, stiffnessOf, variantOf } from '../identity.js';
import { hardware, patch, seamMat, shadowify, soft, webbing } from '../materials.js';
import { barMount } from '../mount.js';

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
 * The two webbing straps a handlebar pack hangs from.
 *
 * They must visibly wrap the BAR (BUILDER-BRIEF §4) — a flattened torus on the
 * bar's own axis (z, across the bike) at the bar centre expressed in bag-local
 * space, with the webbing carried down the back panel to the bag. `noCollide`
 * on the wrap follows hardware.js `frameStraps`: a band that closes around a
 * tube has to overlap it.
 *
 * The count is 2 because every on-bike photo under assets/products shows two.
 * The records say so too — `straps[{role:'attachment', count:2}]` — but
 * apply-models.mjs carries only dims/render/geometry/axes/closure/structure
 * into brands.json, so no builder can read the strap block.
 */
function barStraps(grp, wm, hwm, { w, h, d, barLocal, barR }) {
  const yTop = h / 2;
  for (const s of [-1, 1]) {
    // just outboard of the stem, where every head-on shot puts them
    const z = s * w * 0.26;
    const band = new THREE.Group();
    // Bore == the tube: TorusGeometry(R, tube) has an inner radius of R − tube,
    // so R = barR + tube is the loop that closes ON the bar rather than hovering
    // round it.
    const loop = new THREE.Mesh(new THREE.TorusGeometry(barR + 2.4, 2.4, 6, 24), wm);
    loop.scale.z = 22 / 4.8;                     // ~22mm of webbing along the bar
    loop.position.set(barLocal.x, barLocal.y, z);
    band.add(loop);
    const cam = new THREE.Mesh(new RoundedBoxGeometry(13, 9, 24, 2, 2), hwm);
    cam.position.set(barLocal.x + barR + 7, barLocal.y - barR * 0.3, z);
    band.add(cam);
    // riser down the back panel; on a deep bag the bar is well above the
    // shoulder and this is the strap you see running up the back
    const y0 = Math.min(barLocal.y, yTop - 18);
    const riser = new THREE.Mesh(new THREE.BoxGeometry(3, yTop - y0, 20), wm);
    riser.position.set(-d / 2, (y0 + yTop) / 2, z);
    band.add(riser);
    // the whole assembly is attachment hardware: it wraps the bar by design, and
    // bagshot's body box (tools/bagshot.mjs:381) is meant to exclude it
    band.traverse((o) => { o.userData.noCollide = true; });
    grp.add(band);
  }
}

export function buildBarbag(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const geom = geomOf(p);
  const ax = axesOf(p);
  // soft | semi | rigid, from the model records — see stiffnessOf().
  const stiff = stiffnessOf(p);
  const closure = closureOf(p, feats);
  // Lids and flaps: the product's accent where its record names two colours, a
  // toned twin of the body where it names one. See panelMat.
  const panel = panelMat(main, accent);
  const wm = webbing();
  const hwm = hardware();
  const hasDia = p.dims_cm && p.dims_cm.dia;
  if (hasDia) {
    // barrel bag: soft cylinder along the bars
    const r = Math.min(p.mm.dia, 230) / 2;
    const mount = barMount(ctx, r);
    const len = Math.min(p.mm.len, mount.maxHalfLen * 2);
    const bodyAmp = vr.range(2.6, 3.8);
    const lift = bodyAmp + 1.5;
    const body = soft(new THREE.CapsuleGeometry(r * 0.98, Math.max(len - 2 * r, 6), 10, 30), main, {
      amp: bodyAmp, freq: vr.range(0.024, 0.034), seed: vr.seed % 983,
      stiffness: stiff,
      bulge: feats.shape === 'barrel' ? boxBulge(r, len / 2, r, r * 0.1) : null,
      aoDir: new THREE.Vector3(0, 0, 1), aoK: 0.81, aoSpan: 0.5,
    });
    body.rotation.x = Math.PI / 2;
    grp.add(body);
    for (const sgn of [1, -1]) {
      if (closure === 'rolltop') {
        const cap = rollTop(main, hwm, { r: r * 0.7, depth: 8 });
        cap.position.z = sgn * (len / 2 - 3);
        if (sgn < 0) cap.rotation.y = Math.PI;
        grp.add(cap);
      } else {
        const dc = drawcordEnd(main, hwm, { r: r * 0.76, depth: 10 });
        dc.position.z = sgn * (len / 2 - 3);
        if (sgn < 0) dc.rotation.y = Math.PI;
        grp.add(dc);
      }
      const sr = seamRing(main, r * 0.99, 1.2);
      sr.position.z = sgn * (len / 2 - Math.min(28, len * 0.09));
      grp.add(sr);
    }
    const nStraps = feats.compressionStraps ?? 2;
    for (let i = 0; i < nStraps; i++) {
      const f = nStraps === 1 ? 0 : (i / (nStraps - 1) - 0.5) * 2;
      const st = strapAssembly(wm, hwm, { r, width: 20, angle: -Math.PI / 2 });
      st.position.z = f * len * vr.range(0.22, 0.28);
      grp.add(st);
    }
    if (feats.cord) {
      const lat = bungeeArc(hwm, { R: r + lift, arc: deg(70), len: len * 0.55, n: 3 });
      orientArc(lat, v3(0, 0, 1), v3(1, 0, 0));
      grp.add(lat);
    }
    if (feats.reflective) {
      const rs = reflectiveArc({ R: r + lift, arc: deg(30), width: 9 });
      orientArc(rs, v3(0, 0, 1), v3(1, -0.5, 0));
      rs.scale.y = len * 0.45 / 9;
      grp.add(rs);
    }
    addPockets(grp, feats, main, hwm, {
      front: (make, i) => {
        const g = make.arc(r + lift, Math.min(len * 0.32, 180), deg(68));
        orientArc(g, v3(0, 0, 1), v3(1, -0.1, 0));
        g.position.z = (i % 2 === 0 ? -1 : 1) * len * 0.22;
        grp.add(g);
      },
    });
    patch(grp, brand, r + 2.5, vr.j(r * 0.1), vr.j(len * 0.05), 70, 0).rotation.set(0, Math.PI / 2, 0);
    grp.position.set(mount.x, mount.y, 0);
    grp.userData.halfLen = len / 2;
    grp.userData.radius = r;
    return shadowify(grp);
  }
  // See the axis mapping at the top of this file: `len` is across the bike
  // except where the record says otherwise.
  const foreAft = ax.isForeAft('len');
  const wPub = Math.min(foreAft ? p.mm.wid : p.mm.len, 400);
  const hPub = Math.min(p.mm.hgt, 300);
  const dPub = Math.min(foreAft ? p.mm.len : p.mm.wid, 260);
  // The measured rim→base narrowing. 0.85 for the three Apidura musettes; 1.0
  // (parallel) for the Expedition Front Accessory Pack, which is what its
  // record measures. Where a record is silent, keep the old narrow guess.
  const baseFrac = geom.taperRatio ?? (foreAft ? 1 : vr.range(0.92, 1));
  // amp/freq are drawn before the bulge amount to keep the jitter sequence the
  // same as it was before `bulge` was hoisted out of the options object —
  // otherwise every product in the slot shifts shape for no reason.
  const amp = vr.range(2.2, 3.2);
  const freq = vr.range(0.026, 0.034);
  const bulgeAmt = Math.min(dPub, hPub, wPub) * vr.range(0.08, 0.13);

  // ---- fit the PACKED shell to the published dims -------------------------
  // The systematic constant of this slot. `dims_cm` describes the finished,
  // packed bag; `soft()` domes each panel and jitters the fabric OUTSIDE the
  // pattern it is handed, so a box cut to the published depth finishes over it
  // every time. Measured in the v2 run: Canyon 2 L wid +29% hgt +18%, City 2 L
  // +22/+15%, Racing 2 L +19/+13% — three products with the same 100mm depth
  // and the same overshoot, not three mistakes.
  //
  // How far the dome actually travels is not `bulgeAmt`: RoundedBoxGeometry
  // collapses a flat face's interior vertices onto the corner arcs (see
  // frontSheet above), so what moves is the corner band, and how much of the
  // pillow falloff it catches depends on the corner radius. Rather than model
  // that, build the shell once, measure what came out, cut the pattern back by
  // the difference and build again. The standoff is an absolute, so one pass
  // converges.
  //
  // What stands off the shell and is still part of the bag's envelope: the flap
  // lying on the belly and folded over the mouth, the slab lid, the brand
  // patch. Those are drawn after the body and cannot be measured here — and
  // note they stand off by MORE than the shell does, because frontSheet and
  // topSheet are dense grids that follow the whole pillow dome where the
  // shell's collapsed box faces only catch the part of it the corner band
  // reaches. That difference is why the musette packs came out further over on
  // width and height than on length.
  const proud = closure === 'musette'
    ? { x: bulgeAmt + 4.7, y: bulgeAmt + 3.5, z: 0 }   // hem 3.5 + 1.2, fold on the mouth
    : { x: 3 + 1.2, y: 5, z: wPub * 0.02 };            // patch + seam strip, lid at h/2+5 and w*1.02
  let w = wPub, h = hPub, d = dPub, bulge = null, body = null;
  for (let pass = 0; pass < 2; pass++) {
    bulge = boxBulge(d / 2, h / 2, w / 2, bulgeAmt);
    body = soft(
      taperBody(new RoundedBoxGeometry(d, h, w, 7, Math.min(20, d * 0.3)), { h, d, baseFrac, foreAft }),
      main,
      {
        amp, freq, seed: vr.seed % 977,
        stiffness: stiff,
        bulge,
        aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.45,
      }
    );
    if (pass) break;
    if (!body.geometry.boundingBox) body.geometry.computeBoundingBox();
    const got = body.geometry.boundingBox.getSize(new THREE.Vector3());
    // How far the packed shell moved off each face of the pattern. One face's
    // worth: the dome is symmetric, and what is added to the published figure is
    // the shell behind plus whichever of the shell or the flap reaches further
    // in front. Never cut more than 45% — a rigid record takes no deform at all,
    // and a freak measurement should shrink the bag, not delete it.
    const fit = (pub, drawn, was, pr) => {
      const reach = Math.max((drawn - was) / 2, 0);
      return Math.max(pub - reach - Math.max(reach, pr), pub * 0.55);
    };
    d = fit(dPub, got.x, d, proud.x);
    h = fit(hPub, got.y, h, proud.y);
    w = fit(wPub, got.z, w, proud.z);
    body.geometry.dispose();
  }
  grp.add(body);
  if (closure === 'musette') {
    musetteFlap(grp, panel, hwm, { w, h, d, baseFrac, bulge, lightMount: !!p.features?.lightMount });
  } else if (closure === 'flap') {
    // params are NOT pre-swapped: the rotation below already maps the lid's
    // local X (width) across the bike and its Z (depth) fore-aft. Swapping here
    // too made the lid a shelf as deep as the bag is wide.
    const fl = flapLid(panel, wm, hwm, { w: w * 0.99, d: d * 0.99, drop: h * 0.42 });
    fl.rotation.y = Math.PI / 2;
    fl.position.y = h / 2 + 2;
    grp.add(fl);
  } else if (closure === 'zip') {
    const lid = new THREE.Mesh(new RoundedBoxGeometry(d * 0.94, 18, w * 1.02, 4, 9), panel);
    lid.position.y = h / 2 - 4;
    grp.add(lid);
    grp.add(zipperRun(v3(d / 2 + 1, h / 2 - 12, -w * 0.44), v3(d / 2 + 1, h / 2 - 12, w * 0.44), hwm, { accentMat: accent }));
  } else if (closure === 'rolltop' || closure === 'drawcord') {
    // A roll on a bag lying along the bike is an END cap, not a top: Apidura's
    // aerobar pack rolls at the FORWARD end — that is the end carrying the
    // sunburst, and it is the end facing the camera in the head-on shot
    // assets/products/apidura/full/racing-aerobar-pack/on-bike-1.jpg.
    const r = Math.min(foreAft ? h : d, w) * (closure === 'rolltop' ? 0.4 : 0.45);
    const cap = closure === 'rolltop'
      ? rollTop(main, hwm, { r, depth: 9 })
      : drawcordEnd(main, hwm, { r, depth: 10 });
    if (foreAft) {
      cap.rotation.y = Math.PI / 2;
      cap.position.x = d / 2 - 2;
    } else {
      cap.rotation.x = -Math.PI / 2;
      cap.position.y = h / 2 - 2;
    }
    grp.add(cap);
  } else {
    const lid = new THREE.Mesh(new RoundedBoxGeometry(d * 0.94, 18, w * 1.02, 4, 9), panel);
    lid.position.y = h / 2 - 4;
    grp.add(lid);
  }
  // horizontal panel seam a third of the way up
  const seam = seamStrip(main, d + 2.4, 2.6, w * 0.97);
  seam.position.y = -h / 6 + vr.j(h * 0.05);
  grp.add(seam);
  const nStraps = feats.compressionStraps ?? 2;
  for (let i = 0; i < nStraps; i++) {
    const f = nStraps === 1 ? 0 : (i / (nStraps - 1) - 0.5) * 2;
    webbingRun(grp, wm, hwm, {
      from: v3(d / 2, h * 0.42, f * w * 0.3), to: v3(d / 2, -h * 0.46, f * w * 0.3),
      width: 22, normal: 'x', proud: 1.0,
    });
  }
  if (feats.cord) {
    const lat = bungeeLattice(hwm, { w: w * 0.8, h: h * 0.6, n: 3 });
    lat.rotation.y = Math.PI / 2;
    lat.position.x = d / 2 + 2;
    grp.add(lat);
  }
  if (feats.reflective) {
    const rs = reflectiveStrip(w * 0.62, 10);
    rs.rotation.y = Math.PI / 2;
    rs.position.set(d / 2 + 2, -h * 0.34, 0);
    grp.add(rs);
  }
  if (feats.daisyChains) {
    const dcn = daisyChain(wm, { len: w * 0.7, rows: 2, band: Math.min(h * 0.16, 16) });
    dcn.rotation.y = Math.PI / 2;
    dcn.rotation.z = Math.PI / 2;
    dcn.position.set(d / 2 + 2, h * 0.1, 0);
    grp.add(dcn);
  }
  addPockets(grp, feats, main, hwm, {
    front: (make, i) => {
      const g = make(Math.min(w * 0.5, 170), h * 0.5);
      g.position.set(d / 2 + 1, -h * 0.08 - i * 4, 0);
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
  // the brand mark sits on the belly under the flap's leading edge, and a
  // tapered bag pulls that belly back from d/2
  const py = -h * 0.12 + vr.j(h * 0.05);
  const pfx = frontX(clamp01(py / h + 0.5), d, baseFrac);
  patch(grp, brand, pfx + bulge(pfx, py, 0, 1, 0, 0) + 3, py, vr.j(w * 0.08), 76, 0)
    .rotation.set(0, Math.PI / 2, 0);
  const P = ctx.points;
  const bc = P.barCenter, anchor = ctx.anchors.barroll.position;
  // a deep bag would otherwise hang into the front wheel: ride it high enough
  // that its underside clears the tyre at the bag's forwardmost point
  const wheelR = P.tireR + ctx.geo.tireWidth / 2;
  // The back panel lies ON the bar: every record in this slot carries
  // `mount.clearance.bar_mm: 0` and "back panel flat against the bar and the
  // cables". 2mm off the bar surface, not `mount.gap` — that standoff is the
  // barrel packs' spacer block, and 26mm of it here would float the bag off
  // the thing it mounts to (BUILDER-BRIEF §3). Off the tube the bike DRAWS,
  // not off mount.barR — see BAR_TUBE_R.
  const rearFace = bc.x + BAR_TUBE_R + 2;
  // The highest the tyre gets anywhere under the bag's footprint: at the axle
  // if the bag straddles it, at whichever edge is nearer if it does not. Taking
  // the forward edge alone understated it for any pack deep enough to reach
  // past the axle.
  const ax0 = rearFace, ax1 = rearFace + d;
  const dx = P.frontAxle.x >= ax0 && P.frontAxle.x <= ax1
    ? 0 : Math.min(Math.abs(ax0 - P.frontAxle.x), Math.abs(ax1 - P.frontAxle.x));
  const wheelTop = P.frontAxle.y + (dx < wheelR ? Math.sqrt(wheelR * wheelR - dx * dx) : 0);
  // …and clear it UNDER THE BAG'S OWN DROOP (BUILDER-BRIEF §3). The 24mm margin
  // was measured to the undeformed box, but the packed shell hangs below that.
  // `stuffed()` leaves the deformed bounds on the geometry, so measure the sag
  // instead of guessing at it. Without this, Ron's Bikes' Fabio's Chest and
  // Arkel's Handlebar Bag both sat within 3mm of the front tyre.
  if (!body.geometry.boundingBox) body.geometry.computeBoundingBox();
  const sag = Math.max(0, -body.geometry.boundingBox.min.y - h / 2);
  const bottomY = Math.max(wheelTop + 24 + sag, bc.y - h + 14);
  const org = v3(rearFace + d / 2, bottomY + h / 2, 0);
  // ---- what this bag hangs from ------------------------------------------
  // A `barpocket` does not mount to the bike at all: it clips to the FRONT FACE
  // of whatever handlebar bag is fitted (Apidura's Expedition Front Accessory
  // Pack to the Expedition Handlebar Pack, Revelate's Scrambler Pocket to the
  // roll's own straps). src/bags/slots.js declares that with `mountsTo` and
  // src/bags/system.js parents the mesh to the host bag and positions it there,
  // so everything below that reaches for `barCenter` is not just useless here,
  // it is the "floating — nearest mount 25.9mm" of the v4 gate: two webbing
  // loops drawn round a handlebar that is nowhere near this bag's local frame.
  //
  // What a pocket carries instead is on its BACK panel: hooks or buckles that
  // catch the host's straps or its Anchor Rails. Drawn against the back face,
  // which is the face that meets the host.
  const clipsToBag = p.slot === 'barpocket';
  if (clipsToBag) {
    for (const s of [-1, 1]) {
      const z = s * w * 0.3;
      const clip = new THREE.Group();
      // the webbing tail running up the back panel to the hook
      const tail = new THREE.Mesh(new THREE.BoxGeometry(3, h * 0.42, 18), wm);
      tail.position.set(-d / 2 - 1, h * 0.18, z);
      clip.add(tail);
      // the hook itself, standing off the back panel to catch the host's strap
      const hook = new THREE.Mesh(new THREE.TorusGeometry(9, 2.6, 6, 16, Math.PI * 1.35), hwm);
      hook.position.set(-d / 2 - 6, h * 0.4, z);
      hook.rotation.y = Math.PI / 2;
      hook.rotation.z = -Math.PI / 2;
      clip.add(hook);
      clip.traverse((o) => { o.userData.noCollide = true; });
      grp.add(clip);
    }
  } else {
    // the bar, in bag-local mm — everything that wraps it is placed off this
    barStraps(grp, wm, hwm, {
      w, h, d, barR: BAR_TUBE_R,
      barLocal: v3(bc.x - org.x, bc.y - org.y, 0),
    });
  }
  // The lower anti-sway strap. All three Apidura musette records carry
  // { role:'stability', count:1, wrapsAround:'head_tube' }, and without it the
  // bag reads as hanging off two straps with nothing stopping it swinging.
  // Foot of the bag's back panel, back to the head-tube axis — derived, never
  // measured off a screenshot. Only for a bag that HANGS from the bar: one
  // lying fore-aft sits on top of the bar (or on aerobar extensions) and has
  // nothing running down to the head tube. And only for the fold-over family:
  // those are the records that carry the stability strap, and since
  // apply-models.mjs does not merge `straps[]` the closure is the only thing
  // this builder can read that tells the two apart — a roll-top bar pack is as
  // likely to hang in a harness or off a decaleur.
  const headR = (ctx.frameEdgeR?.[2] ?? 24);
  const antiSway = !foreAft && !clipsToBag && (closure === 'musette' || closure === 'flap');
  const corner = v3(org.x - d / 2, org.y - h / 2, 0);
  const rel = v3(corner.x - P.headTop.x, corner.y - P.headTop.y, 0);
  // Nearest point on the head-tube axis, but kept in the band just under the
  // headset where every photo shows the strap. Unclamped, the nearest point to
  // a bag hanging this far forward is the very bottom of the head tube — which
  // is the fork crown and the lower headset cup, not somewhere a strap goes.
  const ht = ctx.geo.headTube;
  const t = Math.min(Math.max(rel.x * P.hd.x + rel.y * P.hd.y, ht * 0.18), ht * 0.55);
  const onTube = v3(P.headTop.x + P.hd.x * t - org.x, P.headTop.y + P.hd.y * t - org.y, 0);
  const foot = v3(-d / 2, -h / 2 + 8, 0);
  const run = onTube.clone().sub(foot);
  const runLen = run.length();
  if (antiSway && runLen > headR + 6) {
    const sway = new THREE.Group();
    const riser = new THREE.Mesh(new THREE.BoxGeometry(runLen - headR, 3, 16), wm);
    riser.position.copy(foot).addScaledVector(run, (runLen - headR) / 2 / runLen);
    riser.rotation.z = Math.atan2(run.y, run.x);
    sway.add(riser);
    const band = new THREE.Mesh(new THREE.TorusGeometry(headR + 3, 2.4, 6, 20), wm);
    band.scale.z = 16 / 4.8;
    band.position.copy(onTube);
    band.quaternion.setFromUnitVectors(v3(0, 0, 1), v3(P.hd.x, P.hd.y, 0));
    sway.add(band);
    sway.traverse((o) => { o.userData.noCollide = true; });
    grp.add(sway);
  }
  grp.position.set(org.x - anchor.x, org.y - anchor.y, 0);
  return shadowify(grp);
}
