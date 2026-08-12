/**
 * The sheet shell — DESIGN-SYSTEM.md §6.2, step 2 of §12.
 *
 * ONE surface concept for the whole app, at three widths: `detail` (the
 * product sheet, §6.2), `catalog` (§6.3) and the collapsed `rail` the rig panel
 * becomes while either is open. Steps 3-5 of §12 build against `openSheet()`,
 * so this file defines a contract three other things depend on — change its
 * shape deliberately, not casually.
 *
 * WHAT THIS REPLACES, and why it matters more than it looks: today every
 * secondary surface in the app is a centred `.picker` behind a full-screen
 * `.picker-veil` — `rgba(5,7,10,.58)` plus a blur over the 3D scene. §1.4 and
 * §10.5 both single that out as the biggest contradiction in the product. The
 * entire product IS the 3D scene; a configurator that dims the model in order
 * to show you a picture of the model has inverted itself. There is no veil
 * here and there must never be one.
 *
 * The four things §12 step 2 requires to happen ON THE SAME TICK, because §5
 * says panel and camera move on one curve so they read as one gesture:
 *   1. the sheet slides in from the right edge it belongs to
 *   2. the rig panel collapses to a 56px rail
 *   3. the dock repositions to the new free-area centre
 *   4. the camera reframes (§6.7, reframe.js)
 *
 * CONTRACT
 *   openSheet({ kind, title, render, onClose }) -> handle
 *     kind    'detail' | 'catalog'
 *     title   accessible name; the visible header is the caller's business
 *     render  (body, handle) => void — fills the scrollable body element
 *     onClose optional, called after the sheet has finished leaving
 *   handle  { el, body, close(), setTitle(s), kind }
 *
 * Only ONE sheet is open at a time (§1.4). Opening a second replaces the
 * first's contents in place rather than stacking — stacked surfaces over a 3D
 * scene are how you end up back at a modal.
 */

import { initReframe } from './reframe.js';

const KIND_WIDTH = { detail: 'var(--sheet-detail-w)', catalog: 'var(--sheet-catalog-w)' };

const el = (tag, cls) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
};

/** A scrim well child, per §3.3. Every E2/E3 surface gets one. */
function scrimWell(node, free = false) {
  const w = el('div', free ? 'scrim-well free' : 'scrim-well');
  node.prepend(w);
  return w;
}

