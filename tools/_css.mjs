// node tools/_css.mjs "<query>" "<setup js>" "<selector>" [w h mobile]
import puppeteer from 'puppeteer-core';
import { CHROME } from './lib/chrome.mjs';
const [q, js, sel, w = '1440', h = '900', mob = ''] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await b.newPage();
await p.setViewport({ width: +w, height: +h, isMobile: !!mob, hasTouch: !!mob });
await p.goto('http://localhost:8735/' + q, { waitUntil: 'load' });
await p.waitForFunction('window.__READY_DONE', { timeout: 120000 });
if (js) await p.evaluate(js);
await new Promise((r) => setTimeout(r, 800));
console.log(await p.evaluate((sel) => [...document.querySelectorAll(sel)].slice(0, 3).map((n) => {
  const c = getComputedStyle(n); const r = n.getBoundingClientRect();
  return { cls: n.className, rect: [r.x, r.y, r.width, r.height].map(Math.round), bg: c.backgroundColor, bgi: c.backgroundImage.slice(0, 80), pad: c.padding, disp: c.display, just: c.justifyContent, pos: c.position, w: c.width, minh: c.minHeight };
}), sel));
await b.close();
