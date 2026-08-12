/**
 * Browse — one view, two sources: the curated Loadouts and your own saved rigs.
 *
 * THERE WAS A THIRD. A public Gallery of everyone else's rigs, on this same
 * view. It is out, on the owner's call — "it adds too much complexity to the
 * pages" — and he is right about what it cost: a second remote query with its
 * own composite index, a fallback that quietly showed you your OWN rigs when
 * nothing had been published, a publish flow with a display-name prompt and a
 * consent line, and a third entry on a front page that should offer two things.
 * None of it earned that while the thing being published had nowhere worth
 * appearing. `rigstore.js` keeps `gallery()` and `setPublished()` — the
 * documents already carry the field and FIREBASE.md already describes the
 * rules — but nothing calls them, and bringing it back is a UI job.
 *
 * WHY ONE VIEW FOR THE TWO THAT REMAIN. Reading a curated loadout and reading
 * a bike you built last week are the same act: look at a built bike, find out
 * what is on it, decide whether you want it. v1 had two arrows and a name
 * plate — which told you a rig was called "Full tour" and had "7 bags ·
 * 75.0 L", and nothing whatever about what those seven bags WERE. That is a
 * slideshow, and a slideshow of a thing you cannot read is boring by the third
 * frame.
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
 * THREE SOURCES NOW, NOT TWO. `rigs` is your own saved bikes, and it is the
 * same view for the same reason: a saved rig is a built bike you want to look
 * at and read. It differs only in what you can DO with one — it is yours, so
 * the actions are update, share, publish and delete rather than "make it mine".
 *
 *   initBrowse(app, { onAdopt, onDirty }) -> { render(kind), onKey }
 */

import { icon } from './icons.js';
import { applyRig, encodeRig, findProduct } from '../../rig.js';
import { SLOTS } from '../../bags/slots.js';
import { litersOf, modelTitle } from '../product.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** Prose and chips: "12 L", "5.8 L" — a trailing zero is noise in a sentence. */
const num = (v) => (Math.round(Number(v) * 10) / 10).toFixed(1).replace(/\.0$/, '');
/** Columns: "12.0 L", "5.8 L" — the decimal point is the alignment. */
const fixed1 = (v) => {
  const n = Number(v);
  // A harness carries dry bags sold separately: no capacity, rather than zero.
  if (!Number.isFinite(n) || n === 0) return '—';
  return `${n.toFixed(1)} L`;
};

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
      // One decimal, always, in the MANIFEST. `litersOf` drops a trailing zero,
      // which is right in prose and wrong in a column: right-aligned, "5.8"
      // then puts its tenths under "12"'s units and the column stops being a
      // column. A spec sheet aligns on the decimal point.
      litres: fixed1(hit.product.liters),
      raw: Number(hit.product.liters) || 0,
    });
  }
  rows.sort((a, b) => {
    const ia = MOUNT_ORDER.indexOf(a.slot); const ib = MOUNT_ORDER.indexOf(b.slot);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return rows;
}

/** "today" / "3 days ago" / a date — for a saved rig's own timestamp. */
function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  const days = Math.floor((Date.now() - d) / 86400000);
  if (days <= 0) return 'saved today';
  if (days === 1) return 'saved yesterday';
  if (days < 30) return `saved ${days} days ago`;
  return `saved ${d.toLocaleDateString()}`;
}

