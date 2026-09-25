// Handlebar roll builder (mm-local, parented to the barroll anchor).
//
// ---- AXIS MAPPING (BUILDER-BRIEF Rule 2) ------------------------------------
// Checked against `mount.axes` on every barroll record: 27 write
// { len: 'along_bar' | 'z', wid: 'x' | '+x', hgt: 'y' | '-y' } (the sign on hgt
// is the reviewer's "hangs down", same axis), which is what the maker drawings
// show (Apidura's front elevation: "MIN 30 / MAX 54 cm" is the across figure).
//
//   p.mm.len → grp-local z   ACROSS the bike, the roll's own axis
//   p.mm.wid → grp-local x   fore-aft depth of the roll (its diameter, fore-aft)
//   p.mm.hgt → grp-local y   height of the roll (its diameter, vertical)
//
// This was already right before this round. Two records do not fit it and are
// handled explicitly, not by transposing silently: Lezyne's Bar Caddy publishes
// len 16 < wid 25 (a roll shorter than it is deep is the record transposed; the
// triple is rewritten whole below and reported), and Swift's Bandito writes
// `along_forkleg` because it is a multi-position bag — in this slot it is a
// short roll across the bar.
//
// The grp origin is ON THE ROLL'S AXIS at mid-length, so `userData.radius`
// (the fore-aft half depth) and `grp.position.x` are what src/bags/system.js
// `_staticFixes` needs to find the roll's rear face.
//
// ---- WHAT IT IS (owner's words, which win) -----------------------------------
// "A bar roll is a cylinder under the bar, about bar width, with roll closures
// at both ends and spacers behind it, clear of the tyre and the cables, and
// harness systems carry it in a cradle." And, of what was wrong: "Bar rolls end
// in domed caps that make them look like kegs or pumpkins, when a real dry bag
// ends in a flattened roll of fabric cinched by straps."
//
// So each end is: the barrel necks down over a short run into a mouth PINCHED
// FLAT FORE-AFT, so the lip stands up across the end nearly the full height of
// the roll; that lip is rolled 2–4 times (`closure.rolls`) into a vertical
// bundle of fabric; a thin buckle strap runs from the front face round the
// bundle's outboard side to the back face and holds it. No dome, no disc, no
// cap. Zip-closed rolls (Road Runner Burrito, Straight Cut Bagel, Gramm Hip)
// have sewn flat end panels with a piped edge instead — still not a dome.
//
// ---- MOUNT SYSTEMS -------------------------------------------------------------
// tools/apply-models.mjs does not carry the records' `straps`/`mount` blocks
// into data/brands.json, so what each product hangs from is summarised from
// data/models/<brand>.json in KNOWN below (reported: the channel should carry
// straps and mount). Families:
//   strap    webbing straight round bar and roll (Backcountry, Miss Grape …)
//   spacer   the same, with foam/moulded spacer blocks between (Ortlieb, AGU,
//            MAAP, Restrap Race) — the default, because the owner said so
//   bracket  a rigid clamp module holds the roll off the bar (BarSpace, Bar-Lock)
//   cradle   a stiff backing panel curls round the back of the roll, spacers
//            behind it (Topeak FrontLoader, WOHO, Sweetroll's stiffener)
//   holster  a fabric saddle over the top and down the front/back of the roll,
//            carrying the bar straps (Restrap Holster, Brooks, Pronghorn)
//   rigid    bar clamps, arms, two cross rods and a sling or plate the roll is
//            strapped into (Tailfin Bar Bag System, Revelate Harness, Rapha,
//            Rockgeist BarJam, Outer Shell)
//   cage     a moulded cage round the back and underside (Tailfin Bar Cage, VAUDE)
// Harness-only products (Revelate Hammerhead, Rockgeist BarJam, Oveja Negra
// Front End Loader, Outer Shell Handlebar Harness, JPaks Refugi) draw the
// harness and nothing else — the dry bag is sold separately.
//
// ---- PLACEMENT (Rule 1: every value derived from the bike) ------------------
//   bar          ctx.points.barCenter; the tops are drawn at BAR_TUBE_R (bike.js
//                builds them with tubeAlong(…, 11.9)), the drops' tape at
//                DROP_TUBE_R (tubeAlong(hook, 13.8)) from |z| = barWidth/2.
//   length       the published length, but never past the inside of the drops:
//                a roll longer than that is rolled tighter (the extra fabric
//                goes into the end bundles) — Apidura publish MIN 30 / MAX 54
//                for exactly this reason.
//   x            rear of the roll (or its cradle) = bar front + the mount's own
//                standoff (webbing, spacer block, bracket, harness arm).
//   y            the roll hangs with the bar tucked into its upper rear quadrant:
//                axis 0.35 × height below the bar centre; then raised as far as
//                the bar centre if the front tyre (frontAxle, tireR) would come
//                within TYRE_CLEAR, and pushed forward if the head tube
//                (headTop → headBottom, frameEdgeR[2]) would come within
//                HEAD_CLEAR.
// -----------------------------------------------------------------------------

