import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--hide-scrollbars','--enable-unsafe-swiftshader']});
const p=await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text());});
await p.setViewport({width:1440,height:900,deviceScaleFactor:1});
await p.goto('http://localhost:8735/index.html',{waitUntil:'domcontentloaded'});
await p.waitForFunction('window.__READY_DONE === true',{timeout:30000});
const w=(ms=900)=>new Promise(r=>setTimeout(r,ms));
await w(1200);
const state=()=>p.evaluate(()=>({
  view: window.app.menu?.view, open: window.app.menu?.isOpen,
  bags: Object.keys(window.app.bags.equipped).length,
  visible: !document.querySelector('.pr')?.hidden,
  title: document.querySelector('.pr-title')?.textContent || null,
  rows: document.querySelectorAll('.pr-mrow').length,
  chips: document.querySelectorAll('.pr-chip').length,
  closeHidden: document.querySelector('.pr-close')?.hidden,
  panelName: document.querySelector('.rn-title')?.textContent || null,
}));
const click=async(sel)=>{const ok=await p.evaluate(s=>{const n=document.querySelector(s);if(n){n.click();return true}return false},sel); if(!ok)throw new Error('no selector '+sel); await w();};
const key=async(k)=>{await p.keyboard.press(k); await w();};
const log=async(label)=>console.log(label.padEnd(30), JSON.stringify(await state()));

await log('1 boot');
await click('.pr-menu .pr-menu-li:nth-child(2) .pr-item');   // Loadouts
await log('2 loadouts');
await click('.pr-rail .pr-chip:nth-child(3)');
await log('3 chip 3');
await key('ArrowRight');
await log('4 arrow right');
await click('.pr-btn.is-primary');                            // Build on this
await log('5 adopted');
await click('.wordmark');                                     // the wordmark IS the way home now
await log('6 back to menu');
await click('.pr-tabs .pr-tab:nth-child(3)');                 // Gallery
await log('7 gallery');
await key('Escape');
await log('8 esc -> start');
await key('Escape');
await log('9 esc -> close');
await click('.wordmark');                                     // the logo
await log('10 wordmark -> menu');
await b.close();
if(errs.length){console.log('\nERRORS:'); errs.slice(0,10).forEach(e=>console.log(' ',e)); process.exit(1);}
console.log('\nno console errors');
