import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
await p.goto('http://localhost:8735/?kit=trunk:11:5', { waitUntil: 'networkidle0' });
await p.waitForFunction('window.__READY_DONE === true', { timeout: 12000 }).catch(()=>{});
console.log(await p.evaluate(() => JSON.stringify({
  equipped: Object.keys(window.app.bags.equipped),
  unfitted: Object.keys(window.app.bags.unfitted || {}),
  cards: document.querySelectorAll('.bag-card').length,
  unfit: document.querySelectorAll('.bag-card.unfit').length,
})));
await b.close();
