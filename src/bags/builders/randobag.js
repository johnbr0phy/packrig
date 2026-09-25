// Rando / basket bag builder (mm-local, parented to the `basket` anchor).
//
// AXIS MAPPING (BUILDER-BRIEF Rule 2). The `basket` anchor is added with ry = 0
// (src/bike.js), so bag-local axes ARE world axes: +x forward, +y up, +z drive
// side. For this slot:
//
//     p.mm.len  ->  z   across the bike        (Apidura 41 cm / 30.5 cm)
//     p.mm.wid  ->  x   fore-aft, the depth    (Apidura 30 cm / 24.5 cm)
//     p.mm.hgt  ->  y   up, the DRAWN height   (render.hgt_cm, 18 cm)
//
// Verified against `mount.axes` in data/models/apidura.json ({len:z, wid:x,
// hgt:y}) and against dimensions-3.png, which is a FRONT elevation: the 41 cm
// arrow spans the face carrying the logo and the two buckles, i.e. across the
// bike, and MIN 10 / MAX 40 cm is the height. Eight of the eleven products in
// this slot agree; three do not, see the note by `w`/`d` below.
//
// WHERE THE PLACEMENT VALUES COME FROM (Rule 1). The bag is built with its
// base at local y = 0 and then placed off the bike, not off the anchor:
//   base       on the front rack deck: the top of the highest horizontal rack
//              tube + its radius (frontRackOf reads ctx.frontRack itself), plus
//              DECK_GAP. The anchor used to be trusted as the deck, but it sits
//              2 mm above the tube CENTRES, so every bag stood 2.5 mm inside the
//              rails and cross tubes.
//   fore-aft   rear face just in front of the handlebar tops (ctx.points.
//              barCenter + the bar's own radius): the owner's "a box on a front
//              rack in front of the bar". It used to be centred on the anchor,
//              which put the rear 30 mm BEHIND the bar on the 30L.
//   across     centred on the bike.
// Everything else is a fraction of p.mm. All webbing, buckles, hooks and trim
// are userData.noCollide; only the shell, the soft upper, the roll and a lid
// are body.

