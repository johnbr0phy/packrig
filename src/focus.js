import * as THREE from 'three';

/**
 * Pointer focus for equipped bags: hover gives a light "half select" lift,
 * clicking commits the selection and makes that bag the centre of the zoom.
 *
 * Bag meshes share materials within a bag but never across bags (a fresh
 * `main`/`accent` pair is built per equip), so tinting a bag's materials is
 * safe and cannot bleed into its neighbours.
 */

const HOVER = 0x14161a;   // barely-there lift, reads as "you could pick this"
const SELECT = 0x2b2419;  // warmer and stronger, reads as "picked"

export function initFocus(app, { camera, controls, renderer }) {
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const canvas = renderer.domElement;

  let hovered = null;   // uiSlot
  let selected = null;  // uiSlot
  const tinted = new Map(); // material → original emissive hex

  const meshOf = (slot) => app.bags?.equipped?.[slot]?.mesh || null;

  function tint(slot, hex) {
    const root = meshOf(slot);
    if (!root) return;
    root.traverse((o) => {
      if (!o.isMesh || !o.material || o.material.emissive === undefined) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.emissive === undefined) continue;
        if (!tinted.has(m)) tinted.set(m, m.emissive.getHex());
        m.emissive.setHex(hex);
      }
    });
  }

  function clearTint(slot) {
    const root = meshOf(slot);
    if (!root) return;
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (tinted.has(m)) m.emissive.setHex(tinted.get(m));
      }
    });
  }

  function repaint() {
    for (const slot of Object.keys(app.bags?.equipped || {})) {
      if (slot === selected) tint(slot, SELECT);
      else if (slot === hovered) tint(slot, HOVER);
      else clearTint(slot);
    }
  }

  /** Which equipped bag, if any, is under the pointer. */
  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    ptr.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ptr.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    const roots = Object.entries(app.bags?.equipped || {})
      .map(([slot, rec]) => ({ slot, mesh: rec.mesh }))
      .filter((x) => x.mesh);
    if (!roots.length) return null;
    const hits = ray.intersectObjects(roots.map((x) => x.mesh), true);
    if (!hits.length) return null;
    // walk up to the bag root to find which slot was hit
    for (let o = hits[0].object; o; o = o.parent) {
      const found = roots.find((x) => x.mesh === o);
      if (found) return found.slot;
    }
    return null;
  }

  // ---- camera glide -------------------------------------------------------
  let glide = null;
  const tmp = new THREE.Vector3();

  function focusOn(slot) {
    const mesh = meshOf(slot);
    if (!mesh) return;
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return;
    const centre = box.getCenter(new THREE.Vector3());
    // frame the bag: pull the camera to a distance that fits its longest side
    const span = box.getSize(tmp).length();
    const dir = camera.position.clone().sub(controls.target).normalize();
    const dist = THREE.MathUtils.clamp(span * 2.1, controls.minDistance, controls.maxDistance);
    glide = {
      t: 0,
      fromT: controls.target.clone(), toT: centre,
      fromP: camera.position.clone(), toP: centre.clone().addScaledVector(dir, dist),
    };
  }

  function clearFocus() {
    // back to the whole bike
    const box = new THREE.Box3().setFromObject(app.bike.group);
    const centre = box.getCenter(new THREE.Vector3());
    const dir = camera.position.clone().sub(controls.target).normalize();
    glide = {
      t: 0,
      fromT: controls.target.clone(), toT: centre,
      fromP: camera.position.clone(), toP: centre.clone().addScaledVector(dir, 3.1),
    };
  }

  /** Call once per frame. Returns true while a glide is running. */
  function tick(dt) {
    if (!glide) return false;
    glide.t = Math.min(1, glide.t + dt / 0.45);
    const e = 1 - (1 - glide.t) ** 3;            // ease-out cubic
    controls.target.lerpVectors(glide.fromT, glide.toT, e);
    camera.position.lerpVectors(glide.fromP, glide.toP, e);
    if (glide.t >= 1) glide = null;
    return true;
  }

  // ---- input --------------------------------------------------------------
  // Distinguish a click from an orbit drag, or every camera move would select.
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });

  canvas.addEventListener('pointermove', (e) => {
    if (downAt) return;                          // mid-drag: don't fight the orbit
    const slot = pick(e);
    if (slot === hovered) return;
    hovered = slot;
    canvas.style.cursor = slot ? 'pointer' : '';
    repaint();
    app.ui?.setHovered?.(slot);
  });

  canvas.addEventListener('pointerup', (e) => {
    const moved = downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5;
    downAt = null;
    if (moved) return;                           // that was an orbit, not a pick
    const slot = pick(e);
    selected = slot && slot !== selected ? slot : null;
    repaint();
    if (selected) focusOn(selected); else clearFocus();
    app.ui?.setSelected?.(selected);
  });

  canvas.addEventListener('pointerleave', () => {
    if (hovered) { hovered = null; repaint(); canvas.style.cursor = ''; }
  });

  return {
    tick,
    /** Let the panel drive the scene highlight, mirroring the canvas. */
    setHovered(slot) {
      if (slot === hovered) return;
      hovered = slot || null;
      repaint();
    },
    setSelected(slot) {
      selected = slot || null;
      repaint();
      if (selected) focusOn(selected); else clearFocus();
      app.ui?.setSelected?.(selected);
    },
    get selected() { return selected; },
    focusOn,
    clearFocus,
    /** Re-apply tints after the kit changes (equip/remove rebuilds meshes). */
    refresh() {
      tinted.clear();
      if (selected && !meshOf(selected)) selected = null;
      if (hovered && !meshOf(hovered)) hovered = null;
      repaint();
    },
  };
}