import * as THREE from 'three';
import { v3, deg } from '../../lib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { bungeeArc, meshPanelMat, orientArc, pocketArc, reflectiveArc, zipperRun } from '../features.js';
import { featuresOf, geomOf, stiffnessOf, variantOf } from '../identity.js';
import { loftBody } from '../loft.js';
import { hardware, patch, seamMat, shadowify, soft, webbing } from '../materials.js';
import { buckle, meshOf, ribbonLoop, strapRun, tubeWrap } from '../straps.js';

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

// -- what the bike draws (src/bike.js, cockpit) --------------------------------
const BAR_TUBE_R = 11.9;    // bar tops: tubeAlong([...], 11.9)
const DROP_TUBE_R = 13.8;   // the hook, in bar tape: tubeAlong(hook, 13.8)
const DROP_INSET = 1;       // the hook's innermost point sits at half + 1
// -- clearances (BUILDER-BRIEF §3) ---------------------------------------------
const TYRE_CLEAR = 22;      // ≥15 under droop, plus the fabric's own noise
const HEAD_CLEAR = 12;
const END_CLEAR = 8;        // rolled end to the inside of the drop's tape
// -- hardware classes (every maker of the class shares these) ------------------
const STANDOFF = { strap: 22, spacer: 28, bracket: 30, cradle: 24, holster: 22, rigid: 30, cage: 30 };

/**
 * What each product hangs from, read off data/models/<brand>.json (straps,
 * mount.notes, geometry.notes) — see the header for why it lives here.
 */
const KNOWN = [
  [/apidura.*expedition/i, { mount: 'bracket', head: true }],
  [/apidura.*backcountry/i, { mount: 'strap', head: true }],
  [/apidura.*maap/i, { mount: 'spacer', head: true }],
  [/ortlieb.*flex/i, { mount: 'bracket', head: true }],
  [/ortlieb/i, { mount: 'spacer', head: true }],
  [/revelate.*sweetroll/i, { mount: 'cradle' }],                       // fibreglass stiffener + stacking spacers
  [/revelate.*saltyroll/i, { mount: 'rigid' }],                        // rides in the Hammerhead harness
  [/revelate.*pronghorn/i, { mount: 'holster', holster: [-10, 190] }], // blue panel straddles the top
  [/revelate.*hammerhead/i, { mount: 'rigid', harnessOnly: true }],
  [/restrap.*holster/i, { mount: 'holster', head: true }],
  [/restrap.*race/i, { mount: 'spacer' }],
  [/tailfin.*cage/i, { mount: 'cage' }],
  [/tailfin/i, { mount: 'rigid' }],
  [/topeak.*frontloader/i, { mount: 'cradle', head: true }],
  [/brooks.*handlebar roll/i, { mount: 'holster', head: true }],
  [/road runner/i, { mount: 'strap', head: true }],
  [/outer shell.*handlebar harness/i, { mount: 'rigid', harnessOnly: true, plate: true }],
  [/outer shell.*dry bag/i, { mount: 'rigid', plate: true, oneEnd: true }],
  [/oveja negra.*front end loader/i, { mount: 'cradle', harnessOnly: true, head: true, plate: true }],
  [/rockgeist.*barjam/i, { mount: 'rigid', harnessOnly: true }],
  [/jpaks.*refugi/i, { mount: 'cradle', harnessOnly: true }],
  [/miss grape.*trunk/i, { mount: 'strap', oneEnd: true }],
  [/miss grape/i, { mount: 'strap' }],
  [/woho.*harness/i, { mount: 'cradle' }],
  [/vaude.*cage/i, { mount: 'cage', oneEnd: true }],
  [/rapha.*explore/i, { mount: 'rigid' }],
  [/\bagu\b/i, { mount: 'spacer', head: true }],
  [/venture handmade.*delta/i, { mount: 'strap', head: true }],
  [/venture handmade/i, { mount: 'strap' }],
  [/swift.*bandito/i, { mount: 'strap', oneEnd: true }],
  [/straight cut|gramm|lezyne|alpkit|altura/i, { mount: 'strap' }],
  // handlebar-bag-slot products that are rolls and are drawn by this builder
  [/manzanita/i, { mount: 'rigid' }],                                  // Old Man Mountain's alloy cradle
  [/fairweather.*road bar/i, { mount: 'strap' }],
];

function mountOf(p, brand) {
  const key = `${brand?.name || ''} ${p.line || ''} ${p.name || ''}`;
  for (const [re, v] of KNOWN) if (re.test(key)) return { ...v };
  // Unknown product: believe what its attachment text names, else the owner's
  // default — spacers behind it.
  const a = String(p.features?.attachment || '') + ' ' + String(p.features?.closure || '');
  if (/bar[-\s]?space|bar[-\s]?lock|bracket/i.test(a)) return { mount: 'bracket' };
  if (/cage/i.test(a)) return { mount: 'cage' };
  if (/harness|cradle/i.test(a)) return { mount: 'rigid' };
  // a small zipped barrel is strapped straight on; a dry bag gets spacers
  return { mount: p.closure?.type && p.closure.type !== 'rolltop' ? 'strap' : 'spacer' };
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

/** 2-D convex hull (monotone chain) of [x, y] pairs, counter-clockwise. */
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}

/** Re-sample a closed polyline so no segment is longer than `step`. */
function densify(loop, step) {
  const out = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * (k / n), a[1] + (b[1] - a[1]) * (k / n)]);
  }
  return out;
}

