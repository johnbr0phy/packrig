// Wind-tunnel measurement engine: CdA measured on the GPU.
//
// The rig is rendered from dead ahead with an ORTHOGRAPHIC camera into an
// offscreen target, every material swapped for a flat unlit colour that
// identifies the PART that surface belongs to. Orthographic + a square frustum
// means one pixel is one exact patch of world area, so counting a part's pixels
// IS its frontal area in m² — real silhouette, real occlusion, real shielding,
// all of it falling out of the depth buffer. Multiply each part's area by its Cd
// and sum: that is the integral of Cd over frontal area, i.e. CdA.
//
// One id buffer, not one pass per part. The obvious alternative is to render the
// scene once for depth and then re-render each part with EqualDepth into a
// cleared colour buffer. That measures the same thing but costs one render and
// one readback PER PART per yaw, which would be ~200 synchronous GPU stalls per
// kit change on a machine already running GTAO + bloom + SMAA. It also depends
// on two different draw calls producing bit-identical depth. The id buffer needs
// neither: the fragment that won the depth test already knows which part it
// came from.
//
// ---- The accounting rule ------------------------------------------------
//
// A single pass would let a bag STEAL area from whatever it covers, and that
// produces a nonsense the numbers cannot flag: bags occluded 0.06 m² of rider
// and frame priced at Cd 0.82-1.00 and replaced it with bag priced at Cd
// 0.26-0.71, so a loaded bike measured LESS drag than a bare one. Hanging a
// bar bag in front of a rider does not delete the rider's chest. The air still
// has to close around the whole assembly.
//
// So occlusion is only allowed to cancel drag where one surface genuinely
// REPLACES another inside the same flow envelope. Three passes per yaw:
//
//   1. bodies alone, bags not in the scene    -> the honest bike/wheels/rider
//      drag, which cannot shrink because luggage was bolted on upwind. Leaves
//      the depth buffer the next pass needs.
//   2. bags, depth-tested against that buffer -> each bag's EXPOSED area, the
//      part of it standing in clean air ahead of the rig.
//   3. bags again with the bodies' depth discarded -> each bag's whole
//      silhouette. Bags still occlude each OTHER in both passes, because a stem
//      bag tucked behind a bar roll really is shielded.
//
// Whatever pass 3 sees and pass 2 does not is the bag's WAKE area: it is there,
// it is behind the rig, and it is priced by model.wakeDiscount rather than by
// this module. Total = bodies + every bag's (exposed + discounted wake), so
// `parts` sum to the total by construction and adding kit can never subtract
// drag.

import * as THREE from 'three';
import { BODY_CD, YAW_WEIGHTS, cdOf, weightedCda } from './model.js';
import * as model from './model.js';
import { SLOTS } from '../bags/slots.js';

// Every Cd and every yaw weight comes from model.js by name — nothing is
// mirrored here. Named imports on purpose: if that table ever loses one of
// these, the module fails to link loudly instead of quietly measuring the whole
// bike against a stand-in number nobody would ever spot in the readout.
const DEFAULT_YAWS = YAW_WEIGHTS.map((y) => y.deg);
const RESERVED_LABEL = { bike: 'Frame & fork', wheels: 'Wheels', rider: 'Rider' };
const RIDER_NAME = 'ghostRider';

/**
 * Per-yaw Cd correction, owned by model.js.
 *
 * What this engine measures at yaw is the true projected silhouette, and a
 * bike's side profile is enormous next to its frontal one — the bare bike
 * genuinely triples its projected area by 20°. Turning that into drag needs two
 * things this module has no business deciding: a Cd that is not the zero-yaw
 * one, and the resolution of the yawed force back onto the direction of travel.
 * `yawFactor(deg, partKey, areaRatio)` is where that lands, as a multiplier on
 * the part's Cd at that angle. The third argument is not optional in practice:
 * without it model.js degrades to a bare cosine and every part yaws identically,
 * which is a failure that looks entirely plausible in the readout. See where it
 * is built in assemble().
 */
function yawFactor() {
  return typeof model.yawFactor === 'function' ? model.yawFactor : () => 1;
}

