// node tools/_eval.mjs "<query>" "<async js expression returning JSON-able>"
import puppeteer from 'puppeteer-core';
import { CHROME } from './lib/chrome.mjs';
import { takeRenderLock } from './lib/renderlock.mjs';
await takeRenderLock('_eval');
const [q, js] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.setViewport({ width: 1000, height: 700 });
await p.goto('http://localhost:8735/' + q, { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.__READY_DONE', { timeout: 120000 });
const r = await p.evaluate(`(async()=>{ ${js} })()`);
console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 1));
await b.close();
