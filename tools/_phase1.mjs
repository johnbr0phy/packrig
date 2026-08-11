/**
 * Phase 1 smoke test — REDESIGN.md §15.
 * Boots the app, opens each surface, and asserts the things the plan says must
 * hold: no veil survives, one sheet at a time, no horizontal overflow, no two
 * panels overlapping, and a clean console.
 */
import puppeteer from 'puppeteer-core';

const URL = process.argv[2] || 'http://localhost:8099/index.html';
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 900);
const MOBILE = process.argv[5] === 'mobile';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--hide-scrollbars', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage();
// See note in _phase2.mjs: third-party image CORP blocks are not app errors.
const errs = []; const imgBlocks = [];
p.on('console', (m) => { if (m.type() !== 'error') return; const t = m.text();
  if (/ERR_BLOCKED_BY_RESPONSE|net::ERR_/.test(t)) imgBlocks.push(t); else errs.push(t); });
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));

await p.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: MOBILE, hasTouch: MOBILE });
await p.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });
await p.waitForFunction('window.__READY_DONE === true', { timeout: 30000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 800));

const fail = [];
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fail.push(msg); };

// 1. the veil is gone for good
ok(await p.$('.picker-veil') === null, 'no .picker-veil in the DOM at rest');

const click = async (sel) => {
  const done = await p.evaluate((s) => { const n = document.querySelector(s); if (!n) return false; n.click(); return true; }, sel);
  await new Promise((r) => setTimeout(r, 500));
  return done;
};

const sheetState = () => p.evaluate(() => ({
  sheets: document.querySelectorAll('.sheet:not([hidden])').length,
  veils: document.querySelectorAll('.picker-veil').length,
  title: document.querySelector('.sheet-title')?.textContent || '',
  bodyKids: document.querySelector('.sheet-body')?.childElementCount || 0,
  closeBtns: document.querySelectorAll('.sheet:not([hidden]) .sheet-close, .sheet:not([hidden]) .pk-close').length,
}));

// 2. the bag catalogue opens into the shell
ok(await click('.add-bag'), 'clicked "Add a bag"');
let st = await sheetState();
ok(st.sheets === 1, `exactly one sheet open (saw ${st.sheets})`);
ok(st.veils === 0, 'no veil behind it');
ok(st.bodyKids > 0, 'sheet body has content');
ok(st.closeBtns === 1, `exactly one close button (saw ${st.closeBtns})`);
ok(st.title.length > 0, `sheet header carries the title ("${st.title}")`);

// 3. My rigs replaces it in place rather than stacking
ok(await click('.rigs-btn, [title*="Save this build"]'), 'clicked "My rigs"');
st = await sheetState();
ok(st.sheets === 1, `still exactly one sheet after opening a second surface (saw ${st.sheets})`);
ok(st.veils === 0, 'still no veil');
ok(await p.$('.rigs-picker') !== null, 'the rigs panel rendered inside the shell');

// 4. escape closes
await p.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 500));
ok((await sheetState()).sheets === 0, 'Escape closes the sheet');

// 5. the two layout assertions from MOBILE.md
const layout = await p.evaluate(() => {
  const d = document.documentElement;
  const rects = [...document.querySelectorAll('.panel, .sheet:not([hidden]), .bottom-bar, .aero-panel')]
    .filter((n) => n.offsetParent !== null)
    .map((n) => ({ cls: n.className.split(' ')[0], r: n.getBoundingClientRect() }));
  const hits = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i].r; const c = rects[j].r;
      if (a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom) {
        hits.push(`${rects[i].cls} ∩ ${rects[j].cls}`);
      }
    }
  }
  return { over: d.scrollWidth - d.clientWidth, hits };
});
ok(layout.over <= 0, `no horizontal overflow (scrollWidth - clientWidth = ${layout.over})`);
ok(layout.hits.length === 0, `no overlapping panels ${layout.hits.length ? layout.hits.join(', ') : ''}`);

// 6. clean console
ok(errs.length === 0, `no app console errors ${errs.length ? '→ ' + errs.slice(0, 3).join(' | ') : ''}`);
if (imgBlocks.length) console.log(`  note  ${imgBlocks.length} third-party product photos blocked by CDN policy`);

await p.screenshot({ path: process.argv[6] || '/tmp/phase1.png' });
await b.close();
console.log(fail.length ? `\nFAILED ${fail.length}` : '\nALL PASS');
process.exit(fail.length ? 1 : 0);
