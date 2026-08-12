import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 const p=await b.newPage(); await p.setViewport({width:1440,height:900});
 await p.goto('http://localhost:8735/index.html',{waitUntil:'domcontentloaded'});
 await p.waitForFunction('window.__READY_DONE === true',{timeout:40000});
 const w=ms=>new Promise(r=>setTimeout(r,ms)); await w(1500);
 await p.evaluate(()=>window.app.menu.go('loadouts')); await w(1700);
 await p.evaluate(()=>document.querySelector('.pr-btn.is-primary')?.click()); await w(1500);
 console.log(await p.evaluate(()=>{
   const t=document.querySelector('.topbar');
   const n=document.querySelector('.home-up');
   return 'topbar children: '+[...t.children].map(c=>c.className||c.tagName).join(' | ')
     + '\n.home-up: ' + (n? `present, hidden=${n.hidden}, display=${getComputedStyle(n).display}` : 'ABSENT');
 }));
} finally { await b.close(); }
