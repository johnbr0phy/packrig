import puppeteer from 'puppeteer-core';
const q = process.argv[2];
const name = process.argv[3];
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--hide-scrollbars', '--force-device-scale-factor=2', '--window-size=1440,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('PAGEERR:', String(e)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });
const t0 = Date.now();
await page.goto(`http://localhost:8735/?${q}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('dom', Date.now() - t0);
await page.waitForFunction('window.__READY_DONE === true', { timeout: 90000 }).catch((e) => console.log('READY FAIL', e.message));
console.log('ready', Date.now() - t0);
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `shots/env-world/${name}.png` });
console.log('shot', Date.now() - t0);
await browser.close();
