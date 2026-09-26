/**
 * Is the new UI cheap? 60+ items, 10 open bags, CPU throttled 4x.
 *
 *   node tools/perf.mjs [--device phone|desktop] [--rate 4]
 *
 * Software GL makes the frame itself slow here (the GPU is the CPU), so the
 * number that transfers to a real phone is not the frame time but the part
 * of it the UI spends: the per-frame ticks the new shell added (framing,
 * mount rings, pack animation) and how many style recalcs and layouts the
 * page does while idle and while a bag is opened. Idle should cost nothing.
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { CHROME } from './lib/chrome.mjs';
import { takeRenderLock } from './lib/renderlock.mjs';

const argv = process.argv.slice(2);
const device = argv.includes('--device') ? argv[argv.indexOf('--device') + 1] : 'phone';
const rate = argv.includes('--rate') ? +argv[argv.indexOf('--rate') + 1] : 4;
const url = argv.includes('--url') ? argv[argv.indexOf('--url') + 1] : 'http://localhost:8735/?still';
const root = new URL('../', import.meta.url).pathname;
await takeRenderLock('perf');
const VP = device === 'phone'
  ? { width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { width: 1440, height: 900, deviceScaleFactor: 1 };
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
const p = await b.newPage();
await p.setViewport(VP);
await p.goto(url, { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.__READY_DONE', { timeout: 120000 });
await p.evaluate(`window.__SHEET = ${JSON.stringify(readFileSync(root + 'data/seed/megafuck.tsv', 'utf8'))};` + readFileSync(root + 'tools/lib/screen-helpers.js', 'utf8'));
const setup = await p.evaluate(async () => {
  await __mine();
  // ten bags: the owner's eight and a stem bag each side
  const stems = app.catalog.flatMap((b) => b.products.map((pr) => ({ b, pr }))).filter((x) => x.pr.slot === 'stembag').slice(0, 1)[0];
  if (stems) { app.bags.equip('stemL', stems.b, stems.pr); app.bags.equip('stemR', stems.b, stems.pr); }
  await __w(1500);
  app.pack.openAll();
  await __w(3000);
  return { items: app.pack.state.locker.items.length, bags: Object.keys(app.bags.equipped).length };
});
const cdp = await p.createCDPSession();
await cdp.send('Performance.enable');
await cdp.send('Emulation.setCPUThrottlingRate', { rate });

// wrap the per-frame UI work so its cost can be read on its own
await p.evaluate(() => {
  window.__ui = { t: 0, n: 0, max: 0 };
  const wrap = (obj, key) => {
    if (!obj?.[key]) return;
    const f = obj[key].bind(obj);
    obj[key] = (...a) => { const t0 = performance.now(); const r = f(...a); const d = performance.now() - t0; __ui.t += d; __ui.max = Math.max(__ui.max, d); return r; };
  };
  wrap(app.framing, 'tick'); wrap(app.ui, 'tick'); wrap(app.pack, 'tick');
  window.__frames = [];
  let last = performance.now();
  const loop = (t) => { __frames.push(t - last); last = t; if (__frames.length < 100000) requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
async function window_(label, ms, act) {
  await p.evaluate(() => { __frames.length = 0; __ui.t = 0; __ui.n = 0; __ui.max = 0; });
  const m0 = await metrics();
  if (act) await p.evaluate(act);
  await new Promise((r) => setTimeout(r, ms));
  const m1 = await metrics();
  const r = await p.evaluate(() => {
    const f = __frames.slice(1).sort((a, c) => a - c);
    const q = (x) => f[Math.min(f.length - 1, Math.floor(f.length * x))] || 0;
    return { frames: f.length, median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), uiPerFrame: +(__ui.t / Math.max(1, f.length)).toFixed(2), uiMax: +__ui.max.toFixed(2) };
  });
  const d = (k) => Math.round((m1[k] || 0) - (m0[k] || 0));
  const row = { label, ...r, layouts: d('LayoutCount'), styleRecalcs: d('RecalcStyleCount'), layoutMs: +(((m1.LayoutDuration || 0) - (m0.LayoutDuration || 0)) * 1000).toFixed(1), scriptMs: +(((m1.ScriptDuration || 0) - (m0.ScriptDuration || 0)) * 1000).toFixed(0) };
  console.log(`${label.padEnd(22)} ${r.frames} frames, median ${r.median} ms, p95 ${r.p95} ms | UI ${r.uiPerFrame} ms/frame (max ${r.uiMax}) | ${row.layouts} layouts, ${row.styleRecalcs} style recalcs, ${row.layoutMs} ms layout`);
  return row;
}
console.log(`${device}, CPU x${rate}, ${setup.items} items, ${setup.bags} bags, all open`);
await window_('idle', 5000);
await window_('orbit', 5000, () => { let a = 0; const id = setInterval(() => { a += 0.05; app.camera.position.applyAxisAngle(new window.__THREE.Vector3(0, 1, 0), 0.05); app.controls.update(); if (a > 3) clearInterval(id); }, 30); });
await window_('open a bag', 5000, () => app.ui.setSelected('seatpack'));
await window_('scroll the sheet', 4000, () => { const b2 = document.querySelector('.sheet.open .sheet-body'); let y = 0; const id = setInterval(() => { y += 40; b2.scrollTop = y; if (y > 1200) clearInterval(id); }, 30); });
await b.close();
