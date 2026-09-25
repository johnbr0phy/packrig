/**
 * The shot list (SCREENS.md), shot. Every numbered screen, desktop and phone,
 * empty and full where that distinction exists.
 *
 *   node tools/screens.mjs                 # all
 *   node tools/screens.mjs --only S03,S04  # some
 *   node tools/screens.mjs --twice         # shoot each twice and compare pixels
 *
 * Fails (exit 1) on: any page error; horizontal page scroll; and, with
 * --twice, the same input giving different pixels. Output:
 * shots/screens/<id>-<device>-<state>.png and shots/screens/report.json.
 *
 * Each shot is a fresh browser context (clean localStorage, signed out) with
 * `?still` so the scene's clock is held. One live page at a time — software GL
 * starves a second one.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { CHROME } from './lib/chrome.mjs';
import { takeRenderLock } from './lib/renderlock.mjs';

const root = new URL('../', import.meta.url).pathname;
const OUT = root + 'shots/screens/';
mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const twice = argv.includes('--twice');
const SHEET = readFileSync(root + 'data/seed/megafuck.tsv', 'utf8') + '\nGear\t\t302.1\nBike\t\t398\nBags\t\t304\nAll up\t\t1004\n';

const DEVICES = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

// In-page helpers, injected once per page
const HELPERS = `
  window.__w = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__builder = async () => { app.menu?.close?.(); await __w(350); };
  window.__bags = async (id) => {
    const lo = (await fetch('./data/loadouts.json').then((r) => r.json())).find((l) => l.id === id);
    app.__applyRig({ ...lo.rig, pack: undefined });
  };
  window.__mine = async () => {           // the owner's list, in MY locker
    await __builder();
    await __bags('megafuck');
    await app.pack.gearReady;
    await app.pack.importText(window.__SHEET, { name: 'Megafuck' });
    app.packUI.setMode('gear');
  };
  window.__click = (sel, text) => {
    const n = [...document.querySelectorAll(sel)].find((x) => !text || x.textContent.includes(text));
    if (!n) throw new Error('no ' + sel + ' ' + (text || ''));
    n.click();
  };
`;

// id, state, setup (runs in the page), note
const SCREENS = [
  ['S01', 'full', `await __w(600);`],
  ['S02', 'empty', `await __builder(); app.packUI.setMode('gear'); await app.packUI.openQuick(); await __w(1500);`],
  ['S02', 'full', `await __builder(); app.packUI.setMode('gear'); await app.packUI.openQuick(); await __w(800); for (const l of ['Tent','Sleeping mat','Stove & gas','Rain jacket']) __click('.pkg-tile', l); await __w(1200);`],
  ['S03', 'empty', `await __builder(); await __bags('first-overnighter'); app.packUI.setMode('gear'); await __w(800);`],
  ['S03', 'full', `await __mine(); await __w(2500);`],
  ['S04', 'empty', `await __builder(); await __bags('first-overnighter'); app.packUI.setMode('gear'); await __w(400); app.ui.setSelected('seatpack'); app.focus?.setSelected?.('seatpack'); await __w(1500);`],
  ['S04', 'full', `await __mine(); await __w(500); app.ui.setSelected('seatpack'); app.focus?.setSelected?.('seatpack'); await __w(2500);`],
  ['S05', 'full', `await __builder(); await __bags('first-overnighter'); app.packUI.setMode('gear'); await app.pack.gearReady; const it = app.pack.add({ name: 'Tent poles', g: 400, a: 'pole_bundle', d: [55, 5, 5] }, 'toptube'); await __w(300); app.ui.setSelected('toptube'); app.focus?.setSelected?.('toptube'); await __w(2000);`],
  ['S06', 'full', `await __mine(); await __w(400); const u = app.pack.state.locker.items.find((i) => i.name === 'Sleeping Bag').uid; app.packUI.gear && document.querySelector('.pkg-item[data-uid="' + u + '"]').click(); await __w(1800);`],
  ['S07', 'empty', `await __builder(); await __bags('first-overnighter'); app.packUI.setMode('gear'); await app.packUI.openLocker(); await __w(2500);`],
  ['S07', 'full', `await __mine(); await __w(300); await app.packUI.openLocker({ query: 'stove' }); await __w(2500);`],
  ['S08', 'full', `await __builder(); app.packUI.setMode('gear'); await app.packUI.openLocker(); await __w(600); __click('.pkg-lfoot .pkg-btn', 'Add your own'); await __w(800);`],
  ['S09', 'full', `await __mine(); app.pack.duplicate(); app.pack.rename(app.pack.active().id, 'Cuba'); await __w(300); __click('.pkg-loadout'); await __w(1500);`],
  ['S10', 'full', `await __mine(); app.pack.duplicate(); app.pack.rename(app.pack.active().id, 'Cuba'); const st = app.pack.state; for (const n of ['Chair', 'Tent - YMG 1P Cirriform', 'Therm-a-Rest Compressible Pillow']) app.pack.place(st.locker.items.find((i) => i.name === n).uid, 'home'); await __w(300); __click('.pkg-loadout'); await __w(700); __click('.pkg-los .pkg-btn', 'Compare'); await __w(1500);`],
  ['S11', 'empty', `await __builder(); app.packUI.setMode('gear'); app.packUI.openImport(); await __w(1200);`],
  ['S11', 'full', `await __builder(); app.packUI.setMode('gear'); app.packUI.openImport(); await __w(600); const ta = document.querySelector('.pkg-ta'); ta.value = window.__SHEET; ta.dispatchEvent(new Event('input')); await __w(1800);`],
  ['S12', 'full', `await __builder(); await app.packUI.openExample(); await __w(3000);`],
  ['S13', 'full', `await __builder(); await __bags('first-overnighter'); app.packUI.setMode('gear'); await app.pack.gearReady; for (const id of ['tent-1p','sleeping-bag','mat-inflate','stove','gas-100','toaks-750','rain-jacket','puffy-synth','food-day','first-aid-kit','headlamp']) app.pack.add({ ref: id }, 'home'); await __w(300); __click('.pkg-suggest'); await __w(2500);`],
  ['S14', 'full', `await __builder(); await __bags('megafuck'); app.packUI.setMode('gear'); await app.pack.gearReady; for (const id of ['tent-2p','gas-450','pot-alu-1l']) app.pack.add({ ref: id }, 'forkR'); await __w(2200);`],
  ['S15', 'full', `await __mine(); app.pack.setUnit('imperial'); await __w(2200);`],
  ['S17', 'full', `await __w(400); app.menu.go('loadouts'); await __w(2500);`],
];

await takeRenderLock('screens');
// decode an 8-bit RGB/RGBA PNG (what Chrome writes) with node's zlib
function pixelsOf(_p, buf) {
  let o = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; }
    if (type === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat)), out = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const pr = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1
        : (() => { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; })();
      cur[i] = (line[i] + pr) & 255;
    }
    for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) out[(y * w + x) * 4 + k] = cur[x * bpp + k];
    prev = cur;
  }
  return out;
}
function diffCount(a, b) {
  if (!a || !b || a.length !== b.length) return -1;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 8) n++;
  }
  return n;
}

const report = [];
let fails = 0;
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
async function shoot(id, state, device, setup, suffix = '') {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL|net::ERR/.test(m.text())) errs.push(m.text()); });
  await p.setViewport(DEVICES[device]);
  await p.goto('http://localhost:8735/?still', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('window.__READY_DONE', { timeout: 120000 });
  await p.evaluate(`window.__SHEET = ${JSON.stringify(SHEET)};` + HELPERS);
  await p.addStyleTag({ content: '*{caret-color:transparent!important}' });   // a blinking caret is not a difference
  try { await p.evaluate(`(async () => { ${setup} })()`); } catch (e) { errs.push('setup: ' + e.message); }
  // thumbnails draw a few per frame; wait for the queue so two runs match
  await p.evaluate(async () => {
    const { thumbsPending } = await import('./src/pack/ui/thumbs.js');
    // lazy thumbnails queue only once seen, so also wait for every visible
    // empty one to be filled
    const emptyVisible = () => [...document.querySelectorAll('img.pkg-thumb, img.pkg-tile-img, img.pkg-ihero-img')].some((im) => {
      if (im.getAttribute('src')) return false;
      const r = im.getBoundingClientRect();
      return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    });
    for (let i = 0; i < 600 && (thumbsPending() || emptyVisible()); i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 300));
  }).catch((e) => errs.push('thumbs: ' + e.message));
  // the camera eases (damping, focus glides): shoot once it has stopped, or
  // two runs catch it a sub-pixel apart and every edge differs
  await p.evaluate(async () => {
    const key = () => [...app.camera.position.toArray(), ...(app.controls?.target?.toArray() || [])].map((v) => v.toFixed(4)).join();
    let last = key(), still = 0;
    for (let i = 0; i < 150 && still < 4; i++) {
      await new Promise((r) => setTimeout(r, 120));
      const k = key();
      still = k === last ? still + 1 : 0;
      last = k;
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }).catch((e) => errs.push('settle: ' + e.message));
  const scroll = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const file = `${OUT}${id}-${device}-${state}${suffix}.png`;
  const buf = await p.screenshot({ path: file });
  const px = pixelsOf(p, buf);
  await ctx.close();
  return { file, errs, scroll, px };
}

for (const [id, state, setup] of SCREENS) {
  if (only && !only.includes(id)) continue;
  for (const device of Object.keys(DEVICES)) {
    const r = await shoot(id, state, device, setup);
    const row = { id, state, device, file: r.file.replace(root, ''), errs: r.errs, scroll: r.scroll };
    if (twice) {
      const r2 = await shoot(id, state, device, setup, '-2');
      // decoded pixels, not bytes: software GL rasterises a few dozen sub-pixel
      // spoke edges differently run to run; more than 100 pixels (~0.01%) off
      // by more than 8/255 is a real difference
      const off = diffCount(r.px, r2.px);
      row.diffPx = off;
      row.same = off >= 0 && off <= 100;
      if (!row.same) { fails++; }
    }
    if (r.errs.length || r.scroll > 0) fails++;
    report.push(row);
    console.log(`${r.errs.length || r.scroll > 0 || row.same === false ? '✗' : '✓'} ${id} ${device} ${state}${r.scroll > 0 ? `  horizontal scroll ${r.scroll}px` : ''}${row.same === false ? `  pixels differ between runs (${row.diffPx})` : row.diffPx != null ? `  (${row.diffPx} px differ)` : ''}${r.errs.length ? '  ' + r.errs.join(' | ').slice(0, 300) : ''}`);
  }
}
await b.close();
writeFileSync(OUT + 'report.json', JSON.stringify(report, null, 1));
console.log(fails ? `\n${fails} problems` : '\nall clean');
process.exit(fails ? 1 : 0);
