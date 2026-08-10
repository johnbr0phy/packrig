// Stem bag builder (mm-local, parented to the stemL/stemR anchors).

import * as THREE from 'three';
import { v3 } from '../../lib.js';
import { bungeeLattice, cordMat, meshPanelMat, pocketBlock, reflectiveStrip } from '../features.js';
import { rollTop, seamCurve, seamRing } from '../hardware.js';
import { axesOf, featuresOf, geomOf, stiffnessOf, variantOf } from '../identity.js';
import { loftBody, sectionFor } from '../loft.js';
import { fabricMaterial, hardware, patch, shadowify, soft, webbing } from '../materials.js';

// ---------------------------------------------------------------------------
// AXIS MAPPING (BUILDER-BRIEF Rule 2), checked against Apidura's own dimensioned
// drawings in assets/products/apidura/full/*/dimensions-*.png and against their
// on-bike photographs.
//
// WORLD/LOCAL AXES. The stemL/stemR anchors are unrotated children of the frame
// group (bike.js `anchor()` passes ry = 0), so bag-local axes are frame axes:
//   +x = FORWARD   (bike.js: frontAxle.x = wheelbase + rearAxle.x, so front is +x)
//   +y = UP        (the bag hangs down from the bar)
//   ±z = ACROSS    (`side` = +1 for stemR, −1 for stemL)
// Nothing here is placed by a literal: the bar, the head tube and the anchor all
// come out of `ctx.points` / `ctx.anchors` / `ctx.frameEdgeR`.
//
// CATALOGUE AXES ARE PER PRODUCT, NOT PER SLOT. This builder used to assume
// `len` runs across the bike and `wid` fore-aft for all 38 products in the slot.
// The records disagree product by product — Apidura's Expedition Stem Pack says
// len→x wid→z, the Backcountry pouches say len→z wid→x, and Swift's Gibby says
// len→−y — so the mapping now comes from each record's own mount.axes through
// axesOf(). The Stem Pack was the visible casualty: 10 cm of across-bike width
// was being drawn fore-aft and 7 cm of depth drawn across, a 90° transposition
// that made it ~40% too deep and too narrow.
//
// HOW THE BAG HANGS. Apidura's side elevations put the handlebar (drawn as a
// circle) immediately FORWARD of the bag's top, with the velcro strap looping
// round it, and the fork strap running down to the steerer; the long diagonal
// chamfer is on the opposite side, i.e. the lower REAR corner — which is what
// "tapered to clear the knee" means, since the knee comes up from behind. So
// the body's front face is planted on the back of the bar and the chamfer eats
// the lower rear. The record's `mount.contactFaces: ["rear"]` is backwards for
// the three Backcountry pouches; the record has been corrected.
// ---------------------------------------------------------------------------

// Bar tops: bike.js draws them with tubeAlong(..., 11.9, ...) straight along z
// out to 0.6 × barWidth/2 = 132mm, so at the stem anchors (z = ±80) the bar is
// still a plain cylinder of radius ~12 running along z. The steerer above the
// headset is tubeBetween(headTop, steererTop, 14, 14).
const BAR_R = 12;

// Apidura's shockcord pull is bright yellow on every Backcountry and Expedition
// bag, and it is the loudest single detail on the product — the human review
// asked for "a coloured (yellow) catch at the front to lift it". It lives in the
// records under `closure.hardware`, which is free prose that
// tools/apply-models.mjs does not carry into brands.json, so there is no data
// channel for it today. See the report: `closure.hardware` (or a colour field on
// it) needs merging, and then this table goes away.
const CORD_HIGHLIGHT = { Apidura: 0xf2d21c };

// How far INSIDE the published box the fabric section is drawn. soft() displaces
// the shell outward along its normals by `amp` (1.2–1.8 mm here) and the welded
// seams stand a little proud of that, so a section drawn ON the published box
// measures over it. 1.6 mm is that stuffing, not a design allowance — the v2
// value of 4 mm was, and on a 60 mm axis it alone was a 13% under-read.
const SKIN = 1.6;

