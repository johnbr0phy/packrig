/**
 * The built site, checked headless before it ships.
 *
 *   python3 -m http.server 8741 --directory docs   (any static server)
 *   node tools/docs-check.mjs [http://localhost:8741/]
 *
 * Phone and desktop: no page errors, every stylesheet loaded, the start
 * screen's headline, Build a rig puts rings on the bike, and a shared link
 * opens signed out with Copy to my kit. Shots in shots/docs-check/.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { CHROME } from './lib/chrome.mjs';
import { takeRenderLock } from './lib/renderlock.mjs';

const BASE = process.argv[2] || 'http://localhost:8741/';
const root = new URL('../', import.meta.url).pathname;
const OUT = root + 'shots/docs-check/';
mkdirSync(OUT, { recursive: true });
const shared = readFileSync(root + 'tools/lib/shared-link.txt', 'utf8').trim().replace(/^https?:\/\/[^/]+\//, BASE);
const DEVICES = {
  phone: { width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await takeRenderLock('docs-check');
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? '✓' : '✗'} ${what}`); if (!ok) bad++; };
for (const [device, vp] of Object.entries(DEVICES)) {
  for (const [name, url] of [['start', BASE + '?still'], ['shared', shared + (shared.includes('?') ? '&' : '?') + 'still']]) {
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    // the site's own files only: maker photos live on makers' hosts
    p.on('requestfailed', (r) => { if (r.url().startsWith(BASE)) errs.push('failed ' + r.url()); });
    p.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) errs.push(`${r.status()} ${r.url()}`); });
    await p.setViewport(vp);
    await p.goto(url, { waitUntil: 'load', timeout: 120000 });
    await p.waitForFunction('window.__READY_DONE', { timeout: 120000 }).catch(() => errs.push('never ready'));
    await wait(1500);
    const sheets = await p.evaluate(() => [...document.styleSheets].filter((s) => s.href).map((s) => { try { return [s.href.split('/').pop(), s.cssRules.length]; } catch { return [s.href, -1]; } }));
    check(sheets.length === 8 && sheets.every(([, n]) => n > 0), `${device} ${name}: ${sheets.length} stylesheets loaded (${sheets.map(([f, n]) => `${f} ${n}`).join(', ')})`);
    if (name === 'start') {
      const h = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').includes('Load the bike before you buy the bags'));
      check(h, `${device} start: headline`);
      await p.evaluate(() => [...document.querySelectorAll('.pr-item')].find((n) => n.textContent.includes('Build a rig'))?.click());
      await wait(2500);
      const rings = await p.evaluate(() => [...document.querySelectorAll('.mount-ring')].filter((n) => n.getBoundingClientRect().width > 0).length);
      check(rings > 3, `${device} Build a rig: ${rings} rings on the bike`);
    } else {
      const copy = await p.evaluate(() => [...document.querySelectorAll('button')].some((n) => n.textContent.includes('Copy to my kit') && n.getBoundingClientRect().width > 0));
      check(copy, `${device} shared link: Copy to my kit, signed out`);
    }
    await p.screenshot({ path: `${OUT}${device}-${name}.png` });
    check(!errs.length, `${device} ${name}: no page errors${errs.length ? ' ' + errs.slice(0, 4).join(' | ') : ''}`);
    await ctx.close();
  }
}
await b.close();
console.log(bad ? `\n${bad} problems` : '\nall clean');
process.exit(bad ? 1 : 0);
