// Fork bag builder (mm-local, parented to the forkL / forkR anchor).
//
// ---- WHAT IT IS (owner) ----------------------------------------------------
// "A fork bag is a cage bolted to the leg holding a dry sack, clear of spokes
// and rotor." So three objects, built in this order from the blade outward:
//   1. the CARRIER, bolted to the blade: a flat backing plate held by two hex
//      bolts, with two cradle arms under the base of the bag (cargo cage), or
//      a mount rail with a clamp block (a bag with its own integrated mount:
//      Ortlieb Quick-Lock, Topeak bolt-on, Oveja Negra direct mount). Either
//      way it still reads as a soft bag on a mount, never as a moulded box.
//   2. the DRY SACK: a soft lofted body, flat face against the carrier,
//      rounded outboard, closed at the top by a FLATTENED ROLLED LIP (a
//      squashed roll of fabric with a strap over it and a buckle on the
//      outboard face), not a dome.
//   3. two THIN STRAPS (straps.js ribbons, 20 mm) round the sack and the
//      cage plate, buckles outboard. Integrated-mount bags have none.
//
// ---- AXIS MAPPING (BUILDER-BRIEF Rule 2) -----------------------------------
// Everything is built in one frame, `leg`, whose origin is ON the blade's
// centreline at the height of the bag's base:
//   leg +y   UP the fork blade (the chord of the blade over the bag's span,
//            taken from the blade's own curve, so it leans up and BACK and
//            follows the blade's inward splay too)
//   leg +x   forward, square to the blade in the bike's plane
//   leg +z   across the bike; `side * +z` is outboard (side -1 = forkL, the
//            brake side; +1 = forkR, the drive side)
// Catalogue axes, from `mount.axes` in data/models/*.json (checked 25 Sep for
// all 29 records in this slot):
//   `along_forkleg` (or a lone `y`)  -> leg +y, the bag's height `along`
//   `z` / `+z`                       -> leg z, the across-bike width
//   `x` / `+x` / `perp_forkleg`      -> leg x, the fore-aft depth
// e.g. Apidura Cargo Cage { len: perp_forkleg, wid: z, hgt: along_forkleg },
// Ortlieb Fork-Pack { len: +x, wid: +z, hgt: along_forkleg }, Topeak
// { len: along_forkleg, wid: z, hgt: x }. Records that name an axis twice
// (Alpkit `len: y, hgt: y`; Road Runner `wid: +x, hgt: +x`; Cedaero
// `len: y` + `hgt: along_forkleg`) are resolved by size in forkAxes().
// Rogue Panda's Gila (`len: z`, 559 mm across, attachesTo handlebar_harness)
// is a handlebar bag filed in this slot; it is drawn along the leg, capped at
// what a fork leg can carry, and reported.
//
// Taper: in this slot a taper always narrows toward the BASE, whichever end
// the record calls `nose`. The Tailfin Fork Pack record writes nose 1 ->
// tail 0.6 while its notes say "wider at the shoulders and tapering to a
// narrower rounded base", and a roll-top mouth is by construction the full
// width of the bag. The notes win.
//
// ---- PLACEMENT (every value derived from the bike, Rule 1) ------------------
//   blade          the `fork leg` mesh itself (ctx.frameGroup, userData.part),
//                  its TubeGeometry path and radius; bike.js literals are only
//                  a fallback if that mesh is not found
//   stack          blade surface -> plate (PLATE_T) -> CAGE_DEPTH gap -> fabric
//   floor          everything else round the front hub on THIS side (hub,
//                  flange, and on the brake side the rotor and caliper), found
//                  by scanning ctx.frameGroup: fabric >= CLEAR above it, the
//                  plate's lower bolt >= 6 mm above it. So the brake-side bag
//                  stands higher than the drive-side one.
//   base           a fifth of the leg above the axle, or the floor if higher
//   top            under 90% of the leg (hands and bar ends), base lowered
//                  toward the floor for a tall bag before the top overruns
// Spokes and rotor are all inboard of the blade (spokes |z| <= 39, rotor
// |z| = 40); the fabric starts CAGE_DEPTH + PLATE_T outboard of the blade's
// surface, so the across-bike gap alone is >= 30 mm, and the floor adds the
// vertical gap over the caliper.

