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
window.__gearMode = async () => {};
window.__mine = async () => {           // the owner's list, in MY kit
  await __builder();
  await __bags('megafuck');
  await app.pack.gearReady;
  await app.pack.importText(window.__SHEET, { name: 'Megafuck' });
};
window.__mounts = async () => { __click('button', 'Choose from a list'); };
window.__catalogue = async (slot) => {
  const place = { seatpack: 'Seat pack', barroll: 'Handlebar', framebag_half: 'Frame bag', toptube: 'Top tube' }[slot];
  document.querySelector(`.mount-ring[aria-label^="${place}"]`).click();
};
window.__product = async (slot) => { app.ui.setSelected(slot); };
window.__inside = window.__product;
window.__item = async (name) => {
  const u = app.pack.state.locker.items.find((i) => i.name === name).uid;
  document.querySelector('.rg-item[data-uid="' + u + '"]').click();
};
window.__trips = async () => { __click('.rg-trip'); };
window.__compare = async () => { await __trips(); await __w(700); __click('button', 'Compare'); };
window.__share = async () => { __click('.rg-share'); };
window.__settings = async () => { __click('.tb-more'); };
window.__suggest = async () => { __click('.rg-body button', 'Pack these'); };
// the bike's visible vertical extent / viewport height, above any bottom sheet
window.__frac = () => {
  const W = innerWidth, H = innerHeight, T = window.__THREE;
  app.camera.updateMatrixWorld(true);
  let occ = H;
  const sh = document.querySelector('.sheet.open') || document.querySelector('.panel');
  if (sh && W <= 560) occ = Math.min(occ, sh.getBoundingClientRect().top);
  let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity; const v = new T.Vector3();
  app.bike.group.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position || (o.material?.depthWrite === false && o.material?.isMeshBasicMaterial)) return;
    for (let q = o; q; q = q.parent) if (!q.visible) return;
    const pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 300));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).project(app.camera);
      const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H;
      y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    }
  });
  return { frac: +((Math.min(occ, y1) - Math.max(0, y0)) / H).toFixed(3), x0: Math.round(x0), x1: Math.round(x1), y0: Math.round(y0), y1: Math.round(y1), sheetTop: Math.round(occ) };
};
