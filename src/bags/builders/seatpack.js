// Seat pack builder (mm-local, parented to the seatpack anchor).
//
// ---- AXIS MAPPING (BUILDER-BRIEF Rule 2) ---------------------------------
// Checked against `mount.axes` on the seat pack records — 76 of 78 say
// { len: '-x', wid: 'z', hgt: 'y' } (Ortlieb writes hgt '-y', same axis):
//
//   p.mm.len → grp-local −x   front face at x = 0 against the post, the rolled
//                             tail at x = −len
//   p.mm.hgt → grp-local  y   the depth at the SHOULDER, the deepest station
//   p.mm.wid → grp-local  z   the width at the shoulder, across the bike
//
// The body is lofted along the loft's own +y and turned onto −x (`rolled`),
// so the loft parameter t runs 0 at the post → 1 at the tail.
//
// ---- WHAT IT IS (owner's description, and the photo traces agree) ---------
// A tapered WEDGE: a squared shoulder under the rails at the post — the pack
// is deepest and widest right there — tapering in depth and width to a
// flattened roll of fabric at the tail, which kicks gently upward. Not a hull
// (deep in the middle), not a tube, not fat at the tail. The previous builder
// swept Apidura's dimension-DRAWING outlines, which are traced sausages with
// two rounded ends, and oriented them "narrow end at the post"; that is the
// gravy boat the owner saw. The 3/4 PHOTO traces of the same bags show a
// short nose, full depth almost at once, and a steady taper: this.
//
// Two families:
//   wedge   — tapered_wedge, teardrop, truncated_cylinder, rounded_box, slab:
//             one sewn or welded body, roll-top (or zip) at the tail
//   holster — a stiff cradle strapped to post and rails, with a round dry bag
//             slid into it from behind and rolled shut at the tail (Revelate
//             Terrapin, Restrap, Topeak BackLoader X)
//
// ---- PLACEMENT (every value derived from the bike, Rule 1) ----------------
//   top of the pack      just under ctx.rails, touching them (strap thickness)
//   front face           against the seatpost, from ctx.points.sd / seatTop
//   tilt                 tail up 7–9°, more if the tail would reach the tyre
//   tyre                 ≥ 18 mm from rearAxle + tireR + tireWidth/2
//   frame                nose above ctx.framePoly[1] + its tube radius
// Nothing here is a literal offset off a screenshot.

import * as THREE from 'three';
import { v3, deg } from '../../lib.js';
import { loftBody, sectionFor, sectionUnit } from '../loft.js';
import { featuresOf, geomOf, stiffnessOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing, seamMat } from '../materials.js';
import { buckle, meshOf, ribbonLoop, strapRun, tubeWrap } from '../straps.js';

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * A dry bag lying ACROSS the bike behind the saddle, on a rigid arm off the
 * seatpost: Arkel's Rollpacker Rear (closed width 38, height 24, depth 28 —
 * Arkel's own figures). Its record is right that `wid` runs across; the old
 * builder drew that box literally and it read as a microwave. It is a fat
 * roll, closed at BOTH ends like a bar roll.
 */
