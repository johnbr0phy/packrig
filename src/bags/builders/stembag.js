// Stem bag builder (mm-local, parented to the stemL / stemR anchors).
//
// ---- AXIS MAPPING (BUILDER-BRIEF Rule 2) ----------------------------------
// The stemL / stemR anchors are unrotated children of the frame group
// (bike.js anchor() passes ry = 0), so bag-local axes ARE frame axes:
//   +x FORWARD, +y UP, ±z ACROSS (`side` = +1 for stemR, −1 for stemL)
// Catalogue axes are per PRODUCT in this slot, not per slot: Apidura's Stem
// Pack writes len→x wid→z, the Backcountry pouches len→z wid→x, Swift's Gibby
// len→−y wid→+x hgt→z. So each of len/wid/hgt is claimed by the first world
// axis its own `mount.axes` names (hgt, len, wid in that order); anything the
// record leaves unsaid falls back to hgt = drop, len = across, wid = fore-aft,
// with the published `dia` standing in where that would reuse a dimension:
//   drop    → local −y   the closed height, collar or lid included
//   across  → local  z
//   depth   → local  x
// That per-product mapping was already right before this rework; the body was
// the fault.
//
// ---- WHAT IT IS (owner) -----------------------------------------------------
// Wrong before: "Stem bags come out as upright boxes with lids, like
// lunchboxes, when they should be soft cylinders with a drawcord top and mesh
// pockets. They also collide with the top tube bag and with each other."
//   body      a soft upright cylinder: a superellipse section (round / oval /
//             D flat INBOARD against the stem / flat back, from the record's
//             crossSection), a barrel that slumps a little below its middle and
//             rounds under at the base — no box, no crease, no lid slab
//   top       drawcord (33 of 38 records): a gathered collar of a second tone,
//             cinched to a puckered mouth, with a cord round it and a toggle
//             cord-lock hanging on the outboard front. Flap records (Apidura
//             Stem Pack, Wizard Works Voila) get a soft domed fold-over lid with
//             its strap and buckle; roll-tops (Road Runner Auto-Pilot, Rockgeist
//             Honeybox) a pinched lip rolled across the top
//   pockets   mesh pockets that stand proud of the body at their elastic mouths
//             and change the outline: from the record where it names them,
//             none where it says "single main compartment", and outboard +
//             front where it says nothing (the owner's description of the class)
//   straps    straps.js ribbons only: loops round the bar, one round the stem,
//             one down to the head tube / fork crown
//
// ---- PLACEMENT (derived from the bike, Rule 1) ----------------------------------
//   mouth     at bar-centre height (points.barCenter), front face 1 mm behind
//             the back of the bar
//   across    the inboard face frameEdgeR[2] + 16 mm off the centre plane —
//             clear of the headset cups (frameEdgeR[2] + 2.5), and of the top
//             tube bag's nose, which sits between the two stem bags
//   straps    stem loop on points.steererTop → barCenter, head loop on
//             points.headTop → headBottom, bar loops on the bar; the L and R
//             bags take different stations on the stem and head tube so their
//             straps never sit on top of each other. All re-aimed by
//             userData.reseat if the resolver moves the bag.
// The one literal is BAR_R: bike.js draws the bar tops at r = 11.9 and ctx
// does not publish it.

import * as THREE from 'three';
import { v3, tubeAlong } from '../../lib.js';
import { cordMat, meshPanelMat, reflectiveStrip } from '../features.js';
import { axesOf, featuresOf, geomOf, stiffnessOf, variantOf } from '../identity.js';
import { deformScale } from '../deform.js';
import { fabricMaterial, hardware, patch, seamMat, shadowify, soft, webbing } from '../materials.js';
import { buckle, meshOf, ribbonLoop, strapRun } from '../straps.js';

const BAR_R = 12;
const SKIN = 1.2;          // the soft pass's reach outside the drawn section
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const se = (c, n) => Math.sign(c) * Math.abs(c) ** (2 / n);

const brandAccent = (brand) => (Array.isArray(brand?.palette) && brand.palette.length > 3 ? brand.palette[3] : null);

