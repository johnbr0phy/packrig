// Top tube bag builders (mm-local). buildToptubeRear draws the same bag at the
// SEAT-TUBE end of the top tube (Revelate Jerrycan, Andrew The Maker Rear TT
// Sack, Apidura Backcountry Rear), so both live here.
//
// ---- AXIS MAPPING (BUILDER-BRIEF Rule 2) ----------------------------------
// `mount.axes` on the records in both slots: len along_toptube (Tailfin writes
// `x`, WOHO / Salsa / Wizard Works / Rogue Panda `-x`, the same axis, drawn
// the other way), wid `z`, hgt perp_toptube (Blackburn, Swift, ATM and Nuke
// write `-y`: the way their drawing measured height, NOT which side of the tube
// the bag is on, all six are gas-tank packs that sit on it). Two Wheel Gear
// writes wid `x`, which its own 22.9 x 5.1 x 11 cm box contradicts; ignored.
// The group is rotated onto the top tube, so its local frame IS the tube's:
//
//   p.mm.len → local x   along the top tube, +x FORWARD (toward the stem)
//   p.mm.hgt → local y   perpendicular to the tube, up; y = 0 is the base plane
//   p.mm.wid → local z   across the bike
//
// The body spans local x ∈ [10 − len, 10] whichever end it mounts at, because
// BagSystem._staticFixes reads `userData.bodyLen` and takes position.x + 10 as
// the bag's front. This mapping was already right; the SHAPE was the fault.
//
// ---- WHAT IT IS (owner) -----------------------------------------------------
// "A top tube bag is a soft tapered wedge nesting over the tube with its nose
// against the stem, and a Jerrycan-style bag does the same at the seat post
// end." Wrong before: "Top tube bags look like hard plastic toolboxes", a
// subdivided box with 0.1-of-width fillets, flat faces and a dead-flat top.
//
//   soft          a lofted pillow: a superellipse section whose sides slump out
//                 below the crown and whose crown sags a little between the ends
//                 (both scaled down by stiffnessOf: a `rigid` shell keeps a
//                 flatter, squarer section and takes no noise)
//   tapered wedge tallest at the mounting end, falling to the free end. The top
//                 line is the rake → chamfer → flat measured off Apidura's side
//                 elevations (topProfile, kept), smoothed so no corner is a
//                 crease; `geometry.topLine: continuous` is one straight fall
//                 The TALL end is always the mounting end (stem, or seat post
//                 for a rear pack). Nine records write their taper nose-narrow
//                 (Tailfin's rear bags, Restrap Race Short, Green Guru Tanker…)
//                 and the old builder turned those round; the owner's words
//                 win over a reviewer's nose/tail convention (§9.2), so only
//                 the taper's MAGNITUDE is read from the record.
//   nesting       a channel CARVED into the base (BUILDER-BRIEF §1.2), the
//                 skirts hanging EMBED below the crown either side of the tube
//   nose          the tall end is a face that follows what it butts: upright in
//                 the world against the steerer, parallel to the seat tube for a
//                 rear bag, with small rounded edges
//   hardware      zip along the crown (or the record's lid seam / horseshoe /
//                 flap), 2–3 thin straps round the top tube by record, one round
//                 the steerer (front) or 1–2 round the seat post (rear), all
//                 straps.js ribbons
//
// ---- PLACEMENT (every value derived from the bike, Rule 1) --------------------
//   tube line    ttSeat → ttHead, the very points bike.js builds the tube from
//   tube radius  the anchor's height above the tube end it was built from
//   base plane   EMBED under the crown, perpendicular to the tube
//   front bag    tall face world-upright at the resolver's head/steerer
//                collider (BagSystem._staticColliders slices points.hd over
//                geo.spacers + geo.headTube at frameEdgeR[2] + 4 either side of
//                the axis) less 1 mm: the nose sits as close to the steerer as
//                the kit allows, and the resolver never has to shove it
//   rear bag     tall face parallel to points.sd, frameEdgeR[0] + 1.5 mm off the
//                seat-tube axis
// The only literal is STEERER_R, which bike.js draws and ctx does not publish.

import * as THREE from 'three';
import { v3, tubeAlong } from '../../lib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { deformScale } from '../deform.js';
import { meshPanelMat, reflectiveMat } from '../features.js';
import { geomOf, stiffnessOf, variantOf } from '../identity.js';
import { hardware, patch, seamMat, shadowify, soft, webbing } from '../materials.js';
import { TOL } from '../resolve.js';
import { buckle, meshOf, ribbonLoop, strapRun, tubeWrap } from '../straps.js';

const DEG = Math.PI / 180;
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** superellipse coordinate: sign(c)·|c|^(2/n) */
const se = (c, n) => Math.sign(c) * Math.abs(c) ** (2 / n);

// bike.js: tubeBetween(headTop, steererTop, 14, 14), the steerer and spacers.
// Not on ctx; the steerer strap needs it to wrap the right diameter.
const STEERER_R = 14;
const EMBED = 10;          // base plane below the tube crown: the skirts hug the tube

/**
 * The top line of a top tube pack, measured off the makers' own dimensioned
 * side elevations (column scans of Apidura's dimensions-*.png, fractions of
 * length from the LOW end and of full height):
 *
 *   drawing                  rake ends at   flat top starts at
 *   expedition 0.6L          x .043 h .65   x .34
 *   expedition 1L            x .120 h .60   x .42
 *   expedition bolt-on 1L    x .085 h .53   x .39
 *   backcountry 1L           x .050 h .50   x .46
 *   racing 1L                x .130 h .65   x .39
 *   canyon collab 1L         x .130 h .65   x .38
 *   backcountry long 1.8L    x .032 h .60   x .51
 *   racing long 2L           x .090 h .55   x .61
 *
 * A raked end face (62°; a slab's 52°), a chamfer (30° on the short
 * trapezoid packs, 13° on the long tapered_wedge blades), then flat to the
 * tall end. `tail` is the record's taper ratio, the height the low end still
 * stands at. `topLine: 'continuous'` (Tailfin's teardrop range) is one fall.
 * Returns at(t), t = 0 at the low end, 1 at the tall end.
 */
