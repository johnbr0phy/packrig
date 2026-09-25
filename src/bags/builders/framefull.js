// Full frame bag builder (mm-local, parented to the framebag anchor).
//
// ---- WHAT IT IS (the owner's words win over every record and trace) --------
// "A full frame bag is a thin flat panel, five to eight centimetres wide, that
// fills the main triangle exactly and follows the tubes." So the outline is
// the main triangle itself — ctx.framePoly offset by each tube's own radius
// (ctx.frameEdgeR) — with its corners eased, not a pack of published size
// parked in one corner. The previous builder drew each bag at its catalogue
// len × hgt anchored at the head tube; on any bag cut for a smaller frame
// (the full kit's Expedition 4.6L among them) that left the rear edge short
// of the seat tube and a ladder of bridging straps across the gap, which is
// the "floating" bag the owner saw.
//
// ---- AXIS MAPPING (BUILDER-BRIEF Rule 2) ------------------------------------
// Every record in this slot writes mount.axes { len: along_toptube (or ±x),
// wid: z, hgt: y (or −y) } — checked across all 50 catalogue products:
//   p.mm.len  the top edge, along the top tube             → frame-derived
//   p.mm.hgt  the rear edge, down the seat tube            → frame-derived
//   p.mm.wid  world z, the panel's thickness               → drawn as published
// len and hgt are therefore the SIZE the maker sells for a frame like this;
// they are reported, not drawn (fit.js greys a bag that is small for the
// triangle). wid is the one dimension that is the bag's own, and the width
// solve below finishes the body at exactly p.mm.wid.
// The previous mapping (len = top edge, hgt = rear edge) was correct as an
// axis mapping; what was wrong was drawing it at that size inside a bigger
// triangle.
//
// ---- PLACEMENT (every value derived from the bike, Rule 1) ------------------
//   outline      ctx.framePoly (tube centrelines: BB, seat-top, head-top,
//                head-bottom) offset inward by frameEdgeR[i] − BITE: the
//                finished edge bites BITE mm into each tube at z = 0, so the
//                panel touches all four tubes and never passes through them.
//   bevel        the extrusion bevel grows the outline by BEVEL_S, so the
//                pre-bevel outline is pulled in by exactly that.
//   BB corner    cut flat square to the corner bisector (the "6–9 cm flat at
//                the bottom bracket" on Apidura's drawings) — clears the BB
//                shell and the crank.
//   corners      eased with a radius from the record's shoulder.
//   straps       a flat velcro band round the tube itself (straps.js tubeWrap
//                on the framePoly edge at frameEdgeR), with two short tabs
//                down onto the panel faces. Counts from the model records.
// Nothing here is an offset measured off a screenshot.
//
// ---- EVIDENCE ---------------------------------------------------------------
// Maker photos are not reachable from this sandbox. Used: data/models/*.json
// (straps with counts and tubes, zips, closure, shoulder, taper — the parts
// apply-models.mjs does not merge are tabulated in FULL_RECORDS below),
// reference/club-*.png, and knowledge of the Apidura Expedition/Backcountry,
// Revelate Ranger/Ripio/Rifter, Ortlieb Frame-Pack (RC), Rockgeist 52Hz,
// Restrap, Oveja Negra Bodega and Wizard Works Forres.

