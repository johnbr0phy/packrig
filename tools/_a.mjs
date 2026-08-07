import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
await p.goto('http://localhost:8735/?shot=1', { waitUntil: 'networkidle0' });
await p.waitForFunction('window.__READY_DONE === true').catch(()=>{});
console.log(await p.evaluate(() => {
  const a = window.app.bike.anchors;
  const f = (n) => a[n] ? `${n}: x=${a[n].position.x.toFixed(0)} y=${a[n].position.y.toFixed(0)}` : `${n}: MISSING`;
  return [f('toptube'), f('toptubeRear'), `seatTop x=${window.app.bike.points.seatTop.x.toFixed(0)}`].join('\n');
}));
await b.close();
