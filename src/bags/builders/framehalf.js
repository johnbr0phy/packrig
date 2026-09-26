// Half frame bag builder (mm-local, parented to the framebag anchor).
//
// ---- WHAT IT IS (the owner's words win) -------------------------------------
// "A half frame bag hugs the top tube and leaves the bottles free." It hangs
// from the top tube, may touch the head tube / down tube at its nose or the
// seat tube at its tail, and its lower edge stays up in the triangle so the
// bottle cages below it still work (reference/club-trek-loaded.png: a long
// slim wedge under the top tube, both bidons below it; club-klunker-framebag:
// a trapezoid under the top tube, the seat-tube bottle free beneath).
//
// ---- AXIS MAPPING (BUILDER-BRIEF Rule 2) ------------------------------------
// Checked against mount.axes on all 78 catalogue records. 73 read
// { len: along_toptube (or ±x), wid: z, hgt: y / −y }:
//   p.mm.len → along the top tube (the top edge)
//   p.mm.hgt → the DEEPEST height, square to the top tube, down into the triangle
//   p.mm.wid → world z, the finished thickness
// Exceptions, read from the record rather than guessed:
//   hgt: along_seattube (Swift Giddy Up, Road Runner Wedge, Vincita Strada),
//        the deep face lies on the SEAT tube, so the bag is anchored there and
//        its taper is read deep-at-the-seat-tube (the records' nose=1/tail=0.15
//        is written the other way round from the slot's convention, see below).
//   len: ±y (Atelier Velocidade Avalanche), a seat-tube corner pouch whose
//        long side runs DOWN the seat tube: len and hgt swap.
//   "Corner Bag" (Blackburn), a triangle in the seat-tube/top-tube corner.
//   wid: x (Two Wheel Gear Mamquam, not in the catalogue), a typo for z.
// The previous mapping was the same for the 73; the exceptions were drawn as
// head-tube kites.
//
// ---- TAPER CONVENTION -------------------------------------------------------
// geometry.taper.nose = head-tube end face / hgt, .tail = seat-tube end face /
// hgt (identity.js). Three shapes fall out of the pair:
//   kite         nose < 0.9 and tail < 0.95 (Apidura): shallow at both ends,
//                deepest where the lower-front edge, lying ON the down tube, has
//                got `hgt` deep, the frame supplies the belly position.
//   deep front   nose ≥ 0.9 (Revelate Tangle, Blackburn, Tailfin, Restrap):
//                full depth at the head tube, lower edge rising to the tail.
//   deep rear    tail ≥ 0.95 (Giant H2Pro, Buckhorn, Zefal, the seat-tube wedges)
// The outline is then CLIPPED to the triangle (each tube's surface, frameEdgeR),
// so a deep nose follows the head tube and down tube instead of passing through
// them. That clip is what fixes the −8 to −20 mm seat/down-tube penetrations.
//
// ---- PLACEMENT (every value derived from the bike, Rule 1) ------------------
//   top edge   ctx.framePoly top-tube edge offset by frameEdgeR[1] − BITE
//   nose       against the head tube (the default), or the tail against the
//              seat tube for the seat-tube wedges and corner bags
//   straps     flat velcro bands round the tube (straps.js tubeWrap at the
//              tube's own centreline and radius) with short tabs onto the
//              faces; counts from the model records. A strap to the down, seat
//              or head tube is drawn only where the bag touches that tube or
//              the record's strap can reach it (≤ 100 mm, Revelate's figure for
//              the Tangle), never a ladder across a gap.

