// Saddle bag builder (mm-local, parented to the seatpack anchor).
//
// ---- AXIS MAPPING (BUILDER-BRIEF Rule 2) ------------------------------------
// Group-local axes, same as every rear builder:
//
//   x  fore-aft, +x toward the front wheel      `deep`
//   y  up                                       `h`      = p.mm.hgt, always
//   z  across the bike                          `across`
//
// Which catalogue axis is `across` is PER PRODUCT, read from `mount.axes`
// (p.axes, via axesOf). Checked against every saddlebag record, 25 Sep:
//   len -> z (across): Carradice Nelson, Barley, Camper, SQR Slim; Brooks
//     Challenge 0.5/1.5, D-Shaped, Saddle Roll, Saddle Pocket; Bags by Bird
//     Piccolo; Atelier Velocidade Bivouac; Chrome Doubletrack; Road Runner
//     Tool Roll; Topeak Burrito. `wid` is then the fore-aft depth.
//   len -> x (fore-aft): every tapered_wedge / teardrop seat-pack-like bag,
//     Brooks Isle of Wight, Outer Shell Rolltop and Mini, Wizard Works Teeny
//     Houdini, Road Runner Drafter. `wid` is then across.
// Where `mount.axes` is silent: a known non-wedge form is across, which is the
// owner's rule: "A saddle bag in the Carradice or Brooks tradition is wide
// across the bike, not long behind it." A product with no record at all
// (Blackburn Local Saddle Bag) is drawn as the small seat-pack wedge it is.
// The Carradice records carried the opposite (len fore-aft) until
// 8 Aug; the corrected `mount.axes` now agrees with the owner and is followed.
//
// ---- THREE FAMILIES -----------------------------------------------------------
//   classic  saddlebag_flap / box / halfmoon, wider than deep: a canvas or
//            leather body hung across the bike, a flap lid over the top and
//            down the rear face held by leather billets through roller
//            buckles, side pockets on the two END faces (the ends of the
//            across axis) where the record has them, two billets up to the
//            saddle (loops on a Brooks; round the rails here, which is where
//            the loops are), a Bagman-style support or an SQR block where the
//            record names one.
//   roll     cylinder / slab: a tool roll or small dry roll lying across the
//            bike, strapped up against the rails.
//   wedge    tapered_wedge / teardrop, and any other form whose long axis runs
//            fore-aft by 1.3x or more: the small seat-pack-like products. These
//            keep the seat pack look; the body is seatpack.js's wedge, copied
//            here (not imported) with its floors lowered for 4 cm tool packs.
//
// ---- PLACEMENT (Rule 1: every value from the bike) ----------------------------
//   top          just under ctx.rails (touching), or higher behind the saddle
//                on a support when the tyre needs it
//   front face   behind the seatpost (ctx.points.sd / seatTop, geo.seatpostDia);
//                a bag hung from saddle LOOPS starts at the rails' rear end
//                (ctx.rails.*[0]), which is where the loops are and keeps a
//                wide bag out from under the rider's thighs; a support pushes
//                it behind the saddle's rear edge (rails + geo.saddleLength)
//   sag          mount.sag_deg from the record (rear down), dropped if the
//                tyre needs it
//   tyre         >= 18 mm from rearAxle / tireR + tireWidth/2, solved, not
//                measured off a screenshot
// Record data that tools/apply-models.mjs does not merge (straps, pockets,
// attachesTo, sag_deg) is tabulated in SADDLE_RECORDS below.
//
// Evidence: data/models/*.json (written with the photos open), owner's words
// in SLOT-BRIEFS.md, knowledge of the Carradice Originals / Super C, Brooks
// Challenge / D-Shaped / Scape, Bagman supports. Maker photos are not
// reachable from this sandbox.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { v3, deg, tubeAlong } from '../../lib.js';
import { boxBulge } from '../deform.js';
import { zipperRun, meshPanelMat } from '../features.js';
import { axesOf, featuresOf, geomOf, stiffnessOf, variantOf } from '../identity.js';
import { loftBody, sectionUnit } from '../loft.js';
import { hardware, patch, seamMat, shadowify, soft, webbing } from '../materials.js';
import { buckle, meshOf, ribbonLoop, strapRun, tubeWrap } from '../straps.js';

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const WEDGE_FORMS = new Set(['tapered_wedge', 'teardrop']);
const ROLL_FORMS = new Set(['cylinder', 'slab']);

/**
 * From data/models/<brand>.json, 25 Sep. Keyed brand|name (|size wins).
 *   att   L billets to the saddle loops, B support (Bagman-style), Q SQR block,
 *         R webbing round the rails, P a strap round the seatpost
 *   lid   straps over the flap; lidMat leather | webbing
 *   pockets side (one on each end of the across axis) | front_mesh
 *   comp  compression girth straps; sag mount.sag_deg
 */
const SADDLE_RECORDS = {
  'Carradice|Nelson Longflap Saddlebag': { att: 'LB', lid: 1, lidMat: 'leather', pockets: 'side', sag: 5, longflap: true },
  'Carradice|Barley Saddlebag': { att: 'L', lid: 2, lidMat: 'leather', pockets: 'side', sag: 4 },
  'Carradice|Camper Longflap Saddlebag': { att: 'LB', lid: 2, lidMat: 'leather', pockets: 'side', sag: 5, longflap: true },
  'Carradice|Super C SQR Slim': { att: 'Q', lid: 1, lidMat: 'webbing', comp: 1, sag: 2 },
  'Brooks England|Challenge Saddle Bag': { att: 'L', lid: 1, lidMat: 'leather', leather: true, sag: 0, drop: 0.5 },
  'Brooks England|Challenge Saddle Bag Large': { att: 'L', lid: 1, lidMat: 'leather', leather: true, sag: 0, drop: 0.55 },
  'Brooks England|D-Shaped Saddle Bag': { att: 'L', lid: 2, lidMat: 'leather', leather: true, sag: 0, drop: 0.34 },
  'Brooks England|Isle of Wight Saddle Bag': { att: 'LP', girthLeather: true, sag: 2 },
  'Brooks England|Saddle Roll Bag': { att: 'RP', sag: 0, belly: true },
  'Brooks England|Saddle Pocket Bag': { att: 'R', band: true, sag: 0 },
  'Bags by Bird|Piccolo 11W': { att: 'L', lid: 2, lidMat: 'leather', pockets: 'side', sag: 0 },
  'Atelier Velocidade|Bivouac': { att: 'R', pockets: 'front_mesh', sag: 3 },
  'Road Runner Bags|Drafter Saddle Bag': { att: 'R', lid: 1, lidMat: 'webbing', sag: 5, drop: 0.45 },
  'Road Runner Bags|Tool Saddle Roll': { att: 'R', sag: 0 },
  'Chrome Industries|Doubletrack Saddle Roll': { att: 'R', belly: true, sag: 0 },
  'Topeak|Burrito Pack': { att: 'R', belly: true, sag: 0 },
  'Apidura|Tool Pack': { att: 'RP' },
  'Ortlieb|Saddle-Bag': { att: 'R' },
  'Ortlieb|Micro-Bag': { att: 'R' },
  'Revelate Designs|Shrew': { att: 'R', comp: 1 },
  'Revelate Designs|Ultra Shrew': { att: 'R', comp: 1 },
  'Revelate Designs|Stoat Seat Bag': { att: 'R' },
  'Restrap|Saddle Pack': { att: 'RP', comp: 1 },
  'Blackburn Design|Grid Seat Bag': { att: 'R', comp: 1 },
  'Topeak|Aero Wedge Pack (strap)': { att: 'RP' },
  'Topeak|Wedge DryBag': { att: 'R' },
  'Topeak|Wedge DryBag|L': { att: 'RP' },
  'Outer Shell Adventure|Rolltop Saddlebag': { att: 'R', comp: 1 },
  'Outer Shell Adventure|Mini Saddlebag': { att: 'R', comp: 1 },
  'Wizard Works|Teeny Houdini Saddle Bag': { att: 'RP' },
  'Cedaero|Cedaero Switchback Seat Pack': { att: 'P' },
  'Lezyne|Lezyne M-Caddy': { att: 'RP' },
  'Zefal|Zefal Z Light Pack S': { att: 'R' },
  'Straight Cut Design|Straight Cut Custom Dropper Seatpost Saddlebag': { att: 'RP' },
};
function recordOf(brand, p) {
  const base = `${brand?.name || ''}|${p.name || ''}`;
  return SADDLE_RECORDS[`${base}|${p.size || ''}`] ?? SADDLE_RECORDS[base] ?? {};
}

