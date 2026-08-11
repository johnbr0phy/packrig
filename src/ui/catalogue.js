/**
 * The catalogue — REDESIGN.md §9, phase 8.
 *
 * THE SCALE PROBLEM, stated honestly: 702 products across 14 mounts, the
 * largest slot holding 103 and the smallest 1. The old route was mount → brand
 * list → brand page → sizes: four taps before a bag was visible, and the first
 * two asked questions a newcomer cannot answer — which mount? which maker? —
 * and then landed them on pages holding a single item.
 *
 * THE INFORMATION ARCHITECTURE IN ONE SENTENCE: the mount point is the primary
 * facet, and it is free, because you always add a bag TO SOMEWHERE. That one
 * facet cuts 702 down to between 1 and 103 before anyone has done anything, so
 * nobody ever sees 702 items. Brand stops being a tree and becomes a filter
 * chip, which is what it always was.
 *
 * FOUR FACETS, NO MORE. Faceted-search research is consistent that overload
 * causes drop-off, and four is what this data actually supports:
 *
 *   Brand      multi-select, live counts, derived from the filtered set
 *   Capacity   single-select bands, re-banded per slot — a stem bag's "large"
 *              and a pannier's "large" are two orders of magnitude apart
 *   Fabric     multi-select, off `brand.fabricKey`, already computed
 *   Fits       on by default; off reveals the rest with the reason shown
 *
 * Every facet carries a live count, every applied one becomes a removable pill,
 * and the empty state names the facet to relax rather than shrugging.
 *
 *   initCatalogue(app, { openSheet, onPick, pickerHead, cardFor }) -> { open }
 */

import { productsForSlot } from '../catalog.js';
import { productSlotFor, SLOTS } from '../bags.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const FABRICS = [
  ['xpac', 'X-Pac'], ['cordura', 'Cordura'], ['tpu', 'Welded TPU'], ['waxed', 'Waxed canvas'],
];

/**
 * Capacity bands sized to what is actually in this slot.
 *
 * A fixed ladder (`<1 / 1-3 / 3-8 / 8-15 / 15+`) puts every stem bag in one
 * bucket and every pannier in another, which is a filter that filters nothing.
 * These come off the slot's own quartiles, rounded to something a person would
 * say out loud.
 */
function bandsFor(items) {
  const ls = items.map((i) => Number(i.product?.liters)).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (ls.length < 8) return [];
  const q = (t) => ls[Math.floor((ls.length - 1) * t)];
  const round = (n) => (n < 1 ? Math.round(n * 10) / 10 : n < 10 ? Math.round(n * 2) / 2 : Math.round(n / 5) * 5);
  const cuts = [...new Set([q(0.25), q(0.5), q(0.75)].map(round))];
  if (cuts.length < 2) return [];
  const out = [{ label: `Under ${cuts[0]} L`, min: -Infinity, max: cuts[0] }];
  for (let i = 0; i < cuts.length - 1; i++) out.push({ label: `${cuts[i]}–${cuts[i + 1]} L`, min: cuts[i], max: cuts[i + 1] });
  out.push({ label: `${cuts[cuts.length - 1]} L+`, min: cuts[cuts.length - 1], max: Infinity });
  return out;
}

const litres = (p) => { const n = Number(p?.liters); return Number.isFinite(n) ? n : null; };

