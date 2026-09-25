// Rack trunk bag builder (mm-local, parented to the rackTop anchor).
//
// ---- AXIS MAPPING (BUILDER-BRIEF Rule 2) ---------------------------------
// The rackTop anchor is added with ry = 0 (src/bike.js), so bag-local axes ARE
// frame axes: +x forward, +y up, +z drive side. For this slot:
//
//   p.mm.len -> x   fore-aft, along the rack deck
//   p.mm.wid -> z   across the bike
//   p.mm.hgt -> y   up from the deck (render.hgt_cm where a record gives the
//                   rolled height, which catalog.js already applies)
//
// Checked against `mount.axes` on the trunk records: all 14 that carry one say
// { len: x, wid: z, hgt: y } with some sign ('-x' is the same axis). It was
// already right here; the bug was placement, not transposition.
//
// ---- WHAT IT IS (owner: "a box sitting on top of the rack"; known bug: it
// overhung BOTH ends of the deck) ------------------------------------------
// A box on the deck, strapped to the rack's side rails or clamped to them by a
// rail system under its base. The records split cleanly into two families,
// read by `mountOf` from mountingSystem / attachment and the brand notes:
//   straps  Arkel, Banjo Brothers, Zefal, Revelate Rohn, Topeak RackLoader:
//           webbing / velcro loops round the side rails
//   rail    Ortlieb Top-Lock (an underframe with four clamp jaws that holds
//           the body 2-3 cm off the deck), Topeak MTX QuickTrack, Tailfin's
//           deck clamps, Giant MIK plate, Restrap Switch fitting, Blackburn's
//           two metal hooks
// Silhouette from geomOf(p): barrel forms are soft duffels with a big radius,
// slab (SpeedPack) is low and drops toward its rear roll, the trapezoid panel
// (Ortlieb Trunk-Bag) slopes its top down toward the front, and a chamfered
// shoulder (Tailfin CargoPack) cuts the top-front corner to clear the saddle.
//
// ---- PLACEMENT (every value derived from the bike, Rule 1) ----------------
// The rack is read off `ctx.rearRack` (rearRackOf), the saddle off ctx.rails
// and ctx.geo.saddleLength, the seatpost off ctx.points.seatTop / sd.
//   base       on the deck: top rails' top surface + the mount's own height
//   front      flush with the FRONT of the deck; a bag longer than the deck
//              overhangs to the REAR only (it used to be centred and overhang
//              both ends); a bag shorter than the deck sits forward on it
//   saddle     if the bag would stand within SADDLE_CLEAR of the saddle's
//              underside, it slides rearward until it clears the saddle's rear
//              edge (or its chamfer does)
// Straps, rails, clamps and buckles are userData.noCollide.