import * as THREE from 'three';
import { v3 } from '../../lib.js';
import { deformScale, shapeBulge } from '../deform.js';
import { addPockets, zipperRun } from '../features.js';
import { TUBE_R, seamStrip } from '../hardware.js';
import { featuresOf, geomOf, stiffnessOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';
import { subdivideXY } from '../panels.js';
import { buckle, meshOf, strapRun, tubeWrap } from '../straps.js';

// Apidura print the Expedition's zip-pull cords, its size tag and the
// Backcountry's chevron graphic in one hi-vis yellow. A product with no accent
// colour of its own falls back to this rather than a black pull on a black bag.
const HIVIS = 0xe8c21e;

/** How far the finished panel edge sits INSIDE each tube's surface at z = 0. */
export const BITE = 1.2;

/**
 * Straps and zips from data/models/<brand>.json. tools/apply-models.mjs does
 * not merge `straps` or `zips` into data/brands.json, so they are tabulated
 * here (generated from the records, 25 Sep): "TDSH zips" — straps round the
 * Top, Down, Seat and Head tubes, then the zip runs in the record's own
 * vocabulary (top_side, top_centre, side_full, perimeter, front_panel).
 * Keyed brand|line|name[|size]; the size-specific key wins.
 */
const FULL_RECORDS = {
  'Apidura|Expedition|Full Frame Pack': '3320 side_full,side_full',
  'Apidura|Backcountry|Full Frame Pack|2.5L': '2320 side_full,side_full',
  'Apidura|Backcountry|Full Frame Pack|4L': '3320 side_full,side_full',
  'Apidura|Backcountry|Full Frame Pack|6L': '3320 side_full,side_full',
  'Ortlieb|Frame-Pack|Frame-Pack': '3210 side_full',
  'Ortlieb|Frame-Pack|Frame-Pack RC': '3210',
  'Revelate Designs|Ranger|Ranger Frame Bag': '3211 top_side,side_full',
  'Revelate Designs|Ripio|Ripio Frame Bag': '3210 top_side,side_full,front_panel',
  'Revelate Designs|Rifter|Rifter Frame Bag': '3210 top_side,side_full',
  'Restrap|Adventure|Full Frame Bag|Small': '2220 top_side,side_full',
  'Restrap|Adventure|Full Frame Bag|Medium': '3220 top_side,side_full',
  'Restrap|Adventure|Full Frame Bag|Large': '3320 top_side,side_full',
  'Wizard Works|Forres|Forres Full Frame Bag': '5000 top_centre,perimeter',
  'Oveja Negra|Bodega|Bodega Full Frame Bag|S': '4221 side_full,side_full',
  'Oveja Negra|Bodega|Bodega Full Frame Bag|M': '4221 side_full,side_full',
  'Oveja Negra|Bodega|Bodega Full Frame Bag|L': '4221 side_full,side_full,side_full',
  'Oveja Negra|Bodega|Bodega Full Frame Bag|XL': '4221 side_full,side_full,side_full',
  'Rockgeist|52Hz|Gravel 52Hz Waterproof Framebag': '2210',
  'Rockgeist|52Hz|Mountain 52Hz Waterproof Framebag': '2210',
  'Rockgeist|52Hz|Trail 52Hz Waterproof Framebag': '2210',
  'Rockgeist|52Hz|Off-Road Tour 52Hz Waterproof Framebag': '2210',
};

/**
 * Look a product up in a records table like FULL_RECORDS. Returns
 * { tt, dt, st, ht, zips[] }, or null where the record is silent.
 */
export function recordOf(table, brand, p) {
  const base = `${brand?.name || ''}|${p.line || ''}|${p.name || ''}`;
  const row = table[`${base}|${p.size || ''}`] ?? table[base];
  if (!row) return null;
  const [n, z = ''] = row.split(' ');
  return {
    tt: +n[0], dt: +n[1], st: +n[2], ht: +n[3],
    zips: z ? z.split(',') : [],
  };
}

export function buildFrameFull(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const geom = geomOf(p);
  const stiff = stiffnessOf(p);
  const rec = recordOf(FULL_RECORDS, brand, p);
  const rounded = geom.shoulder === 'rounded';

  // ---- the triangle, in bag-local mm ----------------------------------------
  const F = frameLocal(ctx);
  const { cl, R } = F;                        // centrelines [BB, seatTop, headTop, headBot]; R[i] on edge i
  // Pre-bevel outline: each tube's surface, pulled in by the bevel and pushed
  // out by the bite. Edge order: 0 seat tube, 1 top tube, 2 head tube, 3 down tube.
  const BEVEL_S = 4;
  const tri = offsetEdges(cl, R.map((r) => r - BITE + BEVEL_S));
  const ttDir = tri[2].clone().sub(tri[1]).normalize();          // seat end → head end
  const upN = edgeOutward(tri, 1);                                // square to the top tube, out
  const rearN = edgeOutward(tri, 0);                              // square to the seat tube, out
  const dtN = edgeOutward(tri, 3);                                // square to the down tube, out

  // BB corner: a flat square to the bisector. Apidura publish 6 cm (4.6L) to
  // 9 cm (Backcountry) across it; the rounded range takes the wider flat.
  const flatW = rounded ? 84 : vr.range(58, 70);
  let poly = cutCorner(tri, 0, flatW);
  // Ease every corner. Seat-top and head corners are where the seat cluster and
  // head tube lugs are; the rounded range (Backcountry, Ortlieb, Rifter) is
  // visibly softer all round.
  const soft1 = rounded ? 1.7 : 1;
  poly = roundCorners(poly, (i, ang) => {
    // tighter corners get a larger radius so the fabric does not go into a
    // lug; ang is the interior angle in radians
    const base = ang < 1.2 ? 20 : ang < 1.9 ? 14 : 9;
    return base * soft1;
  }, rounded ? 6 : 3);

  const local = poly.map((q) => ({ x: q.x, y: q.y }));
  const shape = new THREE.Shape();
  poly.forEach((q, i) => (i === 0 ? shape.moveTo(q.x, q.y) : shape.lineTo(q.x, q.y)));

  // ---- thickness --------------------------------------------------------------
  // The published width is the finished width. Bevel, pillow and noise all push
  // the faces outward, so the extrusion starts narrower by what they add back.
  // "Slight pillow in the middle only": the dome fades to nothing within
  // PILLOW_REACH of every edge, so the panel stays flat where it meets the tubes.
  const wantW = Math.min(Math.max(p.mm.wid, 28), 130);
  const bevelT = Math.min(rounded ? 9 : 6, wantW * 0.14);
  const kDef = deformScale(stiff);
  const noiseAmp = vr.range(1.2, 1.8);
  const PILLOW_REACH = 85;
  const pillow = Math.min(wantW * 0.07, 4.5);
  const bulgeW = shapeBulge(local, 1, [], PILLOW_REACH);
  const peak = Math.max(bulgePeak(local, bulgeW), 0.05);
  // Taper along the top tube from the record (nose = head-tube end, tail =
  // seat-tube end): Revelate thin the Ranger to 55% at the seat tube.
  const tNose = Number.isFinite(p.geometry?.taper?.nose) ? p.geometry.taper.nose : 1;
  const tTail = Number.isFinite(p.geometry?.taper?.tail) ? p.geometry.taper.tail : 1;
  const tMax = Math.max(tNose, tTail, 0.05);
  const xs = local.map((q) => q.x * ttDir.x + q.y * ttDir.y);
  const s0 = Math.min(...xs), s1 = Math.max(...xs);
  const taperAt = (x, y) => {
    const t = Math.min(Math.max(((x * ttDir.x + y * ttDir.y) - s0) / Math.max(s1 - s0, 1), 0), 1);
    return (tTail + (tNose - tTail) * t) / tMax;
  };
  const depth = Math.max(wantW - 2 * bevelT - 2 * pillow * peak * kDef - 0.3 * noiseAmp * kDef, 8);
  const bulgeFn = (x, y) => bulgeW(x, y) * pillow;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevelT, bevelSize: BEVEL_S,
    bevelSegments: rounded ? 5 : 3, curveSegments: 4, steps: 1,
  });
  geo.translate(0, 0, -depth / 2);
  if (tNose !== tTail) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      // scale the core, keep the bevel: the fabric edge stays rounded at the thin end
      const z = pos.getZ(i), core = depth / 2;
      const k = taperAt(pos.getX(i), pos.getY(i));
      const zz = Math.abs(z) <= core ? z * k : Math.sign(z) * (core * k + (Math.abs(z) - core));
      pos.setZ(i, zz);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }
  const faceZ = (x, y, proud = 1.2) => (depth / 2) * taperAt(x, y) + bevelT + bulgeFn(x, y) * kDef + proud;

  // Matte coated fabric, not a clear-coated plastic: brands.json maps Apidura's
  // fabric to a clearcoated laminate while its own aesthetic line reads matte.
  const shell = main.clone();
  shell.roughness = Math.min(1, (main.roughness ?? 0.8) + 0.14);
  shell.clearcoat = 0;
  shell.envMapIntensity = 0.14;
  const body = soft(subdivideXY(geo, 30), shell, {
    amp: noiseAmp, freq: vr.range(0.017, 0.024), seed: vr.seed % 967, flatAxis: 'z',
    stiffness: stiff, bulge: bulgeFn,
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.5,
  });
  grp.add(body);

  // ---- where the finished edges are -------------------------------------------
  // Finished outline = pre-bevel outline grown by BEVEL_S. Every applied part is
  // placed against these lines, so it lands on fabric that is there.
  const fin = offsetEdges(poly, poly.map(() => -BEVEL_S));
  const topLine = { o: tri[1].clone().addScaledVector(upN, BEVEL_S), d: ttDir };
  const drop = Math.max(...local.map((q) => -((q.x - topLine.o.x) * upN.x + (q.y - topLine.o.y) * upN.y)));
  const hiVis = new THREE.MeshStandardMaterial({
    color: accent?.color && main?.color && accent.color.getHex() !== main.color.getHex() ? accent.color.getHex() : HIVIS,
    roughness: 0.5, metalness: 0.05,
  });
  const hwm = hardware();

  // ---- closure and zips ---------------------------------------------------------
  const closure = p.closure?.type || 'zip_straight';
  const zips = rec?.zips?.length ? rec.zips.slice() : closure === 'rolltop' ? [] : ['side_full'];
  const hasTopZip = zips.some((z) => /^top_/.test(z));
  const zipRun = (below, side = 1, trimA = 30, trimB = 30) => {
    // a run parallel to the top edge `below` mm under it, trimmed to the outline
    const o = topLine.o.clone().addScaledVector(upN, -below);
    const s = lineSpan(local, o, ttDir);
    if (!s || s.hi - s.lo < trimA + trimB + 40) return null;
    const a = o.clone().addScaledVector(ttDir, s.lo + trimA);
    const b = o.clone().addScaledVector(ttDir, s.hi - trimB);
    let z = 0;
    for (let i = 0; i <= 12; i++) {
      const q = a.clone().lerp(b, i / 12);
      z = Math.max(z, faceZ(q.x, q.y, 1.0));
    }
    a.z = side * z; b.z = side * z;
    return [a, b];
  };
  const addZip = (run, pull = true) => {
    if (!run) return;
    // the welded slot the coil runs in: a band of shell fabric a shade darker
    const dir = run[1].clone().sub(run[0]);
    const c = run[0].clone().addScaledVector(dir, 0.5);
    const band = seamStrip(main, dir.length() + 14, 12, 2.2);
    band.position.set(c.x, c.y, run[0].z - Math.sign(run[0].z) * 0.6);
    band.rotation.z = Math.atan2(dir.y, dir.x);
    band.userData.noCollide = true;
    grp.add(band);
    grp.add(zipperRun(run[0], run[1], hwm, { accentMat: accent, tape: 3.2 }));
    if (pull) {
      const g = hexPull(hiVis, hwm);
      const at = run[0].clone().lerp(run[1], 0.78);
      g.position.set(at.x, at.y, at.z + Math.sign(at.z) * 1.5);
      grp.add(g);
    }
  };
  // The upper zip sits in the band just under the top tube; Apidura's drawing
  // puts it 38mm below the top edge on the 8L, Revelate's top_side runs right
  // along the top edge.
  const TOP_ZIP = 16;
  let driveSide = 0;             // how many side_full runs already on the drive face
  for (const z of zips) {
    if (z === 'top_side' || z === 'top_centre') {
      addZip(zipRun(TOP_ZIP, 1, 26, 26));
    } else if (z === 'side_full') {
      if (hasTopZip) {
        // Revelate/Restrap: the side_full is the flat full-length pocket on the
        // NON-drive side, about 40% down.
        addZip(zipRun(Math.min(drop * 0.4, 150), -1, 40, 40));
      } else {
        const below = driveSide === 0 ? Math.min(34, drop * 0.14) : driveSide === 1 ? Math.min(drop * 0.42, 155) : Math.min(drop * 0.4, 150);
        addZip(zipRun(below, driveSide < 2 ? 1 : -1, driveSide === 0 ? 28 : 44, driveSide === 0 ? 34 : 30));
        driveSide++;
      }
    } else if (z === 'perimeter') {
      // horseshoe on the drive side: along the top, down the rear edge and
      // along the down-tube edge, 26mm in from the finished outline
      const inset = offsetEdges(fin, fin.map(() => 26));
      const legs = perimeterLegs(inset, ttDir, rearN, dtN);
      legs.forEach((leg, i) => {
        const a = leg[0].clone(), b = leg[1].clone();
        a.z = faceZ(a.x, a.y, 1.0); b.z = faceZ(b.x, b.y, 1.0);
        if (i === 0) addZip([a, b]);
        else grp.add(zipperRun(a, b, hwm, { accentMat: accent, tape: 3.2 }));
      });
    } else if (z === 'front_panel') {
      // a short vertical pocket zip just behind the head tube
      const o = tri[2].clone().addScaledVector(ttDir, -44);
      const s = lineSpan(local, o, v3(-upN.x, -upN.y, 0));
      if (s && s.hi - s.lo > 80) {
        const a = o.clone().addScaledVector(v3(-upN.x, -upN.y, 0), s.lo + 28);
        const b = o.clone().addScaledVector(v3(-upN.x, -upN.y, 0), Math.min(s.hi - 30, s.lo + 28 + 160));
        a.z = faceZ(a.x, a.y, 1.0); b.z = faceZ(b.x, b.y, 1.0);
        grp.add(zipperRun(b, a, hwm, { accentMat: accent, tape: 2.6 }));
      }
    }
  }
  // Two-way closure (Backcountry): the top run turns the corner and drops down
  // the seat-tube edge, 70% of the way.
  if (closure === 'zip_two_way' && !zips.includes('perimeter')) {
    const top = zipRun(Math.min(24, drop * 0.12), 1, 40, 40);
    if (top) {
      const rearDrop = lineSpan(local, top[0], v3(-upN.x, -upN.y, 0));
      const leg = rearDrop ? Math.min(rearDrop.hi * 0.7, 260) : 0;
      if (leg > 40) {
        const b = top[0].clone().addScaledVector(v3(-upN.x, -upN.y, 0), leg);
        b.z = faceZ(b.x, b.y, 1.0);
        grp.add(zipperRun(b, top[0], hwm, { accentMat: accent, tape: 3.2 }));
      }
    }
  }
  if (closure === 'rolltop') {
    // Ortlieb Frame-Pack RC, Rockgeist 52Hz: the opening is the top edge, rolled
    // twice and laid against the drive face under the top tube, held by the
    // top-tube velcro. Drawn as the rolled lip (a flattened roll the length of
    // the opening) with a buckle strap over it at each end.
    const run = zipRun(26, 1, 34, 34);
    if (run) {
      const dir = run[1].clone().sub(run[0]);
      const len = dir.length();
      const rr = Math.min(Math.max(wantW * 0.16, 7), 11);
      const lip = new THREE.Mesh(new THREE.CapsuleGeometry(rr, Math.max(len - 2 * rr, 10), 6, 14), main);
      lip.scale.set(1, 1, 0.62);
      lip.rotation.z = Math.atan2(dir.y, dir.x) - Math.PI / 2;
      const c = run[0].clone().lerp(run[1], 0.5);
      lip.position.set(c.x, c.y, run[0].z + rr * 0.3);
      lip.userData.noCollide = true;
      grp.add(lip);
      const strapGeos = [], hw = [];
      const down = v3(-upN.x, -upN.y, 0);
      for (const f of [0.12, 0.88]) {
        const at = run[0].clone().lerp(run[1], f);
        const top = at.clone().addScaledVector(upN, Math.min(rr + 8, 20));
        const over = at.clone().setZ(at.z + rr * 0.95);
        const bot = at.clone().addScaledVector(down, rr + 30);
        top.z = faceZ(top.x, top.y, 0.2);
        bot.z = faceZ(bot.x, bot.y, 0.2);
        strapGeos.push(strapRun(top, over, v3(0, 0, 1), { width: 18 }));
        strapGeos.push(strapRun(over, bot, v3(0, 0, 1), { width: 18 }));
        const bk = at.clone().addScaledVector(down, rr + 16);
        bk.z = faceZ(bk.x, bk.y, 0.4);
        hw.push(...buckle(bk, down, v3(0, 0, 1), { width: 16 }));
      }
      grp.add(meshOf(strapGeos, webbing()));
      grp.add(meshOf(hw, hwm));
    }
  }

  // ---- panels and graphics --------------------------------------------------------
  if (rounded && /apidura/i.test(brand?.name || '')) {
    // Backcountry: a charcoal centre panel inside a black welded perimeter
    const panelMat = main.clone();
    panelMat.color = main.color.clone().lerp(new THREE.Color(0xffffff), 0.035);
    panelMat.roughness = Math.min(1, (main.roughness ?? 0.8) + 0.14);
    panelMat.clearcoat = 0;
    panelMat.envMapIntensity = 0.14;
    const inner = offsetEdges(fin, fin.map(() => bevelT + 22));
    let low = clipHalfPlane(inner, topLine.o.clone().addScaledVector(upN, -drop * 0.3), upN);
    // held proud of the surface noise, which faceZ() does not include
    if (low.length >= 3) grp.add(facePanel(low, panelMat, (x, y, pr) => faceZ(x, y, pr + noiseAmp * kDef + 0.4)));
  }
  // A point on the face, as fractions along the top edge (0 seat end → 1 head
  // end) and down the fabric that is actually there at that station.
  const onFace = (f, dFrac) => {
    const o = topLine.o.clone().addScaledVector(ttDir, s0 + (s1 - s0) * Math.min(Math.max(f, 0), 1) - (topLine.o.x * ttDir.x + topLine.o.y * ttDir.y));
    const s = lineSpan(local, o, upN);
    if (!s) return o;
    return o.addScaledVector(upN, s.hi - (s.hi - s.lo) * Math.min(Math.max(dFrac, 0.08), 0.92));
  };
  if (feats.reflective && /apidura/i.test(brand?.name || '')) {
    if (rounded) {
      const c = onFace(0.62, 0.3);
      grp.add(chevrons(hiVis, { w: 70, at: c, z: faceZ(c.x, c.y, 1.6), rotZ: Math.atan2(ttDir.y, ttDir.x) + 0.5 }));
    } else {
      const c = onFace(0.14, 0.5);
      grp.add(printTag(hiVis, { w: 58, at: c, z: faceZ(c.x, c.y, 1.4) }));
    }
  }
  addPockets(grp, feats, main, hwm, {
    side: (make, i) => {
      const s2 = i % 2 === 0 ? -1 : 1;           // first pocket on the non-drive side
      const c = onFace(0.45, 0.62);
      const g = make(Math.min(170, (s1 - s0) * 0.34), Math.min(90, drop * 0.28));
      g.position.set(c.x, c.y, s2 * faceZ(c.x, c.y, 0.2));
      g.rotation.z = Math.atan2(ttDir.y, ttDir.x);
      if (s2 < 0) g.rotation.y = Math.PI;
      g.traverse((o) => { o.userData.noCollide = true; });
    },
  });

  // ---- straps ---------------------------------------------------------------------
  // The record's count on each tube, spread along the edge that touches it. A
  // product with no record gets one per ~150mm of top tube (Apidura's spacing)
  // and two on each of the other tubes.
  const ttRun = cl[1].distanceTo(cl[2]);
  const n = {
    tt: rec ? rec.tt : Math.max(2, Math.min(4, Math.round(ttRun / 150))),
    dt: rec ? rec.dt : 2,
    st: rec ? rec.st : 2,
    ht: rec ? rec.ht : 0,
  };
  const strapGeos = [];
  const faceHalf = (q) => faceZ(q.x, q.y, 0.2);
  const spread = (edge, count, lo, hi) => {
    for (let i = 0; i < count; i++) {
      const f = count === 1 ? (lo + hi) / 2 : lo + ((hi - lo) * i) / (count - 1);
      strapGeos.push(...velcroStrap(F, edge, f, faceHalf, { tab: 24 }));
    }
  };
  spread(1, n.tt, 0.14, 0.86);
  spread(3, n.dt, 0.3, 0.8);           // clear of the BB flat and the head lug
  spread(0, n.st, 0.3, 0.72);
  spread(2, n.ht, 0.5, 0.5);
  grp.add(meshOf(strapGeos, webbing()));

  // Brand mark: Apidura's Expedition bee sits high and forward, the
  // Backcountry's small and low at the seat end; everyone else high-centre.
  const patchW = Math.max(46, Math.min(72, (s1 - s0) * 0.14));
  const pc = rounded && /apidura/i.test(brand?.name || '') ? onFace(0.13, 0.84) : onFace(0.72, hasTopZip ? 0.22 : 0.3);
  patch(grp, brand, pc.x, pc.y, faceZ(pc.x, pc.y, 2.2), patchW, 0);
  patch(grp, brand, pc.x, pc.y, -faceZ(pc.x, pc.y, 2.2), patchW, Math.PI);
  return shadowify(grp);
}

