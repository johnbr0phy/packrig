import puppeteer from 'puppeteer-core';
const [env,out,view] = process.argv.slice(2);
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--hide-scrollbars','--enable-unsafe-swiftshader']});
const p=await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:2});
await p.goto('http://localhost:8735/index.html',{waitUntil:'domcontentloaded'});
await p.waitForFunction('window.__READY_DONE === true',{timeout:30000});
await new Promise(r=>setTimeout(r,1300));
if(view==='loadouts'){ await p.evaluate(()=>window.app.menu.go('loadouts')); await new Promise(r=>setTimeout(r,1600)); }
await p.evaluate(e=>window.app.setEnv(e), env);
await new Promise(r=>setTimeout(r,2200));
await p.screenshot({path:out});
await b.close(); console.log('saved',out);