import * as THREE from 'three';
import { v3 } from '../../lib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxBulge, deformScale } from '../deform.js';
import { addPockets, bungeeLattice, reflectiveStrip, zipperRun } from '../features.js';
import { seamStrip } from '../hardware.js';
import { featuresOf, geomOf, stiffnessOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';
import { buckle, meshOf, ribbonLoop, strapRun, tubeWrap } from '../straps.js';

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const SADDLE_CLEAR = 20;   // mm between the bag and the saddle's underside / rear edge
const POST_CLEAR = 20;     // mm between the bag's front and the seatpost

/**
 * The rear rack's tubes, read off the rack group the bike draws (src/bike.js
 * buildRearRack): top side rails (their y, radius, fore-aft span and |z|).
 * Same reading as pannier.js; kept local so neither builder imports the other.
 */
function rearRackOf(ctx) {
  const rack = ctx.rearRack;
  const segs = [];
  if (rack) {
    rack.updateMatrix();
    rack.traverse((o) => {
      if (!o.isMesh || o.geometry?.type !== 'CylinderGeometry') return;
      o.updateMatrix();
      const M = new THREE.Matrix4().multiplyMatrices(rack.matrix, o.matrix);
      const h = o.geometry.parameters.height / 2;
      segs.push({ a: v3(0, -h, 0).applyMatrix4(M), b: v3(0, h, 0).applyMatrix4(M),
        r: Math.max(o.geometry.parameters.radiusTop, o.geometry.parameters.radiusBottom) });
    });
  }
  const horiz = (s) => Math.abs(s.a.y - s.b.y) < 1 && Math.abs(s.a.z - s.b.z) < 1 && Math.abs(s.a.z) > 30;
  const rails = segs.filter(horiz);
  if (!rails.length) {
    const p = ctx.anchors.rackTop.position;
    return { topY: p.y, railR: 5, x0: p.x - 140, x1: p.x + 130, railZ: 70 };
  }
  const topY = Math.max(...rails.map((s) => s.a.y));
  const top = rails.filter((s) => Math.abs(s.a.y - topY) < 1);
  return {
    topY,
    railR: top[0].r,
    x0: Math.min(...top.map((s) => Math.min(s.a.x, s.b.x))),
    x1: Math.max(...top.map((s) => Math.max(s.a.x, s.b.x))),
    railZ: Math.abs(top[0].a.z),
  };
}

/**
 * How the bag holds on, from the records (mount.notes / attachesTo, written
 * with the photo open). mountingSystem is merged into brands.json only for
 * Ortlieb, so the other rail systems are named here by brand + line.
 */
function mountOf(brand, p) {
  const sys = `${p.features?.mountingSystem || ''} ${p.features?.attachment || ''}`;
  const b = brand?.name || '', n = `${p.line || ''} ${p.name || ''}`;
  if (/top-?lock/i.test(sys)) return { kind: 'toplock', baseH: 24 };          // Ortlieb: body 2-3 cm off the deck
  if (/topeak/i.test(b) && /mtx/i.test(n)) return { kind: 'track', baseH: 14 }; // QuickTrack rail
  if (/tailfin/i.test(b)) return { kind: 'deck', baseH: 10 };                  // clamps to the deck rails
  if (/giant/i.test(b) && /mik/i.test(n)) return { kind: 'deck', baseH: 12 };  // MIK plate
  if (/restrap/i.test(b) && /switch/i.test(n)) return { kind: 'deck', baseH: 10 };
  if (/blackburn/i.test(b)) return { kind: 'hooks', baseH: 4 };               // two metal hooks
  // straps: count from the records' attachment straps (Rohn 4, Banjo 2,
  // RackLoader 2 girth, Arkel / Zefal one velcro panel = two loops)
  if (/rohn/i.test(n)) return { kind: 'straps', baseH: 0, n: 4 };
  if (/rackloader/i.test(n)) return { kind: 'girth', baseH: 0, n: 2 };
  return { kind: 'straps', baseH: 0, n: 2 };
}

export function buildTrunk(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const geom = geomOf(p);
  const stiff = stiffnessOf(p);
  const k = deformScale(stiff);
  const wm = webbing();
  const hwm = hardware();
  const mount = mountOf(brand, p);
  const form = geom.form || 'rounded_box';
  const ct = p.closure?.type || (/roll/i.test(feats.closure || '') ? 'rolltop' : /zip/i.test(feats.closure || '') ? 'zip_straight' : 'flap_buckle');
  const isRoll = ct === 'rolltop';

  // ---- size -----------------------------------------------------------------
  // Faces dome by `b`; solve backwards so the finished box lands on the spec.
  const L0 = p.mm.len, W0 = p.mm.wid, H0 = p.mm.hgt;
  const b = Math.min(L0, W0, H0) * vr.range(0.06, 0.09);
  const L = Math.max(L0 - 2 * b * k, 60), W = Math.max(W0 - 2 * b * k, 60);
  const H = Math.max(H0 - b * k, 50);         // the base does not dome (it sits on the deck)
  const barrel = form === 'barrel';
  const rad = Math.min(barrel ? Math.min(H, W) * 0.42 : geom.shoulder === 'squared' ? 14 : 24, H * 0.45, W * 0.45);

  // Taper along x from the record: which END is narrow (Tailfin CargoPack's
  // nose is 128 of 164 mm wide; SpeedPack narrows AND drops to the rear).
  const tr = geom.taperRatio ?? 1;
  const narrowFront = geom.taperNarrowEnd === 'nose';
  const dropToo = form === 'slab';
  // trapezoid panel (Ortlieb Trunk-Bag): top slopes down toward the front
  const slopeFront = form === 'trapezoid_panel' ? 0.72 : 1;
  const chamfer = geom.shoulder === 'chamfered';

  const geo = gridRoundedBox(L, H, W, rad);
  {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i) + H / 2, z = pos.getZ(i);
      const u = (x + L / 2) / L;                              // 0 rear -> 1 front
      const at = narrowFront ? u : 1 - u;                     // 1 at the narrow end
      const s = 1 - (1 - tr) * at;
      z *= s;
      if (dropToo) y *= 1 - (1 - tr) * 0.6 * at;
      // top slope toward the front, applied to the upper part only
      if (slopeFront < 1) y *= 1 - (1 - slopeFront) * u * smooth(0.2, 1, y / H);
      // chamfered top-front shoulder
      if (chamfer) {
        const over = (x - (L / 2 - H * 0.3)) + (y - H * 0.7);
        if (over > 0) { x -= over * 0.5; y -= over * 0.5; }
      }
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }
  const body = soft(geo, main, {
    amp: vr.range(1.8, 2.8), freq: vr.range(0.022, 0.03), seed: vr.seed % 941,
    stiffness: stiff,
    bulge: (x, y, z, nx, ny, nz) => (ny < -0.72 ? 0 : boxBulge(L / 2, H / 2, W / 2, b)(x, y - H / 2, z, nx, ny, nz)),
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.42,
  });
  // the base sits flat on the deck / plate
  {
    const pos = body.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setY(i, 0);
    pos.needsUpdate = true;
    body.geometry.computeBoundingBox();
    body.geometry.computeBoundingSphere();
  }
  body.position.y = mount.baseH;
  grp.add(body);
  const bb = body.geometry.boundingBox;
  const topY = mount.baseH + bb.max.y;                        // local top
  // the body's top over a station x, from the same warps the geometry took
  const profTop = (x) => {
    const u = (x + L / 2) / L;
    let t = H * (slopeFront < 1 ? 1 - (1 - slopeFront) * u : 1);
    if (dropToo) t *= 1 - (1 - tr) * 0.6 * (narrowFront ? u : 1 - u);
    if (chamfer) t = Math.min(t, L / 2 + 0.4 * H - x);
    return t;
  };
  const surfTop = (x) => mount.baseH + profTop(x) + b * k;

  const halfW = (x) => (W / 2) * (1 - (1 - tr) * (narrowFront ? (x + L / 2) / L : 1 - (x + L / 2) / L)) + b * k * 0.6;
  const yTopAt = (x) => mount.baseH + H * (slopeFront < 1 ? 1 - (1 - slopeFront) * ((x + L / 2) / L) : 1);

  const straps = [], metal = [];

  // ---- closure --------------------------------------------------------------
  if (isRoll) {
    const rr = clamp(Math.min(H, W) * 0.13, 12, 24);
    const addRoll = (len, axis, at) => {
      const g = new THREE.CylinderGeometry(rr, rr, len, 18, 1);
      if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
      g.scale(axis === 'y' ? 1.2 : 1, axis === 'y' ? 1 : 0.85, 1);
      g.translate(at.x, at.y, at.z);
      grp.add(new THREE.Mesh(g, main));
    };
    if (form === 'slab') {
      // SpeedPack: rear entry, the roll stands across the tail
      const x = -L / 2 - b * k + rr * 0.2;
      addRoll(W * tr * 0.9, 'z', v3(x, mount.baseH + H * (1 - (1 - tr) * 0.6) * 0.5, 0));
      for (const s of [-1, 1]) {
        const z = s * W * tr * 0.3;
        straps.push(strapRun(v3(x - rr, mount.baseH + 8, z), v3(x - rr, mount.baseH + H * tr * 0.8, z), v3(-1, 0, 0), { width: 20 }));
      }
    } else if (/rackloader/i.test(p.name || '')) {
      // both ends gather and roll inward
      for (const e of [-1, 1]) addRoll(W * 0.7, 'z', v3(e * (L / 2 + b * k - rr * 0.3), mount.baseH + H * 0.55, 0));
    } else if (barrel) {
      // a long mouth on top rolled lengthwise, with cam straps over it
      addRoll(L * 0.84, 'x', v3(0, surfTop(0) - rr * 0.4, W * 0.08));
    } else {
      // roll across the top-rear, buckled down the sides
      const x = -L * 0.18;
      const ty = surfTop(x);
      addRoll(2 * halfW(x) * 0.94, 'z', v3(x, ty - rr * 0.35, 0));
      for (const s of [-1, 1]) {
        const z = s * (halfW(x) + 1.5);
        straps.push(strapRun(v3(x, ty - rr * 0.6, z), v3(x, mount.baseH + H * 0.52, z), v3(0, 0, s), { width: 20 }));
        metal.push(...buckle(v3(x, mount.baseH + H * 0.56, z), v3(0, -1, 0), v3(0, 0, s), { width: 18 }));
      }
    }
  } else if (/flap|magnetic/.test(ct)) {
    // lid over the top and down the front / rear faces
    const lid = new THREE.Mesh(new RoundedBoxGeometry(L * 1.02, 8, W * 1.03, 3, 3.5), accent);
    lid.position.set(0, topY + 2, 0);
    if (slopeFront < 1) lid.rotation.z = -Math.atan2(H * (1 - slopeFront), L);
    grp.add(lid);
    const drop = H * 0.3;
    const skirt = new THREE.Mesh(new RoundedBoxGeometry(6, drop, W * 0.9, 2, 2.5), accent);
    skirt.position.set(L / 2 + b * k + 3, yTopAt(L / 2) - drop / 2, 0);
    grp.add(skirt);
    if (/flap/.test(ct)) {
      for (const s of [-1, 1]) {
        const z = s * W * 0.26;
        const y1 = yTopAt(L / 2) - drop * 0.2, y0 = y1 - drop - H * 0.12;
        straps.push(strapRun(v3(L / 2 + b * k + 6.5, y1, z), v3(L / 2 + b * k + 1, y0, z), v3(1, 0, 0), { width: 20 }));
        metal.push(...buckle(v3(L / 2 + b * k + 2, y0 + 10, z), v3(0, -1, 0), v3(1, 0, 0), { width: 20 }));
      }
    }
  } else {
    // zipped lid: a horseshoe round three sides of the top, or a straight run
    const y = topY - Math.min(22, H * 0.12);
    if (ct === 'zip_horseshoe') {
      const xr = -L / 2 + rad, xf = L / 2 - rad;
      const zr = (x) => halfW(x) + 1;
      const pts = [v3(xr, y, zr(xr)), v3(xf, y, zr(xf)), v3(L / 2 + b * k + 1, y, 0), v3(xf, y, -zr(xf)), v3(xr, y, -zr(xr))];
      for (let i = 0; i < pts.length - 1; i++) grp.add(zipperRun(pts[i], pts[i + 1], hwm, { accentMat: accent }));
    } else {
      grp.add(zipperRun(v3(-L * 0.4, topY + 0.5, 0), v3(L * 0.4, topY + 0.5, 0), hwm, { accentMat: accent }));
    }
    // carry handle on top
    straps.push(strapRun(v3(-L * 0.14, topY + 6, 0), v3(L * 0.14, topY + 6, 0), v3(0, 1, 0), { width: 22 }));
  }

  // ---- trim ---------------------------------------------------------------------
  const seam = seamStrip(main, L * 0.99, 2.4, W * 0.99);
  seam.position.y = mount.baseH + H * vr.range(0.22, 0.3);
  grp.add(seam);
  if (feats.reflective) {
    const rs = reflectiveStrip(W * 0.5, 10);
    rs.rotation.y = -Math.PI / 2;
    rs.position.set(-L / 2 - b * k - 1.2, mount.baseH + H * 0.4, 0);
    grp.add(rs);
  }
  if (feats.cord) {
    const lat = bungeeLattice(hwm, { w: L * 0.6, h: W * 0.55, n: 3 });
    lat.rotation.x = -Math.PI / 2;
    lat.position.y = surfTop(0) + 3;
    grp.add(lat);
  }
  const nComp = feats.compressionStraps ?? 0;
  for (let i = 0; i < Math.min(nComp, 3) && !barrel; i++) {
    // horizontal compression strap round the side, low on the body
    const y = mount.baseH + H * (0.4 + i * 0.12);
    for (const s of [-1, 1]) {
      straps.push(strapRun(v3(-L * 0.36, y, s * (halfW(-L * 0.36) + 1)), v3(L * 0.36, y, s * (halfW(L * 0.36) + 1)), v3(0, 0, s), { width: 18 }));
    }
  }
  addPockets(grp, feats, main, hwm, {
    side: (make, i) => {
      const s = i % 2 === 0 ? 1 : -1;
      const g = make(Math.min(L * 0.55, 200), Math.min(H * 0.45, 130));
      g.position.set(0, mount.baseH + H * 0.42, s * (halfW(0) + 1));
      if (s < 0) g.rotation.y = Math.PI;
    },
    front: (make) => {
      const g = make(Math.min(W * 0.66, 150), Math.min(H * 0.45, 130));
      g.position.set(L / 2 + b * k + 1, mount.baseH + H * 0.38, 0);
      g.rotation.y = Math.PI / 2;
    },
    lid: (make) => {
      const g = make(Math.min(L * 0.5, 180), Math.min(W * 0.55, 140));
      g.position.set(0, topY + 4, 0);
      g.rotation.x = -Math.PI / 2;
    },
  });

  // ---- placement on the deck -----------------------------------------------
  const rack = rearRackOf(ctx);
  const deckTop = rack.topY + rack.railR;
  const deckLen = rack.x1 - rack.x0;
  const Lout = L + 2 * b * k;                                   // finished length
  // front flush with the deck front; shorter bags sit forward on the deck
  let front = rack.x1 - (Lout <= deckLen ? Math.min(12, (deckLen - Lout) / 2) : 0);
  // seatpost: the bag's front must stay behind it at the bag's top height
  const P = ctx.points;
  const yTopFrame = deckTop + topY;
  if (P?.seatTop && P?.sd) {
    const postX = P.seatTop.x + (P.sd.x / (P.sd.y || 1)) * (yTopFrame - P.seatTop.y);
    front = Math.min(front, postX - 16 - POST_CLEAR);
  }
  // saddle: rear edge and underside from the rails the bike publishes. Walk
  // the bag rearward until no part of its top profile under the saddle comes
  // within SADDLE_CLEAR of it; a front slope or chamfer lets it stay forward.
  if (ctx.rails?.left?.length) {
    const r0 = ctx.rails.left[0];
    const sL = ctx.geo?.saddleLength || 270;
    // shell rear = rail rear + 0.1 x saddle length, plus its edge bevel and the
    // few mm the -3 degree tilt adds; the underside sits just above the rails
    const saddleRear = r0.x - 0.1 * sL - 16;
    const saddleUnder = r0.y + 8;
    const topAt = (x) => profTop(x) + b * k + (isRoll ? 0 : 4);   // local x -> top above the base (lid 4)
    const clash = (f) => {
      const c = f - Lout / 2;
      for (let x = -Lout / 2; x <= Lout / 2 + 1; x += 5) {
        if (c + x < saddleRear - SADDLE_CLEAR) continue;
        if (deckTop + 0.6 + mount.baseH + topAt(x) > saddleUnder - SADDLE_CLEAR) return true;
      }
      return false;
    };
    for (let g = 0; g < 120 && clash(front); g++) front -= 5;
  }
  const cx = front - Lout / 2;
  const anchor = ctx.anchors.rackTop.position;
  grp.position.set(cx - anchor.x, deckTop + 0.6 - anchor.y, -anchor.z);

  // ---- attachment -----------------------------------------------------------------
  // rack rails in bag-local coordinates
  const ry = rack.topY - (deckTop + 0.6);
  const rz = rack.railZ;
  const lx0 = rack.x0 - cx, lx1 = rack.x1 - cx;               // deck span, local
  const onDeck = (x) => clamp(x, lx0 + 14, lx1 - 14);
  const hw = [];
  if (mount.kind === 'toplock' || mount.kind === 'deck' || mount.kind === 'track') {
    const plateL = Math.min(L * 0.86, (lx1 - lx0) - 10);
    const pc = (onDeck(-plateL / 2) + onDeck(plateL / 2)) / 2;
    if (mount.kind === 'toplock') {
      // two longitudinal rails under the base, just inside the rack rails
      for (const s of [-1, 1]) hw.push(boxAt(plateL, mount.baseH, 16, pc, mount.baseH / 2, s * (rz - 16)));
      hw.push(boxAt(18, mount.baseH * 0.6, (rz - 16) * 2, pc - plateL * 0.42, mount.baseH * 0.5, 0));
      hw.push(boxAt(18, mount.baseH * 0.6, (rz - 16) * 2, pc + plateL * 0.42, mount.baseH * 0.5, 0));
    } else if (mount.kind === 'track') {
      hw.push(boxAt(plateL, mount.baseH, 44, pc, mount.baseH / 2, 0));
    } else {
      hw.push(boxAt(plateL, mount.baseH, Math.min(W * 0.8, rz * 2 + 20), pc, mount.baseH / 2, 0));
    }
    grp.add(meshOf(hw, hwm));
    // clamp jaws closing under the rack rails
    const jaws = [];
    const nJ = mount.kind === 'track' ? 0 : 2;
    for (let i = 0; i < nJ; i++) {
      const x = onDeck(pc + (i ? 1 : -1) * plateL * 0.36);
      for (const s of [-1, 1]) {
        jaws.push(tubeWrap(v3(x, ry, s * rz), v3(1, 0, 0), rack.railR + 1.2,
          { width: 16, thick: 2.4, startAngle: s > 0 ? Math.PI * 0.5 : Math.PI * 0.5, sweep: s > 0 ? Math.PI * 1.25 : -Math.PI * 1.25 }));
      }
    }
    if (jaws.length) grp.add(meshOf(jaws, hwm));
  } else if (mount.kind === 'hooks') {
    for (const e of [-1, 1]) {
      const x = onDeck(e * L * 0.3);
      for (const s of [-1, 1]) {
        hw.push(tubeWrap(v3(x, ry, s * rz), v3(1, 0, 0), rack.railR + 1.2, { width: 14, thick: 2.4, startAngle: Math.PI * 0.5, sweep: s * Math.PI * 1.3 }));
      }
    }
    grp.add(meshOf(hw, new THREE.MeshStandardMaterial({ color: 0xa9adb3, roughness: 0.35, metalness: 0.8 })));
  } else {
    // webbing: each strap is a loop round a side rail, lying flat, pulled up
    // against the base; a girth strap goes round the whole bag and under both
    const n = mount.n || 2;
    for (let i = 0; i < n; i++) {
      const pairs = Math.max(1, Math.round(n / 2));
      const j = mount.kind === 'girth' ? i : i % pairs;
      const cnt = mount.kind === 'girth' ? n : pairs;
      const x = onDeck(cnt === 1 ? 0 : (j / (cnt - 1) - 0.5) * Math.min(L * 0.6, (lx1 - lx0) - 40));
      if (mount.kind === 'girth') {
        const pts = [];
        const hz = halfW(x) + 1;
        const yc = mount.baseH + H * 0.5;
        for (let t = 0; t < 28; t++) {
          const a = (t / 28) * Math.PI * 2;
          let y = yc + Math.sin(a) * (H * 0.5 + b * k + 1.5), z = Math.cos(a) * hz;
          if (y < ry - rack.railR - 1.5) y = ry - rack.railR - 1.5;   // under the rails
          pts.push(v3(x, y, z));
        }
        straps.push(ribbonLoop(pts, v3(1, 0, 0), v3(x, yc, 0), { width: 24, lift: 0.8 }));
        metal.push(...buckle(v3(x, yc, hz + 1), v3(0, 1, 0), v3(0, 0, 1), { width: 22 }));
      } else {
        const s = i < pairs ? 1 : -1;
        if (n <= 2) {
          for (const ss of [-1, 1]) straps.push(tubeWrap(v3(x, ry, ss * rz), v3(1, 0, 0), rack.railR + 0.6, { width: 22 }));
        } else {
          straps.push(tubeWrap(v3(x, ry, s * rz), v3(1, 0, 0), rack.railR + 0.6, { width: 22 }));
        }
      }
    }
  }
  if (straps.length) grp.add(meshOf(straps, wm));
  if (metal.length) grp.add(meshOf(metal, hwm));

  // brand marks: the rear face and the drive side
  patch(grp, brand, -L / 2 - b * k - 1.6, mount.baseH + H * 0.58, 0, Math.min(70, W * 0.5), -Math.PI / 2);
  patch(grp, brand, L * 0.08, mount.baseH + H * 0.56, halfW(L * 0.08) + 1.6, Math.min(84, L * 0.3), 0);
  return shadowify(grp);
}

