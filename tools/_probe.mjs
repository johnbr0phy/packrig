// node tools/_probe.mjs "<query>", load, print errors and readiness
import puppeteer from 'puppeteer-core';
import { CHROME } from './lib/chrome.mjs';
import { takeRenderLock } from './lib/renderlock.mjs';
await takeRenderLock('_probe');
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await b.newPage();
p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/RGBE|Noise|deprecated|ERR_TUNNEL|Failed to load/.test(m.text())) console.log('console', m.type(), m.text().slice(0, 300)); });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.setViewport({ width: 1280, height: 800 });
const t = Date.now();
await p.goto('http://localhost:8735/' + (process.argv[2] || ''), { waitUntil: 'load', timeout: 60000 });
const ok = await p.waitForFunction('window.__READY_DONE', { timeout: 60000 }).then(() => true).catch(() => false);
console.log('ready', ok, Date.now() - t, 'ms');
console.log(await p.evaluate(() => JSON.stringify({ bags: Object.keys(window.app?.bags?.equipped || {}), view: !!window.app?.pack?.view })));
await b.close();