export function initCatalogue(app, { openSheet, onPick, cardFor, fitReason } = {}) {
  /** Facet state lives per slot for the session — §9. */
  const memory = new Map();

  function open(uiSlot) {
    const catSlot = productSlotFor(uiSlot);
    const all = productsForSlot(app.catalog, catSlot);
    const label = SLOTS[uiSlot]?.label || 'Bag';
    const state = memory.get(uiSlot) || { brands: new Set(), fabrics: new Set(), band: null, q: '', fits: true, sort: 'fit' };
    memory.set(uiSlot, state);
    const bands = bandsFor(all);

    let body = null;
    const handle = openSheet({
      kind: 'catalog',
      title: label,
      render: (b, h) => { body = b; draw(h); },
    });

    function matches(entry, skip) {
      const { brand, product } = entry;
      if (skip !== 'brand' && state.brands.size && !state.brands.has(brand.name)) return false;
      if (skip !== 'fabric' && state.fabrics.size && !state.fabrics.has(brand.fabricKey)) return false;
      if (skip !== 'band' && state.band != null && bands[state.band]) {
        const l = litres(product);
        const b = bands[state.band];
        if (l == null || l < b.min || l >= b.max) return false;
      }
      if (skip !== 'fits' && state.fits && fitReason?.(uiSlot, entry)) return false;
      if (state.q) {
        const hay = `${brand.name} ${product.line || ''} ${product.name} ${product.size || ''}`.toLowerCase();
        if (!state.q.toLowerCase().split(/\s+/).every((t) => hay.includes(t))) return false;
      }
      return true;
    }

    function filtered(skip) { return all.filter((e) => matches(e, skip)); }

    function sorted(rows) {
      const by = {
        // Best dimensional match first, then the bigger bag: someone who has
        // told us the mount wants the one that fits it best, not the one whose
        // maker is alphabetically lucky.
        fit: (a, b) => (fitReason?.(uiSlot, a) ? 1 : 0) - (fitReason?.(uiSlot, b) ? 1 : 0)
          || (litres(b.product) ?? 0) - (litres(a.product) ?? 0),
        capUp: (a, b) => (litres(a.product) ?? 1e9) - (litres(b.product) ?? 1e9),
        capDown: (a, b) => (litres(b.product) ?? -1) - (litres(a.product) ?? -1),
        brand: (a, b) => a.brand.name.localeCompare(b.brand.name) || String(a.product.name).localeCompare(String(b.product.name)),
      };
      return rows.slice().sort(by[state.sort] || by.fit);
    }

    function draw(h) {
      const pk = el('div', 'picker cat');
      const rows = sorted(filtered());

      // ---- search ---------------------------------------------------------
      const search = el('div', 'cat-search');
      const input = document.createElement('input');
      input.type = 'search';
      input.placeholder = `Search ${all.length} ${label.toLowerCase()}${all.length === 1 ? '' : 's'}`;
      input.value = state.q;
      input.className = 'cat-q';
      let t = null;
      input.oninput = () => { clearTimeout(t); t = setTimeout(() => { state.q = input.value.trim(); redraw(h, true); }, 120); };
      search.append(input);
      pk.append(search);

      // ---- facets ---------------------------------------------------------
      const facets = el('div', 'cat-facets');

      const byBrand = new Map();
      for (const e of filtered('brand')) byBrand.set(e.brand.name, (byBrand.get(e.brand.name) || 0) + 1);
      facets.append(popover('Brand', [...byBrand].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, n]) => ({ key: name, label: name, n, on: state.brands.has(name) })),
      (key) => { state.brands.has(key) ? state.brands.delete(key) : state.brands.add(key); redraw(h); },
      state.brands.size, h));

      if (bands.length) {
        const counts = bands.map((b, i) => filtered('band').filter((e) => {
          const l = litres(e.product); return l != null && l >= b.min && l < b.max;
        }).length);
        facets.append(popover('Capacity', bands.map((b, i) => ({ key: i, label: b.label, n: counts[i], on: state.band === i })),
          (key) => { state.band = state.band === key ? null : key; redraw(h); }, state.band != null ? 1 : 0, h));
      }

      const fabCounts = new Map();
      for (const e of filtered('fabric')) fabCounts.set(e.brand.fabricKey, (fabCounts.get(e.brand.fabricKey) || 0) + 1);
      const fabOpts = FABRICS.filter(([k]) => fabCounts.get(k))
        .map(([k, l]) => ({ key: k, label: l, n: fabCounts.get(k), on: state.fabrics.has(k) }));
      if (fabOpts.length > 1) {
        facets.append(popover('Fabric', fabOpts,
          (key) => { state.fabrics.has(key) ? state.fabrics.delete(key) : state.fabrics.add(key); redraw(h); },
          state.fabrics.size, h));
      }

      const unfit = all.filter((e) => fitReason?.(uiSlot, e)).length;
      if (unfit) {
        const fitBtn = el('button', 'cat-chip' + (state.fits ? ' on' : ''), state.fits ? 'Fits my frame ✓' : 'Showing all sizes');
        fitBtn.type = 'button';
        fitBtn.title = state.fits ? `${unfit} hidden because they will not fit` : 'Hide the ones that will not fit';
        fitBtn.onclick = () => { state.fits = !state.fits; redraw(h); };
        facets.append(fitBtn);
      }

      const sortBtn = el('button', 'cat-chip cat-sort', {
        fit: 'Sort: Fit', capUp: 'Sort: Capacity ↑', capDown: 'Sort: Capacity ↓', brand: 'Sort: Brand A–Z',
      }[state.sort]);
      sortBtn.type = 'button';
      sortBtn.onclick = () => {
        const order = ['fit', 'capDown', 'capUp', 'brand'];
        state.sort = order[(order.indexOf(state.sort) + 1) % order.length];
        redraw(h);
      };
      facets.append(sortBtn);
      pk.append(facets);

      // ---- count line + clear ---------------------------------------------
      const line = el('div', 'cat-count');
      const nBrands = new Set(rows.map((e) => e.brand.name)).size;
      line.append(el('span', null, `${rows.length} bag${rows.length === 1 ? '' : 's'} · ${nBrands} brand${nBrands === 1 ? '' : 's'}`));
      const any = state.brands.size || state.fabrics.size || state.band != null || state.q || !state.fits;
      if (any) {
        const clear = el('button', 'cat-clear', 'Clear all');
        clear.type = 'button';
        clear.onclick = () => {
          state.brands.clear(); state.fabrics.clear(); state.band = null; state.q = ''; state.fits = true;
          redraw(h);
        };
        line.append(clear);
      }
      pk.append(line);

      // ---- grid -----------------------------------------------------------
      if (!rows.length) {
        const empty = el('div', 'cat-empty');
        empty.append(el('p', null, 'Nothing matches that.'));
        // Name the thing to relax, and make it a button. "No results" with no
        // way out is the state people leave from.
        const outs = el('div', 'cat-outs');
        if (state.q) outs.append(relax('Clear the search', () => { state.q = ''; redraw(h); }));
        if (state.band != null) outs.append(relax('Widen capacity', () => { state.band = null; redraw(h); }));
        if (state.fabrics.size) outs.append(relax('Clear fabric', () => { state.fabrics.clear(); redraw(h); }));
        if (state.brands.size) outs.append(relax('Clear brand', () => { state.brands.clear(); redraw(h); }));
        if (state.fits && unfit) outs.append(relax('Show ones that will not fit', () => { state.fits = false; redraw(h); }));
        empty.append(outs);
        pk.append(empty);
      } else {
        const grid = el('div', 'cards');
        // 24 at a time, more as you reach the bottom: 103 cards each hot-linking
        // a photograph is not free, and nobody scrolls 103 before choosing.
        let shown = 0;
        const more = () => {
          for (const e of rows.slice(shown, shown + 24)) grid.append(cardFor(e, uiSlot, fitReason?.(uiSlot, e)));
          shown = Math.min(shown + 24, rows.length);
          sentinel.hidden = shown >= rows.length;
        };
        const sentinel = el('div', 'cat-more');
        more();
        pk.append(grid, sentinel);
        const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) more(); }, { rootMargin: '400px' });
        io.observe(sentinel);
      }

      body.replaceChildren(pk);
      h?.setTitle?.(label);
    }

    function relax(text, fn) {
      const b = el('button', 'cat-relax', text);
      b.type = 'button';
      b.onclick = fn;
      return b;
    }

    function redraw(h, keepFocus) {
      draw(h);
      if (keepFocus) {
        const q = body.querySelector('.cat-q');
        q?.focus();
        q?.setSelectionRange(q.value.length, q.value.length);
      }
    }

    /** A chip that opens a list of options with live counts. */
    function popover(name, opts, toggle, activeCount, h) {
      const chip = el('button', 'cat-chip' + (activeCount ? ' on' : ''),
        activeCount ? `${name} · ${activeCount}` : name);
      chip.type = 'button';
      chip.onclick = (e) => {
        e.stopPropagation();
        const open_ = chip.nextElementSibling?.classList.contains('cat-pop');
        document.querySelectorAll('.cat-pop').forEach((n) => n.remove());
        if (open_) return;
        const pop = el('div', 'cat-pop');
        for (const o of opts) {
          const row = el('button', 'cat-opt' + (o.on ? ' on' : ''));
          row.type = 'button';
          row.append(el('span', 'cat-opt-l', o.label), el('span', 'cat-opt-n', String(o.n)));
          row.onclick = (ev) => { ev.stopPropagation(); toggle(o.key); };
          pop.append(row);
        }
        chip.after(pop);
        const away = () => { pop.remove(); document.removeEventListener('click', away); };
        setTimeout(() => document.addEventListener('click', away), 0);
      };
      return chip;
    }

    return handle;
  }

  return { open };
}