import * as THREE from 'three';
import { v3 } from '../../lib.js';
import { reflectiveStrip, zipperRun } from '../features.js';
import { seamCurve } from '../hardware.js';
import { axesOf, featuresOf, geomOf, stiffnessOf, variantOf } from '../identity.js';
import { loftBody, sectionFor, sectionUnit } from '../loft.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';
import { buckle, meshOf, ribbonLoop, strapRun } from '../straps.js';

const KEYS = ['len', 'wid', 'hgt'];
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

// Stuffing allowance: the section is drawn this far inside the published box
// so soft()'s outward displacement lands on it.
const SKIN = 1.5;
// Carrier: backing plate thickness, and how far a cage (or an integrated
// mount's clamp block) holds the bag off that plate. Blackburn Outpost /
// Salsa Anything class.
const PLATE_T = 4;
const CAGE_DEPTH = 18;
// How far the plate runs on below the bag, carrying the lower bolt where it
// can be seen, and the bolt spacing up the plate (three-pack bosses are 64 mm
// apart; a cage bolts the outer two).
const PLATE_DROP = 24;
const BOLT_PITCH = 128;
// Required clearance to anything on the wheel that is not the blade.
const CLEAR = 15;

/**
 * Which catalogue dim runs along the leg, across the bike and fore-aft.
 * `along_forkleg` (or a `y`) wins for the long axis, taking the largest
 * candidate where a record names two; `z` is across; `x` / `perp_*` is
 * fore-aft; leftovers by size. A record that makes the bag wider than it is
 * tall has the two swapped: nothing strapped to a blade is wider than long.
 */
function forkAxes(p) {
  const ax = axesOf(p);
  const mm = { len: p.mm.len, wid: p.mm.wid, hgt: p.mm.hgt };
  const bySize = KEYS.filter((k) => mm[k] > 0).sort((a, b) => mm[b] - mm[a]);
  const upish = bySize.filter((k) => ax.alongTube(k) || /^[-+]?y$/.test(String(ax[k] ?? '')));
  const along = upish[0] ?? bySize[0] ?? 'hgt';
  const rest = KEYS.filter((k) => k !== along);
  let across = rest.find((k) => ax.isAcross(k)) ?? null;
  const isPerp = (k) => /^perp_/.test(String(ax[k] ?? ''));
  let fore = rest.find((k) => k !== across && (ax.isForeAft(k) || isPerp(k))) ?? null;
  if (!across) across = rest.find((k) => k !== fore && bySize.includes(k)) ?? rest[0];
  if (!fore) fore = rest.find((k) => k !== across) ?? rest[1];
  const out = { along: mm[along] || 0, across: mm[across] || 0, fore: mm[fore] || 0 };
  if (out.across > out.along) { const t = out.along; out.along = out.across; out.across = t; }
  return out;
}

/** The fork blade on this side: its centreline curve (crown t=0 -> axle t=1) and radius. */
function bladeOf(ctx, side) {
  let found = null;
  const F = ctx.frameGroup;
  if (F && F.traverse) {
    F.traverse((o) => {
      if (found || !o.isMesh || o.userData?.part !== 'fork leg') return;
      const path = o.geometry?.parameters?.path;
      if (!path) return;
      o.updateMatrix();
      const m = path.getPoint(0.5).applyMatrix4(o.matrix);
      if (Math.sign(m.z) !== side) return;
      const M = o.matrix.clone();
      found = { at: (t) => path.getPoint(t).applyMatrix4(M), r: o.geometry.parameters.radius || 12 };
    });
  }
  if (found) return found;
  // Fallback only: the same construction src/bike.js uses for the blade.
  const P = ctx.points;
  const crown = v3(P.headBottom.x + P.hd.x * 20, P.headBottom.y + P.hd.y * 20, side * 30);
  const axle = v3(P.frontAxle.x, P.frontAxle.y, side * 48);
  return { at: (t) => crown.clone().lerp(axle, t), r: 12 };
}

