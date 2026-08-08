/**
 * Camera reframing for the sheet shell — DESIGN-SYSTEM.md §6.7.
 *
 * §1.1 says the bike is never crowded: chrome takes ≤24% of the viewport at
 * rest, ≤38% with the product sheet open, ≤52% in the catalogue, and in every
 * state the bike's silhouette sits entirely inside the free area with ≥40px
 * clearance. Without this module that is a slogan — opening a 720px catalogue
 * sheet would simply bury the rear wheel.
 *
 * Two rules from §6.7 that are easy to get wrong:
 *   - PAN AND DOLLY ONLY. Never rotate on a sheet open. Rotating the camera
 *     while someone reads a spec table is nauseating.
 *   - On close, do not restore the old framing if the user has orbited since
 *     opening. Undo the pan offset and leave their camera alone.
 *
 * MECHANISM. The pan is a `camera.setViewOffset` shift, not a moved camera.
 * Shifting the projection keeps the orbit target, the focus raycasts and the
 * clearance audits all working on an unmoved camera, and it is what
 * `mobile.js` already uses for the same job. This module TAKES OVER that call
 * on desktop, because the offset now has to track a chrome layout that
 * changes; `applyViewOffset` still owns the phone and tablet cases, which have
 * no side sheet.
 *
 * SIGN CONVENTION, since it has bitten twice: `setViewOffset`'s x is the left
 * edge of the sub-window inside the full frame, so a POSITIVE x moves the
 * rendered content LEFT on screen, and a negative x moves it right. That is
 * why mobile.js clears the left panel with −165.
 */

import * as THREE from 'three';
import { device } from '../mobile.js';

const GUTTER = 24;   // §4.1 --gutter, the breathing room chrome keeps off the bike
const PAD = 40;      // §1.1 minimum clearance from the bike to the free-area edge

/**
 * The horizontal view offset that centres the bike in whatever the free area
 * currently is, derived from where the chrome actually is on screen rather
 * than from constants that go stale the moment a panel changes width.
 *
 *   offsetX = (rightChrome - leftChrome) / 2
 *
 * Sanity-check it against the value mobile.js hard-codes: with the old 320px
 * panel and no sheet that is (0 - 344)/2 = -172, against its -165.
 */
function offsetForChrome(leftPx, rightPx) {
  return (rightPx - leftPx) / 2;
}

