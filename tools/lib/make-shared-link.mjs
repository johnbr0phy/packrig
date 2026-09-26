// Writes tools/lib/shared-link.txt: the owner's Megafuck trip as a v2 share
// link, which the "open a shared link" task opens in a fresh browser.
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { CHROME } from './chrome.mjs';
import { takeRenderLock } from './renderlock.mjs';
await takeRenderLock('shared-link');
const root = new URL('../../', import.meta.url).pathname;
const sheet = readFileSync(root + 'data/seed/megafuck.tsv', 'utf8');
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await b.newPage();
await p.goto('http://localhost:8735/?still', { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.__READY_DONE', { timeout: 120000 });
const url = await p.evaluate(async (text) => {
  app.menu?.close?.();
  const lo = (await fetch('./data/loadouts.json').then((r) => r.json())).find((l) => l.id === 'megafuck');
  app.__applyRig({ ...lo.rig, pack: undefined });
  await app.pack.gearReady;
  await app.pack.importText(text, { name: 'Megafuck' });
  return app.__rigURLWithPack();
}, sheet);
writeFileSync(new URL('./shared-link.txt', import.meta.url), url + '\n');
console.log(url.length, 'chars');
await b.close();
