// Screenshot harness: captures fixed angles × environments × kits into shots/
// Usage: node tools/shoot.mjs [--set name] [--base http://localhost:8735]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : dflt;
};
const BASE = opt('base', 'http://localhost:8735');
const SET = opt('set', 'default');
const outDir = new URL(`../../shots/${SET}/`, import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const SHOTS = [
  { name: 'hero-mountain-loaded', q: 'env=mountain&kit=rand&seed=7&cam=hero' },
  { name: 'side-mountain-loaded', q: 'env=mountain&kit=rand&seed=7&cam=side' },
  { name: 'tq-lake-loaded', q: 'env=lake&kit=rand&seed=12&cam=tq' },
  { name: 'side-lake-empty', q: 'env=lake&cam=side' },
  { name: 'hero-forest-full', q: 'env=forest&kit=full&cam=hero' },
  { name: 'rear-desert-loaded', q: 'env=desert&kit=rand&seed=3&cam=rear' },
  { name: 'hero-desert-loaded', q: 'env=desert&kit=rand&seed=3&cam=hero' },
  { name: 'hero-night-loaded', q: 'env=night&kit=rand&seed=21&cam=hero' },
  { name: 'front-mountain-empty', q: 'env=mountain&cam=front' },
  { name: 'ui-mountain', q: 'env=mountain&kit=rand&seed=7', ui: true },
];

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--hide-scrollbars', '--force-device-scale-factor=2', '--window-size=1440,900'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

for (const shot of SHOTS) {
  const url = `${BASE}/?${shot.q}&world=1${shot.ui ? '' : '&shot=1'}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__READY_DONE === true', { timeout: 15000 }).catch(() => {
    console.warn('  (ready flag never set — capturing anyway)');
  });
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `${outDir}${shot.name}.png` });
  console.log('captured', shot.name);
}

if (errors.length) {
  console.log('\nPAGE ERRORS:');
  for (const e of [...new Set(errors)]) console.log(' -', e);
}
await browser.close();
console.log('done →', outDir);
