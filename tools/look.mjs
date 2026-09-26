/**
 * One look at the app, for design iteration: boot, run a setup, shoot.
 *   node tools/look.mjs <phone|desktop> "<setup js>" <out.png> [--url "?still"]
 * Takes the render lock; prints page errors and console errors.
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { CHROME } from './lib/chrome.mjs';
import { takeRenderLock } from './lib/renderlock.mjs';
const [device, setup, out] = process.argv.slice(2);
const url = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : '?still';
const root = new URL('../', import.meta.url).pathname;
await takeRenderLock('look');
const VP = {
  phone: { width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
}[device];
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message, (e.stack || '').split('\n').slice(0, 3).join(' | ')));
p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource|ERR_|RGBE|deprecated/.test(m.text())) console.log('console.' + m.type(), m.text().slice(0, 300)); });
await p.setViewport(VP);
await p.goto('http://localhost:8735/' + url, { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.__READY_DONE', { timeout: 120000 });
await p.evaluate(`window.__SHEET = ${JSON.stringify(readFileSync(root + 'data/seed/megafuck.tsv', 'utf8'))};` + readFileSync(root + 'tools/lib/screen-helpers.js', 'utf8'));
try { const r = await p.evaluate(`(async () => { ${setup} })()`); if (r !== undefined) console.log('result', JSON.stringify(r)); } catch (e) { console.log('SETUP ERROR', e.message); }
await p.evaluate(async () => { for (let i = 0; i < 80; i++) { const { thumbsPending } = await import('./src/pack/ui/thumbs.js'); if (!thumbsPending() && !app.framing?.animating && !app.pack?.refitPending && !app.watts?.pending) break; await new Promise((r) => setTimeout(r, 150)); } await new Promise((r) => setTimeout(r, 400)); }).catch(() => {});
await p.screenshot({ path: out });
console.log('wrote', out);
await b.close();