import * as THREE from 'three';
import { v3 } from '../../lib.js';
import { deformScale, shapeBulge } from '../deform.js';
import { addPockets, reflectiveStrip, zipperRun } from '../features.js';
import { seamStrip } from '../hardware.js';
import { featuresOf, geomOf, stiffnessOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';
import { crossSpan, subdivideXY } from '../panels.js';
import { buckle, meshOf, strapRun } from '../straps.js';
import {
  BITE, bulgePeak, clipHalfPlane, edgeOutward, frameLocal, lineSpan, offsetEdges,
  recordOf, roundCorners, velcroStrap,
} from './framefull.js';

/**
 * Straps and zips from data/models/<brand>.json (apply-models.mjs does not
 * merge them): "TDSH zips", straps round the Top, Down, Seat, Head tubes,
 * then the zip runs. Generated from the records 25 Sep.
 */
const HALF_RECORDS = {
  'Apidura|Expedition|Frame Pack': '3100 side_full',
  'Apidura|Backcountry|Frame Pack|1L': '2100 side_full',
  'Apidura|Backcountry|Frame Pack|2L': '2200 side_full',
  'Apidura|Racing|Frame Pack|1L': '2100 side_full',
  'Apidura|Racing|Frame Pack|2.4L': '2200 side_full',
  'Apidura|Racing|Frame Pack|4L': '3200 side_full',
  'Apidura|Canyon Collab|Frame Pack|2.4L': '2200 side_full',
  'Apidura|Canyon Collab|Frame Pack|4.5L': '3200 side_full',
  'Apidura|MAAP Collab|Frame Pack|1L': '2100 side_full',
  'Apidura|MAAP Collab|Frame Pack|4L': '3200 side_full',
  'Apidura|Bombtrack Collab|Frame Pack': '2210 side_full',
  'Ortlieb|Frame-Pack|Frame-Pack Toptube': '3210 side_full',
  'Ortlieb|Frame-Pack|Frame-Pack RC Toptube': '3210',
  'Revelate Designs|Tangle|Tangle Frame Bag|XS': '2012 side_full',
  'Revelate Designs|Tangle|Tangle Frame Bag|SM': '2012 side_full',
  'Revelate Designs|Tangle|Tangle Frame Bag|MD': '3012 side_full',
  'Revelate Designs|Tangle|Tangle Frame Bag|LG': '3012 side_full',
  'Revelate Designs|Cranny|Cranny Frame Bag': '2100 horseshoe_top',
  'Revelate Designs|Nook|Nook Frame Bag': '2100 horseshoe_top',
  'Restrap|Adventure|Frame Bag|Small': '2200 top_side',
  'Restrap|Adventure|Frame Bag|Medium': '3210 top_side',
  'Restrap|Adventure|Frame Bag|Large': '3220 top_side',
  'Tailfin|Frame Bags|Half Frame Bag': '3100 top_side',
  'Tailfin|Frame Bags|Wedge Frame Bag|1.9L': '2100 top_side',
  'Tailfin|Frame Bags|Wedge Frame Bag|2.7L': '2100 top_side',
  'Tailfin|Frame Bags|Wedge Frame Bag|3.5L': '3100 top_side',
  'Salsa (EXP Series)||EXP Series Cholla Half-Frame Bag': '1000 top_side',
  'Blackburn Design|Outpost|Frame Bag': '4310 top_centre',
  'Blackburn Design|Outpost|Corner Bag': '0000 perimeter',
  'Blackburn Design|Grid|Grid SL Frame Bag': '3100 top_centre',
  'Topeak|Loader|MidLoader': '3110 side_full,side_full',
  'Topeak|Loader|MidLoader DryBag': '3110 side_full',
  'Swift Industries|Hold Fast|Hold Fast Half Frame Bag': '3100 top_centre',
  'Swift Industries|Giddy Up|Giddy Up Wedge Frame Bag': '3210 top_centre',
  'Road Runner Bags|Wedge|Wedge Half Frame Bag': '3200 top_side',
  'Outer Shell Adventure|Half Frame Bag|Half Frame Bag': '2200 top_centre',
  'Wizard Works|Osyth|Osyth Frame Bag': '2000 top_centre',
  'Oveja Negra|1/2 Pack|1/2 Pack 2.0 Frame Bag': '4111 side_full,side_full',
  'Miss Grape|Internode|Internode 2 Waterproof': '2010 top_side',
  'Miss Grape|Internode|Internode 3 Waterproof': '3010 top_side',
  'Miss Grape|Internode|Internode 4 Waterproof': '4010 top_side',
  'Miss Grape|Internode|Internode 5 Waterproof': '4010 top_side',
  'Miss Grape|Internode|Internode 6 Waterproof': '4002 top_side',
  'EVOC||EVOC Multi Frame Pack WP': '3000 front_panel',
  'Zefal||Zefal Z Frame Pack': '2000 top_side',
  'AGU||AGU Tube Frame Bag Venture (S, 3L)': '4000 top_side',
  'Buckhorn Bags||Buckhorn Halfie Frame Bag': '4000 top_centre',
  'Alpkit|Possum|Possum Frame Bag': '3000 top_side',
  'Alpkit|Glider|Glider Road Frame Bag': '3000 top_side',
  'Green Guru Gear|Upshift|Upshift Frame Bag': '3200 top_side',
  'Vincita|Strada|Strada Bikepacking Frame Bag': '2100 perimeter',
  'Giant|H2Pro|H2Pro Frame Bag': '3100 horseshoe_top',
  'Atelier Velocidade|Avalanche|Avalanche': '0020 top_side',
};

/** How far a strap can reach from the bag to a tube it does not touch (mm). */
const REACH = 100;

/**
 * How far down its tube a bottle may be slid to make room (B-RAD rail). The
 * bike's own adjustBottles() allows 140; the bag is drawn to leave the bottle
 * free at 100 or less, so there is always travel to spare.
 */
const BOTTLE_SLIDE = -100;

export function buildFrameHalf(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const geom = geomOf(p);
  const stiff = stiffnessOf(p);
  const rec = recordOf(HALF_RECORDS, brand, p);
  const axes = p.axes || {};

  // ---- which bag is this ---------------------------------------------------------
  const lenVertical = /^[-+]?y$/.test(String(axes.len || ''));
  const alongST = /seat/.test(String(axes.hgt || ''));
  const corner = /corner/i.test(p.name || '') || lenVertical;
  let len = p.mm.len, hgt = p.mm.hgt;
  if (lenVertical) [len, hgt] = [hgt, len];
  const t = (p.geometry && p.geometry.taper) || {};
  const ok = (v) => (Number.isFinite(v) && v > 0.03 && v <= 1 ? v : null);
  let nose = ok(t.nose) ?? vr.range(0.24, 0.4);
  let tail = ok(t.tail) ?? vr.range(0.52, 0.72);
  // the seat-tube wedges' records put the 1 on the end that is deep, which is
  // the seat-tube end: read it that way round
  if ((alongST || corner) && nose > tail) [nose, tail] = [tail, nose];
  if (corner && !ok(t.nose)) { nose = 0.15; tail = 1; }
  const rearAnchored = alongST || corner || (tail >= 0.95 && nose < 0.8)
    || (rec && rec.st > 0 && rec.dt === 0 && rec.ht === 0);

  // ---- the triangle ----------------------------------------------------------------
  const F = frameLocal(ctx);
  const { cl, R } = F;
  const BEVEL = 5;
  // pre-bevel boundary: every tube's surface, less the bevel, plus the bite
  const tri = offsetEdges(cl, R.map((r) => r - BITE + BEVEL));
  const ttA = tri[1], ttB = tri[2];
  const ttDir = ttB.clone().sub(ttA).normalize();
  const ttLen = ttA.distanceTo(ttB);
  const upN = edgeOutward(tri, 1);
  const down = upN.clone().negate();
  const outs = [0, 1, 2, 3].map((i) => edgeOutward(tri, i));

  // ---- the outline ------------------------------------------------------------------
  // Pre-bevel sizes: the bevel grows every side by BEVEL.
  const run = Math.max(Math.min(len - 2 * BEVEL, ttLen - 4), 60);
  const h = Math.max(Math.min(hgt, 320) - 2 * BEVEL, 30);
  const noseTop = rearAnchored ? ttA.clone().addScaledVector(ttDir, run) : ttB.clone();
  const rearTop = noseTop.clone().addScaledVector(ttDir, -run);
  const at = (s, d) => rearTop.clone().addScaledVector(ttDir, s).addScaledVector(down, d);
  // Depth from the top edge down to the down tube at station s (linear in s).
  const dtDepth = (s) => {
    const q = at(s, 0);
    const den = down.dot(outs[3]);
    return den > 1e-3 ? (tri[3].clone().sub(q).dot(outs[3])) / den : Infinity;
  };
  const faceN = Math.max(nose * h - 2 * BEVEL * (1 - nose), 6);   // end faces take the bevel once
  const faceT = Math.max(tail * h - 2 * BEVEL * (1 - tail), 6);
  let pts;
  if (nose >= 0.9) {
    pts = [at(0, 0), at(run, 0), at(run, h), at(0, faceT)];
  } else if (tail >= 0.95) {
    pts = [at(0, 0), at(run, 0), at(run, faceN), at(0, h)];
  } else {
    // kite: the belly is where the down tube, running back from the nose, has
    // got h deep (Apidura's drawings, reproduced within 5% across the range)
    const d0 = dtDepth(0), d1 = dtDepth(run);
    let sb = Number.isFinite(d0) && Math.abs(d1 - d0) > 1 ? run * (h - d0) / (d1 - d0) : run * 0.6;
    if (Number.isFinite(geom.belly)) sb = run * geom.belly;
    sb = Math.min(Math.max(sb, run * 0.3), run * 0.9);
    pts = [at(0, 0), at(run, 0), at(run, faceN), at(sb, h), at(0, faceT)];
  }
  // Clip to the triangle: seat tube, head tube, down tube. (The top edge is ON
  // the top tube already.)
  for (const i of [0, 2, 3]) pts = clipHalfPlane(pts, tri[i], outs[i]);
  if (pts.length < 3) pts = [at(0, 0), at(run, 0), at(run * 0.5, Math.min(h, 40))];
  // "Leaves the bottles free": the bottom edge stays above each bottle that sits
  // under it, with that bottle slid BOTTLE_SLIDE down its rail. The bottles are
  // the bike's own (ctx.bottleMounts), measured, not assumed. The bike tests a
  // clash box-against-box, so the bag's lowest point has to clear the top of
  // the bottle's box wherever the two overlap fore-aft.
  const floors = bottleFloors(ctx);
  let floorY = -Infinity;
  {
    const xs = pts.map((q) => q.x);
    const x0 = Math.min(...xs) - BEVEL - 30, x1 = Math.max(...xs) + BEVEL + 30;
    for (const f of floors) if (f.x1 > x0 && f.x0 < x1) floorY = Math.max(floorY, f.y);
    if (Number.isFinite(floorY)) {
      const cut = clipHalfPlane(pts, v3(0, floorY + BEVEL + 4, 0), v3(0, -1, 0));
      if (cut.length >= 3) pts = cut;
    }
  }
  const soften = stiff === 'rigid' ? 0.4 : geom.shoulder === 'rounded' ? 1.4 : 0.9;
  const poly = roundCorners(pts, (i, ang) => (ang < 0.8 ? 16 : ang < 1.7 ? 11 : 8) * soften, 4);
  const local = poly.map((q) => ({ x: q.x, y: q.y }));
  const shape = new THREE.Shape();
  poly.forEach((q, i) => (i === 0 ? shape.moveTo(q.x, q.y) : shape.lineTo(q.x, q.y)));
  // the depth actually drawn (after the clip), square to the top edge
  const drawnH = Math.max(...poly.map((q) => q.clone().sub(rearTop).dot(down)));

  // ---- thickness ------------------------------------------------------------------------
  const wantW = Math.min(Math.max(p.mm.wid, 28), 130);
  const bevelT = Math.min(6, wantW * 0.14);
  const k = deformScale(stiff);
  const noiseAmp = vr.range(1.2, 1.8);
  const pillow = Math.min(wantW * 0.08, 5);
  const seamAt = (f) => rearTop.clone().addScaledVector(ttDir, run * f).x;
  const hA = seamAt(0.34) + vr.j(10), hB = seamAt(0.68) + vr.j(10);
  const seams = [{ axis: 'x', at: hA }, { axis: 'x', at: hB }];
  const bulgeW = shapeBulge(local, 1, seams, 44);
  const peak = Math.max(bulgePeak(local, bulgeW), 0.05);
  const depth = Math.max(wantW - 2 * bevelT - 2 * pillow * peak * k - 0.3 * noiseAmp * k, 8);
  const bulgeAt = (x, y) => bulgeW(x, y) * pillow;
  const skin = (x, y, proud = 0) => depth / 2 + bevelT + bulgeAt(x, y) * k + proud;

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevelT, bevelSize: BEVEL,
    bevelSegments: 3, curveSegments: 4, steps: 1,
  });
  geo.translate(0, 0, -depth / 2);
  grp.add(soft(subdivideXY(geo, 28), main, {
    amp: noiseAmp, freq: vr.range(0.018, 0.026), seed: vr.seed % 953, flatAxis: 'z',
    stiffness: stiff, bulge: bulgeAt,
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.5,
  }));

  // ---- closure and zips ---------------------------------------------------------------
  const hwm = hardware();
  const topO = rearTop.clone().addScaledVector(upN, BEVEL);     // finished top edge
  const zipRun = (below, side = 1, trimA = 18, trimB = 18) => {
    const o = topO.clone().addScaledVector(down, below);
    const s = lineSpan(local, o, ttDir);
    if (!s || s.hi - s.lo < trimA + trimB + 30) return null;
    const a = o.clone().addScaledVector(ttDir, s.lo + trimA);
    const b = o.clone().addScaledVector(ttDir, s.hi - trimB);
    let z = 0;
    for (let i = 0; i <= 10; i++) { const q = a.clone().lerp(b, i / 10); z = Math.max(z, skin(q.x, q.y, 1.1)); }
    a.z = side * z; b.z = side * z;
    return [a, b];
  };
  const closure = p.closure?.type || 'zip_straight';
  const zips = rec?.zips?.length ? rec.zips.slice() : closure === 'rolltop' ? [] : ['side_full'];
  const apidura = /apidura/i.test(brand?.name || '');
  let sideCount = 0;
  for (const z of zips) {
    if (z === 'side_full') {
      // one full-length welded zip on the drive side, about a third of the
      // way down; a second runs the non-drive side
      const zr = zipRun(Math.min(drawnH * 0.34, 60), sideCount === 0 ? 1 : -1, 12, 20);
      if (zr) {
        grp.add(zipperRun(zr[0], zr[1], hwm, { accentMat: accent }));
        if (apidura && sideCount === 0) grabTab(grp, hwm, accent, zr[0].clone().lerp(zr[1], 0.78), down, zr[0].z);
      }
      sideCount++;
    } else if (z === 'top_side' || z === 'top_centre') {
      const zr = zipRun(Math.min(13, drawnH * 0.2), 1, 14, 14);
      if (zr) grp.add(zipperRun(zr[0], zr[1], hwm, { accentMat: accent }));
    } else if (z === 'horseshoe_top' || z === 'perimeter') {
      // top run with a leg down each end face
      const zr = zipRun(Math.min(14, drawnH * 0.2), 1, 16, 16);
      if (zr) {
        grp.add(zipperRun(zr[0], zr[1], hwm, { accentMat: accent }));
        for (const e of [zr[0], zr[1]]) {
          const sp = lineSpan(local, e, down);
          const legLen = sp ? Math.min(sp.hi - 18, drawnH * 0.6) : 0;
          if (legLen > 20) {
            const b = e.clone().addScaledVector(down, legLen);
            b.z = skin(b.x, b.y, 1.1);
            grp.add(trackOnly(e, b, accent));
          }
        }
      }
    } else if (z === 'front_panel') {
      const o = topO.clone().addScaledVector(ttDir, run - 30);
      const sp = lineSpan(local, o, down);
      if (sp && sp.hi > 50) {
        const a = o.clone().addScaledVector(down, 14), b = o.clone().addScaledVector(down, sp.hi - 16);
        a.z = skin(a.x, a.y, 1.1); b.z = skin(b.x, b.y, 1.1);
        grp.add(zipperRun(a, b, hwm, { accentMat: accent }));
      }
    }
  }
  if (closure === 'rolltop') {
    // Ortlieb RC Toptube: the top edge rolled twice and laid against the drive
    // face under the tube, a buckle strap over the roll at each end
    const zr = zipRun(Math.min(22, drawnH * 0.3), 1, 22, 22);
    if (zr) {
      const dir = zr[1].clone().sub(zr[0]);
      const rr = Math.min(Math.max(wantW * 0.15, 6.5), 10);
      const lip = new THREE.Mesh(new THREE.CapsuleGeometry(rr, Math.max(dir.length() - 2 * rr, 10), 6, 14), main);
      lip.scale.set(1, 1, 0.62);
      lip.rotation.z = Math.atan2(dir.y, dir.x) - Math.PI / 2;
      const c = zr[0].clone().lerp(zr[1], 0.5);
      lip.position.set(c.x, c.y, zr[0].z + rr * 0.3);
      lip.userData.noCollide = true;
      grp.add(lip);
      const sg = [], hw = [];
      for (const f of [0.12, 0.88]) {
        const q = zr[0].clone().lerp(zr[1], f);
        const top = q.clone().addScaledVector(upN, Math.min(rr + 6, 16));
        const over = q.clone().setZ(q.z + rr * 0.95);
        const bot = q.clone().addScaledVector(down, rr + 26);
        top.z = skin(top.x, top.y, 0.2); bot.z = skin(bot.x, bot.y, 0.2);
        sg.push(strapRun(top, over, v3(0, 0, 1), { width: 16 }), strapRun(over, bot, v3(0, 0, 1), { width: 16 }));
        const bk = q.clone().addScaledVector(down, rr + 14);
        bk.z = skin(bk.x, bk.y, 0.4);
        hw.push(...buckle(bk, down, v3(0, 0, 1), { width: 14 }));
      }
      grp.add(meshOf(sg, webbing()));
      grp.add(meshOf(hw, hwm));
    }
  }

  // ---- seams, graphics, pockets -------------------------------------------------------------
  for (const s of [1, -1]) {
    for (const sx of [hA, hB]) {
      const v = crossSpan(local, sx, 'x');
      if (!v || v.hi - v.lo < 30) continue;
      const sm = seamStrip(main, 2.4, v.hi - v.lo - 14, 2.2);
      const my = (v.lo + v.hi) / 2;
      sm.position.set(sx, my, s * skin(sx, my, 0.4));
      sm.userData.noCollide = true;
      grp.add(sm);
    }
  }
  const mid = poly.reduce((a, q) => a.add(q.clone()), new THREE.Vector3()).multiplyScalar(1 / poly.length);
  if (feats.reflective) {
    const rp = rearTop.clone().addScaledVector(ttDir, run * 0.42).addScaledVector(down, drawnH * 0.62);
    if (lineSpan(local, rp, ttDir)) {
      for (const s of [1, -1]) {
        const rs = reflectiveStrip(Math.min(run * 0.3, 120), 8);
        rs.position.set(rp.x, rp.y, s * skin(rp.x, rp.y, 0.8));
        rs.rotation.z = Math.atan2(ttDir.y, ttDir.x);
        rs.traverse((o) => { o.userData.noCollide = true; });
        grp.add(rs);
      }
    }
  }
  addPockets(grp, feats, main, hwm, {
    side: (make, i) => {
      const s2 = i % 2 === 0 ? -1 : 1;
      const g = make(Math.min(run * 0.5, 150), Math.min(drawnH * 0.45, 70));
      g.position.set(mid.x, mid.y, s2 * skin(mid.x, mid.y, 0.2));
      g.rotation.z = Math.atan2(ttDir.y, ttDir.x);
      if (s2 < 0) g.rotation.y = Math.PI;
      g.traverse((o) => { o.userData.noCollide = true; });
    },
  });

  // ---- straps ---------------------------------------------------------------------------------
  const nTT = rec ? rec.tt : run < 360 ? 2 : 3;
  const counts = {
    tt: corner && rec && rec.tt + rec.dt + rec.st + rec.ht === 0 ? 2 : nTT,
    dt: rec ? rec.dt : 1,
    st: rec ? rec.st : corner ? 1 : 0,
    ht: rec ? rec.ht : stiff === 'rigid' ? 3 : 0,
  };
  if (corner && rec && rec.tt + rec.dt + rec.st + rec.ht === 0) counts.st = 1;
  const fin = offsetEdges(poly, poly.map(() => -BEVEL));        // the finished outline
  const faceHalf = (q) => skin(q.x, q.y, 0.2);
  const geos = [];
  // top tube: spread along the bag's own top edge
  for (let i = 0; i < counts.tt; i++) {
    const f = counts.tt === 1 ? 0.5 : 0.1 + (0.8 * i) / (counts.tt - 1);
    geos.push(...velcroStrap(F, 1, 0, faceHalf, { tab: 20, bagAt: topO.clone().addScaledVector(ttDir, run * f) }));
  }
  // down, seat and head tubes: at the stretch of the outline that touches the
  // tube, or, for a strap the record gives a reach, from the nearest point
  for (const [edge, n] of [[3, counts.dt], [0, counts.st], [2, counts.ht]]) {
    if (!n) continue;
    const c = contactOn(fin, cl, R, edge);
    if (!c) continue;
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0.5 : 0.2 + (0.6 * i) / (n - 1);
      const bagAt = c.a.clone().lerp(c.b, f);
      // a band round the down tube below the bottle floor would put the strap
      // in the bottle's way; slide it up the contact, or leave it off
      if (edge !== 1 && Number.isFinite(floorY)) {
        const t = cl[edge], u = cl[(edge + 1) % cl.length];
        const dir = u.clone().sub(t).normalize();
        const cy = t.y + dir.y * bagAt.clone().sub(t).dot(dir);
        if (cy - R[edge] - 2 < floorY) continue;
      }
      geos.push(...velcroStrap(F, edge, 0, faceHalf, { tab: 18, bagAt, width: edge === 2 && stiff === 'rigid' ? 6 : 20 }));
    }
  }
  grp.add(meshOf(geos, webbing()));

  // Brand mark high and forward, above the zip
  const patchW = Math.max(36, Math.min(56, run * 0.16, drawnH * 0.36));
  const lp = rearTop.clone().addScaledVector(ttDir, run * (rearAnchored ? 0.3 : 0.72)).addScaledVector(down, Math.min(drawnH * 0.2, 28) + BEVEL);
  if (lineSpan(local, lp, ttDir)) {
    const pz = skin(lp.x, lp.y, 1.4);
    patch(grp, brand, lp.x, lp.y, pz, patchW, 0);
    patch(grp, brand, lp.x, lp.y, -pz, patchW, Math.PI);
  }
  return shadowify(grp);
}

