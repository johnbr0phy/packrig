// Quick screenshot: node tools/_shot.mjs "<query>" out.png [w h mobile] [js-to-run-after]
import puppeteer from 'puppeteer-core';
import { CHROME } from './lib/chrome.mjs';
const [q = '', out = 'shots/x.png', w = '1440', h = '900', mob = '', js = ''] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL/.test(m.text())) errs.push(m.text()); });
await p.setViewport({ width: +w, height: +h, deviceScaleFactor: mob ? 2 : 1, isMobile: !!mob, hasTouch: !!mob });
await p.goto('http://localhost:8735/' + q, { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.__READY_DONE', { timeout: 120000 });
if (js) { await p.evaluate(js); }
await new Promise((r) => setTimeout(r, 2500));
await p.screenshot({ path: out });
if (errs.length) console.log('ERRORS', errs);
await b.close();