// ---- frame geometry, shared with framehalf.js ------------------------------------

/** ctx.framePoly and frameEdgeR in bag-local mm (anchor at the origin, z = 0). */
export function frameLocal(ctx) {
  const a = ctx.anchors.framebag.position;
  const cl = ctx.framePoly.map((q) => v3(q.x - a.x, q.y - a.y, 0));
  const R = ctx.frameEdgeR || [TUBE_R.seatTube, TUBE_R.topTube, 24, TUBE_R.downTube];
  return { cl, R };
}

/** Unit normal of edge i (points[i] → points[i+1]) pointing OUT of the polygon. */
export function edgeOutward(points, i) {
  const n = points.length;
  const a = points[i], b = points[(i + 1) % n];
  const c = points.reduce((s, q) => s.add(q.clone()), new THREE.Vector3()).multiplyScalar(1 / n);
  const d = b.clone().sub(a).normalize();
  const o = v3(-d.y, d.x, 0);
  if (o.dot(c.clone().sub(a)) > 0) o.negate();
  return o;
}

/**
 * Offset each edge along its own inward normal by insets[i] (negative grows
 * the polygon), then re-intersect neighbours. Same construction as panels.js
 * offsetPolyEdges (not exported there).
 */
export function offsetEdges(points, insets) {
  const n = points.length;
  const lines = points.map((p, i) => {
    const q = points[(i + 1) % n];
    const d = q.clone().sub(p).setZ(0).normalize();
    const out = edgeOutward(points, i);
    return { p: p.clone().addScaledVector(out, -(insets[i] ?? 0)), d };
  });
  const res = [];
  for (let i = 0; i < n; i++) {
    const A = lines[(i - 1 + n) % n], B = lines[i];
    const den = A.d.x * B.d.y - A.d.y * B.d.x;
    if (Math.abs(den) < 1e-6) { res.push(B.p.clone()); continue; }
    const t = ((B.p.x - A.p.x) * B.d.y - (B.p.y - A.p.y) * B.d.x) / den;
    res.push(A.p.clone().addScaledVector(A.d, t));
  }
  return res;
}

