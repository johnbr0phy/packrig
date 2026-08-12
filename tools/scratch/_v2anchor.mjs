// Acceptance test for the anchored spec column: the counter, kicker, title and
// figure row must land at the same Y for every rig, or the manifest cannot be
// compared by reading the same place twice.
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--hide-scrollbars','--enable-unsafe-swiftshader']});
const p=await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:1});
await p.goto('http://localhost:8735/index.html',{waitUntil:'domcontentloaded'});
await p.waitForFunction('window.__READY_DONE === true',{timeout:30000});
await new Promise(r=>setTimeout(r,1300));
await p.evaluate(()=>window.app.menu.go('loadouts'));
await new Promise(r=>setTimeout(r,1800));
const rows=[];
for(let i=0;i<8;i++){
  await p.evaluate(n=>document.querySelectorAll('.pr-chip')[n].click(), i);
  await new Promise(r=>setTimeout(r,1400));
  rows.push(await p.evaluate(()=>{
    const y=s=>{const n=document.querySelector(s); return n?Math.round(n.getBoundingClientRect().top):null;};
    return {name:document.querySelector('.pr-title')?.textContent,
            counter:y('.pr-counter'), title:y('.pr-title'), figs:y('.pr-figs'),
            manifest:y('.pr-manifest'), btn:y('.pr-btn')};
  }));
}
await b.close();
for(const r of rows) console.log(String(r.name).padEnd(18), 'counter',String(r.counter).padStart(4), 'title',String(r.title).padStart(4), 'figs',String(r.figs).padStart(4), 'manifest',String(r.manifest).padStart(4), 'button',String(r.btn).padStart(4));
const spread=k=>Math.max(...rows.map(r=>r[k]))-Math.min(...rows.map(r=>r[k]));
console.log('\nspread across 8 rigs — counter',spread('counter'),' title',spread('title'),' figs',spread('figs'),' manifest',spread('manifest'),'px');
console.log(spread('title')===0 && spread('figs')===0 ? 'ANCHORED' : 'STILL MOVING');
