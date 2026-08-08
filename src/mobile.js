/**
 * Device profile — the single place capability is decided.
 *
 * Everything else asks this module rather than sniffing a user agent. There is
 * no UA matching anywhere below, on purpose: a UA allowlist is wrong the day
 * after it is written, and it cannot tell a 2018 budget Android from a 2024
 * flagship, which is the distinction that actually matters here.
 *
 * Three separate questions live here and they must not be conflated:
 *
 *   1. INPUT   — can the user hover? Decided once from `(pointer:)` /
 *                `(hover:)`, because it is a property of the hardware.
 *   2. LAYOUT  — is this phone-sized right now? Live, because rotating a phone
 *                changes it and a frozen answer would call a phone in
 *                landscape a tablet forever.
 *   3. TIER    — how much GPU is there? Probed once from the real GL context,
 *                and optionally corrected later by timing real frames.
 *
 * ---- What the measurements said -----------------------------------------
 *
 * All figures are per-frame `composer.render()` cost at 393x852, measured on an
 * M1 through headless Chrome (ANGLE/Metal), min-of-many-batches. They are a
 * RELATIVE guide to what each pass costs; a real phone GPU is not simulable and
 * the absolute numbers there will be several times larger.
 *
 *   GTAO + bloom + SMAA @ DPR 2   13.3 ms   <- what desktop does today
 *   GTAO + bloom + SMAA @ DPR 1.5  8.7 ms
 *   bloom + SMAA        @ DPR 1.5  4.5 ms   <- the phone profile
 *   bloom + SMAA        @ DPR 1.25 3.7 ms
 *   RenderPass only     @ DPR 1.5  3.2 ms
 *
 * Isolated: GTAO 4.3 ms (6.8 ms at DPR 2), SMAA 0.7-1.2 ms, bloom 0.1-0.6 ms,
 * shadows 1.5-3 ms.
 *
 * So GTAO is the whole argument — it costs more than the base scene render and
 * more than everything else in the chain put together, and at 393px wide its
 * contact darkening is a few pixels of shading nobody is looking for. It goes.
 *
 * SMAA stays. It is the cheapest pass in the chain and the only antialiasing
 * there is: EffectComposer builds its render targets with `samples: 0`, so the
 * renderer's own `antialias: true` is inert the moment the composer owns the
 * frame. Drop SMAA and the spokes crawl.
 *
 * Bloom stays because it is nearly free and it is what the paint highlights and
 * the night environment are lit for.
 *
 * Shadows stay. They cost about what GTAO costs, but they are the only thing
 * putting the bike ON the ground rather than floating above it, and dropping
 * them reads as a bug rather than as a lower setting. PCFShadowMap instead of
 * PCFSoftShadowMap was measured at 4.60 ms vs 4.59 ms — no gain at all — so the
 * filter is left alone rather than traded for nothing.
 */

// ---- 1. Input ------------------------------------------------------------
// Decided once. `matchMedia` is guarded so this module still imports under a
// headless tool that stubs the DOM.
const mm = (q) => (typeof matchMedia === 'function' ? matchMedia(q).matches : false);

// Hover capability, NOT touch capability, is what decides whether a hover-only
// affordance is reachable. A touchscreen laptop reports maxTouchPoints > 0 and
// still has a real cursor; keying off touch would strip its hover feedback.
const hover = mm('(hover: hover) and (pointer: fine)');
// MOBILE.md's rule: a coarse pointer is touch regardless of viewport width.
const coarse = mm('(pointer: coarse)') || !hover;

// ---- 2. Layout -----------------------------------------------------------
// Breakpoints are MOBILE.md's, verbatim. These are getters because the answer
// changes when the phone rotates.
const PHONE_MAX = 560;
const TABLET_MAX = 900;
const vw = () => (typeof window === 'undefined' ? 1440 : window.innerWidth);
const vh = () => (typeof window === 'undefined' ? 900 : window.innerHeight);

// ---- 3. Tier -------------------------------------------------------------
// Pixel-ratio ladder. Anything on this ladder is a compromise between fill cost
// and how ugly a thin spoke looks; the steps are small because the difference
// between 1.5 and 1.75 is a lot of pixels and very little visible change.
const DPR_STEPS = [1, 1.25, 1.5, 1.75, 2];
const DPR_FOR_TIER = { low: 1.25, mid: 1.5, high: 1.75 };

/**
 * Rough GPU tier from cheap, honest signals.
 *
 * Deliberately NOT a GPU-name allowlist: the renderer string is read only for
 * the one thing it reliably tells you, which is whether we are on a software
 * rasteriser. Everything else is a capability number.
 *
 * `deviceMemory` is absent on Safari/iOS, so an undefined value must not score
 * zero — that would put every iPhone ever made in the bottom tier.
 */