/**
 * The stretch of the finished outline that touches frame tube `edge`, as
 * {a, b} end points; or, where nothing touches, the single nearest point if a
 * strap can reach it (REACH); else null.
 */
function contactOn(fin, cl, R, edge) {
  const a = cl[edge], b = cl[(edge + 1) % cl.length];
  const dir = b.clone().sub(a);
  const L = dir.length();
  dir.normalize();
  const r = R[edge];
  const gapOf = (q) => {
    const t = Math.min(Math.max(q.clone().sub(a).dot(dir), 0), L);
    return q.distanceTo(a.clone().addScaledVector(dir, t)) - r;
  };
  let best = null, bestGap = Infinity;
  const touching = [];
  for (const q of fin) {
    const g = gapOf(q);
    if (g < 3) touching.push(q);
    if (g < bestGap) { bestGap = g; best = q; }
  }
  if (touching.length) {
    const proj = touching.map((q) => [q.clone().sub(a).dot(dir), q]).sort((x, y) => x[0] - y[0]);
    return { a: proj[0][1].clone(), b: proj[proj.length - 1][1].clone() };
  }
  if (best && bestGap <= REACH) return { a: best.clone(), b: best.clone() };
  return null;
}

/**
 * Each bottle's box, in bag-local mm, with the bottle slid BOTTLE_SLIDE down
 * its tube: [{x0, x1, y}] where y is the top of the box. Read off the bike's
 * own bottle meshes (ctx.bottleMounts), so a different frame size or cage
 * position moves the floor with it. Empty when the bike has no bottles.
 */
