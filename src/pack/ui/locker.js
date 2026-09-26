/**
 * The gear locker: everything I own, and the catalogue of everything a person
 * might take, in one searchable sheet.
 *
 * One tap adds a thing AND packs it: it goes into my locker and straight into
 * the best bag on the bike (the same rules as "Suggest a layout"), and the
 * toast says where, with Undo and Move. That is the whole first-timer loop —
 * tap "Tent", see a tent go into the fork cage.
 */
import { btn, el, placeWords } from './labels.js';
import { thumbImg, asThumbItem } from './thumbs.js';
import { CATS, CAT_LABEL, resolveItem } from '../model.js';
import { searchGear } from '../gear.js';
import { fmtWeight, fmtLitres } from '../units.js';

export function initLocker(app, hooks) {
  const P = app.pack;
  let q = '';
  let cat = null;
  let handle = null;

  async function open({ cat: c = null, query = '' } = {}) {
    cat = c; q = query;
    await P.gearReady;
    handle = app.openSheet?.({ kind: 'catalog', title: 'My kit', render: (body) => render(body) });
    // focus the search on desktop; on a phone that would throw the keyboard up
    if (matchMedia('(pointer: fine)').matches) setTimeout(() => handle?.body.querySelector('.pkg-search')?.focus(), 60);
  }

  function addAndPack(fields) {
    const it = P.add(fields, 'home');
    const res = P.suggest({ only: [it.uid] });
    const code = res?.place?.[it.uid] || 'home';
    const name = resolveItem(it, P.gear).name;
    if (code !== 'home' && /^[a-z]/.test(code)) {
      const slot = code.split(':')[0];
      if (app.bags.equipped[slot]) P.openBag(slot);
    }
    hooks.notify?.(code === 'home' ? `${name} added. No bag has room; it’s staying home for now.` : `${name} → ${placeWords(code).toLowerCase()}`,
      () => P.remove(it.uid), { label: 'Move', run: () => hooks.openItem?.(it.uid) });
    return it;
  }

  function render(body) {
    body.replaceChildren();
    const wrap = el('div', 'pkg-locker');
    const search = el('input', 'input pkg-search');
    search.type = 'search';
    search.placeholder = `Search ${P.gear.items.length} things`;
    search.setAttribute('aria-label', 'Search gear');
    search.value = q;
    const chips = el('div', 'pkg-chips');
    chips.setAttribute('role', 'tablist');
    const all = [{ id: null, label: 'All' }, ...CATS];
    for (const c of all) {
      const b = btn('chip' + (cat === c.id ? ' on' : ''), c.label, () => { cat = c.id; paintList(); for (const x of chips.children) x.classList.toggle('on', x.textContent === c.label); });
      b.setAttribute('aria-pressed', String(cat === c.id));
      chips.append(b);
    }
    const list = el('div', 'pkg-llist');
    wrap.append(search, chips, list);
    const foot = el('div', 'pkg-lfoot');
    foot.append(
      btn('btn sm', 'Add your own', () => openCustom(body)),
      btn('btn sm', 'Paste a spreadsheet', () => hooks.openImport?.()),
    );
    wrap.append(foot);
    body.append(wrap);
    let t = null;
    search.oninput = () => { clearTimeout(t); t = setTimeout(() => { q = search.value; paintList(); }, 120); };
    search.onkeydown = (e) => {
      // Enter adds the top result: the fastest path for someone who knows what they want
      if (e.key === 'Enter') { const first = list.querySelector('.pkg-add-btn'); first?.click(); }
    };

    function paintList() {
      list.replaceChildren();
      const st = P.state;
      if (!st.mine) { list.append(el('div', 'pkg-note', 'You’re looking at someone else’s list. Copy it to your locker to change it.')); return; }
      // ---- mine
      const mine = st.locker.items.filter((it) => {
        const r = st.resolved.get(it.uid);
        if (cat && r.cat !== cat) return false;
        if (q && !`${r.name} ${r.brand || ''} ${CAT_LABEL[r.cat]}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      });
      if (mine.length) {
        list.append(el('div', 'pkg-lhead', `Yours · ${mine.length}`));
        for (const it of mine) {
          const r = st.resolved.get(it.uid);
          const code = st.loadout.place[it.uid];
          const row = el('div', 'pkg-lrow');
          row.append(thumbImg(r));
          const tx = el('button', 'pkg-lrow-t');
          tx.type = 'button';
          tx.onclick = () => hooks.openItem?.(it.uid);
          tx.append(el('span', 'pkg-item-n', r.name), el('span', 'pkg-item-s', code && code !== 'home' ? placeWords(code) : code === 'home' ? 'Staying home' : 'Not on this trip'));
          row.append(tx, el('span', 'pkg-item-w num', fmtWeight(r.g, P.lib.unit)));
          if (!code || code === 'home') {
            row.append(btn('btn sm pkg-add-btn', 'Pack', () => {
              P.place(it.uid, 'home');
              const res = P.suggest({ only: [it.uid] });
              const c = res?.place?.[it.uid];
              hooks.notify?.(c && c !== 'home' ? `${r.name} → ${placeWords(c).toLowerCase()}` : `${r.name}: no bag has room`);
              paintList();
            }, { label: `Pack ${r.name}` }));
          } else row.append(el('span', 'pkg-check', '✓'));
          hooks.drag?.source(row, it.uid);
          list.append(row);
        }
      }
      // ---- catalogue
      const hits = searchGear(P.gear, q, { cat, limit: q ? 60 : 200 });
      if (hits.length) list.append(el('div', 'pkg-lhead', q ? 'Add' : `Add · ${cat ? CAT_LABEL[cat] : 'everything'}`));
      for (const g of hits) {
        const row = el('div', 'pkg-lrow is-cat');
        row.append(thumbImg(asThumbItem(g)));
        const tx = el('div', 'pkg-lrow-t');
        const sub = [g.brand && !g.generic ? g.brand : null, fmtLitres(g.packed_l)].filter(Boolean).join(' · ');
        tx.append(el('span', 'pkg-item-n', g.generic || !g.brand ? g.name : g.name), el('span', 'pkg-item-s', sub));
        row.append(tx, el('span', 'pkg-item-w num', fmtWeight(g.weight_g, P.lib.unit)));
        const add = btn('btn sm pkg-add-btn', '+', () => { addAndPack({ ref: g.id }); paintList(); }, { label: `Add ${g.name}` });
        row.append(add);
        list.append(row);
      }
      if (!mine.length && !hits.length) {
        const none = el('div', 'pkg-note');
        none.append(document.createTextNode(`Nothing called “${q}”. `));
        none.append(btn('btn sm ghost', `Add “${q}” as your own`, () => openCustom(body, q)));
        list.append(none);
      }
    }
    paintList();
  }

  /** A quick custom item: name, weight, what kind of thing. Size is guessed from the kind. */
  function openCustom(body, name = '') {
    const box = el('form', 'pkg-custom');
    box.onsubmit = (e) => {
      e.preventDefault();
      const n = nameI.value.trim();
      const w = parseFloat(wI.value);
      if (!n || !(w > 0)) { wI.focus(); return; }
      const g = unitSel.value === 'oz' ? w * 28.3495 : w;
      addAndPack({ name: n, g: Math.round(g * 10) / 10, ...(kindSel.value ? { a: kindSel.value } : {}) });
      box.remove();
    };
    const nameI = el('input', 'input');
    nameI.placeholder = 'What is it?';
    nameI.value = name;
    nameI.setAttribute('aria-label', 'Name');
    const wI = el('input', 'input num');
    wI.inputMode = 'decimal';
    wI.placeholder = 'Weight';
    wI.setAttribute('aria-label', 'Weight');
    const unitSel = el('select', 'input');
    for (const u of P.lib.unit === 'imperial' ? ['oz', 'g'] : ['g', 'oz']) unitSel.append(new Option(u, u));
    unitSel.setAttribute('aria-label', 'Unit');
    const kindSel = el('select', 'input');
    kindSel.setAttribute('aria-label', 'What kind of thing');
    kindSel.append(new Option('Guess from the name', ''));
    for (const [v, l] of [['stuffsack', 'Soft bag of stuff'], ['clothing_folded', 'Jacket or top'], ['clothing_rolled', 'Small clothing'], ['box', 'Hard box'], ['pouch', 'Pouch'], ['bottle', 'Bottle'], ['pole_bundle', 'Long and thin'], ['tent_bundle', 'Tent or shelter'], ['sleeping_bag', 'Sleeping bag'], ['multitool', 'Tool']]) kindSel.append(new Option(l, v));
    const row = el('div', 'pkg-custom-r');
    row.append(wI, unitSel);
    const go = el('button', 'btn primary', 'Add and pack');
    go.type = 'submit';
    box.append(el('div', 'pkg-lhead', 'Your own thing'), nameI, row, kindSel, go);
    body.querySelector('.pkg-locker')?.prepend(box);
    nameI.focus();
  }

  return { open, addAndPack, close: () => handle?.close() };
}
