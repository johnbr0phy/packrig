/**
 * The scrim well's one number — DESIGN-SYSTEM.md §3.3, step 1 of §12.
 *
 * The problem it solves: panel alpha alone cannot serve both a night HDRI and
 * a noon desert. At 0.60 over night the panel vanishes; the same panel over
 * desert reads as a grey smear. Pushing alpha past 0.66 stops it being glass.
 * So we darken the SCENE BEHIND the panel instead, by a factor that tracks how
 * bright that scene actually is, and `--scrim-k` is that factor.
 *
 * It is written on `:root` by this module and by nothing else.
 *
 * How the number is obtained: after the frame is drawn, read a small block of
 * pixels out of the REAL framebuffer under each panel and take their mean
 * Rec.709 luminance.
 *
 * The first version rendered the scene again into a 1/32-scale render target
 * and sampled that. It was wrong, and instructively so: an offscreen render
 * skips tone mapping and the entire post chain, so what it measured was not
 * what the user sees. Desert noon came back at k=1.06 against the spec's 1.62,
 * barely distinguishable from mountain dawn at 1.07 — the mechanism appeared
 * to work while being nearly blind. Sampling the framebuffer costs a pipeline
 * stall, so it is throttled to one read per 500ms and reads ~1 KB.
 *
 *   k = clamp(0.80 + 1.15 * L, 0.80, 1.85)
 *
 * eased toward its new value over 400 ms so a camera sweep across a dark ridge
 * onto a bright sky never makes the panels visibly pump.
 *
 * Reference values from the spec, useful when checking a change did not drift:
 *   night   L≈0.06 → k≈0.87      mountain dawn L≈0.44 → k≈1.31
 *   forest  L≈0.22 → k≈1.05      desert noon   L≈0.71 → k≈1.62
 *   snow    L≈0.88 → k≈1.81
 */

const BLOCK = 12;          // px square read per panel, in device pixels
const EASE_MS = 400;       // §3.3: ease toward the new k, never jump
const MOVE_THROTTLE = 500; // §3.3: at most one readback per 500ms while moving
const K_MIN = 0.80, K_MAX = 1.85;

/** Rec.709 relative luminance from an 8-bit sRGB triple. */
function luminance709(r, g, b) {
  // The render target is sRGB-encoded (it is what the screen would show), so
  // linearise before weighting or bright scenes read far darker than they are.
  const f = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function initScrim(app, { selector = '.scrim-sampled' } = {}) {
  const { renderer, controls } = app;
  const gl = renderer?.getContext?.();
  if (!gl) return null;

  const buf = new Uint8Array(BLOCK * BLOCK * 4);

  /**
   * One small block of device pixels per panel, taken at the panel's centre.
   * Sampling the panel's whole area would mean reading tens of thousands of
   * pixels off the GPU every half second; a block at the centre of each panel
   * is what the ink actually has to survive, and there are only ever a handful
   * of panels.
   */
  function sampleBlocks() {
    const dpr = renderer.getPixelRatio ? renderer.getPixelRatio() : 1;
    const H = renderer.domElement.height;
    const out = [];
    for (const node of document.querySelectorAll(selector)) {
      const r = node.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || node.offsetParent === null) continue;
      // WebGL's origin is bottom-left; the DOM measures from the top.
      const cx = Math.round((r.left + r.width / 2) * dpr) - BLOCK / 2;
      const cy = H - Math.round((r.top + r.height / 2) * dpr) - BLOCK / 2;
      out.push({
        x: Math.max(0, Math.min(renderer.domElement.width - BLOCK, cx)),
        y: Math.max(0, Math.min(H - BLOCK, cy)),
      });
    }
    return out;
  }

  let target = 1.30;         // where k is heading
  let current = 1.30;        // where k is now
  let easeFrom = 1.30;
  let easeStart = -1;
  let lastSample = -1e9;
  let dirty = true;          // force a sample on the next tick
  let disposed = false;
  let lastL = -1;            // exposed for diagnosis; nothing reads it to draw

  const write = (k) => {
    document.documentElement.style.setProperty('--scrim-k', k.toFixed(3));
  };
  write(current);

  /** Read the drawn frame under each panel and turn it into a target k. */
  function sample() {
    const blocks = sampleBlocks();
    if (!blocks.length) return;                  // no panels on screen: leave k

    // Read from the default framebuffer — the frame the user is looking at,
    // tone-mapped and post-processed. Binding null is what makes that the
    // read source; the composer may have left one of its own targets bound.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let sum = 0, n = 0;
    for (const b of blocks) {
      gl.readPixels(b.x, b.y, BLOCK, BLOCK, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      for (let i = 0; i < buf.length; i += 4) {
        sum += luminance709(buf[i], buf[i + 1], buf[i + 2]);
        n++;
      }
    }
    if (!n) return;
    const L = sum / n;
    lastL = L;
    const k = Math.min(K_MAX, Math.max(K_MIN, 0.80 + 1.15 * L));
    if (Math.abs(k - target) < 0.004) return;    // below the noise floor
    easeFrom = current;
    easeStart = performance.now();
    target = k;
  }

  // A camera move invalidates the reading, but sampling every frame of an
  // orbit would cost a readback stall per frame. Mark dirty and let the
  // throttle in tick() decide.
  controls?.addEventListener?.('change', () => { dirty = true; });

  const api = {
    /** Call once per frame from the render loop, after controls.update(). */
    tick() {
      if (disposed) return;
      const now = performance.now();
      if (dirty && now - lastSample >= MOVE_THROTTLE) {
        lastSample = now;
        dirty = false;
        try { sample(); } catch { /* a lost context must not kill the loop */ }
      }
      if (easeStart >= 0) {
        const t = Math.min((now - easeStart) / EASE_MS, 1);
        // smoothstep: no visible start or stop, which is the whole point
        current = easeFrom + (target - easeFrom) * (t * t * (3 - 2 * t));
        write(current);
        if (t >= 1) easeStart = -1;
      }
    },
    /** The HDRI changed, or a panel opened/closed: re-read now, not in 500ms. */
    invalidate() { dirty = true; lastSample = -1e9; },
    get k() { return current; },
    /** Mean Rec.709 luminance of the last sample — check drift against §3.3. */
    get L() { return lastL; },
    /** Sample regions, for eyeballing WHERE the reading came from. */
    get blocks() { return sampleBlocks(); },
    dispose() { disposed = true; },
  };
  return api;
}
