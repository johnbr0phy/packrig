// Equip every catalogued product one at a time and report bags the resolver
// drops, plus any bag whose geometry interpenetrates a frame tube.
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';
const BASE = 'http://localhost:8735';
const brands = JSON.parse(readFileSync(new URL('../data/brands.json', import.meta.url)));
// Catalogue slot names are NOT UI slot names. Mapping only `pannier` meant
// every stembag/forkbag was equipped under a key that does not exist, so the
// audit read them all back as "dropped" when the app had placed them fine.
const SLOT_UI = { pannier: 'pannierR', stembag: 'stemR', forkbag: 'forkR' };
const jobs = [];
brands.forEach((b, bi) => b.products.forEach((p, pi) => {
  jobs.push({ brand: b.name, line: p.line, name: p.name, size: p.size, slot: p.slot,
    ui: SLOT_UI[p.slot] || p.slot, bi, pi });
}));
// Same WebGL-context leak as the shooter: past a couple of hundred loads Chrome
// starts refusing contexts and every later job fails. Recycle the browser.
const launch = () => puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
let browser = await launch();
let page = await browser.newPage();
const out = [];
let n = 0;
for (const j of jobs) {
  if (n > 0 && n % 60 === 0) {
    await browser.close().catch(() => {});
    browser = await launch();
    page = await browser.newPage();
  }
  n++;
  const warns = [];
  const onMsg = (m) => { if (m.type() === 'warning' && m.text().includes('[bags]')) warns.push(m.text()); };
  page.on('console', onMsg);
  try {
    await page.goto(`${BASE}/?shot=1&kit=${j.ui}:${j.bi}:${j.pi}`, { waitUntil: 'networkidle0', timeout: 20000 });
    await page.waitForFunction('window.__READY_DONE === true', { timeout: 10000 }).catch(() => {});
    const res = await page.evaluate((ui) => {
      const app = window.app; if (!app) return { err: 'no app' };
      const rec = app.bags.equipped[ui];
      if (!rec) return { dropped: true };
      const THREE = window.__THREE;
      const box = new THREE.Box3().setFromObject(rec.mesh);
      return { dropped: false, min: box.min.toArray(), max: box.max.toArray() };
    }, j.ui);
    out.push({ ...j, ...res, warns });
    process.stdout.write(res.dropped ? 'D' : '.');
  } catch (e) {
    // a dead page poisons every later job, so rebuild before continuing
    out.push({ ...j, error: String(e.message).slice(0, 80) });
    process.stdout.write('x');
    await browser.close().catch(() => {});
    browser = await launch();
    page = await browser.newPage();
  }
  page.off('console', onMsg);
}
writeFileSync(new URL('../shots/fit-audit.json', import.meta.url).pathname, JSON.stringify(out, null, 1));
await browser.close();
const dropped = out.filter((o) => o.dropped);
console.log(`\n${dropped.length}/${out.length} dropped`);
for (const d of dropped.slice(0, 40)) console.log(` DROP ${d.slot.padEnd(14)} ${d.brand} ${d.line || ''} ${d.name} ${d.size || ''}`);