/** Flat webbing between two local points, oriented by the run itself. */
function strapRun(mat, a, b, w, thick = 2.6) {
  const d = b.clone().sub(a);
  const len = d.length();
  if (len < 0.5) return null;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, thick), mat);
  m.quaternion.setFromUnitVectors(v3(0, 1, 0), d.clone().normalize());
  m.position.copy(a).addScaledVector(d, 0.5);
  return m;
}

/**
 * A webbing band wrapping a bike tube. `axis` is the tube's own direction in
 * bag-local space, so the same helper serves the bar (running along z) and the
 * head tube (running down the head angle in the xy plane).
 *
 * Marked noCollide for the same reason frameStraps() does: a strap that wraps
 * its mount is meant to intersect it, and the clearance audit must not read
 * that as a bag buried in the bike.
 */
function tubeWrap(wm, { at, tubeR, axis, width = 16 }) {
  const loop = new THREE.Mesh(new THREE.TorusGeometry(tubeR + 3, 2.2, 6, 22), wm);
  loop.scale.z = Math.max(width / 4.4, 1);
  loop.quaternion.setFromUnitVectors(v3(0, 0, 1), axis.clone().normalize());
  loop.position.copy(at);
  loop.userData.noCollide = true;
  return loop;
}

export function buildStembag(p, brand, main, accent, ctx, side = 1) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  // soft | semi | rigid, from the model records — see stiffnessOf().
  const stiff = stiffnessOf(p);
  const geom = geomOf(p);
  const ax = axesOf(p);

  // ---- which catalogue dimension runs along which world axis ---------------
  // Each of len/wid/hgt is claimed by the first world axis its record names, in
  // a fixed order so the result is stable; anything the record leaves unsaid
  // falls back to this slot's historic default (hgt = drop, len = across,
  // wid = fore-aft), with the published `dia` standing in where that default
  // would have to reuse a dimension already spoken for.
  const claimed = new Set();
  const world = (k) => {
    const a = ax[k];
    return typeof a === 'string' && /^[-+]?[xyz]$/.test(a) ? a.replace(/[-+]/, '') : null;
  };
  const pick = (w) => {
    for (const k of ['hgt', 'len', 'wid']) {
      if (!claimed.has(k) && world(k) === w) { claimed.add(k); return p.mm[k]; }
    }
    return null;
  };
  const drop = pick('y') ?? p.mm.hgt;
  const across = pick('z') ?? (claimed.has('len') ? p.mm.dia : p.mm.len);
  const depth = pick('x') ?? (claimed.has('wid') ? p.mm.dia : p.mm.wid);

  const h = Math.min(drop, 300);
  const halfZ = Math.max(Math.min(across, 140) / 2 - SKIN, 12);

  // ---- fore-aft depth: mouth and base --------------------------------------
  // v2 read Apidura's published DIAMETER as a second fore-aft figure: their
  // drawing carries 9 cm at the top and 6 cm at the bottom of one elevation, so
  // it drew the mouth 9 cm DEEP and the base 6 cm. That is what made the three
  // food pouches 24–44% too fat fore-aft (0.8L measured x = 86.4 mm against a
  // published 6 cm), and it contradicts two things the same record says: the
  // spec sheet reads "9 cm wide x 16 cm tall x 6 cm DEEP", and `mount.axes`
  // puts `len` (9) across the bike and `wid` (6) fore-aft. Both published plan
  // figures are therefore honoured as written — 9 across, 6 deep — and the
  // 6/9 = 0.7 taper is what it always was on the drawing: the diagonal chamfer
  // off the lower rear corner, which is drawn below. `dia` is Apidura's
  // marketing figure for the same across-bike width and is no longer read here.
  const taper = geom.taperRatio ?? vr.range(0.72, 0.86);
  const mouthHX = Math.max(Math.min(depth, 150) / 2 - SKIN, 10);
  const baseHX = Math.max(Math.min(depth * taper, 150) / 2 - SKIN, 6);
  const kBase = baseHX / mouthHX;

  // ---- how the mouth closes, and what that costs the body's height ---------
  // The published height is the CLOSED bag, collar or flap included — the 0.8L
  // record says so outright: "The published 16 cm matches the collar-up state
  // ... cinched right down it loses roughly the 4 cm pale-grey collar". So the
  // closure is measured out of `h`, not stacked on top of it.
  const closure = String(p?.closure?.type || feats.closure || '').toLowerCase();
  const isFlap = /flap/.test(closure);
  const isRoll = /roll/.test(closure);
  // A fifth of the height is what the collar measures in Apidura's studio shots
  // and what the critique called it; the drawing shows it cinched flatter.
  const collarH = isFlap || isRoll ? 0 : Math.min(Math.max(h * 0.2, 20), h * 0.3);
  const lidH = isFlap ? 9 : isRoll ? Math.min(Math.max(halfZ * 0.6, 14), h * 0.25) : 0;
  const topRise = collarH + lidH;
  const bh = h - topRise;                 // the body proper, mouth at local y = 0

  // ---- where the bike is ---------------------------------------------------
  const anchorPos = ctx?.anchors?.[side > 0 ? 'stemR' : 'stemL']?.position ?? v3(0, 0, side * 80);
  const bar = ctx?.points?.barCenter;
  const barX = (bar?.x ?? anchorPos.x + 48) - anchorPos.x;
  const barY = (bar?.y ?? anchorPos.y + 16) - anchorPos.y;

  // A stem bag hangs BESIDE the stem, off the frame's centre plane. This builder
  // used to take no bike reference at all and simply hung off the anchor, so a
  // fat bag's inner face reached back across the centreline: the Randi Jo
  // Bartender Plus (65mm half-width on an 80mm anchor) sat 8.5mm inside the top
  // tube and grazed the down tube, and the drop bar passed straight through it.
  // Push out only as far as this bag's own half-width requires, never inboard.
  // The obstacle is the head tube, not the top tube: bike.js draws it at
  // frameEdgeR[2] (24mm) with headset cups 2.5mm proud of that. Straps, cinch
  // and patch also carry the bag ~10mm past the fabric, so clear from the
  // hardware envelope rather than from the half-width.
  const anchorZ = Math.abs(anchorPos.z || 80);
  const headR = (ctx?.frameEdgeR?.[2] ?? 24) + 2.5;
  const CLEAR = 8;
  const outward = Math.max(headR + halfZ + 10 + CLEAR - anchorZ, 0);

  // Group origin = the centre of the MOUTH section, at bar height, with the
  // body's front face planted on the back of the bar. Everything below is
  // therefore in a space where the bar centreline sits at (mouthHX + BAR_R, 0).
  grp.position.set(barX - BAR_R - mouthHX, barY, side * outward);
  const barLX = mouthHX + BAR_R;
  const frameToLocal = (pt) => v3(
    pt.x - anchorPos.x - grp.position.x,
    pt.y - anchorPos.y - grp.position.y,
    (pt.z ?? 0) - anchorPos.z - grp.position.z
  );

  // ---- body ----------------------------------------------------------------
  // A sewn feed bag loses its taper as a single diagonal cut across the lower
  // REAR corner — that chamfer is the defining line of the Apidura silhouette
  // and we drew none of it. A turned cylinder tapers evenly instead. `t` runs
  // 0 at the base to 1 at the mouth.
  //
  // measuredProfile(p) is deliberately NOT used here. data/diagram-profiles.json
  // does hold a trace for three of these four bags, but the tracer swallowed the
  // hanging fork strap and the cord tails below the bag: the 0.8L's first twelve
  // stations sit at ~0.09 (that is the cord, not the pouch) and the Stem Pack's
  // curve has three runs of hard zeros through its middle. Driving the section
  // off it would spike the base into a thread. The drawings' own dimensioned
  // numbers are used instead, which is the same evidence without the tracing.
  const section = sectionFor(geom.crossSection, 'rounded_rect');
  const chamfered = (section !== 'round' && section !== 'oval')
    || /knee|taper/i.test(String(feats.shape || ''));
  // Slope measured off the drawings: the diagonal runs ~30° off vertical on
  // both the 0.8L (30mm of depth lost over 52mm of height) and the Stem Pack
  // (17.5mm over 30mm), so the chamfer's height follows from how much depth the
  // taper has to remove rather than being a second invented constant.
  const chamHeight = Math.min((mouthHX - baseHX) * 2 * 1.73, bh * 0.55);
  const tCham = Math.max(1 - chamHeight / bh, 0.35);
  const kx = (t) => (t >= tCham ? 1 : kBase + (1 - kBase) * (t / tCham));
  // The front elevation of both drawings is a parallel-sided rectangle, so only
  // a third of the fore-aft loss shows up across the bike.
  const kz = (t) => 1 - (1 - kx(t)) * 0.35;

  const loft = loftBody({
    len: bh, rings: 30, shape: section,
    sectionAt: (t) => {
      const a = mouthHX * kx(t);
      // One-sided cut: the front face stays a straight vertical plane at
      // +mouthHX (it is what the bar and the fork strap hold), and every
      // millimetre the taper removes comes off the rear.
      return { a, b: halfZ * kz(t), cu: chamfered ? mouthHX - a : 0 };
    },
  });
  // `d_shape` in loft.js is flat on −z and round on +z — flat INBOARD, which is
  // what the records mean, but only on the right-hand bag. Mirror the left one
  // in z (and reverse the winding, or it lights from the inside).
  if (side < 0) {
    const pos = loft.geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, -pos.getZ(i));
    const idx = loft.geo.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    loft.geo.index.needsUpdate = true;
  }

  // Two-tone. Every one of these records describes a dark harness and trim over
  // a lighter body panel — Apidura's is "black laminated upper/harness panels
  // over a mid-grey laminated body panel" — but a colourway that carries one hex
  // resolves main and accent to the same colour, which is why four different
  // bags rendered as one uniform black blob. Where that happens, lift the BODY
  // toward the brand's own mid tone (`brand.palette[2]`, which for Apidura is
  // the #8a8d90 their brand note calls "subtle grey panels") and leave the
  // harness at the colourway's hex. Where the catalogue does give two colours,
  // main/accent are used as authored and nothing is derived.
  const oneTone = main.color.getHex() === accent.color.getHex();
  const tone = (k, target) => fabricMaterial(brand.fabricKey,
    main.color.clone().lerp(new THREE.Color(target), k));
  const midHex = brand?.palette?.[2] ?? 0x8a8d90;
  const bodyMat = oneTone ? tone(0.62, midHex) : main;
  const trimMat = oneTone ? main : accent;
  // "A PALE GREY gathered drawcord collar" — at 0.8 of the way to #d2d5d7 over a
  // #1c1c1e body the collar came out a mid grey that read as shadow on the black
  // shell rather than as a different piece of cloth.
  const collarMat = tone(0.88, 0xd2d5d7);

  const body = soft(loft.geo, bodyMat, {
    amp: vr.range(1.2, 1.8), freq: vr.range(0.04, 0.052), seed: vr.seed % 929,
    stiffness: stiff,
    aoDir: v3(0, -1, 0), aoK: 0.8, aoSpan: 0.5,
  });
  body.position.y = -bh;              // loft runs base→mouth; the mouth is at y = 0
  grp.add(body);

  // Welded panel joins down every corner of the recorded section. Without them
  // a d_shape reads as a turned barrel however square the section is — the
  // owner's word for the v2 bodies was "round-bellied revolve". `seamCurve` is
  // noCollide, so this is silhouette only and costs the size gate nothing.
  // Mirrored in z alongside the shell above for the left-hand bag.
  for (const line of loft.seams) {
    const sp = line.filter((_, i) => i % 3 === 0).map((q) => {
      const n = v3(q.x - (chamfered ? mouthHX - mouthHX * kx(q.y / bh) : 0), 0, q.z);
      if (n.lengthSq() > 1e-6) n.normalize().multiplyScalar(1.1);
      return v3(q.x + n.x, q.y - bh, (side < 0 ? -q.z : q.z) + (side < 0 ? -n.z : n.z));
    });
    if (sp.length > 2) grp.add(seamCurve(bodyMat, sp, 0.85));
  }

  const wm = webbing();
  const hwm = hardware();
  const out = side;                                  // +1 outboard is +z, −1 is −z
  const outZ = (f = 1) => out * halfZ * f;
  const cordHex = CORD_HIGHLIGHT[brand?.name] ?? null;
  const cordHi = cordHex != null
    ? new THREE.MeshStandardMaterial({ color: cordHex, roughness: 0.45 })
    : cordMat();

  // ---- the harness band ----------------------------------------------------
  // The straps do not sew into the shell; they sew into a reinforced band that
  // wraps the top of the bag, and in the studio photographs that band is the
  // black against which the grey body reads. Without it the two tones have no
  // boundary and the bag is one colour again.
  const bandH = Math.max(bh * 0.13, 16);
  const band = loftBody({
    len: bandH, rings: 3, shape: section,
    sectionAt: (t) => {
      const bt = 1 - (bandH / bh) * (1 - t);
      return { a: mouthHX * kx(bt) + 1.4, b: halfZ * kz(bt) + 1.4, cu: chamfered ? mouthHX - mouthHX * kx(bt) : 0 };
    },
  });
  const bandMesh = new THREE.Mesh(band.geo, trimMat);
  bandMesh.position.y = -bandH;
  grp.add(bandMesh);

  // ---- closure -------------------------------------------------------------
  if (!isFlap && !isRoll) {
    // DRAWCORD COLLAR. 33 of the 38 products in this slot close with one, and
    // it was drawn on none of them: the pouch domed shut and had no opening at
    // all. On Apidura's it is a pale grey gathered tube standing a fifth of the
    // bag's height proud of the black body — the single loudest feature of the
    // product. Height from the record's own note: "cinched right down it loses
    // roughly the 4 cm pale-grey collar" on a 16 cm bag.
    const collar = loftBody({
      len: collarH, rings: 9, shape: section, capEnd: false,
      sectionAt: (t) => {
        const k = 1 - 0.2 * t ** 1.4;               // gathers in as the cord pulls
        return { a: mouthHX * k, b: halfZ * k, cu: 0 };
      },
    });
    // High-frequency, low-amplitude noise is what reads as gathered fabric;
    // the collar is loose cloth whatever the body's structure class says.
    const cm = soft(collar.geo, collarMat, {
      amp: 2.2, freq: 0.16, seed: (vr.seed % 617) + 11,
      aoDir: v3(0, -1, 0), aoK: 0.86, aoSpan: 0.7,
    });
    grp.add(cm);
    // The seam where the pale collar is welded to the dark body. The critique
    // that the 1.2L "still has no collar" was made against a render where the
    // two tones met with no line between them, so the gather read as a lighter
    // patch of the same bag rather than as a separate tube of cloth.
    const hem = seamRing(trimMat, mouthHX * 1.005, 1.5);
    hem.scale.set(1, (halfZ * 1.005) / (mouthHX * 1.005), 1);
    hem.rotation.x = Math.PI / 2;
    grp.add(hem);
    // the cord itself, running round the gathered mouth
    const cord = new THREE.Mesh(new THREE.TorusGeometry(mouthHX * 0.9, 1.7, 5, 30), cordMat());
    cord.rotation.x = Math.PI / 2;
    cord.scale.y = (halfZ * 0.9) / (mouthHX * 0.9);
    cord.position.y = collarH * 0.62;
    grp.add(cord);
    // two stacked barrel locks on the outboard face, and the pull loop below
    for (const yf of [0.06, 0.26]) {
      const lock = new THREE.Mesh(new THREE.BoxGeometry(9, 11, 8), hwm);
      lock.position.set(mouthHX * 0.34, -bh * yf, outZ(1.02));
      grp.add(lock);
    }
    // The yellow pull hangs FLAT on the outboard face — in every studio shot it
    // lies against the panel. Standing it in the yz plane, which is what
    // rotation.y did, put a 16mm ring out sideways past the widest point of the
    // bag and was worth ~11% of the 0.8L's across-bike size error on its own.
    const pull = new THREE.Mesh(new THREE.TorusGeometry(bh * 0.09, 1.9, 5, 26), cordHi);
    pull.position.set(mouthHX * 0.34, -bh * 0.22, outZ(1.03));
    grp.add(pull);
  }

  if (isRoll) {
    // Two products in this slot roll shut rather than cinching (Road Runner's
    // Auto-Pilot, Rockgeist's Honeybox). rollTop stacks toward its own +z, so it
    // is turned to stack upward out of the mouth.
    const rt = rollTop(trimMat, hwm, {
      r: halfZ, depth: 8, rings: p?.closure?.rolls || 3, back: false,
    });
    // rollTop is built in its own XY plane and stacks toward +z, with the
    // flattened lip along its x. Turning it up (+z → +y) and then a quarter turn
    // about y lays that lip ACROSS the bike, which is the axis a top-opening
    // roll flattens along.
    rt.rotation.x = -Math.PI / 2;
    const rtHolder = new THREE.Group();
    rtHolder.rotation.y = Math.PI / 2;
    rtHolder.add(rt);
    grp.add(rtHolder);
  }

  if (isFlap) {
    // FOLD-OVER FLAP LID. Apidura's Expedition Stem Pack drawing shows a lid
    // that wraps the whole mouth and drops a skirt over the top third of the
    // front face, held by a Fidlock disc at the centre of that face with a
    // yellow shockcord running down to it in a V. Ours had a 7mm slab and a
    // floating tab.
    const drop = bh * 0.3;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(mouthHX * 2 + 5, 9, halfZ * 2 + 5), trimMat);
    lid.position.y = 3;
    grp.add(lid);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(mouthHX * 2 * 0.98, drop, 7), trimMat);
    skirt.position.set(0, -drop / 2, outZ(1.02));
    grp.add(skirt);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 4, 20), hwm);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0, -drop * 0.78, outZ(1.1));
    grp.add(disc);
    // the shockcord V, from the two lower corners of the skirt into the disc,
    // then a loop hanging below it — the coloured catch you lift the lid by
    for (const sx of [-1, 1]) {
      const leg = strapRun(cordHi, v3(sx * mouthHX * 0.6, -drop * 0.1, outZ(1.06)),
        v3(0, -drop * 0.78, outZ(1.1)), 3.4, 3.4);
      if (leg) grp.add(leg);
    }
    // The catch loop hangs flat on the panel like the pull on the pouches. Stood
    // on edge it reached 19mm past the widest point of a bag whose across-bike
    // size was already being measured 31% over.
    const catchLoop = new THREE.Mesh(new THREE.TorusGeometry(drop * 0.26, 2, 5, 24), cordHi);
    catchLoop.position.set(0, -drop * 1.02, outZ(1.04));
    grp.add(catchLoop);
  }

  // ---- attachment ----------------------------------------------------------
  // NOTHING held the previous bag onto the bike: it hung behind the bar tops
  // touching air. Every record in this slot specifies straps over the bar and
  // one stability strap down to the fork or head tube, so both are drawn, and
  // both are placed off the bike rather than off the bag.
  const barLoops = 2;
  for (let i = 0; i < barLoops; i++) {
    const z = (i - (barLoops - 1) / 2) * halfZ * 0.9;
    grp.add(tubeWrap(wm, { at: v3(barLX, 0, z), tubeR: BAR_R, axis: v3(0, 0, 1), width: 17 }));
    // the Hypalon tab it is sewn to, on the bag's front face
    const tab = new THREE.Mesh(new THREE.BoxGeometry(4, bandH * 0.9, 19), trimMat);
    tab.position.set(mouthHX + 1, -bandH * 0.5, z);
    grp.add(tab);
  }

  // The stability strap: down to the head tube, at the height the bag's base
  // actually reaches. Walk the head-tube axis (bike.points headTop → headBottom)
  // rather than guessing a point, and wrap it on its own direction.
  const hTop = ctx?.points?.headTop;
  const hBot = ctx?.points?.headBottom;
  if (hTop && hBot) {
    const a = frameToLocal(hTop);
    const b = frameToLocal(hBot);
    const yAt = -bh + Math.min(bh * 0.1, 14);
    const t = Math.min(Math.max((yAt - a.y) / (b.y - a.y || 1), 0), 1);
    const at = a.clone().lerp(b, t);
    const axis = v3(b.x - a.x, b.y - a.y, 0).normalize();
    const tubeR = (ctx?.frameEdgeR?.[2] ?? 24) + 2;
    grp.add(tubeWrap(wm, { at, tubeR, axis, width: 15 }));
    // The run from the bag's base out to that wrap, with its buckle on it.
    //
    // noCollide, for the same reason tubeWrap() above is: this webbing crosses
    // the ~90mm of air between the bag and the frame centre plane BY DESIGN, and
    // tools/bagshot.mjs measures the "body" bbox over everything not so marked.
    // Unmarked, it was the single largest size fault in this slot — it alone put
    // the 0.8L's across-bike box at 117mm against a published 90 (+30%) and the
    // Stem Pack's at 131 against 100 (+31%), on bags whose fabric measures 82
    // and 92. It is also what read as "down tube 3.4mm" in the clearance list on
    // a bag that never comes near the down tube.
    const from = v3(mouthHX - baseHX, yAt, out * halfZ * kz(0.05) * 0.4);
    const toward = at.clone().addScaledVector(v3(0, 0, at.z > from.z ? -1 : 1), tubeR + 3);
    const run = strapRun(wm, from, toward, 15);
    if (run) { run.userData.noCollide = true; grp.add(run); }
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(17, 12, 8), hwm);
    buckle.quaternion.setFromUnitVectors(v3(0, 1, 0), toward.clone().sub(from).normalize());
    buckle.position.copy(from).lerp(toward, 0.55);
    buckle.userData.noCollide = true;
    grp.add(buckle);
  }

  // ---- panels, pockets and trim -------------------------------------------
  // The seam where the base panel is welded on is exactly where the chamfer
  // starts, so one ring draws both the weld and the fold line. A bag with no
  // taper has no fold, and the weld sits down at the base instead.
  const tSeam = kBase < 0.98 ? tCham : 0.08;
  const sr = seamRing(bodyMat, mouthHX * kx(tSeam) * 0.99, 1.2);
  sr.scale.set(1, (halfZ * kz(tSeam)) / (mouthHX * kx(tSeam)), 1);
  sr.rotation.x = Math.PI / 2;
  sr.position.set(chamfered ? mouthHX - mouthHX * kx(tSeam) : 0, -bh * (1 - tSeam), 0);
  grp.add(sr);

  // The "Plus" exists for one reason: an external mesh wrapper pocket around
  // the lower half of the body, which we did not draw, leaving it identical to
  // the standard 1.2L bar its label. The catalogue carries pockets two ways —
  // a structured array on some products and free text on others — and the Plus
  // has only the text, so read both.
  const pocketText = typeof p?.features?.pockets === 'string' ? p.features.pockets : '';
  const wrapper = /mesh/i.test(pocketText) && /external|wrapper/i.test(pocketText);
  if (wrapper) {
    const top = 0.46;                      // drawn on Apidura's dimensions-3.png
    const sleeve = loftBody({
      len: bh * top, rings: 8, shape: section, capStart: false, capEnd: false,
      sectionAt: (t) => {
        const bt = t * top;
        return { a: mouthHX * kx(bt) + 3.5, b: halfZ * kz(bt) + 3.5, cu: chamfered ? mouthHX - mouthHX * kx(bt) : 0 };
      },
    });
    const mesh = new THREE.Mesh(sleeve.geo, meshPanelMat());
    mesh.position.y = -bh;
    grp.add(mesh);
    const hem = seamRing(trimMat, mouthHX * kx(top) + 4, 2.2);
    hem.scale.set(1, (halfZ * kz(top) + 4) / (mouthHX * kx(top) + 4), 1);
    hem.rotation.x = Math.PI / 2;
    hem.position.set(mouthHX - mouthHX * kx(top), -bh * (1 - top), 0);
    grp.add(hem);
    // The record says "external mesh POCKETS", plural, and the reason the Plus
    // still read as the standard 1.2L is that one unbroken sleeve of the same
    // dark mesh over a dark body has no line in it. Bound vertical dividers off
    // the sleeve's own corner seams split it into the separate pockets the
    // product is named for. seamCurve is noCollide, so this costs no size.
    for (const line of sleeve.seams) {
      const sp = line.filter((_, i) => i % 2 === 0)
        .map((q) => v3(q.x, q.y - bh, side < 0 ? -q.z : q.z));
      if (sp.length > 2) grp.add(seamCurve(trimMat, sp, 1.3));
    }
  }

  // Everything applied to the outboard face is built facing its own +z, so the
  // left-hand bag turns it to face −z. One expression, used by all of them.
  const faceOut = out > 0 ? 0 : Math.PI;

  // Structured pockets, where a record gives them: a flat applied pocket on the
  // outboard face. `pocketArc` is for lathe bodies and would land on +z whatever
  // side the bag is on, so the block is placed and turned explicitly.
  feats.pockets.forEach((pk, i) => {
    const kind = pk.type || 'zip';
    const g = pocketBlock(bodyMat, hwm, {
      w: Math.min(mouthHX * 1.5, 70), h: bh * 0.34,
      proud: kind === 'slip' ? 3.5 : kind === 'mesh' ? 4 : 5,
      mesh: kind === 'mesh', stretch: kind === 'stretch',
    });
    g.position.set(-mouthHX * 0.1, -bh * (0.44 + i * 0.24), outZ(1.02));
    g.rotation.y = faceOut;
    grp.add(g);
  });

  if (feats.cord) {
    // A criss-cross bungee across the outboard face. bungeeArc() samples onto a
    // cylinder and would float off a panelled body.
    const lat = bungeeLattice(hwm, { w: mouthHX * 1.5, h: bh * 0.42, n: 3 });
    lat.position.set(-mouthHX * 0.1, -bh * 0.5, outZ(1.04));
    lat.rotation.y = faceOut;
    grp.add(lat);
  }

  if (feats.reflective) {
    // "two short reflective slots on the outboard face" — Apidura's own words.
    for (const yf of [0.58, 0.68]) {
      const rs = reflectiveStrip(Math.min(mouthHX * 1.1, 44), 6);
      rs.position.set(-mouthHX * 0.1, -bh * yf, outZ(1.03));
      rs.rotation.y = faceOut;
      grp.add(rs);
    }
  }

  // The logo sits on the outboard face, low and forward, where every on-bike
  // photograph puts it. It used to be offset by the FORE-AFT half-extent along
  // z, so it floated off a bag that was wider than it was deep and sank into one
  // that was deeper than it was wide.
  patch(grp, brand, mouthHX * 0.1, -bh * vr.range(0.4, 0.5), outZ(1.04),
    Math.min(mouthHX * 1.4, 58), faceOut);

  grp.userData.radius = Math.max(mouthHX, halfZ);
  return shadowify(grp);
}
