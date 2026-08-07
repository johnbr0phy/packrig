import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
await p.goto('http://localhost:8735/?shot=1', { waitUntil: 'networkidle0' });
await p.waitForFunction('window.__READY_DONE === true').catch(()=>{});
console.log(await p.evaluate(() => {
  const { productsForSlot } = window.__cat || {};
  const all = window.app.catalog.flatMap(b => b.products);
  const brompton = all.filter(x => /Brompton/i.test(x.name || ''));
  const rando = window.app.bags.constructor;
  return JSON.stringify({
    inCatalogue: brompton.length,
    marked: brompton.map(x => x.fits),
    randobagOffered: (window.app.catalog.flatMap(b=>b.products).filter(x=>x.slot==='randobag' && (!x.fits||x.fits==='universal'))).length,
    randobagTotal: all.filter(x=>x.slot==='randobag').length,
  });
}));
await b.close();
