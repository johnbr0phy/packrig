import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 const p=await b.newPage(); await p.setViewport({width:1440,height:900});
 await p.goto('http://localhost:8735/index.html',{waitUntil:'domcontentloaded'});
 await p.waitForFunction('window.__READY_DONE === true',{timeout:40000});
 const w=ms=>new Promise(r=>setTimeout(r,ms)); await w(1400);
 await p.evaluate(()=>window.app.menu.go('loadouts')); await w(1700);
 await p.evaluate(()=>document.querySelector('.pr-btn.is-primary')?.click()); await w(1400);
 await p.evaluate(()=>document.querySelector('.add-bag')?.click()); await w(1200);
 await p.evaluate(()=>document.querySelector('.mount-btn')?.click()); await w(1500);
 console.log(await p.evaluate(()=>{
   const out=[];
   const add=(s)=>{const n=document.querySelector(s); if(!n){out.push(s+': absent'); return;}
     const r=n.getBoundingClientRect(), c=getComputedStyle(n);
     out.push(`${s.padEnd(26)} left ${String(Math.round(r.left)).padStart(4)}  w ${String(Math.round(r.width)).padStart(4)}  padL ${c.paddingLeft}  marL ${c.marginLeft}`);};
   ['.sheet','.sheet-head','.sheet-title','.sheet-body','.sheet-body > .picker','.cat-search','.cat-q','.cat-facets','.cat-chip','.cat-count','.cards','.card','.card .brand','.cat-pop'].forEach(add);
   return out.join('\n');
 }));
} finally { await b.close(); }
