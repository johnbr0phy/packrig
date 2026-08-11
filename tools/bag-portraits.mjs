/**
 * A portrait for every bag that has no photograph.
 *
 *
 * 201 of 702 products ship no image — small makers, discontinued models, and a
 * long tail nobody has photographed. Everywhere the app shows a bag it has had
 * to show a coloured plate instead, which is the one place a configurator
 * cannot afford to shrug: a catalogue of blank rectangles is not a catalogue.
 *
 * We already own a picture of every one of them. Each product has a measured
 * record and a builder that draws it, so this renders the bag from the app
 * itself — mounted on the bike it belongs on, in the app's own lighting — and
 * crops to it. Not a photograph, and not pretending to be one: a render of the
 * model, which is what the rest of the screen is showing anyway.
 *
 *   node tools/bag-portraits.mjs                 # every product missing an image
 *   node tools/bag-portraits.mjs --limit 10      # a sample, for checking
 *   node tools/bag-portraits.mjs --force         # redo ones already rendered
 *
 * Writes assets/portraits/<slug>.jpg and data/portraits.json, which maps the
 * same product key `rig.js` uses. build-pages.mjs copies both into docs/.
 *
 * ONE PAGE, ONE BIKE, reused for all of them: booting the app costs seconds and
 * equipping a bag costs milliseconds, so the whole run is bounded by the render
 * rather than by startup.
 */
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/*
 * `?shot=1` is not optional. It sets `preserveDrawingBuffer` on the renderer,
 * and without it a screenshot of the WebGL canvas returns whatever frame the
 * compositor happened to keep — which is why every portrait came out framed on
 * the whole bicycle no matter where the camera actually was. The camera was
 * correct at capture time; the pixels were stale. MOBILE.md has this trap
 * written down, and it has now cost two sessions.
 */
const BASE = process.env.PACKRIG_URL || 'http://localhost:8099/index.html?shot=1';
const OUT = join(root, 'assets/portraits');

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? (argv[i + 1] || d) : d; };
const LIMIT = parseInt(arg('limit', '0'), 10) || 0;
const FORCE = argv.includes('--force');

/** Same shape as `productKey` in rig.js, so the app can look a portrait up. */
const slug = (brand, p) => [brand, p.line, p.name, p.size]
  .filter(Boolean).join('-').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);

mkdirSync(OUT, { recursive: true });

const brands = JSON.parse(readFileSync(join(root, 'data/brands.json'), 'utf8'));
const jobs = [];
for (const br of brands) {
  for (const p of br.products) {
    if ((p.images?.length) || (p.images_remote?.length)) continue;
    jobs.push({ brand: br.short || br.name, slot: p.slot, line: p.line || '', name: p.name, size: p.size || '' });
  }
}
const todo = (LIMIT ? jobs.slice(0, LIMIT) : jobs)
  .filter((j) => FORCE || !existsSync(join(OUT, `${slug(j.brand, j)}.jpg`)));

console.log(`${jobs.length} products without a photograph · ${todo.length} to render`);
if (!todo.length) process.exit(0);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--hide-scrollbars', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
/*
 * Deliberately deviceScaleFactor 1. At 2 the portraits came out 1200x800 and
 * ~78KB each; 201 of those is 15MB, on a deploy that is currently 4.4MB in
 * total. These are shown at 432x288 at the very largest — the bag sheet hero —
 * and at 48px in the rig panel, so a 600x400 render is already generous.
 */
await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction('window.__READY_DONE === true', { timeout: 90000 });
await new Promise((r) => setTimeout(r, 800));

// Bare bike, no chrome, nothing in shot but the bag we are about to hang on it.
await page.evaluate(() => {
  window.app.home?.close?.();
  window.app.clearAll();
  for (const s of ['.panel', '.topbar', '.hint', '.toast', '.home', '.gal']) {
    document.querySelector(s)?.style.setProperty('display', 'none');
  }
});

