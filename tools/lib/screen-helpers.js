// In-page helpers for tools/screens.mjs and the task scripts: the one place
// that knows how to REACH each screen in the current app. Setups in the shot
// list call these, so a UI change moves this file, not forty setups.
window.__w = (ms) => new Promise((r) => setTimeout(r, ms));
window.__click = (sel, text) => {
  const n = [...document.querySelectorAll(sel)].find((x) => x.offsetParent !== null && (!text || x.textContent.includes(text)))
    || [...document.querySelectorAll(sel)].find((x) => !text || x.textContent.includes(text));
  if (!n) throw new Error('no ' + sel + ' ' + (text || ''));
  n.click();
};
window.__builder = async () => { app.menu?.close?.(); await __w(350); };
window.__bags = async (id) => {
  const lo = (await fetch('./data/loadouts.json').then((r) => r.json())).find((l) => l.id === id);
  app.__applyRig({ ...lo.rig, pack: undefined });
};
window.__gearMode = async () => { app.packUI.setMode?.('gear'); };
window.__mine = async () => {           // the owner's list, in MY kit
  await __builder();
  await __bags('megafuck');
  await app.pack.gearReady;
  await app.pack.importText(window.__SHEET, { name: 'Megafuck' });
  await __gearMode();
};
window.__mounts = async () => { __click('.add-bag'); };
window.__catalogue = async (slot) => {
  await __mounts(); await __w(300);
  const label = window.__SLOTS[slot].label;
  __click('.mount-btn', label);
};
window.__product = async (slot) => { app.ui.setSelected(slot); app.focus?.setSelected?.(slot); };
window.__inside = window.__product;
window.__item = async (name) => {
  const u = app.pack.state.locker.items.find((i) => i.name === name).uid;
  document.querySelector('.pkg-item[data-uid="' + u + '"]').click();
};
window.__trips = async () => { __click('.pkg-loadout'); };
window.__compare = async () => { await __trips(); await __w(700); __click('.pkg-los .pkg-btn', 'Compare'); };
window.__share = async () => { __click('.pkg-share'); };
window.__settings = async () => { __click('.bike-toggle'); };
window.__suggest = async () => { __click('.pkg-suggest'); };