function buildTransverse(p, brand, main, accent, ctx, vr) {
  const grp = new THREE.Group();
  const across = clamp(p.mm.wid, 200, 480), depth = clamp(p.mm.len, 150, 340), tall = clamp(p.mm.hgt, 150, 320);
  const r = Math.min(depth, tall) / 2;
  const endRoll = clamp(r * 0.3, 14, 30);
  const bodyW = across - endRoll * 2.2;
  // a round bag whose ends pinch into the flat mouths that get rolled: the
  // last stretch of each end narrows fore-aft (the mouth pressed flat) while
  // keeping its height, so there is no flat disc anywhere
  const bg = new THREE.CylinderGeometry(r, r, bodyW, 36, 16);
  {
    const pos = bg.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);                    // along the cylinder = across the bike
      const e = smooth(bodyW * 0.28, bodyW * 0.5, Math.abs(y));
      pos.setX(i, pos.getX(i) * (1 - 0.72 * e));
      pos.setZ(i, pos.getZ(i) * (1 - 0.12 * e));
    }
    bg.computeVertexNormals();
  }
  const body = new THREE.Mesh(bg, main);
  body.rotation.x = Math.PI / 2;
  body.scale.set(depth / (2 * r), 1, tall / (2 * r));
  grp.add(body);
  const strapGeos = [], hwGeos = [];
  for (const s of [1, -1]) {
    // each end: the mouth pinched flat and rolled — a squashed bar standing
    // up across the end, not a dome
    const lip = new THREE.Mesh(new THREE.BoxGeometry(depth * 0.24, tall * 0.8, endRoll * 0.9), main);
    lip.position.set(0, 0, s * (bodyW / 2 + endRoll * 0.45));
    grp.add(lip);
    const rollBar = new THREE.Mesh(new THREE.CylinderGeometry(endRoll * 0.55, endRoll * 0.55, tall * 0.86, 16), main);
    rollBar.scale.set(0.85, 1, 1);
    rollBar.position.set(0, 0, s * (bodyW / 2 + endRoll * 1.2));
    grp.add(rollBar);
    // the buckle strap that holds the roll down
    const pts = [];
    for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI; pts.push(v3(Math.cos(a) * (depth / 2 + 1), Math.sin(a) * (tall / 2 + 1) - tall * 0.05, s * (bodyW / 2 - 8))); }
    strapGeos.push(ribbonLoop(pts, v3(0, 0, 1), v3(0, 0, s * (bodyW / 2 - 8)), { width: 20, closed: false, lift: 0.3 }));
  }
  // two straps round the roll into the cradle
  for (const z of [-bodyW * 0.22, bodyW * 0.22]) {
    const pts = [];
    for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; pts.push(v3(Math.cos(a) * depth / 2, Math.sin(a) * tall / 2, z)); }
    strapGeos.push(ribbonLoop(pts, v3(0, 0, 1), v3(0, 0, z), { width: 22, lift: 1.4 }));
    hwGeos.push(...buckle(v3(0, tall / 2 + 2, z), v3(1, 0, 0), v3(0, 1, 0), { width: 20 }));
  }
  // placement: a rigid arm off the seatpost carries the cradle; the roll sits
  // just under the saddle's tail and clear of the tyre
  const P = ctx.points;
  const anchorPos = ctx.anchors.seatpack.position;
  const tyreTop = P.rearAxle.y + P.tireR + ctx.geo.tireWidth / 2;
  const railTail = ctx.rails ? ctx.rails.right[0] : v3(P.saddlePos.x - 120, P.saddlePos.y + 8);
  const postR = (ctx.geo.seatpostDia || 27.2) / 2;
  const cx = railTail.x - depth / 2 + 10;
  const cy = Math.max(railTail.y - 10 - tall / 2, tyreTop + 25 + tall / 2);
  grp.position.set(cx - anchorPos.x, cy - anchorPos.y, 0);
  const alu = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.6, roughness: 0.4 });
  const postX = P.seatTop.x + P.sd.x * ((cy - P.seatTop.y) / P.sd.y);
  for (const zz of [-40, 40]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, Math.max(postX - postR - (cx + depth * 0.35), 10), 10), alu);
    arm.rotation.z = Math.PI / 2;
    arm.position.set((postX - postR + cx + depth * 0.35) / 2 - cx, -tall * 0.1, zz);
    arm.userData.noCollide = true;
    grp.add(arm);
  }
  const clampRing = tubeWrap(v3(postX - cx, -tall * 0.1, 0), v3(P.sd.x, P.sd.y, 0), postR + 1, { width: 30, thick: 5 });
  grp.add(meshOf([clampRing], alu));
  grp.add(meshOf(strapGeos, webbing()));
  grp.add(meshOf(hwGeos, hardware()));
  patch(grp, brand, 0, tall * 0.1, depth / 2 + 2, 70, Math.PI / 2);
  grp.userData.noseX = grp.position.x + depth / 2;
  return shadowify(grp);
}

