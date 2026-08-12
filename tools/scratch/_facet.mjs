import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--hide-scrollbars','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 const p=await b.newPage(); const errs=[];
 p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
 await p.setViewport({width:1440,height:900,deviceScaleFactor:2});
 await p.goto('http://localhost:8735/index.html',{waitUntil:'domcontentloaded'});
 await p.waitForFunction('window.__READY_DONE === true',{timeout:40000});
 const w=ms=>new Promise(r=>setTimeout(r,ms)); await w(1400);
 await p.evaluate(()=>window.app.menu.go('loadouts')); await w(1700);
 await p.evaluate(()=>document.querySelector('.pr-btn.is-primary')?.click()); await w(1400);
 await p.evaluate(()=>document.querySelector('.add-bag')?.click()); await w(1200);
 await p.evaluate(()=>document.querySelector('.mount-btn')?.click()); await w(1500);
 console.log('chips:', await p.evaluate(()=>[...document.querySelectorAll('.cat-chip')].map(n=>n.textContent.trim())));
 await p.evaluate(()=>document.querySelector('.cat-chip')?.click()); await w(900);
 const info = await p.evaluate(()=>{
   const pop=document.querySelector('.cat-pop');
   if(!pop) return {found:false};
   const r=pop.getBoundingClientRect(); const cs=getComputedStyle(pop);
   // what is actually painted at the popover's centre?
   const el=document.elementFromPoint(Math.round(r.left+r.width/2), Math.round(r.top+20));
   return {found:true, rect:{l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)},
     bg:cs.backgroundColor, z:cs.zIndex, pos:cs.position, vis:cs.visibility, op:cs.opacity,
     opts:document.querySelectorAll('.cat-opt').length,
     topmost: el ? el.tagName.toLowerCase()+'.'+[...el.classList].join('.') : null,
     clippedBy: (()=>{ for(let n=pop.parentElement;n;n=n.parentElement){ const c=getComputedStyle(n);
       if(/auto|hidden|scroll/.test(c.overflow+c.overflowY+c.overflowX)) return n.tagName.toLowerCase()+'.'+[...n.classList].join('.'); } return null; })() };
 });
 console.log('popover:', JSON.stringify(info,null,1));
 await p.screenshot({path:process.argv[2]});
 if(errs.length) console.log(errs.slice(0,5));
} finally { await b.close(); }