import * as THREE from 'three';
import { v3 } from '../../lib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boxBulge } from '../deform.js';
import { addPockets, bungeeLattice, meshPanelMat, pocketBlock, reflectiveStrip, zipperRun } from '../features.js';
import { rollTop, seamStrip } from '../hardware.js';
import { buckle, meshOf, strapRun, tubeWrap } from '../straps.js';
import { featuresOf, stiffnessOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';

/** Gap between the rack tubes' top and the bag's base; the straps run in it. */
const DECK_GAP = 0.6;
const BAR_R = 11.9;        // drop-bar tops, as src/bike.js draws them (tubeAlong r)

/**
 * The front rack's deck, read off the rack group the bike draws (src/bike.js
 * buildFrontRack): top surface, fore-aft span, side rail |z| and radius.
 */
function frontRackOf(ctx) {
  const rack = ctx?.frontRack;
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
  const flat = segs.filter((s) => Math.abs(s.a.y - s.b.y) < 1);
  if (!flat.length) {
    const a = ctx?.anchors?.basket?.position;
    return a ? { top: a.y + 3, x0: a.x - 135, x1: a.x + 125, railZ: 55, railR: 4.5, y: a.y - 2 } : null;
  }
  const y = Math.max(...flat.map((s) => s.a.y));
  const deck = flat.filter((s) => Math.abs(s.a.y - y) < 1);
  const sides = deck.filter((s) => Math.abs(s.a.z - s.b.z) < 1);
  return {
    y,
    top: Math.max(...deck.map((s) => s.a.y + s.r)),
    x0: Math.min(...deck.map((s) => Math.min(s.a.x, s.b.x))),
    x1: Math.max(...deck.map((s) => Math.max(s.a.x, s.b.x))),
    railZ: sides.length ? Math.abs(sides[0].a.z) : 55,
    railR: sides.length ? sides[0].r : 4.5,
  };
}

/**
 * Splay a box's walls: scale x and z linearly from `s0` at the base to `s1` at
 * the rim. dimensions-1 and dimensions-3 both draw the lower collar as a
 * shallow tray whose walls lean OUT, the rim overhanging the base all the way
 * round; a straight-sided box is a large part of why ours read as a moulded
 * plastic case. Cut into the geometry rather than pushed through `bulge`,
 * because BUILDER-BRIEF §1 is explicit that a structural shape must survive a
 * product that skips the deform pass.
 */
function splay(geo, halfH, s0, s1) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(Math.max((pos.getY(i) + halfH) / (halfH * 2), 0), 1);
    const s = s0 + (s1 - s0) * t;
    pos.setX(i, pos.getX(i) * s);
    pos.setZ(i, pos.getZ(i) * s);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * The rolled mouth of a rack pack lies ACROSS the bike and is rolled toward the
 * REAR. Both halves of that matter and we had neither:
 *  - across: in on-bike-5 (straight-on front view of the 30L) the two fold
 *    spirals show at the far left and right of the bag, so the roll's axis is
 *    the bag's wide axis. The old code rotated the cap about x, which put the
 *    lip fore-aft and stacked the laps vertically.
 *  - rearward: in studio-6 the roll sits behind the load with the mesh panel
 *    folding forward over it onto the collar.
 *
 * `rollTop` builds its lip along local +x and stacks laps toward local +z, so
 * rotating -90 degrees about y sends the lip to +z and the laps to -x. It is
 * parameterised by one radius, so size backwards out of the two dimensions we
 * actually know, the lap height and the width the lip must span. Extents are
 * returned so the caller can seat the roll exactly instead of guessing.
 */
function rollAcross(mat, hwm, { width, height, rolls, top, rear }) {
  const rings = Math.max(2, Math.min(4, rolls || 3));
  // rollTop's laps span roughly 0.414r of height in total; invert that for r,
  // then scale the lip to the width the bag actually is.
  const r = Math.max(height / 0.414, 10);
  const g = rollTop(mat, hwm, {
    r, depth: height * 0.3, rings, buckle: false, back: false,
    widthScale: width / (1.68 * r),   // lipW = r * 1.68 * widthScale
  });
  g.rotation.y = -Math.PI / 2;
  // Seat it off its own measured box rather than off the arithmetic above: the
  // laps are rounded and each is tilted a couple of degrees, so the closed form
  // is a few mm out and the roll stood proud of the top of the bag.
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g);
  g.position.set(rear - box.min.x, top - box.max.y, 0);
  return { obj: g, front: g.position.x + box.max.x };
}

/** Flat webbing lying on a face (straps.js), collected for one merged mesh. */
function strip(list, a, b, normal, width = 22) {
  list.push(strapRun(a, b, normal, { width }));
}

/**
 * A flat panel spanning two points in the xy plane, so it lands where it is
 * aimed instead of at a chosen angle. Used for every draped part of this bag.
 */
function plate(grp, mat, from, to, width, thick = 2.6) {
  const dir = to.clone().sub(from);
  const len = dir.length();
  if (len < 1) return null;
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, thick, width), mat);
  m.position.copy(from).addScaledVector(dir, 0.5);
  m.rotation.z = Math.atan2(dir.y, dir.x);
  grp.add(m);
  return m;
}

/**
 * How many external mesh pockets the record describes. apply-models.mjs merges
 * dims/render/geometry/closure/axes/structure but NOT the `pockets` block, so
 * for Apidura the only thing that reaches the builder is the prose string in
 * `features.pockets`, read raw here because `featuresOf` normalises a
 * non-array to `[]`, which is why `addPockets` has drawn nothing for this
 * brand. Where the array did arrive, `addPockets` handles it and this returns
 * 0 so nothing doubles up.
 */
function meshPocketCount(p) {
  const raw = p?.features?.pockets;
  if (Array.isArray(raw)) return 0;
  return /external mesh/i.test(String(raw || '')) ? 2 : 0;
}

