import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--hide-scrollbars','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 const p=await b.newPage(); const errs=[];
 p.on('pageerror',e=>errs.push(e.message));
 await p.setViewport({width:1440,height:900,deviceScaleFactor:2});
 await p.goto('https://johnbr0phy.github.io/packrig/',{waitUntil:'domcontentloaded'});
 await p.waitForFunction('window.__READY_DONE === true',{timeout:45000});
 const w=ms=>new Promise(r=>setTimeout(r,ms)); await w(1600);
 await p.evaluate(()=>window.app.menu.go('loadouts')); await w(1800);
 await p.evaluate(()=>document.querySelector('.pr-btn.is-primary')?.click()); await w(1500);
 const spine=await p.evaluate(()=>{const a=document.querySelector('.panel').getBoundingClientRect();
   const t=document.querySelector('.nav-sec-title')?.getBoundingClientRect();
   return `panel ${Math.round(a.width)}px wide, section label at x=${Math.round(t?.left)}`;});
 console.log(spine);
 await p.evaluate(()=>document.querySelector('.add-bag')?.click()); await w(1300);
 await p.evaluate(()=>document.querySelector('.mount-btn')?.click()); await w(1600);
 await p.evaluate(()=>document.querySelector('.cat-chip')?.click()); await w(900);
 console.log(await p.evaluate(()=>{const pop=document.querySelector('.cat-pop');
   if(!pop) return 'popover ABSENT';
   const c=getComputedStyle(pop), r=pop.getBoundingClientRect();
   return `popover ${Math.round(r.width)}x${Math.round(r.height)} at x=${Math.round(r.left)}, bg ${c.backgroundColor}, ${document.querySelectorAll('.cat-opt').length} options`;}));
 await p.screenshot({path:process.argv[2]});
 console.log(errs.length?'ERRORS '+errs.slice(0,3).join(' | '):'no page errors');
} finally { await b.close(); }
