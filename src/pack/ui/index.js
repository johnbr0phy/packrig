/**
 * The packing UI, assembled. Called once from ui.js. Packing is not a mode
 * any more: the rig panel shows every bag with what is in it, and these are
 * the sheets it opens (my kit, an item, trips, import) plus the "inside"
 * block at the top of a bag's sheet.
 */
import { initLocker } from './locker.js';
import { initItemSheet } from './item.js';
import { initLoadouts } from './loadouts.js';
import { initQuick, QUICK } from './quick.js';
import { initDrag } from './drag.js';
import { renderInside } from './inside.js';
import { parsePlace } from '../model.js';
import { placeWords } from './labels.js';

export function initPackUI(app, { notify, selectBag }) {
  const P = app.pack;
  const hooks = { notify };
  const drag = initDrag(app, { notify });
  hooks.drag = drag;
  const locker = initLocker(app, hooks);
  const item = initItemSheet(app, hooks);
  const loadouts = initLoadouts(app, hooks);
  const quick = initQuick(app, hooks);
  Object.assign(hooks, {
    openLocker: (o) => locker.open(o),
    openItem: (uid) => item.open(uid),
    openLoadouts: () => loadouts.open(),
    openImport: () => loadouts.openImport(),
    openQuick: () => quick.open(),
    openBagSheet: (slot) => selectBag(slot),
    openExample: () => openExample(),
    // after packing or importing, the list is the news: show it
    afterPack: () => { showPacked(); app.rigPanel?.detent('half'); },
    afterImport: () => { showPacked(); app.rigPanel?.detent('half'); },
  });

  // The packing layer (items outside bags, the centre of mass) is always on
  // now that there is no Gear tab to switch it on with.
  P.setShowing(true);

  /** After a pack or an import: every bag with something in it, opened. */
  function showPacked() {
    const st = P.state;
    const slots = new Set();
    for (const it of st.locker.items) {
      const p = parsePlace(st.loadout.place[it.uid]);
      if (p.loc === 'bag' && app.bags.equipped[p.slot]) slots.add(p.slot);
    }
    for (const s of slots) P.openBag(s);
    app.focus?.clearFocus?.();
  }

  /** The owner's own sheet, packed on its bike, as something to look at. */
  async function openExample() {
    const lo = (await fetch('./data/loadouts.json').then((r) => r.json()).catch(() => [])).find((l) => l.id === 'megafuck');
    if (!lo) return;
    app.__applyRigAs?.(lo.rig, 'gallery');
    setTimeout(showPacked, 50);
  }

  // ---- quick tiles in the rig panel: tap to bring, tap again to leave ----------------
  const tileUids = new Map();   // tile label -> [uid]
  function quickHas(q) {
    const uids = tileUids.get(q.label);
    if (!uids?.length) return null;
    const st = P.state;
    const code = st.loadout.place[uids[0]];
    if (code === undefined) return null;
    return code === 'home' ? 'Staying home' : placeWords(code);
  }
  async function quickToggle(q) {
    await P.gearReady;
    const had = tileUids.get(q.label);
    if (had?.length && P.state.loadout.place[had[0]] !== undefined) {
      for (const u of had) P.unplace(u);
      tileUids.delete(q.label);
      return;
    }
    const uids = quick.addTile(q);
    tileUids.set(q.label, uids);
    const res = P.suggest({ only: uids });
    showPacked();
    const where = res?.place?.[uids[0]];
    notify?.(where && where !== 'home' ? `${q.label} → ${placeWords(where).toLowerCase()}` : `${q.label}: no bag has room. It’s staying home for now.`,
      () => { for (const u of uids) P.remove(u); tileUids.delete(q.label); });
  }

  function packUids(uids) {
    const st = P.state;
    const before = JSON.stringify(st.loadout.place);
    const res = P.suggest({ only: uids });
    showPacked();
    const moved = Object.keys(res?.place || {}).length - (res?.homeless?.length || 0);
    notify?.(`Packed ${moved}${res?.homeless?.length ? `; ${res.homeless.length} won’t fit anywhere` : ''}`, () => {
      const lo = P.active();
      if (lo) { lo.place = JSON.parse(before); P.recompute(); }
    });
  }

  function copyView() {
    const res = P.copyView();
    notify?.(res?.missing?.length ? `Copied. ${res.missing.length} things are marked to get.` : 'Copied into your kit.');
  }

  // ---- the bag sheet's "Inside" block -------------------------------------------------
  let sheetSlot = null;
  let insideHost = null;
  function insideFor(slot) {
    if (sheetSlot && sheetSlot !== slot) P.closeBag(sheetSlot);
    sheetSlot = slot;
    P.openBag(slot);
    const node = renderInside(app, slot, hooks);
    insideHost = node;
    return node;
  }
  function sheetClosed() {
    sheetSlot = null;
    insideHost = null;
  }
  P.subscribe(() => {
    if (!insideHost?.isConnected || !sheetSlot) return;
    const next = renderInside(app, sheetSlot, hooks);
    insideHost.replaceWith(next);
    insideHost = next;
  });

  return {
    drag,
    insideFor, sheetClosed,
    openQuick: () => quick.open(), openLocker: (o) => locker.open(o), openImport: () => loadouts.openImport(),
    openItem: (uid) => item.open(uid), openTrips: () => loadouts.open(), openCompare: () => loadouts.openCompare?.(),
    openExample, quickHas, quickToggle, packUids, copyView, QUICK,
    // compatibility with tools written against the Bags | Gear switch
    setMode: () => {},
    get gear() { return { mode: 'gear' }; },
  };
}
