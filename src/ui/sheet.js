/**
 * The sheet shell: the one surface every secondary view opens in.
 *
 * Desktop: it takes the rig panel's column (wider for the catalogue) and the
 * panel steps aside; closing it brings the panel back. Phone: it is the
 * bottom sheet, with three heights and ONE close control. There is no second
 * "minimise" chevron any more: dragging the sheet down to its peek is how you
 * look at the bike, and Close is how you leave.
 *
 * Never a modal, never a veil: the scene stays live behind it and the camera
 * reframes into the space it leaves (src/ui/framing.js).
 *
 * CONTRACT
 *   openSheet({ kind, title, render, onClose, onBack, detent }) -> handle
 *     kind    'detail' | 'catalog'   (desktop width)
 *     render  (body, handle) => void fills the scrolling body
 *     detent  phone height to open at: 'peek' | 'half' | 'full' (default half,
 *             catalogues full)
 *   handle  { el, body, close(), setTitle(s), setFoot(node|null), detent(name) }
 *
 * One sheet at a time: opening another replaces the contents in place.
 * A `.sheet-foot` (or legacy `.bs-foot`) rendered into the body is lifted
 * into the footer slot, outside the scroll, so it can never cover content.
 */
import { icon } from './v2/icons.js';
import { attachDetents } from './detents.js';
import { device } from '../mobile.js';

const WIDTH = { detail: 'var(--sheet-detail-w)', catalog: 'var(--sheet-catalog-w)' };

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** Phone heights, shared by the panel and the sheet. */
export function phoneHeights(sheetEl, { peekMin = 132 } = {}) {
  return () => {
    const vh = window.innerHeight;
    const top = document.querySelector('.topbar')?.getBoundingClientRect().height || 56;
    const head = sheetEl.querySelector('.sheet-top')?.offsetHeight || 72;
    const peekExtra = sheetEl.querySelector('.peek-extra')?.offsetHeight || 0;
    const foot = sheetEl.querySelector('.sheet-foot')?.offsetHeight || 0;
    const full = Math.round(vh - top - 4);
    const peek = Math.min(full, Math.max(peekMin, head + peekExtra + foot + 4));
    const half = Math.max(peek + 60, Math.round(vh * 0.5));
    return { peek, half: Math.min(half, full), full };
  };
}

export const isPhone = () => device.phone;