const manifest = existsSync(join(root, 'data/portraits.json'))
  ? JSON.parse(readFileSync(join(root, 'data/portraits.json'), 'utf8')) : {};

let done = 0, failed = 0;
for (const j of todo) {
  const key = slug(j.brand, j);
  const ok = await page.evaluate(async (want) => {
    const app = window.app, THREE = window.__THREE;
    app.clearAll();
    // Match on the product, not the brand: `data/brands.json` carries the full
    // maker name and the running catalogue carries the short one, so keying on
    // the brand missed every product whose maker abbreviates.
    let hit = null;
    for (const br of app.catalog) {
      for (const pr of br.products) {
        if (pr.name !== want.name) continue;
        if ((pr.size || '') !== want.size) continue;
        if ((pr.line || '') !== want.line) continue;
        hit = { br, pr }; break;
      }
      if (hit) break;
    }
    if (!hit) return 'not found in catalogue';
    // The UI slot and the catalogue slot share a name for every slot that has
    // exactly one mount; the sided ones need a side picking.
    const ui = { forkbag: 'forkL', stembag: 'stemL', pannier: 'pannierL' }[hit.pr.slot] || hit.pr.slot;
    try { app.bags.equip(ui, hit.br, hit.pr, 0); } catch (e) { return 'equip threw: ' + e.message; }
    const rec = app.bags.equipped[ui];
    if (!rec?.mesh) return 'no mesh';
    await new Promise((r) => setTimeout(r, 90));
    // Frame the bag: a three-quarter view from its own bounding sphere, so a
    // 60L pannier and a 0.4L stem bag both fill the same fraction of the frame.
    const bb = new THREE.Box3().setFromObject(rec.mesh);
    const c = bb.getCenter(new THREE.Vector3());
    const r = Math.max(0.06, bb.getBoundingSphere(new THREE.Sphere()).radius);
    const cam = app.camera, ctr = app.controls;
    // The app is still driving this camera — auto-rotate, damping, and the
    // sheet's view offset all fight a one-shot position. Turn them off, clear
    // the offset, then place it; otherwise every portrait comes out as the same
    // wide shot of the whole bicycle.
    ctr.autoRotate = false;
    ctr.enableDamping = false;
    // OrbitControls clamps to [minDistance, maxDistance]. The app keeps the
    // camera at bicycle range, so every computed portrait distance was being
    // snapped back out to the same wide shot no matter what we asked for.
    ctr.minDistance = 0.02;
    ctr.maxDistance = 60;
    cam.clearViewOffset?.();
    const place = () => {
      ctr.target.copy(c);
      // Distance from the bag's bounding sphere and the camera's own field of
      // view, so the bag fills the frame whether it is a 0.4L stem bag or a
      // 60L pannier. A fixed multiple of the radius framed everything as a
      // wide shot of the whole bicycle.
      const fov = (cam.fov * Math.PI) / 180;
      const d = (r / Math.tan(fov / 2)) * 1.28;
      cam.position.set(c.x + d * 0.62, c.y + d * 0.22, c.z + d * 0.75);
      cam.near = 0.005; cam.far = 40; cam.updateProjectionMatrix();
      cam.lookAt(c);
      ctr.update();
    };
    place();
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    place();   // once more after a frame, so nothing that runs in the loop wins
    return true;
  }, j);

  if (!ok || typeof ok === 'string') { console.log(`  skip  ${key}: ${ok}`); failed++; continue; }
  await new Promise((r) => setTimeout(r, 260));
  await page.screenshot({
    path: join(OUT, `${key}.jpg`), type: 'jpeg', quality: 70,
    clip: { x: 150, y: 60, width: 600, height: 400 },
  });
  manifest[key] = `assets/portraits/${key}.jpg`;
  done++;
  if (done % 25 === 0) console.log(`  ${done}/${todo.length}`);
}

writeFileSync(join(root, 'data/portraits.json'), JSON.stringify(manifest, null, 0));
await browser.close();
console.log(`rendered ${done}, skipped ${failed}, manifest has ${Object.keys(manifest).length} entries`);