/**
 * A rounded box with an even grid over every face, so the warps above (taper,
 * front slope, chamfer) bend the faces rather than just moving the corner
 * rows: three's RoundedBoxGeometry has no vertices in the middle of a face,
 * which turned a small top-front chamfer into a wedge the length of the bag.
 */
function gridRoundedBox(L, H, W, r) {
  const step = Math.max(6, r / 2.5);
  const g0 = new THREE.BoxGeometry(L, H, W, Math.ceil(L / step), Math.ceil(H / step), Math.ceil(W / step));
  g0.deleteAttribute('normal');
  g0.deleteAttribute('uv');
  const g = mergeVertices(g0);
  const pos = g.attributes.position;
  const hx = L / 2 - r, hy = H / 2 - r, hz = W / 2 - r;
  const p = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    c.set(clamp(p.x, -hx, hx), clamp(p.y, -hy, hy), clamp(p.z, -hz, hz));
    const d = p.clone().sub(c);
    if (d.lengthSq() > 1e-9) p.copy(c).addScaledVector(d.normalize(), r);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return g;
}

/** A box geometry of size (sx, sy, sz) centred at (x, y, z). */
function boxAt(sx, sy, sz, x, y, z) {
  const g = new THREE.BoxGeometry(Math.max(sx, 0.5), Math.max(sy, 0.5), Math.max(sz, 0.5));
  g.translate(x, y, z);
  return g;
}
