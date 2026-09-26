/**
 * Bottom-sheet heights for the phone: peek, half, full.
 *
 * One behaviour for every sheet, so the rig panel and a bag's sheet move the
 * same way: drag the header (or the handle) and it follows your finger, let
 * go and it settles on the nearest height, or the next one in the direction
 * you flicked. Tapping the handle steps up (peek > half > full > half).
 *
 * Only transforms change while a finger is down. The one layout change, the
 * body's bottom padding that keeps content scrollable above a sticky footer,
 * happens once when the sheet settles.
 *
 *   attachDetents(sheet, { grip, heights, initial, onChange }) -> api
 *     sheet    the fixed, full-height element (bottom: 0)
 *     grip     the element a drag starts from (the header)
 *     heights  () => ({ peek, half, full }) visible heights in px
 */
export function attachDetents(sheet, { grip, heights, initial = 'half', onChange } = {}) {
  let name = initial;
  let hide = 0;          // px pushed below the viewport
  let drag = null;
  let enabled = true;

  const H = () => heights();
  const full = () => H().full;
  const hideFor = (n) => Math.max(0, full() - H()[n]);

  function set(px, { animate = true } = {}) {
    hide = Math.max(0, Math.min(full() - 40, px));
    sheet.style.transition = animate ? '' : 'none';
    sheet.style.setProperty('--hide', `${hide}px`);
    sheet.style.setProperty('--sheet-full', `${full()}px`);
  }

  function snap(next, { animate = true, silent = false } = {}) {
    name = next;
    set(hideFor(next), { animate });
    sheet.dataset.detent = next;
    // settle-time layout: content can scroll to just above the footer
    sheet.style.setProperty('--hide-settled', `${hideFor(next)}px`);
    if (!silent) onChange?.(next);
  }

  function onDown(e) {
    if (!enabled || e.button > 0) return;
    if (e.target.closest('button:not(.sheet-grip), a, input, select, textarea, [role=button]:not(.sheet-grip)')) return;
    drag = { y: e.clientY, start: hide, t: performance.now(), v: 0, lastY: e.clientY, moved: 0, id: e.pointerId };
    grip.setPointerCapture?.(e.pointerId);
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.abs(dy));
    const now = performance.now();
    drag.v = (e.clientY - drag.lastY) / Math.max(1, now - drag.t);
    drag.lastY = e.clientY;
    drag.t = now;
    if (drag.moved > 6) set(drag.start + dy, { animate: false });
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.moved <= 6) return;   // a tap: the handle's click handles it
    const order = ['peek', 'half', 'full'];
    // flick: move one step in the direction of travel
    if (Math.abs(d.v) > 0.5) {
      const i = order.indexOf(name);
      const j = d.v > 0 ? Math.max(0, i - 1) : Math.min(2, i + 1);
      snap(order[j]);
      return;
    }
    let best = name, bd = Infinity;
    for (const n of order) {
      const dd = Math.abs(hideFor(n) - hide);
      if (dd < bd) { bd = dd; best = n; }
    }
    snap(best);
  }
  grip.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  return {
    snap,
    step() { snap(name === 'peek' ? 'half' : name === 'half' ? 'full' : 'half'); },
    get name() { return name; },
    /** Visible top of the sheet once settled, in px from the top of the viewport. */
    top() { return window.innerHeight - H()[name]; },
    enable(on) { enabled = !!on; },
    refresh() { snap(name, { animate: false, silent: true }); },
    dispose() {
      grip.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    },
  };
}
