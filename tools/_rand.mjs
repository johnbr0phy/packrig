import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
p.on('pageerror', e => console.log('[pageerror]', e.stack || e.message));
p.on('console', m => { if (m.type()==='warning' && m.text().includes('[bags]')) console.log('  ', m.text()); });
await p.goto('http://localhost:8735/', { waitUntil: 'networkidle0' });
await p.waitForFunction('window.__READY_DONE === true').catch(()=>{});
for (let i=0;i<25;i++){ await p.click('.btn.quiet'); await new Promise(r=>setTimeout(r,220)); }
await new Promise(r=>setTimeout(r,500));
console.log(await p.evaluate(() => JSON.stringify({
  equipped: Object.keys(window.app.bags.equipped),
  unfitted: Object.keys(window.app.bags.unfitted || {}),
  panelCards: document.querySelectorAll('.bag-card').length,
  panelUnfit: document.querySelectorAll('.bag-card.unfit').length,
  headerCount: document.querySelector('.panel-count')?.textContent,
}, null, 1)));
await b.close();
