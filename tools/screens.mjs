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
const argv = process.argv.slice(2);
const OUT = root + (argv.includes('--out') ? argv[argv.indexOf('--out') + 1].replace(/\/?$/, '/') : 'shots/screens/');
mkdirSync(OUT, { recursive: true });
const onlyDevice = argv.includes('--device') ? argv[argv.indexOf('--device') + 1] : null;
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const twice = argv.includes('--twice');
const SHEET = readFileSync(root + 'data/seed/megafuck.tsv', 'utf8') + '\nGear\t\t302.1\nBike\t\t398\nBags\t\t304\nAll up\t\t1004\n';

const DEVICES = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

const HELPERS = readFileSync(root + 'tools/lib/screen-helpers.js', 'utf8');

// The shot list: [id, state, setup]. IDs are SCREENS.md's. `setup` runs in
// the page after boot, against whatever API the app has at the time: the
// setups are versioned with the app, so the "before" run used the old ones.
const SCREENS = [
  ['S01-start', 'full', `await __w(600);`],
  ['S02-setup', 'full', `app.menu.go('setup'); await __w(1200);`],
  ['S03-gallery', 'full', `await __w(300); app.menu.go('loadouts'); await __w(2500);`],
  ['S04-builder', 'empty', `await __builder(); await __w(900);`],
  ['S05-mounts', 'empty', `await __builder(); await __mounts(); await __w(1500);`],
  ['S06-catalogue', 'full', `await __builder(); await __catalogue('seatpack'); await __w(2500);`],
  ['S07-product', 'full', `await __builder(); await __bags('first-overnighter'); await __w(300); await __product('seatpack'); await __w(2500);`],
  ['S08-rig', 'full', `await __builder(); await __bags('first-overnighter'); await __w(1500);`],
  ['S08-rig', 'packed', `await __mine(); await __w(2500);`],
  ['S09-inside', 'empty', `await __builder(); await __bags('first-overnighter'); await __gearMode(); await __w(400); await __inside('seatpack'); await __w(1500);`],
  ['S09-inside', 'full', `await __mine(); await __w(500); await __inside('seatpack'); await __w(2500);`],
  ['S10-wontfit', 'full', `await __builder(); await __bags('first-overnighter'); await __gearMode(); await app.pack.gearReady; app.pack.add({ name: 'Tent poles', g: 400, a: 'pole_bundle', d: [55, 5, 5] }, 'toptube'); await __w(300); await __inside('toptube'); await __w(2000);`],
  ['S11-kit', 'empty', `await __builder(); await __bags('first-overnighter'); await __gearMode(); await app.packUI.openLocker(); await __w(2500);`],
  ['S11-kit', 'full', `await __mine(); await __w(300); await app.packUI.openLocker({ query: 'stove' }); await __w(2500);`],
  ['S12-custom', 'full', `await __builder(); await __gearMode(); await app.packUI.openLocker(); await __w(600); __click('button', 'Add your own'); await __w(800);`],
  ['S13-quick', 'empty', `await __builder(); await __gearMode(); await app.packUI.openQuick(); await __w(1500);`],
  ['S13-quick', 'full', `await __builder(); await __gearMode(); await app.packUI.openQuick(); await __w(800); for (const l of ['Tent','Sleeping mat','Stove & gas','Rain jacket']) __click('.pkg-tile', l); await __w(1200);`],
  ['S14-item', 'full', `await __mine(); await __w(400); await __item('Sleeping Bag'); await __w(1800);`],
  ['S15-trips', 'full', `await __mine(); app.pack.duplicate(); app.pack.rename(app.pack.active().id, 'Cuba'); await __w(300); await __trips(); await __w(1500);`],
  ['S16-compare', 'full', `await __mine(); app.pack.duplicate(); app.pack.rename(app.pack.active().id, 'Cuba'); const st = app.pack.state; for (const n of ['Chair', 'Tent - YMG 1P Cirriform', 'Therm-a-Rest Compressible Pillow']) app.pack.place(st.locker.items.find((i) => i.name === n).uid, 'home'); await __w(300); await __compare(); await __w(1500);`],
  ['S17-import', 'empty', `await __builder(); await __gearMode(); app.packUI.openImport(); await __w(1200);`],
  ['S17-import', 'full', `await __builder(); await __gearMode(); app.packUI.openImport(); await __w(600); const ta = document.querySelector('textarea'); ta.value = window.__SHEET; ta.dispatchEvent(new Event('input')); await __w(1800);`],
  ['S18-shared', 'full', `await __builder(); await app.packUI.openExample(); await __w(3000);`],
  ['S19-share', 'full', `await __mine(); await __w(300); await __share(); await __w(1200);`],
  ['S20-account', 'full', `await __builder(); await __bags('first-overnighter'); await __w(300); app.account.open('signin'); await __w(1200);`],
  ['S21-tunnel', 'full', `await __builder(); await __bags('first-overnighter'); await __w(300); await app.openWindTunnel(); await __w(6000);`],
  ['S22-settings', 'full', `await __builder(); await __bags('first-overnighter'); await __w(300); await __settings(); await __w(1200);`],
  ['S23-units', 'full', `await __mine(); app.pack.setUnit('imperial'); await __w(2200);`],
  ['S24-suggest', 'full', `await __builder(); await __bags('first-overnighter'); await __gearMode(); await app.pack.gearReady; for (const id of ['tent-1p','sleeping-bag','mat-inflate','stove','gas-100','toaks-750','rain-jacket','puffy-synth','food-day','first-aid-kit','headlamp']) app.pack.add({ ref: id }, 'home'); await __w(300); await __suggest(); await __w(2500);`],
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

// What each shot measures, beyond pixels (UX-WRITEUP's numbers come from here):
//   bike      vertical extent of the bike's visible silhouette / viewport height,
//             clipped to the space above any bottom sheet
//   fonts     every computed font size carrying visible text, with counts
//   small     touch targets under 44x44 (phone) that are visible
//   unlabelled  buttons with no text and no aria-label
const AUDIT = `(() => {
  const W = innerWidth, H = innerHeight, THREE = window.__THREE;
  let occ = H;
  for (const n of document.querySelectorAll('#ui-root *')) {
    const cs = getComputedStyle(n);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
    if (cs.visibility === 'hidden' || +cs.opacity < 0.5 || n.offsetParent === null && cs.position !== 'fixed') continue;
    const r = n.getBoundingClientRect();
    if (r.width > W * 0.8 && r.bottom >= H - 2 && r.top > H * 0.2 && r.height > 40 && getComputedStyle(n).backgroundColor !== 'rgba(0, 0, 0, 0)') occ = Math.min(occ, r.top);
  }
  let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
  const v = new THREE.Vector3();
  app.camera.updateMatrixWorld();
  app.bike.group.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position) return;
    let vis = true; for (let q = o; q; q = q.parent) if (!q.visible) { vis = false; break; }
    if (!vis) return;
    const pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 300));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).project(app.camera);
      if (v.z > 1) continue;
      const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H;
      if (x < 0 || x > W) continue;
      y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    }
  });
  const top = Math.max(0, y0), bot = Math.min(occ, y1);
  const bike = { frac: +(Math.max(0, bot - top) / H).toFixed(3), clippedX: x0 < 0 || x1 > W, sheetTop: Math.round(occ) };
  const fonts = {};
  const walk = document.createTreeWalker(document.getElementById('ui-root'), NodeFilter.SHOW_TEXT);
  for (let t; (t = walk.nextNode());) {
    if (!t.textContent.trim()) continue;
    const e = t.parentElement; if (!e || !e.offsetParent && getComputedStyle(e).position !== 'fixed') continue;
    const r = e.getBoundingClientRect(); if (r.width < 1 || r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue;
    const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    fonts[cs.fontSize] = (fonts[cs.fontSize] || 0) + 1;
  }
  const small = [], unlabelled = [];
  for (const b of document.querySelectorAll('#ui-root button, #ui-root a[href], #ui-root [role=button], #ui-root input, #ui-root select')) {
    const r = b.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue;
    const cs = getComputedStyle(b); if (cs.visibility === 'hidden' || +cs.opacity === 0 || b.closest('[inert]')) continue;
    const name = (b.getAttribute('aria-label') || b.textContent || b.title || '').trim();
    if (!(b.getAttribute('aria-label') || b.textContent.trim() || b.labels?.length || b.placeholder)) unlabelled.push(b.className || b.tagName);
    if (r.width < 44 || r.height < 44) small.push(\`\${(name || b.className).slice(0, 24)} \${Math.round(r.width)}x\${Math.round(r.height)}\`);
  }
  return { bike, fonts, small: small.length, smallList: small.slice(0, 12), unlabelled };
})()`;

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
  const audit = await p.evaluate(AUDIT).catch((e) => ({ error: e.message }));
  const file = `${OUT}${id}-${device}-${state}${suffix}.png`;
  const buf = await p.screenshot({ path: file });
  const px = pixelsOf(p, buf);
  await ctx.close();
  return { file, errs, scroll, px, audit };
}

for (const [id, state, setup] of SCREENS) {
  if (only && !only.some((o) => id === o || id.startsWith(o + '-') || `${id}-${state}` === o)) continue;
  for (const device of Object.keys(DEVICES).filter((d) => !onlyDevice || d === onlyDevice)) {
    const r = await shoot(id, state, device, setup);
    const row = { id, state, device, file: r.file.replace(root, ''), errs: r.errs, scroll: r.scroll, audit: r.audit };
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
writeFileSync(OUT + (only || onlyDevice ? 'report-partial.json' : 'report.json'), JSON.stringify(report, null, 1));
console.log(fails ? `\n${fails} problems` : '\nall clean');
process.exit(fails ? 1 : 0);
