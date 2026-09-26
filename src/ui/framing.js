/**
 * Camera framing: the one owner of "where the bike sits on screen".
 *
 * It replaces three things that each owned a piece of it: mobile.js's fixed
 * 0.22 sheet lift, reframe.js's desktop-only side pan, and focus.js's glide.
 * They disagreed (the phone lift was a constant, so a sheet at a different
 * height buried the bike), and none of them measured the bike itself.
 *
 * The rule, on every device: the bike's projected silhouette fills the FREE
 * AREA (the viewport minus the top bar, minus a panel on the left, minus a
 * bottom sheet) with a small margin, and is centred in it. Chrome reports
 * where it is through `addChrome()`, so the answer follows the sheet's real
 * height instead of a breakpoint's guess.
 *
 * Mechanism: the pan is `camera.setViewOffset`, which shifts the projection
 * without moving the camera, so orbit, raycasts and the audits keep working
 * on an unmoved camera. The fit is a distance along the current view
 * direction, found by projecting a point cloud sampled from the bike's own
 * meshes. Pan and dolly only; the camera never rotates on its own.
 *
 * If the person has zoomed by hand, their distance is kept and only the pan
 * follows the chrome, until they reset the view.
 */
import * as THREE from 'three';

const MAX_POINTS = 2400;