/**
 * Closed loft of M-point rings with fan caps at both ends; `pt(i, j)` → [x,y,z].
 * Winding fixed by signed volume.
 */
function ringLoft(N, M, pt, uvOf, { capStart = true, capEnd = true } = {}) {
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
  if (capStart) cap(0, true);
  if (capEnd) cap(N, false);
  // orientation from the side wall alone (caps may be missing): outward = away
  // from the ring centroid
  let score = 0;
  for (let i = 0; i < N; i += Math.max(1, N >> 3)) {
    let cx = 0, cz = 0;
    for (let j = 0; j < M; j++) { cx += pos[at(i, j) * 3]; cz += pos[at(i, j) * 3 + 2]; }
    cx /= M; cz /= M;
    for (let j = 0; j < M; j += 4) {
      const a = at(i, j) * 3, b = at(i, j + 1) * 3, c = at(i + 1, j + 1) * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const wx = pos[c] - pos[a], wy = pos[c + 1] - pos[a + 1], wz = pos[c + 2] - pos[a + 2];
      const nx = uy * wz - uz * wy, nz = ux * wy - uy * wx;
      score += nx * (pos[a] - cx) + nz * (pos[a + 2] - cz);
    }
  }
  if (score < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, at };
}

/** Racetrack strap: round the far side of a tube, back along both sides to a face. */
function tubeLoop(C, A, faceP, rT, half, width = 20) {
  const toFace = faceP.clone().sub(C);
  const u = toFace.clone().addScaledVector(A, -toFace.dot(A));
  const d = u.length();
  if (d < rT + 1) return null;
  u.normalize();
  const along = toFace.dot(A);               // the face may sit above/below the wrap
  const vv = new THREE.Vector3().crossVectors(A, u).normalize();
  const pts = [];
  for (let q = 0; q <= 16; q++) {
    const th = -Math.PI / 2 + (Math.PI * q) / 16;
    pts.push(C.clone().addScaledVector(u, -Math.cos(th) * rT).addScaledVector(vv, Math.sin(th) * rT));
  }
  const at = (f, s) => C.clone().addScaledVector(u, d * f).addScaledVector(A, along * f).addScaledVector(vv, s);
  pts.push(at(0.5, (rT + half) / 2), at(1, half), at(1, -half), at(0.5, -(rT + half) / 2));
  return ribbonLoop(pts, A, at(0.5, 0), { width, lift: 0.3, thick: 1.6 });
}