export function buildSeatpack(p, brand, main, accent, ctx) {
  // wider than it is long: a transverse roll, not a wedge
  if (p.mm.wid > p.mm.len * 1.05) return buildTransverse(p, brand, main, accent, ctx, variantOf(brand, p));
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const geom = geomOf(p);
  const stiff = stiffnessOf(p);

  const len = clamp(p.mm.len, 160, 720);
  const D0 = clamp(p.mm.hgt, 60, 320);          // depth at the shoulder
  const W0 = clamp(p.mm.wid, 60, 300);          // width at the shoulder
  const form = geom.form || 'tapered_wedge';
  const name = `${p.line || ''} ${p.name || ''}`;
  const holster = form === 'holster' || /terrapin|harness|holster/i.test(name);

  // ---- closure ---------------------------------------------------------------
  const rawClosure = String(p.closure?.type || feats.closure || 'rolltop').toLowerCase();
  const closure = /roll/.test(rawClosure) ? 'rolltop' : /zip|clamshell/.test(rawClosure) ? 'zip'
    : /drawcord|cinch/.test(rawClosure) ? 'drawcord' : 'rolltop';

  // ---- the taper, from the data where it exists -------------------------------
  // `geometry.taper` records the WIDTH taper on most packs ("15 cm at the
  // saddle to 5 cm at the tail" is Apidura's own line). The direction is not
  // trusted (reviewers disagree which end is the "nose"); the magnitude is.
  // The narrow end is always the tail.
  // a holster's dry bag is a round tube that barely tapers; the record's taper
  // on these describes the cradle-to-tail silhouette, not the bag
  const wTail = holster ? clamp(geom.taperRatio ?? 0.85, 0.78, 0.95)
    : form === 'truncated_cylinder' || form === 'rounded_box' || form === 'slab' ? clamp(geom.taperRatio ?? 0.8, 0.6, 0.95)
      : clamp(geom.taperRatio ?? vr.range(0.3, 0.45), 0.26, 0.9);
  // Depth tapers less than width on a wedge: the tail still has a mouth to roll.
  const dTail = holster ? 0.82
    : form === 'teardrop' ? 0.6
      : form === 'truncated_cylinder' || form === 'rounded_box' || form === 'slab' ? 0.8
        : clamp(0.3 + wTail * 0.55, 0.38, 0.72);

  // ---- lengths ------------------------------------------------------------------
  const noseT = holster ? 3 : 5;                    // stiffened nose panel
  // The roll is the body's own mouth rolled down, so it is sized off the
  // depth the body has at its tail — not off the whole pack, which on a small
  // teardrop made the tail a thin spout with a pea on the end.
  const tailDepth = D0 * dTail;
  const lipH = closure === 'rolltop' ? clamp(tailDepth * 0.62, 14, 60) : 0;
  const rollR = closure === 'rolltop' ? clamp(lipH * 0.5, 8, 24) : 0;
  const tailRes = closure === 'rolltop' ? rollR * 1.7 : 6;
  const bodyLen = Math.max(len - noseT - tailRes, len * 0.5);
  const kick = holster ? D0 * 0.03 : Math.min(D0 * 0.1, 20);    // the tail's upward kick
  const tS = holster ? 0.05 : form === 'teardrop' ? 0.16 : 0.08; // squared shoulder: full depth almost at once
  const tLip = closure === 'rolltop' ? 0.9 : 1;

  /** full depth at t */
  // Squared, not sharp: the front face is flat against the post but its edge
  // rolls over on a radius of a few centimetres, a quarter circle from 72%.
  const shoulder = (t) => 0.72 + 0.28 * Math.sqrt(Math.max(0, 1 - (1 - t / tS) ** 2));
  const D = (t) => {
    if (t < tS) return D0 * shoulder(t);
    const s = clamp((t - tS) / (tLip - tS), 0, 1);
    let d;
    if (form === 'teardrop') d = D0 * (1 - (1 - dTail) * s ** 1.6);
    else if (holster || form === 'truncated_cylinder' || form === 'rounded_box' || form === 'slab') d = D0 * (1 - (1 - dTail) * s ** 1.4);
    else d = D0 * (1 - (1 - dTail) * s ** 1.08);
    if (t > tLip) d += (lipH - d) * smooth(tLip, 1, t);            // flattening into the lip
    return d;
  };
  /** full width at t */
  const Wd = (t) => {
    if (t < tS) return W0 * (0.8 + 0.2 * (shoulder(t) - 0.72) / 0.28);
    const s = clamp((t - tS) / (tLip - tS), 0, 1);
    let w = W0 * (1 - (1 - wTail) * s);
    // a flattened roll is WIDER than the body it closes: the round mouth
    // pinched flat spreads sideways
    if (t > tLip) w += (w * 1.22 - w) * smooth(tLip, 1, t);
    return w;
  };
  /** top line: flat under the rails, kicking up toward the tail */
  const top = (t) => kick * smooth(0.45, 1, t);
  const sectionAt = (t) => ({ a: D(t) / 2, b: Wd(t) / 2, cu: top(t) - D(t) / 2 });

  // ---- body -------------------------------------------------------------------------
  // Flatter on top where it sits under the rails, pillowed underneath.
  const xs = holster || geom.crossSection === 'round' ? 'round'
    : geom.crossSection === 'oval' ? 'oval'
      : geom.crossSection === 'flat_bottom' || geom.crossSection === 'd_shape' ? 'flat_bottom'
        : 'round_belly';
  const loft = loftBody({ len: bodyLen, rings: 32, shape: xs, sectionAt, capEnd: closure !== 'rolltop' });
  const bodyAmp = clamp(D0 * 0.02, 1.2, 3.6);
  const shell = soft(loft.geo, main, {
    amp: bodyAmp, freq: vr.range(0.018, 0.028), seed: vr.seed % 997, stiffness: stiff,
    aoDir: new THREE.Vector3(-1, 0, 0), aoK: 0.82, aoSpan: 0.5,
  });
  const rolled = new THREE.Group();
  rolled.rotation.z = Math.PI / 2;      // loft +y → grp −x
  rolled.position.x = -noseT;
  rolled.add(shell);
  // piping along the panel joins — lifted just proud so it reads as a seam
  for (const line of loft.seams) {
    const pts = line.filter((_, i) => i % 2 === 0).map((q) => q.clone());
    if (pts.length > 2) {
      const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.8, 5, false), seamMat(main));
      m.userData.noCollide = true;
      rolled.add(m);
    }
  }
  grp.add(rolled);
  /** grp-local position of a point on the section at station t, unit (u,v) */
  const at = (t, u, v) => v3(-noseT - t * bodyLen, sectionAt(t).cu + u * sectionAt(t).a, v * sectionAt(t).b);
  const xOf = (t) => -noseT - t * bodyLen;

  const wm = webbing();
  const hwm = hardware();
  const strapGeos = [];
  const hwGeos = [];

  // ---- the section perimeter at t, for straps that go round the body -------------------
  const unit = sectionUnit(xs).pts;
  const girth = (t, lift = 1.2, width = 20) => {
    const s = sectionAt(t);
    const pts = unit.map(([u, v]) => v3(xOf(t), s.cu + u * s.a, v * s.b));
    const c = v3(xOf(t), s.cu, 0);
    strapGeos.push(ribbonLoop(pts, v3(1, 0, 0), c, { width, lift: lift + bodyAmp * 0.6 }));
    // buckle on top, where a hand reaches it
    hwGeos.push(...buckle(v3(xOf(t) + width * 0.2, s.cu + s.a + bodyAmp * 0.6 + 2.4, 0), v3(0, 0, 1), v3(0, 1, 0), { width: width * 0.8 }));
  };

  // ---- holster: the cradle round the front of the dry bag ---------------------------
  if (holster) {
    const cradleEnd = 0.5;
    // the cradle follows the dry bag round: a stiff sleeve a few mm proud of
    // it, flat only where it meets the rails
    const cradleSection = (t) => {
      const s = sectionAt(t * cradleEnd);
      return { a: s.a + 4.5, b: s.b + 4.5, cu: s.cu + 1 };
    };
    const cl = loftBody({ len: bodyLen * cradleEnd, rings: 14, shape: 'round_belly', sectionAt: cradleSection, capEnd: false });
    const harnessMat = accent && accent !== main ? accent : main;
    const cradle = new THREE.Mesh(cl.geo, harnessMat);
    cradle.material = harnessMat.clone();
    cradle.material.color = harnessMat.color.clone().multiplyScalar(0.55);
    cradle.material.side = THREE.DoubleSide;
    const cg = new THREE.Group();
    cg.rotation.z = Math.PI / 2;
    cg.position.x = -noseT + 2;
    cg.add(cradle);
    grp.add(cg);
    // two girth straps pulling the dry bag into the cradle
    for (const f of [0.18, 0.4]) {
      const t = f;
      const s = cradleSection(t / cradleEnd);
      const pts = unit.map(([u, v]) => v3(xOf(t), s.cu + u * s.a, v * s.b));
      strapGeos.push(ribbonLoop(pts, v3(1, 0, 0), v3(xOf(t), s.cu, 0), { width: 22, lift: 1.2 }));
      hwGeos.push(...buckle(v3(xOf(t), s.cu - s.a - 3, s.b * 0.55), v3(1, 0, 0), v3(0, -1, 0.4), { width: 18 }));
    }
  } else {
    // a stiffened nose panel: the part that takes the load onto the post
    const nD = D(0) * 0.9, nW = Wd(0) * 0.78;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(noseT + 1.5, nD, nW), accent);
    plate.position.set(-noseT / 2 + 0.5, top(0) - D(0) / 2 + 0.5, 0);
    plate.material = accent.clone();
    plate.material.color = accent.color.clone().multiplyScalar(0.6);
    grp.add(plate);
    // compression straps: what the record says, else one on a big pack
    const nComp = Number.isFinite(feats.compressionStraps) ? feats.compressionStraps : (len > 420 ? 1 : 0);
    const stations = nComp >= 2 ? [0.42, 0.66] : nComp === 1 ? [0.58] : [];
    for (const t of stations.slice(0, 3)) girth(t, 1.2, 20);
  }

  // ---- the tail -------------------------------------------------------------------------
  const tailX = xOf(1);
  const lipC = sectionAt(1).cu;
  if (closure === 'rolltop') {
    // A dry bag's mouth, pinched flat and rolled three times across the bike:
    // a flattened bar of fabric, wider than the body, with the fold showing.
    const lipW = Wd(1);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(rollR, rollR, lipW, 22, 1), main);
    roll.rotation.x = Math.PI / 2;
    roll.scale.set(1, 1, 0.78);             // squash: fabric folds flat before it rolls
    roll.position.set(tailX - rollR * 0.78, lipC + rollR * 0.15, 0);
    grp.add(roll);
    // the folded edge of the last turn, a darker line along the roll
    for (const dy of [rollR * 0.62, -rollR * 0.5]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, lipW * 0.98), seamMat(main));
      seam.position.set(roll.position.x - rollR * 0.35, roll.position.y + dy, 0);
      seam.userData.noCollide = true;
      grp.add(seam);
    }
    // the closure strap: from the top of the body, over the roll, down its back
    // and tucked under — the buckle sits on top where a thumb finds it
    const sx = xOf(0.8), topY = sectionAt(0.8).cu + sectionAt(0.8).a + bodyAmp * 0.6;
    const cx = roll.position.x, cy = roll.position.y, rr = rollR * 0.95 + 1.5;
    // over the top of the roll (a = 90°), round its back (0°), and tucked
    // under (−110°): x runs rearward as cos(a) falls, hence the minus
    const path = [v3(sx, topY + 0.8, 0)];
    for (let i = 0; i <= 10; i++) {
      const a = (Math.PI / 2) - (i / 10) * Math.PI * 1.1;
      path.push(v3(cx - Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8, 0));
    }
    const w = clamp(lipW * 0.28, 16, 25);
    strapGeos.push(ribbonLoop(path, v3(0, 0, 1), v3(cx + rollR * 0.3, cy - rollR * 0.2, 0), { width: w, lift: 0.2, closed: false }));
    hwGeos.push(...buckle(v3((sx + cx) / 2 + 6, topY + 0.8, 0), v3(1, 0, 0), v3(0, 1, 0.05), { width: w }));
  } else {
    // zip or drawcord: a closed, rounded end
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), main);
    cap.rotation.z = Math.PI / 2;
    cap.scale.set(sectionAt(1).a, 6, sectionAt(1).b);
    cap.position.set(tailX, lipC, 0);
    grp.add(cap);
  }

  // ---- details from the record ------------------------------------------------------
  // bungee or daisy on the top, behind the saddle: where riders lash a jacket
  if (feats.cord || feats.daisyChains) {
    const t0 = 0.5, t1 = 0.84;
    const yA = (t) => sectionAt(t).cu + sectionAt(t).a + bodyAmp * 0.7;
    const zA = (t) => sectionAt(t).b * 0.62;
    if (feats.cord) {
      const cord = [];
      const N = 4;
      for (let i = 0; i < N; i++) {
        const ta = t0 + ((t1 - t0) * i) / N, tb = t0 + ((t1 - t0) * (i + 1)) / N;
        for (const s of [1, -1]) {
          const a = v3(xOf(ta), yA(ta) + 1.2, s * zA(ta)), b = v3(xOf(tb), yA(tb) + 1.2, -s * zA(tb));
          const c = new THREE.CylinderGeometry(1.4, 1.4, a.distanceTo(b), 6);
          c.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), b.clone().sub(a).normalize())));
          c.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
          cord.push(c);
        }
      }
      grp.add(meshOf(cord, hwm));
    } else {
      for (let i = 0; i < 5; i++) {
        const t = t0 + ((t1 - t0) * i) / 4;
        for (const s of [1, -1]) strapGeos.push(strapRun(v3(xOf(t) + 9, yA(t), s * zA(t)), v3(xOf(t) - 9, yA(t), s * zA(t)), v3(0, 1, 0), { width: 12 }));
      }
    }
  }
  // mesh side pockets change the outline — a panel standing proud of each flank
  const pockets = feats.pockets.filter((x) => /mesh|side|stretch/i.test(typeof x === 'string' ? x : JSON.stringify(x)));
  if (pockets.length && !holster) {
    for (const s of [1, -1]) {
      const t = 0.36;
      const pw = bodyLen * 0.3, ph = D(t) * 0.46;
      const g = new THREE.BoxGeometry(pw, ph, 5, 6, 3, 1);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) if (pos.getZ(i) > 0) pos.setZ(i, pos.getZ(i) * (1 - (pos.getX(i) / pw) ** 2 * 2));
      g.computeVertexNormals();
      const pm = new THREE.Mesh(g, main.clone());
      pm.material.color = main.color.clone().multiplyScalar(0.72);
      pm.material.roughness = 1;
      pm.position.set(xOf(t), sectionAt(t).cu - D(t) * 0.1, s * (sectionAt(t).b + 2));
      if (s < 0) pm.rotation.y = Math.PI;
      grp.add(pm);
    }
  }
  if (feats.reflective) {
    for (const s of [1, -1]) {
      const t = 0.8;
      const r = new THREE.Mesh(new THREE.PlaneGeometry(26, 8), new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.25, metalness: 0.2, emissive: 0x222222 }));
      r.position.set(xOf(t), sectionAt(t).cu + sectionAt(t).a * 0.25, s * (sectionAt(t).b + bodyAmp + 0.6));
      if (s < 0) r.rotation.y = Math.PI;
      r.userData.noCollide = true;
      grp.add(r);
    }
  }
  if (feats.valve && closure === 'rolltop') {
    const vv = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 2.4, 14), hwm);
    vv.rotation.x = Math.PI / 2;
    vv.position.set(xOf(0.72), sectionAt(0.72).cu, sectionAt(0.72).b + bodyAmp + 0.8);
    vv.userData.noCollide = true;
    grp.add(vv);
  }
  // the maker's mark on the flank, near the nose
  {
    const t = 0.2;
    const z = sectionAt(t).b + bodyAmp + 0.8;
    patch(grp, brand, xOf(t), sectionAt(t).cu + sectionAt(t).a * 0.1, z, clamp(len * 0.16, 44, 74), 0);
    patch(grp, brand, xOf(t), sectionAt(t).cu + sectionAt(t).a * 0.1, -z, clamp(len * 0.16, 44, 74), Math.PI);
  }

  // ---- placement ------------------------------------------------------------------------
  const P = ctx.points;
  const sd = P.sd;
  const anchorPos = ctx.anchors.seatpack.position;
  const postR = (ctx.geo.seatpostDia || 27.2) / 2;
  const postXAt = (y) => P.seatTop.x + sd.x * ((y - P.seatTop.y) / sd.y);
  const rails = ctx.rails;
  const railR = rails?.r ?? 3.5;
  const railLo = rails ? rails.right[0] : null, railHi = rails ? rails.right[1] : null;
  const railYAt = (x) => {
    if (!rails) return anchorPos.y + 60;
    const k = (x - railLo.x) / (railHi.x - railLo.x);
    return railLo.y + (railHi.y - railLo.y) * clamp(k, 0, 1);
  };
  const tyreOuter = P.tireR + ctx.geo.tireWidth / 2;
  const ttJoint = ctx.framePoly?.[1];
  const ttR = ctx.frameEdgeR?.[1] ?? 16;

  // sample the outline: front face, top line, bottom line (pre-tilt, grp-local)
  const front = [0, 0.3, 0.6, 0.9].map((f) => v3(0, top(0) - D(0) * f));
  const tops = [], bots = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    tops.push(v3(xOf(t), top(t) + bodyAmp));
    bots.push(v3(xOf(t), top(t) - D(t) - bodyAmp));
  }
  bots.push(v3(tailX - rollR * 1.6, lipC - rollR));
  const rot = (q, th) => v3(q.x * Math.cos(th) - q.y * Math.sin(th), q.x * Math.sin(th) + q.y * Math.cos(th));

  const solve = (th) => {
    let gy = Infinity, gx = 0;
    for (let pass = 0; pass < 3; pass++) {
      // up under the rails: every top point below the rail line where it passes under
      gy = Infinity;
      for (const q of tops) {
        const r = rot(q, th);
        const fx = anchorPos.x + gx + r.x;
        if (!rails || fx < railLo.x - 4 || fx > railHi.x + 4) continue;
        gy = Math.min(gy, railYAt(fx) - railR - 2 - anchorPos.y - r.y);
      }
      if (!Number.isFinite(gy)) gy = -10;
      // forward against the post: the front face kisses it
      gx = Infinity;
      for (const q of front) {
        const r = rot(q, th);
        const fy = anchorPos.y + gy + r.y;
        gx = Math.min(gx, postXAt(fy) - postR - 1.5 - anchorPos.x - r.x);
      }
    }
    // clearances
    let tyre = Infinity;
    for (const q of bots) {
      const r = rot(q, th);
      const fx = anchorPos.x + gx + r.x, fy = anchorPos.y + gy + r.y;
      tyre = Math.min(tyre, Math.hypot(fx - P.rearAxle.x, fy - P.rearAxle.y) - tyreOuter);
    }
    let frame = Infinity;
    if (ttJoint) {
      const r = rot(front[3], th);
      frame = anchorPos.y + gy + r.y - (ttJoint.y + ttR);
    }
    return { gx, gy, tyre, frame };
  };
  let th = -deg(7.5 + vr.j(1.2));
  let sol = solve(th);
  // tail up further until the tyre is clear (a real pack gets strapped
  // tighter and rides higher); stop at 16°
  while ((sol.tyre < 18 || sol.frame < 8) && th > -deg(16)) {
    th -= deg(1);
    sol = solve(th);
  }
  grp.rotation.z = th;
  grp.position.set(sol.gx, sol.gy, 0);
  grp.userData.noseX = grp.position.x;
  grp.userData.clearance = { tyre: Math.round(sol.tyre), frame: Math.round(sol.frame) };

  // ---- the attachment: straps round the rails and the post --------------------------
  const toLocal = (pf) => {
    const d = pf.clone().sub(anchorPos).sub(grp.position);
    return rot(d, -th).setZ(pf.z);
  };
  if (rails) {
    const nRail = 2;
    for (const side of [1, -1]) {
      const bar = side > 0 ? rails.right : rails.left;
      for (let i = 0; i < nRail / 2; i++) {
        const f = 0.3;
        const rp = bar[0].clone().lerp(bar[1], f);
        const lr = toLocal(rp);
        // the rail's direction in grp-local
        const dirL = rot(bar[1].clone().sub(bar[0]), -th).normalize();
        // strap loop around the rail
        const loopG = tubeWrap(v3(lr.x, lr.y, side * rails.z), dirL.setZ(0), railR + 0.6, { width: 18 });
        strapGeos.push(loopG);
        // from the rail down onto the pack's top
        const tBody = clamp((-lr.x - noseT) / bodyLen, 0.02, 0.5);
        const onTop = v3(lr.x, sectionAt(tBody).cu + sectionAt(tBody).a * 0.96 + bodyAmp * 0.6, side * Math.min(rails.z, sectionAt(tBody).b * 0.8));
        const railBottom = v3(lr.x, lr.y - railR - 1, side * rails.z);
        if (railBottom.distanceTo(onTop) > 2) strapGeos.push(strapRun(onTop, railBottom, v3(1, 0, 0), { width: 18 }));
      }
    }
  }
  {
    // one webbing loop round the seatpost, from the nose panel
    const postTopY = anchorPos.y + grp.position.y + rot(v3(0, top(0) - D(0) * 0.28), th).y;
    const pc = v3(postXAt(postTopY), postTopY, 0);
    const pl = toLocal(pc);
    const dirL = rot(v3(sd.x, sd.y, 0), -th).normalize();
    strapGeos.push(tubeWrap(v3(pl.x, pl.y, 0), dirL, postR + 0.8, { width: 25 }));
    const face = v3(0, pl.y, 0);
    if (pl.x - postR > 1.5) strapGeos.push(strapRun(face, v3(pl.x - postR, pl.y, 0), v3(0, 1, 0), { width: 25 }));
  }

  if (strapGeos.length) grp.add(meshOf(strapGeos, wm));
  if (hwGeos.length) grp.add(meshOf(hwGeos, hwm));
  return shadowify(grp);
}