/** Blade centreline point at world height y (bisection on the curve). */
function bladeAtY(blade, y) {
  let lo = 0, hi = 1;
  const yTop = blade.at(0).y, yBot = blade.at(1).y;
  if (y >= yTop) return blade.at(0);
  if (y <= yBot) return blade.at(1);
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (blade.at(mid).y > y) lo = mid; else hi = mid;
  }
  return blade.at((lo + hi) / 2);
}

/**
 * The top of everything round the front hub on this side of the wheel plane
 * that is not the blade: hub body, flange and, on the brake side, the rotor
 * and caliper. Found by scanning the bike, so the brake-side bag stands clear
 * of whatever caliper is actually drawn. Tyre, rim, spokes and frame tubes are
 * excluded by size (each spans more than `big`); bags hang off anchors and are
 * skipped with them.
 */
function wheelFloor(ctx, side, axle) {
  const F = ctx.frameGroup;
  const rotorR = (ctx.geo?.rotor || 160) / 2;
  const reach = rotorR + 60;
  const big = rotorR * 2.5;
  let top = axle.y;
  if (!F || !F.traverse) return axle.y + rotorR + 20;
  F.updateMatrixWorld(true);
  const inv = F.matrixWorld.clone().invert();
  const M = new THREE.Matrix4();
  const box = new THREE.Box3();
  const walk = (o) => {
    if (String(o.name || '').startsWith('anchor:') || o.visible === false) return;
    if (o.isMesh && o.geometry && o.userData?.part !== 'fork leg') {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      M.multiplyMatrices(inv, o.matrixWorld);
      box.copy(o.geometry.boundingBox).applyMatrix4(M);
      const ok = Math.max(box.max.x - box.min.x, box.max.y - box.min.y) < big
        && Math.hypot((box.max.x + box.min.x) / 2 - axle.x, (box.max.y + box.min.y) / 2 - axle.y) < reach
        && (side > 0 ? box.max.z : -box.min.z) > 20;
      if (ok) top = Math.max(top, box.max.y);
    }
    for (const c of o.children) walk(c);
  };
  for (const c of F.children) walk(c);
  return top;
}

/** 2D convex hull (monotone chain) over [x, z] pairs, CCW. */
function hull2(pts) {
  const s = pts.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (src) => {
    const h = [];
    for (const p of src) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(s), ...half(s.slice().reverse())];
}

/**
 * The mounting system, decided from what the record says, never from a brand:
 * a named integrated mount (Quick-Lock, X-Clamp, bolt-on, direct mount, a
 * mount rail) that does not also name a cage -> 'plate'; everything else sits
 * in a cargo cage. `mount.attachesTo` would say this outright but is not
 * merged into data/brands.json, so the Tailfin Fork Pack (whose record names
 * `tailfin_fork_pack_mount` there and nothing in `features.attachment`) still
 * gets a cage. See the report.
 */
function mountKind(p) {
  const text = `${p.features?.attachment || ''} ${p.name || ''} ${p.line || ''}`;
  const CAGE = /\b(cargo[-\s]?cage|anything[-\s]?cage|cage)\b/i;
  const PLATE = /\b(quick[-\s]?lock|x[-\s]?clamp|mount(ing)? plate|alloy rail|mount(ing)? rail|bolt[-\s]?on|direct[-\s]?mount)\b/i;
  return PLATE.test(text) && !CAGE.test(p.features?.attachment || '') ? 'plate' : 'cage';
}