/** Replace vertex i with a flat `w` wide, square to that corner's bisector. */
function cutCorner(poly, i, w) {
  const n = poly.length;
  const q = poly[i], a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n];
  const da = a.clone().sub(q).normalize(), db = b.clone().sub(q).normalize();
  const half = Math.acos(Math.min(Math.max(da.dot(db), -1), 1)) / 2;
  const along = Math.min(w / 2 / Math.max(Math.sin(half), 0.2), q.distanceTo(a) * 0.4, q.distanceTo(b) * 0.4);
  const out = poly.slice();
  out.splice(i, 1, q.clone().addScaledVector(da, along), q.clone().addScaledVector(db, along));
  return out;
}

/**
 * Ease every corner with a quadratic sweep; radiusAt(i, interiorAngle) picks the
 * radius, capped at 0.45 of the shorter adjacent edge.
 */
export function roundCorners(poly, radiusAt, segs = 4) {
  const n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    const q = poly[i], a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n];
    const da = a.clone().sub(q), db = b.clone().sub(q);
    const ang = Math.acos(Math.min(Math.max(da.clone().normalize().dot(db.clone().normalize()), -1), 1));
    const rr = Math.min(radiusAt(i, ang), da.length() * 0.45, db.length() * 0.45);
    if (rr < 1 || ang > 2.9) { out.push(q.clone()); continue; }
    const s = q.clone().addScaledVector(da.normalize(), rr);
    const e = q.clone().addScaledVector(db.normalize(), rr);
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      out.push(s.clone().multiplyScalar((1 - t) ** 2).addScaledVector(q, 2 * (1 - t) * t).addScaledVector(e, t * t));
    }
  }
  return out;
}

