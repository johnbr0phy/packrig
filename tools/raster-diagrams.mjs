/**
 * Rasterise every harvested SVG diagram to PNG beside it.
 *
 *   node tools/raster-diagrams.mjs
 *
 * The dimension drawings are the most useful reference we have, and they are
 * the one kind of file a vision model cannot open — image tools take PNG and
 * JPEG, not SVG. Left as-is they would be listed in every critic bundle and
 * silently skipped by every critic, which is the worst failure mode available:
 * the evidence appears to be present and is never actually looked at.
 *
 * Rendered white-on-white at 2x so the thin 0.25px detail strokes survive.
 */
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const media = JSON.parse(readFileSync(join(root, 'data/apidura-media.json')));

const jobs = [];
for (const page of Object.values(media.pages)) {
  for (const im of page.images) {
    if (!/\.svg$/i.test(im.local)) continue;
    jobs.push({ svg: join(root, im.local), png: join(root, im.local).replace(/\.svg$/i, '.png') });
  }
}
console.log(`${jobs.length} SVG diagrams`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
let done = 0, skipped = 0, failed = 0;

for (const j of jobs) {
  if (existsSync(j.png)) { skipped++; continue; }
  if (!existsSync(j.svg)) { failed++; continue; }
  try {
    const src = readFileSync(j.svg, 'utf8');
    const vb = (src.match(/viewBox="([^"]+)"/) || [, '0 0 800 600'])[1].split(/\s+/).map(Number);
    const w = Math.round(vb[2] || 800), h = Math.round(vb[3] || 600);
    // Navigate straight to the file. The obvious alternative — setContent with
    // the SVG as a base64 <img> — spends ~30s per file waiting for a
    // networkidle that a data URL never signals, which turned a four-minute job
    // into a projected four hours. Chrome renders a standalone SVG document on
    // white already, so there is no transparency to paint over either.
    const scale = Math.min(2, 1600 / Math.max(w, h));
    await page.setViewport({
      width: Math.max(200, Math.round(w * scale)),
      height: Math.max(200, Math.round(h * scale)),
      deviceScaleFactor: 1.5,
    });
    await page.goto('file://' + j.svg, { waitUntil: 'load', timeout: 20000 });
    await page.screenshot({ path: j.png });
    done++;
    void src;
  } catch (e) {
    console.log(`  ✗ ${j.svg.split('/').slice(-2).join('/')}: ${e.message}`);
    failed++;
  }
}
await browser.close();
console.log(`rasterised ${done}, already had ${skipped}, failed ${failed}`);
