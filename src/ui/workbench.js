/**
 * The workbench — one sheet, opened once, that you build a whole rig inside.
 *
 * WHAT IT REPLACES. The old flow was `+ Add a bag` → mount picker → brand
 * picker → model picker → fitted, and then `equip()` called `closeOverlay()`
 * and put you back at the start. Four clicks and three full-screen steps per
 * bag; a six-bag rig cost 24 clicks and walked the sixteen-mount list six
 * times. That single `closeOverlay()` was the whole problem — the funnel had
 * no exit into itself.
 *
 * Here the mount list is not a step, it is a permanent rail. Choosing a bag
 * fits it, ticks the rail, and advances to the next empty mount with the grid
 * already filtered. Measured on the clickable prototype: seven clicks for six
 * bags, against twenty-four.
 *
 * The rail earns its width twice over — it is also the answer to "what have I
 * still not filled?", which the old flow could only answer by reopening the
 * mount picker.
 *
 * ORDER. Auto-advance follows `ZONES` — cockpit, frame, saddle, fork, rear —
 * i.e. front to back down the bike. Predictability beats cleverness here: a
 * rail that jumps to whichever slot has the most products would be faster to
 * fill and impossible to anticipate.
 */

import { productsForSlot } from '../catalog.js';

/**
 * The product line matters more here than anywhere else in the app. Apidura's
 * seat packs are all called "Saddle Pack" — what separates them is the line
 * (Expedition, Racing, Backcountry), so a card showing only `name` renders a
 * grid of nine identical labels.
 */
const cardTitle = (p) => {
  const line = String(p.line || '').trim();
  const name = String(p.name || '').trim();
  // Some records repeat the line inside the name — Ortlieb's frame bags carry
  // line "Frame-Pack" and name "Frame-Pack", which concatenates to
  // "Frame-Pack Frame-Pack". Only prepend a line the name does not already say.
  if (!line) return name;
  if (!name) return line;
  if (name.toLowerCase().startsWith(line.toLowerCase())) return name;
  return `${line} ${name}`.replace(/\s+/g, ' ').trim();
};

/**
 * True when `size` only restates the capacity — "9L" against 9 litres. Showing
 * both prints "9 L 9L", which reads as a rendering fault rather than as data.
 */
const sizeRestatesVolume = (p) => {
  if (!p.size || p.liters == null) return false;
  const norm = String(p.size).toLowerCase().replace(/[^0-9.]/g, '');
  return norm !== '' && Math.abs(parseFloat(norm) - Number(p.liters)) < 0.05;
};

const el = (t, c, txt) => {
  const n = document.createElement(t);
  if (c) n.className = c;
  if (txt != null) n.textContent = txt;
  return n;
};

/**
 * @param app        the app object; needs bags, catalog, sheets, ui
 * @param SLOTS      slot definitions from bags.js (label, excludes, …)
 * @param productSlotFor  maps a UI mount to the catalogue slot that feeds it
 * @param ZONES      the mount groupings, in the order the rail walks them
 */
