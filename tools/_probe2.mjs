import puppeteer from 'puppeteer-core';
const url = process.argv[2];
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
p.on('console', m => console.log('[console]', m.type(), m.text()));
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
await p.waitForFunction('window.__READY_DONE === true', { timeout: 12000 }).catch(()=>console.log('[warn] READY never set'));
await b.close();