export function buildForkbag(p, brand, main, accent, ctx, side) {
  side = side > 0 ? 1 : -1;
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const geom = geomOf(p);
  const stiff = stiffnessOf(p);
  const wm = webbing();
  const hwm = hardware();
  const cageMat = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, metalness: 0.8, roughness: 0.42 });
  const kind = mountKind(p);

  // ---- the bike ------------------------------------------------------------
  const P = ctx.points;
  const axle = P.frontAxle;
  const blade = bladeOf(ctx, side);
  const bladeR = blade.r;
  const crownPt = blade.at(0);
  const legLen = Math.max(crownPt.y - axle.y, 1);
  const anchor = ctx.anchors[side > 0 ? 'forkR' : 'forkL'].position;

  // ---- the bag's own numbers ---------------------------------------------
  const dim = forkAxes(p);
  // CAPS, reported rather than hidden: a fork leg carries at most ~1.2 legs of
  // bag before the top reaches the bar, and ~15 cm across before the outboard
  // face reaches the drops. Only records beyond what any fork carries hit
  // them: Rogue Panda Gila (559 x 216, a handlebar bag filed here), WOHO
  // XTouring 15L (440 x 200), Topeak QR Fork DryBag (435 x 160), Road Runner
  // Buoy (216). Uncapped, WOHO reached the drops and the resolver dropped it.
  const along = Math.min(dim.along || 300, legLen * 1.2);
  const across = Math.min(dim.across || 120, 150);
  const fore = Math.min(dim.fore || across, 150);
  const A0 = Math.max(across / 2 - SKIN, 8);          // half across (z)
  const B0 = Math.max(fore / 2 - SKIN, 8);            // half fore-aft (x)

  const closure = p.closure?.type || 'rolltop';
  const rolled = closure === 'rolltop';
  const rolls = clamp(p.closure?.rolls ?? 3, 1, 4);
  // The rolled lip comes OUT of the published height (render.hgt_cm is the
  // packed, rolled height). Its thickness grows with the number of turns.
  const rollR = rolled ? clamp(Math.min(A0, B0) * (0.16 + 0.03 * rolls), 6, 15) : 0;
  const rollH = rolled ? rollR * 1.7 : 0;
  const bodyLen = along - rollH;

  // ---- silhouette ----------------------------------------------------------
  const ratio = geom.taperRatio != null ? clamp(geom.taperRatio, 0.5, 1) : 1;
  const NECK = rolled ? 0.13 : 0;                      // mouth pinching to the lip
  const lipA = rollR * 0.95;
  const sectionAt = (t) => {
    const k = ratio + (1 - ratio) * t;                 // narrow at the base
    const ease = t < 0.07 ? 0.86 + 0.14 * Math.sqrt(t / 0.07) : 1;
    let a = A0 * Math.sqrt(k) * ease, b = B0 * k * ease;
    if (NECK && t > 1 - NECK) {
      const u = (t - (1 - NECK)) / NECK;
      const s = u * u * (3 - 2 * u);
      a = a + (lipA - a) * s;                          // flattened across
      b = b * (1 + 0.05 * s);                          // and spread fore-aft
    } else if (!rolled && t > 0.93) {
      const u = (t - 0.93) / 0.07;
      a *= 1 - 0.18 * u * u; b *= 1 - 0.12 * u * u;   // a closed, rounded top
    }
    // the flat back stays on the carrier: pin the inboard face at -A0 up to
    // the neck; the neck itself is centred, as a rolled mouth is
    const pin = NECK && t > 1 - NECK ? 1 - (t - (1 - NECK)) / NECK : 1;
    return { a, b, cu: (a - A0) * pin };
  };
  const xs = sectionFor(geom.crossSection, 'd_shape');

  // ---- where on the leg ----------------------------------------------------
  // The fabric's inboard face is PLATE_T + CAGE_DEPTH off the blade surface.
  const faceOff = bladeR + PLATE_T + CAGE_DEPTH;      // blade axis -> fabric (leg z)
  const cz = side * (faceOff + A0);                    // bag axis, leg z
  // First pass for the lean: the whole blade chord.
  const chord = blade.at(0).clone().sub(blade.at(1)).normalize();
  const sinL = Math.abs(chord.x), cosL = Math.abs(chord.y);
  const floorY = wheelFloor(ctx, side, axle);
  const minBase = Math.max(
    floorY + CLEAR + B0 * sinL + 4,                    // fabric's rear-bottom corner
    floorY + 6 + PLATE_DROP * cosL,                    // the plate's foot and lower bolt
  );
  const prefBase = Math.max(minBase, axle.y + legLen * 0.2);
  const topCap = axle.y + legLen * 0.9;
  const baseY = Math.max(minBase, Math.min(prefBase, topCap - along * cosL));

  // The leg frame: origin on the blade centreline at the base, +y along the
  // blade's own chord over the bag's span.
  const B = bladeAtY(blade, baseY);
  const T = bladeAtY(blade, Math.min(baseY + along * cosL, crownPt.y - 5));
  const Y = T.clone().sub(B);
  if (Y.lengthSq() < 1) Y.copy(chord);
  Y.normalize();
  const Z = v3(0, 0, 1).addScaledVector(Y, -Y.z).normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
  const leg = new THREE.Group();
  leg.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  leg.position.set(B.x - anchor.x, B.y - anchor.y, B.z - anchor.z);
  grp.add(leg);

  // ---- body ----------------------------------------------------------------
  const loft = loftBody({ len: bodyLen, rings: 26, shape: xs, sectionAt });
  const bodyAmp = stiff === 'soft' ? vr.range(1.6, 2.3) : vr.range(1.2, 1.6);
  const shell = soft(loft.geo, main, {
    amp: bodyAmp, freq: vr.range(0.028, 0.04), seed: vr.seed % 919, stiffness: stiff,
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.5,
  });
  // The loft's +u (the section's flat run is on -u) goes OUTBOARD; its v runs
  // fore-aft. A quarter turn about y does that: +u -> side*z, +v -> -side*x.
  const bodyG = new THREE.Group();
  bodyG.rotation.y = -side * Math.PI / 2;
  bodyG.position.set(0, 0, cz);
  bodyG.add(shell);
  const seamGeos = [];
  for (const line of loft.seams) {
    const sp = line.filter((_, i) => i % 2 === 0 && (!NECK || i / (line.length - 1) < 1 - NECK));
    if (sp.length > 2) {
      const s = seamCurve(main, sp, 0.8);
      s.userData.noCollide = true;
      bodyG.add(s);
    }
  }
  leg.add(bodyG);

  // Section outline in LEG coordinates at station t, pushed out by `lift`.
  const { pts: unit } = sectionUnit(xs, { detail: 4 });
  const outline = (t, lift) => {
    const s = sectionAt(t);
    return unit.map(([u, v]) => {
      const lv = v * s.b;
      const r = Math.hypot(u * s.a, lv) || 1;
      const k = (r + lift) / r;
      return [-side * lv * k, cz + side * (s.cu + u * s.a * k)];    // [x, z]
    });
  };
  const outFace = (t) => { const s = sectionAt(t); return cz + side * (s.cu + s.a); };
  const inFace = (t) => { const s = sectionAt(t); return cz + side * (s.cu - s.a); };

  const strapGeos = [], hwGeos = [], cageGeos = [];

  // ---- the carrier -----------------------------------------------------------
  const plateZ = side * (bladeR + PLATE_T / 2);       // plate centre, leg z
  const plateOut = side * (bladeR + PLATE_T);          // its outboard face
  const cageTop = kind === 'cage' ? bodyLen * 0.74 : Math.min(bodyLen * 0.62, 170);
  const plateBot = -PLATE_DROP;
  const plateW = kind === 'cage' ? 22 : 34;
  {
    const g = new THREE.BoxGeometry(plateW, cageTop - plateBot, PLATE_T);
    g.translate(0, (cageTop + plateBot) / 2, plateZ);
    cageGeos.push(g);
  }
  // Two hex bolts through the plate into the blade's bosses: the lower one on
  // the plate's tail below the bag, where it shows.
  const boltY = [plateBot + 9, Math.min(plateBot + 9 + BOLT_PITCH, cageTop - 10)];
  for (const y of boltY) {
    const head = new THREE.CylinderGeometry(4.6, 4.6, 3.6, 6);
    head.rotateX(Math.PI / 2);
    head.translate(0, y, plateOut + side * 1.8);
    hwGeos.push(head);
    const washer = new THREE.CylinderGeometry(6, 6, 1, 16);
    washer.rotateX(Math.PI / 2);
    washer.translate(0, y, plateOut + side * 0.5);
    hwGeos.push(washer);
  }

  if (kind === 'cage') {
    // Cradle: two arms off the plate's foot running out under the base, each
    // turned up in a lip just outboard of the fabric, joined by a bar.
    const zOut = Math.abs(outFace(0)) + 3;
    const zIn = Math.abs(plateOut);
    const s0 = sectionAt(0.02);
    for (const xf of [-0.5, 0.5]) {
      const x = xf * s0.b * 1.3;
      const arm = new THREE.BoxGeometry(7, 3, zOut - zIn);
      arm.translate(x, -2.5, side * (zIn + zOut) / 2);
      cageGeos.push(arm);
      const lip = new THREE.BoxGeometry(7, 18, 3);
      lip.translate(x, 5, side * zOut);
      cageGeos.push(lip);
      // the arm's root, bent down the plate
      const root = new THREE.BoxGeometry(7, 14, 3);
      root.translate(x, -8, side * (zIn + 1.5));
      cageGeos.push(root);
    }
    const bar = new THREE.BoxGeometry(s0.b * 1.3 + 7, 4, 3);
    bar.translate(0, 13, side * zOut);
    cageGeos.push(bar);
    // top arm: a short hoop off the plate head that the upper strap threads
    const hoopY = cageTop - 4;
    const hz = Math.abs(inFace(hoopY / bodyLen)) - 1;
    const hoop = new THREE.BoxGeometry(7, 3, Math.max(hz - zIn, 2));
    hoop.translate(0, hoopY, side * (zIn + hz) / 2);
    cageGeos.push(hoop);
  } else {
    // Integrated mount: the bag's own clamp block standing off the rail and
    // spreading across its flat back.
    const blockZ = Math.abs(plateOut), blockZ1 = Math.abs(inFace(0.4)) + 1;
    const yA = 14, yB = cageTop - 6;
    const block = new THREE.BoxGeometry(Math.min(B0 * 1.1, 48), (yB - yA) * 0.9, blockZ1 - blockZ);
    block.translate(0, (yA + yB) / 2, side * (blockZ + blockZ1) / 2);
    cageGeos.push(block);
    // the clamp lever on its forward edge
    const lever = new THREE.BoxGeometry(6, 34, 9);
    lever.translate(Math.min(B0 * 0.55, 24) + 3, yB - 24, side * (blockZ + blockZ1) / 2);
    hwGeos.push(lever);
  }
  leg.add(meshOf(cageGeos, cageMat));

  // ---- two thin straps round sack and cage ----------------------------------
  if (kind === 'cage') {
    const lift = bodyAmp * 0.7 + 0.6;
    for (const t of [0.3, 0.64]) {
      const y = t * bodyLen;
      const ring = hull2([...outline(t, lift),
        [plateW / 2 + 1, plateOut + side * 0.6], [-plateW / 2 - 1, plateOut + side * 0.6]]);
      const pts = ring.map(([x, z]) => v3(x, y, z));
      strapGeos.push(ribbonLoop(pts, v3(0, 1, 0), v3(0, y, cz), { width: 20, lift: 0.3 }));
      const s = sectionAt(t);
      hwGeos.push(...buckle(v3(-side * s.b * 0.15, y, outFace(t) + side * (lift + 1.8)), v3(1, 0, 0), v3(0, 0, side), { width: 18 }));
    }
  }

  // ---- the closure ---------------------------------------------------------
  if (rolled) {
    // A flattened roll of fabric lying fore-aft across the mouth, rolled
    // toward the outboard face, its ends pinched thinner than its middle.
    const s1 = sectionAt(1);
    const lipLen = s1.b * 2 * 1.03;
    const rg = new THREE.CylinderGeometry(rollR, rollR, lipLen, 20, 8);
    {
      const pos = rg.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const yy = pos.getY(i) / (lipLen / 2);
        const k = 1 - 0.28 * Math.max(0, Math.abs(yy) - 0.7) / 0.3;
        pos.setX(i, pos.getX(i) * k);
        pos.setZ(i, pos.getZ(i) * k);
      }
      rg.computeVertexNormals();
    }
    rg.rotateZ(Math.PI / 2);                           // along x
    rg.scale(1, 0.78, 1);                              // folded flat before it rolls
    const rcY = bodyLen + rollR * 0.62;
    const rcZ = cz + side * rollR * 0.25;
    rg.translate(0, rcY, rcZ);
    const roll = soft(rg, main, { amp: 0.6, freq: 0.08, seed: (vr.seed % 97) + 3, stiffness: stiff });
    leg.add(roll);
    // the last turn's folded edge, a crease along the roll
    const creaseGeos = [];
    for (const [dy, dz] of [[rollR * 0.5, rollR * 0.62], [-rollR * 0.35, rollR * 0.75]]) {
      const c = new THREE.BoxGeometry(lipLen * 0.9, 1.1, 1.1);
      c.translate(0, rcY + dy, rcZ + side * dz);
      creaseGeos.push(c);
    }
    leg.add(meshOf(creaseGeos, new THREE.MeshStandardMaterial({ color: main.color.clone().multiplyScalar(0.55), roughness: 0.95 })));
    // One strap over the roll, inboard face -> over -> down the outboard face
    // to a side-release buckle.
    const rr = rollR + 1.6;
    const tIn = 1 - NECK - 0.05, tOut = 1 - NECK - 0.12;
    const lift = bodyAmp * 0.6 + 1.2;
    const path = [];
    for (let i = 0; i <= 6; i++) {                     // up the inboard face and the neck
      const t = tIn + (1 - tIn) * (i / 6);
      path.push(v3(0, Math.min(t * bodyLen, bodyLen - 2), inFace(t) - side * lift));
    }
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI - (i / 10) * Math.PI;          // inboard -> over -> outboard
      path.push(v3(0, rcY + Math.sin(a) * rr * 0.8, rcZ + side * Math.cos(a) * rr));
    }
    for (let i = 0; i <= 6; i++) {                     // down the neck and the outboard face
      const t = 1 - (1 - tOut) * (i / 6);
      path.push(v3(0, Math.min(t * bodyLen, bodyLen - 2), outFace(t) + side * lift));
    }
    strapGeos.push(ribbonLoop(path, v3(1, 0, 0), v3(0, rcY - rollR, cz), { width: 18, lift: 0.2, closed: false }));
    const by = (1 - NECK - 0.07) * bodyLen;
    hwGeos.push(...buckle(v3(0, by, outFace(by / bodyLen) + side * (bodyAmp * 0.7 + 1.2)), v3(0, 1, 0), v3(0, 0, side), { width: 18 }));
  } else if (closure === 'flap_buckle') {
    // A flap over the top, down the outboard face, buckled.
    const s1 = sectionAt(1);
    const flap = new THREE.BoxGeometry(s1.b * 2.1, 3, s1.a * 2.1);
    flap.translate(0, bodyLen + 1.5, cz + side * s1.cu);
    const drop = new THREE.BoxGeometry(s1.b * 1.9, 46, 3);
    drop.translate(0, bodyLen - 22, outFace(0.95) + side * 2.5);
    leg.add(meshOf([flap, drop], accent, { noCollide: true }));
    const yb = bodyLen - 50;
    strapGeos.push(strapRun(v3(0, bodyLen - 40, outFace(0.9) + side * 4), v3(0, yb - 30, outFace(yb / bodyLen) + side * 1.5), v3(0, 0, side), { width: 18 }));
    hwGeos.push(...buckle(v3(0, yb, outFace(yb / bodyLen) + side * 2.5), v3(0, 1, 0), v3(0, 0, side), { width: 18 }));
  } else if (/zip/.test(closure)) {
    // Front-panel zip, top to near the base, on the forward face.
    const x = sectionAt(0.5).b + bodyAmp * 0.6 + 1;
    const zc = cz + side * sectionAt(0.5).cu;
    leg.add(zipperRun(v3(x, bodyLen * 0.12, zc), v3(x, bodyLen * 0.9, zc), hwm));
  }

  // ---- trim ------------------------------------------------------------------
  if (feats.reflective) {
    for (const dx of [-5, 5]) {
      const st = reflectiveStrip(3, Math.min(along * 0.12, 30));
      st.position.set(dx, bodyLen * 0.8, outFace(0.8) + side * (bodyAmp + 0.6));
      if (side < 0) st.rotation.y = Math.PI;
      leg.add(st);
    }
  }
  // Logo on the outboard face, between the straps.
  patch(leg, brand, 0, bodyLen * 0.5 + vr.j(bodyLen * 0.02), outFace(0.5) + side * (bodyAmp + 1.2),
    Math.min(60, fore * 0.7), side > 0 ? 0 : Math.PI);

  if (strapGeos.length) leg.add(meshOf(strapGeos, wm));
  if (hwGeos.length) leg.add(meshOf(hwGeos, hwm));
  return shadowify(grp);
}
