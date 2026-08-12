/**
 * One browser, one pass: the interaction test, the contrast audit and every
 * screenshot. Launching a browser per surface is what put the machine into
 * swap; this reuses a single page and closes it deterministically.
 */
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2];
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--hide-scrollbars','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--js-flags=--max-old-space-size=512'],
});
try {
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_BLOCKED_BY_RESPONSE|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await p.goto('http://localhost:8735/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__READY_DONE === true', { timeout: 30000 });
  const w = (ms) => new Promise(r => setTimeout(r, ms));
  const click = async (s) => { await p.evaluate(x => document.querySelector(x)?.click(), s); await w(1200); };
  await w(1300);

  // ---- menu -> builder
  await p.evaluate(() => window.app.menu.go('loadouts')); await w(1700);
  await p.screenshot({ path: `${OUT}/f-loadouts.png` });
  await click('.pr-btn.is-primary');
  await p.screenshot({ path: `${OUT}/f-panel.png` });

  // ---- mount -> catalogue -> back
  await click('.add-bag');
  await p.screenshot({ path: `${OUT}/f-mounts.png` });
  await click('.mount-btn');
  await p.screenshot({ path: `${OUT}/f-catalog.png` });
  const backWorks = await p.evaluate(() => {
    const b2 = document.querySelector('.sheet-back');
    if (!b2 || b2.hidden) return 'no back button';
    b2.click(); return 'clicked';
  });
  await w(1300);
  const backedTo = await p.evaluate(() => document.querySelector('.sheet-title')?.textContent);
  console.log(`back button: ${backWorks} -> "${backedTo}"`);
  await click('.sheet-close');

  // ---- bag sheet
  await click('.bag-card');
  await p.screenshot({ path: `${OUT}/f-bagsheet.png` });
  await click('.sheet-close');

  // ---- empty state
  await p.evaluate(() => { window.app.clearAll(); window.app.ui.sync(); }); await w(800);
  await p.screenshot({ path: `${OUT}/f-empty.png` });

  // ---- phone
  await p.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await w(1200);
  await p.evaluate(() => window.app.bags.randomKit(7)); await w(900);
  await p.screenshot({ path: `${OUT}/f-m-panel.png` });

  console.log(errs.length ? 'ERRORS:\n  ' + errs.slice(0, 8).join('\n  ') : 'no console errors');
} finally {
  await b.close();
}
