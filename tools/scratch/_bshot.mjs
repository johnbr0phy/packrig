// Screenshot a builder surface. Enters the builder via a loadout so the panel
// has real content, then runs an arbitrary click/eval script.
import puppeteer from 'puppeteer-core';
const [out, script, w='1440', h='900', mode='desktop'] = process.argv.slice(2);
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--hide-scrollbars','--enable-unsafe-swiftshader']});
const p=await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
await p.setViewport({width:+w,height:+h,deviceScaleFactor:2,isMobile:mode==='mobile',hasTouch:mode==='mobile'});
await p.goto('http://localhost:8735/index.html',{waitUntil:'domcontentloaded'});
await p.waitForFunction('window.__READY_DONE === true',{timeout:30000});
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
await wait(1300);
await p.evaluate(()=>window.app.menu.go('loadouts'));
await wait(1700);
await p.evaluate(()=>document.querySelector('.pr-btn.is-primary').click());
await wait(1400);
if(script) for(const step of script.split('|')){
  if(step.startsWith('wait:')) { await wait(+step.slice(5)); continue; }
  if(step.startsWith('js:'))  { await p.evaluate(s=>eval(s), step.slice(3)); await wait(1100); continue; }
  const ok=await p.evaluate(s=>{const n=document.querySelector(s); if(n){n.click();return true} return false}, step);
  if(!ok) errs.push('NO SELECTOR '+step);
  await wait(1200);
}
await p.screenshot({path:out});
await b.close();
console.log('saved',out);
if(errs.length) errs.slice(0,6).forEach(e=>console.log('  ',e));
