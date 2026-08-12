import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--hide-scrollbars','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 const w=ms=>new Promise(r=>setTimeout(r,ms));
 // Where the TEXT starts, not where the padded block starts — a full-width row
 // with 63px of padding reports left=0 and looks like a bug that isn't one.
 const L=s=>p.evaluate(x=>{const n=document.querySelector(x); if(!n)return null;
   const rng=document.createRange(); rng.selectNodeContents(n);
   const r=rng.getBoundingClientRect();
   return Math.round(r.width ? r.left : n.getBoundingClientRect().left);},s);

 // --- A: the bag sheet's spine
 await p.setViewport({width:1440,height:900,deviceScaleFactor:2});
 await p.goto('http://localhost:8735/index.html',{waitUntil:'domcontentloaded'});
 await p.waitForFunction('window.__READY_DONE === true',{timeout:40000}); await w(1400);
 await p.evaluate(()=>window.app.menu.go('loadouts')); await w(1700);
 await p.evaluate(()=>document.querySelector('.pr-btn.is-primary')?.click()); await w(1400);
 await p.evaluate(()=>document.querySelector('.bag-card')?.click()); await w(1400);
 console.log('BAG SHEET  brand', await L('.bs-brand'), ' name', await L('.bs-name'),
   ' specs label', await L('.bs-label'), ' hero', await L('.bs-hero'));
 // --- B: an accent rule under the menu header?
 await p.evaluate(()=>document.querySelector('.sheet-close')?.click()); await w(900);
 await p.evaluate(()=>window.app.menu.open('loadouts')); await w(1700);
 console.log('MENU accent users:', await p.evaluate(()=>{
   const out=[];
   for(const n of document.querySelectorAll('.pr *')){
     const c=getComputedStyle(n);
     const hit=[c.backgroundColor,c.borderTopColor,c.borderBottomColor,c.color]
       .filter(v=>/255,\s*106,\s*43/.test(v));
     if(hit.length){const r=n.getBoundingClientRect();
       out.push(`${n.tagName.toLowerCase()}.${[...n.classList].join('.')} ${Math.round(r.width)}x${Math.round(r.height)}`);}
   }
   const s=getComputedStyle(document.querySelector('.pr-tab.is-on'),'::after');
   out.push('tab::after '+s.width+'x'+s.height+' '+s.backgroundColor);
   return out;}));
 console.log('close hidden on loadouts:', await p.evaluate(()=>document.querySelector('.pr-close')?.hidden));
 await p.evaluate(()=>window.app.menu.go('gallery')); await w(1400);
 console.log('close hidden on gallery :', await p.evaluate(()=>document.querySelector('.pr-close')?.hidden));

 // --- C: can a phone actually reach the builder?
 await p.setViewport({width:393,height:852,deviceScaleFactor:2,isMobile:true,hasTouch:true}); await w(1200);
 await p.evaluate(()=>window.app.menu.open('start')); await w(1500);
 const built = await p.evaluate(()=>{
   const item=document.querySelectorAll('.pr-menu .pr-item')[0];
   if(!item) return 'no start item';
   item.click(); return 'clicked Build a rig';});
 await w(1600);
 console.log('PHONE', built, '-> menu open?', await p.evaluate(()=>window.app.menu.isOpen),
   ' panel visible?', await p.evaluate(()=>{const n=document.querySelector('.panel');
     if(!n) return false; const r=n.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)} at y=${Math.round(r.top)}`;}));
 await p.screenshot({path:process.argv[2]});
 if(errs.length) console.log('ERRORS', errs.slice(0,3));
} finally { await b.close(); }