export function initFraming(app) {
  const { camera, controls } = app;
  const chrome = new Set();
  const scratch = new THREE.PerspectiveCamera();
  const v = new THREE.Vector3();

  let points = null;           // world-space samples of the bike (and bags)
  let focusSlot = null;        // a bag in focus, or null for the whole bike
  let userZoom = false;        // the person dollied by hand
  let lastDist = null;         // what we last set, to tell our dolly from theirs
  let off = { x: 0, y: 0 };    // view offset in force
  let anim = null;
  let paused = false;
  let orbitSafe = false;
  let last = null;       // fit for every angle (the start screen turns)

  const W = () => window.innerWidth || 1;
  const H = () => window.innerHeight || 1;
  const dur = () => {
    const s = getComputedStyle(document.documentElement).getPropertyValue('--d-camera').trim();
    return s.endsWith('ms') ? parseFloat(s) : 700;
  };
  // --ease-camera, cubic-bezier(0.32, 0, 0.16, 1): long, damped, no overshoot
  const ease = (t) => 1 - (1 - t) ** 3.2;

  // ---- what the bike looks like ------------------------------------------
  function sample(root) {
    const out = [];
    root.updateMatrixWorld(true);
    const meshes = [];
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position || o.userData?.marker) return;
      // ground decals (the contact shadow under each wheel) are not the bike
      if (o.material?.depthWrite === false) return;
      for (let q = o; q; q = q.parent) if (!q.visible) return;
      meshes.push(o);
    });
    const total = meshes.reduce((n, m) => n + m.geometry.attributes.position.count, 0) || 1;
    const stride = Math.max(1, Math.ceil(total / MAX_POINTS));
    for (const m of meshes) {
      const pos = m.geometry.attributes.position;
      // small parts (a pot on a cord, a strap end) get at least 64 samples, or
      // a thin extreme falls between two samples and the fit clips it
      const st = Math.max(1, Math.min(stride, Math.floor(pos.count / 64)));
      for (let i = 0; i < pos.count; i += st) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
    }
    return out;
  }
  function bikePoints() {
    if (!points) points = sample(app.bike.group);
    return points;
  }
  function bagPoints(slot) {
    const m = app.bags?.equipped?.[slot]?.mesh;
    return m ? sample(m) : null;
  }

  // ---- where the free area is ---------------------------------------------
  function freeRect() {
    const w = W(), h = H();
    const phone = w <= 560 || h <= 480;
    const r = { left: 0, right: w, top: 0, bottom: h };
    for (const bar of document.querySelectorAll('.topbar, .pr-head')) {
      const cs = getComputedStyle(bar);
      if (cs.visibility === 'hidden' || cs.display === 'none' || bar.closest('[hidden]')) continue;
      r.top = Math.max(r.top, bar.getBoundingClientRect().bottom);
    }
    for (const fn of chrome) {
      const c = fn();
      if (!c) continue;
      if (c.left != null) r.left = Math.max(r.left, c.left);
      if (c.bottom != null) r.bottom = Math.min(r.bottom, c.bottom);
      if (c.right != null) r.right = Math.min(r.right, c.right);
    }
    const pad = phone ? 14 : 36;
    r.left += pad; r.right -= pad; r.top += phone ? 4 : 8; r.bottom -= phone ? 8 : 28;
    if (r.bottom - r.top < 80) r.top = r.bottom - 80;
    return r;
  }

  // ---- the fit --------------------------------------------------------------
  /** Projected bbox of `pts` from `pos` looking at `tgt`, in full-frame px. */
  function bboxFrom(pts, pos, tgt) {
    scratch.fov = camera.fov;
    scratch.aspect = W() / H();
    scratch.near = camera.near; scratch.far = camera.far;
    scratch.up.copy(camera.up);
    scratch.position.copy(pos);
    scratch.lookAt(tgt);
    scratch.updateMatrixWorld(true);
    scratch.updateProjectionMatrix();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const w = W(), h = H();
    for (const p of pts) {
      v.copy(p).project(scratch);
      if (v.z > 1 || v.z < -1) continue;
      const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  function solve(pts, rect, tgt, dir, fill) {
    const rw = (rect.right - rect.left) * fill, rh = (rect.bottom - rect.top) * fill;
    const pos = new THREE.Vector3();
    const dirs = [dir];
    if (orbitSafe) {
      // the start screen turns the bike; fit the widest it will present
      for (let k = 1; k < 8; k++) dirs.push(dir.clone().applyAxisAngle(camera.up, (k * Math.PI) / 4));
    }
    const fits = (d) => dirs.every((dd) => {
      const b = bboxFrom(pts, pos.copy(tgt).addScaledVector(dd, d), tgt);
      return b.w <= rw && b.h <= rh;
    });
    let lo = 0.3, hi = 60;
    if (!fits(hi)) return null;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid; else lo = mid;
    }
    const b = bboxFrom(pts, pos.copy(tgt).addScaledVector(dir, hi), tgt);
    const cx = (rect.left + rect.right) / 2, cy = (rect.top + rect.bottom) / 2;
    return { d: hi, ox: orbitSafe ? W() / 2 - cx : b.cx - cx, oy: b.cy - cy };
  }

  /**
   * Work out the framing for the current state and glide to it.
   * `instant` for a resize, where a glide would lag the window.
   */
  function update({ instant = false } = {}) {
    if (paused || !app.bike) return;
    const rect = freeRect();
    let pts, tgt, fill;
    if (focusSlot) {
      pts = bagPoints(focusSlot);
      if (!pts?.length) { focusSlot = null; return update({ instant }); }
      const bb = new THREE.Box3().setFromPoints(pts);
      tgt = bb.getCenter(new THREE.Vector3());
      // the whole bag with the bike around it: half the free area, never a
      // close-up where the bike stops being recognisable
      fill = 0.42;
    } else {
      pts = bikePoints();
      if (!pts.length) return;
      tgt = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
      fill = 1;
    }
    const dir = camera.position.clone().sub(controls.target).normalize();
    const s = solve(pts, rect, tgt, dir, fill);
    last = { rect, s, tgt: tgt.toArray(), n: pts.length };
    if (!s) return;
    let d = s.d;
    const curD = camera.position.distanceTo(controls.target);
    if (userZoom && !focusSlot) d = curD;
    controls.maxDistance = Math.max(controls.maxDistance, d * 1.3, 9);
    const to = { d, ox: s.ox, oy: s.oy, tgt };
    const from = { d: curD, ox: off.x, oy: off.y, tgt: controls.target.clone() };
    if (userZoom && !focusSlot) {
      // their zoom, our pan: recompute the pan at their distance
      const b = bboxFrom(pts, controls.target.clone().addScaledVector(dir, d), tgt);
      to.ox = b.cx - (rect.left + rect.right) / 2;
      to.oy = b.cy - (rect.top + rect.bottom) / 2;
    }
    const ms = instant ? 0 : dur();
    anim = { from, to, t0: performance.now(), ms };
    if (ms <= 0) step(1);
  }

  function step(t) {
    const { from, to } = anim;
    const e = ease(t);
    const tgt = from.tgt.clone().lerp(to.tgt, e);
    const dir = camera.position.clone().sub(controls.target).normalize();
    const d = from.d + (to.d - from.d) * e;
    controls.target.copy(tgt);
    camera.position.copy(tgt).addScaledVector(dir, d);
    off.x = from.ox + (to.ox - from.ox) * e;
    off.y = from.oy + (to.oy - from.oy) * e;
    apply();
    lastDist = d;
    if (t >= 1) anim = null;
  }

  function apply() {
    camera.setViewOffset(W(), H(), Math.round(off.x), Math.round(off.y), W(), H());
    camera.updateProjectionMatrix();
  }

  // A dolly the person made, as opposed to one we made.
  controls.addEventListener?.('end', () => {
    if (anim || lastDist == null) return;
    const d = camera.position.distanceTo(controls.target);
    if (Math.abs(d - lastDist) / lastDist > 0.03) userZoom = true;
    lastDist = d;
  });
  // A drag during a glide hands the camera back to them.
  controls.addEventListener?.('start', () => { if (anim) { step(1); } });

  return {
    /** Register a function returning {left?, right?, bottom?} in px, or null. */
    addChrome(fn) { chrome.add(fn); return () => chrome.delete(fn); },
    update,
    /** Once per frame from the render loop. */
    tick() {
      if (!anim || paused) return;
      const t = anim.ms > 0 ? Math.min(1, (performance.now() - anim.t0) / anim.ms) : 1;
      step(t);
    },
    /** The bike changed shape (bags, size): resample before the next fit. */
    invalidate() { points = null; },
    focusBag(slot) { focusSlot = slot || null; update(); },
    frameBike({ reset = false, instant = false } = {}) {
      focusSlot = null;
      if (reset) userZoom = false;
      update({ instant });
    },
    setOrbitSafe(on) { orbitSafe = !!on; },
    pause(on) { paused = !!on; if (paused) anim = null; },
    get focus() { return focusSlot; },
    get animating() { return !!anim; },
    /** For the audits: the free area as the framer sees it. */
    freeRect,
    get debug() { return last; },
  };
}