// ---- materials the fabric set does not have ------------------------------------
/** Vegetable-tanned leather: satin, not fabric. Colour from the product. */
function leatherMat(color) {
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: c, roughness: 0.5, metalness: 0, clearcoat: 0.28, clearcoatRoughness: 0.55,
    sheen: 0.18, sheenRoughness: 0.6, sheenColor: c.clone().lerp(new THREE.Color(0xffe8c8), 0.3),
  });
}
const nickelMat = () => new THREE.MeshStandardMaterial({ color: 0xd2d4d6, metalness: 0.92, roughness: 0.26 });
const steelMat = () => new THREE.MeshStandardMaterial({ color: 0xb9bcbf, metalness: 0.85, roughness: 0.32 });
/** Billet leather on a canvas bag: Carradice and Bird use a mid brown hide. */
const BILLET_BROWN = 0x5a3820;

/**
 * A roller buckle for a leather billet: an open metal frame, a roller across
 * the end the strap turns over and a prong down the middle. straps.js buckle()
 * is a plastic side-release, which on a Brooks is the wrong product.
 */
function rollerBuckle(at, dir, normal, w, out) {
  const x = dir.clone().normalize();
  const y0 = normal.clone().normalize();
  const z = new THREE.Vector3().crossVectors(x, y0).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  const B = new THREE.Matrix4().makeBasis(x, y, z);
  const W = w + 6, L = w * 0.85, t = 2.2;
  const bars = [
    [L, t, t, 0, 0, W / 2], [L, t, t, 0, 0, -W / 2],
    [t, t, W + t, L / 2, 0, 0], [t * 1.8, t * 1.8, W + t, -L / 2, 0.4, 0],
    [L * 0.95, t * 0.7, t * 0.9, -0.05 * L, 1.2, 0],
  ];
  for (const [a, b, c, px, py, pz] of bars) {
    const g = new THREE.BoxGeometry(a, b, c);
    g.translate(px, py + t / 2 + 1.8, pz);
    g.applyMatrix4(B);
    g.translate(at.x, at.y, at.z);
    out.push(g);
  }
}

// ---- the bike, in the anchor's frame --------------------------------------------
function bikeRefs(ctx) {
  const P = ctx.points;
  const g = ctx.geo || {};
  const anchor = ctx.anchors.seatpack.position.clone();
  const postR = (g.seatpostDia || 27.2) / 2;
  const postXAt = (y) => P.seatTop.x + P.sd.x * ((y - P.seatTop.y) / P.sd.y);
  const rails = ctx.rails || null;
  const railR = rails?.r ?? 3.5;
  const railRear = rails ? rails.right[0] : v3(P.saddlePos.x - 122, P.saddlePos.y + 8);
  const railFront = rails ? rails.right[1] : v3(P.saddlePos.x + 55, P.saddlePos.y + 4);
  const railYAt = (x) => {
    const k = clamp((x - railRear.x) / (railFront.x - railRear.x), 0, 1);
    return railRear.y + (railFront.y - railRear.y) * k;
  };
  const railBottom = Math.min(railRear.y, railFront.y) - railR;
  const sL = g.saddleLength || 270;
  // the shell's rear edge overhangs the rail ends by ~a tenth of its length
  // (same derivation trunk.js uses)
  const saddleRear = railRear.x - 0.1 * sL - 8;
  const saddleTop = P.saddlePos.y + 30;
  const tyreR = P.tireR + (g.tireWidth || 45) / 2;
  const tyreGap = (x, y) => Math.hypot(x - P.rearAxle.x, y - P.rearAxle.y) - tyreR;
  // A saddle clamp cradle reaches ~an inch behind the post just under the
  // rails; keep the bag's top edge out of it.
  const clampBehind = postR * 1.8;
  const stayGap = (x, y) => {
    // distance to the seatstay line (seatTop -> rearAxle), stay radius ~8
    const ax = P.seatTop.x, ay = P.seatTop.y, bx = P.rearAxle.x - ax, by = P.rearAxle.y - ay;
    const t = clamp(((x - ax) * bx + (y - ay) * by) / (bx * bx + by * by), 0, 1);
    return Math.hypot(x - (ax + bx * t), y - (ay + by * t)) - 9;
  };
  return {
    P, g, anchor, postR, postXAt, rails, railR, railRear, railFront, railYAt, railBottom,
    saddleRear, saddleTop, tyreGap, stayGap, clampBehind, sd: P.sd,
  };
}
const rot2 = (q, th) => v3(q.x * Math.cos(th) - q.y * Math.sin(th), q.x * Math.sin(th) + q.y * Math.cos(th), q.z ?? 0);

export function buildSaddlebag(p, brand, main, accent, ctx) {
  const vr = variantOf(brand, p);
  const geom = geomOf(p);
  const axes = axesOf(p);
  const stiff = stiffnessOf(p);
  const rec = recordOf(brand, p);
  const form = geom.form || null;

  // per-product axis mapping (header)
  const lenAcross = axes.len ? axes.isAcross('len') : !!form && !WEDGE_FORMS.has(form);
  const across = lenAcross ? p.mm.len : p.mm.wid;
  const deep = lenAcross ? p.mm.wid : p.mm.len;
  const h = p.mm.hgt;

  const family = ROLL_FORMS.has(form) ? 'roll'
    : WEDGE_FORMS.has(form) || deep >= across * 1.3 ? 'wedge'
      : 'classic';
  const args = { p, brand, main, accent, ctx, vr, geom, stiff, rec, across, deep, h };
  if (family === 'wedge') return buildWedge(args);
  if (family === 'roll') return buildRoll(args);
  return buildClassic(args);
}

// =================================================================================
// CLASSIC: Carradice / Brooks
// =================================================================================

/** Rounded section in x-y: x 0 (front, post side) .. -D (rear), y 0 (top) .. -H. */
function sectionRing(D, H, r) {
  let { ft, rt, rb, fb } = r;
  const fit = (a, b, lim) => { const s = a + b > lim * 0.98 ? (lim * 0.98) / (a + b) : 1; return s; };
  let s = Math.min(fit(ft, rt, D), fit(rb, fb, D), fit(rt, rb, H), fit(ft, fb, H));
  ft *= s; rt *= s; rb *= s; fb *= s;
  const pts = [];
  const N = 6, L = 4, H90 = Math.PI / 2;
  const arc = (cx, cy, rr, a0, a1) => { for (let i = 0; i <= N; i++) { const a = a0 + ((a1 - a0) * i) / N; pts.push(v3(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0)); } };
  const line = (x0, y0, x1, y1) => { for (let i = 1; i < L; i++) { const t = i / L; pts.push(v3(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0)); } };
  arc(-ft, -ft, ft, 0, H90);                       // front-top
  line(-ft, 0, -D + rt, 0);                        // top
  arc(-D + rt, -rt, rt, H90, 2 * H90);             // rear-top: where the flap folds over
  line(-D, -rt, -D, -H + rb);                      // rear face
  arc(-D + rb, -H + rb, rb, 2 * H90, 3 * H90);     // rear-bottom: the barrel belly
  line(-D + rb, -H, -fb, -H);                      // bottom
  arc(-fb, -H + fb, fb, 3 * H90, 4 * H90);         // front-bottom
  line(0, -H + fb, 0, -ft);                        // front face (against the post / support)
  // index of the first rear-top arc point, and of the last rear-bottom one
  return { pts, iRT: N + L, iRBEnd: 3 * N + 2 * L, r: { ft, rt, rb, fb } };
}