export function initSheets(app, { root } = {}) {
  const host = root || document.getElementById('ui-root');
  if (!host) return null;

  const sheet = el('aside', 'sheet glass-3');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'false');     // the scene stays live
  sheet.hidden = true;
  const inner = el('div', 'sheet-inner');
  const grip = el('div', 'sheet-grip');
  grip.setAttribute('aria-hidden', 'true');
  const head = el('header', 'sheet-head');
  const backBtn = el('button', 'sheet-back');
  backBtn.type = 'button';
  backBtn.hidden = true;
  backBtn.setAttribute('aria-label', 'Back');
  backBtn.title = 'Back';
  backBtn.append(icon('left', { size: 22 }));
  const titleEl = el('h2', 'sheet-title');
  titleEl.id = 'sheet-title';
  sheet.setAttribute('aria-labelledby', 'sheet-title');
  const closeBtn = el('button', 'sheet-close');
  closeBtn.type = 'button';
  const closeLabel = el('span', null, 'Close');
  closeBtn.append(closeLabel, icon('close', { size: 16 }));
  head.append(backBtn, titleEl, closeBtn);
  const body = el('div', 'sheet-body');
  const foot = el('div', 'sheet-foot');
  const top = el('div', 'sheet-top');
  top.append(grip, head);
  inner.append(top, body, foot);
  sheet.append(inner);
  host.append(sheet);

  // tap the handle or the header's empty space to step the height
  const detents = attachDetents(sheet, {
    grip: top,
    heights: phoneHeights(sheet),
    initial: 'half',
    onChange: () => { app.framing?.update(); app.surfaces?.followFor(420); },
  });
  grip.onclick = () => { if (isPhone()) detents.step(); };
  head.addEventListener('click', (e) => { if (isPhone() && (e.target === head || e.target === titleEl)) detents.step(); });

  let active = null;
  let lastFocus = null;

  // lift a rendered footer into the slot
  const liftFoot = () => {
    const f = body.querySelector('.sheet-foot-src, .bs-foot');
    if (!f) return;
    foot.replaceChildren(...f.childNodes);
    f.remove();
    if (isPhone()) detents.refresh();
  };
  const mo = new MutationObserver(() => liftFoot());
  mo.observe(body, { childList: true, subtree: true });

  function onKey(e) {
    if (e.key === 'Escape' && active && !e.defaultPrevented) {
      if (document.querySelector('.cat-pop, .tb-menu')) return;
      e.stopPropagation();
      close();
    }
  }

  function open({ kind = 'detail', title = '', render, onClose, onBack = null, detent } = {}) {
    const first = !active;
    if (first) lastFocus = document.activeElement;
    const prevClose = active?.onClose;
    active = { kind, onClose };
    if (!first && prevClose) try { prevClose({ replaced: true }); } catch { /* */ }
    sheet.dataset.kind = kind;
    sheet.hidden = false;
    titleEl.textContent = title;
    closeLabel.textContent = 'Close';
    backBtn.hidden = !onBack;
    backBtn.onclick = onBack || null;
    body.scrollTop = 0;
    body.replaceChildren();
    foot.replaceChildren();
    document.documentElement.style.setProperty('--sheet-w', WIDTH[kind] || WIDTH.detail);
    host.classList.add('sheet-open');
    host.dataset.sheet = kind;
    void sheet.offsetWidth;
    sheet.classList.add('open');
    render?.(body, handle());
    liftFoot();
    if (isPhone()) detents.snap(detent || (kind === 'catalog' ? 'full' : 'half'), { silent: true });
    app.framing?.update();
    app.surfaces?.followFor(420);
    document.addEventListener('keydown', onKey, true);
    if (lastFocus && lastFocus !== document.body && first) closeBtn.focus({ preventScroll: true });
    return handle();
  }

  function close() {
    if (!active) return;
    const { onClose } = active;
    active = null;
    document.removeEventListener('keydown', onKey, true);
    sheet.classList.remove('open');
    host.classList.remove('sheet-open');
    delete host.dataset.sheet;
    document.documentElement.style.setProperty('--sheet-w', '0px');
    app.framing?.update();
    app.surfaces?.followFor(420);
    const ms = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--d-sheet-out')) || 0;
    const done = () => {
      if (active) return;
      sheet.hidden = true;
      body.replaceChildren();
      foot.replaceChildren();
      onClose?.({});
    };
    if (ms > 0) setTimeout(done, ms); else done();
    if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }

  function handle() {
    return {
      el: sheet,
      body,
      foot,
      kind: active?.kind || null,
      close,
      setTitle(s) { titleEl.textContent = s; },
      /** "Done" when closing finishes a task (adding bags), "Close" otherwise. */
      setCloseLabel(s) { closeLabel.textContent = s || 'Close'; },
      setFoot(node) { foot.replaceChildren(...(node ? [node] : [])); if (isPhone()) detents.refresh(); },
      detent(n) { if (isPhone()) detents.snap(n); },
    };
  }
  closeBtn.onclick = close;

  // phone: the framer needs the settled top of the sheet
  app.framing?.addChrome(() => {
    if (!active) return null;
    if (isPhone()) return { bottom: detents.top() };
    if (device.desktop || window.innerWidth > 560) {
      // layout box, not the animated one: mid-slide the rect is 16px short
      return { left: sheet.offsetLeft + sheet.offsetWidth };
    }
    return null;
  });

  window.addEventListener('resize', () => { if (active && isPhone()) detents.refresh(); });

  return {
    openSheet: open,
    closeSheet: close,
    get isOpen() { return !!active; },
    get kind() { return active?.kind || null; },
    get detent() { return detents.name; },
    detentTop: () => (active && isPhone() ? detents.top() : null),
    snap: (n) => detents.snap(n),
    // compatibility: the old shell had a separate minimise; dragging to peek is it now
    setMinimized(on) { if (active && isPhone()) detents.snap(on ? 'peek' : 'half'); },
    resync() { app.framing?.update({ instant: true }); },
    dispose() { mo.disconnect(); detents.dispose(); sheet.remove(); },
  };
}
