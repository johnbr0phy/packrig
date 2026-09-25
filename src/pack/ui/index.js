/**
 * The packing UI, assembled. Called once from ui.js with the pieces of the
 * existing shell it plugs into — the rig panel, the toast, the bag sheet —
 * so packing lives inside the design system rather than beside it.
 */
import { initGearPanel } from './panel.js';
import { initLocker } from './locker.js';
import { initItemSheet } from './item.js';
import { initLoadouts } from './loadouts.js';
import { initQuick } from './quick.js';
import { initDrag } from './drag.js';
import { renderInside } from './inside.js';
import { parsePlace } from '../model.js';

export function initPackUI(app, { panel, notify, selectBag }) {
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
    afterPack: (res) => showPacked(res),
    afterImport: () => showPacked(),
  });
  const gear = initGearPanel(app, { ...hooks, panel });

  /** After a pack or an import: Gear view, every bag with something in it opened. */
  function showPacked() {
    gear.setMode('gear');
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
    gear.setMode('gear');
    setTimeout(showPacked, 50);
  }

  // ---- the bag sheet's "Inside" block ------------------------------------------------
  let sheetSlot = null;
  let insideHost = null;
  /** Called by bagsheet.js while painting; returns the block or null. */
  function insideFor(slot, host) {
    const st = P.state;
    const has = st.locker.items.some((it) => parsePlace(st.loadout.place[it.uid]).slot === slot);
    if (gear.mode !== 'gear' && !has) { insideHost = null; return null; }
    if (sheetSlot && sheetSlot !== slot) P.closeBag(sheetSlot);
    sheetSlot = slot;
    P.openBag(slot);
    insideHost = host;
    return renderInside(app, slot, hooks);
  }
  function sheetClosed() {
    if (sheetSlot && gear.mode !== 'gear') P.closeBag(sheetSlot);
    sheetSlot = null;
    insideHost = null;
  }
  P.subscribe(() => {
    if (!insideHost?.isConnected || !sheetSlot) return;
    const old = insideHost.querySelector('.pkg-inside');
    if (old) old.replaceWith(renderInside(app, sheetSlot, hooks));
  });

  return {
    tabs: gear.tabs, section: gear.section, gear,
    insideFor, sheetClosed,
    openQuick: () => quick.open(), openLocker: (o) => locker.open(o), openImport: () => loadouts.openImport(),
    openExample,
    setMode: (m) => gear.setMode(m),
  };
}
