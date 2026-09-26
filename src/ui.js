/**
 * The builder: the shell around the bike, and the flows that run through it.
 *
 * What is on screen, and who owns it:
 *   top bar      the wordmark (home), the account, and More (view, bike,
 *                units, wind tunnel), every item labelled.   here
 *   rig panel    the bike's bags, what is in them, the numbers.  ui/rigpanel.js
 *   the sheet    one surface for everything else.              ui/sheet.js
 *   mount rings  where a bag can go, on the bike itself.       ui/mounts.js
 *   the camera   keeps the bike in the space the chrome leaves. ui/framing.js
 *
 * The flows that cross them live here: adding a bag (ring, catalogue, next
 * ring), saving, sharing, leaving for the start screen.
 */
import { SLOTS, productSlotFor } from './bags.js';
import { initAccount } from './ui/account.js';
import { applyRig, captureRig, rigURL, rigURLWithPack } from './rig.js';
import { productsForSlot } from './catalog.js';
import { PAINTS, FRAME_SIZES } from './bike.js';
import { judgeFit, willFit } from './bags/fit.js';
import { litersOf, modelTitle } from './ui/product.js';
import { initBagSheet } from './ui/bagsheet.js';
import { initMenu } from './ui/v2/menu.js';
import { icon } from './ui/v2/icons.js';
import { initCatalogue } from './ui/catalogue.js';
import { randomRigName } from './ui/v2/rignames.js';
import { PAINT_LABEL, BIDONS } from './ui/v2/setup.js';
import { paintFace } from './ui/face.js';
import { initPackUI } from './pack/ui/index.js';
import { initRigPanel } from './ui/rigpanel.js';
import { initMounts, PLACES, BUILD_ORDER, placeOf } from './ui/mounts.js';
import { initWatts } from './ui/watts.js';
import { bagImg } from './ui/bagthumbs.js';
import { device } from './mobile.js';
import { fmtWeight } from './pack/units.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const button = (cls, text, onClick, label) => {
  const b = el('button', cls, text);
  b.type = 'button';
  if (onClick) b.onclick = onClick;
  if (label) b.setAttribute('aria-label', label);
  return b;
};