export function buildStembag(p, brand, main, accent, ctx, side = 1) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const stiff = stiffnessOf(p);
  const K = deformScale(stiff);
  const geom = geomOf(p);
  const ax = axesOf(p);
  const ft = (p && p.features) || {};

  // ---- which catalogue dimension runs along which world axis -----------------
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
  const noiseAmp = vr.range(1.1, 1.6);
  const bulge = 0.05 * K;                    // the barrel's slump below its middle
  const halfZ = Math.max((Math.min(across, 150) / 2 - SKIN - noiseAmp * 0.5 * K) / (1 + bulge), 12);
  const mouthHX = Math.max((Math.min(depth, 150) / 2 - SKIN - noiseAmp * 0.5 * K) / (1 + bulge), 10);

  // ---- closure, measured out of the published height ------------------------------
  const closure = String(p?.closure?.type || feats.closure || '').toLowerCase();
  const isFlap = /flap/.test(closure);
  const isRoll = /roll/.test(closure);
  const collarH = isFlap ? 0 : isRoll ? clamp(h * 0.12, 14, 24) : clamp(h * 0.2, 20, h * 0.3);
  const lidH = isFlap ? clamp(Math.min(mouthHX, halfZ) * 0.45, 10, 20) : 0;
  const rollR = isRoll ? clamp(Math.min(mouthHX, halfZ) * 0.22, 6, 10) : 0;
  const bh = h - collarH - lidH - rollR * 2 * 0.8;          // the body, mouth at y = 0

  // ---- section ----------------------------------------------------------------------
  // Quadrant exponents: 2 is a circle, 5 a flat panel with a round corner.
  // d_shape → flat INBOARD (the face against the stem); flat_back → flat at
  // the rear; rounded_rect → a soft square; round / oval → round.
  const xs = String(geom.crossSection || (geom.form === 'cylinder' ? 'round' : 'rounded_rect'));
  const nRound = xs === 'rounded_rect' ? 3.2 : 2.1;
  const nFlat = 5;
  const quadN = (front, inboard) => {
    if (xs === 'd_shape' && inboard) return nFlat;
    if (xs === 'flat_back' && !front) return nFlat;
    return nRound + (stiff === 'rigid' ? 1 : 0);
  };
  /** unit section point for angle th (0 = +x front, +π/2 = outboard) */
  const secUnit = (th) => {
    const c = Math.cos(th), s = Math.sin(th);
    const n = quadN(c >= 0, s < 0);
    return [se(c, n), se(s, n) * side];        // z already turned to this bag's side
  };

  // ---- taper: the knee chamfer ------------------------------------------------------
  // A taper in the record ("tapered to clear the knee") comes off the lower
  // REAR only: the front face is what the bar and the strap hold.
  const taper = clamp(geom.taperRatio ?? 1, 0.55, 1);
  const tCham = taper < 0.98 ? clamp(1 - ((1 - taper) * mouthHX * 2 * 1.73) / bh, 0.35, 0.9) : 0;
  const kRear = (t) => (t >= tCham ? 1 : taper + (1 - taper) * (t / Math.max(tCham, 1e-3)));

  // ---- body -------------------------------------------------------------------------
  const N = 40, M = 48;
  const rB = Math.min(mouthHX, halfZ) * 0.42;                // the rounded base edge
  const yOf = (i) => {                                         // denser near the base
    const f = i / N;
    return -bh + bh * (f < 0.3 ? 0.3 * (1 - Math.cos((Math.PI / 2) * (f / 0.3))) : f);
  };
  const bodyPt = (i, j) => {
    const y = yOf(i);
    const t = (y + bh) / bh;                                   // 0 base → 1 mouth
    const th = (2 * Math.PI * j) / M;
    const [ux, uz] = secUnit(th);
    const barrel = 1 + bulge * Math.sin(Math.PI * clamp(t * 1.15, 0, 1)) - 0.02 * smooth(0.85, 1, t);
    let r = 1;
    const hb = y + bh;
    if (hb < rB) r = 0.18 + 0.82 * Math.sqrt(Math.max(1 - ((rB - hb) / rB) ** 2, 0));
    const kx = ux < 0 ? kRear(t) : 1;
    return [mouthHX * ux * kx * barrel * r, y, halfZ * uz * barrel * r];
  };
  const loft = ringLoft(N, M, bodyPt, (i, j) => [j / M * (mouthHX + halfZ) * 6.3 / 150, (yOf(i) + bh) / 150], { capEnd: true });

  // two-tone: a body panel and a darker (or authored accent) harness/trim
  const oneTone = main.color.getHex() === accent.color.getHex();
  const tone = (k, target, from = main.color) => fabricMaterial(brand.fabricKey, from.clone().lerp(new THREE.Color(target), k));
  const midHex = brand?.palette?.[2] ?? 0x8f9295;
  const trimMat = oneTone ? tone(0.3, 0x000000) : accent;
  // the gathered collar is usually the same cloth, a shade lighter where it is
  // a lighter-weight fabric; only a nudge toward the brand's mid tone
  const collarMat = oneTone ? tone(0.2, midHex) : tone(0.3, 0xd6d9db, accent.color);

  const body = soft(loft.geo, main, {
    amp: noiseAmp, freq: vr.range(0.04, 0.052), seed: vr.seed % 929, stiffness: stiff,
    aoDir: v3(0, -1, 0), aoK: 0.8, aoSpan: 0.5,
  });
  grp.add(body);
  const bpos = loft.geo.attributes.position, bnor = loft.geo.attributes.normal;
  const surf = (i, j, lift = 0) => {
    const k = loft.at(i, j);
    return v3(bpos.getX(k) + bnor.getX(k) * lift, bpos.getY(k) + bnor.getY(k) * lift, bpos.getZ(k) + bnor.getZ(k) * lift);
  };
  const ringAtY = (y) => { let b = 0, bd = Infinity; for (let i = 0; i <= N; i++) { const d = Math.abs(yOf(i) - y); if (d < bd) { bd = d; b = i; } } return b; };
  /** angle index of a direction: 0 front, M/4 outboard, M/2 rear, 3M/4 inboard */
  const jDir = (name) => ({ front: 0, out: M / 4, rear: M / 2, in: (3 * M) / 4 })[name];

  const wm = webbing();
  const hwm = hardware();
  const cordHex = brandAccent(brand);
  const cordHi = cordHex != null ? new THREE.MeshStandardMaterial({ color: new THREE.Color(cordHex), roughness: 0.45 }) : cordMat();
  const noCol = (m) => { m.userData.noCollide = true; return m; };
  const strapGeos = [], hwGeos = [], seamGeos = [];

  // the base seam and the mouth hem: the welds that say "sewn pouch"
  for (const y of [-bh + rB * 0.9, -2]) {
    const i = ringAtY(y);
    const pts = [];
    for (let j = 0; j < M; j += 2) pts.push(surf(i, j, 0.5));
    seamGeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 64, y > -3 ? 1.5 : 1, 5, true));
  }

  // ---- closure ----------------------------------------------------------------------
  /** the mouth ring's own section at scale k and height y (for collar / lid lofts) */
  const mouthPt = (k, y, th, lift = 0) => {
    const [ux, uz] = secUnit(th);
    return [(mouthHX * 0.98 + lift) * ux * k, y, (halfZ * 0.98 + lift) * uz * k];
  };
  if (!isFlap && !isRoll) {
    // DRAWCORD. A gathered collar in the second tone, cinched to a puckered
    // mouth: rises to collarH, then dips back in to the gathered hole.
    const NC = 16;
    const cy = (i) => { const f = i / NC; return f < 0.78 ? collarH * (f / 0.78) : collarH * (1 - 0.18 * ((f - 0.78) / 0.22)); };
    const ck = (i) => { const f = i / NC; return f < 0.78 ? 1 - 0.4 * (f / 0.78) ** 1.3 : 0.6 - 0.42 * ((f - 0.78) / 0.22); };
    const collar = ringLoft(NC, M, (i, j) => mouthPt(ck(i), cy(i) - 1, (2 * Math.PI * j) / M), (i, j) => [j / M * 4, i / NC], { capStart: false });
    const cm = soft(collar.geo, collarMat, { amp: 2.2, freq: 0.16, seed: (vr.seed % 617) + 11, aoDir: v3(0, -1, 0), aoK: 0.86, aoSpan: 0.7 });
    grp.add(cm);
    // the cord in its channel, near the top of the collar
    const cordY = collarH * 0.8;
    const ring = [];
    for (let j = 0; j < 32; j++) { const q = mouthPt(0.63, cordY, (2 * Math.PI * j) / 32, 2.4); ring.push(v3(...q)); }
    grp.add(noCol(tubeAlong(ring, 1.5, cordMat(), { closed: true, segments: 64, radialSegments: 5 })));
    // the toggle: two cord tails out of the channel, through a barrel lock
    // hanging on the outboard-front of the collar, and a coloured pull
    // (secUnit already turns +θ outboard on either side)
    const exitTh = Math.PI * 0.28;
    const e = v3(...mouthPt(0.66, cordY, exitTh, 2.6));
    const out = v3(Math.cos(exitTh) * 0.6, 0, side * Math.sin(exitTh) * 0.8).normalize();
    const lock = e.clone().addScaledVector(out, 7).add(v3(0, -16, 0));
    grp.add(noCol(tubeAlong([e, e.clone().addScaledVector(out, 5).add(v3(0, -5, 0)), lock], 1.3, cordMat(), { segments: 12, radialSegments: 5 })));
    const toggle = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.2, 14, 12), hwm);
    toggle.position.copy(lock);
    grp.add(noCol(toggle));
    const pull = new THREE.Mesh(new THREE.TorusGeometry(5.5, 1.6, 5, 16), cordHi);
    pull.position.copy(lock).add(v3(0, -13, 0));
    pull.lookAt(pull.position.clone().add(out));
    grp.add(noCol(pull));
  }
  if (isFlap) {
    // A soft fold-over lid: a dome over the mouth in the trim tone, its skirt
    // dropping over the top of the outboard face, a strap down to a buckle.
    const NL = 10;
    const lid = ringLoft(NL, M, (i, j) => {
      const f = i / NL;
      const k = Math.sqrt(Math.max(1 - f * f, 0)) * 1.04 + 0.02;
      return mouthPt(k, -3 + lidH * f, (2 * Math.PI * j) / M, 1.6);
    }, (i, j) => [j / M * 4, i / NL], { capStart: false });
    grp.add(soft(lid.geo, trimMat, { amp: 1.2, freq: 0.08, seed: (vr.seed % 311) + 3, stiffness: stiff }));
    const dropY = bh * 0.3;
    // skirt: a curved shell over the outboard sector, sewn at the lid edge
    const NS = 8, MS = 16;
    const sk = [], idx = [];
    const i0 = ringAtY(-3), i1 = ringAtY(-dropY);
    for (let r = 0; r <= NS; r++) {
      const i = Math.round(i0 + (i1 - i0) * (r / NS));
      for (let c = 0; c <= MS; c++) {
        const j = Math.round(M / 4 - M * 0.14 + (M * 0.28 * c) / MS);
        const q = surf(i, j, 2.2);
        sk.push(q.x, q.y, q.z);
      }
    }
    for (let r = 0; r < NS; r++) for (let c = 0; c < MS; c++) {
      const k = r * (MS + 1) + c;
      idx.push(k, k + 1, k + MS + 2, k, k + MS + 2, k + MS + 1);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sk, 3));
    sg.setIndex(idx);
    sg.computeVertexNormals();
    const skMat = trimMat.clone();
    skMat.side = THREE.DoubleSide;
    grp.add(noCol(new THREE.Mesh(sg, skMat)));
    const jo = jDir('out');
    const top = v3(...mouthPt(0.5, lidH - 3, Math.PI / 2, 2));
    const edge = surf(i1, jo, 3.4);
    const low = surf(ringAtY(-dropY - 18), jo, 1.2);
    strapGeos.push(ribbonLoop([top, v3(...mouthPt(1.02, 0, Math.PI / 2, 3)), edge, low], v3(1, 0, 0), v3(0, -dropY * 0.5, 0), { width: 16, lift: 0.4, closed: false }));
    hwGeos.push(...buckle(edge, v3(0, -1, 0), v3(0, 0, side), { width: 14 }));
  }
  if (isRoll) {
    // pinched flat and rolled: the mouth narrows fore-aft to a lip, and the lip
    // rolls into a bar lying across the top with a strap down over it
    const NC = 8;
    const collar = ringLoft(NC, M, (i, j) => {
      const f = i / NC;
      const th = (2 * Math.PI * j) / M;
      const [ux, uz] = secUnit(th);
      return [mouthHX * 0.98 * ux * (1 - 0.8 * f), collarH * f, halfZ * 0.98 * uz * (1 + 0.04 * f)];
    }, (i, j) => [j / M * 4, i / NC], { capStart: false });
    grp.add(soft(collar.geo, main, { amp: 1.2, freq: 0.1, seed: (vr.seed % 211) + 5, stiffness: stiff }));
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(rollR, rollR, halfZ * 2.02, 18), trimMat);
    roll.rotation.x = Math.PI / 2;
    roll.scale.set(1, 1, 0.8);
    roll.position.set(0, collarH + rollR * 0.7, 0);
    grp.add(roll);
    const pts = [];
    for (let q = 0; q <= 10; q++) {
      const a = Math.PI * (q / 10);
      pts.push(v3(Math.cos(a) * (rollR + 1.4), collarH + rollR * 0.7 + Math.sin(a) * (rollR * 0.8 + 1.4), 0));
    }
    pts.unshift(v3(mouthHX + 1.5, -18, 0));
    pts.push(v3(-mouthHX - 1.5, -18, 0));
    strapGeos.push(ribbonLoop(pts, v3(0, 0, 1), v3(0, collarH * 0.5, 0), { width: 16, lift: 0.3, closed: false }));
    hwGeos.push(...buckle(v3(mouthHX + 2, -10, 0), v3(0, -1, 0), v3(1, 0, 0), { width: 14 }));
  }

  // ---- mesh pockets --------------------------------------------------------------------
  const pkArr = Array.isArray(ft.pockets) ? ft.pockets : [];
  const pkText = typeof ft.pockets === 'string' ? ft.pockets : '';
  let pockets;
  if (pkArr.length) {
    pockets = [];
    for (const x of pkArr) {
      if (!/mesh|open|stretch|slip/i.test(x.type || '') || /inside|internal/i.test(x.face || '')) continue;
      const face = /front/i.test(x.face || '') ? 'front' : /rear|back/i.test(x.face || '') ? 'rear' : 'out';
      pockets.push(pockets.includes(face) ? (face === 'out' ? 'front' : face === 'front' ? 'rear' : 'out') : face);
    }
  } else if (pkText) {
    pockets = /external|outer|mesh pocket/i.test(pkText) ? ['out', 'front'] : [];
  } else {
    // silent record: the class as the owner describes it — but not on a
    // flat slab or a flap/roll-top pack, which are other constructions
    pockets = !isFlap && !isRoll && geom.form !== 'slab' ? ['out', 'front'] : [];
  }
  const pocketTop = -bh * 0.42, pocketBot = -bh + rB * 0.8;
  const meshMat = meshPanelMat();
  meshMat.side = THREE.DoubleSide;
  const hemGeos = [];
  for (const face of [...new Set(pockets)].slice(0, 3)) {
    const jc = jDir(face);
    const jw = Math.round(M * (face === 'out' ? 0.15 : 0.12));
    const iTop = ringAtY(pocketTop), iBot = ringAtY(pocketBot);
    const pos = [], idx = [];
    const rows = iTop - iBot, cols = jw * 2;
    const hem = [];
    for (let r = 0; r <= rows; r++) {
      const i = iBot + r, f = r / Math.max(rows, 1);
      for (let c = 0; c <= cols; c++) {
        const j = (jc - jw + c + M) % M;
        const u = c / cols;
        // sewn at the base and both sides, standing proud at the elastic mouth
        const off = 0.8 + (5.5 + 1.5 * K) * Math.sin(Math.PI * u) ** 0.45 * f ** 1.3;
        const q = surf(i, j, off);
        pos.push(q.x, q.y, q.z);
        if (r === rows) hem.push(q.clone().add(v3(0, 1, 0)));
      }
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const k = r * (cols + 1) + c;
      idx.push(k, k + 1, k + cols + 2, k, k + cols + 2, k + cols + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    grp.add(noCol(new THREE.Mesh(g, meshMat)));
    // the bound elastic mouth
    if (hem.length > 2) hemGeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hem), 32, 1.7, 5, false));
  }
  if (hemGeos.length) grp.add(meshOf(hemGeos, collarMat));

  if (feats.reflective) {
    const i = ringAtY(-bh * 0.28);
    const rs = reflectiveStrip(Math.min(mouthHX * 0.9, 36), 6);
    rs.position.copy(surf(i, jDir('out'), 0.8));
    rs.rotation.y = side > 0 ? 0 : Math.PI;
    grp.add(rs);
  }

  // the maker's mark on the outboard face, above the pockets
  {
    const i = ringAtY(-bh * 0.24);
    const q = surf(i, jDir('out'), 1.0);
    const pw = Math.min(mouthHX * 1.3, 54);
    patch(grp, brand, q.x, q.y + pw * 0.06, q.z, pw, side > 0 ? 0 : Math.PI);
  }

  // ---- placement -------------------------------------------------------------------------
  const anchorPos = ctx?.anchors?.[side > 0 ? 'stemR' : 'stemL']?.position ?? v3(0, 0, side * 80);
  const P = ctx.points;
  const bar = P.barCenter;
  const headR = ctx?.frameEdgeR?.[2] ?? 24;
  const innerZ = headR + 16;                          // inboard face off the centre plane
  const bodyInboard = halfZ * (1 + bulge) + 1;
  const zCentre = innerZ + bodyInboard;
  grp.position.set(
    bar.x - anchorPos.x - BAR_R - 1 - mouthHX * (1 + bulge * 0.5),
    bar.y - anchorPos.y,
    side * zCentre - anchorPos.z,
  );

  // ---- attachment straps, aimed at the bike ------------------------------------------------
  const txt = [ft.attachment, ft.mount, ft.straps].filter((s) => typeof s === 'string').join(' + ');
  const WORD = { one: 1, two: 2, three: 3 };
  const barClause = txt.split('+').find((c) => /bar/i.test(c)) || '';
  const nm = /\b(\d|one|two|three)\b/i.exec(barClause);
  const nBar = clamp(nm ? (WORD[nm[1].toLowerCase()] ?? +nm[1]) : 2, 1, 3);
  const toHead = !txt || /fork|head ?tube|crown|stabil|steerer/i.test(txt) || !/only/i.test(txt);
  const strapMesh = meshOf([new THREE.BufferGeometry()], wm);
  grp.add(strapMesh);
  const fixedStraps = strapGeos.slice();
  const rebuild = (toLocal, toLocalDir) => {
    const geos = fixedStraps.slice();
    // bar loops: round the bar tops, down onto the bag's front face
    const barL = toLocal(v3(bar.x, bar.y, 0));
    const barA = toLocalDir(v3(0, 0, 1)).normalize();
    for (let k = 0; k < nBar; k++) {
      const z = nBar === 1 ? 0 : (-0.5 + k / (nBar - 1)) * halfZ * 1.1;
      const C = barL.clone().addScaledVector(barA, z - barL.clone().dot(barA));
      const face = v3(mouthHX * 0.9, -22, z);
      const g = tubeLoop(C, barA, face, BAR_R + 0.4, 6, 18);
      if (g) geos.push(g);
    }
    // the stem loop: round the stem, to the bag's inboard face near the top
    const sA = toLocalDir(P.barCenter.clone().sub(P.steererTop)).normalize();
    const sC = toLocal(P.steererTop.clone().lerp(P.barCenter, side > 0 ? 0.36 : 0.6));
    const inb = surf(ringAtY(-bh * 0.12), jDir('in'), 0);
    const inFace = v3(sC.x, inb.y, inb.z);
    const sg = tubeLoop(sC, sA, inFace, 15.6, 8, 18);
    if (sg) geos.push(sg);
    // the stability strap: down to the head tube / fork crown, at the height
    // the bag's base reaches, offset per side so the pair never overlap
    if (toHead && P.headTop && P.headBottom) {
      const hA = toLocalDir(P.headBottom.clone().sub(P.headTop)).normalize();
      const baseY = -bh + Math.min(bh * 0.14, 18);
      const hTop = toLocal(P.headTop), hBot = toLocal(P.headBottom);
      const f = clamp((baseY - hTop.y) / (hBot.y - hTop.y || -1) + (side > 0 ? 0 : 0.12), 0.1, 0.92);
      const hC = hTop.clone().lerp(hBot, f);
      const lowIn = surf(ringAtY(baseY), jDir('in'), 0);
      const g = tubeLoop(hC, hA, v3(lowIn.x * 0.3, lowIn.y, lowIn.z), headR + 0.6, 7, 18);
      if (g) geos.push(g);
    }
    const fresh = meshOf(geos, wm);
    strapMesh.geometry.dispose();
    strapMesh.geometry = fresh.geometry;
  };
  {
    const o = anchorPos.clone().add(grp.position);
    rebuild((q) => v3(q.x - o.x, q.y - o.y, (q.z || 0) - o.z), (d) => d.clone());
  }
  grp.userData.reseat = rebuild;
  if (hwGeos.length) grp.add(meshOf(hwGeos, hwm));
  if (seamGeos.length) grp.add(meshOf(seamGeos, seamMat(main)));

  grp.userData.radius = Math.max(mouthHX, halfZ) * (1 + bulge);
  return shadowify(grp);
}