function probeTier(renderer) {
  let score = 0;
  try {
    const gl = renderer.getContext();
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (maxTex >= 8192) score += 1;
    if (maxTex >= 16384) score += 1;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '');
    // SwiftShader/llvmpipe are CPU rasterisers. Nothing else in this probe can
    // see them, and they cannot afford any of the post chain.
    if (/swiftshader|llvmpipe|software/i.test(name)) return 'low';
  } catch { /* no context yet, or a driver that refuses the query: stay neutral */ }

  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 0;
  if (cores >= 6) score += 1;
  if (cores >= 8) score += 1;
  const memGb = typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined;
  if (memGb !== undefined && memGb >= 4) score += 1;

  if (score <= 1) return 'low';
  if (score <= 3) return 'mid';
  return 'high';
}

let _tier = null;
let _pixelRatio = null;

export const device = {
  /** True when the primary pointer cannot hover. Drives every input decision. */
  get coarse() { return coarse; },
  /** True when a real cursor exists, so hover affordances are worth attaching. */
  get hover() { return hover; },
  get touch() { return coarse || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0); },
  // Live, not frozen: rotation changes these.
  // Width alone calls a landscape phone a tablet: 852x393 is 852 wide. The
  // second clause catches it — a coarse pointer with almost no height is a
  // phone on its side, and it is the case where a bottom sheet leaves least
  // room, so it is the one that most needs the lift. aero.css and ui.css draw
  // the same line with `(pointer: coarse) and (max-height: 480px)`; keep all
  // three in step.
  get phone() { return vw() <= PHONE_MAX || (coarse && vh() <= 480); },
  // "Desktop" is a wide viewport AND a real cursor. Width alone would hand the
  // desktop layout to an iPad in landscape, which MOBILE.md rules out
  // explicitly. Mirrors DESKTOP_LAYOUT in main.js — keep the two in step.
  get desktop() { return vw() > TABLET_MAX && hover; },
  get tablet() { return !device.phone && !device.desktop; },
  get portrait() { return vh() > vw(); },
  get dpr() { return typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1; },
  /** 'low' | 'mid' | 'high'. Null until applyRendererProfile() has run. */
  get tier() { return _tier; },
  /** The pixel ratio actually in force. Null until applyRendererProfile(). */
  get pixelRatio() { return _pixelRatio; },
};

/**
 * Decide the renderer profile and apply the parts that live on the renderer.
 * Call once, right after the WebGLRenderer is constructed and BEFORE the
 * composer's passes are built — the caller needs `.post` to know which passes
 * to construct at all. Constructing a GTAOPass and then leaving it disabled
 * would still allocate its render targets, which is memory a phone has better
 * uses for.
 *
 * Returns { pixelRatio, post: { gtao, bloom, smaa }, tier }.
 *
 * On a desktop pointer this returns exactly today's settings — pixel ratio
 * min(dpr, 2) and all three passes — so the desktop build is bit-identical.
 */
export function applyRendererProfile(renderer) {
  _tier = probeTier(renderer);
  const raw = device.dpr;

  // Desktop is untouched, deliberately and verifiably: same cap, same chain.
  if (!coarse) {
    _pixelRatio = Math.min(raw, 2);
    renderer.setPixelRatio(_pixelRatio);
    return { pixelRatio: _pixelRatio, post: { gtao: true, bloom: true, smaa: true }, tier: _tier };
  }

  // A phone at DPR 3 rendering GTAO is asking a mobile GPU to shade nine times
  // the pixels of a CSS-pixel frame through the most expensive pass in the
  // chain. Cap by tier rather than by the panel's own ratio: what the screen
  // reports has no relationship to what the GPU behind it can fill.
  _pixelRatio = Math.min(raw, DPR_FOR_TIER[_tier] ?? 1.5);
  renderer.setPixelRatio(_pixelRatio);

  return {
    pixelRatio: _pixelRatio,
    post: {
      gtao: false,                 // 4.3-6.8 ms, and invisible at this size
      bloom: _tier !== 'low',      // 0.1-0.6 ms, so only the bottom tier sheds it
      smaa: true,                  // the only AA there is; spokes need it
    },
    tier: _tier,
  };
}

/**
 * Optional second opinion: time real frames and step the pixel ratio down if
 * the device is slower than the static probe assumed.
 *
 * This is the honest half of "a rough tier". No probe of core counts and
 * texture limits can tell a throttled phone in a hot car from a cold one, and
 * no allowlist can know about hardware that shipped after this was written.
 * Watching what the frames actually cost can.
 *
 * No-ops entirely on a fine pointer, so it cannot touch desktop. Only ever
 * steps DOWN, and at most twice, so it settles instead of oscillating.
 */