export function initUI(app) {
  const root = document.getElementById('ui-root');
  root.innerHTML = '';

  // ---- the toast: one line, one action ------------------------------------------------
  let toastTimer = null;
  const toastEl = el('div', 'toast');
  toastEl.setAttribute('role', 'status');
  toastEl.hidden = true;
  function notify(text, undo, action) {
    clearTimeout(toastTimer);
    toastEl.replaceChildren(el('span', 'toast-txt', text));
    const act = undo ? { label: 'Undo', run: undo } : action;
    if (act) {
      const b = button('toast-act', act.label, () => { hideToast(); act.run(); });
      toastEl.append(b);
    }
    // on a phone the toast sits above whichever sheet is showing
    const sheetTop = device.phone ? (document.querySelector('.sheet.open') ? app.sheets?.detentTop?.() : panel.detentTop?.()) : null;
    toastEl.classList.toggle('lifted', !!sheetTop);
    if (sheetTop) toastEl.style.setProperty('--toast-lift', `${innerHeight - sheetTop}px`);
    toastEl.hidden = false;
    void toastEl.offsetWidth;
    toastEl.classList.add('on');
    toastTimer = setTimeout(hideToast, 6000);
  }
  function hideToast() {
    clearTimeout(toastTimer);
    toastEl.classList.remove('on');
    setTimeout(() => { if (!toastEl.classList.contains('on')) toastEl.hidden = true; }, 220);
  }
  app.toast = notify;

  const account = initAccount(app, { auth: app.auth, store: app.rigs, host: root, onChange: () => sync() });
  app.account = account;
  app.openRigs = (m) => (m === 'list' ? app.menu?.open('rigs') : account.open('signin'));
  app.__rigURL = () => rigURL(app);
  app.__rigURLWithPack = () => rigURLWithPack(app);

  // ---- top bar ------------------------------------------------------------------------------
  const topbar = el('header', 'topbar');
  const mark = button('wordmark', null, () => leaveHome(), 'Packrig, back to the start');
  mark.append(icon('gust', { size: 20, stroke: 2 }), el('span', null, 'PACKRIG'));
  mark.title = 'Back to the start';
  const right = el('div', 'tb-right');
  const acctBtn = button('tb-btn tb-acct', null, () => account.open());
  const acctFace = el('span', 'tb-face');
  const acctLabel = el('span', 'tb-label', 'Log in');
  acctBtn.append(acctFace, acctLabel);
  const moreBtn = button('tb-btn tb-more', null, () => toggleMore());
  moreBtn.append(icon('more', { size: 20 }), el('span', 'tb-label', 'More'));
  moreBtn.setAttribute('aria-haspopup', 'menu');
  moreBtn.setAttribute('aria-expanded', 'false');
  right.append(acctBtn, moreBtn);
  topbar.append(mark, right);

  function paintAccount() {
    const on = !!app.auth?.signedIn;
    acctLabel.textContent = on ? (app.auth.name || app.auth.email || 'Account') : 'Log in';
    acctBtn.title = on ? 'Your account' : 'Log in so your rigs follow you between devices';
    acctBtn.setAttribute('aria-label', on ? `Account: ${acctLabel.textContent}` : 'Log in');
    paintFace(acctFace, app.auth);
  }
  paintAccount();
  app.auth?.onChange?.(() => { paintAccount(); sync(); });

  // ---- More: labelled, never mystery icons ----------------------------------------------------
  const homeView = { pos: app.camera.position.clone(), target: app.controls.target.clone() };
  let menuEl = null;
  function closeMore() {
    if (!menuEl) return;
    menuEl.remove();
    menuEl = null;
    moreBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', awayMore, true);
    document.removeEventListener('keydown', keyMore, true);
  }
  const awayMore = (e) => { if (menuEl && !menuEl.contains(e.target) && !moreBtn.contains(e.target)) closeMore(); };
  const keyMore = (e) => {
    if (!menuEl) return;
    const items = [...menuEl.querySelectorAll('.mi')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMore(); moreBtn.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
  };
  function menuItem(ic, label, run, value) {
    const b = button('mi', null, () => { closeMore(); run(); });
    b.setAttribute('role', 'menuitem');
    b.append(icon(ic, { size: 18 }), el('span', 'mi-k', label));
    if (value) b.append(el('span', 'mi-v', value));
    return b;
  }
  function toggleMore() {
    if (menuEl) { closeMore(); return; }
    menuEl = el('div', 'tb-menu pop');
    menuEl.setAttribute('role', 'menu');
    menuEl.setAttribute('aria-label', 'More');
    const bags = Object.keys(app.bags.equipped).length;
    menuEl.append(
      menuItem('reframe', 'Frame the bike', () => resetView()),
      menuItem('orbit', app.controls.autoRotate ? 'Stop turning' : 'Turn the bike', () => { app.controls.autoRotate = !app.controls.autoRotate; }),
      el('hr'),
      menuItem('bike', 'Bike: size and colours', () => openBikeSheet(), `${FRAME_SIZES[app.bike?.size]?.label || ''}`),
      menuItem('wind', 'Wind tunnel', () => app.openWindTunnel?.()),
    );
    if (bags) menuEl.append(menuItem('share', 'Share this rig', () => openShare()));
    const unitRow = el('div', 'mi mi-units');
    unitRow.setAttribute('role', 'group');
    unitRow.append(icon('scale', { size: 18 }), el('span', 'mi-k', 'Units'));
    const seg = el('div', 'seg');
    for (const [k, l] of [['metric', 'kg'], ['imperial', 'lb']]) {
      const b = button(app.pack?.lib?.unit === k ? 'on' : '', l, () => { app.pack?.setUnit(k); closeMore(); }, k === 'metric' ? 'Kilograms' : 'Pounds');
      b.setAttribute('aria-pressed', String(app.pack?.lib?.unit === k));
      seg.append(b);
    }
    unitRow.append(seg);
    menuEl.append(el('hr'), unitRow);
    if (bags) menuEl.append(el('hr'), menuItem('trash', 'Clear the bike', () => clearBike()));
    root.append(menuEl);
    moreBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', awayMore, true);
    document.addEventListener('keydown', keyMore, true);
    menuEl.querySelector('.mi')?.focus({ preventScroll: true });
  }
  function resetView() {
    app.camera.position.copy(homeView.pos);
    app.controls.target.copy(homeView.target);
    app.controls.update();
    app.focus?.clearFocus?.();
    app.framing?.frameBike({ reset: true });
  }
  function clearBike() {
    const before = (() => { try { return captureRig(app, { name: '' }); } catch { return null; } })();
    const n = Object.keys(app.bags.equipped).length;
    app.clearAll();
    if (before && n) notify(`Cleared ${n} bag${n === 1 ? '' : 's'}`, () => { applyRig(app, before); sync(); });
  }

  // ---- saving -------------------------------------------------------------------------------------
  // Saves live on an account (the owner's call, rigstore.js). Signed out the
  // button still reads Save; pressing it asks for an account, says why, and
  // saves the moment you are in. Everything else works signed out.
  let current = { id: null, name: randomRigName(), local: true };
  let savedSnapshot = null;
  const snapshot = () => { try { return JSON.stringify(captureRig(app, { name: '' })); } catch { return null; } };
  function saveState() {
    const bags = Object.keys(app.bags?.equipped || {}).length;
    if (!bags) return { show: false };
    const dirty = !savedSnapshot || savedSnapshot !== snapshot();
    if (!dirty) return { show: true, done: true, label: 'Saved', title: 'Saved to your account' };
    return {
      show: true,
      label: current.id ? 'Save changes' : 'Save',
      title: app.auth?.signedIn ? 'Save to your account' : 'Save to an account, so it follows you between devices',
    };
  }
  function saveCurrent() {
    const write = current.id
      ? app.rigs?.update(current.id, { name: current.name })
      : app.rigs?.save(current.name || randomRigName());
    return Promise.resolve(write).then((row) => {
      savedSnapshot = snapshot();
      current = { id: row?.id ?? current.id, name: row?.name || current.name, local: !!row?.local };
      paintHead();
      return row;
    });
  }
  const PENDING_SAVE = 'packrig.pendingSave';
  const stashPendingSave = (after = 'stay') => {
    try { sessionStorage.setItem(PENDING_SAVE, JSON.stringify({ name: current.name, after, rig: captureRig(app, { name: current.name }) })); } catch { /* private mode */ }
  };
  const clearPendingSave = () => { try { sessionStorage.removeItem(PENDING_SAVE); } catch { /* */ } };
  const consumePendingSave = () => {
    if (!app.auth?.signedIn) { clearPendingSave(); return Promise.resolve(); }
    let raw = null;
    try { raw = sessionStorage.getItem(PENDING_SAVE); } catch { /* */ }
    if (!raw) return Promise.resolve();
    clearPendingSave();
    let pending;
    try { pending = JSON.parse(raw); } catch { return Promise.resolve(); }
    if (!pending?.rig) return Promise.resolve();
    return Promise.resolve(app.rigs?.saveRig(pending.name || randomRigName(), pending.rig))
      .then((row) => notify(`Saved “${row?.name || pending.name}”. It’s in My rigs.`))
      .catch((e) => notify(e?.message || 'That rig could not be saved. Try again in a moment.'));
  };
  const requireAccount = (reason) => {
    if (app.auth?.signedIn) return Promise.resolve(true);
    if (!app.auth?.enabled) {
      notify('Saving needs an account, and accounts are not available right now. Your rig is still here, and Share keeps a link to it.');
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      account.open('signup', { reason: reason || 'Saving keeps this rig on your account, so it follows you between devices.', onReady: () => resolve(true), onCancel: () => resolve(false) });
    });
  };
  if (app.auth?.enabled) Promise.resolve(app.auth.hydrate?.()).then(() => consumePendingSave());
  function save() {
    const s = saveState();
    if (s.done) return;
    stashPendingSave('stay');
    requireAccount()
      .then((ok) => { if (!ok) { clearPendingSave(); return null; } return saveCurrent(); })
      .then((row) => { if (!row) return; clearPendingSave(); notify(`Saved “${current.name}”`); })
      .catch((e) => notify(e?.message || 'That rig could not be saved. Try again in a moment.'));
  }

  // ---- the rig panel ----------------------------------------------------------------------------------
  let panel = null;
  const packUI = initPackUI(app, {
    notify: (...a) => notify(...a),
    selectBag: (slot) => openBag(slot),
  });
  app.packUI = packUI;

  const watts = initWatts(app, { onChange: () => panel?.updateWatts() });
  app.watts = watts;

  panel = initRigPanel(app, {
    save,
    saveState,
    rename: (name) => {
      current = { ...current, name };
      if (current.id) app.rigs?.rename?.(current.id, name).catch(() => {});
      paintHead();
    },
    openShare: () => openShare(),
    openTunnel: () => app.openWindTunnel?.(),
    watts: () => watts.value,
    openBag: (slot) => openBag(slot),
    addBag: () => startAdding(),
    openMountList: () => openMountList(),
    openGallery: () => app.menu?.open('loadouts'),
    openCatalogue: (slot) => openCatalogue(slot),
    removeUnfit: (slot) => {
      const rec = app.bags.unfitted[slot];
      app.bags.remove(slot);
      sync();
      if (rec) notify(`Removed ${modelTitle(rec.product, rec.brand)}`, () => { app.bags.equip(slot, rec.brand, rec.product, rec.colorwayIndex || 0); sync(); });
    },
    openItem: (uid) => packUI.openItem(uid),
    openLocker: (o) => packUI.openLocker(o),
    openTrips: () => packUI.openTrips(),
    openImport: () => packUI.openImport(),
    quickHas: (q) => packUI.quickHas(q),
    quickToggle: (q) => packUI.quickToggle(q),
    packHome: (uids) => packUI.packUids(uids),
    fitMissing: (slots) => fitMissing(slots),
    copyView: () => packUI.copyView(),
    drag: packUI.drag,
  });
  app.rigPanel = panel;
  panel.name = current.name;
  function paintHead() { panel.name = current.name; panel.paintHead(saveState()); }

  root.append(panel.el, topbar, toastEl);

  // ---- the one sheet: bag, catalogue, lists ------------------------------------------------------------
  const bagSheet = initBagSheet(app, {
    openCatalogue: (slot) => openCatalogue(slot, { replacing: true }),
    sync: () => sync(),
    notify,
    insideFor: (slot) => packUI.insideFor(slot),
    onClose: () => { packUI.sheetClosed(); app.focus?.setSelected?.(null, { silent: true }); panel.setSelected(null); },
    openLocker: (o) => packUI.openLocker(o),
  });

  function openBag(slot) {
    if (!app.bags.equipped[slot]) return;
    mounts.show(Object.keys(app.bags.equipped).length ? 'off' : 'empty');
    panel.setSelected(slot);
    app.focus?.setSelected?.(slot, { silent: true });
    bagSheet.open(slot);
  }

  // ---- adding bags: rings on the bike, then the catalogue ---------------------------------------------------
  const mounts = initMounts(app, { onPick: (slot) => openCatalogue(slot, { adding: true }) });
  app.mounts = mounts;
  let adding = false;   // the catalogue was opened from a ring: fitting moves on

  function startAdding() {
    adding = true;
    app.sheets?.closeSheet();
    mounts.show('add');
    app.framing?.frameBike();
    // keyboard and screen readers: the rings are buttons, the first takes focus
    queueMicrotask(() => { if (document.activeElement === document.body || device.hover === false) return; mounts.el.querySelector('.mount-ring')?.focus({ preventScroll: true }); });
    notify('Tap where a bag goes', null, { label: 'Choose from a list', run: () => openMountList() });
  }

  /** The mount list: the same choice as the rings, for keyboards and screen readers. */
  function openMountList() {
    app.openSheet?.({
      kind: 'detail',
      title: 'Add a bag',
      render: (body) => {
        const list = el('div', 'mount-list');
        for (const place of PLACES) {
          for (const slot of place.slots) {
            const def = SLOTS[slot];
            const n = mounts.countFor(slot);
            if (!n) continue;
            const cur = app.bags.equipped[slot];
            const b = button('mount-row', null, () => openCatalogue(slot, { adding: !cur, onBack: openMountList }));
            b.append(el('span', 'mount-row-k', def.label), el('span', 'mount-row-v', cur ? `${cur.brand.short} ${modelTitle(cur.product, cur.brand)}` : `${n} bags`), icon('right', { size: 18 }));
            list.append(b);
          }
        }
        body.append(list);
      },
    });
  }

  function nextEmpty(after) {
    const order = [...BUILD_ORDER, ...PLACES.flatMap((p) => p.slots)];
    const start = Math.max(0, order.indexOf(after) + 1);
    for (const s of order.slice(start)) {
      const place = placeOf(s);
      if (!place || place.slots.some((x) => app.bags.equipped[x])) continue;
      if (mounts.countFor(s) > 0) return s;
    }
    return null;
  }

  /**
   * Fit a bag and stay: the catalogue stays open, the bike changes behind it.
   * Filling an EMPTY place from the rings moves the catalogue on to the next
   * place a first build usually fills; the rings stay, so any other place is
   * one tap away, and Undo puts it all back.
   */
  function fitAndStay(uiSlot, entry, cardEl) {
    const prev = app.bags.equipped[uiSlot];
    const before = prev ? { brand: prev.brand, product: prev.product, cw: prev.colorwayIndex || 0 } : null;
    app.bags.equip(uiSlot, entry.brand, entry.product);
    sync();
    const cur = app.bags.equipped[uiSlot];
    const grid = cardEl?.closest('.cat-list');
    if (grid) for (const other of grid.querySelectorAll('.cat-row')) other.classList.toggle('on', other === cardEl);
    const undo = () => {
      if (before) app.bags.equip(uiSlot, before.brand, before.product, before.cw); else app.bags.remove(uiSlot);
      sync();
    };
    if (!cur) { notify(`${modelTitle(entry.product, entry.brand)} doesn’t fit this frame. Try another size.`); return; }
    const next = adding && !before ? nextEmpty(uiSlot) : null;
    if (next) {
      notify(`Fitted ${modelTitle(cur.product, cur.brand)}. Next: ${SLOTS[next].label.toLowerCase()}`, () => { undo(); openCatalogue(uiSlot, { adding: true }); });
      openCatalogue(next, { adding: true });
    } else {
      notify(`Fitted ${modelTitle(cur.product, cur.brand)}`, undo);
    }
  }

  function fitReason(uiSlot, entry) {
    const def = SLOTS[uiSlot];
    if (def?.mountsTo && !def.mountsTo.some((s) => app.bags.equipped[s])) {
      return `Needs a ${def.mountsTo.map((s) => (SLOTS[s]?.label || s).toLowerCase()).join(' or ')} first`;
    }
    const j = judgeFit(uiSlot, entry.product, app.bike);
    return j.status === 'big' ? j.reason : null;
  }

  /** One catalogue row: the bag, what it is, what it holds and weighs, and whether it fits. */
  function catRow(entry, uiSlot, unfit) {
    const { brand, product } = entry;
    const cur = app.bags.equipped[uiSlot];
    const judged = judgeFit(uiSlot, product, app.bike);
    const small = !unfit && judged.status === 'small';
    const row = button('cat-row' + (cur?.product === product ? ' on' : '') + (unfit ? ' is-unfit' : ''), null, () => fitAndStay(uiSlot, entry, row));
    row.append(bagImg(app, brand, product, { cls: 'thumb cat-img', aspect: 3 / 2 }));
    const t = el('span', 'cat-t');
    t.append(el('span', 'cat-brand', brand.short || brand.name), el('span', 'cat-name', modelTitle(product, brand)));
    const facts = el('span', 'cat-facts num');
    const L = litersOf(product);
    if (L && L !== '–') facts.append(el('span', null, L));
    if (product.weight_g) facts.append(el('span', null, `${fmtWeight(product.weight_g, app.pack?.lib?.unit)}${['maker', 'retailer', 'review', 'size-interpolated'].includes(product.weight_basis) ? '' : ' est.'}`));
    t.append(facts);
    row.append(t);
    const badge = unfit ? el('span', 'fit-badge bad', 'Won’t fit') : small ? el('span', 'fit-badge warn', 'Tight') : el('span', 'fit-badge ok', 'Fits');
    if (unfit || small) badge.title = unfit || judged.reason;
    row.append(badge);
    if (cur?.product === product) row.append(el('span', 'cat-on', 'On the bike'));
    row.setAttribute('aria-label', `${brand.short} ${modelTitle(product, brand)}, ${L}${product.weight_g ? `, ${product.weight_g} grams` : ''}. ${unfit ? `Won’t fit: ${unfit}` : small ? `Tight: ${judged.reason}` : 'Fits'}${cur?.product === product ? '. On the bike' : ''}`);
    return row;
  }

  const catalogue = initCatalogue(app, {
    openSheet: (opts) => app.openSheet?.(opts),
    cardFor: catRow,
    fitReason,
    placeFor: (slot) => {
      const place = placeOf(slot);
      if (!place || place.slots.length < 2) return null;
      return { slots: place.slots.filter((s) => mounts.countFor(s) > 0), labels: Object.fromEntries(place.slots.map((s) => [s, SLOTS[s].label])) };
    },
    onSwitchSlot: (slot) => openCatalogue(slot, { adding }),
    doneLabel: () => (adding ? 'Done' : null),
    onDone: () => { adding = false; app.sheets?.closeSheet(); },
  });

  function openCatalogue(slot, { adding: add = false, replacing = false, onBack = null } = {}) {
    adding = add;
    const place = placeOf(slot);
    if (place) mounts.setActive(place.id);
    if (!replacing && add) mounts.show('add');
    catalogue.open(slot, {
      onBack,
      // adding on a phone: half height, so the bike and its rings stay in view
      detent: add ? 'half' : 'full',
      onClose: () => {
        adding = false;
        mounts.show(Object.keys(app.bags.equipped).length ? 'off' : 'empty');
        mounts.setActive(null);
        // bags on, nothing packed yet: the next thing is "what are you bringing"
        const st = app.pack?.state;
        const empty = st && !st.locker.items.some((i) => st.loadout.place?.[i.uid] !== undefined);
        if (empty && Object.keys(app.bags.equipped).length) panel.detent('half');
      },
    });
  }

  /**
   * A pasted list says "Seat post bag", "Fork right"... and the bike has none
   * of them. Fit one bag per place: the one the example rigs use there if
   * there is one, else the best-fitting bag of middling size.
   */
  async function fitMissing(slots) {
    const los = await fetch('./data/loadouts.json').then((r) => r.json()).catch(() => []);
    const fitted = [];
    for (const slot of slots) {
      if (app.bags.equipped[slot] || !SLOTS[slot]) continue;
      let pick = null;
      for (const lo of los) {
        const b = lo.rig?.bags?.find((x) => x.slot === slot);
        if (!b) continue;
        const brand = app.catalog.find((x) => x.name === b.brand);
        const product = brand?.products.find((p) => p.name === b.name && (p.line || '') === (b.line || '') && (p.size || '') === (b.size || ''));
        if (product && willFit(slot, product, app.bike)) { pick = { brand, product }; break; }
      }
      if (!pick) {
        const opts = productsForSlot(app.catalog, productSlotFor(slot)).filter((o) => willFit(slot, o.product, app.bike) && !fitReason(slot, o));
        opts.sort((a, b) => (Number(a.product.liters) || 0) - (Number(b.product.liters) || 0));
        pick = opts[Math.floor(opts.length / 2)] || null;
      }
      if (pick) { app.bags.equip(slot, pick.brand, pick.product); fitted.push(slot); }
    }
    sync();
    notify(fitted.length ? `Fitted ${fitted.length} bag${fitted.length === 1 ? '' : 's'}. Tap one to change it.` : 'No bag fits those places on this frame.');
  }

  // ---- share: the link, a copy button, and what it carries --------------------------------------------------
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {
      try {
        const ta = el('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.append(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch { return false; }
    }
  }
  async function openShare() {
    const url = await rigURLWithPack(app).catch(() => rigURL(app));
    const st = app.pack?.state;
    const nBags = Object.keys(app.bags.equipped).length;
    const items = st ? st.locker.items.filter((i) => st.loadout.place?.[i.uid] !== undefined && st.loadout.place[i.uid] !== 'home').length : 0;
    app.openSheet?.({
      kind: 'detail',
      title: 'Share this rig',
      detent: 'half',
      render: (body) => {
        const w = el('div', 'share');
        const field = el('input', 'input share-url num');
        field.readOnly = true;
        field.value = url;
        field.setAttribute('aria-label', 'Link to this rig');
        field.onfocus = () => field.select();
        const inc = el('ul', 'share-inc');
        const li = (ok, text) => { const x = el('li', ok ? '' : 'off'); x.append(icon(ok ? 'check' : 'close', { size: 16 }), el('span', null, text)); return x; };
        inc.append(
          li(true, `${nBags} bag${nBags === 1 ? '' : 's'}, frame size and colours`),
          li(items > 0, items ? `The packing list: ${items} thing${items === 1 ? '' : 's'} and where each goes` : 'No packing list yet'),
          li(true, 'Opens for anyone, no account needed'),
        );
        w.append(el('p', 'label', 'Link'), field, el('p', 'label share-inc-h', 'Included'), inc);
        body.append(w);
        const foot = el('div', 'sheet-foot-src');
        const copy = button('btn primary wide', 'Copy link', async () => {
          const ok = await copyText(url);
          copy.textContent = ok ? 'Copied' : 'Copy failed: select the link and copy it';
          setTimeout(() => { copy.textContent = 'Copy link'; }, 2200);
        });
        foot.append(copy);
        if (navigator.share && device.touch) foot.append(button('btn wide', 'Share to…', () => navigator.share({ title: current.name, url }).catch(() => {})));
        body.append(foot);
      },
    });
  }
  app.openShare = openShare;

  // ---- the bike: size, frame colour, bidons ---------------------------------------------------------------
  function openBikeSheet() {
    app.openSheet?.({
      kind: 'detail',
      title: 'Bike',
      render: (body) => {
        const w = el('div', 'bike-sheet');
        const sizes = el('div', 'bs-sizes');
        for (const spec of Object.values(FRAME_SIZES)) {
          const b = button('size-opt' + ((app.bike?.size || app.state.size) === spec.id ? ' on' : ''), null, () => { app.setSize?.(spec.id); openBikeSheet(); });
          b.append(el('span', 'size-id', spec.label), el('span', 'size-r', spec.rider));
          b.setAttribute('aria-pressed', String((app.bike?.size || app.state.size) === spec.id));
          sizes.append(b);
        }
        const swatches = (list, isOn, onPick) => {
          const row = el('div', 'swatches');
          for (const s of list) {
            const b = button('swatch' + (isOn(s) ? ' on' : ''), null, () => { onPick(s); openBikeSheet(); }, s.label);
            b.style.background = s.hex;
            b.title = s.label;
            b.setAttribute('aria-pressed', String(isOn(s)));
            row.append(b);
          }
          return row;
        };
        const paints = Object.entries(PAINTS).map(([k, d]) => ({ key: k, hex: '#' + d.color.toString(16).padStart(6, '0'), label: `Frame colour: ${PAINT_LABEL[k] || k}` }));
        const bottle = app.bike?.bottleColor?.('st');
        w.append(
          el('p', 'label', 'Frame size'), sizes,
          el('p', 'label', `Frame colour · ${PAINT_LABEL[app.state.paint] || app.state.paint}`),
          swatches(paints, (s) => s.key === app.state.paint, (s) => app.setPaint(s.key)),
          el('p', 'label', `Bidons · ${BIDONS.find((c) => c.n === bottle)?.label || ''}`),
          swatches(BIDONS.map((c) => ({ ...c, label: `Bidon colour: ${c.label}` })), (s) => s.n === bottle, (s) => { app.bike.setBottleColor('st', s.n); app.bike.setBottleColor('dt', s.n); }),
        );
        body.append(w);
      },
    });
  }
  app.openBikeSheet = openBikeSheet;

  // ---- first visit: one coach mark on the bike --------------------------------------------------------------
  const COACH = 'packrig.hintSeen';
  let coach = null;
  const seen = (() => { try { return localStorage.getItem(COACH) === '1'; } catch { return false; } })();
  function showCoach() {
    if (seen || coach || new URLSearchParams(location.search).has('still')) return;
    coach = el('div', 'coach glass-1', device.touch ? 'Drag to look around' : 'Drag to look around · scroll to zoom');
    root.append(coach);
    placeCoach();
    const canvas = app.renderer.domElement;
    let down = null;
    const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
    const onMove = (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) gone(); };
    const gone = () => {
      if (!coach) return;
      const n = coach;
      coach = null;
      n.classList.add('gone');
      setTimeout(() => n.remove(), 400);
      try { localStorage.setItem(COACH, '1'); } catch { /* private mode */ }
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('wheel', gone);
    };
    canvas.addEventListener('pointerdown', onDown, { passive: true });
    canvas.addEventListener('pointermove', onMove, { passive: true });
    canvas.addEventListener('wheel', gone, { passive: true });
  }
  function placeCoach() {
    if (!coach) return;
    const r = app.framing?.freeRect?.();
    if (r) coach.style.top = `${Math.round(r.top + 12)}px`;
  }

  // ---- the start screen and leaving for it ------------------------------------------------------------------
  const applySetup = (s) => {
    if (!s) return;
    if (s.size) app.setSize?.(s.size);
    if (s.paint) app.setPaint?.(s.paint);
    if (s.bidon != null) { app.bike?.setBottleColor?.('st', s.bidon); app.bike?.setBottleColor?.('dt', s.bidon); }
  };
  queueMicrotask(() => {
    app.menu = initMenu(app, {
      onBuild: ({ adopted, build, surprise, setup } = {}) => {
        if (surprise) {
          app.randomize();
          savedSnapshot = null;
          current = { id: null, name: randomRigName(), local: true };
        } else if (build && !adopted) {
          app.clearAll?.();
          savedSnapshot = null;
          applySetup(setup);
          current = { id: null, name: setup?.name || randomRigName(), local: true };
        } else if (adopted) {
          const own = adopted.own ? adopted.row : null;
          savedSnapshot = own ? snapshot() : null;
          applySetup(setup);
          current = { id: own?.id ?? null, name: setup?.name || adopted.name || randomRigName(), local: own ? !!own.local : true };
        }
        sync();
        showCoach();
      },
    });
    app.home = {
      open: () => app.menu?.open('start'),
      close: () => app.menu?.close(),
      get isOpen() { return app.menu?.isOpen && app.menu?.view === 'start'; },
    };
    if (!app.__cameWithRig) {
      app.menu.open('start');
    } else {
      app.__enteredBuilder = true;
      showCoach();
    }
  });

  const unsavedKit = () => {
    if (!Object.keys(app.bags?.equipped || {}).length) return false;
    return !current.id || !savedSnapshot || savedSnapshot !== snapshot();
  };
  const closeChrome = () => {
    try { app.aero?.exit?.(); } catch { /* */ }
    closeMore();
    try { app.sheets?.closeSheet(); } catch { /* */ }
  };
  const landHome = () => {
    closeChrome();
    app.clearAll?.();
    savedSnapshot = null;
    current = { id: null, name: randomRigName(), local: true };
    sync();
    app.menu?.open('start');
  };
  function leaveHome() {
    closeChrome();
    if (app.menu?.isOpen) {
      const held = app.menu.takeStash?.();
      if (held?.bags?.length) { try { applyRig(app, held); } catch { /* */ } sync(); } else { landHome(); return; }
    }
    if (!unsavedKit()) { landHome(); return; }
    // Leaving with an unsaved rig: say so in a sheet, not over a dimmed scene.
    app.openSheet?.({
      kind: 'detail',
      title: `Save “${current.name}”?`,
      detent: 'peek',
      render: (body) => {
        body.append(el('p', 't-body', 'The start screen begins with an empty bike.'));
        const foot = el('div', 'sheet-foot-src');
        const row = el('div', 'row');
        row.append(
          button('btn', 'Don’t save', () => landHome()),
          button('btn primary', 'Save', () => {
            stashPendingSave('home');
            requireAccount().then((ok) => { if (!ok) { clearPendingSave(); return null; } return saveCurrent(); })
              .then((row2) => { if (!row2) return; clearPendingSave(); landHome(); notify(`Saved “${row2.name || current.name}”`); })
              .catch((e) => notify(e?.message || 'That rig could not be saved. Try again in a moment.'));
          }),
        );
        foot.append(row);
        body.append(foot);
      },
    });
  }

  // ---- selection and hover, shared with the 3D scene ----------------------------------------------------------
  function setSelected(slot) {
    panel.setSelected(slot);
    if (slot && app.bags.equipped[slot]) openBag(slot);
    else if (!slot && app.sheets?.isOpen && document.querySelector('.sheet .bagsheet')) app.sheets.closeSheet();
  }
  function setHovered(slot) { panel.setHovered(slot); }

  function sync() {
    const n = Object.keys(app.bags.equipped).length;
    if (!n && !app.sheets?.isOpen && !app.menu?.isOpen) mounts.show('empty');
    else if (n && mounts.mode === 'empty') mounts.show('off');
    panel.sync(saveState());
    placeCoach();
  }

  app.bags.onChange(() => { app.framing?.invalidate(); queueMicrotask(() => app.framing?.update()); });
  sync();

  return {
    sync, setSelected, setHovered, closeOverlay: () => app.sheets?.closeSheet(), leaveHome,
    setSheetCollapsed: (on) => panel.detent(on ? 'peek' : 'half'),
    tick() { mounts.tick(); },
  };
}