/** Loft a section ring along z with stuffed, rounded end panels. */
function loftAcross(ring, W, { endR, endS }) {
  const M = ring.length;
  let cx = 0, cy = 0;
  for (const q of ring) { cx += q.x; cy += q.y; }
  cx /= M; cy /= M;
  const zs = [];
  const nMid = 14, nEnd = 6;
  const e = Math.min(endR, W * 0.3);
  const half = W / 2;
  for (let i = 0; i <= nEnd; i++) zs.push(-half + e * (1 - Math.cos((i / nEnd) * Math.PI / 2)));
  for (let i = 1; i < nMid; i++) zs.push(-half + e + ((W - 2 * e) * i) / nMid);
  for (let i = nEnd; i >= 0; i--) zs.push(half - e * (1 - Math.cos((i / nEnd) * Math.PI / 2)));
  const scaleAt = (z) => {
    const d = Math.abs(z) - (half - e);
    if (d <= 0) return 1;
    const q = clamp(d / e, 0, 1);
    return endS + (1 - endS) * Math.sqrt(Math.max(0, 1 - q * q));
  };
  const pos = [];
  for (const z of zs) {
    const s = scaleAt(z);
    for (const q of ring) pos.push(cx + (q.x - cx) * s, cy + (q.y - cy) * s, z);
  }
  const idx = [];
  for (let i = 0; i < zs.length - 1; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * M + j, b = (i + 1) * M + j, c = (i + 1) * M + ((j + 1) % M), d = i * M + ((j + 1) % M);
      idx.push(a, c, b, a, d, c);
    }
  }
  // end panels: fan to a centre vertex
  const c0 = pos.length / 3; pos.push(cx, cy, zs[0]);
  const c1 = pos.length / 3; pos.push(cx, cy, zs[zs.length - 1]);
  const last = (zs.length - 1) * M;
  for (let j = 0; j < M; j++) {
    idx.push(c0, (j + 1) % M, j);
    idx.push(c1, last + j, last + ((j + 1) % M));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function buildClassic({ p, brand, main, accent, ctx, vr, geom, stiff, rec, across, deep, h }) {
  const grp = new THREE.Group();
  const feats = featuresOf(p);
  const closure = String(p.closure?.type || feats.closure || 'flap_buckle').toLowerCase();
  const flapped = !/zip/.test(closure);
  const leather = !!rec.leather;
  const bodyMat = leather ? leatherMat(main.color) : main;
  const billetMat = leatherMat(leather ? main.color.clone().multiplyScalar(0.72) : new THREE.Color(BILLET_BROWN));
  const nickel = nickelMat();
  const wm = webbing();
  const hwm = hardware();

  // ---- dimensions ---------------------------------------------------------------
  // Side pockets live INSIDE the published width: Carradice's across figure is
  // the bag with its pockets, so the body is the rest.
  const sidePockets = rec.pockets === 'side'
    || (!rec.pockets && feats.pockets.some((x) => /side/i.test(JSON.stringify(x))));
  const pp = sidePockets ? clamp(across * 0.085, 16, 42) : 0;
  const W = across - 2 * pp;
  const D = deep, H = h;
  const m = Math.min(D, H);
  const xs = String(geom.crossSection || '');
  // Corner radii of the end elevation. flat_back: a flat face against the
  // post, a rolled flap edge and a round barrel belly (Carradice). d_shape: a
  // D lying on its flat back, the rear and bottom one curve (Brooks Challenge).
  // halfmoon: flat top, belly curving down to both faces (Brooks Saddle Pocket).
  const r0 = geom.form === 'halfmoon' ? { ft: m * 0.1, rt: m * 0.1, rb: m * 0.9, fb: m * 0.7 }
    : xs === 'd_shape' ? { ft: m * 0.08, rt: m * 0.34, rb: m * 0.9, fb: m * 0.14 }
      : xs === 'flat_back' ? { ft: m * 0.08, rt: m * 0.26, rb: m * 0.42, fb: m * 0.16 }
        : { ft: m * 0.18, rt: m * 0.24, rb: m * 0.3, fb: m * 0.2 };
  const ring = sectionRing(D, H, r0);
  const r = ring.r;
  /** x of the rear face at height y (it curves in round the belly) */
  const xRear = (y) => {
    const yc = -H + r.rb;
    if (y >= yc) return -D;
    const dy = Math.min(yc - y, r.rb);
    return -D + r.rb - Math.sqrt(Math.max(r.rb * r.rb - dy * dy, 0));
  };

  // ---- body ---------------------------------------------------------------------
  const geo = loftAcross(ring.pts, W, { endR: Math.min(m * 0.3, W * 0.12), endS: leather ? 0.93 : 0.86 });
  geo.translate(D / 2, H / 2, 0);
  const amp = leather ? 0.5 : clamp(m * 0.012, 0.9, 2.4);
  const bul = leather ? 0 : clamp(m * 0.03, 1, 6);
  const body = soft(geo, bodyMat, {
    amp, freq: vr.range(0.026, 0.036), seed: vr.seed % 907,
    stiffness: leather ? 'rigid' : stiff,
    bulge: bul ? boxBulge(D / 2, H / 2, W / 2, bul) : null,
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.84, aoSpan: 0.5,
  });
  body.position.set(-D / 2, -H / 2, 0);
  grp.add(body);
  const lift = amp + bul + 1.2;

  // Walk the outline (mid-width section) with an outward offset: a path on the
  // surface for the flap and the billets that lie over it.
  const pts = ring.pts;
  const cen = v3(-D / 2, -H / 2, 0);
  const normalAt = (q) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) { const d = pts[i].distanceToSquared(q); if (d < bd) { bd = d; best = i; } }
    const a = pts[(best - 1 + pts.length) % pts.length], b = pts[(best + 1) % pts.length];
    const t = b.clone().sub(a);
    const n = v3(-t.y, t.x, 0).normalize();          // ring is CCW seen from +z: this points out
    if (n.dot(q.clone().sub(cen)) < 0) n.negate();
    return n;
  };
  /** outline from the start of the top run round the rear-top fold and down the rear face to y = yEnd */
  const lidPath = (xStart, yEnd) => {
    const out = [];
    for (let i = 0; i <= ring.iRBEnd; i++) {
      const q = pts[i];
      if (i < ring.iRT && q.x > xStart) continue;
      if (q.y < yEnd) break;
      out.push(q.clone());
    }
    const e = v3(xRear(yEnd), yEnd, 0);
    if (out.length && out[out.length - 1].distanceTo(e) > 1) out.push(e);
    return out;
  };

  const leatherGeos = [], nickelGeos = [], webGeos = [], hwGeos = [];
  const drop = rec.drop ?? (rec.longflap ? 0.78 : 0.56);
  const flapEnd = -H * drop;

  // ---- flap lid -------------------------------------------------------------------
  if (flapped) {
    const path = lidPath(-Math.min(r.ft + 4, D * 0.2), flapEnd);
    const flapT = leather ? 2.4 : 3;
    const fg = ribbonLoop(path, v3(0, 0, 1), cen, { width: W - Math.min(m * 0.3, W * 0.12) * 0.5, lift, thick: flapT, closed: false });
    const flap = new THREE.Mesh(fg, bodyMat);
    grp.add(flap);
    // bound edge along the flap's lower hem
    const xh = xRear(flapEnd + 4) - lift - flapT - 0.4;
    const hemA = v3(xh, flapEnd + 4, -W / 2 - 1), hemB = v3(xh, flapEnd + 4, W / 2 + 1);
    const hem = meshOf([strapRun(hemA, hemB, v3(-1, 0, 0), { width: 8, thick: 1.2 })], seamMat(bodyMat));
    grp.add(hem);

    // lid straps: billets from the top of the flap, down over it, through a
    // roller buckle riveted on the body below the hem
    const n = rec.lid ?? (W > 220 ? 2 : 1);
    const zsL = n === 1 ? [0] : n === 2 ? [-W * 0.27, W * 0.27] : [-W * 0.32, 0, W * 0.32];
    const bw = clamp(W * 0.07, 12, 22);
    const leatherLid = (rec.lidMat ?? 'leather') === 'leather';
    const yBuckle = Math.max(flapEnd - Math.min(H * 0.14, 30), -H + r.rb * 0.7);
    for (const z of zsL) {
      const bp = lidPath(-D * 0.55, yBuckle).map((q) => q.setZ(z));
      const g = ribbonLoop(bp, v3(0, 0, 1), cen.clone().setZ(z), { width: bw, lift: lift + flapT + 0.2, thick: leatherLid ? 2.6 : 1.5, closed: false });
      (leatherLid ? leatherGeos : webGeos).push(g);
      const xb = xRear(yBuckle) - lift;
      const bAt = v3(xb - 0.5, yBuckle, z);
      if (leatherLid) {
        rollerBuckle(bAt, v3(0, -1, 0), v3(-1, 0, 0), bw, nickelGeos);
        // the tab the buckle is riveted to, sewn to the body
        const yT = yBuckle - Math.min(24, H * 0.1);
        leatherGeos.push(strapRun(v3(xb, yBuckle - 4, z), v3(xRear(yT) - lift, yT, z), v3(-1, 0, 0), { width: bw + 2, thick: 2.4 }));
        // keeper just above the buckle
        const yK = yBuckle + bw * 0.55, xk = xRear(yK) - lift - 2.8;
        leatherGeos.push(strapRun(v3(xk, yK, z - bw * 0.62), v3(xk, yK, z + bw * 0.62), v3(-1, 0, 0), { width: 5, thick: 1.6 }));
      } else {
        hwGeos.push(...buckle(bAt, v3(0, -1, 0), v3(-1, 0, 0), { width: bw }));
      }
    }
  } else {
    // zipped top (Bivouac, Saddle Pocket): the track across the top, near the rear
    grp.add(zipperRun(v3(-D * 0.72, lift + 0.4, -W * 0.44), v3(-D * 0.72, lift + 0.4, W * 0.44), hwm, { accentMat: accent }));
  }

  // ---- side pockets, on the two ends of the across axis ------------------------------
  if (sidePockets) {
    const pw = D * 0.64, ph = H * 0.58;
    const xc = -D * 0.5, yc = -H * 0.56;
    for (const s of [1, -1]) {
      const zc = s * (W / 2 + pp / 2 - 2);
      const pg = new RoundedBoxGeometry(pw, ph, pp + 4, 3, Math.min(pp * 0.45, 10));
      const pk = soft(pg, bodyMat, { amp: amp * 0.6, freq: 0.04, seed: (vr.seed + (s > 0 ? 11 : 23)) % 907, stiffness: stiff, bulge: boxBulge(pw / 2, ph / 2, (pp + 4) / 2, Math.min(4, pp * 0.12)) });
      pk.position.set(xc, yc, zc);
      grp.add(pk);
      // pocket flap
      const pf = new THREE.Mesh(new RoundedBoxGeometry(pw * 1.04, ph * 0.36, pp + 8, 2, 3), bodyMat);
      pf.position.set(xc, yc + ph * 0.34, zc + s * 2);
      grp.add(pf);
      // its strap and buckle, down the outer face
      const zo = s * (W / 2 + pp + 2 + 3.2);
      const ps = strapRun(v3(xc, yc + ph * 0.5, zo), v3(xc, yc - ph * 0.08, zo), v3(0, 0, s), { width: 13, thick: 2.2 });
      leatherGeos.push(ps);
      rollerBuckle(v3(xc, yc - ph * 0.12, zo + s * 0.4), v3(0, -1, 0), v3(0, 0, s), 13, nickelGeos);
    }
  }
  if (rec.pockets === 'front_mesh') {
    // Bivouac: a zipped mesh pocket on the outer (rear-facing) panel
    const pw = W * 0.7, ph = H * 0.42;
    const g = new RoundedBoxGeometry(8, ph, pw, 2, 3);
    const pm = new THREE.Mesh(g, meshPanelMat());
    pm.position.set(-D - lift - 2, -H * 0.6, 0);
    grp.add(pm);
    grp.add(zipperRun(v3(-D - lift - 6.5, -H * 0.6 + ph / 2, -pw * 0.46), v3(-D - lift - 6.5, -H * 0.6 + ph / 2, pw * 0.46), hwm, {}));
  }
  if (rec.band) {
    // Saddle Pocket: a wide webbing band round the body's girth, carrying the logo
    const yb = -H * 0.52;
    const bandPts = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      bandPts.push(v3(-D / 2 + Math.cos(a) * (D / 2), yb, Math.sin(a) * (W / 2)));
    }
    // a superellipse, not an ellipse: the band follows the body's flat ends
    for (const q of bandPts) {
      const u = (q.x + D / 2) / (D / 2), w = q.z / (W / 2);
      const k = Math.pow(Math.abs(u) ** 4 + Math.abs(w) ** 4, 0.25) || 1;
      q.x = -D / 2 + (u / k) * (D / 2); q.z = (w / k) * (W / 2);
    }
    webGeos.push(ribbonLoop(bandPts, v3(0, 1, 0), v3(-D / 2, yb, 0), { width: Math.min(H * 0.34, 30), lift: lift + 0.4 }));
  }

  // brand mark on the flap (or the rear face)
  patch(grp, brand, xRear(flapped ? Math.max(flapEnd * 0.5, -H * 0.3) : -H * 0.4) - lift - 3.4, flapped ? Math.max(flapEnd * 0.5, -H * 0.3) : -H * 0.4, rec.lid === 1 || !flapped ? W * 0.26 : 0, clamp(W * 0.22, 40, 76), -Math.PI / 2);

  // ---- placement ------------------------------------------------------------------------
  const B = bikeRefs(ctx);
  // the silhouette the bike sees: the body, plus the flap and stuffing over it
  const outline = pts.map((q) => q.clone().addScaledVector(normalAt(q), lift + (flapped ? 3 : 0.5)));
  let hasSupport = /B/.test(rec.att || '');
  const onLoops = /L/.test(rec.att || '');
  const sqr = /Q/.test(rec.att || '');
  // Where the front face may sit: behind the post (and the clamp cradle), and
  // for a loop-hung bag no further forward than the rail ends, where a Brooks
  // has its loops and where a wide bag clears the rider's thighs. A support
  // carries it behind the saddle's rear edge.
  const capFor = () => (hasSupport ? B.saddleRear - 6 : onLoops ? B.railRear.x + 6 : Infinity);
  const place = (th, topY, frontCap = capFor()) => {
    const R = outline.map((q) => rot2(q, th));
    let maxY = -Infinity;
    for (const q of R) maxY = Math.max(maxY, q.y);
    const gy = topY - B.anchor.y - maxY;
    let gx = Infinity;
    for (const q of R) {
      const fy = B.anchor.y + gy + q.y;
      let lim = Math.min(frontCap, B.postXAt(fy) - B.postR - 2);
      if (fy > B.railBottom - 26) lim = Math.min(lim, B.postXAt(fy) - B.postR - B.clampBehind);
      gx = Math.min(gx, lim - B.anchor.x - q.x);
    }
    let tyre = Infinity, stay = Infinity;
    for (const q of R) {
      const fx = B.anchor.x + gx + q.x, fy = B.anchor.y + gy + q.y;
      tyre = Math.min(tyre, B.tyreGap(fx, fy));
      stay = Math.min(stay, B.stayGap(fx, fy));
    }
    return { gx, gy, tyre, stay, th, topY, frontCap };
  };
  // Tyre first, in the order a rider would fix it: take the sag out; hang a
  // loop bag against the post instead of back at the loops; on a support,
  // lift it behind the saddle (a Bagman carries a Camper level with the
  // saddle top); last, cinch it nose-down so the rear lower corner rises.
  const TYRE_MIN = 18;
  const railTop = B.railBottom - 1;
  const ok = (s) => s.tyre >= TYRE_MIN && s.stay >= 10;
  const solve = () => {
    let s = place(deg(rec.sag ?? vr.range(2, 4)), railTop);
    if (!ok(s) && s.th > 0) s = place(0, railTop);
    if (!ok(s) && onLoops && !hasSupport) {
      const s2 = place(0, railTop, Infinity);
      if (s2.tyre > s.tyre) s = s2;
    }
    if (hasSupport) {
      let y = railTop;
      while (!ok(s) && y < B.saddleTop + 20) { y += 2; s = place(s.th, y); }
    }
    for (let t = -1; !ok(s) && t >= -8; t--) {
      const s2 = place(deg(t), s.topY, s.frontCap);
      if (s2.tyre > s.tyre) s = s2;
    }
    return s;
  };
  let sol = solve();
  // A big loop-hung bag that cannot clear the tyre from the loops alone goes
  // on a support, which is how riders carry one ("hung from the saddle loops
  // or a bag support", owner). Bags by Bird's Piccolo is the case.
  if (!ok(sol) && onLoops && !hasSupport) {
    hasSupport = true;
    const s2 = solve();
    if (s2.tyre > sol.tyre) sol = s2; else hasSupport = false;
  }
  grp.rotation.z = sol.th;
  grp.position.set(sol.gx, sol.gy, 0);
  grp.userData.noseX = sol.gx;
  grp.userData.clearance = { tyre: Math.round(sol.tyre), stay: Math.round(sol.stay) };

  const toLocal = (pf) => rot2(pf.clone().sub(B.anchor).sub(grp.position), -sol.th).setZ(pf.z);

  // ---- attachment ------------------------------------------------------------------------
  if (B.rails && (onLoops || /R/.test(rec.att || ''))) {
    const lMat = onLoops;
    for (const side of [1, -1]) {
      const bar = side > 0 ? B.rails.right : B.rails.left;
      // where the strap takes the rail: its rear end for loop straps (the
      // loops are behind the rails), a third along for webbing
      const f = onLoops ? 0.06 : 0.3;
      const rp = bar[0].clone().lerp(bar[1], f);
      const lr = toLocal(rp);
      const dirL = rot2(bar[1].clone().sub(bar[0]), -sol.th).setZ(0).normalize();
      const w = lMat ? 16 : 18;
      const wrap = tubeWrap(v3(lr.x, lr.y, side * B.rails.z), dirL, B.railR + 0.6, { width: w, thick: lMat ? 2.4 : 1.5 });
      const zOn = side * Math.min(B.rails.z, W * 0.4);
      const xOn = clamp(lr.x, -D * 0.9, -Math.min(r.ft + 6, D * 0.2));
      const onTop = v3(xOn, lift + (flapped ? 3.2 : 0), zOn);
      const under = v3(lr.x, lr.y - B.railR - 1, side * B.rails.z);
      const geos = [wrap];
      if (under.distanceTo(onTop) > 2) geos.push(strapRun(onTop, under, v3(1, 0, 0), { width: w, thick: lMat ? 2.4 : 1.5 }));
      (lMat ? leatherGeos : webGeos).push(...geos);
      // a Brooks buckles its billets INSIDE the hold, so none shows on top
      if (lMat && !leather) rollerBuckle(v3(xOn - 12, lift + 3.4, zOn), v3(-1, 0, 0), v3(0, 1, 0), w, nickelGeos);
    }
  }
  if (hasSupport && B.rails) {
    // Bagman-style support: a clamp on the rails and a stainless U the bag's
    // front (post-side) panel hangs against.
    const steel = steelMat();
    const rp = B.rails.right[0].clone().lerp(B.rails.right[1], 0.3);
    const cl = toLocal(rp);
    const clampG = new THREE.BoxGeometry(34, 12, B.rails.z * 2 + 14);
    clampG.translate(cl.x, cl.y - B.railR - 5, 0);
    const zs = Math.min(W * 0.3, 80);
    const xF = 7, rb = 16, yBot = -H * 0.72;
    const tubes = [];
    for (const s of [1, -1]) {
      const a0 = v3(cl.x - 8, cl.y - B.railR - 8, s * B.rails.z), a2 = v3(xF, -12, s * zs);
      const a1 = v3((a0.x + a2.x) / 2, (a0.y + a2.y) / 2 - 6, (a0.z + a2.z) / 2);
      tubes.push(tubeAlong([a0, a1, a2], 4, steel, { segments: 20, radialSegments: 8 }));
    }
    const u = [v3(xF, -12, zs), v3(xF, yBot + rb, zs)];
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; u.push(v3(xF, yBot + rb - Math.sin(a) * rb, zs * Math.cos(a) * (i === 0 || i === 8 ? 1 : 0.96))); }
    u.push(v3(xF, yBot + rb, -zs), v3(xF, -12, -zs));
    tubes.push(tubeAlong(u, 4, steel, { segments: 60, radialSegments: 8 }));
    const cm = new THREE.Mesh(clampG, steel);
    for (const t of [...tubes, cm]) { t.userData.noCollide = true; grp.add(t); }
  }
  if (sqr) {
    // Carradice SQR: a block clamped to the seatpost, a tongue into a plate on
    // the bag's post-side face
    const yB = B.anchor.y + grp.position.y - H * 0.18;
    const pc = v3(B.postXAt(yB), yB, 0);
    const pl = toLocal(pc);
    const dirL = rot2(v3(B.sd.x, B.sd.y, 0), -sol.th).normalize();
    const blk = new THREE.MeshStandardMaterial({ color: 0x1d1e20, roughness: 0.55, metalness: 0.1 });
    const parts = [tubeWrap(pl, dirL, B.postR + 1, { width: 34, thick: 6 })];
    const tongue = new THREE.BoxGeometry(Math.max(pl.x - B.postR, 4), 26, 30);
    tongue.translate(Math.max(pl.x - B.postR, 4) / 2, pl.y, 0);
    parts.push(tongue);
    const plate = new THREE.BoxGeometry(5, H * 0.5, 64);
    plate.translate(2.5, -H * 0.3, 0);
    parts.push(plate);
    grp.add(meshOf(parts, blk));
  }
  if (rec.comp) {
    // SQR Slim: one horizontal compression strap round the girth
    const yb = -H * 0.5;
    const band = [];
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      const u = Math.cos(a), w = Math.sin(a);
      const k = Math.pow(Math.abs(u) ** 5 + Math.abs(w) ** 5, 0.2) || 1;
      band.push(v3(-D / 2 + (u / k) * (D / 2), yb, (w / k) * (W / 2)));
    }
    webGeos.push(ribbonLoop(band, v3(0, 1, 0), v3(-D / 2, yb, 0), { width: 22, lift: lift + (flapped ? 4 : 0.5) }));
    hwGeos.push(...buckle(v3(-D - lift - 4, yb, W * 0.2), v3(0, 0, 1), v3(-1, 0, 0), { width: 20 }));
  }

  if (leatherGeos.length) grp.add(meshOf(leatherGeos, billetMat));
  if (nickelGeos.length) grp.add(meshOf(nickelGeos, nickel));
  if (webGeos.length) grp.add(meshOf(webGeos, wm));
  if (hwGeos.length) grp.add(meshOf(hwGeos, hwm));
  return shadowify(grp);
}

