import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--hide-scrollbars', '--force-device-scale-factor=2', '--window-size=1440,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
const url = process.argv[2];
await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForFunction('window.__READY_DONE === true', { timeout: 15000 }).catch(() => {});
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: process.argv[3] });
await browser.close();
console.log('saved', process.argv[3]);
