/**
 * The rig panel: the bike, its bags and what is in them, as one list.
 *
 * It used to be two modes behind a "Bags | Gear" switch, which split one
 * question ("will my stuff fit on my bike?") into two screens. Now every bag
 * row carries its own fill meter, weight and a strip of what is inside, and
 * the kit that is not packed yet sits under the bags. Tapping a bag opens it.
 *
 * Top to bottom: the rig's name with Save and Share; the numbers (all-up big,
 * the split beneath, kg | lb); the trip and the watts; then the bags, and the
 * kit. On a phone this is the bottom sheet; its peek is the numbers.
 *
 *   initRigPanel(app, hooks) -> { el, sync(), setHovered(slot), setSelected(slot), name }
 */
import { SLOTS } from '../bags.js';
import { icon } from './v2/icons.js';
import { bagImg } from './bagthumbs.js';
import { attachDetents } from './detents.js';
import { phoneHeights, isPhone } from './sheet.js';
import { litersOf, modelTitle } from './product.js';
import { thumbImg, asThumbItem } from '../pack/ui/thumbs.js';
import { SLOT_ORDER, SLOT_WORD, placeWords } from '../pack/ui/labels.js';
import { parsePlace } from '../pack/model.js';
import { fmtWeight, fmtLitres, weightParts } from '../pack/units.js';
import { QUICK } from '../pack/ui/quick.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const button = (cls, text, onClick, label) => {
  const b = el('button', cls, text);
  b.type = 'button';
  if (onClick) b.onclick = onClick;
  if (label) b.setAttribute('aria-label', label);
  return b;
};
const lc = (s) => (s ? s[0].toLowerCase() + s.slice(1) : '');

/** Warnings worth a line on the bag's row, most serious first. */
const KNEE = ['toptube', 'toptube_rear', 'framebag_full', 'framebag_half', 'stemL', 'stemR'];
function rowWarning(st, slot, unit) {
  const w = st.warnings.filter((x) => x.slot === slot);
  const over = w.filter((x) => x.kind === 'overflow');
  if (over.length) {
    const n = st.resolved.get(over[0].uid)?.name || 'Something';
    return { cls: 'bad', text: over.length === 1 ? `${n} won’t fit` : `${over.length} things won’t fit` };
  }
  const load = w.find((x) => x.kind === 'load');
  if (load) return { cls: 'warn', text: `${fmtWeight(load.kg * 1000, unit)}, over the ${fmtWeight(load.limit * 1000, unit)} most are rated for` };
  const bulge = w.find((x) => x.kind === 'bulge' && KNEE.includes(slot));
  if (bulge) return { cls: 'warn', text: 'Bulges; may rub your knees' };
  const sides = w.find((x) => x.kind === 'sides');
  if (sides) return { cls: 'warn', text: `${fmtWeight(Math.abs(sides.L - sides.R) * 1000, unit)} heavier on the ${sides.L > sides.R ? 'left' : 'right'}` };
  const buried = w.find((x) => x.kind === 'buried');
  if (buried) return { cls: 'warn', text: 'Phone is buried in here' };
  return null;
}

