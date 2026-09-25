/**
 * The honest first-timer pass: a fresh, signed-out visitor packs a tent, a
 * mat, a stove and a rain jacket using only the buttons on screen.
 *
 *   node tools/firsttimer.mjs
 *
 * Counts every tap, checks each thing ends up somewhere on the bike (not left
 * at home, not "won't fit"), and screenshots the end state per device. Wall
 * time is printed but means little here: software GL renders a frame in
 * hundreds of ms. The tap count is the number that transfers to a phone.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { CHROME } from './lib/chrome.mjs';
import { takeRenderLock } from './lib/renderlock.mjs';
await takeRenderLock('firsttimer');

const root = new URL('../', import.meta.url).pathname;
const OUT = root + 'shots/firsttimer/';
mkdirSync(OUT, { recursive: true });
const WANT = ['Tent', 'Sleeping mat', 'Stove & gas', 'Rain jacket'];
const DEVICES = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  phone: { width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
let fails = 0;
for (const [device, vp] of Object.entries(DEVICES)) {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.setViewport(vp);
  await p.goto('http://localhost:8735/', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('window.__READY_DONE', { timeout: 120000 });
  const t0 = Date.now();
  let taps = 0;
  // a tap on the first visible element whose text contains `text`
  const tap = async (sel, text) => {
    const h = await p.waitForFunction((s, t) => [...document.querySelectorAll(s)]
      .find((n) => n.offsetParent !== null && (!t || n.textContent.includes(t))), { timeout: 30000 }, sel, text);
    await h.asElement().click();
    taps++;
    await new Promise((r) => setTimeout(r, 250));
  };
  await tap('button, a, [role=button]', 'Pack my kit');
  for (const w of WANT) await tap('.pkg-tile', w);
  await tap('.bs-btn.is-primary', `Pack these ${WANT.length}`);
  // packing fetches the starter bags first on a bare bike: wait for the result
  await p.waitForFunction(() => app.pack.state.locker.items.length >= 4 && Object.keys(app.bags.equipped).length > 0, { timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  const res = await p.evaluate(() => {
    const st = app.pack.state;
    const placed = st.locker.items.map((i) => [st.resolved.get(i.uid)?.name, st.loadout.place[i.uid] || 'home']);
    const wont = st.warnings.filter((w) => w.kind === 'overflow' || w.kind === 'nobag').length;
    return { placed, wont, bags: Object.keys(app.bags.equipped) };
  });
  const home = res.placed.filter(([, at]) => at === 'home');
  const ok = res.placed.length >= WANT.length && !home.length && !res.wont && !errs.length;
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${device}: ${taps} taps, ${((Date.now() - t0) / 1000).toFixed(1)} s wall (software GL)`);
  for (const [n, at] of res.placed) console.log(`    ${n} → ${at}`);
  if (home.length) console.log(`    left at home: ${home.map(([n]) => n).join(', ')}`);
  if (res.wont) console.log(`    ${res.wont} won't-fit warnings`);
  if (errs.length) console.log(`    page errors: ${errs.join(' | ')}`);
  console.log(`    bags: ${res.bags.join(', ')}`);
  await p.screenshot({ path: `${OUT}${device}.png` });
  await ctx.close();
}
await b.close();
console.log(fails ? `\n${fails} problems` : '\nall clean');
process.exit(fails ? 1 : 0);
