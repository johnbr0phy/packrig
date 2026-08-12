import puppeteer from 'puppeteer-core';
const [url,out,script,w='1440',h='900']=process.argv.slice(2);
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--hide-scrollbars','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:+w,height:+h,deviceScaleFactor:2});
await p.goto(url,{waitUntil:'domcontentloaded'});
await p.waitForFunction('window.__READY_DONE === true',{timeout:30000});
const wt=(ms)=>new Promise(r=>setTimeout(r,ms)); await wt(1300);
await p.evaluate(()=>window.app.menu.go('loadouts')); await wt(1700);
await p.evaluate(()=>document.querySelector('.pr-btn.is-primary').click()); await wt(1400);
if(script) for(const s of script.split('|')){ await p.evaluate(x=>document.querySelector(x)?.click(),s); await wt(1300); }
await p.screenshot({path:out}); await b.close(); console.log('saved',out);
