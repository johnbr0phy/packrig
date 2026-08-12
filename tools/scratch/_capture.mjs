/**
 * Every surface, one browser, one pass. Launching a browser per shot is what
 * put the machine into swap; this reuses a single page and closes it in a
 * finally block so a thrown step cannot leak a process.
 */
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2];
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--hide-scrollbars','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],
});
try {
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type()==='error' && !/ERR_BLOCKED|Failed to load resource/.test(m.text())) errs.push('CONSOLE '+m.text()); });
  const w = ms => new Promise(r => setTimeout(r, ms));
  const shot = n => p.screenshot({ path: `${OUT}/${n}.png` });
  const click = async s => { await p.evaluate(x => document.querySelector(x)?.click(), s); await w(1200); };

  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await p.goto('http://localhost:8735/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__READY_DONE === true', { timeout: 40000 });
  await w(1400);

  await shot('01-start');
  await p.evaluate(() => window.app.menu.go('loadouts')); await w(1800);
  await shot('02-loadouts');
  await p.evaluate(() => window.app.menu.go('gallery')); await w(1600);
  await shot('03-gallery');
  await p.evaluate(() => window.app.menu.go('loadouts')); await w(1600);
  await click('.pr-btn.is-primary');
  await shot('04-panel');
  await click('.add-bag');   await shot('05-mounts');
  await click('.mount-btn'); await shot('06-catalog');
  await click('.sheet-back'); await w(400);
  await click('.sheet-close');
  await click('.bag-card');  await shot('07-bagsheet');
  await click('.sheet-close');
  await p.evaluate(() => window.app.openRigs('list')); await w(1300); await shot('08-rigs');
  await click('.sheet-close');
  await p.evaluate(() => { window.app.clearAll(); window.app.ui.sync(); }); await w(900);
  await shot('09-empty');
  await p.evaluate(() => window.app.bags.randomKit(11)); await w(900);
  await p.evaluate(() => window.app.openWindTunnel()); await w(9000); await shot('10-tunnel');
  await p.evaluate(() => window.app.openWindTunnel()); await w(1200);
  for (const env of ['desert','night']) {
    await p.evaluate(e => window.app.setEnv(e), env); await w(2200);
    await shot(`11-builder-${env}`);
  }
  await p.evaluate(() => window.app.setEnv('mountain')); await w(1500);

  await p.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await w(1400); await shot('12-m-panel');
  await click('.add-bag'); await click('.mount-btn'); await shot('13-m-catalog');
  await click('.sheet-close');
  await p.evaluate(() => window.app.menu.open('start')); await w(1600); await shot('14-m-start');

  await p.setViewport({ width: 2560, height: 1440, deviceScaleFactor: 1 }); await w(1500);
  await p.evaluate(() => window.app.menu.close()); await w(1400); await shot('15-wide-builder');

  console.log(errs.length ? 'ERRORS\n  ' + errs.slice(0,8).join('\n  ') : 'no console errors');
} finally { await b.close(); }