export function initSheets(app, { root, applyBase } = {}) {
  const host = root || document.getElementById('ui-root');
  if (!host) return null;

  const reframe = initReframe(app, { applyBase });
  app.reframe = reframe;

  // ---- the one shell -------------------------------------------------------
  const sheet = el('aside', 'sheet e3');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'false');   // it is NOT modal: the scene stays live
  sheet.hidden = true;
  // No in-parent scrim well here: `backdrop-filter` on .sheet creates a
  // stacking context, so a z-index:-1 child would tint the glass instead of
  // darkening the scene behind it. surfaces.js puts the well in a layer
  // BEHIND the chrome, which is the only placement the blur can sample.

  const head = el('header', 'sheet-head');
  /*
   * A way back up.
   *
   * The flow is mount -> catalogue -> bag, and every step's header offered
   * only a close button: from "Handlebar roll" there was no route back to
   * "Choose a mount" except closing the whole thing and starting again. The
   * chevron appears only when the caller passes `onBack`, so a sheet with no
   * parent still shows exactly what it showed before.
   */
  const backBtn = el('button', 'sheet-back');
  backBtn.type = 'button';
  backBtn.hidden = true;
  backBtn.innerHTML =
    '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">'
    + '<path d="M12.5 4L7 10l5.5 6" fill="none" stroke="currentColor" stroke-width="1.6" '
    + 'stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const titleEl = el('h2', 'sheet-title t-title2');
  const closeBtn = el('button', 'sheet-close');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close');
  // §7: no emoji, no text glyphs. One inline SVG, 20x20, 1.5px stroke.
  // Labelled, like the menu's. Three surfaces offered three grammars for the
  // same act — a labelled control in the menu, a bare glyph in the sheets, a
  // glyph AND a full-width button in the wind tunnel.
  closeBtn.innerHTML =
    '<span>Close</span>' +
    '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">' +
    '<path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round"/></svg>';
  head.append(backBtn, titleEl, closeBtn);

  const body = el('div', 'sheet-body');
  sheet.append(head, body);
  host.append(sheet);

  let active = null;
  let lastFocus = null;

  const setSheetWidthVar = (kind) => {
    document.documentElement.style.setProperty(
      '--sheet-w', kind ? KIND_WIDTH[kind] || KIND_WIDTH.detail : '0px');
  };

  function onKey(e) {
    if (e.key === 'Escape' && active) { e.stopPropagation(); close(); }
  }

  function open({ kind = 'detail', title = '', render, onClose, onBack = null } = {}) {
    const first = !active;
    if (first) lastFocus = document.activeElement;

    active = { kind, onClose };
    sheet.dataset.kind = kind;
    sheet.hidden = false;
    titleEl.textContent = title;
    sheet.setAttribute('aria-label', title || 'Details');
    backBtn.hidden = !onBack;
    backBtn.onclick = onBack || null;
    backBtn.setAttribute('aria-label', 'Back');
    body.scrollTop = 0;
    body.replaceChildren();

    // Width first, then the class that animates: the custom property has to be
    // in place before the transition starts or the first frame lands at 0.
    setSheetWidthVar(kind);
    host.classList.add('sheet-open');
    host.dataset.sheet = kind;

    // Force a style flush so `open` transitions from the off-screen state
    // rather than being coalesced into the same frame as `hidden = false`.
    void sheet.offsetWidth;
    sheet.classList.add('open');

    render?.(body, handleFor());

    // Same tick as the width change — §5. The rail collapse and the dock move
    // are pure CSS off `.sheet-open`, so they are already on this tick too.
    reframe?.update({ opening: true });
    app.scrim?.invalidate();
    // The wells have to track three rects through a 320ms transition, and
    // ResizeObserver does not fire per frame during one.
    app.surfaces?.followFor(420);

    document.addEventListener('keydown', onKey, true);
    // Do not steal focus from the 3D scene on open; §9.2 wants focus to land
    // on the sheet only when it was a keyboard action that opened it.
    if (lastFocus && lastFocus !== document.body) closeBtn.focus({ preventScroll: true });
    return handleFor();
  }

  function close() {
    if (!active) return;
    const { onClose } = active;
    active = null;
    document.removeEventListener('keydown', onKey, true);

    sheet.classList.remove('open');
    host.classList.remove('sheet-open');
    delete host.dataset.sheet;
    setSheetWidthVar(null);
    reframe?.release();
    app.scrim?.invalidate();
    app.surfaces?.followFor(420);

    const done = () => {
      if (active) return;              // reopened mid-exit: leave it alone
      sheet.hidden = true;
      body.replaceChildren();
      onClose?.();
    };
    // The rig panel is mid-collapse when release() measures it, so the first
    // reading is of a 56px rail that is on its way back to 320 and the camera
    // settles a third of the way home. Re-measure once the width transition
    // has actually finished. Found by the smoke test: the offset came to rest
    // at -55 where the geometry called for -184.
    const d = getComputedStyle(document.documentElement)
      .getPropertyValue('--d-sheet-out').trim();
    const ms = d.endsWith('ms') ? parseFloat(d) : 240;
    const settle = () => { if (!active) reframe?.update({ opening: false }); app.surfaces?.sync(); };
    const panel = document.querySelector('.panel');
    if (panel) {
      panel.addEventListener('transitionend', function onEnd(e) {
        if (e.propertyName !== 'width') return;
        panel.removeEventListener('transitionend', onEnd);
        settle();
      });
    }
    setTimeout(settle, ms + 120);  // belt and braces: transitionend can be skipped
    if (ms > 0) setTimeout(done, ms); else done();

    if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }

  function handleFor() {
    return {
      el: sheet,
      body,
      kind: active?.kind || null,
      close,
      setTitle(s) { titleEl.textContent = s; sheet.setAttribute('aria-label', s); },
    };
  }

  closeBtn.onclick = close;

  const api = {
    openSheet: open,
    closeSheet: close,
    get isOpen() { return !!active; },
    get kind() { return active?.kind || null; },
    /** Steps 3-5 call this when the viewport changed under an open sheet. */
    resync() { if (active) reframe?.update({ opening: false }); else reframe?.reassert(); },
    reframe,
    dispose() {
      document.removeEventListener('keydown', onKey, true);
      reframe?.dispose();
      sheet.remove();
    },
  };
  return api;
}

export { scrimWell };