export function watchPerformance(renderer, composer, { budgetMs = 22, samples = 90 } = {}) {
  if (!coarse || typeof requestAnimationFrame !== 'function') return () => {};
  let steps = 0;
  let n = 0;
  let prev = 0;
  const times = [];
  let stopped = false;

  const tick = (t) => {
    if (stopped) return;
    if (prev) {
      const dt = t - prev;
      // Ignore the huge deltas a backgrounded tab produces; they are not the
      // device being slow, and one of them would trigger a downgrade on its own.
      if (dt < 500) times.push(dt);
    }
    prev = t;
    if (++n >= samples) {
      times.sort((a, b) => a - b);
      const median = times[times.length >> 1] ?? 0;
      if (median > budgetMs && steps < 2 && _pixelRatio > DPR_STEPS[0]) {
        const i = DPR_STEPS.findIndex((s) => s >= _pixelRatio);
        _pixelRatio = DPR_STEPS[Math.max(0, i - 1)];
        renderer.setPixelRatio(_pixelRatio);
        composer?.setPixelRatio?.(_pixelRatio);
        renderer.setSize(vw(), vh());
        composer?.setSize?.(vw(), vh());
        steps++;
        n = 0;
        prev = 0;
        times.length = 0;
      } else {
        return; // settled
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => { stopped = true; };
}

/**
 * Options for aero/measure.js.
 *
 * THE MEASUREMENT IS NOT DEGRADED ON MOBILE, and that is a measured decision
 * rather than a cautious one. The obvious lever — drop the render target from
 * 512 to 256 on a phone — was tried and rejected:
 *
 *   resolution   measure() cost   total CdA      "Bottles stowed" row
 *   512 (today)      43.2 ms       0.48109        -0.000594
 *   384              38.1 ms       0.48086        -0.000805
 *   320              39.0 ms       0.47984        -0.000921
 *   256              35.9 ms       0.48260        +0.000076   <- sign flip
 *
 * Two things kill it. First, the saving is not there: the pass is bound by
 * fifteen synchronous readbacks and by drawing the rig, not by filling pixels,
 * so a 4x cut in pixels bought 17%. Second, the accuracy cost lands exactly
 * where it does the most damage. The total is robust — within 0.4% all the way
 * down to 128 — but `bottles` is a DIFFERENCE of two nearly-identical body
 * passes, and quantising both of them destroys it: at 256 the one row in the
 * whole readout that is allowed to be negative, the frame bag swallowing both
 * bidons, turns into a small positive. A saving displayed as a penalty is not a
 * lower graphics setting, it is a wrong answer. Small bags go the same way —
 * a top tube bag at 0.0006 m² frontal moved 30-47% between 512 and 256.
 *
 * Shortening the yaw sweep was measured too. `weightedCda` interpolates over
 * whatever angles it is handed, so dropping to [0, 10, 20] does not break —
 * it costs +0.31% to +0.62% on `cdaWeighted` across four kits (0.38553 ->
 * 0.38793 on the seed-7 kit), and [0, 20] costs +3.3%. But it buys nothing that
 * matters: aero/index.js measures through `measureAsync`, which already spends
 * ONE yaw per animation frame, so the per-frame hitch is unchanged by sweeping
 * fewer of them. All it shortens is how many frames pass before the readout
 * settles. Trading a number the panel presents as measured for that is a bad
 * deal at any price.
 *
 * The signature stays device-shaped so the decision has one home if a real
 * phone ever proves the readbacks are bandwidth-bound rather than latency-bound
 * — which is the one way this could come out differently, since 15 readbacks at
 * 512² RGBA move 15 MB, and a tiled mobile GPU pays for that very differently
 * than an M1 does.
 */
export function measureProfile() {
  return { resolution: 512, yaws: [0, 5, 10, 15, 20] };
}

// ---- Camera framing ------------------------------------------------------

/**
 * The horizontal shift that clears the desktop mounts panel. Unchanged, and
 * applied only when a side panel is actually there to clear.
 */
export const DESKTOP_VIEW_OFFSET_X = -165;

/**
 * How far up the frame the bike sits, as a fraction of viewport height, when a
 * bottom sheet owns the lower part of the screen.
 *
 * MOBILE.md's decision is that the 3D view keeps the upper half, with sheets at
 * `max-height: 55vh` below it. Lifting by L moves the bike's centre from 0.50h
 * to (0.50 - L)h, so 0.22 centres it at 0.28h. Measured at 393x852, where the
 * bike is 0.51 in NDC ≈ 217px tall: it then spans y 130-347, which clears the
 * header (ends ≈110) and clears a fully expanded sheet (starts at 0.45h = 383).
 *
 * 0.10 was tried first and is wrong — it frames for a COLLAPSED sheet, and with
 * the sheet open the bike is three quarters hidden behind it.
 *
 * This is the one number here that depends on what ui-mobile actually renders.
 * If the sheet grows or the app starts tracking open/collapsed, drive it with
 * setSheetLift() rather than editing this.
 */
let SHEET_LIFT = 0.22;

/**
 * Retune the lift from outside — e.g. less lift when the sheet is collapsed.
 * The caller re-applies the offset itself; this only stores the number, so it
 * cannot surprise a frame that is mid-render.
 */
export function setSheetLift(fraction) {
  SHEET_LIFT = Math.min(0.4, Math.max(0, Number(fraction) || 0));
}

/**
 * Put the projection back where the visible part of the screen is.
 *
 * Desktop keeps the exact -165 it has always had. A phone has no side panel to
 * clear — the panels are bottom sheets — so a horizontal shift would only push
 * the bike off-frame, which is precisely the bug. Instead the frame is lifted
 * so the bike sits above the sheet.
 */
export function applyViewOffset(camera) {
  const w = vw();
  const h = vh();
  if (device.desktop) {
    camera.setViewOffset(w, h, DESKTOP_VIEW_OFFSET_X, 0, w, h);
  } else if (device.phone) {
    // setViewOffset's y is the top of the sub-window, so a POSITIVE y moves the
    // rendered content up the screen.
    camera.setViewOffset(w, h, 0, Math.round(h * SHEET_LIFT), w, h);
  } else {
    // Tablet keeps its panels beside the view rather than as sheets, so there
    // is nothing below to clear and no lift is wanted — but the panel is
    // narrower than the desktop one by an amount only ui.css knows, so no
    // horizontal shift is guessed at either. Clearing matches what main.js
    // already does for every non-desktop layout.
    camera.clearViewOffset();
  }
  camera.updateProjectionMatrix();
}

/**
 * Distance at which `box` fits the camera's current aspect, with a margin.
 *
 * three's `fov` is VERTICAL, so a tall viewport has a brutally narrow
 * horizontal field: at 393x852 the 27° lens gives 12.6° across, and the bike —
 * 1.79 m long — spans 4.94 in NDC where 2.0 exactly fills the frame. Nearly
 * 60% of it is off-screen, which is the "cropped to a rear wheel" in MOBILE.md.
 */
export function fitDistance(camera, box, margin = 1.08) {
  const sx = box.max.x - box.min.x;
  const sy = box.max.y - box.min.y;
  const sz = box.max.z - box.min.z;
  // The widest the box can present as the user orbits around Y. Using only
  // size.x would fit the side-on view and re-crop on the diagonal.
  const wide = Math.hypot(sx, sz);
  const vfov = (camera.fov * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);

  // A view offset spends frame. Shifting the picture right by 165px to clear
  // the panel means the bike's half-width has only (w/2 - 165) to live in, so
  // fitting against the full frame and then shifting is how a fitted bike ends
  // up clipped against the far edge — which is exactly what happened on a
  // portrait tablet, where the fit is width-bound to begin with. `camera.view`
  // is read rather than the offset being recomputed, so this cannot drift out
  // of step with whatever applyViewOffset actually set.
  const v = camera.view;
  let fx = 1;
  let fy = 1;
  if (v && v.enabled && v.fullWidth > 0 && v.fullHeight > 0) {
    fx = Math.max(0.2, 1 - (2 * Math.abs(v.offsetX)) / v.fullWidth);
    fy = Math.max(0.2, 1 - (2 * Math.abs(v.offsetY)) / v.fullHeight);
  }

  return Math.max(
    wide / 2 / (Math.tan(hfov / 2) * fx),
    sy / 2 / (Math.tan(vfov / 2) * fy),
  ) * margin;
}

/**
 * Back the camera off far enough that the whole bike is in frame, keeping the
 * preset's ANGLE exactly — only the distance along the existing view direction
 * changes, so no camera composition is re-authored.
 *
 * It never pulls the camera IN. That single rule is what makes this safe: on
 * desktop (1440x900) the fit distance is 2.33 against a hero preset already at
 * 3.43, and in landscape (852x393) it is 2.09, so both are left untouched and
 * desktop behaviour is unchanged by construction. Only a tall viewport, where
 * the fit distance is 8.1 and the preset is 3.43, moves at all.
 *
 * `controls.maxDistance` has to come up with it — the default ceiling of 9 is
 * below the portrait fit once a margin is on it, so without this the clamp
 * silently re-crops the bike.
 */
export function fitToBox(camera, controls, box) {
  const need = fitDistance(camera, box);
  if (controls) controls.maxDistance = Math.max(9, need * 1.25);
  const dx = camera.position.x - controls.target.x;
  const dy = camera.position.y - controls.target.y;
  const dz = camera.position.z - controls.target.z;
  const dist = Math.hypot(dx, dy, dz);
  if (!(dist > 0) || need <= dist) return dist;
  const k = need / dist;
  camera.position.set(
    controls.target.x + dx * k,
    controls.target.y + dy * k,
    controls.target.z + dz * k,
  );
  return need;
}