function topProfile({ len, h, tail, form, topLine }) {
  const tip = form === 'slab' ? 0.06 : Math.min(0.18, tail * 0.4);
  if (topLine === 'continuous') {
    const tJ = 0.08;
    return (t) => (t <= 0 ? tip : t < tJ ? tip + (tail - tip) * (t / tJ) : tail + (1 - tail) * ((t - tJ) / (1 - tJ)));
  }
  const rakeDeg = form === 'slab' ? 52 : 62;
  const chamDeg = form === 'tapered_wedge' ? 13 : 30;
  let rakeRun = ((tail - tip) * h) / Math.tan(rakeDeg * DEG);
  let chamRun = ((1 - tail) * h) / Math.tan(chamDeg * DEG);
  const span = Math.max(rakeRun + chamRun, 1e-6);
  if (span > len * 0.92) { const k = (len * 0.92) / span; rakeRun *= k; chamRun *= k; }
  const tJ = Math.max(rakeRun / len, 1e-4);
  const tF = Math.max((rakeRun + chamRun) / len, tJ);
  return (t) => (t <= 0 ? tip : t < tJ ? tip + (tail - tip) * (t / tJ)
    : t < tF ? tail + (1 - tail) * ((t - tJ) / (tF - tJ)) : 1);
}

/**
 * How the bag attaches, read from the catalogue's own words. `features.
 * attachment` carries it on the Apidura records; other makers put it in
 * `features.mount` or `features.straps`, and the bolt-on SKUs say so in their
 * NAME ("Bolt-On", "with Bolts", "2H"). Defaults are the slot's commonest
 * construction: two top-tube straps (three on a long bag) and one to the
 * steerer.
 */
function mountPlanOf(p, len) {
  const f = p?.features || {};
  const att = String(f.attachment || '');
  const txt = [att, f.mount, f.straps].filter((s) => typeof s === 'string').join(' + ');
  const name = `${p?.line || ''} ${p?.name || ''} ${p?.size || ''}`;
  const WORD = { one: 1, two: 2, three: 3, four: 4 };
  const count = (s, dflt) => {
    const m = /\b(\d+|one|two|three|four)\b/i.exec(s || '');
    if (!m) return dflt;
    const w = m[1].toLowerCase();
    return clamp(WORD[w] ?? parseInt(w, 10), 0, 4);
  };
  const first = (att || txt).split('+')[0];
  // a bolt-on SKU, unless its own words offer straps as the alternative
  const bolted = (/\bbolt/i.test(first) && !/\bor\b[^+]*strap/i.test(first))
    || /bolt[- ]?on|with bolts|\b2H\b/i.test(name);
  // a seat-post strap the bag actually ships with, not an alternative
  // ("also runs on the seatpost", Nuke's Titan Tank, which is a front pack)
  const postClause = txt.split(/[+;,]/).find((c) => /seat ?post|seat tube/i.test(c) && !/\balso\b|\bor\b/i.test(c));
  const tubeClause = txt.split('+').find((c) => /top ?tube|frame strap/i.test(c)) || first;
  const span = /bolt spacing\s*([\d.]+)\s*cm/i.exec(String(p?.dims_raw || '')) || /(\d+)\s*mm spacing/i.exec(txt);
  const dfltTube = len > 330 ? 3 : 2;
  return {
    bolted,
    tubeStraps: bolted ? 0 : /no top tube strap/i.test(txt) ? 0 : txt ? count(tubeClause, dfltTube) : dfltTube,
    steerer: !txt || /steer|stem|head ?tube|one-?wrap/i.test(txt) ? !/no stem attachment/i.test(txt) : false,
    post: postClause ? Math.max(count(postClause, 1), 1) : 0,
    boltSpan: span ? clamp(parseFloat(span[1]) * (/cm/.test(span[0]) ? 10 : 1), 30, 120) : 64,
  };
}

/**
 * Closed loft of M-point rings, with fan caps at both ends, so the pillow is
 * one watertight surface the size gate and the packing layer can measure.
 * `pt(i, j)` returns [x, y, z]. Winding is fixed by the signed volume, so a
 * mirrored (rear) bag does not light from the inside.
 */
function ringLoft(N, M, pt, uvOf) {
  const pos = [], uv = [], idx = [];
  const at = (i, j) => i * M + (((j % M) + M) % M);
  for (let i = 0; i <= N; i++) for (let j = 0; j < M; j++) { pos.push(...pt(i, j)); uv.push(...uvOf(i, j)); }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) idx.push(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i + 1, j));
  }
  const cap = (i, first) => {
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < M; j++) { const k = at(i, j) * 3; cx += pos[k]; cy += pos[k + 1]; cz += pos[k + 2]; }
    const c = pos.length / 3;
    pos.push(cx / M, cy / M, cz / M);
    uv.push(0.5, 0.5);
    for (let j = 0; j < M; j++) {
      if (first) idx.push(c, at(i, j + 1), at(i, j)); else idx.push(c, at(i, j), at(i, j + 1));
    }
  };
  cap(0, true);
  cap(N, false);
  let vol = 0;
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
    vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
      - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
      + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  if (vol < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, at };
}