// =================================================================================
// ROLL: tool rolls and small dry rolls across the bike
// =================================================================================
function buildRoll({ p, brand, main, accent, ctx, vr, geom, stiff, rec, across, deep, h }) {
  const grp = new THREE.Group();
  const closure = String(p.closure?.type || '').toLowerCase();
  const W = across, D = deep, H = h;
  const rolledEnds = closure === 'rolltop';
  // body: an elliptical section lofted across the bike. A dry roll (Brooks
  // Scape) pinches flat toward its two rolled ends; a tool roll keeps its
  // section to a soft rounded end where the spiral of the wrap shows.
  const N = 32, nz = 26;
  const pos = [], idx = [];
  const zAt = (i) => -W / 2 + (W * i) / (nz - 1);
  const secAt = (z) => {
    const u = Math.abs(z) / (W / 2);
    if (rolledEnds) {
      const k = smooth(0.62, 1, u);
      return { a: (D / 2) * (1 + 0.08 * k), b: (H / 2) * (1 - 0.5 * k) };
    }
    const k = u > 0.9 ? Math.sqrt(Math.max(0, 1 - ((u - 0.9) / 0.1) ** 2)) : 1;
    const s = 0.8 + 0.2 * k;
    return { a: (D / 2) * s, b: (H / 2) * s };
  };
  const flatBottom = geom.crossSection === 'flat_bottom';
  for (let i = 0; i < nz; i++) {
    const z = zAt(i), s = secAt(z);
    for (let j = 0; j < N; j++) {
      const a = (j / N) * Math.PI * 2;
      let y = Math.sin(a) * s.b;
      if (flatBottom && y < 0) y *= 0.55;
      pos.push(Math.cos(a) * s.a, y, z);
    }
  }
  for (let i = 0; i < nz - 1; i++) for (let j = 0; j < N; j++) {
    const a = i * N + j, b = (i + 1) * N + j, c = (i + 1) * N + ((j + 1) % N), d = i * N + ((j + 1) % N);
    idx.push(a, c, b, a, d, c);
  }
  const c0 = pos.length / 3; pos.push(0, 0, zAt(0));
  const c1 = pos.length / 3; pos.push(0, 0, zAt(nz - 1));
  const last = (nz - 1) * N;
  for (let j = 0; j < N; j++) { idx.push(c0, (j + 1) % N, j); idx.push(c1, last + j, last + ((j + 1) % N)); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const amp = clamp(Math.min(D, H) * 0.02, 0.6, 1.8);
  const body = soft(geo, main, { amp, freq: vr.range(0.03, 0.045), seed: vr.seed % 907, stiffness: stiff, aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.84, aoSpan: 0.5 });
  const lift = amp + 1;
  // the roll's centre sits H/2 below its top; group origin = top-front edge
  const cx = -D / 2, cy = -H / 2;
  body.position.set(cx, cy, 0);
  grp.add(body);

  const webGeos = [], hwGeos = [];
  if (!rolledEnds) {
    // the outer edge of the wrapped panel, running the length of the roll
    const a = deg(-35);
    const e = v3(cx + Math.cos(a) * (D / 2 + 0.6), cy + Math.sin(a) * (H / 2 + 0.6), 0);
    const seam = meshOf([strapRun(e.clone().setZ(-W * 0.45), e.clone().setZ(W * 0.45), v3(Math.cos(a), Math.sin(a), 0), { width: 3, thick: 1.6 })], seamMat(main));
    grp.add(seam);
  } else {
    // the rolled ends: a flattened bar of fabric standing across each end
    for (const s of [1, -1]) {
      const sec = secAt(s * W / 2);
      const rr = Math.max(sec.b * 0.7, 4);
      const g = new THREE.CylinderGeometry(rr, rr, D * 0.9, 16);
      g.rotateZ(Math.PI / 2);
      g.scale(1, 1, 0.7);
      g.translate(cx, cy, s * (W / 2 - rr * 0.5));
      grp.add(new THREE.Mesh(g, main));
    }
  }
  // belly strap with its buckle, round the middle
  if (rec.belly) {
    const pts = [];
    for (let j = 0; j < 36; j++) { const a = (j / 36) * Math.PI * 2; pts.push(v3(cx + Math.cos(a) * D / 2, cy + Math.sin(a) * H / 2, 0)); }
    webGeos.push(ribbonLoop(pts, v3(0, 0, 1), v3(cx, cy, 0), { width: 20, lift }));
    hwGeos.push(...buckle(v3(-D - lift - 1, cy, 0), v3(0, -1, 0), v3(-1, 0, 0), { width: 18 }));
  }

  // ---- placement: up against the rails, as far back as they reach -------------------------
  const B = bikeRefs(ctx);
  const topY = B.railBottom - 0.5;
  const gy = topY - B.anchor.y;
  let gx = Math.min(B.railRear.x + D + 4, Infinity);
  for (let k = 0; k <= 8; k++) {
    const fy = topY - (H * k) / 8;
    let lim = B.postXAt(fy) - B.postR - 2;
    if (fy > B.railBottom - 26) lim = Math.min(lim, B.postXAt(fy) - B.postR - B.clampBehind);
    gx = Math.min(gx, lim);
  }
  gx -= B.anchor.x;
  grp.position.set(gx, gy, 0);
  grp.userData.noseX = gx;
  let tyre = Infinity;
  for (let j = 0; j < 24; j++) { const a = (j / 24) * Math.PI * 2; tyre = Math.min(tyre, B.tyreGap(B.anchor.x + gx + cx + Math.cos(a) * D / 2, topY + cy + Math.sin(a) * H / 2)); }
  grp.userData.clearance = { tyre: Math.round(tyre) };
  const toLocal = (pf) => pf.clone().sub(B.anchor).sub(grp.position).setZ(pf.z);

  // straps round the roll and up round each rail
  if (B.rails) {
    for (const side of [1, -1]) {
      const bar = side > 0 ? B.rails.right : B.rails.left;
      const lr = toLocal(bar[0].clone().lerp(bar[1], 0.2));
      const z = side * B.rails.z;
      const xR = clamp(lr.x, -D * 0.85, -D * 0.15);
      const dirL = bar[1].clone().sub(bar[0]).setZ(0).normalize();
      webGeos.push(tubeWrap(v3(lr.x, lr.y, z), dirL, B.railR + 0.6, { width: 18 }));
      if (Math.abs(z) < W / 2 - 10) {
        const pts = [];
        for (let j = 0; j < 36; j++) { const a = (j / 36) * Math.PI * 2; pts.push(v3(cx + Math.cos(a) * D / 2, cy + Math.sin(a) * H / 2, z)); }
        webGeos.push(ribbonLoop(pts, v3(0, 0, 1), v3(cx, cy, z), { width: 18, lift: lift + (rec.belly ? 0.3 : 0) }));
      }
      const under = v3(lr.x, lr.y - B.railR - 1, z), onTop = v3(xR, lift, z);
      if (under.distanceTo(onTop) > 2) webGeos.push(strapRun(onTop, under, v3(1, 0, 0), { width: 18 }));
    }
  }
  if (/P/.test(rec.att || '')) {
    // Brooks Scape: the belly strap drops forward to the seatpost
    const yP = B.anchor.y + gy + cy;
    const pl = toLocal(v3(B.postXAt(yP), yP, 0));
    webGeos.push(tubeWrap(pl, v3(B.sd.x, B.sd.y, 0), B.postR + 0.8, { width: 22 }));
    if (pl.x - B.postR > 1) webGeos.push(strapRun(v3(0, cy, 0), v3(pl.x - B.postR, cy, 0), v3(0, 1, 0), { width: 22 }));
  }
  if (webGeos.length) grp.add(meshOf(webGeos, webbing()));
  if (hwGeos.length) grp.add(meshOf(hwGeos, hardware()));
  // the mark sits on the rear face of the roll
  patch(grp, brand, -D - lift - 0.6, cy + H * 0.05, W * 0.22, clamp(Math.min(W * 0.2, H * 1.6), 30, 60), -Math.PI / 2);
  return shadowify(grp);
}

// =================================================================================
// WEDGE: the seat-pack-like products, seatpack.js's wedge (copied, not imported)
// =================================================================================
function buildWedge({ p, brand, main, accent, ctx, vr, geom, stiff, rec, across, deep, h }) {
  const grp = new THREE.Group();
  const feats = featuresOf(p);
  // Floors lowered from seatpack.js's 160/60/60: the Apidura Tool Pack is 4 cm
  // across and an Ortlieb Micro-Bag 12 cm long, and flooring them inflated
  // both past their published size.
  const len = clamp(deep, 60, 720);
  const D0 = clamp(h, 30, 320);
  const W0 = clamp(across, 30, 300);
  const form = geom.form || 'tapered_wedge';

  const rawClosure = String(p.closure?.type || feats.closure || 'rolltop').toLowerCase();
  const closure = /roll/.test(rawClosure) ? 'rolltop' : 'closed';

  // taper magnitude from the record; the narrow end is always the tail
  const boxy = form === 'box' || form === 'saddlebag_flap';
  const wTail = boxy ? clamp(geom.taperRatio ?? 0.85, 0.7, 0.95) : clamp(geom.taperRatio ?? vr.range(0.3, 0.45), 0.26, 0.9);
  const dTail = boxy ? 0.82 : form === 'teardrop' ? 0.6 : clamp(0.3 + wTail * 0.55, 0.38, 0.72);

  const noseT = Math.min(5, len * 0.04);
  const tailDepth = D0 * dTail;
  const lipH = closure === 'rolltop' ? clamp(tailDepth * 0.62, 10, 60) : 0;
  const rollR = closure === 'rolltop' ? clamp(lipH * 0.5, 6, 24) : 0;
  const tailRes = closure === 'rolltop' ? rollR * 1.7 : 6;
  const bodyLen = Math.max(len - noseT - tailRes, len * 0.5);
  const kick = Math.min(D0 * 0.1, 20);
  const tS = form === 'teardrop' ? 0.16 : 0.08;
  const tLip = closure === 'rolltop' ? 0.9 : 1;
  const shoulder = (t) => 0.72 + 0.28 * Math.sqrt(Math.max(0, 1 - (1 - t / tS) ** 2));
  const Dt = (t) => {
    if (t < tS) return D0 * shoulder(t);
    const s = clamp((t - tS) / (tLip - tS), 0, 1);
    let d = form === 'teardrop' ? D0 * (1 - (1 - dTail) * s ** 1.6)
      : boxy ? D0 * (1 - (1 - dTail) * s ** 1.4) : D0 * (1 - (1 - dTail) * s ** 1.08);
    if (t > tLip) d += (lipH - d) * smooth(tLip, 1, t);
    return d;
  };
  const Wd = (t) => {
    if (t < tS) return W0 * (0.8 + 0.2 * (shoulder(t) - 0.72) / 0.28);
    const s = clamp((t - tS) / (tLip - tS), 0, 1);
    let w = W0 * (1 - (1 - wTail) * s);
    if (t > tLip) w += (w * 1.22 - w) * smooth(tLip, 1, t);
    return w;
  };
  const top = (t) => kick * smooth(0.45, 1, t);
  const sectionAt = (t) => ({ a: Dt(t) / 2, b: Wd(t) / 2, cu: top(t) - Dt(t) / 2 });

  const xs = geom.crossSection === 'round' ? 'round' : geom.crossSection === 'oval' ? 'oval'
    : geom.crossSection === 'flat_bottom' || geom.crossSection === 'd_shape' ? 'flat_bottom' : 'round_belly';
  const loft = loftBody({ len: bodyLen, rings: 32, shape: xs, sectionAt, capEnd: closure !== 'rolltop' });
  const bodyAmp = clamp(D0 * 0.02, 0.6, 3.6);
  const shell = soft(loft.geo, main, {
    amp: bodyAmp, freq: vr.range(0.018, 0.028), seed: vr.seed % 997, stiffness: stiff,
    aoDir: new THREE.Vector3(-1, 0, 0), aoK: 0.82, aoSpan: 0.5,
  });
  const rolled = new THREE.Group();
  rolled.rotation.z = Math.PI / 2;
  rolled.position.x = -noseT;
  rolled.add(shell);
  for (const line of loft.seams) {
    const pts = line.filter((_, i) => i % 2 === 0).map((q) => q.clone());
    if (pts.length > 2) {
      const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.8, 5, false), seamMat(main));
      m.userData.noCollide = true;
      rolled.add(m);
    }
  }
  grp.add(rolled);
  const xOf = (t) => -noseT - t * bodyLen;

  const wm = webbing();
  const hwm = hardware();
  const strapGeos = [], hwGeos = [], leatherGeos = [], nickelGeos = [];
  const unit = sectionUnit(xs).pts;
  const girth = (t, width, out) => {
    const s = sectionAt(t);
    const pts = unit.map(([u, v]) => v3(xOf(t), s.cu + u * s.a, v * s.b));
    out.push(ribbonLoop(pts, v3(1, 0, 0), v3(xOf(t), s.cu, 0), { width, lift: 1.2 + bodyAmp * 0.6 }));
    return s;
  };

  // stiffened nose panel
  {
    const nD = Dt(0) * 0.9, nW = Wd(0) * 0.78;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(noseT + 1.5, nD, nW), accent);
    plate.position.set(-noseT / 2 + 0.5, top(0) - Dt(0) / 2 + 0.5, 0);
    plate.material = accent.clone();
    plate.material.color = accent.color.clone().multiplyScalar(0.6);
    grp.add(plate);
  }
  const nComp = rec.comp ?? feats.compressionStraps ?? 0;
  for (const t of (nComp >= 2 ? [0.42, 0.66] : nComp === 1 ? [0.5] : [])) {
    const s = girth(t, Math.min(20, W0 * 0.5), strapGeos);
    hwGeos.push(...buckle(v3(xOf(t), s.cu + s.a + bodyAmp * 0.6 + 2.4, 0), v3(0, 0, 1), v3(0, 1, 0), { width: Math.min(16, W0 * 0.4) }));
  }
  if (rec.girthLeather) {
    // Isle of Wight: one leather strap across the top two-thirds back, a
    // polished buckle on each side
    const t = 0.62;
    const s = girth(t, 15, leatherGeos);
    for (const side of [1, -1]) rollerBuckle(v3(xOf(t), s.cu + s.a * 0.2, side * (s.b + bodyAmp + 1.6)), v3(0, -1, 0), v3(0, 0, side), 13, nickelGeos);
  }

  // tail
  const tailX = xOf(1);
  const lipC = sectionAt(1).cu;
  if (closure === 'rolltop') {
    const lipW = Wd(1);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(rollR, rollR, lipW, 22, 1), main);
    roll.rotation.x = Math.PI / 2;
    roll.scale.set(1, 1, 0.78);
    roll.position.set(tailX - rollR * 0.78, lipC + rollR * 0.15, 0);
    grp.add(roll);
    for (const dy of [rollR * 0.62, -rollR * 0.5]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, lipW * 0.98), seamMat(main));
      seam.position.set(roll.position.x - rollR * 0.35, roll.position.y + dy, 0);
      seam.userData.noCollide = true;
      grp.add(seam);
    }
    const sx = xOf(0.8), topY = sectionAt(0.8).cu + sectionAt(0.8).a + bodyAmp * 0.6;
    const cx = roll.position.x, cy = roll.position.y, rr = rollR * 0.95 + 1.5;
    const path = [v3(sx, topY + 0.8, 0)];
    for (let i = 0; i <= 10; i++) {
      const a = (Math.PI / 2) - (i / 10) * Math.PI * 1.1;
      path.push(v3(cx - Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8, 0));
    }
    const w = clamp(lipW * 0.28, 12, 25);
    strapGeos.push(ribbonLoop(path, v3(0, 0, 1), v3(cx + rollR * 0.3, cy - rollR * 0.2, 0), { width: w, lift: 0.2, closed: false }));
    hwGeos.push(...buckle(v3((sx + cx) / 2 + 6, topY + 0.8, 0), v3(1, 0, 0), v3(0, 1, 0.05), { width: w }));
  } else {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), main);
    cap.rotation.z = Math.PI / 2;
    cap.scale.set(sectionAt(1).a, Math.min(6, len * 0.04), sectionAt(1).b);
    cap.position.set(tailX, lipC, 0);
    grp.add(cap);
    if (/zip/.test(rawClosure)) {
      // the zip along the flank, nose to tail (Topeak, Blackburn, Lezyne)
      const t0 = 0.12, t1 = 0.92;
      grp.add(zipperRun(
        v3(xOf(t0), sectionAt(t0).cu + sectionAt(t0).a * 0.55, sectionAt(t0).b * 0.8 + bodyAmp),
        v3(xOf(t1), sectionAt(t1).cu + sectionAt(t1).a * 0.55, sectionAt(t1).b * 0.8 + bodyAmp), hwm, { accentMat: accent }));
    }
  }
  if (feats.reflective) {
    for (const s of [1, -1]) {
      const t = 0.8;
      const r = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(26, len * 0.14), 8), new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.25, metalness: 0.2, emissive: 0x222222 }));
      r.position.set(xOf(t), sectionAt(t).cu + sectionAt(t).a * 0.25, s * (sectionAt(t).b + bodyAmp + 0.6));
      if (s < 0) r.rotation.y = Math.PI;
      r.userData.noCollide = true;
      grp.add(r);
    }
  }
  {
    const t = 0.25;
    const z = sectionAt(t).b + bodyAmp + 0.8;
    const w = clamp(len * 0.2, 24, 70);
    patch(grp, brand, xOf(t), sectionAt(t).cu + sectionAt(t).a * 0.1, z, w, 0);
    patch(grp, brand, xOf(t), sectionAt(t).cu + sectionAt(t).a * 0.1, -z, w, Math.PI);
  }

  // ---- placement (seatpack.js's solve) ------------------------------------------------------
  const B = bikeRefs(ctx);
  const front = [0, 0.3, 0.6, 0.9].map((f) => v3(0, top(0) - Dt(0) * f));
  const tops = [], bots = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    tops.push(v3(xOf(t), top(t) + bodyAmp));
    bots.push(v3(xOf(t), top(t) - Dt(t) - bodyAmp));
  }
  bots.push(v3(tailX - rollR * 1.6, lipC - rollR));
  const solve = (th) => {
    let gy = Infinity, gx = 0;
    for (let pass = 0; pass < 3; pass++) {
      gy = Infinity;
      for (const q of tops) {
        const r = rot2(q, th);
        const fx = B.anchor.x + gx + r.x;
        if (!B.rails || fx < B.railRear.x - 4 || fx > B.railFront.x + 4) continue;
        gy = Math.min(gy, B.railYAt(fx) - B.railR - 2 - B.anchor.y - r.y);
      }
      if (!Number.isFinite(gy)) gy = B.railBottom - 2 - B.anchor.y;
      gx = Infinity;
      for (const q of front) {
        const r = rot2(q, th);
        const fy = B.anchor.y + gy + r.y;
        gx = Math.min(gx, B.postXAt(fy) - B.postR - 1.5 - B.anchor.x - r.x);
      }
    }
    let tyre = Infinity;
    for (const q of bots) {
      const r = rot2(q, th);
      tyre = Math.min(tyre, B.tyreGap(B.anchor.x + gx + r.x, B.anchor.y + gy + r.y));
    }
    return { gx, gy, tyre };
  };
  // Small packs ride level under the saddle (the Tool Pack record: sag 0,
  // "hugging the saddle base"); tilt the tail up only when the tyre needs it.
  let th = -deg(clamp(1.5 + vr.j(0.8), 0, 3));
  let sol = solve(th);
  while (sol.tyre < 18 && th > -deg(16)) { th -= deg(1); sol = solve(th); }
  grp.rotation.z = th;
  grp.position.set(sol.gx, sol.gy, 0);
  grp.userData.noseX = grp.position.x;
  grp.userData.clearance = { tyre: Math.round(sol.tyre) };

  const toLocal = (pf) => rot2(pf.clone().sub(B.anchor).sub(grp.position), -th).setZ(pf.z);
  const att = rec.att ?? 'R';
  if (B.rails && /[RL]/.test(att)) {
    for (const side of [1, -1]) {
      const bar = side > 0 ? B.rails.right : B.rails.left;
      const rp = bar[0].clone().lerp(bar[1], 0.3);
      const lr = toLocal(rp);
      const dirL = rot2(bar[1].clone().sub(bar[0]), -th).setZ(0).normalize();
      const w = clamp(W0 * 0.3, 12, 18);
      strapGeos.push(tubeWrap(v3(lr.x, lr.y, side * B.rails.z), dirL, B.railR + 0.6, { width: w }));
      const tBody = clamp((-lr.x - noseT) / bodyLen, 0.02, 0.5);
      const onTop = v3(lr.x, sectionAt(tBody).cu + sectionAt(tBody).a * 0.96 + bodyAmp * 0.6, side * Math.min(B.rails.z, sectionAt(tBody).b * 0.8));
      const railBottom = v3(lr.x, lr.y - B.railR - 1, side * B.rails.z);
      if (railBottom.distanceTo(onTop) > 2) strapGeos.push(strapRun(onTop, railBottom, v3(1, 0, 0), { width: w }));
    }
  }
  if (/P/.test(att)) {
    const postTopY = B.anchor.y + grp.position.y + rot2(v3(0, top(0) - Dt(0) * 0.28), th).y;
    const pc = v3(B.postXAt(postTopY), postTopY, 0);
    const pl = toLocal(pc);
    const dirL = rot2(v3(B.sd.x, B.sd.y, 0), -th).normalize();
    const w = clamp(W0 * 0.45, 14, 25);
    strapGeos.push(tubeWrap(v3(pl.x, pl.y, 0), dirL, B.postR + 0.8, { width: w }));
    if (pl.x - B.postR > 1.5) strapGeos.push(strapRun(v3(0, pl.y, 0), v3(pl.x - B.postR, pl.y, 0), v3(0, 1, 0), { width: w }));
  }
  if (strapGeos.length) grp.add(meshOf(strapGeos, wm));
  if (hwGeos.length) grp.add(meshOf(hwGeos, hwm));
  if (leatherGeos.length) grp.add(meshOf(leatherGeos, leatherMat(0x1e1a18)));
  if (nickelGeos.length) grp.add(meshOf(nickelGeos, nickelMat()));
  return shadowify(grp);
}
