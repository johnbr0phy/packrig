/**
 * Measure the aero cost of every curated loadout, once, and write it into
 * data/loadouts.json.
 *
 * WHY THIS IS A BUILD STEP AND NOT A RUNTIME CALL. The wind tunnel is a real
 * GPU measurement: it renders the rig from a dozen yaw angles into an
 * offscreen id-buffer and counts pixels. That is the right cost to pay when
 * somebody asks for it and the wrong one to pay to print a number on a card.
 * The eight loadouts are STATIC — they only change when tools/build-loadouts.mjs
 * changes — so their watts can be measured here and shipped as data.
 *
 * What it produces, per loadout, added to `stats`:
 *   cda      m², head-on, with the fairing credit applied
 *   watts    W to hold the reference speed with the bags on
 *   addedW   W the bags cost over the bare bike
 *   grade    the letter and name the tunnel would show
 *
 *   node tools/measure-loadouts.mjs        (needs `node tools/serve.mjs` running)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'data/loadouts.json');
const loadouts = JSON.parse(readFileSync(OUT, 'utf8'));

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
try {
  const p = await b.newPage();
  p.on('pageerror', (e) => console.error('  page error:', e.message));
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto('http://localhost:8735/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__READY_DONE === true', { timeout: 60000 });
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  await w(1500);

  // Open the tunnel once and leave it open: `initAero` is lazy and the first
  // entry builds the measurement pass, the particle field and the rider.
  await p.evaluate(() => window.app.openWindTunnel());
  await w(6000);

  for (const l of loadouts) {
    await p.evaluate((rig) => {
      window.app.__applyRig(rig);
      window.app.aero?.onKitChange();
    }, l.rig);
    // The measurement is async and debounced behind a sequence number; give it
    // room rather than racing it.
    await w(5000);
    const m = await p.evaluate(() => window.app.__aeroReadout?.() || null);
    if (!m) { console.error(`  ${l.name}: no readout`); continue; }
    l.stats.cda = Math.round(m.cda * 1000) / 1000;
    l.stats.watts = Math.round(m.totalW);
    l.stats.addedW = Math.round(m.addedW);
    l.stats.grade = m.grade;
    console.log(`  ${l.name.padEnd(18)} CdA ${l.stats.cda.toFixed(3)}  `
      + `${String(l.stats.watts).padStart(3)} W  +${String(l.stats.addedW).padStart(3)} W  ${m.grade}`);
  }
} finally {
  await b.close();
}

writeFileSync(OUT, JSON.stringify(loadouts, null, 2) + '\n');
console.log(`\nwrote ${OUT}`);
