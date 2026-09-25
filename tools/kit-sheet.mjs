// Contact sheets of the archetype kit at true scale.
//   node tools/kit-sheet.mjs              → shots/kit/archetypes.png
//   node tools/kit-sheet.mjs --items      → shots/kit/items-<cat>.png per category
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { CHROME } from './lib/chrome.mjs';
const root = new URL('../', import.meta.url).pathname;
mkdirSync(root + 'shots/kit', { recursive: true });
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
const shoot = async (qs, out, w = 1800) => {
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.setViewport({ width: w, height: 800 });
  await p.goto(`http://localhost:8735/tools/pages/kitsheet.html?${qs}&w=${w}`, { waitUntil: 'load' });
  await p.waitForFunction('window.__DONE', { timeout: 120000 });
  await p.screenshot({ path: out, fullPage: true });
  if (errs.length) console.log(out, 'ERRORS', errs);
  console.log('wrote', out);
  await p.close();
};
if (process.argv.includes('--items')) {
  const cats = [...new Set(JSON.parse(readFileSync(root + 'data/gear.json')).map((g) => g.cat))];
  for (const c of cats) await shoot(`mode=items&cat=${c}&px=0.8`, `${root}shots/kit/items-${c}.png`);
} else {
  await shoot('mode=arch&px=0.9', `${root}shots/kit/archetypes.png`);
}
await b.close();