export function initReframe(app, { applyBase } = {}) {
  const { camera, controls } = app;
  if (!camera) return null;

  // DESKTOP ONLY. Below 900px the sheet is a BOTTOM sheet (see sheet.css), so
  // there is no side chrome to pan away from, and `mobile.js` already owns the
  // vertical lift that clears it via setSheetLift(). Measuring chrome on a
  // phone would read the full-width bottom sheet as right-hand chrome and
  // shove the bike off the left edge. Every entry point checks this.
  const desktop = () => !!device.desktop;

  const box = new THREE.Box3();
  const sphere = new THREE.Sphere();

  let current = null;      // the offset in force, px
  let from = 0, to = 0, startedAt = -1, durMs = 0;
  let dollyFrom = 0, dollyTo = 0;
  let orbitedSinceOpen = false;
  let watching = false;

  const vw = () => window.innerWidth || 1;
  const vh = () => window.innerHeight || 1;
  const dur = () => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--d-camera').trim();
    return v.endsWith('ms') ? parseFloat(v) : 700;
  };
  // --ease-camera: cubic-bezier(0.32, 0, 0.16, 1), long and damped with no
  // overshoot. Sampled rather than imported so the token stays the source.
  const easeCamera = (t) => {
    // Closed-form approximation of that curve, max error ~0.006 — well under a
    // pixel of the 700ms move, and it avoids shipping a bezier solver.
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  };

  /** Measure the chrome that is actually on screen right now. */
  function chrome() {
    const leftEl = document.querySelector('.panel');
    const sheetEl = document.querySelector('.sheet.open');
    const left = leftEl && leftEl.offsetParent !== null
      ? Math.max(0, leftEl.getBoundingClientRect().right) + GUTTER : 0;
    const right = sheetEl
      ? Math.max(0, vw() - sheetEl.getBoundingClientRect().left) + GUTTER : 0;
    return { left, right, freeW: Math.max(120, vw() - left - right) };
  }

  /**
   * How far out the camera has to sit for the bike to fit the free area with
   * PAD to spare. Returns a multiplier on the current orbit distance; 1 means
   * "already fits", and §6.7 says dolly out ONLY — never pull in on open, or a
   * closing sheet would leave the user somewhere they never chose to be.
   */
  function dollyFactor(freeW) {
    if (!app.bike?.group || !controls) return 1;
    box.setFromObject(app.bike.group);
    if (box.isEmpty()) return 1;
    box.getBoundingSphere(sphere);
    const dist = camera.position.distanceTo(controls.target);
    if (!(dist > 0)) return 1;
    // Projected half-width of the bounding sphere, in px, at the current dist.
    const vfov = (camera.fov * Math.PI) / 180;
    const pxPerUnit = vh() / (2 * Math.tan(vfov / 2) * dist);
    const needPx = sphere.radius * 2 * pxPerUnit;
    const havePx = Math.max(80, freeW - 2 * PAD);
    return needPx <= havePx ? 1 : needPx / havePx;
  }

  function animateTo(offset, factor) {
    from = current ?? offset;
    to = offset;
    dollyFrom = 1;
    dollyTo = factor;
    durMs = dur();
    startedAt = durMs > 0 ? performance.now() : -1;
    if (durMs <= 0) { applyOffset(offset); applyDolly(factor); current = offset; }
  }

  function applyOffset(px) {
    camera.setViewOffset(vw(), vh(), Math.round(px), 0, vw(), vh());
    camera.updateProjectionMatrix();
  }

  function applyDolly(factor) {
    if (!controls || factor === 1) return;
    const dir = camera.position.clone().sub(controls.target);
    camera.position.copy(controls.target).add(dir.multiplyScalar(factor));
    if (controls.maxDistance !== undefined) {
      controls.maxDistance = Math.max(controls.maxDistance, dir.length() * 1.05);
    }
  }

  const onOrbit = () => { orbitedSinceOpen = true; };

  const api = {
    /**
     * Reframe for the chrome as it currently stands. Call on the SAME tick the
     * sheet's width changes — §5 requires the panel and the camera to move on
     * one curve so they read as one gesture, not two things happening near
     * each other.
     */
    update({ opening = false } = {}) {
      if (!desktop()) { applyBase?.(); return; }
      const c = chrome();
      const offset = offsetForChrome(c.left, c.right);
      if (opening) {
        orbitedSinceOpen = false;
        if (!watching && controls?.addEventListener) {
          controls.addEventListener('start', onOrbit);
          watching = true;
        }
      }
      animateTo(offset, opening ? dollyFactor(c.freeW) : 1);
    },

    /**
     * Hand the camera back. §6.7: if they have orbited since the sheet opened,
     * respect their camera — undo the pan and nothing else.
     */
    release() {
      if (!desktop()) { current = null; applyBase?.(); return false; }
      const c = chrome();
      animateTo(offsetForChrome(c.left, c.right), 1);
      if (watching && controls?.removeEventListener) {
        controls.removeEventListener('start', onOrbit);
        watching = false;
      }
      const dollied = !orbitedSinceOpen;
      orbitedSinceOpen = false;
      return dollied;
    },

    /**
     * Re-assert the offset without animating — for a resize, where main.js's
     * frameBike() has just called applyViewOffset and clobbered ours.
     */
    reassert() {
      if (!desktop() || current === null) { applyBase?.(); return; }
      applyOffset(current);
    },

    /** Once per frame, from the render loop. */
    tick() {
      if (startedAt < 0 || !desktop()) return;
      const t = Math.min((performance.now() - startedAt) / durMs, 1);
      const e = easeCamera(t);
      current = from + (to - from) * e;
      applyOffset(current);
      // Dolly is applied as a per-frame incremental scale so it composes with
      // whatever the user's own zoom is doing rather than fighting it.
      if (dollyTo !== 1) {
        const want = 1 + (dollyTo - 1) * e;
        const had = 1 + (dollyTo - 1) * easeCamera(Math.max(0, (t - 0.016)));
        applyDolly(want / (had || 1));
      }
      if (t >= 1) { startedAt = -1; dollyTo = 1; dollyFrom = 1; }
    },

    get offset() { return current; },
    dispose() {
      if (watching && controls?.removeEventListener) controls.removeEventListener('start', onOrbit);
      watching = false;
    },
  };
  return api;
}