export function initRigPanel(app, hooks) {
  const P = app.pack;
  const panel = el('aside', 'panel glass-2');
  panel.setAttribute('aria-label', 'Your rig');
  const inner = el('div', 'sheet-inner');
  const top = el('div', 'sheet-top');
  const grip = el('div', 'sheet-grip');
  grip.setAttribute('aria-hidden', 'true');

  // ---- head: name, save, share ------------------------------------------------
  const head = el('header', 'sheet-head rg-head');
  const nameBtn = button('rg-name', '', () => startRename());
  nameBtn.title = 'Rename';
  const nameIn = el('input', 'input rg-name-in');
  nameIn.hidden = true;
  nameIn.maxLength = 48;
  nameIn.setAttribute('aria-label', 'Rig name');
  const saveBtn = button('btn sm rg-save', '', () => hooks.save?.());
  const shareBtn = button('btn sm rg-share', '', () => hooks.openShare?.());
  shareBtn.append(icon('share', { size: 16 }), el('span', null, 'Share'));
  head.append(nameBtn, nameIn, saveBtn, shareBtn);
  top.append(grip, head);

  // ---- the numbers: peek content on a phone ----------------------------------------
  const nums = el('div', 'peek-extra rg-nums');
  const body = el('div', 'sheet-body rg-body');
  inner.append(top, nums, body);
  panel.append(inner);

  let name = '';
  function startRename() {
    nameIn.value = name;
    nameBtn.hidden = true;
    nameIn.hidden = false;
    nameIn.focus();
    nameIn.select();
  }
  const endRename = (commit) => {
    if (nameIn.hidden) return;
    const v = nameIn.value.trim();
    nameIn.hidden = true;
    nameBtn.hidden = false;
    if (commit && v && v !== name) hooks.rename?.(v);
  };
  nameIn.onblur = () => endRename(true);
  nameIn.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); endRename(true); }
    if (e.key === 'Escape') { e.preventDefault(); endRename(false); }
  };

  // phone: bottom sheet heights. Peek is the head and the numbers.
  const detents = attachDetents(panel, {
    grip: top,
    heights: phoneHeights(panel, { peekMin: 120 }),
    initial: 'peek',
    onChange: () => { app.framing?.update(); app.surfaces?.followFor(420); },
  });
  grip.onclick = () => { if (isPhone()) detents.step(); };
  head.addEventListener('click', (e) => { if (isPhone() && e.target === head) detents.step(); });
  nums.addEventListener('click', (e) => { if (isPhone() && detents.name === 'peek' && !e.target.closest('button')) detents.snap('half'); });
  app.framing?.addChrome(() => {
    if (app.sheets?.isOpen || document.getElementById('ui-root').classList.contains('menu-open')) return null;
    if (panel.hidden) return null;
    if (isPhone()) return { bottom: detents.top() };
    const r = panel.getBoundingClientRect();
    return r.width ? { left: r.right } : null;
  });

  // ---- render ----------------------------------------------------------------------------
  let hovered = null;
  let selected = null;
  const unit = () => P?.lib?.unit || 'metric';
  const W = (g, o) => fmtWeight(g, unit(), o);

  function numberCell(label, g, { est = false } = {}) {
    const c = el('div', 'rg-cell');
    const [n, u] = weightParts(g, unit());
    const v = el('span', 'rg-cell-v num');
    v.append(n, el('span', 'unit', ` ${u}`));
    if (est) v.append(el('span', 'unit', ' est.'));
    c.append(el('span', 'label', label), v);
    return c;
  }

  function paintNums(st, bags) {
    nums.replaceChildren();
    nums.classList.remove('is-empty');
    if (!bags) { nums.hidden = true; return; }
    nums.hidden = false;
    const t = st.totals;
    const row1 = el('div', 'rg-nums-head');
    row1.append(el('span', 'label', 'All-up'));
    const seg = el('div', 'seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Units');
    for (const [k, l, lab] of [['metric', 'kg', 'Kilograms'], ['imperial', 'lb', 'Pounds']]) {
      const b = button(unit() === k ? 'on' : '', l, () => P.setUnit(k), lab);
      b.setAttribute('aria-pressed', String(unit() === k));
      seg.append(b);
    }
    row1.append(seg);
    const row2 = el('div', 'rg-nums-main');
    const [n, u] = weightParts(t.allup, unit(), { big: true });
    const big = el('span', 'rg-allup num');
    big.append(n, el('span', 'unit', ` ${u}`));
    big.title = 'Bike, bags, kit, food and water';
    row2.append(big, wattsChip());
    const split = el('div', 'rg-split');
    const estBags = st.bags.list.some((b) => b.est) && !Number.isFinite(st.loadout.bags_g);
    split.append(
      numberCell('Bike', t.bike),
      numberCell('Bags', t.bags, { est: estBags }),
      numberCell('Kit', t.gear),
      numberCell('Food', t.food),
    );
    nums.append(row1, row2, split);
  }

  function wattsChip() {
    const w = hooks.watts?.() || null;
    const b = button('chip rg-watts', '', () => hooks.openTunnel?.());
    b.append(icon('wind', { size: 16 }));
    if (w && Number.isFinite(w.addedW)) {
      b.append(el('span', 'num', `${w.addedW >= 0 ? '+' : '−'}${Math.abs(Math.round(w.addedW))} W`), el('span', 'rg-watts-at', `at ${Math.round(w.speedKph)} km/h`));
      b.setAttribute('aria-label', `Wind tunnel: the bags cost ${Math.round(w.addedW)} watts at ${Math.round(w.speedKph)} km/h`);
    } else {
      b.append(el('span', null, 'Wind tunnel'));
      b.setAttribute('aria-label', 'Open the wind tunnel');
    }
    return b;
  }

  function contentsStrip(items, st) {
    const strip = el('div', 'rg-strip');
    const MAX = 7;
    for (const it of items.slice(0, MAX)) {
      const r = st.resolved.get(it.uid);
      const im = thumbImg(r, 'rg-strip-img');
      im.title = r.name;
      strip.append(im);
    }
    if (items.length > MAX) strip.append(el('span', 'rg-strip-more num', `+${items.length - MAX}`));
    return strip;
  }

  function bagRow(slot, st, itemsBySlot) {
    const cur = app.bags.equipped[slot];
    const r = st.results[slot];
    const items = itemsBySlot.get(slot) || [];
    const row = button('rg-bag', '', () => hooks.openBag?.(slot));
    row.dataset.slot = slot;
    const img = bagImg(app, cur.brand, cur.product, { cls: 'thumb rg-bag-img', cw: cur.colorwayIndex || 0 });
    const txt = el('span', 'rg-bag-t');
    const l1 = el('span', 'rg-bag-l1');
    l1.append(el('span', 'rg-bag-where', SLOTS[slot]?.label || SLOT_WORD[slot] || slot), el('span', 'rg-bag-l num', litersOf(cur.product)));
    const l2 = el('span', 'rg-bag-name', `${cur.brand.short} ${modelTitle(cur.product, cur.brand)}`);
    txt.append(l1, l2);
    if (items.length || (r && r.fill.frac > 0)) {
      const pct = Math.round(Math.min(r?.fill.frac || 0, 1.5) * 100);
      const l3 = el('span', 'rg-bag-l3');
      const meter = el('span', 'meter' + ((r?.overflow?.length) ? ' over' : pct >= 95 ? ' tight' : ''));
      const fill = el('i');
      fill.style.width = `${Math.min(pct, 100)}%`;
      meter.append(fill);
      meter.setAttribute('role', 'meter');
      meter.setAttribute('aria-valuenow', String(pct));
      meter.setAttribute('aria-valuemin', '0');
      meter.setAttribute('aria-valuemax', '100');
      meter.setAttribute('aria-label', `${pct}% full`);
      const g = items.reduce((a, it) => a + (st.resolved.get(it.uid)?.g || 0), 0);
      l3.append(meter, el('span', 'rg-bag-fill num', `${pct}% · ${W(g)}`));
      txt.append(l3);
      if (items.length) txt.append(contentsStrip(items, st));
    }
    const warn = rowWarning(st, slot, unit());
    if (warn) txt.append(el('span', `rg-bag-warn ${warn.cls}`, warn.text));
    row.append(img, txt);
    const pct = r ? Math.round(r.fill.frac * 100) : 0;
    row.setAttribute('aria-label', `${SLOTS[slot]?.label}: ${cur.brand.short} ${modelTitle(cur.product, cur.brand)}, ${litersOf(cur.product)}${items.length ? `, ${items.length} things, ${pct}% full` : ''}${warn ? `. ${warn.text}` : ''}`);
    row.onmouseenter = () => app.focus?.setHovered?.(slot);
    row.onmouseleave = () => app.focus?.setHovered?.(null);
    hooks.drag?.dropTarget?.(row, slot);
    return row;
  }

  function unfitRow(slot, rec) {
    const row = el('div', 'rg-bag is-unfit');
    row.dataset.slot = slot;
    const img = bagImg(app, rec.brand, rec.product, { cls: 'thumb rg-bag-img' });
    const txt = el('span', 'rg-bag-t');
    txt.append(el('span', 'rg-bag-where', SLOTS[slot]?.label || slot), el('span', 'rg-bag-name', `${rec.brand.short} ${modelTitle(rec.product, rec.brand)}`),
      el('span', 'rg-bag-warn bad', 'Doesn’t fit this frame'));
    const acts = el('span', 'rg-bag-acts');
    acts.append(button('btn sm', 'Swap', () => hooks.openCatalogue?.(slot)), button('btn sm ghost bad', 'Remove', () => hooks.removeUnfit?.(slot)));
    row.append(img, txt, acts);
    return row;
  }

  function itemRow(it, st) {
    const r = st.resolved.get(it.uid);
    const code = st.loadout.place[it.uid];
    const row = button('rg-item', '', () => hooks.openItem?.(it.uid));
    row.dataset.uid = it.uid;
    row.append(thumbImg(r, 'thumb rg-item-img'));
    const t = el('span', 'rg-item-t');
    const orphan = st.warnings.find((w) => w.uid === it.uid && w.kind === 'nobag');
    t.append(el('span', 'rg-item-n', r.name), el('span', 'rg-item-s' + (orphan ? ' warn' : ''), orphan ? `No ${lc(SLOT_WORD[orphan.slot] || 'bag')} on the bike` : placeWords(code)));
    row.append(t, el('span', 'rg-item-w num', W(r.g)));
    if (it.wanted) row.append(el('span', 'rg-flag', 'to get'));
    row.setAttribute('aria-label', `${r.name}, ${W(r.g)}, ${orphan ? 'not packed' : placeWords(code)}`);
    hooks.drag?.source?.(row, it.uid);
    return row;
  }

  /** The kit prompt: tap what you are bringing, it packs as you tap. */
  function quickTiles(st) {
    const box = el('section', 'rg-sec rg-quick');
    const h = el('div', 'rg-sec-head');
    h.append(el('h3', 'rg-sec-t', 'What are you bringing?'));
    box.append(h);
    const grid = el('div', 'rg-tiles');
    for (const q of QUICK.slice(0, 12)) {
      const g = P.gear?.get(q.ids[0]);
      if (!g) continue;
      const has = hooks.quickHas?.(q);
      const t = button('rg-tile' + (has ? ' on' : ''), '', () => hooks.quickToggle?.(q));
      t.setAttribute('aria-pressed', String(!!has));
      t.append(thumbImg(asThumbItem(g), 'rg-tile-img'), el('span', 'rg-tile-l', q.label));
      if (has) t.append(el('span', 'rg-tile-at', has));
      grid.append(t);
    }
    box.append(grid);
    const more = el('div', 'rg-row');
    more.append(button('btn sm ghost', 'Browse all gear', () => hooks.openLocker?.()), button('btn sm ghost', 'Paste a spreadsheet', () => hooks.openImport?.()));
    box.append(more);
    return box;
  }

  function paint() {
    const st = P?.state;
    if (!st) return;
    const bagSlots = SLOT_ORDER.filter((s) => app.bags.equipped[s]);
    const unfit = Object.keys(app.bags.unfitted || {});
    const nBags = bagSlots.length;
    body.replaceChildren();
    paintNums(st, nBags);
    panel.classList.toggle('is-empty', !nBags && !unfit.length);

    // someone else's rig
    if (!st.mine) {
      const v = el('div', 'rg-viewing');
      const notMine = P.notOwned().length;
      const listed = st.locker.items.filter((i) => st.loadout.place?.[i.uid] !== undefined && st.loadout.place[i.uid] !== 'home');
      v.append(el('p', 'rg-viewing-t', `${P.view?.name || 'A shared rig'}: ${listed.length} things packed${notMine ? `, ${notMine} not in your kit` : ''}.`));
      const row = el('div', 'rg-row');
      row.append(button('btn primary sm', 'Copy to my kit', () => hooks.copyView?.()), button('btn sm ghost', 'Back to mine', () => P.stopViewing()));
      v.append(row);
      body.append(v);
    }

    // ---- empty bike ---------------------------------------------------------------------
    if (!nBags && !unfit.length) {
      // in the peek, so a phone shows it without opening the sheet
      nums.hidden = false;
      nums.classList.add('is-empty');
      const e = el('div', 'rg-empty');
      e.append(el('p', 'rg-empty-t', 'Tap where a bag goes'));
      const row = el('div', 'rg-row');
      row.append(button('btn sm', 'Choose from a list', () => hooks.openMountList?.()),
        button('btn sm ghost', 'Start from an example', () => hooks.openGallery?.()));
      e.append(row);
      nums.append(e);
      return;
    }

    // ---- trip ---------------------------------------------------------------------------
    const listed = st.locker.items.filter((i) => st.loadout.place?.[i.uid] !== undefined);
    const chips = el('div', 'rg-chips');
    if (st.mine && (listed.length || P.loadouts().length > 1)) {
      const trip = button('chip rg-trip', '', () => hooks.openTrips?.());
      trip.append(el('span', 'rg-trip-k', 'Trip'), el('span', 'rg-trip-v', st.loadout.name || 'Untitled'), icon('down', { size: 14 }));
      trip.setAttribute('aria-label', `Trip: ${st.loadout.name}. Change trip`);
      chips.append(trip);
    }
    if (chips.childElementCount) body.append(chips);

    // group items by where they are
    const itemsBySlot = new Map();
    const frame = [], worn = [], notPacked = [];
    for (const it of listed) {
      const p = parsePlace(st.loadout.place[it.uid]);
      if ((p.loc === 'bag' || p.loc === 'lashed' || p.loc === 'dangle') && app.bags.equipped[p.slot]) {
        if (!itemsBySlot.has(p.slot)) itemsBySlot.set(p.slot, []);
        itemsBySlot.get(p.slot).push(it);
      } else if (p.loc === 'frame') frame.push(it);
      else if (p.loc === 'body') worn.push(it);
      else notPacked.push(it);
    }

    // first-timer: no kit yet, so ask
    if (st.mine && !listed.length) body.append(quickTiles(st));

    // ---- bags -----------------------------------------------------------------------------
    const sec = el('section', 'rg-sec');
    const sh = el('div', 'rg-sec-head');
    const litres = bagSlots.reduce((n, s) => n + (Number(app.bags.equipped[s].product?.liters) || 0), 0);
    sh.append(el('h3', 'rg-sec-t', 'Bags'), el('span', 'rg-sec-n num', `${nBags} · ${fmtLitres(litres)}`));
    sec.append(sh);
    const list = el('div', 'rg-list');
    for (const s of bagSlots) list.append(bagRow(s, st, itemsBySlot));
    for (const s of unfit) list.append(unfitRow(s, app.bags.unfitted[s]));
    sec.append(list);
    const acts = el('div', 'rg-row');
    const addBag = button('btn sm', '', () => hooks.addBag?.());
    addBag.append(icon('plus', { size: 16 }), el('span', null, 'Add a bag'));
    acts.append(addBag);
    if (st.mine && listed.length) {
      const addGear = button('btn sm', '', () => hooks.openLocker?.());
      addGear.append(icon('plus', { size: 16 }), el('span', null, 'Add gear'));
      acts.append(addGear);
    }
    sec.append(acts);
    body.append(sec);

    // ---- balance ----------------------------------------------------------------------------
    if (st.balance && listed.length) {
      const b = st.balance;
      const bal = el('div', 'rg-bal');
      const bar = el('div', 'rg-bal-bar');
      const f = el('i');
      f.style.width = `${(b.front * 100).toFixed(1)}%`;
      bar.append(f);
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', `Front ${Math.round(b.front * 100)} percent, rear ${Math.round(b.rear * 100)} percent`);
      const l = el('div', 'rg-bal-l');
      l.append(el('span', 'num', `Front ${Math.round(b.front * 100)}%`), el('span', 'num', `Rear ${Math.round(b.rear * 100)}%`));
      bal.append(l, bar);
      body.append(bal);
    }

    // ---- kit off the bags ---------------------------------------------------------------------------
    const group = (title, items, extra) => {
      if (!items.length) return;
      const g = el('section', 'rg-sec');
      const h = el('div', 'rg-sec-head');
      const wsum = items.reduce((a, it) => a + (st.resolved.get(it.uid)?.g || 0), 0);
      h.append(el('h3', 'rg-sec-t', title), el('span', 'rg-sec-n num', `${items.length} · ${W(wsum)}`));
      g.append(h);
      const l = el('div', 'rg-list');
      for (const it of items) l.append(itemRow(it, st));
      g.append(l);
      if (extra) g.append(extra);
      body.append(g);
    };
    let packBtn = null;
    const homeUids = notPacked.map((i) => i.uid);
    if (st.mine && homeUids.length) {
      packBtn = el('div', 'rg-row');
      packBtn.append(button('btn sm', homeUids.length === 1 ? 'Pack it' : `Pack these ${homeUids.length}`, () => hooks.packHome?.(homeUids)));
    }
    group('Not packed', notPacked, packBtn);
    group('On the frame', frame);
    group('On you', worn);
  }

  // ---- selection and hover, mirrored with the scene -------------------------------------------------
  function paintSel() {
    for (const r of body.querySelectorAll('.rg-bag')) {
      r.classList.toggle('sel', r.dataset.slot === selected);
      r.classList.toggle('hov', r.dataset.slot === hovered && r.dataset.slot !== selected);
    }
  }

  function paintHead(saveState) {
    nameBtn.textContent = name || 'Untitled rig';
    nameBtn.setAttribute('aria-label', `Rig name: ${name || 'Untitled'}. Rename`);
    const s = saveState || hooks.saveState?.() || { show: false };
    saveBtn.hidden = !s.show;
    saveBtn.textContent = s.label || 'Save';
    saveBtn.classList.toggle('is-done', !!s.done);
    saveBtn.classList.toggle('primary', !s.done);
    saveBtn.disabled = !!s.done;
    saveBtn.title = s.title || '';
    shareBtn.hidden = !Object.keys(app.bags.equipped).length;
  }

  let lastPeek = 0;
  const afterPaint = () => {
    // the peek is the numbers: when they change height, the sheet follows
    const h = nums.offsetHeight + top.offsetHeight;
    if (isPhone() && h !== lastPeek) { lastPeek = h; detents.refresh(); app.framing?.update(); }
  };
  P?.subscribe?.(() => { paint(); paintSel(); afterPaint(); });
  queueMicrotask(() => { if (isPhone()) detents.snap('peek', { animate: false, silent: true }); });

  return {
    el: panel,
    sync(saveState) { paintHead(saveState); paint(); paintSel(); afterPaint(); },
    paintHead,
    setHovered(slot) {
      hovered = slot || null;
      paintSel();
      if (slot) body.querySelector(`.rg-bag[data-slot="${CSS.escape(slot)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    setSelected(slot) { selected = slot || null; paintSel(); },
    get name() { return name; },
    set name(v) { name = v || ''; paintHead(); },
    detent(n) { if (isPhone()) detents.snap(n); },
    get detentName() { return detents.name; },
    detentTop: () => (isPhone() ? detents.top() : null),
    refreshDetent() { if (isPhone()) detents.refresh(); },
  };
}
