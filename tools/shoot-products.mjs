// Per-product close-up shots for adversarial spec review.
// Usage: node tools/shoot-products.mjs [--brands "Apidura,Ortlieb"] [--slots "seatpack,barroll"] [--limit N]
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const brandFilter = (opt('brands', '') || '').split(',').filter(Boolean);
const slotFilter = (opt('slots', 'seatpack,barroll,barbag,randobag,framebag_full,framebag_half,pannier,trunk')).split(',');
const limit = parseInt(opt('limit', '0'), 10);
const BASE = opt('base', 'http://localhost:8735');

const brands = JSON.parse(readFileSync(new URL('../data/brands.json', import.meta.url)));
const outDir = new URL('../shots/products/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const jobs = [];
brands.forEach((b, bi) => {
  if (brandFilter.length && !brandFilter.some((f) => b.name.toLowerCase().includes(f.toLowerCase()))) return;
  b.products.forEach((p, pi) => {
    if (!slotFilter.includes(p.slot)) return;
    const slotParam = p.slot === 'pannier' ? 'pannierR' : p.slot;
    const safe = `${b.name}-${p.line || ''}-${p.name}-${p.size || ''}`.replace(/[^a-z0-9]+/gi, '_').slice(0, 80);
    jobs.push({ file: `${safe}.png`, brand: b.name, line: p.line, name: p.name, size: p.size, src: p.src, slot: p.slot,
      q: `env=mountain&shot=1&kit=${slotParam}:${bi}:${pi}&focus=${slotParam}` });
  });
});
const list = limit ? jobs.slice(0, limit) : jobs;
console.log(`shooting ${list.length} products`);

const launch = () => puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--hide-scrollbars', '--force-device-scale-factor=2', '--window-size=1100,800'],
});
const newPage = async (b) => {
  const pg = await b.newPage();
  await pg.setViewport({ width: 1100, height: 800, deviceScaleFactor: 2 });
  return pg;
};
// Each load leaks a WebGL context; past ~200 shots Chrome starts refusing them and
// every remaining job fails. Recycle the whole browser periodically.
const RECYCLE = parseInt(opt('recycle', '60'), 10);
let browser = await launch();
let page = await newPage(browser);
const manifest = [];
const failures = [];
for (let n = 0; n < list.length; n++) {
  const j = list[n];
  if (n > 0 && n % RECYCLE === 0) {
    await browser.close().catch(() => {});
    browser = await launch();
    page = await newPage(browser);
    process.stdout.write('R');
  }
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(`${BASE}/?${j.q}`, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForFunction('window.__READY_DONE === true', { timeout: 12000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 350));
      await page.screenshot({ path: outDir + j.file });
      manifest.push(j);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      // a dead page/browser poisons every later job, so rebuild before retrying
      await browser.close().catch(() => {});
      browser = await launch();
      page = await newPage(browser);
    }
  }
  if (lastErr) { failures.push({ file: j.file, error: String(lastErr.message || lastErr) }); process.stdout.write('x'); }
  else process.stdout.write('.');
}
writeFileSync(outDir + 'manifest.json', JSON.stringify(manifest, null, 1));
if (failures.length) writeFileSync(outDir + 'failures.json', JSON.stringify(failures, null, 1));
await browser.close();
console.log(`\ndone: ${manifest.length}/${list.length} → ${outDir}`);
if (failures.length) console.log(`${failures.length} failed (see failures.json), first: ${failures[0].error}`);