/** Sutherland–Hodgman against one half-plane; keeps the side where (q−p0)·n ≤ 0. */
export function clipHalfPlane(poly, p0, n) {
  const out = [];
  const d = (q) => (q.x - p0.x) * n.x + (q.y - p0.y) * n.y;
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    const dA = d(A), dB = d(B);
    if (dA <= 0) out.push(A.clone());
    if ((dA < 0 && dB > 0) || (dA > 0 && dB < 0)) out.push(A.clone().lerp(B, dA / (dA - dB)));
  }
  return out;
}

/** Where the infinite line o + t·d enters and leaves a polygon, as {lo, hi}. */
export function lineSpan(poly, o, d) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    const den = d.x * ey - d.y * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a.x - o.x) * ey - (a.y - o.y) * ex) / den;
    const u = ((a.x - o.x) * d.y - (a.y - o.y) * d.x) / den;
    if (u < -1e-6 || u > 1 + 1e-6) continue;
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  return hi > lo ? { lo, hi } : null;
}

/** Highest value a unit bulge reaches inside a polygon, by sampling. */
export function bulgePeak(poly, fn, n = 26) {
  const xs = poly.map((q) => q.x), ys = poly.map((q) => q.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let best = 0;
  for (let i = 1; i < n; i++) {
    for (let j = 1; j < n; j++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * j) / n;
      if (insidePoly(poly, x, y)) best = Math.max(best, fn(x, y));
    }
  }
  return best;
}

