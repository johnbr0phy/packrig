/**
 * Browse — one view, two sources: the curated Loadouts and the rig Gallery.
 *
 * WHY ONE VIEW. Reading a loadout and reading somebody's gallery rig are the
 * same act: look at a built bike, find out what is on it, decide whether you
 * want it. v1 had a gallery and no loadouts, and the gallery consisted of two
 * arrows and a name plate — which told you a rig was called "Full tour" and had
 * "7 bags · 75.0 L", and nothing whatever about what those seven bags WERE.
 * That is a slideshow, and a slideshow of a thing you cannot read is boring by
 * the third frame.
 *
 * WHAT MAKES IT WORTH STAYING IN. The manifest. Every bag on the bike, listed
 * by mounting point, with its maker, its model and its capacity, set in tabular
 * figures so the litres line up as a column you can actually compare down. It
 * is the packing list for the bike in front of you, and it is the thing the
 * catalogue exists to be able to print.
 *
 * THE BIKE IS THE VIEW. There is no thumbnail grid and no photograph. Moving
 * through the strip re-mounts the rig on the live bike, which costs what
 * loading a shared link costs, and the bike you are reading about is the bike
 * you are looking at, at full brightness, orbitable, in the same light as
 * everything else in the app.
 *
 *   initBrowse(app, { onAdopt, onDirty }) -> { render(kind), onKey }
 */

import { icon } from './icons.js';
import { applyRig, findProduct } from '../../rig.js';
import { SLOTS } from '../../bags/slots.js';
import { litersOf, modelTitle } from '../product.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const num = (v) => (Math.round(Number(v) * 10) / 10).toFixed(1).replace(/\.0$/, '');

/** Curated loadouts, fetched once. */
let loadoutsPromise = null;
const fetchLoadouts = () => {
  if (!loadoutsPromise) {
    loadoutsPromise = fetch('./data/loadouts.json')
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
  }
  return loadoutsPromise;
};

/**
 * Everything on a rig, resolved against the live catalogue and ordered the way
 * you would walk the bike: front to back, top to bottom. A rig stores its bags
 * in whatever order they were fitted, which is the order they happened rather
 * than an order that means anything.
 */
const MOUNT_ORDER = [
  'randobag', 'barroll', 'barbag', 'barpocket', 'stemL', 'stemR',
  'toptube', 'framebag_full', 'framebag_half', 'downtube', 'toptube_rear',
  'forkL', 'forkR', 'seatpack', 'saddlebag', 'trunk', 'pannierL', 'pannierR',
];

