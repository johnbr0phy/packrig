// Pannier builder (mm-local, parented to the pannierL / pannierR anchors).
//
// ---- AXIS MAPPING (BUILDER-BRIEF Rule 2) ---------------------------------
// The pannier anchors are added with ry = 0 (src/bike.js), so bag-local axes
// ARE frame axes: +x forward, +y up, +z drive side. For this slot:
//
//   p.mm.len -> x   fore-aft run of the bag along the rack rail
//   p.mm.hgt -> y   the drop, top of the closed (rolled) bag to its base
//   p.mm.wid -> z   thickness across the bike, back panel to outer face
//
// Checked against `mount.axes` on the pannier records: 58 of 62 write
// { len: x, wid: z, hgt: y } with some sign ('+x', '-x', '-y' are the same
// axis; Ortlieb's '+z' is the drive-side bag and is negated for the other).
// Four disagree and are left on the majority mapping deliberately, reported:
// Blackburn Grocery / Rear Pannier and Road Runner Anywhere write len across
// the bike (a 33-35 cm-thick pannier), and Restrap City Loader is not in this
// slot in brands.json. Ortlieb's own note confirms the mapping from a photo:
// 32 cm fore-aft, 17 cm across, 41.9 cm drop with the top ALREADY rolled.
//
// ---- WHAT IT IS (owner: "tall roll-top bags hanging off a visible rack with
// heel clearance"; wrong today: "flat black suitcases with no roll-top") ----
// A tall slab with a FLAT, stiff back panel against the rack and a domed outer
// face, narrowing toward the base by the record's taper (Ortlieb 0.88; Tailfin
// wedges 0.6-0.72 lose it all at the FRONT, which is the heel-clearance cut).
// The mouth pinches flat and is rolled down into a fat tube along the top,
// pulled toward the outer face; a buckle strap runs over the roll (Ortlieb
// Back-Roller family: a tab at each roll end buckled down the side gussets).
// Flap, zip and drawcord closures are drawn where `closure.type` says so.
//
// ---- PLACEMENT (every value derived from the bike, Rule 1) ----------------
// The rack is read off `ctx.rearRack` itself (rearRackOf): its top side rails,
// lower rails and struts, each with its own radius. Nothing below restates a
// rack dimension.
//   back panel     flat, 1 mm outboard of the outermost rack tube (|z| + r)
//   height         the upper hooks close over the top rail; the hook line sits
//                  a fraction of the bag height below its top (Ortlieb puts
//                  the QL rail 20-22% down), so the roll stands above the deck
//   fore-aft       centred on the rail, then slid REARWARD until the front-
//                  bottom corner is `HEEL_CLEAR` clear of the heel's sweep
//                  (heelSweep: crank from ctx.geo.crankLength, round the BB),
//                  but never so far that the front hook leaves the rail
//   lower hook     on the nearest rack strut / lower rail at its own height
// Hooks, rails, jaws, straps and buckles are userData.noCollide.