export function insidePoly(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/**
 * One velcro strap round frame tube `edge` (0 seat, 1 top, 2 head, 3 down) at
 * fraction `f` along its centreline: a flat band hugging the tube (tubeWrap at
 * the tube's own radius) and two short tabs running from the sides of the tube
 * down onto the bag's two faces, which is how the strap reads as holding the
 * bag rather than decorating the tube.
 *
 *   bagAt   optional point on the bag's edge the strap is sewn to; defaults to
 *           the panel edge square below the tube at that station.
 *   faceHalf(q)  half-thickness of the bag at q (to land the tabs ON the faces)
 *   tab     how far the tab runs onto the face past the edge
 *
 * Returns geometries for meshOf(). Nothing here enters the clearance test.
 */
export function velcroStrap(F, edge, f, faceHalf, { tab = 24, width = 20, bagAt = null } = {}) {
  const { cl, R } = F;
  const a = cl[edge], b = cl[(edge + 1) % cl.length];
  const axis = b.clone().sub(a).normalize();
  const r = R[edge];
  const inward = edgeOutward(cl, edge).negate();
  let c = a.clone().lerp(b, f);
  let into = inward.clone();
  let edgePt;
  if (bagAt) {
    // the nearest point on the tube to where the strap is sewn
    const t = Math.min(Math.max(bagAt.clone().sub(a).dot(axis) / a.distanceTo(b), 0.02), 0.98);
    c = a.clone().lerp(b, t);
    const g = bagAt.clone().setZ(0).sub(c);
    if (g.length() > 1) into = g.normalize();
    edgePt = bagAt.clone().setZ(0);
  } else {
    edgePt = c.clone().addScaledVector(inward, r - BITE);
  }
  const geos = [tubeWrap(c, axis, r + 0.3, { width, thick: 1.5, seg: 32 })];
  const Z = v3(0, 0, 1);
  // The tab flares from the side of the tube to the shoulder of the bag (where
  // the face reaches full thickness, a bevel in from the edge), then lies flat
  // on the face.
  const knee = edgePt.clone().addScaledVector(into, 7);
  const land = edgePt.clone().addScaledVector(into, tab);
  const hk = Math.max(faceHalf(knee), r * 0.6);
  const hz = Math.max(faceHalf(land), r * 0.6);
  const seg = (from, to, s) => {
    const d = to.clone().sub(from).normalize();
    const nrm = Z.clone().multiplyScalar(s);
    nrm.addScaledVector(d, -nrm.dot(d)).normalize();
    geos.push(strapRun(from, to, nrm, { width, thick: 1.5 }));
  };
  for (const s of [1, -1]) {
    const from = c.clone().addScaledVector(Z, s * (r + 0.9));
    const k = knee.clone().addScaledVector(Z, s * (hk + 0.4));
    seg(from, k, s);
    if (tab > 9) seg(k, land.clone().addScaledVector(Z, s * (hz + 0.4)), s);
  }
  return geos;
}

/**
 * The three legs of a horseshoe zip on an inset outline: along the top edge,
 * down the rear edge, forward along the down-tube edge. Each leg is the
 * stretch of the outline whose outward normal points most along one of the
 * three directions.
 */
function perimeterLegs(poly, ttDir, rearN, dtN) {
  const n = poly.length;
  const up = v3(-ttDir.y, ttDir.x, 0);
  const pick = (dir) => {
    let best = null, bl = 0;
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      const out = edgeOutward(poly, i);
      if (out.dot(dir) < 0.85) continue;
      const l = a.distanceTo(b);
      if (l > bl) { bl = l; best = [a.clone(), b.clone()]; }
    }
    return best;
  };
  const topUp = up.y > 0 ? up : up.clone().negate();
  return [pick(topUp), pick(rearN), pick(dtN)].filter(Boolean).map((l) => {
    // order each leg rear → front so the slider parks toward the head tube
    return l[0].dot(ttDir) > l[1].dot(ttDir) ? [l[1], l[0]] : l;
  });
}

