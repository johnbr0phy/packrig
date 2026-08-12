import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, args:['--hide-scrollbars'] });
const p = await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,200)));
p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text().slice(0,160))});
await p.setViewport({width:1600,height:1000,deviceScaleFactor:1});
await p.goto('http://localhost:8736/',{waitUntil:'networkidle2',timeout:30000});
await new Promise(r=>setTimeout(r,6000));
for (const k of process.argv.slice(3)) {
  await p.evaluate(x=>document.dispatchEvent(new KeyboardEvent('keydown',{key:x})), k);
  await new Promise(r=>setTimeout(r,900));
}
await new Promise(r=>setTimeout(r,2200));
await p.screenshot({path:process.argv[2]});
console.log('errors:', errs.length?errs.slice(0,6):'none');
console.log('title:', await p.$eval('#title',e=>e.textContent));
await b.close();
