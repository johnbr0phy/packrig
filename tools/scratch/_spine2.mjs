import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 const p=await b.newPage(); await p.setViewport({width:1440,height:900});
 await p.goto('http://localhost:8735/index.html',{waitUntil:'domcontentloaded'});
 await p.waitForFunction('window.__READY_DONE === true',{timeout:40000});
 const w=ms=>new Promise(r=>setTimeout(r,ms)); await w(1400);
 const box=s=>p.evaluate(x=>{const n=document.querySelector(x); if(!n)return null; const r=n.getBoundingClientRect();
   const cs=getComputedStyle(n); return {l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),pl:cs.paddingLeft,fs:cs.fontSize};},s);
 await p.evaluate(()=>window.app.menu.go('loadouts')); await w(1800);
 console.log('MENU  column box   ', JSON.stringify(await box('.pr-spec')));
 console.log('MENU  first элемент', JSON.stringify(await box('.pr-counter')));
 console.log('MENU  title        ', JSON.stringify(await box('.pr-title')));
 console.log('MENU  mount label  ', JSON.stringify(await box('.pr-mmount')));
 console.log('MENU  model        ', JSON.stringify(await box('.pr-mmodel')));
 await p.evaluate(()=>document.querySelector('.pr-btn.is-primary')?.click()); await w(1500);
 console.log('BUILD column box   ', JSON.stringify(await box('.panel')));
 console.log('BUILD rig title    ', JSON.stringify(await box('.rn-title')));
 console.log('BUILD section label', JSON.stringify(await box('.nav-sec-title')));
 console.log('BUILD row meta     ', JSON.stringify(await box('.bag-meta')));
 console.log('BUILD row model    ', JSON.stringify(await box('.bag-model')));
} finally { await b.close(); }