/**
 * What a square metre of luggage costs when it sits in the rig's shadow rather
 * than in clean air, as a multiplier on that bag's Cd. Also model.js's to own:
 * the geometry here is exact — a seat pack behind a rider is measured, not
 * guessed — but pricing the wake is fluid dynamics, not rendering.
 *
 * Soft-imported like yawFactor. Both have shipped, so neither fallback is on the
 * live path; they stay because the engine linking is what lets aero-check RUN
 * and report a missing export, rather than the whole page going blank. The
 * fallback is 1.0 — a shadowed square metre charged in FULL — deliberately the
 * pessimistic end, because 0 is what produced the net-negative kit this pass
 * structure exists to kill.
 */
function wakeDiscount() {
  return typeof model.wakeDiscount === 'function' ? model.wakeDiscount : () => 1;
}

/**
 * A bag SKINNED onto a tube merges with it — no gap, no two shear layers, one
 * object — so charging full price for both double-counts the frame underneath.
 * This is the mirror of the bug the three-pass split fixed: that one let a bag
 * delete a body it merely stood in front of, this one bills a tube twice for
 * being wrapped.
 *
 * Always `mergeCredit`, never `mergeFraction` raw. The frame is priced at 0.90
 * and a frame bag at 0.25, so an uncapped give-back subtracts more than the bag
 * ever cost and the net-negative kit walks back in through a different door.
 * mergeCredit caps the give-back at the bag's own charge: merging can take a bag
 * to zero, it cannot take it below.
 */
function mergeCredit() {
  return typeof model.mergeCredit === 'function' ? model.mergeCredit : () => 0;
}

// Parts are either bodies — the bike and whoever is riding it — or bags. The
// distinction drives the whole accounting above, so it is carried per part.
const BODY = 'body';
const BAG = 'bag';

// Camera layers let a pass pick bodies or bags without walking the graph to
// toggle .visible on a few hundred meshes three times per yaw.
const LAYER_BODY = 1;
const LAYER_BAG = 2;

// Part ids live in the red channel, spaced 4 apart. Rendering into a render
// target skips tone mapping and output encoding — three only applies those when
// the target is the default framebuffer — and the id colour is set in the
// working (linear) space, so the byte we read back is the byte we asked for. The
// spacing is free insurance against a driver that dithers, and 63 ids is three
// times the number of mount slots the bike has.
const ID_STEP = 4;
const MAX_PARTS = 63;

/**
 * The contract also passes `scene`; the pass deliberately does not use it — see
 * idScene below — and the bike goes back to whatever parent it actually had.
 * @param {{renderer: THREE.WebGLRenderer, bike: object, bags: object}} deps
 */
