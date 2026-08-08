import * as THREE from 'three';
import { device, fitDistance } from './mobile.js';

/**
 * Pointer focus for equipped bags: hover gives a light "half select" lift,
 * clicking commits the selection and makes that bag the centre of the zoom.
 *
 * Bag meshes share materials within a bag but never across bags (a fresh
 * `main`/`accent` pair is built per equip), so tinting a bag's materials is
 * safe and cannot bleed into its neighbours.
 *
 * ---- On a touch screen --------------------------------------------------
 *
 * There is no hover, so the half-select stage does not exist: a tap selects
 * outright and a second tap on the same bag deselects. The hover listeners are
 * not attached at all rather than attached and ignored — a coarse pointer
 * still emits `pointermove`, so leaving them on would run a raycast against
 * every equipped bag on every frame of a drag, for a tint nobody can see.
 * `canvas.style.cursor` is likewise never written, because there is no cursor.
 *
 * The panel keeps its half of the two-way highlight either way: `setHovered`
 * works on touch, since the panel asking for a highlight is deliberate in a way
 * that a stray pointer crossing the canvas is not.
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
    // span * 2.1 was fitted to a landscape viewport. three's fov is VERTICAL,
    // so a portrait phone has a far narrower field across than down, and that
    // distance frames a seat pack with both ends outside the frame. Take
    // whichever is further back; on any landscape aspect the fit is the smaller
    // of the two and this is exactly the old number.
    const want = Math.max(span * 2.1, fitDistance(camera, box, 1.15));
    const dist = THREE.MathUtils.clamp(want, controls.minDistance, controls.maxDistance);
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
    // Same trap as focusOn: the flat 3.1 frames the whole bike on a landscape
    // aspect and cuts it in half on a portrait one, so deselecting a bag on a
    // phone used to glide back to a crop. max() leaves every landscape aspect
    // on the original 3.1.
    const dist = Math.max(3.1, fitDistance(camera, box));
    glide = {
      t: 0,
      fromT: controls.target.clone(), toT: centre,
      fromP: camera.position.clone(), toP: centre.clone().addScaledVector(dir, dist),
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
  //
  // The threshold was tuned for a mouse, where 5px is generous. A finger is not
  // that precise: a deliberate tap routinely travels 8-10px, so 5px classifies
  // real taps as orbits and the bag never selects. Platform touch slop is 8dp
  // on Android and about 10pt on iOS; 12 sits just above both, and is still far
  // below the travel of anyone actually orbiting.
  //
  // Taken from the EVENT rather than from `device`, because the two disagree on
  // exactly the hardware that needs them to: a touchscreen laptop has a fine
  // primary pointer and a finger, and it should get 5px for the mouse and 12px
  // for the finger rather than one compromise for both.
  const slopFor = (type) => (type === 'mouse' ? 5 : 12);

  // Travel is accumulated as the MAXIMUM distance from the press point, not the
  // start-to-end distance. An orbit that swings around and comes back near
  // where it started measures as zero movement end-to-end, and would select a
  // bag after spinning the whole bike round — much easier to do with a finger
  // than with a mouse.
  let downAt = null;

  canvas.addEventListener('pointerdown', (e) => {
    // A second concurrent pointer means a pinch-zoom, not a tap. Abandon the
    // gesture rather than letting whichever finger lifts last count as a pick.
    if (downAt) { downAt = { id: -1, x: 0, y: 0, travel: Infinity }; return; }
    downAt = { id: e.pointerId, x: e.clientX, y: e.clientY, travel: 0 };
  });

  if (device.hover) {
    canvas.addEventListener('pointermove', (e) => {
      if (downAt) {
        downAt.travel = Math.max(downAt.travel, Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y));
        return;                                  // mid-drag: don't fight the orbit
      }
      const slot = pick(e);
      if (slot === hovered) return;
      hovered = slot;
      canvas.style.cursor = slot ? 'pointer' : '';
      repaint();
      app.ui?.setHovered?.(slot);
    });

    canvas.addEventListener('pointerleave', () => {
      if (hovered) { hovered = null; repaint(); canvas.style.cursor = ''; }
    });
  } else {
    // Coarse pointer: no hover stage and no cursor, but the drag distance still
    // has to be tracked or every orbit ends in a selection.
    canvas.addEventListener('pointermove', (e) => {
      if (!downAt) return;
      downAt.travel = Math.max(downAt.travel, Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y));
    });
  }

  // The browser can take a gesture away mid-flight (a system edge swipe, a
  // scroll handoff). Without this the stale press point survives and the NEXT
  // pointerup — belonging to a completely different gesture — is judged
  // against it.
  const abandon = () => { downAt = null; };
  canvas.addEventListener('pointercancel', abandon);

  canvas.addEventListener('pointerup', (e) => {
    const press = downAt;
    downAt = null;
    if (!press || press.id !== e.pointerId) return;
    const travel = Math.max(press.travel, Math.hypot(e.clientX - press.x, e.clientY - press.y));
    if (travel > slopFor(e.pointerType)) return; // that was an orbit, not a pick
    const slot = pick(e);
    // Tap-to-toggle: the same bag twice deselects, which on touch is the only
    // way back out of a focus, there being no hover-off and no empty-space
    // affordance the user can be sure of hitting.
    selected = slot && slot !== selected ? slot : null;
    // A tint the panel set can never be dismissed by a pointer leaving the
    // card, because on touch nothing reliably leaves. Clearing it whenever the
    // canvas is tapped keeps it self-healing instead of stuck.
    if (!device.hover) hovered = null;
    repaint();
    if (selected) focusOn(selected); else clearFocus();
    app.ui?.setSelected?.(selected);
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
