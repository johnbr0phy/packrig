// Wind tunnel: composition root.
//
// Owns the wiring between the six aero modules and the rest of the app. Nothing
// here does physics, geometry or DOM — it decides WHEN things run and holds the
// small amount of state (ride settings, cached baseline) that spans modules.

import { createAeroMeter } from './measure.js';
import { RIDE_DEFAULTS, compare, fairingCredit, grade, power } from './model.js';
import { buildFlowField } from './flow.js';
import { createSmoke } from './smoke.js';
import { createRider } from './rider.js';
import { createTunnel } from './tunnel.js';
import { createAeroPanel } from './panel.js';

export function initAero(app, { scene, camera, renderer, controls, composer, passes, measure, onToggle }) {
  const { bike, bags } = app;

  const meter = createAeroMeter({ renderer, scene, bike, bags });
  const rider = createRider(bike);
  rider.setOpacity(0);
  bike.frameGroup.add(rider.group);

  let flow = buildFlowField(bike, bags, { yawDeg: 0, rider: rider.group });
  // bikeBounds, not the padded 5m flow domain: the rake is sized and placed off
  // the BIKE's extent, and handing it the domain would build a machine the size
  // of the room.
  const smoke = createSmoke({ flow, bounds: flow.bikeBounds });
  scene.add(smoke.group);
  smoke.setEnabled(false);

  const tunnel = createTunnel(app, { smoke, rider, meter, camera, controls, composer, passes });

  const ride = { ...RIDE_DEFAULTS };
  let yawDeg = 0;
  let baselineCda = null;   // bare bike + rider, no bags — the reference
  let result = null;

  const panel = createAeroPanel({
    onSpeedChange(kph) {
      ride.speedKph = kph;
      refreshReadout();
    },
    onYawChange(deg) {
      yawDeg = deg;
      // Yaw changes what the SMOKE shows; the measured sweep already covers all
      // angles, so this is a re-render of existing data plus a new flow field.
      rebuildFlow();
      refreshReadout();
    },
    onExit() { exit(); },
    onHoverPart(key) {
      // Reuse the existing canvas highlight so hovering a waterfall bar lights up
      // the bag, exactly as the "On your bike" panel already does.
      app.focus?.setHovered(isBagKey(key) ? key : null);
    },
  });

  // Reserved part keys have no bag to highlight. `racks` is one of them: it is a
  // charged part with its own waterfall row, so the user CAN hover it, but it
  // names no uiSlot and would ask focus.js to highlight a bag that does not exist.
  const RESERVED_PARTS = new Set(['bike', 'wheels', 'rider', 'racks', 'bottles']);

  function isBagKey(key) {
    return !!key && !RESERVED_PARTS.has(key);
  }

  // The device profile decides these: a phone can afford a smaller buffer.
  // NOTE a shortened yaw sweep would change `cdaWeighted`, which the HUD
  // presents as measured — so the profile keeps all five angles and only drops
  // resolution, which does not move the number.
  const YAWS = measure?.yaws || [0, 5, 10, 15, 20];
  const RESOLUTION = measure?.resolution || 512;

  // The engine measures the bags-off rig itself, in the same passes, with the
  // racks and bottles in whatever state the current kit leaves them. Hiding the
  // racks here instead would strip a pannier's own rack out of the baseline —
  // the one part of fitting panniers a rider cannot take off.

  /**
   * A frame bag caps the open main triangle, so the FRAME sheds less drag than
   * it did bare. measure.js cannot see that — it measures area and multiplies by
   * a Cd, and a positive area times a positive Cd can never come out negative.
   * So the credit is applied here, once, to the reserved `bike` part.
   *
   * It is applied to the loaded measurement only. The baseline is measured with
   * the bags hidden, which is a bike that genuinely has no fairing — crediting
   * it there would cancel the effect out and hide the result entirely.
   */
  function applyFairing(res) {
    const bikePart = res.parts.find((p) => p.key === 'bike');
    if (!bikePart) return res;
    const credit = fairingCredit(Object.keys(bags.equipped), bikePart.cda);
    if (!credit) return res;
    bikePart.cda += credit;
    bikePart.cdaWeighted += credit;
    res.cdaHeadOn += credit;
    res.cdaWeighted += credit;
    for (const p of res.byYaw) p.cda += credit;
    res.fairingCredit = credit; // the panel calls this out; it is the interesting bit
    return res;
  }

  let measureSeq = 0;

  async function remeasure() {
    // measureAsync spreads the five yaw passes over five frames, turning one
    // ~20ms hitch into five ~4ms slices. Under load the synchronous path was
    // measured as high as 90ms, which is a visible stall on every kit change.
    const seq = ++measureSeq;
    const res = await meter.measureAsync({ yaws: YAWS, resolution: RESOLUTION });
    if (seq !== measureSeq) return; // a newer measurement started; drop this one
    // Total is baseline + bags by construction, which is what compare() has
    // always assumed and which the engine now asserts on every run.
    baselineCda = res.cdaBaseline;
    result = applyFairing(res);
    refreshReadout();
  }

  function refreshReadout() {
    if (!result) return;
    const comparison = compare(baselineCda, result.cdaHeadOn, ride);
    panel.update(result, { ...ride, yawDeg, baselineCda }, {
      ...comparison,
      // Added watts scale with v³, so an unnormalised grade would rate the same
      // rig A at 20 km/h and D at 40 — a property of the slider, not the kit.
      grade: grade(comparison.addedW, { speedKph: ride.speedKph }),
      totalW: power({ cda: result.cdaHeadOn, ...ride }).totalW,
    });
  }

  function rebuildFlow() {
    // Pass the rider EXPLICITLY. setOpacity(0) leaves group.visible false, and
    // enter() builds the field before the fade has started — so an implicit
    // visibility-based pickup would leave the single biggest blocker on the
    // bike out of the flow until the next kit or yaw change. buildFlowField
    // counts an explicitly-passed rider regardless of visibility, for this.
    flow = buildFlowField(bike, bags, { yawDeg, rider: rider.group });
    smoke.rebuild(flow);
  }

  /**
   * remeasure() is async and nothing awaits it, so a throw inside the engine
   * would otherwise surface only as an unhandled rejection — invisible in the
   * UI while the readout silently kept showing stale numbers. Fail loudly.
   */
  function measureNow() {
    remeasure().catch((e) => console.error('[aero] measurement failed', e));
  }

  /** Kit changed while the tunnel is open: re-measure and re-route the air. */
  function onKitChange() {
    if (!open) return;
    rebuildFlow();
    measureNow();
    app.focus?.refresh();
  }

  // Panel mounting is tracked here rather than gated on tunnel.active, because
  // `active` stays true for the whole exit crossfade — correct for the tunnel,
  // but as a guard it made the mode un-re-enterable until the fade finished.
  // tunnel.enter()/exit() already handle being called mid-transition.
  let open = false;

  function onKey(e) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    exit();
  }

  function enter() {
    if (open) return;
    open = true;
    document.getElementById('ui-root').append(panel.el);
    tunnel.enter();
    rebuildFlow();
    measureNow();
    document.addEventListener('keydown', onKey, true);
    onToggle?.(true);
  }

  function exit() {
    if (!open) return;
    open = false;
    tunnel.exit();
    panel.el.remove();
    document.removeEventListener('keydown', onKey, true);
    onToggle?.(false);
  }

  return {
    enter,
    exit,
    toggle() { open ? exit() : enter(); },
    onKitChange,
    tick(dt) { tunnel.tick(dt); },
    get active() { return tunnel.active; },
    /** Panel → scene highlight mirroring, matching focus.js's two-way binding. */
    setHighlight(key) { panel.setHighlight(key); },
    /**
     * The current numbers, as data rather than as a rendered panel.
     *
     * tools/measure-loadouts.mjs reads this to bake the eight curated rigs'
     * aero cost into data/loadouts.json, so the Loadouts screen can print
     * watts without every visitor paying for a GPU measurement pass. Returns
     * null until the first measurement has landed.
     */
    readout() {
      if (!result) return null;
      const c = compare(baselineCda, result.cdaHeadOn, ride);
      const g = grade(c.addedW, { speedKph: ride.speedKph });
      return {
        cda: result.cdaHeadOn,
        cdaWeighted: result.cdaWeighted,
        baselineCda,
        speedKph: ride.speedKph,
        totalW: power({ cda: result.cdaHeadOn, ...ride }).totalW,
        addedW: c.addedW,
        grade: `${g.letter} · ${g.name}`,
      };
    },
    dispose() {
      exit();
      panel.dispose();
      smoke.dispose();
      rider.dispose();
      meter.dispose();
    },
  };
}