export function initBrowse(app, {
  onAdopt, onDirty, isLive, onEmptyBuild, onNew, onRefresh, notify, getWorking,
} = {}) {
  // Per-kind cursor, so stepping out to the start screen and back into the
  // gallery puts you where you were rather than at rig one.
  const cursor = { loadouts: 0, rigs: 0 };
  let kind = 'loadouts';
  let items = [];
  let nodes = null;
  /*
   * Every load carries the token that was current when it started, and applies
   * nothing unless that token is still current AND the menu is still open.
   *
   * Comparing the wrapper element was not enough. Closing the menu leaves
   * `nodes.wrap` pointing at the very node the closure captured — detached,
   * but still equal — so a request that resolved a second after the user
   * pressed Close passed the guard and mounted somebody else's rig onto the
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

  /** Your own saved rigs. Newest first, straight off the store. */
  async function loadMine() {
    let rows = [];
    try { rows = (await app.rigs?.list?.()) || []; } catch { rows = []; }
    return rows.map((r) => {
      const man = manifestOf(app, r.rig);
      return {
        id: r.id,
        name: r.name || 'Untitled rig',
        kicker: when(r.updated_at),
        note: '',
        tags: [...new Set(man.map((m) => m.brand))].slice(0, 4),
        stats: {
          litres: Math.round(man.reduce((n, m) => n + m.raw, 0) * 10) / 10,
          bags: man.length,
          makers: new Set(man.map((m) => m.brand)).size,
        },
        rig: r.rig,
        row: r,
        own: true,
      };
    });
  }

  // ---- the view ----------------------------------------------------------

  function render(nextKind) {
    kind = nextKind;
    const mine = ++token;
    // The previous view's rigs are NOT this view's rigs. Leaving them in place
    // during the load meant an arrow key pressed in that window stepped through
    // your own rigs while the header said Loadouts, and mounted the wrong one.
    items = [];
    chips = [];
    const wrap = el('div', 'pr-browse');

    const spec = el('div', 'pr-spec');
    const railWrap = el('div', 'pr-railwrap');

    wrap.append(spec, railWrap);

    nodes = { wrap, spec, railWrap };

    spec.append(el('p', 'pr-loading',
      kind === 'rigs' ? 'Finding your rigs…' : 'Loading loadouts…'));

    (kind === 'rigs' ? loadMine() : loadLoadouts())
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
    e.append(el('h2', 'pr-title', kind === 'rigs' ? 'No saved rigs yet' : 'No loadouts'));
    if (kind !== 'rigs') {
      e.append(el('p', 'pr-note',
        'The curated rigs did not load. The builder still works — everything in the catalogue is there.'));
    }
    // An empty state without its verb is a dead end, and this is the screen most
    // likely to be somebody's first: one of three doors on the start screen
    // opened onto a sentence and nothing to press.
    const act = el('div', 'pr-actions');
    const go = el('button', 'pr-btn is-primary');
    go.type = 'button';
    go.append(el('span', null, 'Build a rig'));
    go.onclick = () => onEmptyBuild?.();
    act.append(go);
    e.append(act);
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
      body.append(el('span', 'pr-chip-l',
        it.stats.addedW != null
          ? `${num(it.stats.litres)} L · +${it.stats.addedW} W`
          : `${num(it.stats.litres)} L`));
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

    if (it.kicker) spec.append(staged(el('p', 'pr-kicker', it.kicker)));
    spec.append(staged(el('h2', 'pr-title', it.name)));
    if (it.note) spec.append(staged(el('p', 'pr-note', it.note)));

    // Three numbers, read as a group. Tabular figures so the litre column of
    // two rigs compared one after the other does not jump sideways.
    const stats = el('div', 'pr-figs');
    const fig = (v, k) => {
      const f = el('div', 'pr-fig');
      f.append(el('b', 'pr-fig-v', v), el('span', 'pr-fig-k', k));
      return f;
    };
    stats.append(fig(Number(it.stats.litres).toFixed(1), 'litres'));
    stats.append(fig(String(it.stats.bags), it.stats.bags === 1 ? 'bag' : 'bags'));
    /*
     * The aero cost, measured rather than asserted: tools/measure-loadouts.mjs
     * mounts each of these rigs in a browser, runs the wind tunnel's GPU
     * measurement over a yaw sweep, and bakes the result into loadouts.json.
     *
     * It is here because litres alone cannot start an argument — "Aero, 8.7 L"
     * against "The Expedition, 53.6 L" is a statement about volume, and the
     * question anyone actually has is what the volume costs. +3 W against
     * +28 W is that question answered.
     */
    if (it.stats.addedW != null) {
      const f = fig(`+${it.stats.addedW}`, 'watts');
      f.title = `${it.stats.grade} — measured in the wind tunnel at ${it.stats.watts} W to hold 28 km/h`;
      stats.append(f);
    } else {
      stats.append(fig(String(it.stats.makers), it.stats.makers === 1 ? 'maker' : 'makers'));
    }
    spec.append(staged(stats));

    if (it.stats.grade) {
      const g = el('p', 'pr-grade');
      g.append(el('span', 'pr-grade-k', 'Wind tunnel'));
      g.append(el('span', 'pr-grade-v', it.stats.grade));
      spec.append(staged(g));
    }

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
    take.append(el('span', null, kind === 'rigs' ? 'Open this rig' : 'Build on this'));
    take.onclick = () => onAdopt?.(it);
    actions.append(take);
    if (kind === 'rigs') for (const b of ownActions(it)) actions.append(b);
    spec.append(staged(actions));

    // Re-run the stagger for the new rig only when it was a deliberate step;
    // the first paint is staged by the shell's own load-in.
    if (!instant) {
      spec.classList.remove('swap');
      void spec.offsetWidth;
      spec.classList.add('swap');
    }
  }

  /**
   * What you can do to a rig that is YOURS. Everything the account sheet used
   * to carry, on the screen where the rig actually is.
   *
   * `Update` is the one that needs saying out loud. This view browses by
   * mounting each rig on the bike, so "the bike as it is now" is the rig you
   * are reading — writing that back would be a no-op. What it means here is
   * the build you walked in with, which the menu stashed on the way in, and
   * the button only exists while there is one and it differs.
   */
  function ownActions(it) {
    const out = [];
    const store = app.rigs;
    const row = it.row || {};
    const act = (label, cls, run) => {
      const b = el('button', `pr-btn${cls ? ' ' + cls : ''}`);
      b.type = 'button';
      b.append(el('span', null, label));
      b.onclick = run;
      return b;
    };
    const after = (msg) => { notify?.(msg); onRefresh?.(); };

    const working = getWorking?.();
    const hasWork = (working?.bags?.length || 0) > 0
      && JSON.stringify(working.bags) !== JSON.stringify(it.rig?.bags || []);
    if (hasWork && row.id) {
      out.push(act('Update from your build', '', async () => {
        try { await store.update(row.id, { name: it.name, rig: working }); }
        catch (e) { notify?.(e?.message || 'Could not update that rig'); return; }
        after(`Updated “${it.name}”`);
      }));
    }

    out.push(act('Share', '', async () => {
      // A frozen snapshot: the link carries the rig, so later edits never
      // change what somebody else already opened.
      const url = `${location.origin}${location.pathname}?r=${encodeRig(it.rig)}`;
      notify?.(await copyText(url) ? 'Link copied' : 'Could not copy that link');
    }));

    // No Publish. There is nowhere for a published rig to appear while the
    // gallery is out, and a button that sends your bike somewhere nobody can
    // look at is worse than no button. `rigstore.setPublished` is still there
    // for whenever it comes back.

    if (row.id) {
      // No dialogue. One press arms it, a second does it, and it disarms
      // itself — the same pattern `Clear rig` uses in the builder.
      const del = act('Delete', 'is-bad', async () => {
        if (del.dataset.armed !== '1') {
          del.dataset.armed = '1';
          del.firstChild.textContent = 'Really?';
          setTimeout(() => {
            if (!del.isConnected) return;
            del.dataset.armed = '0';
            del.firstChild.textContent = 'Delete';
          }, 3000);
          return;
        }
        try { await store.remove(row.id); }
        catch (e) { notify?.(e?.message || 'Could not delete that rig'); return; }
        after(`Deleted “${it.name}”`);
      });
      out.push(del);
    }
    // The way OUT of the list, on the list. Somebody arriving at their rigs
    // and wanting a new one should not have to go back to the start screen to
    // find the door they came through.
    out.push(act('Build a rig', 'is-new', () => onNew?.()));
    return out;
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      // The clipboard API needs a secure context — fall back to a hidden field.
      try {
        const ta = document.createElement('textarea');
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