// ---- applied trim -------------------------------------------------------------

/** A contrasting panel welded onto the drive face, following the pillow. */
function facePanel(poly, mat, faceZ) {
  const shape = new THREE.Shape();
  poly.forEach((q, i) => (i === 0 ? shape.moveTo(q.x, q.y) : shape.lineTo(q.x, q.y)));
  const geo = subdivideXY(new THREE.ShapeGeometry(shape, 6), 30);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, faceZ(pos.getX(i), pos.getY(i), 0.5));
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.userData.noCollide = true;
  return m;
}

/** The pull hanging off a zip slider: a cord loop with a moulded hexagonal grab. */
export function hexPull(cordMat, hwm, { drop = 24 } = {}) {
  const g = new THREE.Group();
  const cord = new THREE.Mesh(new THREE.BoxGeometry(3, drop * 0.8, 1.6), cordMat);
  cord.position.y = -drop * 0.42;
  g.add(cord);
  const grab = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 3.2, 6), hwm);
  grab.rotation.x = Math.PI / 2;
  grab.position.y = -drop;
  g.add(grab);
  g.traverse((o) => { o.userData.noCollide = true; });
  return g;
}

/** The Backcountry's two yellow chevrons, pointing at the head tube. */
function chevrons(mat, { w, at, z, rotZ = 0 }) {
  const g = new THREE.Group();
  const bar = w * 0.62, th = Math.max(5, w * 0.13);
  for (let r = 0; r < 2; r++) {
    for (const s of [1, -1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bar, th, 1.6), mat);
      m.position.set(-r * (th * 2.1) - bar * 0.34, (s * bar) / 4, 0);
      m.rotation.z = (-s * Math.PI) / 5;
      g.add(m);
    }
  }
  g.rotation.z = rotZ;
  g.position.set(at.x, at.y, z);
  g.traverse((o) => { o.userData.noCollide = true; });
  return g;
}

/** The Expedition's printed size tag: small, hi-vis, low at the seat-tube end. */
function printTag(mat, { w, at, z }) {
  const g = new THREE.Group();
  const h = Math.max(3, w * 0.075);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, h, 1.4), mat);
  top.position.set(-w * 0.19, h * 2.1, 0);
  g.add(top);
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.6, 1.4), mat));
  g.position.set(at.x, at.y, z);
  g.traverse((o) => { o.userData.noCollide = true; });
  return g;
}