export function createAeroMeter({ renderer, bike, bags }) {
  // A private scene, not the app's. The bike is moved into it for the duration
  // of a pass, which excludes the sky, ground, HDRI background, fog, smoke and
  // every light in one move — and means the shadow pass has nothing to draw.
  // Both scenes are untransformed roots, so the bike's world matrix is identical
  // in either one.
  const idScene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  const idMaterials = [];

  let rt = null;
  let rtSize = 0;
  let pixels = null;      // one readback buffer, reused for every pass
  // Pass 1's ids, held so pass 2 can ask what is BEHIND each bag pixel.
  let bodyPixels = null;
  let warnedIds = false;

  const _box = new THREE.Box3();
  const _sphere = new THREE.Sphere();
  const _corner = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _n = new THREE.Vector3();

  function idMaterial(index) {
    let m = idMaterials[index];
    if (!m) {
      // DoubleSide because bag panels are open shells: with FrontSide a panel
      // whose winding faces away would drop out of the silhouette entirely.
      m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false, toneMapped: false });
      // Explicitly linear: setRGB defaults to the working colour space, and a
      // colour that went through an sRGB transfer would not read back as its id.
      m.color.setRGB(((index + 1) * ID_STEP) / 255, 0, 0, THREE.LinearSRGBColorSpace);
      idMaterials[index] = m;
    }
    return m;
  }

  function target(size) {
    if (rt && rtSize === size) return rt;
    rt?.dispose();
    rt = new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      stencilBuffer: false,
      depthBuffer: true,
      // No MSAA on purpose: a pixel must be wholly covered or wholly not, which
      // is what makes a pixel count an exact area rather than a blend of ids.
      samples: 0,
    });
    rtSize = size;
    pixels = new Uint8Array(size * size * 4);
    bodyPixels = new Uint8Array(size * size * 4);
    return rt;
  }

  /**
   * The ground contact-shadow planes: flat sprites painted under each wheel that
   * have no physical frontal area at all. They are recognised by not writing
   * depth, and this test is applied ONLY when walking the frame — never to the
   * rider and never to a bag.
   *
   * That narrowing is the whole point. `depthWrite === false` is not a statement
   * that a surface is a decal; it is a flag that translucency sets for unrelated
   * reasons. rider.js clears it while the ghost is faded out, so a rider that was
   * mid-fade — which is exactly when index.js measures — was being classified as
   * a decal and silently dropped out of the drag, taking the largest single
   * contributor in the whole rig with it. A bag using a translucent panel or a
   * reflective strip would have gone the same way, and been free.
   *
   * A body's job is to occlude and a bag's job is to cost something. Neither can
   * opt out of the measurement by way of a rendering flag.
   */
  function isContactShadow(o) {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    return mats.some((m) => m && m.depthWrite === false);
  }

  /**
   * Classify every visible surface under the bike into parts, and list the
   * objects whose visibility has to change for the duration of the pass.
   */
  function collect(includeRider) {
    bike.group.updateMatrixWorld(true);

    const parts = [];
    const claimed = new Set();
    // Visibility changes are recorded here and applied in enter(), never during
    // the walk — enter() is what saves the value it has to put back.
    const visibility = [];
    const hide = (obj) => visibility.push({ obj, next: false, prev: true });

    const claimAll = (root) => root.traverse((o) => claimed.add(o));
    const walk = (root, out, skip, dropShadows) => {
      root.traverseVisible((o) => {
        if (skip && skip.has(o)) return;
        if (o.isMesh) {
          if (dropShadows && isContactShadow(o)) hide(o);
          else out.push(o);
        } else if (o.material) {
          // Lines, points and sprites carry no frontal area but would still
          // paint the id buffer. Nothing on the bike uses them today; this stops
          // a future one corrupting the count silently.
          hide(o);
        }
      });
      return out;
    };
    const addPart = (key, label, cd, kind, meshes) => {
      if (meshes.length) parts.push({ key, label, cd, kind, meshes, index: parts.length });
    };

    // Claim the subtrees that have their own identity BEFORE the bike catch-all
    // walk, using a full traverse so a partly hidden subtree cannot leak meshes
    // into 'bike'.
    const riderRoot = bike.group.getObjectByName(RIDER_NAME) || null;
    if (riderRoot) claimAll(riderRoot);
    for (const w of bike.wheels || []) claimAll(w);
    const rackRoots = [bike.rearRack, bike.frontRack].filter(Boolean);
    for (const r of rackRoots) claimAll(r);
    const equipped = bags?.equipped || {};
    for (const rec of Object.values(equipped)) if (rec.mesh) claimAll(rec.mesh);

    // The frame, and only the frame, is where the contact shadows live.
    const bikeMeshes = walk(bike.group, [], claimed, true);
    addPart('bike', RESERVED_LABEL.bike, BODY_CD.bike, BODY, bikeMeshes);

    const wheelMeshes = [];
    for (const w of bike.wheels || []) walk(w, wheelMeshes);
    addPart('wheels', RESERVED_LABEL.wheels, BODY_CD.wheels, BODY, wheelMeshes);

    if (riderRoot) {
      if (includeRider) {
        // The rider is faded in and out with material opacity, and the tunnel
        // may be measuring while that fade is mid-flight. Drag must not depend
        // on an animation, so it is forced visible for the pass — unlike a bag,
        // where a hidden mesh is the caller deliberately taking it off the bike.
        const wasVisible = riderRoot.visible;
        riderRoot.visible = true;
        const riderMeshes = walk(riderRoot, []);
        riderRoot.visible = wasVisible;
        if (!wasVisible) visibility.push({ obj: riderRoot, next: true, prev: false });
        addPart('rider', RESERVED_LABEL.rider, BODY_CD.rider, BODY, riderMeshes);
      } else {
        hide(riderRoot);
      }
    }

    // Racks are FIXTURES, not frame. updateFixtures() raises the rear rack only
    // because a pannier or trunk was fitted, and the front rack only for a
    // randobag — so a rack is part of the cost of choosing that luggage, not
    // part of the bike you started with.
    //
    // Leaving them inside `bike` put them in the BASELINE as well as the loaded
    // rig, where their drag cancelled out of the comparison and the one piece of
    // the kit a rider cannot take off at the campsite came out free. Charging
    // them like luggage instead means the baseline is a genuinely rack-less
    // bike, and the rack shows up as its own row in the waterfall.
    const rackMeshes = [];
    for (const r of rackRoots) walk(r, rackMeshes);
    // A rack is the same round tubing as the frame, so it takes the frame's
    // coefficient unless model.js decides it deserves its own.
    addPart('racks', 'Racks', BODY_CD.racks ?? BODY_CD.bike, BAG, rackMeshes);

    // SLOTS order rather than equip order, so the parts list is stable as the
    // user swaps kit around.
    for (const slot of Object.keys(SLOTS)) {
      const rec = equipped[slot];
      if (!rec?.mesh) continue;
      // No visible meshes means the caller hid this bag, so it is not on the
      // bike at all. A bag that is merely SHIELDED by another bag still has
      // meshes here and stays in the list at 0 m², which is the attribution the
      // panel wants to show.
      const meshes = walk(rec.mesh, []);
      addPart(slot, SLOTS[slot].label || slot, cdOf(rec.product, rec.brand, slot), BAG, meshes);
    }

    return { parts, visibility };
  }

  /** The bidons as the current kit leaves them: hidden under a full frame bag,
   *  slid down the tube under a half one, stock otherwise. */
  function readBottleState() {
    const mounts = bike.bottleMounts;
    if (!mounts || !bike.bottles) return null;
    return {
      shown: bike.bottles.visible,
      mounts: Object.keys(mounts).map((key) => ({
        key, mount: mounts[key], visible: mounts[key].group.visible, offset: mounts[key].offset || 0,
      })),
    };
  }

  function setBottleState(s) {
    if (!s) return;
    bike.bottles.visible = s.shown;
    for (const m of s.mounts) {
      m.mount.group.visible = m.visible;
      bike.slideBottle(m.key, m.offset);
    }
  }

  /** Everything a measurement needs, computed once and reused for every yaw. */
  function plan(opts = {}) {
    const yaws = (opts.yaws?.length ? opts.yaws : DEFAULT_YAWS).slice();
    const size = Math.max(64, Math.round(opts.resolution || 512));

    // Only worth a second body pass if the kit has actually moved a bottle.
    const live = readBottleState();
    const moved = live && (!live.shown || live.mounts.some((m) => !m.visible || m.offset !== 0));
    const bottles = moved
      ? { live, bare: { shown: true, mounts: live.mounts.map((m) => ({ ...m, visible: true, offset: 0 })) } }
      : null;

    // Collect with the bottles PRESENT, so their meshes are in the frame's mesh
    // list even when the current kit hides them — pass 0 has to be able to draw
    // something pass 1 will not.
    if (bottles) setBottleState(bottles.bare);
    const { parts, visibility } = collect(opts.includeRider !== false);
    if (bottles) setBottleState(bottles.live);
    parts.length = Math.min(parts.length, MAX_PARTS); // ids run out at 63; slots stop at 20

    _box.makeEmpty();
    for (const p of parts) for (const m of p.meshes) _box.expandByObject(m);
    if (_box.isEmpty()) return null;
    _box.getBoundingSphere(_sphere);

    // One flat list so enter/leave can save and restore state without walking
    // the part tree again on every yaw slice of measureAsync.
    const meshes = [];
    for (const p of parts) for (const m of p.meshes) meshes.push({ mesh: m, part: p });
    const perPart = () => parts.map(() => new Array(yaws.length).fill(0));

    // Decode table: byte value -> part index, built once so the histogram loop
    // is a single array lookup per pixel rather than a divide, a round and a
    // bounds check. It runs over ~4M pixels per measurement, so this is worth
    // it. Entries either side of each id absorb the same driver dither the id
    // spacing exists for; 0 stays -1 because 0 is the background.
    const lut = new Int32Array(256).fill(-1);
    for (let i = 0; i < parts.length; i++) {
      for (let d = -1; d <= 1; d++) lut[(i + 1) * ID_STEP + d] = i;
    }

    return {
      parts,
      visibility,
      meshes,
      yaws,
      size,
      bagCount: parts.reduce((n, p) => n + (p.kind === BAG ? 1 : 0), 0),
      corners: boxCorners(_box),
      center: _sphere.center.clone(),
      radius: _sphere.radius,
      // Far enough out that the whole rig is in front of the camera; with an
      // orthographic projection the distance costs nothing in precision, since
      // ortho depth is linear rather than crowded up against the near plane.
      dist: _sphere.radius * 2 + 1,
      savedMat: new Array(meshes.length),
      savedMask: new Uint32Array(meshes.length),
      home: null,
      lut,
      acc: new Int32Array(parts.length),
      accOverlap: new Int32Array(parts.length),
      bikeIndex: parts.findIndex((p) => p.key === 'bike'),
      overlap: perPart(),
      bottles,
      bare: bottles ? perPart() : null,
      // Pixel counts per part per yaw, one set per pass. `body` is only read for
      // body parts and the two bag sets only for bags, but a single id space
      // across all three keeps the decode identical.
      body: perPart(),
      exposed: perPart(),
      total: perPart(),
      areaPerPixel: new Array(yaws.length).fill(0),
    };
  }

  const rendererState = { color: new THREE.Color() };

  function enter(job) {
    job.home = bike.group.parent;
    idScene.add(bike.group);
    for (const v of job.visibility) { v.prev = v.obj.visible; v.obj.visible = v.next; }
    for (let k = 0; k < job.meshes.length; k++) {
      const { mesh, part } = job.meshes[k];
      job.savedMat[k] = mesh.material;
      job.savedMask[k] = mesh.layers.mask;
      mesh.material = idMaterial(part.index);
      mesh.layers.set(part.kind === BAG ? LAYER_BAG : LAYER_BODY);
    }
    rendererState.rt = renderer.getRenderTarget();
    rendererState.autoClear = renderer.autoClear;
    rendererState.alpha = renderer.getClearAlpha();
    renderer.getClearColor(rendererState.color);
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0); // id 0 is "nothing here"
    renderer.setRenderTarget(target(job.size));
  }

  function leave(job) {
    for (let k = 0; k < job.meshes.length; k++) {
      const mesh = job.meshes[k].mesh;
      mesh.material = job.savedMat[k];
      mesh.layers.mask = job.savedMask[k];
    }
    for (const v of job.visibility) v.obj.visible = v.prev;
    // renderYaw puts the bottles back after pass 0; this is the guard for a
    // throw between the two, which would otherwise leave the app's bidons
    // sitting on top of a frame bag.
    if (job.bottles) setBottleState(job.bottles.live);
    if (job.home) job.home.add(bike.group);
    else idScene.remove(bike.group);
    renderer.setRenderTarget(rendererState.rt);
    renderer.setClearColor(rendererState.color, rendererState.alpha);
    renderer.autoClear = rendererState.autoClear;
  }

  /** Render one yaw and accumulate its pixel counts. Must be inside enter/leave. */
  function renderYaw(job, yawIndex) {
    const rad = THREE.MathUtils.degToRad(job.yaws[yawIndex]);
    // The bike travels +X, so the wind blows -X and the head-on camera sits far
    // out on +X looking back at the rig. Yawing the apparent wind about Y is the
    // same thing as swinging the camera about the bike centre by that angle.
    _n.set(Math.cos(rad), 0, Math.sin(rad));
    camera.position.copy(job.center).addScaledVector(_n, job.dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(job.center);
    camera.updateMatrixWorld(true);

    // Size the frustum to what the rig actually spans across THIS view, then
    // square it up. A square frustum on a square target keeps pixels square, so
    // world area per pixel is a single exact number instead of a per-axis fudge.
    _right.setFromMatrixColumn(camera.matrixWorld, 0);
    _up.setFromMatrixColumn(camera.matrixWorld, 1);
    let half = 0;
    for (const c of job.corners) {
      _corner.copy(c).sub(job.center);
      half = Math.max(half, Math.abs(_corner.dot(_right)), Math.abs(_corner.dot(_up)));
    }
    half *= 1.02; // margin so nothing lands on the very edge pixel
    camera.left = -half;
    camera.right = half;
    camera.top = half;
    camera.bottom = -half;
    camera.near = 0.01;
    camera.far = job.dist + job.radius + 1;
    camera.updateProjectionMatrix();

    const size = job.size;
    job.areaPerPixel[yawIndex] = ((2 * half) * (2 * half)) / (size * size);

    camera.layers.set(LAYER_BODY);
    renderer.autoClear = true;

    // Pass 0 — the bodies with the BOTTLES put back. A full frame bag swallows
    // both bidons, so the bike underneath a frame bag is not the bike you would
    // ride without one, and measuring the baseline in the loaded fixture state
    // hid that saving completely — the mirror of the rack bug, and biased
    // against the one result this feature is proudest of. Only rendered when the
    // kit has actually moved a bottle; every other kit pays nothing for it.
    if (job.bottles) {
      setBottleState(job.bottles.bare);
      renderer.render(idScene, camera);
      tally(job.bare, job, yawIndex);
      setBottleState(job.bottles.live);
    }

    // Pass 1 — the bodies as the rig actually stands, and the depth buffer the
    // bag passes need. Re-taken every measurement rather than cached: fitting
    // panniers makes updateFixtures() raise the rear rack, so the bike's own
    // silhouette does depend on the kit.
    renderer.render(idScene, camera);
    tally(job.body, job, yawIndex, job.bagCount > 0);
    if (!job.bagCount) return;

    // Pass 2 — the bags, keeping the depth buffer pass 1 just wrote and clearing
    // colour only. A bag fragment survives exactly where it is in front of the
    // rig, so what lands here is the bag standing in clean air.
    camera.layers.set(LAYER_BAG);
    renderer.autoClear = false;
    renderer.clear(true, false, false);
    renderer.render(idScene, camera);
    // Cross-referenced against pass 1's buffer, still held, to get each bag's
    // overlap with the FRAME specifically — the area where it is skinned onto a
    // tube. That is what mergeCredit prices, and it needs the joint answer (this
    // bag, over that body), which no single pass carries.
    tally(job.exposed, job, yawIndex, false, job.overlap);

    // Pass 3 — the same bags with the bodies' depth thrown away, giving each
    // bag its whole silhouette. Bags still resolve against each OTHER in both
    // passes, so bag-on-bag shielding survives; the difference between the two
    // is the part of the bag sitting in the rig's wake.
    renderer.clear(true, true, false);
    renderer.render(idScene, camera);
    tally(job.total, job, yawIndex);
    renderer.autoClear = true;
  }

  /**
   * Read the target back once and histogram the part ids into `counts`.
   *
   * `keep` retains this buffer as the body layer for a later pass to cross
   * reference; `against` accumulates, per part, how many of its pixels sat
   * directly in front of the FRAME in that retained buffer.
   */
  function tally(counts, job, yawIndex, keep, against) {
    const size = job.size;
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, pixels);
    const lut = job.lut;
    const acc = job.acc.fill(0);
    const over = against ? job.accOverlap.fill(0) : null;
    const bikeId = job.bikeIndex;
    let unmatched = 0;
    for (let i = 0, n = size * size * 4; i < n; i += 4) {
      const r = pixels[i];
      if (r === 0) continue;
      const index = lut[r];
      if (index >= 0) {
        acc[index]++;
        // Only the frame merges. A bag standing in front of a rider or a wheel
        // gets nothing here — that restriction is exactly what stops a bar bag
        // deleting the torso behind it.
        if (over && lut[bodyPixels[i]] === bikeId) over[index]++;
      } else unmatched++;
    }
    for (let i = 0; i < acc.length; i++) counts[i][yawIndex] = acc[i];
    if (over) for (let i = 0; i < over.length; i++) against[i][yawIndex] = over[i];
    if (keep) bodyPixels.set(pixels);
    if (!warnedIds && unmatched > size * size * 0.001) {
      warnedIds = true;
      console.warn(`[aero] ${unmatched} pixels carried no readable part id — ` +
        'the id colours are not surviving the round trip on this driver.');
    }
  }

  function assemble(job) {
    // cdaHeadOn is the 0° pass; if a caller sweeps without 0 in the list, the
    // first yaw is the closest thing to head-on they asked for.
    const headOn = Math.max(0, job.yaws.indexOf(0));
    const yawCd = yawFactor();
    const wake = wakeDiscount();

    // A body is charged the area it has with no bags on the bike. A bag is
    // charged what stands in clean air, plus what sits in the wake at whatever
    // model.js says the wake is worth. In m², not pixels: the frustum is resized
    // for every yaw, so pixel counts across two angles are not comparable and
    // the ratio below would be silently wrong.
    // `src` picks which body pass the bodies are read from: the rig as it stands
    // (pass 1) or with the bottles put back (pass 0). Bags are identical either
    // way — they were not in the body pass at all.
    const areaFrom = (src) => job.parts.map((p, i) => job.yaws.map((deg, y) => {
      const px = p.kind !== BAG
        ? src[i][y]
        // Clamped for form's sake: a pass-2 pixel implies the same bag won pass
        // 3 at that pixel, so the difference cannot go negative.
        : job.exposed[i][y] + Math.max(job.total[i][y] - job.exposed[i][y], 0) * wake(p.key, deg);
      return px * job.areaPerPixel[y];
    }));
    const areaOf = areaFrom(job.body);

    // yawFactor needs how much this part's own area GREW as the rig turned —
    // the term carrying the shape information, telling a pannier's slab from a
    // bar roll's cylinder. Without it model.js degrades to a bare cosine and
    // every part yaws identically.
    //
    // It is the ratio of TOTAL silhouette, deliberately NOT of the charged area
    // above. The wake discount ramps with yaw, so a bag that is fully shadowed
    // at every angle — constant silhouette, contributing nothing new — would
    // show a charged area that grows purely because the discount is easing off,
    // and the yaw term would read that as newly-revealed lengthwise area. The
    // two multipliers describe independent effects and are meant to compose,
    // not nest. This one is pure geometry, taken before any discount.
    const silhouetteFrom = (src) => job.parts.map((p, i) => job.yaws.map((deg, y) =>
      (p.kind === BAG ? job.total[i][y] : src[i][y]) * job.areaPerPixel[y]));

    // A part with no head-on silhouette at all (a top tube bag buried behind a
    // bar roll) hands over Infinity, which model.js reads as "all of this is
    // newly exposed" and handles explicitly.
    const cdaFrom = (area, silhouette) => area.map((a, i) => {
      const p = job.parts[i];
      const s = silhouette[i];
      const s0 = s[headOn];
      return a.map((v, y) => v * p.cd * yawCd(job.yaws[y], p.key, s0 > 0 ? s[y] / s0 : Infinity));
    });
    const cdaOf = cdaFrom(areaOf, silhouetteFrom(job.body));

    // A bag skinned onto a tube shares its shear layer, so the frame under it is
    // otherwise billed twice. The give-back comes off the BAG's row rather than
    // the frame's: mergeCredit caps it at the bag's own charge, which only means
    // anything if it is the bag being reduced, and taking it off `bike` would
    // pull it out of cdaBaseline too — crediting a bare bike for a frame bag it
    // is not wearing.
    const merge = mergeCredit();
    const creditOf = job.parts.map((p, i) => job.yaws.map((deg, y) => (p.kind !== BAG ? 0
      : merge(p.key, job.overlap[i][y] * job.areaPerPixel[y], cdaOf[i][y], BODY_CD.bike))));
    for (let i = 0; i < cdaOf.length; i++) {
      for (let y = 0; y < cdaOf[i].length; y++) cdaOf[i][y] -= creditOf[i][y];
    }

    // Bodies are REPORTED at their bare-fixture value, so the body rows and
    // cdaBaseline agree on what "your bike without luggage" means. The gap
    // between that and what the bodies actually measure loaded is carried by a
    // bottles row, which keeps the parts summing to the real rig.
    const cdaBare = job.bottles ? cdaFrom(areaFrom(job.bare), silhouetteFrom(job.bare)) : cdaOf;
    const bodyCda = (i, y) => (job.parts[i].kind === BAG ? cdaOf[i][y] : cdaBare[i][y]);

    const parts = job.parts.map((p, i) => {
      const bare = p.kind !== BAG && job.bottles ? job.bare : job.body;
      const silhouette = p.kind === BAG ? job.total[i][headOn] : bare[i][headOn];
      const shadowed = p.kind === BAG ? Math.max(job.total[i][headOn] - job.exposed[i][headOn], 0) : 0;
      return {
        key: p.key,
        label: p.label,
        cd: p.cd,
        cda: bodyCda(i, headOn),
        cdaWeighted: weightedCda(job.yaws.map((deg, y) => ({ deg, cda: bodyCda(i, y) }))),
        // The whole silhouette the part presents. For a bag, cda is NOT
        // frontalArea x cd any more — the wake fraction is discounted and a
        // merge credit may have come off — so wakeArea is published alongside
        // rather than left to be inferred.
        frontalArea: silhouette * job.areaPerPixel[headOn],
        wakeArea: shadowed * job.areaPerPixel[headOn],
        // How much of this bag is skinned onto the frame — the area mergeCredit
        // is priced on. Published so the give-back can be audited rather than
        // taken on faith, since it is the one term that REDUCES a total.
        mergeArea: p.kind === BAG ? job.overlap[i][headOn] * job.areaPerPixel[headOn] : 0,
      };
    });

    // A full frame bag swallows both bidons: real drag the rig no longer has.
    // Negative by nature, and the only part that can be.
    if (job.bottles) {
      const delta = job.yaws.map((deg, y) => job.parts
        .reduce((sum, p, i) => sum + (p.kind === BAG ? 0 : cdaOf[i][y] - cdaBare[i][y]), 0));
      parts.push({
        key: 'bottles',
        label: 'Bottles stowed',
        cd: BODY_CD.bike,
        cda: delta[headOn],
        cdaWeighted: weightedCda(delta.map((cda, y) => ({ deg: job.yaws[y], cda }))),
        frontalArea: 0,
        wakeArea: 0,
      });
    }

    const byYaw = job.yaws.map((deg, y) => ({
      deg,
      cda: cdaOf.reduce((sum, cda) => sum + cda[y], 0),
    }));
    return {
      cdaHeadOn: byYaw[headOn].cda,
      cdaWeighted: parts.reduce((sum, p) => sum + p.cdaWeighted, 0),
      // The same rig with the luggage off AND the bottles back, measured rather
      // than inferred. cdaHeadOn - cdaBaseline is then exactly the sum of the
      // non-body parts, which is the identity the panel has always assumed.
      cdaBaseline: job.parts.reduce((sum, p, i) => sum + (p.kind === BAG ? 0 : cdaBare[i][headOn]), 0),
      byYaw,
      parts,
    };
  }

  const empty = () => ({ cdaHeadOn: 0, cdaWeighted: 0, cdaBaseline: 0, byYaw: [], parts: [] });

  return {
    /**
     * Measure now, blocking. Three renders and three readbacks per yaw with a
     * kit on, one of each with a bare bike. Prefer measureAsync() anywhere a
     * dropped frame would be visible; this is what the verification tool uses.
     */
    measure(opts) {
      const job = plan(opts);
      if (!job) return empty();
      enter(job);
      try {
        for (let y = 0; y < job.yaws.length; y++) renderYaw(job, y);
      } finally {
        leave(job);
      }
      return assemble(job);
    },

    /**
     * Same measurement, one yaw per animation frame, so the stalls are spread
     * out instead of landing in a single burst. The scene is restored at the end
     * of every slice — the bike is never missing from a frame the app draws.
     */
    async measureAsync(opts) {
      const job = plan(opts);
      if (!job) return empty();
      for (let y = 0; y < job.yaws.length; y++) {
        if (y > 0) await new Promise((r) => requestAnimationFrame(() => r()));
        enter(job);
        try {
          renderYaw(job, y);
        } finally {
          leave(job);
        }
      }
      return assemble(job);
    },

    dispose() {
      rt?.dispose();
      rt = null;
      rtSize = 0;
      pixels = null;
      for (const m of idMaterials) m?.dispose();
      idMaterials.length = 0;
      idScene.clear();
    },
  };
}

function boxCorners(box) {
  const out = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) out.push(new THREE.Vector3(x, y, z));
    }
  }
  return out;
}
