/**
 * The watts chip's number: what the bags cost in the wind, measured.
 *
 * The wind tunnel was an unlabelled icon in the header, so almost nobody
 * found the one number this app can give that no shop can. The chip on the
 * rig shows it ("+28 W at 28 km/h") and opens the tunnel.
 *
 * The number comes from the tunnel's own meter (src/aero/measure.js), run
 * quietly in the background a moment after the bags change: one yaw per
 * frame, so it never stalls a frame. Once the tunnel has been opened its own
 * readout is used instead, so the chip and the tunnel never disagree.
 */
import { compare, fairingCredit, RIDE_DEFAULTS } from '../aero/model.js';

export function initWatts(app, { onChange } = {}) {
  let meter = null;
  let value = null;       // { addedW, speedKph }
  let seq = 0;
  let timer = null;
  let pending = false;

  async function measure() {
    const my = ++seq;
    pending = true;
    try {
      if (!Object.keys(app.bags.equipped).length) { value = null; return; }
      // the tunnel has its own, fuller measurement: use it when it exists
      const tunnel = app.aero?.readout?.();
      if (tunnel && app.aero?.freshFor?.(app.bags)) {
        value = { addedW: tunnel.addedW, speedKph: tunnel.speedKph };
        return;
      }
      if (!meter) {
        const { createAeroMeter } = await import('../aero/measure.js');
        meter = createAeroMeter({ renderer: app.renderer, bike: app.bike, bags: app.bags });
      }
      const res = await meter.measureAsync({ yaws: [0, 5, 10, 15, 20], resolution: 512 });
      if (my !== seq) return;
      const bike = res.parts?.find((p) => p.key === 'bike');
      const credit = bike ? fairingCredit(Object.keys(app.bags.equipped), bike.cda) : 0;
      const c = compare(res.cdaBaseline, res.cdaHeadOn + (credit || 0), RIDE_DEFAULTS);
      value = { addedW: c.addedW, speedKph: RIDE_DEFAULTS.speedKph };
    } catch (e) {
      console.warn('[watts] measurement failed', e);
      value = null;
    } finally {
      if (my === seq) { pending = false; onChange?.(value); }
    }
  }

  function schedule(ms = 900) {
    clearTimeout(timer);
    pending = true;
    timer = setTimeout(() => {
      // wait for an idle moment: the first paint and any camera glide matter more
      const go = () => measure();
      if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 1500 }); else go();
    }, ms);
  }

  app.bags.onChange(() => { value = null; onChange?.(value); schedule(); });
  return {
    get value() { return value; },
    get pending() { return pending; },
    schedule,
    /** The bike was replaced (a frame size change): the meter holds the old one. */
    reset() { meter?.dispose?.(); meter = null; schedule(); },
  };
}
