/**
 * The round trip, in the real app, headless:
 *   import the owner's sheet → every item in the right place at the right
 *   weight, totals his → export → import again: identical → share by link →
 *   open the link in a FRESH, signed-out browser context → identical.
 * Plus: v1 `?r=` and legacy `?kit=` links still open exactly as before.
 *
 *   node tools/pack-e2e.mjs            (dev server on :8735)
 * Screenshots → shots/e2e/. Exit 1 on any failure.
 */
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { CHROME } from './lib/chrome.mjs';
import { takeRenderLock } from './lib/renderlock.mjs';
await takeRenderLock('pack-e2e');

const root = new URL('../', import.meta.url).pathname;
const OUT = root + 'shots/e2e/';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8735/';
let fails = 0;
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const sheet = readFileSync(root + 'data/seed/megafuck.tsv', 'utf8') + '\nGear\t\t302.1\t18.88 lb\nBike\t\t398\t24.9 lb\nBags\t\t304\t19 lb\nAll up\t\t1004\t62.76 lb\n';

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
async function page(url, ctx = null) {
  const c = ctx || await b.createBrowserContext();
  const p = await c.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(url, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('window.__READY_DONE', { timeout: 120000 });
  await p.evaluate(() => app.pack.gearReady);
  return p;
}
const sig = () => app.pack.state.locker.items
  .filter((i) => app.pack.state.loadout.place[i.uid] !== undefined)
  .map((i) => { const r = app.pack.state.resolved.get(i.uid); return [r.name, Math.round(r.g / 28.349523125 * 10) / 10, app.pack.state.loadout.place[i.uid]]; });

console.log('\n1. import the sheet');
const p1 = await page(BASE);
await p1.evaluate(() => { app.menu.close(); app.packUI.setMode('gear'); });
const r1 = await p1.evaluate(async (text) => {
  // the owner's bags on the bike first, so the bags are real products
  const lo = (await fetch('./data/loadouts.json').then((r) => r.json())).find((l) => l.id === 'megafuck');
  app.__applyRig({ ...lo.rig, pack: undefined });
  const res = await app.pack.importText(text, { name: 'Megafuck (imported)' });
  const { sheetTotals } = await import('/src/pack/sheet.js');
  const st = app.pack.state;
  const t = sheetTotals(st.locker, st.loadout, (it) => st.resolved.get(it.uid).g);
  return { rows: res.report.rows, matched: res.report.matched.length, t, allup: st.totals.allup / 28.349523125, home: st.totals.home / 28.349523125 };
}, sheet);
ok(r1.rows === 67, `67 rows imported (${r1.rows}, ${r1.matched} matched to the catalogue)`);
ok(r1.t.gear === 302.1 && r1.t.bike === 398 && r1.t.bags === 304, `sheet totals: gear ${r1.t.gear}, bike ${r1.t.bike}, bags ${r1.t.bags}, all-up ${r1.t.allup} (his 302.1 / 398 / 304 / 1004)`);
ok(Math.abs(r1.allup - 1002.1) < 0.1, `app all-up ${r1.allup.toFixed(1)} oz = 1004.1 less the 2 oz filter left at home`);
const s1 = await p1.evaluate(sig);
const EXPECT = { 'Sleeping Bag': 'seatpack', 'Tent - YMG 1P Cirriform': 'forkR', Pot: 'seatpack:dangle', 'Camp shoes': 'seatpack:lashed', Wallet: 'body:hip', 'Zip lock lock': 'framebag_half:L', 'Water filter': 'home', 'Leatherman skeletool': 'toptube_rear', Headlamp: 'barpocket', 'iPhone 14 pro': 'frame' };
for (const [n, c] of Object.entries(EXPECT)) ok(s1.find((x) => x[0] === n)?.[2] === c, `${n} → ${c}`);
const src = sheet.trim().split('\n').filter((l) => l.split('\t').length === 4 && l.split('\t')[2]);
let wOk = 0;
for (const l of src) { const [n, , oz] = l.split('\t'); if (s1.find((x) => x[0] === n)?.[1] === Math.round(parseFloat(oz) * 10) / 10) wOk++; }
ok(wOk === 67, `every weight exactly the sheet's (${wOk}/67)`);
await p1.screenshot({ path: OUT + '1-imported.png' });

console.log('\n2. export → import');
const r2 = await p1.evaluate(async () => {
  const text = app.pack.exportText();
  const before = JSON.stringify(app.pack.state.locker.items.filter((i) => app.pack.state.loadout.place[i.uid] !== undefined).map((i) => [app.pack.state.resolved.get(i.uid).name, app.pack.state.loadout.place[i.uid]]));
  await app.pack.importText(text, { name: 'Re-imported' });
  return { text, before };
});
const s2 = await p1.evaluate(sig);
ok(JSON.stringify(s2) === JSON.stringify(s1), 'exported sheet re-imports identically');
ok(r2.text.split('\n')[0].startsWith('Item\tCategory\toz\tSeat post bag\tFork right'), 'export is the owner\'s matrix form, his column names');

console.log('\n3. share by link, open signed out in a fresh browser');
const url = await p1.evaluate(() => app.__rigURLWithPack());
ok(url.includes('?r=2.'), `v2 link, ${url.length} characters`);
// read what we compare against, then close page 1: two live software-GL
// pages starve each other past READY (LOG #10)
const bags1 = await p1.evaluate(() => Object.keys(app.bags.equipped).sort());
const v1 = await p1.evaluate(async () => { const { encodeRig, captureRig } = await import('/src/rig.js'); return `${location.origin}/?r=${encodeRig(captureRig(app, { withPack: false }))}`; });
const p1errors = [...p1.errors];
await p1.browserContext().close();
const p2 = await page(url);
await p2.evaluate(() => { app.packUI.setMode('gear'); });
await new Promise((r) => setTimeout(r, 1500));
const s3 = await p2.evaluate(sig);
const view = await p2.evaluate(() => ({ mine: app.pack.state.mine, bags: Object.keys(app.bags.equipped).sort(), signedIn: !!app.auth?.user }));
ok(!view.signedIn, 'signed out');
ok(!view.mine, 'shown as someone else\'s list, not written into this browser\'s locker');
ok(JSON.stringify(s3) === JSON.stringify(s2), `packing list survives the link (${s3.length} items)`);
ok(JSON.stringify(view.bags) === JSON.stringify(bags1), 'same bags on the bike');
await p2.screenshot({ path: OUT + '2-shared-link.png' });
const copied = await p2.evaluate(() => { const r = app.pack.copyView(); return { n: app.pack.lib.locker.items.length, mine: app.pack.state.mine, missing: r.missing.length }; });
ok(copied.mine && copied.n === 67, `copy to my locker: ${copied.n} items, ${copied.missing} flagged to get`);
await p2.screenshot({ path: OUT + '3-copied.png' });
// software GL: one live page at a time, or the next one never reaches READY
const errs = [...p1errors, ...p2.errors];

console.log('\n4. old links');
await p2.close();
const p3 = await page(v1);
const v1bags = await p3.evaluate(() => ({ bags: Object.keys(app.bags.equipped).sort(), pack: !!app.pack.view }));
ok(JSON.stringify(v1bags.bags) === JSON.stringify(bags1) && !v1bags.pack, 'v1 ?r= link opens the same bike, no packing list');
errs.push(...p3.errors); await p3.close();
const p4 = await page(BASE + '?kit=seatpack:0:0,barroll:0:3');
const kit = await p4.evaluate(() => Object.keys(app.bags.equipped).sort());
ok(kit.length === 2, `legacy ?kit= link still opens (${kit.join(', ')})`);

errs.push(...p4.errors);
ok(!errs.length, `no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