import * as THREE from 'three';
import { v3 } from '../../lib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { deformScale } from '../deform.js';
import { addPockets, bungeeLattice, daisyChain, drawcordEnd, reflectiveStrip, zipperRun } from '../features.js';
import { seamStrip } from '../hardware.js';
import { featuresOf, geomOf, stiffnessOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';
import { buckle, meshOf, ribbonLoop, strapRun, tubeWrap } from '../straps.js';

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// The rider's foot, for heel clearance. The ball of the foot sits over the
// pedal spindle; the back of the heel is about a shoe length x 0.68 behind it
// and a sole below it. These are properties of a foot, not of this bike.
const HEEL_BACK = 185;     // spindle -> back of heel, mm (EU 42-44 shoe)
const HEEL_DROP = 30;      // heel below the spindle line at the back of the stroke
const HEEL_R = 28;         // heel treated as a disc this big
const HEEL_CLEAR = 25;     // required gap, front-bottom of the bag to the heel

/**
 * The rear rack's tubes, read off the rack group the bike draws (src/bike.js
 * buildRearRack) so the bag follows the rack wherever it is: every tube as a
 * segment { a, b, r } in frame mm, classified into the two horizontal top side
 * rails, the horizontal lower side rails and the rest (struts).
 */
export function rearRackOf(ctx) {
  const rack = ctx.rearRack;
  const segs = [];
  if (rack) {
    rack.updateMatrix();
    rack.traverse((o) => {
      if (!o.isMesh || o.geometry?.type !== 'CylinderGeometry') return;
      o.updateMatrix();
      const M = new THREE.Matrix4().multiplyMatrices(rack.matrix, o.matrix);
      const h = o.geometry.parameters.height / 2;
      const a = v3(0, -h, 0).applyMatrix4(M), b = v3(0, h, 0).applyMatrix4(M);
      segs.push({ a, b, r: Math.max(o.geometry.parameters.radiusTop, o.geometry.parameters.radiusBottom) });
    });
  }
  const horiz = (s) => Math.abs(s.a.y - s.b.y) < 1 && Math.abs(s.a.z - s.b.z) < 1 && Math.abs(s.a.z) > 30;
  const sideRails = segs.filter(horiz);
  const topY = sideRails.length ? Math.max(...sideRails.map((s) => s.a.y)) : null;
  const top = sideRails.filter((s) => Math.abs(s.a.y - topY) < 1);
  const lower = sideRails.filter((s) => s.a.y < topY - 20);
  const struts = segs.filter((s) => !horiz(s) && Math.abs(s.a.x - s.b.x) < Math.abs(s.a.y - s.b.y));
  if (!top.length) {
    // no rack drawn: fall back to the rackTop anchor, the same expression
    const y = ctx.anchors.rackTop.position.y;
    const x = ctx.anchors.rackTop.position.x;
    return { topY: y, railR: 5, x0: x - 140, x1: x + 130, railZ: 70, outer: 76, lower: [], struts: [], deckR: 4, segs };
  }
  const x0 = Math.min(...top.map((s) => Math.min(s.a.x, s.b.x)));
  const x1 = Math.max(...top.map((s) => Math.max(s.a.x, s.b.x)));
  const railZ = Math.abs(top[0].a.z);
  const railR = top[0].r;
  // outermost tube surface of the side frame the pannier leans on
  const outer = Math.max(...[...top, ...lower, ...struts].map((s) => Math.max(Math.abs(s.a.z), Math.abs(s.b.z)) + s.r));
  const cross = segs.filter((s) => Math.abs(s.a.z - s.b.z) > 60);
  const deckR = cross.length ? cross[0].r : railR;
  return { topY, railR, x0, x1, railZ, outer, lower, struts, deckR, segs };
}

/**
 * Rearmost reach of the rider's heel, as sampled points in the xy plane (frame
 * mm). Crank from ctx.geo, turning round the BB at the origin.
 */
function heelSweep(ctx) {
  const L = ctx.geo?.crankLength || 172.5;
  const pts = [];
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    pts.push(new THREE.Vector2(Math.cos(t) * L - HEEL_BACK, Math.sin(t) * L - HEEL_DROP));
  }
  return pts;
}

/** Distance from point q to segment ab, 2D. */
function segDist(q, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const t = clamp(((q.x - a.x) * vx + (q.y - a.y) * vy) / (vx * vx + vy * vy || 1), 0, 1);
  return Math.hypot(q.x - (a.x + vx * t), q.y - (a.y + vy * t));
}

/** Which closure to draw, from the controlled vocabulary first. */
function closureOf(p, feats) {
  const t = p.closure?.type;
  if (t) {
    if (t === 'rolltop') return 'roll';
    if (/^flap/.test(t) || t === 'hook_and_loop_flap') return 'flap';
    if (/zip|clamshell/.test(t)) return t === 'zip_straight' ? 'zip' : 'horseshoe';
    if (t === 'drawcord') return 'drawcord';
  }
  const s = String(feats.closure || '');
  return /roll/i.test(s) ? 'roll' : /flap|buckle/i.test(s) ? 'flap' : /zip/i.test(s) ? 'zip' : /draw/i.test(s) ? 'drawcord' : 'roll';
}