/**
 * Rear top-tube sack: the same construction, standing in the seat-tube corner
 * instead of behind the stem.
 */
export function buildToptubeRear(p, brand, main, accent, ctx, side) {
  return buildToptube(p, brand, main, accent, ctx, side, 'toptubeRear');
}

// NOTE: the builder call signature is (product, brand, main, accent, ctx, side),
// anchorName must come AFTER `side`, or it receives the side integer.
export function buildToptube(p, brand, main, accent, ctx, side, anchorName = 'toptube') {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const geom = geomOf(p);
  const stiff = stiffnessOf(p);
  const K = deformScale(stiff);
  const ft = (p && p.features) || {};
  const hiHex = Array.isArray(brand?.palette) && brand.palette.length > 3 ? brand.palette[3] : null;

  const len = Math.min(p.mm.len, 460), h = Math.min(p.mm.hgt, 220), w = Math.min(p.mm.wid, 170);
  const plan = mountPlanOf(p, len);
  // A rear pack is decided by the slot that routed the call OR by its own
  // record naming seat-post straps (Apidura's Backcountry Rear is filed under
  // `toptube` in brands.json; its record says `slot_should_be: toptube_rear`).
  const rear = anchorName === 'toptubeRear' || plan.post > 0;

  // ---- the bike ---------------------------------------------------------------
  const P = ctx.points;
  const anchor = ctx.anchors[anchorName].position;
  const hd = v3(P.hd.x, P.hd.y, 0);
  const sd = v3(P.sd.x, P.sd.y, 0);
  const ttSeat = P.seatTop.clone().addScaledVector(sd, -12);   // bike.js:132
  const ttHead = P.headTop.clone().addScaledVector(hd, 30);    // bike.js:131
  const dir = ttHead.clone().sub(ttSeat).normalize();
  const nrm = v3(-dir.y, dir.x, 0);                            // the tube's own "up"
  const ang = Math.atan2(dir.y, dir.x);
  // both top-tube anchors are <tube end> + (dx, ttR, 0) (bike.js:944/947)
  const ttEnd = Math.abs(anchor.x - ttHead.x) <= Math.abs(anchor.x - ttSeat.x) ? ttHead : ttSeat;
  const ttR = clamp(anchor.y - ttEnd.y, 10, 26);
  const headR = ctx.frameEdgeR?.[2] ?? 24;
  const stR = ctx.frameEdgeR?.[0] ?? 15.5;
  const tubeY = EMBED - ttR;                  // tube axis, in bag-local y
  const chanR = ttR + 2;                      // the carved trough rides 2 mm off the tube

  // ---- silhouette from the record --------------------------------------------
  // Noise and slump are budgeted INSIDE the published box so the finished
  // pillow crests on it rather than a pillow past it (the old +20% width bug).
  const noiseAmp = vr.range(1.4, 2.1);
  const noiseFreq = vr.range(0.03, 0.042);
  const puff = noiseAmp * 0.5 * K;
  const slump = 0.07 * K;                     // sides bulge out below the crown
  const sag = 0.045 * K;                      // crown dips between the ends
  const xs = String(geom.crossSection || 'rounded_rect');
  // section exponent: 2 = ellipse, 4+ = a box with round corners. A soft sewn
  // pack sits near 2.6; the record's `shoulder: squared` and a moulded shell
  // push it squarer, never to a crease.
  const nSec = (stiff === 'rigid' ? 4.2 : stiff === 'semi' ? 3.2 : 2.6)
    + (geom.shoulder === 'squared' ? 0.5 : geom.shoulder === 'rounded' ? -0.2 : 0);
  const nBase = nSec + 1.4;                   // the base panel is flatter than the crown
  // how much the crown narrows: a teardrop / d section is narrow on top
  const crownIn = xs === 'teardrop' ? 0.34 : xs === 'd_shape' ? 0.2 : xs === 'flat_bottom' ? 0.06 : 0.1;
  const Hc = h - puff;
  const Wc = Math.max((w / 2 - puff) / (1 + slump * 0.9), 10);
  const tail = clamp(geom.taperRatio ?? vr.range(0.5, 0.65), 0.15, 1);
  const prof = topProfile({ len, h: Hc, tail, form: geom.form, topLine: geom.topLine });
  // smooth the measured line: a sewn crown has no corner at the chamfer
  const profS = (t) => {
    let s = 0;
    for (let k = -5; k <= 5; k++) s += prof(clamp(t + k * 0.012, 0, 1));
    return s / 11;
  };
  const chanTop = tubeY + chanR;              // highest point of the trough
  /** crown height at t (0 low end → 1 tall end) */
  const H = (t) => Math.max(Hc * profS(t) * (1 - sag * Math.sin(Math.PI * clamp(t, 0, 1)) ** 2), chanTop + 8);
  // plan: the tall end is the widest (Apidura "tapered width 5 - 4 cm",
  // Rockgeist "tapered, wider at the stem")
  const planTip = geom.form === 'tapered_wedge' ? 0.8 : geom.form === 'teardrop' ? 0.76 : 0.9;
  const W = (t) => Wc * (planTip + (1 - planTip) * smooth(0, 1, t));
  const hT = H(1);
  // End rounding: the free end is a pillow, the tall end a face with soft edges.
  const rLow = clamp(Math.min(W(0), H(0) * 0.5), 6, 30);
  const rTall = clamp(W(1) * 0.55, 5, 14);

  // The tall face follows what it butts. Front: upright in the WORLD (the
  // resolver's steerer collider is an upright box, and the steerer leans back
  // above it) → in the tube frame it leans forward by the tube angle. Rear:
  // parallel to the seat tube → it leans back by the seat tube's angle to the
  // tube normal. λ is the run per unit of height; the face stands at a = len at
  // its top and a = len − hT·λ at its base.
  const sdL = v3(sd.x * Math.cos(-ang) - sd.y * Math.sin(-ang), sd.x * Math.sin(-ang) + sd.y * Math.cos(-ang), 0);
  const lean = rear ? clamp(-sdL.x / sdL.y, 0, 0.5) : Math.tan(ang);
  const aFace = (y) => len - Math.max(hT - y, 0) * lean;

  // ---- the body ---------------------------------------------------------------
  const N = 64, M = 48;
  const aOf = (i) => len * (0.5 - 0.5 * Math.cos((Math.PI * i) / N));   // dense at the ends
  const xOf = (a) => (rear ? 10 - a : 10 - len + a);
  /** body-local point for station a (0 low → len tall), angle index j */
  const sectionPt = (a, j) => {
    const t = a / len;
    const Ht = H(t), Wt = W(t);
    // end rounding
    let sz = 1, sy = 1;
    if (a < rLow) {
      const s = Math.sqrt(Math.max(1 - ((rLow - a) / rLow) ** 2, 0));
      sz = Math.max(s, 0.12);
      sy = Math.max(s ** 0.6, (chanTop + 6) / Ht);
    } else if (a > len - rTall) {
      const s = Math.sqrt(Math.max(1 - ((a - (len - rTall)) / rTall) ** 2, 0));
      sz = Math.max(s, 0.12);
      sy = Math.max(s ** 0.3, (chanTop + 6) / Ht);
    }
    const th = (2 * Math.PI * j) / M;          // j = 0 is the crown centre, +z first
    const u = Math.cos(th), vv = Math.sin(th);
    const n = u >= 0 ? nSec : nBase;
    let y = Ht / 2 + (Ht / 2) * se(u, n);
    let z = Wt * se(vv, n);
    const q = clamp(y / Ht, 0, 1);
    z *= (1 + slump * Math.sin(Math.PI * q ** 0.8)) * (1 - crownIn * q ** 2.5);
    // scale the section toward its top for the end rounding (the base stays down)
    y *= sy;
    z *= sz;
    // the trough the tube nests in, carved into the geometry
    if (Math.abs(z) < chanR) y = Math.max(y, tubeY + Math.sqrt(chanR * chanR - z * z));
    // the tall face lean, ramped in over the front of the bag
    const aa = a - Math.max(hT - y, 0) * lean * smooth(len * 0.5, len, a);
    return [xOf(aa), y, z];
  };
  const loft = ringLoft(N, M, (i, j) => sectionPt(aOf(i), j), (i, j) => [aOf(i) / 150, (j / M) * (2 * (w + h)) / 150]);
  const bodyGeo = loft.geo;
  const body = soft(bodyGeo, main, {
    amp: noiseAmp, freq: noiseFreq, seed: vr.seed % 937, stiffness: stiff,
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.78, aoSpan: 0.5,
  });
  grp.add(body);

  // Finished surface lookups (after the soft pass has moved the vertices), so
  // every piece of trim lies ON the fabric rather than at the pre-noise core.
  const bpos = bodyGeo.attributes.position, bnor = bodyGeo.attributes.normal;
  const surf = (i, j, lift = 0) => {
    const k = loft.at(i, j);
    return v3(bpos.getX(k) + bnor.getX(k) * lift, bpos.getY(k) + bnor.getY(k) * lift, bpos.getZ(k) + bnor.getZ(k) * lift);
  };
  /** ring index nearest a fraction t along the body (0 low end → 1 tall end) */
  const ringAt = (t) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i <= N; i++) { const d = Math.abs(aOf(i) / len - t); if (d < bd) { bd = d; best = i; } }
    return best;
  };
  /** on ring i, the angle index on side s (+1 → +z) whose height is nearest y */
  const jAtY = (i, s, y) => {
    let best = 0, bd = Infinity;
    for (let j = 0; j <= M / 2; j++) {
      const jj = s > 0 ? j : (M - j) % M;
      const d = Math.abs(bpos.getY(loft.at(i, jj)) - y);
      if (d < bd) { bd = d; best = jj; }
    }
    return best;
  };

  const wm = webbing();
  const hwm = hardware();
  const hiMat = hiHex != null ? new THREE.MeshStandardMaterial({ color: new THREE.Color(hiHex), roughness: 0.5 }) : hwm;
  const strapGeos = [], hwGeos = [], trimGeos = [];
  const teethMat = new THREE.MeshStandardMaterial({ color: 0x8d9299, roughness: 0.42, metalness: 0.65 });
  const noCol = (m) => { m.userData.noCollide = true; return m; };

  // ---- two-tone ---------------------------------------------------------------
  // The colourway's accent (identity.js colorwayFor: `accentHex`) paints the
  // structural panels, base band and the tall end's face, per channel, so a
  // grey body with a black harness and a black body with an orange nose both
  // come out as authored. A one-colour colourway leaves the body plain.
  const col = bodyGeo.attributes.color;
  if (col && !accent.color.equals(main.color)) {
    const r = ['r', 'g', 'b'].map((c) => clamp(accent.color[c] / Math.max(main.color[c], 1e-3), 0.15, 8));
    for (let i = 0; i <= N; i++) {
      const t = aOf(i) / len;
      for (let j = 0; j < M; j++) {
        const k = loft.at(i, j);
        const q = bpos.getY(k) / Math.max(H(t), 1);
        const trim = q < 0.2 || t > 0.965;
        if (trim) col.setXYZ(k, col.getX(k) * r[0], col.getY(k) * r[1], col.getZ(k) * r[2]);
      }
    }
    col.needsUpdate = true;
  }

  // ---- base-panel seam: the line that says "sewn panels", both sides ------------
  for (const s of [1, -1]) {
    const pts = [];
    for (let i = 3; i <= N - 3; i += 2) {
      const t = aOf(i) / len;
      pts.push(surf(i, jAtY(i, s, H(t) * 0.2), 0.4));
    }
    trimGeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.9, 5, false));
  }

  // ---- closure ------------------------------------------------------------------
  const closure = String(p?.closure?.type || '').toLowerCase();
  const tSpan = (t0, t1) => { const out = []; for (let i = ringAt(t0); i <= ringAt(t1); i++) out.push(i); return out; };
  /** a zip laid on the surface along `pts`: flat tape, tooth chain, slider + pull */
  const zipAlong = (pts, outward, sliders) => {
    if (pts.length < 2) return;
    const c = pts.reduce((m, q) => m.add(q), v3(0, 0, 0)).multiplyScalar(1 / pts.length).addScaledVector(outward, -20);
    // the tape lies flat, its width across the run
    const tan = pts[pts.length - 1].clone().sub(pts[0]).normalize();
    const across = new THREE.Vector3().crossVectors(tan, outward).normalize();
    strapGeos.push(ribbonLoop(pts, across, c, { width: 7, lift: 0.1, thick: 0.9, closed: false }));
    const lifted = pts.map((q, k) => {
      const prev = pts[Math.max(k - 1, 0)], next = pts[Math.min(k + 1, pts.length - 1)];
      const tn = next.clone().sub(prev).normalize();
      const o = new THREE.Vector3().crossVectors(tn, across).normalize();
      if (o.dot(outward) < 0) o.negate();
      return q.clone().addScaledVector(o, 1.1);
    });
    grp.add(noCol(tubeAlong(lifted, 1.05, teethMat, { segments: Math.max(24, pts.length * 3), radialSegments: 5 })));
    for (const f of sliders) {
      const k = Math.round(clamp(f, 0, 1) * (lifted.length - 1));
      const q = lifted[k], nx = lifted[Math.min(k + 1, lifted.length - 1)].clone().sub(lifted[Math.max(k - 1, 0)]).normalize();
      const sl = new THREE.Mesh(new RoundedBoxGeometry(12, 4.4, 7, 2, 1.5), hwm);
      sl.position.copy(q).addScaledVector(outward, 1.4);
      sl.quaternion.setFromUnitVectors(v3(1, 0, 0), nx);
      grp.add(noCol(sl));
      // the pull: a short cord loop with a moulded grab, in the brand accent
      const tab = new THREE.Mesh(new RoundedBoxGeometry(5, 3, 15, 2, 1.2), hiMat);
      tab.position.copy(sl.position).addScaledVector(nx, -12 * Math.sign(0.5 - f || 1)).addScaledVector(outward, 0.6);
      tab.quaternion.copy(sl.quaternion);
      tab.rotateY(Math.PI / 2);
      grp.add(noCol(tab));
    }
  };
  const crownPts = (t0, t1, j = 0) => tSpan(t0, t1).map((i) => surf(i, j, 0.3));
  const lidDrop = clamp(h * 0.3, 12, 30);
  /** a raised welt (a lid edge, a flap edge) along points on the surface */
  const welt = (pts, r = 1.5, mat = null) => {
    if (pts.length < 3) return;
    const m = tubeAlong(pts, r, mat || seamMat(main), { segments: Math.max(30, pts.length * 3), radialSegments: 6 });
    grp.add(noCol(m));
  };
  const lidEdge = (s, t0, t1, drop) => tSpan(t0, t1).map((i) => {
    const t = aOf(i) / len;
    return surf(i, jAtY(i, s, H(t) - drop), 0.6);
  });
  // `mirrored`, tall end at −x, decides which end the slider parks at
  const tallAtPlusX = !rear;
  const parkTall = (f) => (tallAtPlusX ? f : 1 - f);
  if (closure === 'magnetic' && geom.form === 'slab') {
    // the Aero modules: a fast-entry magnetic slit along the crown, no zip
    welt(crownPts(0.1, 0.94), 1.3);
  } else if (closure === 'magnetic' || /flap|hook_and_loop/.test(closure)) {
    // A lid: fold-over and magnetic (Apidura Racing, Revelate Mag-Tank,
    // Ortlieb Fuel-Pack) or a flap with a buckle / hook-and-loop tab (Vincita,
    // Venture). Its edge is a welt round both sides; a flap drops lower on the
    // drive side and carries its closure there.
    const flap = /flap|hook_and_loop/.test(closure);
    welt(lidEdge(1, 0.08, 0.95, flap ? lidDrop * 1.6 : lidDrop), 1.6);
    welt(lidEdge(-1, 0.08, 0.95, lidDrop), 1.6);
    // lid panel a shade lifted, so it reads as a separate piece of cloth
    if (col) {
      for (let i = 0; i <= N; i++) {
        const t = aOf(i) / len;
        for (let j = 0; j < M; j++) {
          const k = loft.at(i, j);
          const z = bpos.getZ(k);
          if (bpos.getY(k) > H(t) - (flap && z > 0 ? lidDrop * 1.6 : lidDrop)) col.setXYZ(k, col.getX(k) * 1.14, col.getY(k) * 1.14, col.getZ(k) * 1.14);
        }
      }
      col.needsUpdate = true;
    }
    const iM = ringAt(0.6);
    if (flap) {
      // the closure strap down the drive side, over the flap edge, to a buckle
      const top = surf(iM, 0, 0.5), low = surf(iM, jAtY(iM, 1, H(0.6) * 0.3), 0.5);
      const mid = surf(iM, jAtY(iM, 1, H(0.6) - lidDrop * 1.6), 0.5);
      strapGeos.push(ribbonLoop([top, mid, low], v3(1, 0, 0), v3(top.x, H(0.6) * 0.4, 0), { width: 18, lift: 0.4, closed: false }));
      hwGeos.push(...buckle(mid, v3(0, -1, 0), v3(0, 0, 1), { width: 16 }));
    } else {
      // the magnet catch, a moulded tab proud of the lid edge on the drive side
      const q = surf(iM, jAtY(iM, 1, H(0.6) - lidDrop), 1.2);
      const mg = new THREE.Mesh(new RoundedBoxGeometry(Math.min(34, len * 0.16), 12, 4, 2, 1.5), hwm);
      mg.position.copy(q);
      grp.add(noCol(mg));
    }
  } else if (closure === 'zip_horseshoe') {
    // Wizard Works Go-Go, Swift Moxie: the lid opens on three sides, along
    // the drive-side shoulder and across both ends, hinged on the other side.
    const iA = ringAt(0.08), iB = ringAt(0.93);
    const sh = (i, s) => jAtY(i, s, H(aOf(i) / len) * 0.8);
    const path = [];
    for (let j = sh(iA, -1); j < M; j++) path.push(surf(iA, j, 0.3));               // across the low end…
    for (let j = 0; j <= sh(iA, 1); j++) path.push(surf(iA, j, 0.3));
    for (let i = iA + 1; i < iB; i++) path.push(surf(i, sh(i, 1), 0.3));            // …along the drive shoulder…
    for (let j = sh(iB, 1); j >= 0; j--) path.push(surf(iB, j, 0.3));               // …and back across the tall end
    for (let j = M - 1; j >= sh(iB, -1); j--) path.push(surf(iB, j, 0.3));
    welt(path, 1.2, teethMat);
    const q = surf(iB, 0, 1.6);
    const sl = new THREE.Mesh(new RoundedBoxGeometry(12, 4.4, 7, 2, 1.5), hwm);
    sl.position.copy(q);
    grp.add(noCol(sl));
  } else {
    // A zip along the crown (zip_straight / waterproof / two-way).
    const two = closure === 'zip_two_way';
    zipAlong(crownPts(0.07, 0.95), v3(0, 1, 0), two ? [0.06, 0.94] : [parkTall(0.9)]);
  }

  // ---- pockets the record names ---------------------------------------------------
  const pk = Array.isArray(ft.pockets) ? ft.pockets : [];
  const pkText = typeof ft.pockets === 'string' ? ft.pockets : '';
  const sideZip = pk.some((x) => x.type === 'zip' && /side/.test(x.face || ''));
  const sideMesh = pk.some((x) => /mesh|open|stretch/.test(x.type || '') && /side/.test(x.face || ''))
    || /outer mesh pocket/i.test(pkText);
  const topMesh = pk.some((x) => /mesh/.test(x.type || '') && /top/.test(x.face || ''));
  if (sideZip) {
    const pts = tSpan(0.25, 0.8).map((i) => surf(i, jAtY(i, 1, H(aOf(i) / len) * 0.55), 0.3));
    zipAlong(pts, v3(0, 0, 1), [tallAtPlusX ? 0.85 : 0.15]);
  }
  if (sideMesh || topMesh) {
    // An applied mesh pocket: a shell offset off the finished side, sewn at its
    // base and ends, standing proud at its elastic mouth, it changes the outline.
    for (const s of topMesh ? [0] : [1, -1]) {
      const is = tSpan(0.24, 0.78);
      const rows = 8;
      const pos = [], idx = [];
      for (let a = 0; a < is.length; a++) {
        const i = is[a];
        const Ht = H(aOf(i) / len);
        const j0 = s === 0 ? jAtY(i, -1, Ht * 0.86) : jAtY(i, s, Ht * 0.12);
        const j1 = s === 0 ? jAtY(i, 1, Ht * 0.86) : jAtY(i, s, Ht * 0.62);
        const jA = s === 0 ? j0 - M : j0;           // the top pocket runs across j = 0
        for (let r = 0; r <= rows; r++) {
          const f = r / rows;
          const jj = ((Math.round(jA + (j1 - jA) * f) % M) + M) % M;
          const u = a / (is.length - 1);
          const off = 0.6 + 4.2 * Math.sin(Math.PI * u) ** 0.5 * (0.3 + 0.7 * f);
          const q = surf(i, jj, off);
          pos.push(q.x, q.y, q.z);
        }
      }
      for (let a = 0; a < is.length - 1; a++) for (let r = 0; r < rows; r++) {
        const k = a * (rows + 1) + r;
        idx.push(k, k + rows + 1, k + 1, k + 1, k + rows + 1, k + rows + 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const mat = meshPanelMat();
      mat.side = THREE.DoubleSide;
      const pm = new THREE.Mesh(g, mat);
      grp.add(noCol(pm));
    }
  }

  // ---- Aero swallowtail -------------------------------------------------------------
  // "At the rear the two side faces continue past the body as splayed
  // triangular fins (the transfer panel) that wrap the tube". Keyed on the
  // record's own `features.transferPanel`; `slab` stays as the fallback.
  if (ft.transferPanel || geom.form === 'slab') {
    const finLen = Math.min(len * 0.22, 52);
    const lowX = xOf(0);
    const finX = lowX + (rear ? -1 : 1) * (finLen / 2);
    const finH = Math.max(H(0.1), 14);
    for (const s of [1, -1]) {
      const fin = new THREE.Mesh(new RoundedBoxGeometry(finLen, finH + ttR, 2.4, 2, 1), main);
      fin.position.set(finX, (finH + ttR) / 2 - ttR * 0.7, s * (W(0.1) - 1));
      fin.rotation.x = s * -14 * DEG;
      grp.add(noCol(fin));
    }
  }

  // ---- attachment: bolted base rail ----------------------------------------------------
  if (plan.bolted) {
    const midX = xOf(len / 2);
    const plate = new THREE.Mesh(new RoundedBoxGeometry(len * 0.62, 4, Math.min(62, w + 14), 2, 1.8), hwm);
    plate.position.set(midX, tubeY + chanR - 0.5, 0);
    grp.add(noCol(plate));
    for (const s of [1, -1]) {
      const head = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 8, 12), hwm);
      head.position.set(midX + (s * plan.boltSpan) / 2, tubeY + ttR + 1, 0);
      grp.add(noCol(head));
    }
  }
  // ---- attachment: thin straps round the top tube --------------------------------------
  // Velcro / Hypalon wraps out of the base, as many as the record names.
  const nT = plan.tubeStraps;
  const tubeAt = nT === 1 ? [0.5] : nT === 2 ? [0.3, 0.72] : Array.from({ length: nT }, (_, i) => 0.2 + (0.62 * i) / Math.max(nT - 1, 1));
  for (const t of tubeAt) {
    const x = xOf(len * t);
    strapGeos.push(tubeWrap(v3(x, tubeY, 0), v3(1, 0, 0), ttR + 0.3, { width: 20, thick: 1.6 }));
    // the tab it is sewn to, a short flat strip down each side of the base
    for (const s of [1, -1]) {
      const i = ringAt(t);
      const a0 = surf(i, jAtY(i, s, 0), 0.2), a1 = surf(i, jAtY(i, s, H(t) * 0.16), 0.2);
      if (a0.distanceTo(a1) > 3) strapGeos.push(strapRun(a0, a1, v3(0, 0, s), { width: 20, thick: 1.4 }));
    }
  }

  // ---- details from the record -----------------------------------------------------------
  if (ft.reflective) {
    const i = ringAt(0.24);
    for (const s of [1, -1]) {
      const q = surf(i, jAtY(i, s, H(0.24) * 0.42), 0.7);
      const tag = new THREE.Mesh(new THREE.BoxGeometry(Math.min(26, len * 0.12), Math.min(6, h * 0.09), 1), hiHex != null ? hiMat : reflectiveMat());
      tag.position.copy(q);
      grp.add(noCol(tag));
    }
  }
  if (ft.cablePort) {
    // the grommeted cable port, high on the tall end where the cable exits
    const i = ringAt(0.95);
    for (const s of [1, -1]) {
      const q = surf(i, jAtY(i, s, H(0.95) * 0.7), 0.4);
      const port = new THREE.Mesh(new THREE.TorusGeometry(4, 1.2, 5, 16), hwm);
      port.position.copy(q);
      grp.add(noCol(port));
    }
  }
  // the maker's mark, a screen print on the side panel
  {
    const t = 0.6, i = ringAt(t);
    const pw = Math.min(46, len * 0.24, h * 0.6);
    for (const s of [1, -1]) {
      const q = surf(i, jAtY(i, s, H(t) * 0.5), 0.9);
      patch(grp, brand, q.x, q.y + pw * 0.06, q.z, pw, s > 0 ? 0 : Math.PI);
    }
  }

  // ---- STAND THE PACK ON THE TUBE ------------------------------------------------------
  // Frame-local mm (ctx.points' space; the anchor is an unrotated child of the
  // frame group). The group is rotated by the tube's true angle, so local y is
  // the perpendicular off the tube and the base plane lands EMBED under the
  // crown along the whole length.
  grp.rotation.z = ang;
  const R = (x, y) => v3(x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang), 0);
  /** point on the base plane at arc length s along the tube from ttEnd */
  const baseAt = (s) => ttEnd.clone().addScaledVector(dir, s).addScaledVector(nrm, ttR - EMBED);
  const xBaseFace = xOf(aFace(0));             // local x of the tall face at the base
  let B;
  if (!rear) {
    // The resolver's head/steerer collider, exactly as BagSystem builds it:
    // five slices down the steerer + head tube, each frameEdgeR[2] + 4 either
    // side of the axis and padded 20 mm in y; plus the stem block, which
    // starts 10 mm behind steererTop. Proxy boxes are shrunk by TOL.
    const g = ctx.geo;
    const keep = headR + 4;
    const run = (g.headTube ?? 155) + (g.spacers ?? 0);
    const limitFor = (y0, y1) => {
      let lim = Infinity;
      for (let i = 0; i < 5; i++) {
        const t0 = -(g.spacers ?? 0) + (i / 5) * run, t1 = -(g.spacers ?? 0) + ((i + 1) / 5) * run;
        const c = P.headTop.clone().addScaledVector(hd, (t0 + t1) / 2);
        const hy = Math.abs(t1 - t0) / 2 + 4 + 20;
        if (y1 > c.y - hy && y0 < c.y + hy) lim = Math.min(lim, c.x - keep);
      }
      const sy0 = Math.min(P.steererTop.y, P.barCenter.y) - 24, sy1 = Math.max(P.steererTop.y, P.barCenter.y) + 24;
      if (y1 > sy0 && y0 < sy1) lim = Math.min(lim, P.steererTop.x - 10);
      // The resolver measures the bag as a grid of boxes in ITS OWN frame and
      // takes their frame-space AABBs, so a cell on the tilted pack reaches
      // forward of the upright face by its own height × sin(tube angle).
      const cellH = w < h ? hT / 4 : hT;
      return lim + TOL - 1 - noiseAmp * K * 0.6 - cellH * Math.sin(Math.abs(ang));
    };
    // face base height, then its top; the limit does not depend on x, so one
    // refinement pass settles it
    let s = (P.headTop.x - 40 - ttEnd.x) / dir.x;
    for (let k = 0; k < 2; k++) {
      const yb = baseAt(s).y, yt = yb + hT * Math.cos(ang) + 4;
      const lim = limitFor(yb - 4, yt);
      const X = Number.isFinite(lim) ? lim : P.headTop.x - 38;
      s = (X - ttEnd.x - nrm.x * (ttR - EMBED)) / dir.x;
    }
    B = baseAt(s);
  } else {
    // Butt the seat tube: the base-line point whose perpendicular distance
    // forward of the seat-tube axis (through the BB, along sd) is stR + 1.5.
    const want = stR + 1.5 + noiseAmp * K * 0.6;
    const f = (q) => sd.y * q.x - sd.x * q.y;      // forward distance from the seat-tube axis
    const b0 = baseAt(0), b1 = baseAt(1);
    const s = (want - f(b0)) / (f(b1) - f(b0));
    B = baseAt(s);
  }
  const O = B.clone().sub(R(xBaseFace, 0));
  grp.position.set(O.x - anchor.x, O.y - anchor.y, 0);

  // ---- the strap round the steerer (front) or the seat post (rear) ----------------------
  // A racetrack loop: round the far side of the tube, back along both sides to
  // the bag's tall face. Aimed at the bike, so it is rebuilt if the resolver
  // moves the bag (system.js _reseatStraps).
  const nLoops = rear ? plan.post || 1 : plan.steerer ? 1 : 0;
  const loopMesh = nLoops ? meshOf([new THREE.BufferGeometry()], wm) : null;
  if (loopMesh) grp.add(loopMesh);
  const faceTopY = hT;
  const buildLoops = (toLocal, toLocalDir) => {
    const geos = [];
    for (let k = 0; k < nLoops; k++) {
      // wrap height: high on the tall face, under the stem / clear of the collar
      const hF = faceTopY * (nLoops > 1 ? 0.45 + 0.35 * k : 0.62);
      const faceL = v3(xOf(aFace(hF)), hF, 0);
      const faceW = O.clone().add(R(faceL.x, faceL.y));   // frame space
      // the tube it wraps, and the point on its axis level with that height
      let Cw, axisW, rT;
      if (!rear) {
        axisW = hd.clone().negate();
        const tt = (faceW.y - P.headTop.y) / axisW.y;          // along the steerer from headTop
        const above = tt > 4;
        Cw = P.headTop.clone().addScaledVector(axisW, clamp(tt, -(ctx.geo.headTube ?? 155) + 10, (ctx.geo.spacers ?? 30) - 6));
        rT = (above ? STEERER_R : headR) + 0.4;
      } else {
        axisW = sd.clone();
        const tt = faceW.y / sd.y;
        Cw = sd.clone().multiplyScalar(tt);
        rT = (Cw.y > P.seatTop.y + 8 ? (ctx.geo.seatpostDia || 27.2) / 2 : stR) + 0.4;
      }
      const C = toLocal(Cw);
      const A = toLocalDir(axisW).normalize();
      // u: from the tube toward the bag face, perpendicular to the tube axis
      const toFace = faceL.clone().sub(C);
      const u = toFace.clone().addScaledVector(A, -toFace.dot(A));
      const dFace = u.length();
      if (dFace < rT + 1) continue;
      u.normalize();
      const vv = new THREE.Vector3().crossVectors(A, u).normalize();
      const pts = [];
      for (let q = 0; q <= 16; q++) {
        const th = -Math.PI / 2 + (Math.PI * q) / 16;
        pts.push(C.clone().addScaledVector(u, -Math.cos(th) * rT).addScaledVector(vv, Math.sin(th) * rT));
      }
      const half = Math.min(rT, W(1) * 0.6);
      pts.push(C.clone().addScaledVector(u, dFace * 0.5).addScaledVector(vv, (rT + half) / 2));
      pts.push(C.clone().addScaledVector(u, dFace + 3).addScaledVector(vv, half));
      pts.push(C.clone().addScaledVector(u, dFace + 3).addScaledVector(vv, -half));
      pts.push(C.clone().addScaledVector(u, dFace * 0.5).addScaledVector(vv, -(rT + half) / 2));
      geos.push(ribbonLoop(pts, A, C.clone().addScaledVector(u, dFace * 0.5), { width: 20, lift: 0.3, thick: 1.6 }));
    }
    if (loopMesh) {
      const fresh = meshOf(geos.length ? geos : [new THREE.BufferGeometry()], wm);
      loopMesh.geometry.dispose();
      loopMesh.geometry = fresh.geometry;
    }
  };
  if (loopMesh) {
    const inv = (q) => { const d = q.clone().sub(O); return v3(d.x * Math.cos(-ang) - d.y * Math.sin(-ang), d.x * Math.sin(-ang) + d.y * Math.cos(-ang), q.z || 0); };
    const invDir = (d) => v3(d.x * Math.cos(-ang) - d.y * Math.sin(-ang), d.x * Math.sin(-ang) + d.y * Math.cos(-ang), d.z || 0);
    buildLoops(inv, invDir);
    grp.userData.reseat = buildLoops;
  }

  if (strapGeos.length) grp.add(meshOf(strapGeos, wm));
  if (hwGeos.length) grp.add(meshOf(hwGeos, hwm));
  if (trimGeos.length) grp.add(meshOf(trimGeos, seamMat(main)));

  grp.userData.bodyLen = len;
  return shadowify(grp);
}