export function buildRandobag(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const straps = [], metal = [];         // webbing and buckles, merged at the end
  const bodies = new Set();              // the meshes that ARE the bag
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  // soft | semi | rigid, from the model records, see stiffnessOf().
  const stiff = stiffnessOf(p);
  const wm = webbing();
  const hwm = hardware();

  // Three records in this slot (Outer Shell 137, both Wizard Works Alakazams)
  // write mount.axes {len:'+x', wid:'z'}, the transpose of the eight others.
  // Left on the majority mapping deliberately: flipping those three changes
  // bags nobody has reviewed against a photo this round. Reported, not guessed.
  const w = Math.min(p.mm.len, 440);   // across the bike
  const h = Math.min(p.mm.hgt, 380);   // total drawn height, base to top
  const d = Math.min(p.mm.wid, 340);   // fore-aft

  // The closure comes from `p.closure.type`, the controlled vocabulary
  // apply-models.mjs merges, NOT from `features.closure`, which for Apidura
  // reads "rolltop with magnetic seal, compression panel and G-hook" and
  // matched none of the old string tests. That fall-through is why both rack
  // packs were capped with a smooth sealed slab lid and read as hard cases.
  const prose = feats.closure || '';
  const closure = p.closure?.type
    || (/roll/i.test(prose) ? 'rolltop' : /zip/i.test(prose) ? 'zip_straight' : /flap/i.test(prose) ? 'flap_buckle' : 'flap_buckle');
  const isRoll = closure === 'rolltop';
  const rolls = p.closure?.rolls || 3;

  // Two storeys, and the record already carries the split without saying so:
  // dims_cm.hgt is the published MIN height (10 cm, the state with the roll
  // taken all the way down, which is the rigid collar and nothing else) while
  // render.hgt_cm is the packed height (18 cm). Measuring on-bike-5 against the
  // known 41 cm width puts the collar at 0.55 of the packed height, and
  // 100/180 is 0.55. The `render.basis` note calling the collar "about a
  // third" is low by about 20 points of height, see the report.
  const pubMin = (p.dims_cm?.hgt || 0) * 10;
  const twoStorey = isRoll && pubMin > 20 && pubMin < h * 0.9;
  const cH = twoStorey ? Math.min(pubMin, h * 0.62) : 0;   // rigid collar height
  const uH = h - cH;                                       // soft upper storey

  // ---- lower storey: the collar -------------------------------------------
  // With a collar it is the HDPE-framed tray and holds its shape absolutely
  // (geometry.notes); without one it is simply the body.
  const shellH = cH || h * (isRoll ? 0.78 : 0.94);
  const shellGeo = splay(
    new RoundedBoxGeometry(d, shellH, w, 5, Math.min(16, shellH * 0.2)),
    shellH / 2, twoStorey ? 0.93 : 0.97, 1
  );
  const shell = soft(shellGeo, main, {
    amp: twoStorey ? 0.9 : vr.range(2.4, 3.4), freq: vr.range(0.024, 0.032), seed: vr.seed % 971,
    stiffness: twoStorey ? 'rigid' : stiff,
    bulge: twoStorey ? null : boxBulge(d / 2, shellH / 2, w / 2, Math.min(d, shellH, w) * vr.range(0.08, 0.13)),
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.45,
  });
  shell.position.y = shellH / 2;
  grp.add(shell);
  bodies.add(shell);

  // Where the collar's own wall is at a given fraction of its height, so trim
  // sits ON the splayed face instead of floating off the widest corner.
  const wall = (yf) => (twoStorey ? 0.93 + 0.07 * yf : 1);

  if (twoStorey) {
    // ---- upper storey: the soft roll-top ----------------------------------
    // Charcoal collar, lighter grey upper (studio-3, studio-6). The catalogue
    // colourway for this bag is a single hex, so the two-tone has to be
    // derived here rather than read, see the report.
    const upperMat = main.clone();
    upperMat.color.offsetHSL(0, -0.02, 0.055);
    // Inboard of the collar rim on every side, dimensions-3 draws the soft
    // body rising from INSIDE the tray, and on-bike-5 shows the rim as the
    // widest thing on the bag. The bulge is held to a tenth of the storey
    // height so a packed load does not swell back out past that rim.
    const upperD = d * 0.86, upperW = w * 0.89;
    const upper = soft(
      new RoundedBoxGeometry(upperD, uH, upperW, 6, Math.min(uH * 0.44, 40)),
      upperMat,
      {
        amp: vr.range(2.2, 3), freq: vr.range(0.026, 0.034), seed: (vr.seed >>> 3) % 977,
        stiffness: 'soft',
        bulge: boxBulge(upperD / 2, uH / 2, upperW / 2, uH * vr.range(0.08, 0.11)),
        aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.84, aoSpan: 0.5,
      }
    );
    upper.position.y = cH + uH / 2;
    grp.add(upper);
    bodies.add(upper);

    // ---- the roll, across the rear ---------------------------------------
    const roll = rollAcross(upperMat, hwm, {
      width: w * 0.94, height: uH * 0.78, rolls, top: h, rear: -upperD / 2,
    });
    grp.add(roll.obj);
    roll.obj.traverse((o) => bodies.add(o));

    // The two G-hooks that pull the ends of the roll down onto the collar
    // (feature-3: a webbing tail run through a metal G-hook, one at each end,
    // and the hook shapes drawn at both ends of dimensions-1/-3). Placed on
    // the roll's FRONT face, which is where the extents say it is.
    for (const s of [-1, 1]) {
      const z = s * w * 0.44;
      strip(straps, v3(roll.front + 1.5, cH + uH * 0.98, z), v3(roll.front + 1.5, cH + 6, z), v3(1, 0, 0), 20);
      const hook = new THREE.Mesh(new THREE.TorusGeometry(9, 2.2, 5, 16, Math.PI * 1.35), hwm);
      hook.position.set(roll.front + 4, cH + 8, z);
      hook.rotation.y = Math.PI / 2;
      grp.add(hook);
    }

    // ---- the fold-over mesh panel ----------------------------------------
    // on-bike-5 and feature-4: a webbing-edged mesh panel hinged behind the
    // roll, folded forward over it and clipped down onto the front collar. It
    // is what the tent poles in feature-4 are stuffed under, and it is the
    // single most identifying part of this product. Drawn as the panel over
    // the top plus the tongue that carries on down the front face.
    // It is NARROWER than the roll: in on-bike-5 the two fold spirals show
    // outboard of the panel's webbing edges at the far left and right.
    const panW = w * 0.82;
    const meshMat = meshPanelMat();
    // Four points, in section: hinged low on the BACK of the roll, up over the
    // crown of it, forward across the shoulder of the load, then down the front
    // onto the collar rim where the two buckles take it. Hinging it at full
    // height instead put its rear corner 10 mm inside the handlebar tops.
    const path = [
      v3(-upperD / 2 - 3, cH + uH * 0.55, 0),      // hinge, behind the roll
      v3(roll.front * 0.5, h + 4, 0),              // over the crown of the roll
      v3(d * 0.42, h * 0.94, 0),                   // front shoulder of the load
      v3((d / 2) * wall(1) + 2, cH + uH * 0.06, 0),// the rim, where it clips down
    ];
    for (let i = 0; i < path.length - 1; i++) {
      plate(grp, meshMat, path[i], path[i + 1], panW, 5);
      for (const s of [-1, 1]) {
        const hem = plate(grp, wm, path[i], path[i + 1], 9, 8);
        hem.position.z = s * panW / 2;
      }
    }
    const kneeA = path[2];
    const frontHem = new THREE.Mesh(new THREE.BoxGeometry(10, 10, panW), wm);
    frontHem.position.copy(path[3]);
    grp.add(frontHem);

    // ---- attachment: TWO points ------------------------------------------
    // dimensions-1 and dimensions-3 draw exactly two side-release buckles low
    // on the front face, 7.5 cm apart on the 30.5 cm bag and 12 cm apart on
    // the 41 cm bag, 0.246 and 0.293 of the width, so 0.135 of the width
    // either side of centre. Each is one continuous webbing: down from the
    // panel over the collar rim, through the buckle, down the front face,
    // under the base along the rack deck, and up the back.
    //
    // This replaces the two things a human review called "weird metal bits
    // sticking out of the front": a 26 mm slab floating 4 mm above the lid
    // attached to nothing, and a `daisyChain` of length w * 0.7, 287 mm of
    // webbing rotated vertical on a 180 mm bag, so it stood 75 mm above the
    // top and hung 32 mm below the base. Neither is drawn any more; the
    // ladder the record's `daisyChains` flag claims is not visible in any of
    // the thirteen product photos, so it is reported rather than invented.
    const spHalf = w * 0.135;
    const faceX = (d / 2) * wall(0.55);
    for (const s of [-1, 1]) {
      const z = s * spHalf;
      // the strap that runs down the tongue, from the knee onto the collar rim
      const tan = v3(faceX, cH * 0.98, z).sub(v3(kneeA.x, kneeA.y, z));
      strip(straps, v3(kneeA.x, kneeA.y + 3, z), v3(faceX + 1, cH * 0.98, z), v3(-tan.y, tan.x, 0).normalize(), 24);
      // front face, with the buckle a third of the way down the collar
      strip(straps, v3(faceX + 1, cH * 0.98, z), v3(faceX + 1, 2, z), v3(1, 0, 0), 24);
      metal.push(...buckle(v3(faceX + 2, cH * 0.64, z), v3(0, -1, 0), v3(1, 0, 0), { width: 22 }));
      // under the base, lying on the rack deck in the gap DECK_GAP leaves
      strip(straps, v3(d * 0.49, -DECK_GAP - 1.5, z), v3(-d * 0.49, -DECK_GAP - 1.5, z), v3(0, -1, 0), 24);
      // and back up the rear face, so the strap is a girdle and not a stub
      const rx = -(d / 2) * wall(0.31) - 1.2;
      strip(straps, v3(rx, 1, z), v3(rx, cH * 0.62, z), v3(-1, 0, 0), 24);
    }

    // ---- collar trim ------------------------------------------------------
    // Welded seam where the soft upper is bonded to the collar rim.
    const seam = seamStrip(main, d * 1.01, 3.2, w * 1.005);
    seam.position.y = cH;
    grp.add(seam);

    // Two reflective slots either side of the logo (details.reflective; the
    // pairs sit at 0.34 of the half width in on-bike-5, one above the other).
    if (feats.reflective) {
      for (const s of [-1, 1]) {
        for (const yf of [0.66, 0.82]) {
          const rs = reflectiveStrip(w * 0.11, 5);
          rs.rotation.y = Math.PI / 2;
          rs.position.set((d / 2) * wall(yf) + 1.2, cH * yf, s * w * 0.34);
          grp.add(rs);
        }
      }
    }

    // Mesh pockets: one on each end and two on the back face (studio-3 shows
    // the end; studio-6 shows the pair across the back either side of the
    // centre webbing). See meshPocketCount for why these are not going
    // through addPockets for this brand.
    if (meshPocketCount(p)) {
      for (const s of [-1, 1]) {
        const end = pocketBlock(main, hwm, { w: d * 0.66, h: cH * 0.66, proud: 4, mesh: true });
        end.position.set(-d * 0.04, cH * 0.46, s * (w / 2) * wall(0.46));
        if (s < 0) end.rotation.y = Math.PI;
        grp.add(end);

        const back = pocketBlock(main, hwm, { w: w * 0.36, h: cH * 0.6, proud: 4, mesh: true });
        back.position.set(-(d / 2) * wall(0.46), cH * 0.46, s * w * 0.26);
        back.rotation.y = -Math.PI / 2;
        grp.add(back);
      }
    }

    patch(grp, brand, (d / 2) * wall(0.72) + 2, cH * 0.72, 0, Math.min(w * 0.3, 120), 0).rotation.set(0, Math.PI / 2, 0);
  } else {
    // ---- single-storey bags ----------------------------------------------
    // Every cap is sized so the bag finishes at p.mm.hgt instead of standing a
    // closure on top of a full-height body.
    if (isRoll) {
      const r = rollAcross(main, hwm, {
        width: w * 0.94, height: h - shellH, rolls, top: h, rear: -d / 2,
      }).obj;
      grp.add(r);
      r.traverse((o) => bodies.add(o));
    } else if (closure === 'flap_buckle' || closure === 'flap_strap' || closure === 'hook_and_loop_flap') {
      // The lid: a stiffened flap over the top that falls down the FRONT face
      // (Brooks Rambler, Swift Capstone), held by two straps to buckles low
      // on the front. The lid fills the space above the shell to p.mm.hgt.
      const lidH = h - shellH;
      const lidD = d + 6, lidW = w * 1.02;
      const lid = new THREE.Mesh(new RoundedBoxGeometry(lidD, lidH, lidW, 4, Math.min(8, lidH * 0.45)), accent);
      lid.position.set(1, shellH + lidH / 2, 0);
      grp.add(lid);
      bodies.add(lid);
      const drop = shellH * 0.42;
      const skirt = new THREE.Mesh(new RoundedBoxGeometry(6, drop, w * 0.96, 2, 2.5), accent);
      skirt.position.set(d / 2 + 5, shellH - drop / 2 + 2, 0);
      grp.add(skirt);
      const nL = feats.compressionStraps === 1 ? 1 : 2;
      for (let i = 0; i < nL; i++) {
        const z = nL === 1 ? 0 : (i - 0.5) * w * 0.5;
        strip(straps, v3(d / 2 + 8.5, shellH + lidH * 0.4, z), v3(d / 2 + 8.5, shellH - drop * 0.95, z), v3(1, 0, 0), 20);
        strip(straps, v3(d / 2 + 2, shellH - drop * 0.95, z), v3(d / 2 + 2, shellH * 0.18, z), v3(1, 0, 0), 20);
        metal.push(...buckle(v3(d / 2 + 3, shellH - drop - 6, z), v3(0, -1, 0), v3(1, 0, 0), { width: 20 }));
      }
    } else {
      const lidH = h - shellH;
      const lid = new THREE.Mesh(new RoundedBoxGeometry(d * 1.02, lidH, w * 1.02, 4, Math.min(8, lidH * 0.4)), accent);
      lid.position.y = shellH + lidH / 2;
      grp.add(lid);
      bodies.add(lid);
      grp.add(zipperRun(v3(d / 2 + 1, shellH + lidH * 0.4, -w * 0.46), v3(d / 2 + 1, shellH + lidH * 0.4, w * 0.46), hwm, { accentMat: accent }));
    }

    const seam = seamStrip(main, d + 2.4, 2.6, w * 0.97);
    seam.position.y = shellH * vr.range(0.3, 0.42);
    grp.add(seam);

    // Compression straps down the front face, from the shell top to its base
    // (the flap's own straps already do this job on a flap bag).
    const nStraps = /flap/.test(closure) ? 0 : feats.compressionStraps ?? 2;
    for (let i = 0; i < nStraps; i++) {
      const f = nStraps === 1 ? 0 : (i / (nStraps - 1) - 0.5) * 2;
      strip(straps, v3(d / 2 + 2, shellH * 0.96, f * w * 0.28), v3(d / 2 + 2, shellH * 0.1, f * w * 0.28), v3(1, 0, 0), 22);
      metal.push(...buckle(v3(d / 2 + 3, shellH * 0.7, f * w * 0.28), v3(0, -1, 0), v3(1, 0, 0), { width: 22 }));
    }

    if (feats.cord) {
      const lat = bungeeLattice(hwm, { w: w * 0.8, h: shellH * 0.55, n: 3 });
      lat.rotation.y = Math.PI / 2;
      lat.position.set(d / 2 + 2, shellH * 0.5, 0);
      grp.add(lat);
    }
    if (feats.reflective) {
      const rs = reflectiveStrip(w * 0.6, 11);
      rs.rotation.y = Math.PI / 2;
      rs.position.set(d / 2 + 2, shellH * 0.2, 0);
      grp.add(rs);
    }

    addPockets(grp, feats, main, hwm, {
      front: (make, i) => {
        const g = make(Math.min(w * 0.55, 190), shellH * 0.34);
        g.position.set(d / 2 + 1, shellH * (0.3 + i * 0.06), 0);
        g.rotation.y = Math.PI / 2;
      },
      side: (make, i) => {
        const s2 = i % 2 === 0 ? 1 : -1;
        const g = make(Math.min(d * 0.7, 150), shellH * 0.4);
        g.position.set(0, shellH * 0.42, s2 * (w / 2 + 1));
        if (s2 < 0) g.rotation.y = Math.PI;
      },
      lid: (make) => {
        const g = make(Math.min(w * 0.5, 160), Math.min(d * 0.6, 130));
        g.position.set(0, shellH + 6, 0);
        g.rotation.x = -Math.PI / 2;
      },
    });

    patch(grp, brand, d / 2 + 1.6, shellH * vr.range(0.5, 0.62), vr.j(w * 0.08), 84, 0).rotation.set(0, Math.PI / 2, 0);
  }

  // ---- placement ----------------------------------------------------------
  // Base on the deck, rear face just in front of the bar tops (see header).
  const deck = frontRackOf(ctx);
  const anchor = ctx?.anchors?.basket?.position;
  const P = ctx?.points;
  const box = new THREE.Box3();
  grp.updateMatrixWorld(true);
  for (const m of bodies) if (m.isMesh) box.expandByObject(m);
  if (deck && anchor && P?.barCenter) {
    const rearX = Math.max(deck.x0, P.barCenter.x + BAR_R + 3);
    grp.position.set(rearX - box.min.x - anchor.x, deck.top + DECK_GAP - box.min.y - anchor.y, -anchor.z);

    // Hold-down to the rack: every bag is strapped to the deck's side rails
    // (Apidura's girth straps above run under the base between them; the flap
    // bags get a loop round each rail at two stations), and a handlebar bag
    // proper also hangs from the bar by a strap round the tops.
    const ry = deck.y - (deck.top + DECK_GAP), rz = deck.railZ;
    const lx0 = deck.x0 - (rearX - box.min.x), lx1 = deck.x1 - (rearX - box.min.x);
    const xs = [box.min.x + (box.max.x - box.min.x) * 0.25, box.min.x + (box.max.x - box.min.x) * 0.75]
      .map((x) => Math.min(Math.max(x, lx0 + 12), lx1 - 12));
    for (const x of xs) for (const s of [-1, 1]) {
      straps.push(tubeWrap(v3(x, ry, s * rz), v3(1, 0, 0), deck.railR + 0.6, { width: 20 }));
    }
    if (!twoStorey) {
      const barLocal = v3(P.barCenter.x, P.barCenter.y, 0).sub(grp.position).sub(anchor);
      for (const s of [-1, 1]) {
        const z = s * Math.min(w * 0.3, 90);
        straps.push(tubeWrap(v3(barLocal.x, barLocal.y, z), v3(0, 0, 1), BAR_R + 0.6, { width: 20 }));
        strip(straps, v3(box.min.x - 1.5, barLocal.y - BAR_R, z), v3(box.min.x - 1.5, box.max.y * 0.55, z), v3(-1, 0, 0), 20);
      }
    }
  }

  if (straps.length) grp.add(meshOf(straps, wm));
  if (metal.length) grp.add(meshOf(metal, hwm));
  // Everything that is not the bag itself is hardware to the packing layer
  // and the clearance tools (BUILDER-BRIEF §9.7).
  grp.traverse((o) => { if (o.isMesh && !bodies.has(o)) o.userData.noCollide = true; });
  return shadowify(grp);
}
