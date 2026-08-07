import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args:['--hide-scrollbars'] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await p.goto(process.argv[2], { waitUntil: 'networkidle0', timeout: 30000 });
await p.waitForFunction('window.__READY_DONE === true', { timeout: 15000 }).catch(()=>{});
await new Promise(r=>setTimeout(r,600));
if (process.argv[4]) { for (const sel of process.argv[4].split('|')) { await p.click(sel).catch(e=>console.log('click fail',sel)); await new Promise(r=>setTimeout(r,450)); } }
await p.screenshot({ path: process.argv[3] });
await b.close();
console.log('saved', process.argv[3]);
