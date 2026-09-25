/**
 * Packing in the 3D scene.
 *
 *  - An OPEN bag's shell goes translucent and its contents sit inside it, laid
 *    out by the solver in the bag's own local mm, so the items are drawn at the
 *    same scale as the bag by construction.
 *  - Things lashed to or dangling off a bag are drawn on its outside whenever
 *    a packing list is showing; things bolted to the frame at their mount.
 *  - The centre of mass of bike + bags + gear is marked on the bike.
 *
 * Items are built only when a bag opens (and dropped when it closes); the
 * geometry is cached in kit3d.js, so reopening is free. Every move is eased —
 * opening, adding and the solver re-settling all slide rather than jump.
 */
import * as THREE from 'three';
import { buildItem } from './kit3d.js';

const EASE = (t) => 1 - Math.pow(1 - t, 3);
const D_OPEN = 320, D_MOVE = 420;
const SHELL_OPACITY = 0.2;

export function createPack3D(app) {
  const bags = new Map();        // slot → { group, items: Map(uid → node), shell }
  let outside = new THREE.Group();
  outside.name = 'pack:outside';
  const tweens = new Set();
  let com = null;

  // ---- shell translucency ------------------------------------------------------
  /**
   * Materials are shared across a bag's meshes (and fabric textures across
   * bags), so they are cloned per bag the first time it opens and swapped
   * back when it closes — never mutated in place, or opening one bag would
   * fade every bag of the same brand.
   */
  function setShell(rec, open) {
    const bag = rec.bagMesh;
    if (!bag) return;
    if (!rec.swap) {
      rec.swap = [];
      bag.traverse((o) => {
        if (!o.isMesh || o.userData.packItem) return;
        const orig = o.material;
        const fade = (Array.isArray(orig) ? orig : [orig]).map((m) => {
          const c = m.clone();
          c.transparent = true;
          c.depthWrite = false;
          c.opacity = 1;
          return c;
        });
        rec.swap.push({ o, orig, fade: Array.isArray(orig) ? fade : fade[0] });
      });
    }
    const target = open ? SHELL_OPACITY : 1;
    for (const s of rec.swap) s.o.material = s.fade;
    tween(D_OPEN, (k) => {
      for (const s of rec.swap) {
        for (const m of Array.isArray(s.fade) ? s.fade : [s.fade]) {
          const from = open ? 1 : SHELL_OPACITY;
          m.opacity = from + (target - from) * k;
        }
      }
    }, () => {
      if (!open) for (const s of rec.swap) s.o.material = s.orig;
    });
  }

  function tween(ms, step, done) {
    if (app.__reducedMotion || ms <= 0) { step(1); done?.(); return; }
    const t = { start: performance.now(), ms, step, done };
    tweens.add(t);
  }

  // ---- items ------------------------------------------------------------------
  /**
   * Put one item's model into the box the solver gave it.
   * The model's box is [L,M,S] on x,y,z. The target is `size` on the cavity's
   * U,V,W axes. Rigid items keep their proportions (the solver already chose
   * which of M/S faces up); soft items are squashed into the space they fill.
   */
  function placeNode(node, cav, p, dims) {
    const [L, Mx, Sx] = dims;
    const [su, sv, sw] = p.size;
    const axes = [cav.U, cav.V, cav.W];
    const tgt = [su, sv, sw];
    let ix, iy, iz, sx = 1, sy = 1, sz = 1;
    if (p.rigid) {
      ix = 0;
      const vIsM = Math.abs(sv - Mx) <= Math.abs(sv - Sx);
      iy = vIsM ? 1 : 2; iz = vIsM ? 2 : 1;
    } else {
      const ord = [0, 1, 2].sort((a, b) => tgt[b] - tgt[a]);
      [ix, iy, iz] = ord;
      sx = tgt[ix] / L; sy = tgt[iy] / Mx; sz = tgt[iz] / Sx;
      // never inflate a soft thing past its own loft, only squash it
      sx = Math.min(sx, 1.08); sy = Math.min(sy, 1.08); sz = Math.min(sz, 1.08);
    }
    const X = axes[ix].clone(), Y = axes[iy].clone();
    const Z = new THREE.Vector3().crossVectors(X, Y);
    const m = new THREE.Matrix4().makeBasis(X, Y, Z);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    const pos = cav.toLocal(p.center[0], p.center[1], p.center[2]);
    return { pos, q, scale: new THREE.Vector3(sx, sy, sz) };
  }

  function ensureBagRec(slot) {
    let rec = bags.get(slot);
    const eq = app.bags.equipped[slot];
    if (!eq) { if (rec) closeBag(slot, { instant: true }); return null; }
    if (rec && rec.bagMesh !== eq.mesh) { closeBag(slot, { instant: true }); rec = null; }
    if (!rec) {
      rec = { bagMesh: eq.mesh, group: new THREE.Group(), items: new Map(), open: false };
      rec.group.name = `pack:${slot}`;
      rec.group.userData.packItem = true;
      eq.mesh.add(rec.group);
      bags.set(slot, rec);
    }
    return rec;
  }

  /**
   * Show a bag's contents. `solved` is the solver's result for that bag and
   * `resolved` maps uid → resolved item (for archetype, dims, colour).
   */
  function showBag(slot, cav, solved, resolved, { animate = true } = {}) {
    const rec = ensureBagRec(slot);
    if (!rec) return;
    if (!rec.open) { rec.open = true; setShell(rec, true); }
    const keep = new Set();
    let i = 0;
    for (const p of solved.placed) {
      const it = resolved.get(p.uid);
      if (!it) continue;
      keep.add(p.uid);
      const dims = it.dims.map((c) => c * 10);
      let node = rec.items.get(p.uid);
      if (!node) {
        node = buildItem(it.archetype, { dims, color: it.color || '#6b7580', seed: it.ref || it.name });
        node.userData.packItem = true;
        node.userData.uid = p.uid;
        node.traverse((o) => { o.userData.packItem = true; o.userData.noCollide = true; });
        rec.group.add(node);
        rec.items.set(p.uid, node);
        node.userData.fresh = true;
      }
      const to = placeNode(node, cav, p, [...dims].sort((a, b) => b - a));
      if (node.userData.fresh || !animate) {
        // arrive from just above, not from nowhere
        node.position.copy(to.pos).addScaledVector(cav.V, animate ? 40 : 0);
        node.quaternion.copy(to.q);
        node.scale.copy(to.scale);
        node.userData.fresh = false;
      }
      const from = { p: node.position.clone(), q: node.quaternion.clone(), s: node.scale.clone() };
      const delay = Math.min(i++, 8) * 18;
      setTimeout(() => tween(animate ? D_MOVE : 0, (k) => {
        const e = EASE(k);
        node.position.lerpVectors(from.p, to.pos, e);
        node.quaternion.slerpQuaternions(from.q, to.q, e);
        node.scale.lerpVectors(from.s, to.scale, e);
      }), animate ? delay : 0);
    }
    for (const [uid, node] of rec.items) {
      if (keep.has(uid)) continue;
      rec.group.remove(node);
      rec.items.delete(uid);
    }
  }

  function closeBag(slot, { instant = false } = {}) {
    const rec = bags.get(slot);
    if (!rec) return;
    if (rec.open && !instant) setShell(rec, false);
    else if (rec.swap) for (const s of rec.swap) s.o.material = s.orig;
    rec.open = false;
    for (const node of rec.items.values()) rec.group.remove(node);
    rec.items.clear();
    rec.group.parent?.remove(rec.group);
    bags.delete(slot);
  }

  function closeAll(opts) { for (const slot of [...bags.keys()]) closeBag(slot, opts); }

  /** World position of every item node that is currently drawn, for balance. */
  function itemWorldPositions() {
    const out = new Map();
    for (const rec of bags.values()) {
      for (const [uid, node] of rec.items) out.set(uid, node.getWorldPosition(new THREE.Vector3()));
    }
    return out;
  }

  // ---- outside: lashed, dangling, frame -----------------------------------------
  /**
   * `list` = [{ uid, it (resolved), place (parsed) }]. Lashed items sit on top
   * of the bag's body at its far end; dangling ones hang below its tail;
   * frame items go to a mount on the bike. Built fresh each call — there are
   * only ever a handful.
   */
  function showOutside(list) {
    app.bike.frameGroup.remove(outside);
    outside.clear();
    const F = app.bike.frameGroup;
    F.updateMatrixWorld(true);
    const toF = new THREE.Matrix4().copy(F.matrixWorld).invert();
    const P = app.bike.points;
    const stack = {};
    for (const { uid, it, place } of list) {
      const dims = it.dims.map((c) => c * 10).sort((a, b) => b - a);
      const node = buildItem(it.archetype, { dims, color: it.color || '#6b7580', seed: it.ref || it.name });
      node.userData.uid = uid;
      node.traverse((o) => { o.userData.packItem = true; o.userData.noCollide = true; });
      if (place.loc === 'lashed' || place.loc === 'dangle') {
        const eq = app.bags.equipped[place.slot];
        if (!eq) continue;
        const bb = new THREE.Box3().setFromObject(eq.mesh).applyMatrix4(toF);
        const k = `${place.slot}:${place.loc}`;
        const n = (stack[k] = (stack[k] || 0) + 1) - 1;
        const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
        const rear = place.slot.startsWith('seat') || place.slot === 'saddlebag';
        if (place.loc === 'lashed') {
          // across the top of the bag, long axis across the bike like a real
          // strapped-on bundle, stacked if there is more than one
          const far = rear ? bb.min.x + (bb.max.x - bb.min.x) * 0.3 : cx;
          const x = far - n * (dims[1] + 6);
          const top = surfaceY(eq.mesh, F, x, cz, -1) ?? bb.max.y;
          node.position.set(x, top + dims[2] / 2 + 2, cz);
          node.rotation.set(0, Math.PI / 2, 0);
          if (place.slot.startsWith('bar')) {
            node.position.set(bb.max.x + dims[2] / 2 + 2, (bb.min.y + bb.max.y) / 2 + n * (dims[1] + 4), cz);
            node.rotation.set(Math.PI / 2, 0, Math.PI / 2);
          }
        } else {
          // hanging off the tail on a carabiner: below and just inside the end
          // the underside AT that x, not the box's lowest point: a tilted
          // wedge's lowest point is its shoulder, far below the tail
          const tailX = (rear ? bb.min.x + Math.max(dims[0] * 0.5, (bb.max.x - bb.min.x) * 0.18) : cx) + n * 20;
          const under = surfaceY(eq.mesh, F, tailX, cz, 1) ?? bb.min.y;
          // rotated a quarter turn about z, so the item's long side hangs vertical
          const hang = dims[0] / 2;
          const z = (dims[2] / 2 + 4) * (n % 2 ? -1 : 1);
          node.position.set(tailX, under - 22 - hang, z);
          node.rotation.set(0.2, 0, Math.PI / 2);
          const metal = new THREE.MeshStandardMaterial({ color: 0x9a9da2, metalness: 0.8, roughness: 0.3 });
          const clip = new THREE.Mesh(new THREE.TorusGeometry(6, 1.3, 5, 14), metal);
          clip.position.set(tailX, under - 16, z);
          // a short cord from the bag's underside to the carabiner so it reads as hung, not floating
          const cord = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 12, 6), new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.9 }));
          cord.position.set(tailX, under - 6, z);
          cord.userData.packItem = true;
          outside.add(cord);
          clip.userData.packItem = true;
          outside.add(clip);
        }
      } else if (place.loc === 'frame') {
        const mount = place.mount || frameMountFor(it);
        if (mount === 'bottle') continue;          // the bike already draws its bidons
        if (mount === 'bar') {
          // phone / camera on the stem: top of the steerer, facing the rider
          const n = (stack.bar = (stack.bar || 0) + 1) - 1;
          const at = P.steererTop.clone().lerp(P.barCenter, 0.55);
          if (it.archetype === 'phone') {
            node.position.set(at.x, at.y + 22, 0);
            node.rotation.set(Math.PI / 2, 0, -0.5);
          } else {
            node.position.set(P.barCenter.x + 28, P.barCenter.y - 34 - n * 10, (n - 0.5) * 60);
          }
        } else {
          // pump: along the seat tube behind the bottle, or under the top tube
          const a = P.seatTop.clone().multiplyScalar(0.25), b = P.seatTop.clone().multiplyScalar(0.72);
          const mid = a.clone().lerp(b, 0.5);
          node.position.set(mid.x - 22, mid.y, 0);
          const dir = b.clone().sub(a).normalize();
          node.rotation.set(0, 0, Math.atan2(dir.y, dir.x));
        }
      } else continue;
      outside.add(node);
    }
    F.add(outside);
  }

  /** Height of the bag body's surface at (x, z) in frame coords: dir -1 = top (ray down), 1 = underside (ray up). */
  const ray = new THREE.Raycaster();
  function surfaceY(bag, F, x, z, dir) {
    const body = [];
    bag.traverse((o) => { if (o.isMesh && !o.userData.noCollide && !o.userData.packItem) body.push(o); });
    if (!body.length) return null;
    const o = new THREE.Vector3(x, dir < 0 ? 5000 : -5000, z).applyMatrix4(F.matrixWorld);
    const d = new THREE.Vector3(0, -dir, 0).transformDirection(F.matrixWorld);
    ray.set(o, d);
    const hit = ray.intersectObjects(body, false)[0];
    if (!hit) return null;
    return hit.point.applyMatrix4(new THREE.Matrix4().copy(F.matrixWorld).invert()).y;
  }

  function frameMountFor(it) {
    if (it.archetype === 'bottle' || it.archetype === 'bladder') return 'bottle';
    if (it.archetype === 'phone' || it.archetype === 'action_camera' || it.archetype === 'headlamp') return 'bar';
    return 'pump';
  }

  // ---- centre of mass -----------------------------------------------------------
  function showCoM(pos) {
    const F = app.bike.frameGroup;
    if (!pos) { if (com) com.visible = false; return; }
    if (!com) {
      com = new THREE.Group();
      com.name = 'pack:com';
      const ring = new THREE.Mesh(new THREE.TorusGeometry(16, 2.2, 8, 40), new THREE.MeshBasicMaterial({ color: 0xff7a45, depthTest: false, transparent: true }));
      const dot = new THREE.Mesh(new THREE.SphereGeometry(5.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff7a45, depthTest: false, transparent: true }));
      const cross = new THREE.Mesh(new THREE.BoxGeometry(46, 1.6, 1.6), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.8 }));
      const cross2 = cross.clone(); cross2.rotation.z = Math.PI / 2;
      for (const m of [ring, dot, cross, cross2]) { m.renderOrder = 999; m.userData.packItem = true; com.add(m); }
    }
    if (com.parent !== F) F.add(com);
    com.visible = true;
    const from = com.position.clone();
    const to = new THREE.Vector3(pos.x, pos.y, 0);
    if (from.lengthSq() === 0) com.position.copy(to);
    else tween(D_MOVE, (k) => com.position.lerpVectors(from, to, EASE(k)));
    // face the camera side-on
    com.rotation.set(0, 0, 0);
  }

  function tick() {
    const now = performance.now();
    for (const t of tweens) {
      const k = Math.min((now - t.start) / t.ms, 1);
      t.step(k);
      if (k >= 1) { tweens.delete(t); t.done?.(); }
    }
    if (com?.visible && app.camera) com.quaternion.copy(app.camera.quaternion);
  }

  return {
    showBag, closeBag, closeAll, showOutside, showCoM, tick, itemWorldPositions,
    isOpen: (slot) => !!bags.get(slot)?.open,
    openSlots: () => [...bags.keys()],
    clearOutside() { outside.clear(); app.bike.frameGroup.remove(outside); },
  };
}