/** Fabric twin of `mat` at a different value. */
function tonedMat(mat, k) {
  const m = mat.clone();
  m.color = mat.color.clone().multiplyScalar(k);
  return m;
}

/** A panel colour distinct from the body: the accent, or a toned body. */
const panelOf = (main, accent, k = 0.55) => (accent.color.getHex() !== main.color.getHex() ? accent : tonedMat(main, main.color.getHSL({}).l < 0.08 ? 3.2 : k));

export function buildBarroll(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const geom = geomOf(p);
  const stiff = stiffnessOf(p);
  const sys = mountOf(p, brand);
  const P = ctx.points;
  const g = ctx.geo;
  const anchorPos = ctx.anchors.barroll.position;
  const bc = P.barCenter;

  // ---- dimensions --------------------------------------------------------------
  // Lezyne's Bar Caddy record reads len 16 × wid 25: a roll shorter than it is
  // deep is the record transposed. Rewrite the triple whole (Rule 2), report it.
  let across = p.mm.len, D = p.mm.wid, H = p.mm.hgt;
  if (across < D * 0.9 && !sys.harnessOnly) [across, D, H] = [D, across, H];
  // Restrap's Holster Plus carries a second bag on the front of the holster:
  // its 28 cm depth is roll (the 21 cm height, it is round) plus canister.
  let canister = 0;
  if (sys.mount === 'holster' && D > H * 1.2) { canister = D - H; D = H; }
  if (sys.harnessOnly) { D = 150; H = 150; }          // nominal roll the harness is shaped for
  D = clamp(D, 60, 260);
  H = clamp(H, 60, 260);

  const rolled = p.closure?.type === 'rolltop' || (!p.closure?.type && !sys.harnessOnly);
  const zipped = /zip/.test(String(p.closure?.type || ''));
  const oneEnd = !!sys.oneEnd;

  // Length: the published figure, never past the inside of the drops.
  const halfBudget = g.barWidth / 2 + DROP_INSET - DROP_TUBE_R - END_CLEAR;
  const total = Math.min(across, halfBudget * 2);
  const excessEnd = Math.max(0, across - total) / (oneEnd ? 1 : 2);

  // ---- ends --------------------------------------------------------------------------
  // The rolled bundle: `closure.rolls` turns of a mouth pinched flat. Radius
  // grows ~4 mm a turn on a mid-size roll; any length the drops would not take
  // is rolled in too (area conserved: two layers of ~1.5 mm fabric).
  const rolls = clamp(Number(p.closure?.rolls) || 3, 1, 5);
  const sizeK = clamp(Math.min(D, H) / 150, 0.7, 1.25);
  const rr0 = clamp((3 + rolls * 3.6) * sizeK, 7, 22);
  // never thinner than the flattened lip it is rolled from (D/2 × dEnd, below)
  const rr = Math.max(Math.sqrt(rr0 * rr0 + (excessEnd * 3) / Math.PI), (Math.min(D, 260) / 2) * 0.14 * 1.35);
  const bundleZ = 0.8;                                // squashed against the end
  const endOut = rolled ? rr * (0.55 + bundleZ) : 0;  // how far the bundle stands past the neck
  const Lb = total - (oneEnd ? endOut : 2 * endOut);  // barrel incl. necks
  const zOff = oneEnd ? -endOut / 2 : 0;              // keep the whole roll centred

  // End height and neck length from the record where it measured them:
  // `geometry.taper` on a roll is symmetric (nose == tail) and records the END
  // height as a fraction of the middle — Apidura Backcountry 0.75, Brooks 0.7,
  // Venture 0.85, the straight tubes 1.0. identity.js `taperRatio` reports
  // min/max = 1 for those, so the raw block is read here.
  const tp = p.geometry?.taper;
  const endK = Number.isFinite(tp?.nose) && Number.isFinite(tp?.tail) ? clamp(Math.min(tp.nose, tp.tail), 0.5, 1) : null;
  const form = geom.form || 'cylinder';
  const hEnd = rolled ? clamp(endK ?? (form === 'truncated_cylinder' ? 0.72 : form === 'barrel' ? 0.82 : 0.92), 0.6, 0.96) * (0.97 + vr.j(0.02)) : 0.9;
  const dEnd = rolled ? 0.14 : 0.9;                   // pinched flat fore-aft
  const neck = rolled ? clamp((form === 'truncated_cylinder' ? 0.16 : 0.12) * Lb + 0.14 * Math.min(D, H), 26, Lb * 0.3) : clamp(Math.min(D, H) * 0.08, 6, 14);
  const bulgeK = form === 'barrel' ? 0.07 : form === 'truncated_cylinder' ? 0.03 : 0.015;

  // ---- the section ---------------------------------------------------------------
  // ellipse; `d_shape` records in this slot (Restrap Holster, Altura) describe
  // a circle flattened on the FRONT; `flat_back` flat against the harness.
  const xsRaw = geom.crossSection;
  const shape = xsRaw === 'd_shape' || xsRaw === 'flat_back' ? xsRaw : 'round';
  const sgn = shape === 'd_shape' ? -1 : 1;           // loft −u is the flat side
  const sec = (t) => {
    // distance to each end, in mm, along the barrel
    const e0 = t * Lb, e1 = (1 - t) * Lb;
    const s0 = oneEnd ? smooth(e0 / Math.min(neck, 14)) : smooth(e0 / neck);
    const s1 = smooth(e1 / neck);
    const bul = 1 + bulgeK * (1 - (2 * t - 1) ** 2);
    const endA = (s, closed) => (closed ? 0.9 + 0.1 * s : dEnd + (1 - dEnd) * s);
    const endB = (s, closed) => (closed ? 0.9 + 0.1 * s : hEnd + (1 - hEnd) * s);
    const c0 = oneEnd || !rolled, c1 = !rolled;
    const fa = Math.min(endA(s0, c0), endA(s1, c1));
    const fb = Math.min(endB(s0, c0), endB(s1, c1));
    return { a: (D / 2) * bul * fa, b: (H / 2) * bul * fb };
  };
  const zAt = (t) => zOff + (t - 0.5) * Lb;
  const tAt = (z) => (z - zOff) / Lb + 0.5;

  const bodyAmp = stiff === 'rigid' ? 0 : vr.range(2.0, 3.0) * (stiff === 'semi' ? 0.4 : 1);
  const lift = bodyAmp + 1.2;
  /** a point on the fabric at station t, `ang` round the section (0 = forward, 90° = up) */
  const skin = (t, ang, out = 0) => {
    const s = sec(t);
    return v3(Math.cos(ang) * (s.a + out), Math.sin(ang) * (s.b + out), zAt(t));
  };

  const wm = webbing();
  const hwm = hardware();
  const strapGeos = [];
  const hwGeos = [];
  const panel = panelOf(main, accent);

  // ---- body --------------------------------------------------------------------------
  if (!sys.harnessOnly) {
    const loft = loftBody({ len: Lb, rings: 44, shape, sectionAt: (t) => { const s = sec(t); return { a: s.a, b: s.b }; } });
    // loft: u (a, fore-aft) → x·sgn, y (length) → z, v (b, vertical) → −y·sgn
    const M = new THREE.Matrix4().makeBasis(v3(sgn, 0, 0), v3(0, 0, 1), v3(0, -sgn, 0));
    loft.geo.applyMatrix4(M);
    loft.geo.translate(0, 0, zOff - Lb / 2);
    const body = soft(loft.geo, main, {
      amp: bodyAmp, freq: vr.range(0.02, 0.03), seed: vr.seed % 991, stiffness: stiff,
      aoDir: v3(0, -1, 0), aoK: 0.8, aoSpan: 0.5,
    });
    grp.add(body);

    // ---- the ends -------------------------------------------------------------------
    for (const s of [-1, 1]) {
      const tE = s > 0 ? 1 : 0;
      const zN = zAt(tE);                              // end of the neck
      const eSec = sec(tE);
      if (rolled && !(oneEnd && s < 0)) {
        // the bundle: a vertical roll of fabric standing across the end, flat
        // at top and bottom where the turned edges are — a lathe with a short
        // chamfer, not a sphere
        const hb = eSec.b * 2 * 0.94;
        // rolled fabric: full girth through the middle, the turned edges
        // drawn in over the top and bottom fifth — not a post, not a dome
        const prof = [];
        for (let k = 0; k <= 12; k++) {
          const y = -hb / 2 + (hb * k) / 12;
          const e = Math.min(k, 12 - k) / 12 / 0.22;           // 0 at the ends → 1 inboard
          const f = e >= 1 ? 1 : 0.55 + 0.45 * Math.sin((Math.PI / 2) * e);
          prof.push(new THREE.Vector2(rr * f, y));
        }
        prof.unshift(new THREE.Vector2(0, -hb / 2));
        prof.push(new THREE.Vector2(0, hb / 2));
        const bg = new THREE.LatheGeometry(prof, 22);
        bg.scale(1.12, 1, 1);
        bg.scale(1, 1, bundleZ);
        const zb = zN + s * rr * 0.55;
        bg.translate(0, 0, zb);
        const bundle = soft(bg, main, { amp: bodyAmp * 0.6, freq: 0.05, seed: (vr.seed + (s > 0 ? 3 : 5)) % 991, stiffness: stiff === 'rigid' ? 'semi' : stiff, aoDir: v3(0, -1, 0), aoK: 0.8, aoSpan: 0.5 });
        grp.add(bundle);
        // the turned edge of the last roll: two creases down the outboard face
        for (const ang of [deg(58), deg(128)]) {
          const cr = new THREE.Mesh(new THREE.BoxGeometry(1.4, hb * 0.6, 1.4), seamMat(main));
          cr.position.set(Math.cos(ang) * rr * 0.99, 0, zb + s * Math.sin(ang) * rr * bundleZ * 0.99);
          cr.userData.noCollide = true;
          grp.add(cr);
        }
        // the closure strap: front face → round the bundle's outboard side →
        // back face, pulled tight; buckle on the front
        const y0 = vr.j(eSec.b * 0.1);
        const path = [];
        const tIn = s > 0 ? 1 - (neck * 1.1) / Lb : (neck * 1.1) / Lb;
        for (let i = 0; i <= 6; i++) {
          const t = tIn + (tE - tIn) * (i / 6);
          const q = sec(t);
          path.push(v3(q.a * Math.sqrt(Math.max(0, 1 - (y0 / q.b) ** 2)) + lift * 0.4, y0, zAt(t)));
        }
        for (let i = 1; i < 12; i++) {
          const th = (i / 12) * Math.PI;
          path.push(v3(Math.cos(th) * (rr + 1.2), y0, zb + s * Math.sin(th) * (rr * bundleZ + 1.2)));
        }
        for (let i = 6; i >= 0; i--) {
          const t = tIn + (tE - tIn) * (i / 6);
          const q = sec(t);
          path.push(v3(-q.a * Math.sqrt(Math.max(0, 1 - (y0 / q.b) ** 2)) - lift * 0.4, y0, zAt(t)));
        }
        const w = clamp(eSec.b * 0.3, 14, 22);
        strapGeos.push(ribbonLoop(padOpen(path), v3(0, 1, 0), v3(0, y0, zN - s * neck * 0.5), { width: w, lift: 0.3, closed: false }));
        const bq = path[3];
        hwGeos.push(...buckle(v3(bq.x + 0.5, y0, bq.z), v3(0, 0, s), v3(1, 0, 0), { width: w }));
      } else {
        // a sewn end panel: flat, with its seam piped
        const q = sec(tE);
        const pts = [];
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2;
          pts.push(v3(Math.cos(a) * q.a, Math.sin(a) * q.b, zN));
        }
        const ring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 60, 1.6, 5, true), seamMat(main));
        ring.userData.noCollide = true;
        grp.add(ring);
      }
    }
  }

  // ---- placement -----------------------------------------------------------------------
  // Everything that stands BEHIND the roll: cradle panel, holster, sling.
  const backT = sys.mount === 'cradle' ? 6 : sys.mount === 'holster' ? 4 : sys.mount === 'rigid' ? (sys.plate ? 12 : 10) : sys.mount === 'cage' ? 8 : 0;
  const standoff = STANDOFF[sys.mount] ?? 26;
  const a0 = sec(0.5).a, b0 = sec(0.5).b;
  let cx = bc.x + BAR_TUBE_R + standoff + backT + a0;
  let cy = bc.y - 0.35 * H;
  // outline points that can meet the tyre or the head tube, in the roll's frame
  const outline = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    outline.push([Math.cos(a) * (a0 + lift + (Math.cos(a) < 0 ? backT : 0)), Math.sin(a) * (b0 + lift)]);
  }
  if (canister) for (const [x, y] of [[a0 + canister, -H * 0.4], [a0 + canister, H * 0.4]]) outline.push([x, y]);
  const tyreGap = (x0, y0) => {
    let m = Infinity;
    for (const [x, y] of outline) m = Math.min(m, Math.hypot(x0 + x - P.frontAxle.x, y0 + y - P.frontAxle.y) - P.tireR - g.tireWidth / 2);
    return m;
  };
  const headR = ctx.frameEdgeR?.[2] ?? 24;
  const headGap = (x0, y0) => {
    // the head tube from the top cup to below the crown, as a segment
    const A = P.headTop.clone().addScaledVector(P.hd, -10), B = P.headBottom.clone().addScaledVector(P.hd, 40);
    let m = Infinity;
    for (const [x, y] of outline) {
      const q = v3(x0 + x, y0 + y), ab = B.clone().sub(A);
      const t = clamp(q.clone().sub(A).dot(ab) / ab.lengthSq(), 0, 1);
      m = Math.min(m, q.distanceTo(A.clone().addScaledVector(ab, t)) - headR - 6);
    }
    return m;
  };
  for (let k = 0; k < 40 && tyreGap(cx, cy) < TYRE_CLEAR && cy < bc.y; k++) cy = Math.min(cy + 3, bc.y);
  for (let k = 0; k < 30 && headGap(cx, cy) < HEAD_CLEAR; k++) cx += 3;
  grp.userData.clearance = { tyre: Math.round(tyreGap(cx, cy)), head: Math.round(headGap(cx, cy)) };

  // the bar, in the roll's frame
  const barX = bc.x - cx, barY = bc.y - cy;

  // ---- back structure: cradle / holster / sling / cage -------------------------------
  /** A shell following the section at +`off`, over angles [a0, a1] (deg) and stations [t0, t1]. */
  const shell = (off, th, angA, angB, t0, t1, mat, { rings = 16, segs = 24 } = {}) => {
    const pos = [], idx = [];
    const cols = segs + 1;
    for (let i = 0; i <= rings; i++) {
      const t = t0 + (t1 - t0) * (i / rings);
      const q = sec(t);
      for (let j = 0; j <= segs; j++) {
        const ang = deg(angA + (angB - angA) * (j / segs));
        for (const o of [off, off + th]) pos.push(Math.cos(ang) * (q.a + o), Math.sin(ang) * (q.b + o), zAt(t));
      }
    }
    const V = (i, j, k) => (i * cols + j) * 2 + k;
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
      for (const k of [0, 1]) {
        const [a, b, c, d] = [V(i, j, k), V(i, j + 1, k), V(i + 1, j + 1, k), V(i + 1, j, k)];
        if (k) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
      }
    }
    // close the four edges so it reads as a panel with thickness
    for (let i = 0; i < rings; i++) for (const j of [0, segs]) {
      const [a, b, c, d] = [V(i, j, 0), V(i, j, 1), V(i + 1, j, 1), V(i + 1, j, 0)];
      if (j) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
    }
    for (const i of [0, rings]) for (let j = 0; j < segs; j++) {
      const [a, b, c, d] = [V(i, j, 0), V(i, j + 1, 0), V(i, j + 1, 1), V(i, j, 1)];
      if (i) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    grp.add(m);
    return m;
  };
  const midSpan = (f) => [0.5 - f / 2, 0.5 + f / 2];
  const ext = { back: 0, top: 0 };                    // what stands proud behind / above the roll
  let spacing = clamp(total * 0.3, 90, 170);          // bar-strap stations
  if (sys.mount === 'bracket') spacing = clamp(total * 0.14, 56, 80);
  if (sys.mount === 'rigid' || sys.mount === 'cage') spacing = clamp(total * 0.2, 60, 80);   // Hammerhead: ≤ 80 mm between clamps
  const stations = [-spacing / 2, spacing / 2];

  if (sys.mount === 'cradle') {
    // a stiff backing panel curling round the back of the roll
    const [t0, t1] = midSpan(sys.harnessOnly ? 1 : 0.72);
    shell(lift * 0.6, 5, sys.plate ? 150 : 115, sys.plate ? 210 : 245, t0, t1, tonedMat(panel, 0.8));
    ext.back = 5;
  } else if (sys.mount === 'holster') {
    // a fabric saddle over the top and down both faces, middle two-thirds
    const [lo, hi] = sys.holster || [-55, 205];
    const [t0, t1] = midSpan(0.66);
    shell(lift * 0.5, 3.5, lo, hi, t0, t1, panel, { rings: 18, segs: 30 });
    ext.back = 3.5;
    // its edge binding, where the photos show a hem
    for (const t of [t0, t1]) {
      const pts = [];
      for (let j = 0; j <= 24; j++) {
        const q = sec(t), ang = deg(lo + (hi - lo) * (j / 24));
        pts.push(v3(Math.cos(ang) * (q.a + lift * 0.5 + 3.6), Math.sin(ang) * (q.b + lift * 0.5 + 3.6), zAt(t)));
      }
      const hem = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 1.4, 5), seamMat(panel));
      hem.userData.noCollide = true;
      grp.add(hem);
    }
  } else if (sys.mount === 'rigid' || sys.mount === 'cage') {
    const rodHalf = Math.min(Lb / 2 - 10, 170);
    const [t0, t1] = [tAt(-rodHalf), tAt(rodHalf)];
    const frame = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.45, metalness: 0.35 });
    if (sys.mount === 'cage') {
      // the moulded cage round the back and under the roll
      shell(lift * 0.6, 4, 105, 265, t0, t1, frame);
      for (const z of [-rodHalf * 0.9, 0, rodHalf * 0.9]) {
        const pts = [];
        for (let j = 0; j <= 16; j++) {
          const ang = deg(105 + 160 * (j / 16)), q = sec(tAt(z));
          pts.push(v3(Math.cos(ang) * (q.a + lift * 0.6 + 5), Math.sin(ang) * (q.b + lift * 0.6 + 5), z));
        }
        const rib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 3, 6), frame);
        grp.add(rib);
      }
      ext.back = 8;
    } else {
      // two cross rods at the back of the roll, a sling or plate between them
      const upA = deg(150), dnA = deg(215);
      const rodAt = (ang) => { const q = sec(0.5); return [Math.cos(ang) * (q.a + lift + 7), Math.sin(ang) * (q.b + lift + 7)]; };
      for (const ang of [upA, dnA]) {
        const [x, y] = rodAt(ang);
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, rodHalf * 2 + 16, 14), frame);
        rod.rotation.x = Math.PI / 2;
        rod.position.set(x, y, 0);
        grp.add(rod);
      }
      if (sys.plate) {
        const [xu, yu] = rodAt(upA), [xd, yd] = rodAt(dnA);
        const pl = new THREE.Mesh(new RoundedBoxGeometry(10, Math.abs(yu - yd) + 30, rodHalf * 2 + 10, 3, 3), tonedMat(panel, 0.8));
        pl.position.set(Math.min(xu, xd) - 2, (yu + yd) / 2, 0);
        grp.add(pl);
      } else {
        shell(lift * 0.5, 2.5, 140, 225, t0, t1, tonedMat(panel, 0.85));
      }
      ext.back = 10;
    }
    // bar clamps and arms: a hinged clamp round the bar tube, an arm to the frame
    for (const z of stations) {
      hwGeos.push(tubeWrap(v3(barX, barY, z), v3(0, 0, 1), BAR_TUBE_R + 0.4, { width: 24, thick: 5 }));
      const q = sec(tAt(z));
      const foot = v3(-(q.a + lift + ext.back), 0, z);
      const head = v3(barX + BAR_TUBE_R + 2, barY, z);
      const d = foot.clone().sub(head);
      const arm = new THREE.Mesh(new RoundedBoxGeometry(Math.max(d.length(), 6), 14, 18, 2, 3), frame);
      arm.position.copy(head).addScaledVector(d, 0.5);
      arm.rotation.z = Math.atan2(d.y, d.x);
      arm.userData.noCollide = true;
      grp.add(arm);
    }
    // cargo straps: round the roll and the sling
    if (!sys.harnessOnly) {
      for (const z of [-rodHalf * 0.62, rodHalf * 0.62]) {
        const t = tAt(z), q = sec(t);
        const pts = [];
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2;
          const back = Math.cos(a) < 0 ? ext.back * Math.min(1, -Math.cos(a) * 1.6) : 0;
          pts.push(v3(Math.cos(a) * (q.a + lift + back), Math.sin(a) * (q.b + lift), z));
        }
        strapGeos.push(ribbonLoop(pts, v3(0, 0, 1), v3(0, 0, z), { width: 22, lift: 0.4 }));
        hwGeos.push(...buckle(v3(q.a + lift + 0.5, q.b * 0.35, z), v3(0, 1, 0), v3(1, 0, 0), { width: 20 }));
      }
    }
  }

  // ---- bar straps / spacers / brackets --------------------------------------------------
  const spacerMat = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.95 });
  if (sys.mount !== 'rigid' && sys.mount !== 'cage') {
    for (const z of stations) {
      const t = tAt(z), q = sec(t);
      const out = lift + ext.back;
      // the roll's rear surface level with the bar
      const yb = clamp(barY, -q.b * 0.9, q.b * 0.9);
      const rearX = -(q.a + out) * Math.sqrt(Math.max(0, 1 - (yb / (q.b + out)) ** 2));
      if (sys.mount === 'bracket') {
        // clamp closed round the bar, a moulded arm, a pad bonded to the fabric
        hwGeos.push(tubeWrap(v3(barX, barY, z), v3(0, 0, 1), BAR_TUBE_R + 0.4, { width: 26, thick: 5.5 }));
        const x0 = barX + BAR_TUBE_R + 3, x1 = rearX + 4;
        const arm = new THREE.Mesh(new RoundedBoxGeometry(Math.max(x1 - x0, 6), 26, 24, 2, 3), hwm);
        arm.position.set((x0 + x1) / 2, yb, z);
        arm.userData.noCollide = true;
        grp.add(arm);
      } else if (sys.mount !== 'strap') {
        // foam spacer block between the bar and the roll (or its panel)
        const x0 = barX + BAR_TUBE_R - 2, x1 = rearX + 3;
        if (x1 - x0 > 4) {
          const sp = new THREE.Mesh(new RoundedBoxGeometry(x1 - x0, 42, 30, 3, 5), spacerMat);
          sp.position.set((x0 + x1) / 2, yb - 6, z + (z > 0 ? 18 : -18));
          sp.userData.noCollide = true;
          grp.add(sp);
        }
      }
      // the strap: one piece of webbing round the bar and the roll together —
      // the convex hull of the two, so it lies ON both and bridges the gap
      const pts = [];
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        pts.push([barX + Math.cos(a) * (BAR_TUBE_R + 0.2), barY + Math.sin(a) * (BAR_TUBE_R + 0.2)]);
      }
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const back = Math.cos(a) < 0 ? ext.back * Math.min(1, -Math.cos(a) * 1.6) : 0;
        pts.push([Math.cos(a) * (q.a + lift * 0.7 + back), Math.sin(a) * (q.b + lift * 0.7)]);
      }
      const loop = densify(hull(pts), 8).map(([x, y]) => v3(x, y, z));
      strapGeos.push(ribbonLoop(loop, v3(0, 0, 1), v3((barX) / 2, barY / 2, z), { width: 22, lift: 0.3 }));
      // cam buckle low on the front, where the tail is pulled
      const bp = skin(t, deg(-30), lift * 0.7 + 1);
      hwGeos.push(...buckle(v3(bp.x, bp.y, z), v3(Math.sin(deg(-30)) * -1, Math.cos(deg(-30)), 0).normalize(), v3(Math.cos(deg(-30)), Math.sin(deg(-30)), 0), { width: 20 }));
    }
  }

  // ---- the head-tube strap, where the record has one ------------------------------------
  if (sys.head) {
    const from = skin(0.5, deg(215), lift + ext.back);
    const fw = v3(cx + from.x, cy + from.y);
    // nearest point on the head tube's axis, kept in the band under the top cup
    const ab = P.headBottom.clone().sub(P.headTop);
    const ht = clamp(fw.clone().sub(P.headTop).dot(ab) / ab.lengthSq(), 0.18, 0.6);
    const hp = P.headTop.clone().addScaledVector(ab, ht);
    const hl = v3(hp.x - cx, hp.y - cy, 0);
    const dir = hl.clone().sub(from);
    const L = dir.length();
    if (L > headR + 10) {
      const n = v3(-dir.y, dir.x, 0).normalize();
      const end = from.clone().addScaledVector(dir, (L - headR) / L);
      strapGeos.push(strapRun(from, end, n, { width: 20 }));
      strapGeos.push(tubeWrap(hl, v3(P.hd.x, P.hd.y, 0), headR + 0.6, { width: 20 }));
    }
  }

  // ---- front and surface details ------------------------------------------------------------
  const R0 = (a0 + b0) / 2;
  const frontOut = lift + (sys.mount === 'holster' && !sys.holster ? 4 : 0);
  if (!sys.harnessOnly) {
    // the two-tone centre sleeve (Apidura Backcountry): `features.abrasionPanels`
    if (p.features?.abrasionPanels) {
      const [t0, t1] = midSpan(0.5);
      shell(lift * 0.4, 2.2, 0, 360, t0, t1, panelOf(main, accent, 0.4), { rings: 16, segs: 40 });
    }
    // Restrap Holster Plus: the Rolltop Canister strapped flat on the front
    if (canister) {
      const cw = total * 0.52, ch = H * 0.8;
      const can = new THREE.Mesh(new RoundedBoxGeometry(canister, ch, cw, 4, Math.min(12, canister * 0.3)), main);
      can.position.set(a0 + lift + 4 + canister / 2 - 6, -H * 0.04, 0);
      grp.add(can);
      const cr = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, cw * 0.96, 16), main);
      cr.rotation.x = Math.PI / 2;
      cr.scale.set(1.3, 1, 1);
      cr.position.set(can.position.x, can.position.y + ch / 2 + 4, 0);
      grp.add(cr);
      for (const z of [-cw * 0.3, cw * 0.3]) {
        const xf = can.position.x + canister / 2 + 0.8;
        strapGeos.push(strapRun(v3(xf, can.position.y + ch / 2, z), v3(xf, can.position.y - ch / 2, z), v3(1, 0, 0), { width: 20 }));
      }
    }
    // shock cord across the front face
    if (feats.cord && !canister && !feats.daisyChains) {
      const lat = bungeeArc(hwm, { R: R0 + frontOut, arc: deg(64), len: Math.min(Lb * 0.42, 190), n: 3 });
      orientArc(lat, v3(0, 0, 1), v3(1, 0.05, 0));
      lat.position.z = zOff;
      grp.add(lat);
    }
    // daisy chains: two rows of stitched loops across the front (Sweetroll's
    // Manta flap, Expedition, Brooks, Tailfin cage)
    if (feats.daisyChains && !canister) {
      for (const ang of [deg(28), deg(-22)]) {
        const n = 6;
        for (let i = 0; i < n; i++) {
          const z = zOff + (i / (n - 1) - 0.5) * Lb * 0.44;
          const q = skin(tAt(z), ang, frontOut + 0.3);
          const nrm = v3(Math.cos(ang), Math.sin(ang), 0);
          strapGeos.push(strapRun(v3(q.x, q.y, z - 11), v3(q.x, q.y, z + 11), nrm, { width: 12 }));
        }
      }
    }
    // pockets
    const pk = feats.pockets.filter((x) => x && typeof x === 'object');
    const frontPocket = /front pocket/i.test(String(p.features?.pockets || ''));
    if (frontPocket || pk.some((x) => x.face === 'front')) {
      const kind = pk.find((x) => x.face === 'front')?.type || 'zip';
      const pa = pocketArc(main, hwm, { R: R0 + lift, len: Math.min(Lb * 0.44, 220), arc: deg(74), proud: kind === 'slip' ? 3.5 : 5, mesh: kind === 'mesh' });
      orientArc(pa, v3(0, 0, 1), v3(1, -0.08, 0));
      pa.position.z = zOff;
      grp.add(pa);
    }
    const side = pk.filter((x) => x.face === 'side');
    side.slice(0, 2).forEach((x, i) => {
      const z = zOff + (i % 2 ? 1 : -1) * Lb * 0.3;
      const pa = pocketArc(main, hwm, { R: R0 + lift, len: Math.min(Lb * 0.2, 90), arc: deg(60), proud: 4, mesh: x.type === 'mesh' });
      orientArc(pa, v3(0, 0, 1), v3(1, 0.1, 0));
      pa.position.z = z;
      grp.add(pa);
    });
    // zip closure along the top
    if (zipped) {
      const t0 = rolled ? 0.2 : 0.08, t1 = 1 - t0;
      grp.add(zipperRun(skin(t0, deg(80), lift * 0.6), skin(t1, deg(80), lift * 0.6), hwm, { tape: 2 }));
    }
    if (feats.reflective) {
      for (const s of [-1, 1]) {
        const rs = reflectiveArc({ R: R0 + lift, arc: deg(26), width: 9 });
        orientArc(rs, v3(0, 0, 1), v3(1, -0.4, 0));
        rs.scale.y = Math.min(Lb * 0.1, 40) / 9;
        rs.position.z = zOff + s * Lb * 0.3;
        grp.add(rs);
      }
    }
    // the maker's mark on the front
    const pz = zOff + vr.j(Lb * 0.05) + (canister ? total * 0.32 : 0);
    const px = sec(tAt(pz)).a + frontOut + 2.5 + (feats.cord && !canister && !feats.daisyChains ? 3 : 0);
    patch(grp, brand, px, vr.j(H * 0.08), pz, clamp(Lb * 0.2, 56, 92), Math.PI / 2);
  } else {
    patch(grp, brand, -(a0 + lift + ext.back) + 12, 0, 0, clamp(total * 0.2, 50, 80), Math.PI / 2);
  }

  if (strapGeos.length) grp.add(meshOf(strapGeos, wm));
  if (hwGeos.length) grp.add(meshOf(hwGeos, hwm));

  grp.position.set(cx - anchorPos.x, cy - anchorPos.y, 0);
  grp.userData.halfLen = total / 2;
  grp.userData.radius = a0;          // system.js _staticFixes: fore-aft half-depth
  grp.userData.mount = sys.mount;
  return shadowify(grp);
}