function manifestOf(app, rig) {
  const rows = [];
  for (const b of rig?.bags || []) {
    const hit = findProduct(app.catalog, b);
    if (!hit) continue;
    rows.push({
      slot: b.slot,
      mount: SLOTS[b.slot]?.label || b.slot,
      brand: hit.brand.short || hit.brand.name,
      model: modelTitle(hit.product, hit.brand),
      litres: litersOf(hit.product),
      raw: Number(hit.product.liters) || 0,
    });
  }
  rows.sort((a, b) => {
    const ia = MOUNT_ORDER.indexOf(a.slot); const ib = MOUNT_ORDER.indexOf(b.slot);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return rows;
}

export function initBrowse(app, { onAdopt, onDirty, isLive } = {}) {
  // Per-kind cursor, so stepping out to the start screen and back into the
  // gallery puts you where you were rather than at rig one.
  const cursor = { loadouts: 0, gallery: 0 };
  let kind = 'loadouts';
  let items = [];
  let nodes = null;
  /*
   * Every load carries the token that was current when it started, and applies
   * nothing unless that token is still current AND the menu is still open.
   *
   * Comparing the wrapper element was not enough. Closing the menu leaves
   * `nodes.wrap` pointing at the very node the closure captured — detached,
   * but still equal — so a gallery request that resolved a second after the
   * user pressed Close passed the guard and mounted a stranger's rig onto the
   * bike they had just gone back to. Silently, with no menu on screen.
   */
  let token = 0;
  const live = isLive || (() => true);

  // ---- sources -----------------------------------------------------------

  async function loadLoadouts() {
    const raw = await fetchLoadouts();
    return raw.map((l) => ({
      id: l.id,
      name: l.name,
      kicker: l.kicker,
      note: l.note,
      tags: l.tags || [],
      stats: l.stats,
      rig: l.rig,
    }));
  }

  // Set when the gallery is showing YOUR saved rigs because nothing has been
  // published. The view says so rather than presenting them as other people's.
  let fallbackToMine = false;

  async function loadGallery() {
    let rows = [];
    let mine = false;
    try { rows = (await app.rigs?.gallery?.({ limit: 40 })) || []; } catch { rows = []; }
    if (!rows.length) {
      try { rows = (await app.rigs?.list?.()) || []; mine = rows.length > 0; } catch { rows = []; }
    }
    fallbackToMine = mine;
    return rows.map((row) => {
      const man = manifestOf(app, row.rig);
      return {
        id: row.id,
        name: row.name || 'Untitled rig',
        kicker: mine ? 'Your rig' : `by ${row.author || 'Anonymous'}`,
        note: '',
        tags: [...new Set(man.map((m) => m.brand))].slice(0, 4),
        stats: {
          litres: Math.round(man.reduce((n, m) => n + m.raw, 0) * 10) / 10,
          bags: man.length,
          makers: new Set(man.map((m) => m.brand)).size,
        },
        rig: row.rig,
        mine,
      };
    });
  }

  // ---- the view ----------------------------------------------------------

  function render(nextKind) {
    kind = nextKind;
    const mine = ++token;
    // The previous view's rigs are NOT this view's rigs. Leaving them in place
    // during the load meant an arrow key pressed in that window stepped through
    // the gallery while the header said Loadouts, and mounted the wrong rig.
    items = [];
    chips = [];
    const wrap = el('div', 'pr-browse');

    const spec = el('div', 'pr-spec');
    const railWrap = el('div', 'pr-railwrap');

    wrap.append(spec, railWrap);

    nodes = { wrap, spec, railWrap };

    spec.append(el('p', 'pr-loading', kind === 'loadouts'
      ? 'Loading loadouts…' : 'Looking for published rigs…'));

    (kind === 'loadouts' ? loadLoadouts() : loadGallery())
      .then((list) => {
        // A late resolve for a view the user has already left must not paint
        // over the view they are now looking at — and must never touch the bike.
        if (mine !== token || !live() || nodes?.wrap !== wrap) return;
        items = list;
        if (!items.length) { paintEmpty(); return; }
        cursor[kind] = Math.min(cursor[kind], items.length - 1);
        buildRail();
        show(cursor[kind], { instant: true });
      })
      .catch(() => { if (mine === token && live() && nodes?.wrap === wrap) paintEmpty(); });

    return wrap;
  }

  function paintEmpty() {
    nodes.spec.replaceChildren();
    const e = el('div', 'pr-empty');
    e.append(el('h2', 'pr-title', kind === 'loadouts' ? 'No loadouts' : 'Nothing published yet'));
    e.append(el('p', 'pr-note', kind === 'loadouts'
      ? 'The curated rigs did not load. The builder still works — everything in the catalogue is there.'
      : 'Nobody has published a rig yet. Build one, save it and publish it, and yours would be the first in here.'));
    nodes.spec.append(e);
  }

  // ---- the strip ---------------------------------------------------------

  let chips = [];
  let rail = null;

  function buildRail() {
    nodes.railWrap.replaceChildren();

    const prev = el('button', 'pr-step');
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Previous rig');
    prev.append(icon('left', { size: 18 }));
    prev.onclick = () => step(-1);

    const next = el('button', 'pr-step');
    next.type = 'button';
    next.setAttribute('aria-label', 'Next rig');
    next.append(icon('right', { size: 18 }));
    next.onclick = () => step(1);

    rail = el('div', 'pr-rail');
    /*
     * NOT a tablist. `role="tablist"` is a contract: roving tabindex, arrow
     * keys that MOVE FOCUS, Home/End. This strip's arrow keys change the rig
     * globally without moving focus, and every chip stays in the tab order —
     * so declaring the role promised a keyboard behaviour that is not
     * implemented and left focus and `aria-selected` on different chips. They
     * are buttons in a list, which is what they behave like.
     */
    rail.setAttribute('role', 'list');
    rail.setAttribute('aria-label', 'Rigs');
    chips = items.map((it, i) => {
      const c = el('button', 'pr-chip');
      c.type = 'button';
      c.append(el('span', 'pr-chip-n', String(i + 1).padStart(2, '0')));
      const body = el('span', 'pr-chip-body');
      body.append(el('span', 'pr-chip-name', it.name));
      body.append(el('span', 'pr-chip-l', `${num(it.stats.litres)} L`));
      c.append(body);
      c.onclick = () => show(i);
      rail.append(c);
      return c;
    });

    nodes.railWrap.append(prev, rail, next);
  }

  // ---- one rig -----------------------------------------------------------

  function show(i, { instant = false } = {}) {
    if (!items.length) return;
    const n = ((i % items.length) + items.length) % items.length;
    cursor[kind] = n;
    const it = items[n];

    const { missing } = applyRig(app, it.rig);
    onDirty?.();
    app.ui?.sync?.();
    if (missing?.length) {
      console.warn('[packrig] rig references bags no longer in the catalogue:', missing);
    }

    chips.forEach((c, k) => {
      c.classList.toggle('is-on', k === n);
      c.setAttribute('aria-current', k === n ? 'true' : 'false');
    });
    chips[n]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: instant ? 'auto' : 'smooth' });

    paintSpec(it, n, instant);
  }

  function paintSpec(it, n, instant) {
    const spec = nodes.spec;
    spec.replaceChildren();

    let seq = 0;
    const staged = (node) => {
  node.classList.add('pr-st');
  node.style.setProperty('--i', String(seq++));
  return node;
};

    const counter = el('p', 'pr-counter');
    counter.append(el('b', null, String(n + 1).padStart(2, '0')));
    counter.append(el('span', null, ` / ${String(items.length).padStart(2, '0')}`));
    spec.append(staged(counter));

    // On the fallback the aside says "these are your own saved rigs", which is
    // the kicker's line as well — so the kicker steps aside rather than saying
    // it first in fewer words.
    const aside = kind === 'gallery' && fallbackToMine
      ? 'Nothing has been published yet — these are your own saved rigs.' : '';
    if (it.kicker && !aside) spec.append(staged(el('p', 'pr-kicker', it.kicker)));
    spec.append(staged(el('h2', 'pr-title', it.name)));
    if (aside) spec.append(staged(el('p', 'pr-aside', aside)));
    if (it.note) spec.append(staged(el('p', 'pr-note', it.note)));

    // Three numbers, read as a group. Tabular figures so the litre column of
    // two rigs compared one after the other does not jump sideways.
    const stats = el('div', 'pr-figs');
    const fig = (v, k) => {
      const f = el('div', 'pr-fig');
      f.append(el('b', 'pr-fig-v', v), el('span', 'pr-fig-k', k));
      return f;
    };
    stats.append(fig(num(it.stats.litres), 'litres'));
    stats.append(fig(String(it.stats.bags), it.stats.bags === 1 ? 'bag' : 'bags'));
    stats.append(fig(String(it.stats.makers), it.stats.makers === 1 ? 'maker' : 'makers'));
    spec.append(staged(stats));

    // The manifest — the reason to be on this screen.
    const rows = manifestOf(app, it.rig);
    if (rows.length) {
      // A bare role="table" over anonymous spans is worse than no role at all:
      // a screen reader announces a table and then finds no rows and no cells.
      // Either the semantics are complete or the attribute goes.
      const table = el('div', 'pr-manifest');
      table.setAttribute('role', 'table');
      table.setAttribute('aria-label', `What is on ${it.name}`);
      for (const r of rows) {
        const tr = el('div', 'pr-mrow');
        tr.setAttribute('role', 'row');
        const mount = el('span', 'pr-mmount', r.mount);
        mount.setAttribute('role', 'rowheader');
        tr.append(mount);
        const mid = el('span', 'pr-mprod');
        mid.setAttribute('role', 'cell');
        mid.append(el('span', 'pr-mbrand', `${r.brand} `));
        mid.append(el('span', 'pr-mmodel', r.model));
        tr.append(mid);
        // The capacity shares a baseline with the PRODUCT, not with the mount
        // label above it — it is a property of the bag, and pairing it with the
        // mount read as though the handlebar roll itself held 14 litres.
        // Figure and unit are separate spans so the figures right-align as a
        // column and the repeated "L" recedes out of the way of comparing them.
        const cap = el('span', 'pr-ml');
        cap.setAttribute('role', 'cell');
        const m = /^([\d.]+)\s*(.*)$/.exec(r.litres);
        if (m) {
          cap.append(el('span', 'pr-ml-v', m[1]));
          if (m[2]) cap.append(el('span', 'pr-ml-u', ` ${m[2]}`));
        } else {
          cap.textContent = r.litres;
        }
        tr.append(cap);
        table.append(tr);
      }
      spec.append(staged(table));
    }

    const actions = el('div', 'pr-actions');
    const take = el('button', 'pr-btn is-primary');
    take.type = 'button';
    take.append(el('span', null, kind === 'loadouts' ? 'Build on this' : 'Make it mine'));
    take.onclick = () => onAdopt?.(it);
    actions.append(take);
    spec.append(staged(actions));

    // Re-run the stagger for the new rig only when it was a deliberate step;
    // the first paint is staged by the shell's own load-in.
    if (!instant) {
      spec.classList.remove('swap');
      void spec.offsetWidth;
      spec.classList.add('swap');
    }
  }

  const step = (d) => { if (items.length > 1) show(cursor[kind] + d); };

  function onKey(e, view) {
    if (view === 'start' || !items.length) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'Enter' && document.activeElement?.classList?.contains('pr-chip')) {
      /* the chip's own click handles it */
    }
  }

  /** Called when the menu closes: nothing in flight may apply after this. */
  function cancel() { token++; items = []; chips = []; nodes = null; }

  return { render, onKey, cancel };
}