export function buildPannier(p, brand, main, accent, ctx, side) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const geom = geomOf(p);
  const stiff = stiffnessOf(p);
  const k = deformScale(stiff);
  const wm = webbing();
  const hwm = hardware();
  const isOrtlieb = /ortlieb/i.test(brand?.name || '');
  const mountSys = String(p.features?.mountingSystem || p.features?.attachment || '');

  // ---- published size -> drawn size -------------------------------------
  const L0 = p.mm.len, H0 = p.mm.hgt, D0 = p.mm.wid;
  const closure = closureOf(p, feats);
  const rolls = clamp(p.closure?.rolls || p.render?.rolls || 3, 2, 4);

  // The outer face domes by `bOut`; the back panel is the stiffened plate the
  // records describe and never domes. Solve backwards so the finished
  // thickness lands on the published figure (framehalf.js does the same).
  const bFrac = vr.range(0.1, 0.14);
  const bOut = D0 * bFrac;                     // dome of the outer face, before k
  const bEnd = bOut * 0.35;                    // lighter dome on the end gussets
  const D = Math.max(D0 - bOut * k, 40);
  const Lt = Math.max(L0 - 2 * bEnd * k, 80);  // body length at the TOP edge

  // Taper toward the base (bottom length / top length) from the record, else
  // a narrow default. A tapered_wedge loses nearly all of it at the front -
  // that is the heel-clearance cut Tailfin and Restrap design in.
  const taper = geom.taperRatio ?? vr.range(0.9, 0.96);
  const Lb = Lt * clamp(taper, 0.5, 1);
  const frontShare = geom.form === 'tapered_wedge' || taper < 0.8 ? 0.85 : 0.55;

  // Roll-top: the mouth is rolled into a tube whose crown IS the published
  // height (Ortlieb publish the rolled height; see the record's render.basis).
  const rollR = closure === 'roll' ? clamp(D * 0.22, 13, 30) : 0;
  const Hb = H0 - (closure === 'roll' ? rollR * 1.55 : closure === 'flap' ? 6 : 0);
  const squared = geom.shoulder === 'squared' || geom.crossSection === 'flat_back';
  const rad = Math.min(D * (squared ? 0.2 : 0.32), squared ? 20 : 30);

  // ---- body, in CANONICAL space --------------------------------------------
  // Canonical: x fore-aft centred, y = 0 at the base, z = 0 at the back panel,
  // outer face toward +z. `mirror` flips z for the left bag.
  const mirror = new THREE.Group();
  mirror.scale.z = side < 0 ? -1 : 1;
  grp.add(mirror);

  const geo = new RoundedBoxGeometry(Lt, Hb, D, 6, rad);
  {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i) + Hb / 2, z = pos.getZ(i) + D / 2;
      const t = y / Hb;                              // 0 base -> 1 top
      const shrink = (Lt - Lb) * (1 - t);
      const u = (x + Lt / 2) / Lt;                   // 0 rear -> 1 front
      x = -Lt / 2 + shrink * (1 - frontShare) + u * (Lt - shrink);
      if (closure === 'roll') {
        // the mouth pinches flat before it is rolled: thin the top toward the
        // roll's line, which sits a little outboard of the middle
        const s = 1 - 0.5 * smooth(0.8, 1, t);
        const zc = D * 0.56;
        z = zc + (z - zc) * s;
      }
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }
  const fall = (a) => { const q = Math.min(Math.abs(a), 1); return Math.max(0, 1 - q ** 2.2) ** 0.6; };
  const body = soft(geo, main, {
    amp: vr.range(1.8, 2.8), freq: vr.range(0.018, 0.026), seed: vr.seed % 947,
    stiffness: stiff,
    bulge: (x, y, z, nx, ny, nz) => {
      if (nz > 0.72) return bOut * fall(x / (Lt / 2)) * fall((y - Hb * 0.45) / (Hb * 0.55));
      if (Math.abs(nx) > 0.72) return bEnd * fall((y - Hb / 2) / (Hb / 2)) * fall((z - D / 2) / (D / 2));
      return 0;
    },
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.42,
  });
  // The back panel is a stiffened plate: press anything the noise pushed
  // behind it back onto it, so it lies flat against the rack.
  {
    const pos = body.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getZ(i) < 0) pos.setZ(i, 0);
    pos.needsUpdate = true;
    body.geometry.computeBoundingBox();
    body.geometry.computeBoundingSphere();
  }
  mirror.add(body);

  // outer-face z at (x, y), for anything that must lie ON the face
  const faceZ = (x, y) => {
    const s = closure === 'roll' ? 1 - 0.5 * smooth(0.8, 1, y / Hb) : 1;
    const z = D * 0.56 + (D - D * 0.56) * s;
    return z + k * bOut * fall(x / (Lt / 2)) * fall((y - Hb * 0.45) / (Hb * 0.55)) + 2.2 * k + 1;
  };
  // front / rear edge x at height y
  const frontX = (y) => Lt / 2 - (Lt - Lb) * (1 - y / Hb) * frontShare;
  const rearX = (y) => -Lt / 2 + (Lt - Lb) * (1 - y / Hb) * (1 - frontShare);

  const straps = [];     // webbing geometries, merged into one mesh
  const metal = [];      // buckle geometries

  // ---- closure --------------------------------------------------------------
  if (closure === 'roll') {
    // The roll: a flattened tube along the top, pulled toward the outer face,
    // with the lap edge showing along its outer underside.
    const zc = D * 0.56;
    const lenR = Lt * 0.99;
    const tube = new THREE.CylinderGeometry(rollR, rollR, lenR, 22, 1);
    tube.rotateZ(Math.PI / 2);
    tube.scale(1, 0.92, 1.18);
    const rollY = H0 - rollR * 0.92;
    tube.translate(0, rollY, zc);
    const rollMesh = soft(tube, main, { amp: 0.8, freq: 0.05, seed: vr.seed % 331, stiffness: stiff });
    mirror.add(rollMesh);
    for (let i = 1; i < rolls; i++) {
      // each further lap a little smaller and lower on the outboard side
      const r = rollR * (0.42 - i * 0.06);
      const lap = new THREE.CylinderGeometry(r, r, lenR * (0.995 - i * 0.01), 14, 1);
      lap.rotateZ(Math.PI / 2);
      const a = -0.35 - i * 0.55;                   // angle round the roll, from outboard
      lap.translate(0, rollY + Math.sin(a) * rollR * 0.95, zc + Math.cos(a) * rollR * 1.1);
      mirror.add(new THREE.Mesh(lap, main));
    }
    // flat stiffener hem where the rolled mouth meets the body
    const hem = seamStrip(main, Lt - 2 * rad, 2.2, D * 0.46);
    hem.position.set(0, Hb - 1, D * 0.56);
    mirror.add(hem);

    // the roll's section in the yz plane, for straps that go over it
    const rollSection = (n = 18, from = -0.2, to = Math.PI + 0.35) => {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const t = from + ((to - from) * i) / n;
        pts.push([rollY + Math.sin(t) * rollR * 0.92, zc + Math.cos(t) * rollR * 1.18]);
      }
      return pts;
    };
    if (isOrtlieb) {
      // Back-Roller family: a webbing tab at each END of the roll, pulled down
      // the end gusset to a cam buckle high on the side (record: closure
      // hardware / straps role 'lid' x2, location end_cap).
      for (const e of [-1, 1]) {
        const xe = e * (Lt / 2 + bEnd * k * 0.3 + 1.5);
        const yTop = rollY + rollR * 0.2, yBk = Hb * 0.84;
        straps.push(strapRun(v3(xe, yTop, zc), v3(xe, yBk, D * 0.52), v3(e, 0, 0), { width: 20 }));
        metal.push(...buckle(v3(xe, yBk + 8, D * 0.52), v3(0, -1, 0), v3(e, 0, 0), { width: 18 }));
      }
    } else {
      // Everyone else: a strap from the outer face, up over the roll and down
      // the back, buckled on the outer face, one on a short bag, two on a long.
      const n = Lt >= 300 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const x = n === 1 ? 0 : (i - 0.5) * Lt * 0.5;
        const yLow = Hb * 0.7;
        const path = [];
        for (let j = 0; j <= 6; j++) {
          const y = yLow + ((Hb - 4 - yLow) * j) / 6;
          path.push(v3(x, y, faceZ(x, y)));
        }
        for (const [y, z] of rollSection()) path.push(v3(x, y, z));
        path.push(v3(x, Hb - 10, 1.4));
        straps.push(ribbonLoop(path, v3(1, 0, 0), v3(x, Hb * 0.8, D * 0.45), { width: 22, closed: false, lift: 0.6 }));
        metal.push(...buckle(v3(x, Hb * 0.8, faceZ(x, Hb * 0.8)), v3(0, 1, 0), v3(0, 0, 1), { width: 22 }));
      }
    }
  } else if (closure === 'flap') {
    // A flap over the top and down the outer face, two straps to buckles.
    const drop = Hb * vr.range(0.28, 0.36);
    const lidD = D + bOut * k * 0.6 + 4;
    const lid = new THREE.Mesh(new RoundedBoxGeometry(Lt * 1.02, 8, lidD, 3, 3.5), accent);
    lid.position.set(0, Hb + 2, lidD / 2 + 0.5);
    mirror.add(lid);
    const skirtY = Hb - drop / 2;
    const skirt = new THREE.Mesh(new RoundedBoxGeometry(Lt * 1.0, drop, 6, 3, 2.5), accent);
    skirt.position.set(0, skirtY, faceZ(0, skirtY) + 3);
    mirror.add(skirt);
    for (const f of [-0.28, 0.28]) {
      const x = f * Lt;
      const y1 = Hb - drop * 0.15, y0 = Hb - drop - Hb * 0.14;
      straps.push(strapRun(v3(x, y1, faceZ(x, y1) + 6.5), v3(x, y0, faceZ(x, y0) + 1), v3(0, 0, 1), { width: 20 }));
      metal.push(...buckle(v3(x, y0 + 10, faceZ(x, y0 + 10) + 2), v3(0, -1, 0), v3(0, 0, 1), { width: 20 }));
    }
  } else if (closure === 'drawcord') {
    const dc = drawcordEnd(main, hwm, { r: Math.min(Lt, D) * 0.42, depth: 12 });
    dc.rotation.x = -Math.PI / 2;
    dc.scale.set(Lt / Math.min(Lt, D) * 0.95, 1, 1);
    dc.position.set(0, Hb, D / 2);
    mirror.add(dc);
  } else {
    // zip: a horseshoe down both ends of the outer face and across the top,
    // or a single straight run along the top edge.
    const inset = 16;
    const yz = Hb - 10;
    if (closure === 'horseshoe') {
      const yLow = Hb * 0.35;
      const a = v3(rearX(yLow) + inset, yLow, faceZ(rearX(yLow) + inset, yLow));
      const b = v3(rearX(yz) + inset, yz, faceZ(rearX(yz) + inset, yz));
      const c = v3(frontX(yz) - inset, yz, faceZ(frontX(yz) - inset, yz));
      const d = v3(frontX(yLow) - inset, yLow, faceZ(frontX(yLow) - inset, yLow));
      mirror.add(zipperRun(a, b, hwm, { accentMat: accent }));
      mirror.add(zipperRun(b, c, hwm, { accentMat: accent }));
      mirror.add(zipperRun(c, d, hwm, { accentMat: accent }));
    } else {
      mirror.add(zipperRun(v3(-Lt * 0.44, Hb + 1, D * 0.5), v3(Lt * 0.44, Hb + 1, D * 0.5), hwm, { accentMat: accent }));
    }
  }

  // ---- outer-face trim --------------------------------------------------------
  // Ortlieb: the removable shoulder strap's V across the outer face, from the
  // two roll-end D-rings down to a guide on the centreline (record: straps,
  // role 'shoulder'), with the two screwed anchor discs on the centreline.
  if (isOrtlieb && p.features?.shoulderStrap && closure === 'roll') {
    const yG = Hb * 0.16;
    const g = v3(0, yG, faceZ(0, yG));
    const vStrap = [];
    for (const e of [-1, 1]) {
      const x = e * Lt * 0.42, y = Hb * 0.9;
      vStrap.push(strapRun(v3(x, y, faceZ(x, y) + 0.3), g, v3(0, 0, 1), { width: 16 }));
    }
    // grey webbing with a moulded pad, per the record
    mirror.add(meshOf(vStrap, new THREE.MeshStandardMaterial({ color: 0x6d7074, roughness: 0.85 })));
    for (const yf of [0.16, 0.85]) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 3, 18), hwm);
      disc.rotation.x = Math.PI / 2;
      disc.position.set(0, Hb * yf, faceZ(0, Hb * yf) + 1.8);
      disc.userData.noCollide = true;
      mirror.add(disc);
    }
  } else if (closure !== 'flap') {
    // compression / lash straps down the outer face, from the record's count
    const n = feats.compressionStraps ?? 0;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : (i / (n - 1) - 0.5) * Lt * 0.55;
      const y1 = Hb * 0.66, y0 = Hb * 0.08;
      const path = [];
      for (let j = 0; j <= 8; j++) { const y = y0 + ((y1 - y0) * j) / 8; path.push(v3(x, y, faceZ(x, y))); }
      straps.push(ribbonLoop(path, v3(1, 0, 0), v3(x, Hb * 0.4, D * 0.3), { width: 20, closed: false, lift: 0.4 }));
      metal.push(...buckle(v3(x, Hb * 0.3, faceZ(x, Hb * 0.3)), v3(0, 1, 0), v3(0, 0, 1), { width: 20 }));
    }
  }
  // welded / sewn seam round the base panel
  const ySeam = Hb * 0.12;
  const seam = seamStrip(main, frontX(ySeam) - rearX(ySeam) - 2 * rad * 0.3, 2.4, D + 1.5);
  seam.position.set((rearX(ySeam) + frontX(ySeam)) / 2, ySeam, D / 2);
  mirror.add(seam);
  if (feats.reflective) {
    const rs = reflectiveStrip(isOrtlieb ? 60 : Lt * 0.5, isOrtlieb ? 50 : 12);
    const y = isOrtlieb ? Hb * 0.5 : Hb * 0.24;
    rs.position.set(isOrtlieb ? -Lt * 0.25 : 0, y, faceZ(isOrtlieb ? -Lt * 0.25 : 0, y) + 0.8);
    mirror.add(rs);
  }
  if (feats.cord) {
    const lat = bungeeLattice(hwm, { w: Lt * 0.66, h: Hb * 0.42, n: 4 });
    lat.position.set(0, Hb * 0.48, faceZ(0, Hb * 0.48) + 2);
    mirror.add(lat);
  }
  if (feats.daisyChains) {
    const dcn = daisyChain(wm, { len: Hb * 0.5, rows: 1, band: 16 });
    // ladder runs up the face (local x -> y), loops stand out of it (y -> z)
    dcn.setRotationFromMatrix(new THREE.Matrix4().makeBasis(v3(0, 1, 0), v3(0, 0, 1), v3(1, 0, 0)));
    dcn.position.set(-Lt * 0.3, Hb * 0.45, faceZ(-Lt * 0.3, Hb * 0.45));
    dcn.traverse((o) => { o.userData.noCollide = true; });
    mirror.add(dcn);
  }
  addPockets(mirror, feats, main, hwm, {
    side: (make, i) => {
      const y = Hb * (0.3 - i * 0.12);
      const g = make(Math.min(Lb * 0.66, 210), Math.min(Hb * 0.3, 140));
      g.position.set(0, y, faceZ(0, y));
    },
    front: (make, i) => {
      const g = make(Math.min(D * 0.7, 130), Math.min(Hb * 0.34, 150));
      g.position.set(frontX(Hb * 0.4) + bEnd * k + 1, Hb * (0.4 - i * 0.2), D / 2);
      g.rotation.y = Math.PI / 2;
    },
  });

  // ---- placement on the rack ----------------------------------------------------
  const rack = rearRackOf(ctx);
  const backZ = rack.outer + 1;                  // back panel, 1 mm off the rack's side frame
  // Hook line below the top: Ortlieb's QL rail sits 20-22% down; the hook's
  // jaw closes over the rail from there.
  const hookDrop = clamp(H0 * 0.18, 50, 95);
  const bottomY = rack.topY + hookDrop - H0;
  // Hooks at 28% / 72% of the width (Ortlieb record), or a little wider; they
  // may close up to 110 mm apart (the QL rail's minimum) to buy heel room.
  let hookSpan = Lt * (isOrtlieb ? 0.44 : 0.5);
  const HOOK_W = 40;
  const railMinOf = (hs) => rack.x0 + HOOK_W / 2 + 2 + hs / 2;   // rear hook still on the rail
  let railMin = railMinOf(hookSpan);
  const railMax = rack.x1 - HOOK_W / 2 - 2 - hookSpan / 2;
  // Heel: slide rearward from the rail centre until the front-bottom of the
  // bag clears the heel's sweep, or the front hook would leave the rail.
  const heel = heelSweep(ctx);
  const heelGap = (cx) => {
    const yb = bottomY, yt = bottomY + Hb * 0.55;
    const fb = new THREE.Vector2(cx + frontX(0) - rad * 0.3, yb);
    const ft = new THREE.Vector2(cx + frontX(Hb * 0.55), yt);
    const rb = new THREE.Vector2(cx + rearX(0), yb);
    let m = Infinity;
    for (const q of heel) m = Math.min(m, Math.min(segDist(q, fb, ft), segDist(q, rb, fb)) - HEEL_R);
    return m;
  };
  let cx = clamp((rack.x0 + rack.x1) / 2, railMin, Math.max(railMin, railMax));
  for (let guard = 0; guard < 200 && heelGap(cx) < HEEL_CLEAR; guard++) {
    if (cx - 5 >= railMin) cx -= 5;
    else if (hookSpan > 115) { hookSpan -= 5; railMin = railMinOf(hookSpan); }
    else break;
  }
  grp.userData.heelClearance = Math.round(heelGap(cx));

  const anchor = ctx.anchors[side > 0 ? 'pannierR' : 'pannierL'].position;
  grp.position.set(cx - anchor.x, bottomY - anchor.y, side * backZ - anchor.z);

  // ---- mounting hardware, on the back panel (canonical z <= 0 is the rack side)
  // In canonical space the rack rail centre is at z = -(backZ - railZ).
  const railLocalY = rack.topY - bottomY;         // = H0 - hookDrop
  const railLocalZ = -(backZ - rack.railZ);
  const hw = [];
  // the QL-style rail across the back panel the hooks clamp onto
  hw.push(boxAt(Lt * 0.82, 16, 7, 0, railLocalY - 6, -3.5));
  for (const e of [-1, 1]) {
    const x = e * hookSpan / 2;
    // hook body: from the back panel over the rail's top
    hw.push(boxAt(40, 34, backZ - rack.railZ + 4, x, railLocalY + rack.railR + 17, railLocalZ / 2 - 1));
  }
  mirror.add(meshOf(hw, hwm));
  // the jaws: thin metal bands closing over the top rail from outboard
  const jaws = [];
  for (const e of [-1, 1]) {
    const x = e * hookSpan / 2;
    jaws.push(tubeWrap(v3(x, railLocalY, railLocalZ), v3(1, 0, 0), rack.railR + 1.2,
      { width: 18, thick: 2.2, startAngle: 0.5, sweep: -(Math.PI + 1.1) }));
  }
  const jawMat = new THREE.MeshStandardMaterial({ color: 0xa9adb3, roughness: 0.35, metalness: 0.8 });
  mirror.add(meshOf(jaws, jawMat));

  // lower hook: on the nearest strut or lower rail below the upper hooks
  {
    const want = Hb * 0.36;                       // canonical height of the lower hook
    let best = null;
    for (const s of [...rack.struts, ...rack.lower]) {
      if (Math.sign(s.a.z) !== Math.sign(side) && Math.abs(s.a.z) > 1) continue;
      // closest point of the tube to the bag's back panel at `want`
      const wy = bottomY + want;
      for (let i = 0; i <= 20; i++) {
        const q = s.a.clone().lerp(s.b, i / 20);
        const lx = q.x - cx, ly = q.y - bottomY;
        if (lx < rearX(ly) + 20 || lx > frontX(ly) - 20 || ly < 20 || ly > railLocalY - 40) continue;
        const d = Math.abs(q.y - wy) + Math.abs(lx) * 0.5;
        if (!best || d < best.d) best = { d, lx, ly, r: s.r, z: Math.abs(q.z) };
      }
    }
    const lx = best ? best.lx : 0, ly = best ? best.ly : want;
    const lz = best ? -(backZ - best.z) : -8;
    const low = [];
    // arced backing bracket on the panel, the hook body, and its jaw
    low.push(boxAt(Math.min(Lb * 0.4, 120), 14, 5, lx * 0.5, ly - 22, -2.5));
    low.push(boxAt(22, 34, Math.abs(lz) + 4, lx, ly - 6, lz / 2 - 1));
    mirror.add(meshOf(low, hwm));
    if (best) {
      mirror.add(meshOf([tubeWrap(v3(lx, ly, lz), v3(0, 1, 0), best.r + 1.2,
        { width: 14, thick: 2, startAngle: 0, sweep: Math.PI * 1.2 })], jawMat));
    }
    // QL3-style bags carry a stiff vertical bar down the back panel as well
    if (/quick-?lock\s*3/i.test(mountSys)) {
      mirror.add(meshOf([boxAt(24, railLocalY - ly, 6, 0, (railLocalY + ly) / 2, -3)], hwm));
    }
  }
  // bottom bumper / base runner on the back edge
  mirror.add(meshOf([boxAt(Lb * 0.9, 14, 10, (rearX(0) + frontX(0)) / 2, 7, 3)], hwm));

  if (straps.length) mirror.add(meshOf(straps, wm));
  if (metal.length) mirror.add(meshOf(metal, hwm));

  // Brand mark on the outer face, added outside the mirror so the text reads.
  const px = -Lt * 0.1 + vr.j(Lt * 0.05), py = Hb * (isOrtlieb ? 0.68 : 0.56);
  patch(grp, brand, px, py, side * (faceZ(px, py) + 1.2), Math.min(96, Lt * 0.36), side > 0 ? 0 : Math.PI);

  return shadowify(grp);
}

/** A box geometry of size (sx, sy, sz) centred at (x, y, z). */
function boxAt(sx, sy, sz, x, y, z) {
  const g = new THREE.BoxGeometry(Math.max(sx, 0.5), Math.max(sy, 0.5), Math.max(sz, 0.5));
  g.translate(x, y, z);
  return g;
}
