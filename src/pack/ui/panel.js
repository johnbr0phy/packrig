/**
 * The Gear view of the left column: what this loadout weighs, how it balances,
 * and what is in each bag. Lives INSIDE the rig panel beside the bag list —
 * one column, two views — so it inherits the panel's docking, its phone bottom
 * sheet and its scrim well instead of inventing a third surface.
 *
 * Every number here is read from `app.pack.state`, the same object the bag
 * sheet, the 3D contents and the share link read.
 */
import { SLOT_ORDER, SLOT_WORD, btn, el, placeWords } from './labels.js';
import { thumbImg } from './thumbs.js';
import { parsePlace, CAT_LABEL } from '../model.js';
import { fmtWeight, weightParts } from '../units.js';

export function initGearPanel(app, hooks) {
  const P = app.pack;
  const section = el('section', 'nav-sec pkg-gear');
  section.setAttribute('aria-label', 'Gear');

  // ---- the Bags | Gear switch ---------------------------------------------------
  const tabs = el('div', 'pkg-tabs');
  tabs.setAttribute('role', 'tablist');
  const tBags = btn('pkg-tab', 'Bags', () => setMode('bags'));
  const tGear = btn('pkg-tab', 'Gear', () => setMode('gear'));
  for (const t of [tBags, tGear]) t.setAttribute('role', 'tab');
  const tGearN = el('span', 'pkg-tab-n');
  tGear.append(tGearN);
  tabs.append(tBags, tGear);

  let mode = 'bags';
  function setMode(m) {
    mode = m === 'gear' ? 'gear' : 'bags';
    hooks.panel.dataset.mode = mode;
    tBags.setAttribute('aria-selected', String(mode === 'bags'));
    tGear.setAttribute('aria-selected', String(mode === 'gear'));
    tBags.classList.toggle('on', mode === 'bags');
    tGear.classList.toggle('on', mode === 'gear');
    P.setShowing(mode === 'gear');
    try { localStorage.setItem('packrig.mode', mode); } catch { /* */ }
    paint(P.state);
  }

  // ---- render -------------------------------------------------------------------
  const unitW = (g, o) => fmtWeight(g, P.lib.unit, o);

  function numberRow(label, g, extra = '') {
    const r = el('div', 'pkg-split-i');
    const [n, u] = weightParts(g, P.lib.unit);
    r.append(el('span', 'pkg-split-k', label));
    const v = el('span', 'pkg-split-v num');
    v.append(document.createTextNode(n), el('span', 'pkg-u', ` ${u}`));
    if (extra) v.append(el('span', 'pkg-est', extra));
    r.append(v);
    return r;
  }

  function paint(st) {
    if (!st) return;
    const listed = st.locker.items.filter((i) => st.loadout.place?.[i.uid] !== undefined);
    const coming = listed.filter((i) => st.loadout.place[i.uid] !== 'home');
    tGearN.textContent = coming.length ? String(coming.length) : '';
    if (mode !== 'gear') return;
    section.replaceChildren();

    // someone else's list
    if (!st.mine) {
      const v = el('div', 'pkg-viewing');
      const notMine = P.notOwned().length;
      v.append(el('div', 'pkg-viewing-t', `${P.view?.name || 'Shared rig'} · ${coming.length} things packed`));
      if (notMine) v.append(el('div', 'pkg-viewing-s', `${notMine} you don’t own yet`));
      const row = el('div', 'pkg-row-actions');
      row.append(btn('pkg-btn is-primary', 'Copy to my locker', () => {
        const res = P.copyView();
        hooks.notify?.(res?.missing?.length ? `Copied. ${res.missing.length} things are marked to get.` : 'Copied into your locker.');
      }));
      row.append(btn('pkg-btn', 'Back to mine', () => P.stopViewing()));
      v.append(row);
      section.append(v);
    }

    // ---- header: loadout + all-up --------------------------------------------------
    const head = el('div', 'pkg-head');
    const lo = btn('pkg-loadout', '', () => hooks.openLoadouts?.(lo));
    lo.setAttribute('aria-haspopup', 'menu');
    lo.append(el('span', 'pkg-loadout-n', st.loadout.name || 'Loadout'), el('span', 'pkg-chev', '▾'));
    if (!st.mine) lo.disabled = true;
    const hero = el('div', 'pkg-hero');
    const [n, u] = weightParts(st.totals.allup, P.lib.unit, { big: true });
    hero.append(el('span', 'pkg-hero-n num', n), el('span', 'pkg-hero-u', u));
    hero.title = 'All-up: bike, bags, gear, food and water';
    head.append(lo, hero);
    section.append(head);

    const split = el('div', 'pkg-split');
    const estBags = st.bags.list.some((b) => b.est) && !Number.isFinite(st.loadout.bags_g);
    split.append(
      numberRow('Gear', st.totals.gear),
      numberRow('Bags', st.totals.bags, estBags ? ' est.' : ''),
      numberRow('Bike', st.totals.bike),
    );
    if (st.totals.food) split.append(numberRow('Food & water', st.totals.food));
    if (st.totals.worn) split.append(numberRow('Worn', st.totals.worn));
    // units: a two-way switch, both options visible, the current one lit
    const unit = el('div', 'pkg-unit');
    unit.setAttribute('role', 'group');
    unit.setAttribute('aria-label', 'Units');
    for (const [k, l] of [['metric', 'kg'], ['imperial', 'lb']]) {
      const b = btn('pkg-unit-b' + (P.lib.unit === k ? ' on' : ''), l, () => P.setUnit(k), { label: k === 'metric' ? 'Grams and kilos' : 'Ounces and pounds' });
      b.setAttribute('aria-pressed', String(P.lib.unit === k));
      unit.append(b);
    }
    split.append(unit);
    section.append(split);

    // ---- balance -------------------------------------------------------------------
    if (st.balance && coming.length) {
      const b = st.balance;
      const bal = el('div', 'pkg-bal');
      const bar = el('div', 'pkg-bal-bar');
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', `Front ${Math.round(b.front * 100)} percent, rear ${Math.round(b.rear * 100)} percent`);
      const f = el('span', 'pkg-bal-f');
      f.style.width = `${(b.front * 100).toFixed(1)}%`;
      bar.append(f);
      const lab = el('div', 'pkg-bal-l');
      lab.append(el('span', 'num', `Front ${Math.round(b.front * 100)}%`), el('span', 'num', `Rear ${Math.round(b.rear * 100)}%`));
      const side = Math.round(((b.right - b.left) / b.mass) * 100);
      const meta = el('div', 'pkg-bal-m');
      meta.append(
        el('span', 'num', `Centre of mass ${Math.round(b.heightMm / 10)} cm up`),
        el('span', 'num', Math.abs(side) < 3 ? 'Left–right even' : `${Math.abs(side)}% more on the ${side > 0 ? 'right' : 'left'}`),
      );
      bal.append(lab, bar, meta);
      section.append(bal);
    }

    // ---- warnings -------------------------------------------------------------------
    const warn = st.warnings.filter((w) => w.kind !== 'buried' || true);
    if (warn.length) {
      const wl = el('div', 'pkg-warns');
      for (const w of warn.slice(0, 4)) wl.append(warningRow(st, w));
      if (warn.length > 4) wl.append(el('div', 'pkg-warn-more', `${warn.length - 4} more`));
      section.append(wl);
    }

    // ---- empty -------------------------------------------------------------------------
    if (!listed.length) {
      const e = el('div', 'pkg-empty');
      e.append(el('div', 'pkg-empty-t', st.mine ? 'Nothing packed yet' : 'No packing list on this rig'));
      if (st.mine) {
        const c = el('div', 'pkg-empty-c');
        c.append(
          btn('pkg-btn is-primary', 'What are you bringing?', () => hooks.openQuick?.()),
          btn('pkg-btn', 'Browse gear', () => hooks.openLocker?.()),
          btn('pkg-btn', 'Paste a spreadsheet', () => hooks.openImport?.()),
          btn('pkg-link', 'Or open a packed example', () => hooks.openExample?.()),
        );
        e.append(c);
      }
      section.append(e);
      return;
    }

    // ---- groups ---------------------------------------------------------------------
    const groups = new Map();
    const push = (k, it) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); };
    for (const it of listed) {
      const p = parsePlace(st.loadout.place[it.uid]);
      if (p.loc === 'bag' || p.loc === 'lashed' || p.loc === 'dangle') push(p.slot, it);
      else if (p.loc === 'frame') push('frame', it);
      else if (p.loc === 'body') push('body', it);
      else push('home', it);
    }
    const order = [...SLOT_ORDER.filter((s) => groups.has(s) || app.bags.equipped[s]), 'frame', 'body', 'home'];
    const list = el('div', 'pkg-groups');
    for (const k of order) {
      const items = groups.get(k) || [];
      const isBag = !!SLOT_WORD[k];
      if (!items.length && !(isBag && app.bags.equipped[k])) continue;
      list.append(groupEl(st, k, items, isBag));
    }
    section.append(list);

    const acts = el('div', 'nav-actions pkg-actions');
    if (st.mine) {
      acts.append(btn('add-bag pkg-add', '+  Add gear', () => hooks.openLocker?.()));
      const home = listed.filter((i) => st.loadout.place[i.uid] === 'home').length;
      if (Object.keys(app.bags.equipped).length) {
        acts.append(btn('btn quiet pkg-suggest', home ? `Pack the ${home} at home` : 'Suggest a layout', () => {
          const before = JSON.stringify(st.loadout.place);
          const res = home ? P.suggest({ only: listed.filter((i) => st.loadout.place[i.uid] === 'home').map((i) => i.uid) }) : P.suggest({ all: true });
          const moved = Object.keys(res?.place || {}).length;
          hooks.notify?.(`Packed ${moved - (res?.homeless?.length || 0)} things${res?.homeless?.length ? `, ${res.homeless.length} won’t fit` : ''}`, () => {
            const lo2 = P.active();
            if (lo2) { lo2.place = JSON.parse(before); P.recompute(); }
          });
        }));
      }
    }
    section.append(acts);
  }

  function groupEl(st, k, items, isBag) {
    const g = el('div', 'pkg-group');
    g.dataset.slot = k;
    const r = isBag ? st.results[k] : null;
    const head = el(isBag ? 'button' : 'div', 'pkg-ghead');
    if (isBag) {
      head.type = 'button';
      head.onclick = () => hooks.openBagSheet?.(k);
      head.onmouseenter = () => app.focus?.setHovered?.(k);
      head.onmouseleave = () => app.focus?.setHovered?.(null);
      head.setAttribute('aria-label', `${SLOT_WORD[k]}: open to see inside`);
    }
    const title = el('span', 'pkg-gtitle', isBag ? SLOT_WORD[k] : k === 'frame' ? 'On the frame' : k === 'body' ? 'On you' : 'Staying home');
    head.append(title);
    const g2 = items.reduce((a, it) => a + st.resolved.get(it.uid).g, 0);
    if (isBag && r) {
      const pct = Math.round(Math.min(r.fill.frac, 1.5) * 100);
      const meter = el('span', 'pkg-meter');
      const fill = el('span', 'pkg-meter-f');
      fill.style.width = `${Math.min(pct, 100)}%`;
      meter.classList.toggle('is-full', r.fill.frac >= 0.9);
      meter.classList.toggle('is-over', r.overflow.length > 0);
      meter.append(fill);
      meter.setAttribute('role', 'meter');
      meter.setAttribute('aria-valuenow', String(pct));
      meter.setAttribute('aria-valuemin', '0');
      meter.setAttribute('aria-valuemax', '100');
      meter.setAttribute('aria-label', `${pct}% full`);
      head.append(meter, el('span', 'pkg-gw num', `${pct}%`));
    }
    head.append(el('span', 'pkg-gw num', items.length ? unitW(g2) : ''));
    g.append(head);
    for (const it of items) g.append(itemRow(st, it));
    // desktop: drop an item on a bag's header to put it in
    if (isBag) hooks.drag?.dropTarget(g, k);
    return g;
  }

  function itemRow(st, it) {
    const r = st.resolved.get(it.uid);
    const row = btn('pkg-item', '', () => hooks.openItem?.(it.uid));
    row.dataset.uid = it.uid;
    row.append(thumbImg(r));
    const t = el('span', 'pkg-item-t');
    t.append(el('span', 'pkg-item-n', r.name));
    const code = st.loadout.place[it.uid];
    const p = parsePlace(code);
    const sub = p.loc === 'lashed' ? 'Strapped outside' : p.loc === 'dangle' ? 'Hanging off' : p.side ? (p.side === 'L' ? 'Left side' : 'Right side')
      : p.loc === 'body' && p.in === 'hip' ? 'Hip pack' : (r.brand || (CAT_LABEL[r.cat] || ''));
    const over = st.warnings.find((w) => w.uid === it.uid && (w.kind === 'overflow' || w.kind === 'nobag'));
    if (over) row.classList.add('is-over');
    const flag = it.wanted ? el('span', 'pkg-flag', 'to get') : null;
    t.append(el('span', 'pkg-item-s', over ? (over.kind === 'nobag' ? 'That bag isn’t on the bike' : 'Doesn’t fit') : sub));
    row.append(t);
    if (flag) row.append(flag);
    if (!st.mine && P.notOwned().includes(it.uid)) row.append(el('span', 'pkg-flag', 'not yours'));
    row.append(el('span', 'pkg-item-w num', unitW(r.g)));
    row.setAttribute('aria-label', `${r.name}, ${unitW(r.g)}, ${placeWords(code)}`);
    hooks.drag?.source(row, it.uid);
    return row;
  }

  function warningRow(st, w) {
    const r = w.uid ? st.resolved.get(w.uid) : null;
    const row = el('div', 'pkg-warn');
    let text = '';
    let act = null;
    if (w.kind === 'overflow') {
      const alt = P.alternativeFor(w.uid);
      text = w.reason === 'length'
        ? `${r.name} is ${Math.round(w.detail.needMm / 10)} cm long; the ${lc(SLOT_WORD[w.slot])} is ${Math.round(w.detail.haveMm / 10)} cm inside.`
        : `${r.name} won’t fit in the ${lc(SLOT_WORD[w.slot])}.`;
      if (alt) { text += ` Try ${placeWords(alt).toLowerCase()}.`; act = btn('pkg-link', 'Move it', () => P.place(w.uid, alt)); }
    } else if (w.kind === 'load') {
      text = `${fmtWeight(w.kg * 1000, P.lib.unit)} in the ${lc(SLOT_WORD[w.slot])}; most are rated for ${fmtWeight(w.limit * 1000, P.lib.unit)}.`;
    } else if (w.kind === 'sides') {
      text = `The frame bag is ${fmtWeight(Math.abs(w.L - w.R) * 1000, P.lib.unit)} heavier on the ${w.L > w.R ? 'left' : 'right'}.`;
    } else if (w.kind === 'nobag') {
      const alt = P.alternativeFor(w.uid);
      text = `${r.name} is packed in a ${lc(SLOT_WORD[w.slot])}, and there isn’t one on the bike.`;
      if (alt) act = btn('pkg-link', `Put it in the ${lc(placeWords(alt))}`, () => P.place(w.uid, alt));
    } else if (w.kind === 'buried') {
      text = `The phone is in the ${lc(SLOT_WORD[w.slot])}; you’ll stop to dig it out.`;
    } else if (w.kind === 'fragile-out') {
      text = `${r.name} is hanging off the ${lc(SLOT_WORD[w.slot])}.`;
    } else return row;
    row.append(el('span', 'pkg-warn-t', text));
    if (act) row.append(act);
    return row;
  }
  const lc = (s) => (s ? s[0].toLowerCase() + s.slice(1) : '');

  P.subscribe(paint);
  let saved = 'bags';
  try { saved = localStorage.getItem('packrig.mode') || 'bags'; } catch { /* */ }
  queueMicrotask(() => setMode(saved));
  return { tabs, section, setMode, get mode() { return mode; }, paint: () => paint(P.state) };
}