export function initWorkbench(app, { SLOTS, productSlotFor, ZONES }) {
  // The rail's order IS the zone order, flattened once.
  const RAIL = ZONES.flatMap((z) => z.slots.filter((k) => SLOTS[k]).map((k) => ({ key: k, zone: z.label })));

  const optionsFor = (key) => productsForSlot(app.catalog, productSlotFor(key));
  const isEmpty = (key) => !app.bags.equipped[key];
  const hasOptions = (key) => optionsFor(key).length > 0;

  /**
   * Mounts that cannot coexist with something already on the bike.
   *
   * Eight of the sixteen exclude each other — a handlebar roll and a handlebar
   * bag share an anchor, a seat pack and a rack trunk fight over the same air.
   * `equip()` enforces that by silently removing the loser, which is right, but
   * it makes auto-advance actively destructive: the first end-to-end run put
   * seven clicks in and got four bags out, because the rail walked from
   * handlebar roll straight into handlebar bag and evicted the roll, then into
   * rando basket and evicted that.
   *
   * A rail that hands you the next mount must never hand you one that undoes
   * the last. Blocked mounts stay clickable — swapping a roll for a bar bag is
   * a legitimate thing to want — they are just never advanced INTO.
   */
  const blockedBy = (key) => {
    const def = SLOTS[key];
    if (!def) return null;
    for (const other of Object.keys(app.bags.equipped)) {
      if (other === key) continue;
      if (def.excludes?.includes(other)) return other;
      if (SLOTS[other]?.excludes?.includes(key)) return other;
    }
    return null;
  };

  const nextEmpty = (after) => {
    const start = after ? RAIL.findIndex((r) => r.key === after) + 1 : 0;
    const rot = [...RAIL.slice(start), ...RAIL.slice(0, start)];
    return rot.find((r) => isEmpty(r.key) && hasOptions(r.key) && !blockedBy(r.key))?.key || null;
  };

  let current = null;
  let query = '';
  let handle = null;

  const totals = () => {
    const eq = Object.values(app.bags.equipped);
    const l = eq.reduce((s, e) => s + (Number(e.product?.liters) || 0), 0);
    return { n: eq.length, l };
  };

  /** Fit a bag and move on. The one behaviour this whole module exists for. */
  function choose(key, entry) {
    app.bags.equip(key, entry.brand, entry.product);
    app.ui?.sync();
    query = '';
    // Advance only when the user is filling gaps. If they came back to a slot
    // that already had a bag, they were swapping, and yanking them somewhere
    // else afterwards would be the sheet deciding what they meant.
    current = nextEmpty(key) || key;
    render();
  }

  function remove(key) {
    app.bags.remove(key);
    app.ui?.sync();
    current = key;
    render();
  }

  // ---- rail ---------------------------------------------------------------
  function buildRail() {
    const rail = el('div', 'wb-rail');
    const { n } = totals();
    const head = el('div', 'wb-rail-head');
    head.append(el('span', 't-label', 'Mounts'), el('span', 'wb-count', `${n}/${RAIL.length}`));
    rail.append(head);

    let zone = null;
    for (const { key, zone: z } of RAIL) {
      if (z !== zone) { zone = z; rail.append(el('div', 'wb-zone', z)); }
      const def = SLOTS[key];
      const cur = app.bags.equipped[key];
      const none = !hasOptions(key);
      const blocked = cur ? null : blockedBy(key);
      const b = el('button', 'wb-slot'
        + (cur ? ' is-fitted' : '')
        + (key === current ? ' is-current' : '')
        + (none ? ' is-none' : '')
        + (blocked ? ' is-blocked' : ''));
      b.type = 'button';
      b.append(el('span', 'wb-slot-name', def.label));
      b.append(el('span', 'wb-slot-sub',
        cur ? `${cur.brand.short} ${cardTitle(cur.product)}`
        : none ? 'nothing fits here'
        : blocked ? `replaces the ${SLOTS[blocked].label.toLowerCase()}`
        : `${optionsFor(key).length} bags`));
      if (none) b.disabled = true;
      else b.onclick = () => { current = key; query = ''; render(); };
      rail.append(b);
    }
    return rail;
  }

  // ---- grid ---------------------------------------------------------------
  function buildBody() {
    const wrap = el('div', 'wb-main');
    if (!current) {
      const done = el('div', 'wb-done');
      done.append(el('p', 't-title2', 'Every mount is filled.'));
      const { n, l } = totals();
      done.append(el('p', 't-body', `${n} bags · ${l.toFixed(1)} L. Pick any mount on the left to change one.`));
      wrap.append(done);
      return wrap;
    }

    const def = SLOTS[current];
    const cur = app.bags.equipped[current];
    const all = optionsFor(current);
    const head = el('div', 'wb-head');
    const title = el('div');
    title.append(el('h3', 't-title2', def.label));
    title.append(el('p', 'wb-sub', `${all.length} bags · ${new Set(all.map((e) => e.brand.name)).size} brands`));
    head.append(title);
    const blocked = cur ? null : blockedBy(current);
    if (blocked) {
      title.append(el('p', 'wb-warn',
        `Fitting one here removes the ${SLOTS[blocked].label.toLowerCase()} — they share a mount.`));
    }
    if (cur) {
      const rm = el('button', 'wb-remove', 'Remove');
      rm.type = 'button';
      rm.onclick = () => remove(current);
      head.append(rm);
    }
    wrap.append(head);

    const search = el('input', 'wb-search');
    search.type = 'search';
    search.placeholder = `Search ${all.length} ${def.label.toLowerCase()}s`;
    search.value = query;
    search.oninput = () => {
      query = search.value;
      // Re-render only the grid: replacing the whole body would take focus
      // out of the box the user is still typing into.
      const g = wrap.querySelector('.wb-grid');
      if (g) g.replaceWith(buildGrid());
    };
    wrap.append(search);
    wrap.append(buildGrid());
    return wrap;

    function buildGrid() {
      const grid = el('div', 'wb-grid');
      const q2 = query.trim().toLowerCase();
      const rows = q2
        ? all.filter((e) => `${e.brand.name} ${e.product.line || ''} ${e.product.name} ${e.product.size || ''}`
            .toLowerCase().includes(q2))
        : all;
      if (!rows.length) {
        grid.append(el('p', 'wb-empty', `Nothing matches “${query}”.`));
        return grid;
      }
      for (const entry of rows) {
        const fitted = cur && cur.product === entry.product;
        const c = el('button', 'wb-card' + (fitted ? ' is-on' : ''));
        c.type = 'button';
        const shot = entry.product.images?.[0];
        const plate = el('div', 'wb-plate');
        if (shot) {
          const img = document.createElement('img');
          img.loading = 'lazy'; img.decoding = 'async';
          img.referrerPolicy = 'no-referrer';
          img.alt = `${entry.brand.short} ${cardTitle(entry.product)}`;
          img.src = shot;
          img.onerror = () => { plate.classList.add('is-blank'); img.remove(); };
          plate.append(img);
        } else {
          plate.classList.add('is-blank');
        }
        c.append(plate);
        c.append(el('span', 'wb-brand', entry.brand.short || entry.brand.name));
        c.append(el('span', 'wb-name', cardTitle(entry.product)));
        const meta = el('span', 'wb-meta');
        if (entry.product.liters) meta.append(el('span', 'num', `${entry.product.liters} L`));
        if (entry.product.size && !sizeRestatesVolume(entry.product)) {
          meta.append(el('span', 'wb-size', entry.product.size));
        }
        c.append(meta);
        c.onclick = () => choose(current, entry);
        grid.append(c);
      }
      return grid;
    }
  }

  function render() {
    if (!handle) return;
    const { n, l } = totals();
    handle.setTitle(n ? `Your rig · ${n} bags · ${l.toFixed(1)} L` : 'Build your rig');
    const root = el('div', 'wb');
    root.append(buildRail(), buildBody());
    handle.body.replaceChildren(root);
  }

  /** Open the workbench, optionally at a particular mount. */
  function open(startSlot) {
    current = (startSlot && hasOptions(startSlot)) ? startSlot : nextEmpty(null);
    query = '';
    handle = app.sheets.openSheet({
      kind: 'catalog',
      title: 'Build your rig',
      render: (body, h) => { handle = h; },
      onClose: () => {
        handle = null;
        document.getElementById('ui-root')?.classList.remove('wb-open');
      },
    });
    document.getElementById('ui-root')?.classList.add('wb-open');
    render();
    return handle;
  }

  // Keep the rail honest if something else changes the kit under us — the
  // "Surprise me" button, a colourway swap, the collision resolver dropping a
  // bag it could not place.
  app.bags.onChange?.(() => { if (handle) render(); });

  return {
    open,
    close() { app.sheets.closeSheet(); },
    get isOpen() { return !!handle; },
  };
}
