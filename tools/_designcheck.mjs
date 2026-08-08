/**
 * Smoke test for DESIGN-SYSTEM §12 steps 1-2, against the dev server.
 * Proves the four things that can only be checked in a real WebGL context:
 * the font actually loaded, --scrim-k tracks scene luminance, opening a sheet
 * moves the camera and collapses the panel, and closing it puts everything back.
 */
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const p = await b.newPage();
await p.setViewport({ width: 1600, height: 950 });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:8735/', { waitUntil: 'networkidle0' });
await p.waitForFunction('window.__READY_DONE === true', { timeout: 60000 }).catch(() => {});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(1500);

const read = () => p.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const cam = window.app.camera;
  return {
    scrimK: parseFloat(cs.getPropertyValue('--scrim-k')),
    sheetW: cs.getPropertyValue('--sheet-w').trim(),
    viewOffsetX: cam.view?.enabled ? Math.round(cam.view.offsetX) : null,
    panelW: Math.round(document.querySelector('.panel')?.getBoundingClientRect().width || 0),
    dockX: Math.round(document.querySelector('.dock')?.getBoundingClientRect().left || 0),
    sheetOpen: document.getElementById('ui-root').classList.contains('sheet-open'),
    L: +(window.app.scrim?.L ?? -1).toFixed(4),
    blocks: window.app.scrim?.blocks?.length ?? 0,
    barLeft: Math.round(document.querySelector('.bottom-bar')?.getBoundingClientRect().left || 0),
    barRight: Math.round(document.querySelector('.bottom-bar')?.getBoundingClientRect().right || 0),
    wells: document.querySelectorAll('#scrim-layer .scrim-well').length,
    sampled: document.querySelectorAll('.scrim-sampled').length,
  };
});

const font = await p.evaluate(async () => {
  await document.fonts.ready;
  const loaded = [...document.fonts].filter((f) => f.family === 'Inter' && f.status === 'loaded');
  // Measure against a fallback to prove the face is really being used.
  const m = (fam) => {
    const c = document.createElement('canvas').getContext('2d');
    c.font = `550 15px ${fam}`;
    return c.measureText('0123456789 Expedition 42').width;
  };
  return { faces: loaded.length, interW: m("'Inter'"), fallbackW: m('serif') };
});

const before = await read();

// §3.3 — a much brighter HDRI must raise k.
await p.evaluate(() => window.app.setEnv('desert'));
await wait(2000);
const desert = await read();
await p.evaluate(() => window.app.setEnv('night'));
await wait(2000);
const night = await read();
await p.evaluate(() => window.app.setEnv('mountain'));
await wait(1600);

// §6.2 / §6.7 — open a detail sheet.
await p.evaluate(() => window.app.openSheet({
  kind: 'detail', title: 'Smoke test',
  render: (body) => { body.innerHTML = '<p class="t-body">body</p>'; },
}));
await wait(1200);
const open = await read();

await p.evaluate(() => window.app.openSheet({ kind: 'catalog', title: 'Catalogue' }));
await wait(1200);
const cat = await read();

await p.evaluate(() => window.app.sheets.closeSheet());
await wait(1200);
const closed = await read();

console.log(JSON.stringify({ font, before, desert, night, open, cat, closed }, null, 1));
console.log(errs.length ? `PAGE ERRORS:\n  ${errs.join('\n  ')}` : 'no page errors');
await b.close();
