import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 const p=await b.newPage(); await p.setViewport({width:1440,height:900});
 await p.goto('http://localhost:8735/index.html',{waitUntil:'domcontentloaded'});
 await p.waitForFunction('window.__READY_DONE === true',{timeout:40000});
 const w=ms=>new Promise(r=>setTimeout(r,ms)); await w(1400);
 await p.evaluate(()=>window.app.menu.go('loadouts')); await w(1700);
 await p.evaluate(()=>document.querySelector('.pr-btn.is-primary')?.click()); await w(1400);
 await p.evaluate(()=>document.querySelector('.bag-card')?.click()); await w(1500);
 console.log(await p.evaluate(()=>{
   const out=[];
   const walk=(n,d)=>{ if(d>4) return;
     const r=n.getBoundingClientRect(); const c=getComputedStyle(n);
     out.push('  '.repeat(d)+n.tagName.toLowerCase()+(n.className&&typeof n.className==='string'?'.'+n.className.trim().split(/\s+/).join('.'):'')
       +`   x=${Math.round(r.left)} w=${Math.round(r.width)} padL=${c.paddingLeft}`);
     for(const k of n.children) walk(k,d+1); };
   const s=document.querySelector('.sheet-body'); if(s) walk(s,0);
   return out.join('\n');}));
} finally { await b.close(); }