const _floorCache = new WeakMap();
function bottleFloors(ctx) {
  const mounts = ctx.bottleMounts;
  if (!mounts) return [];
  if (_floorCache.has(mounts)) return _floorCache.get(mounts);
  const a = ctx.anchors.framebag.position;
  const out = [];
  for (const m of Object.values(mounts)) {
    const g = m.group;
    if (!g || !m.base || !m.dir) continue;
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    const box = new THREE.Box3();
    g.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)));
    });
    if (box.isEmpty()) continue;
    const at = m.base.clone().addScaledVector(m.dir, BOTTLE_SLIDE);
    box.applyMatrix4(new THREE.Matrix4().compose(at, g.quaternion, g.scale));
    out.push({ x0: box.min.x - a.x, x1: box.max.x - a.x, y: box.max.y - a.y });
  }
  _floorCache.set(mounts, out);
  return out;
}

/** A zip track without its own slider, the legs of a horseshoe. */
function trackOnly(a, b, accent) {
  const dir = b.clone().sub(a);
  const g = new THREE.Mesh(new THREE.BoxGeometry(dir.length(), 3.4, 1.6), accent || webbing());
  g.position.copy(a).addScaledVector(dir, 0.5);
  g.rotation.z = Math.atan2(dir.y, dir.x);
  g.userData.noCollide = true;
  return g;
}

/** Apidura's moulded hexagonal grab tab and cord, hanging off the zip slider. */
function grabTab(grp, hwm, accent, at, down, z) {
  const tab = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 3.2, 6), hwm);
  tab.rotation.x = Math.PI / 2;
  tab.rotation.z = Math.atan2(down.y, down.x) + Math.PI / 2;
  tab.position.copy(at).addScaledVector(down, 12).setZ(z + 1.6);
  const cord = new THREE.Mesh(new THREE.BoxGeometry(3, 12, 1.6), accent);
  cord.position.copy(at).addScaledVector(down, 22).setZ(z + 1.6);
  cord.rotation.z = Math.atan2(down.y, down.x) + Math.PI / 2;
  for (const o of [tab, cord]) { o.userData.noCollide = true; grp.add(o); }
}
