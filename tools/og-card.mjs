/**
 * Renders the link-preview card — the image X, Slack, Discord, iMessage and
 * LinkedIn show when somebody pastes the site — into assets/social/og.png.
 *
 * WHY IT IS A SCRIPT AND NOT AN EXPORT FROM A DESIGN TOOL. The card's hero is
 * the wind tunnel itself: a real rig, really measured, with the streamlines the
 * app draws. The three numbers printed beside it are read back out of that same
 * measurement pass (`app.__aeroReadout()`), so the card cannot drift from what
 * the product says. Change a bag builder or the drag model and re-running this
 * re-states the truth; a PNG exported once would quietly start lying.
 *
 * Two passes:
 *   1. Drive the live app headlessly — apply a curated loadout, open the
 *      tunnel, wait for the measurement, frame the camera so the bike sits in
 *      the right third — and screenshot the scene with the UI hidden.
 *   2. Load tools/og-card.html, inject that plate as a data URI, screenshot
 *      1200x630 at 2x and downsample. Supersampling is what keeps the type
 *      crisp; unfurlers re-encode, so we hand them the cleanest source we can.
 *
 *   node tools/serve.mjs &            # the app must be served
 *   node tools/og-card.mjs [--loadout expedition] [--variant dark|light]
 *
 * The result is 1200x630 — the size every unfurler documents — and is copied
 * into the deploy by tools/build-pages.mjs, which also writes the meta tags
 * that point at it.
 */
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const BASE = opt('base', 'http://localhost:8735');
const VARIANT = opt('variant', 'dark');
const LOADOUT = opt('loadout', 'expedition');
const OUT_DIR = join(root, 'assets/social');
const OUT = join(OUT_DIR, opt('out', 'og.png'));
mkdirSync(OUT_DIR, { recursive: true });

const loadouts = JSON.parse(readFileSync(join(root, 'data/loadouts.json'), 'utf8'));
const pick = loadouts.find((l) => l.id === LOADOUT);
if (!pick) throw new Error(`no loadout "${LOADOUT}" — have ${loadouts.map((l) => l.id).join(', ')}`);

// The framing. Twelve degrees off pure profile is enough to show that the bags
// have depth without turning the silhouette into a foreshortened blob, and the
// lateral slide is what buys the left half of the frame for the words.
const CAM = { azDeg: 12, dist: 4.45, height: 1.05, targetY: 0.68, slide: -0.45 };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--hide-scrollbars'],
});
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('  page error:', e.message));
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });

  console.log('· booting the app');
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__READY_DONE === true', { timeout: 90000 });
  await wait(2000);

  console.log(`· mounting "${pick.name}"`);
  await page.evaluate((rig) => { window.app.menu?.close(); window.app.__applyRig(rig); }, pick.rig);
  await wait(3000);

  // The tunnel measures on a debounce behind a sequence number, and the entry
  // is a 1.5s dissolve on top of that. Give it room rather than racing it —
  // this is the same wait tools/measure-loadouts.mjs settled on.
  console.log('· wind tunnel');
  await page.evaluate(() => window.app.openWindTunnel());
  await wait(15000);

  const readout = await page.evaluate(() => window.app.__aeroReadout?.());
  if (!readout) throw new Error('the tunnel returned no readout — nothing to print on the card');
  console.log(`   CdA ${readout.cda.toFixed(3)} m² · ${Math.round(readout.totalW)} W `
    + `at ${readout.speedKph} km/h · +${Math.round(readout.addedW)} W for the bags`);

  await page.evaluate(() => { document.getElementById('ui-root').style.display = 'none'; });
  await page.evaluate((c) => {
    const { camera, controls } = window.app;
    const THREE = window.__THREE;
    const t = new THREE.Vector3(controls.target.x, c.targetY, 0);
    const th = (c.azDeg * Math.PI) / 180;
    camera.position.set(t.x + Math.sin(th) * c.dist, c.height, t.z + Math.cos(th) * c.dist);
    controls.target.copy(t);
    controls.update();
    // Slide the whole frame sideways rather than orbiting: the bike keeps its
    // profile and simply moves right, which is the only reason the headline has
    // anywhere to live.
    camera.translateX(c.slide);
    controls.target.x += Math.cos(th) * c.slide;
    controls.target.z -= Math.sin(th) * c.slide;
    controls.update();
  }, CAM);
  await wait(1500);
  const plate = await page.screenshot({ encoding: 'base64' });

  console.log('· compositing');
  const q = new URLSearchParams({
    v: VARIANT,
    cda: readout.cda.toFixed(3),
    watts: String(Math.round(readout.totalW)),
    added: String(Math.round(readout.addedW)),
    kph: String(Math.round(readout.speedKph)),
  });
  await page.goto(`${BASE}/tools/og-card.html?${q}`, { waitUntil: 'networkidle0' });
  await page.evaluate((b64) => {
    document.getElementById('plate').style.backgroundImage = `url(data:image/png;base64,${b64})`;
    return document.fonts.ready;
  }, plate);
  await wait(600);
  await page.screenshot({ path: OUT });
} finally {
  await browser.close();
}

// Shot at 2x for the type, delivered at 1x: 1200x630 is what the unfurlers
// document, and every one of them re-encodes anyway.
execFileSync('sips', ['-z', '630', '1200', OUT, '--out', OUT], { stdio: 'ignore' });
console.log(`\nwrote ${OUT.replace(root + '/', '')} — 1200x630, ${(statSync(OUT).size / 1024).toFixed(0)}KB`);
