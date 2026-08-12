// Screenshot the menu with all TEXT hidden, so the veil-over-scene composite can
// be sampled without antialiased glyph edges polluting the measurement.
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--hide-scrollbars','--enable-unsafe-swiftshader']});
const p=await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:2});
await p.goto('http://localhost:8735/index.html',{waitUntil:'domcontentloaded'});
await p.waitForFunction('window.__READY_DONE === true',{timeout:30000});
await new Promise(r=>setTimeout(r,1400));
if(process.argv[3]==='loadouts'){ await p.evaluate(()=>window.app.menu.go('loadouts')); await new Promise(r=>setTimeout(r,1700)); }
await p.evaluate(e=>{ if(e) window.app.setEnv(e); }, process.argv[4]||'');
await new Promise(r=>setTimeout(r,1800));
await p.addStyleTag({content:'.pr-stage,.pr-head{visibility:hidden!important}'});
await new Promise(r=>setTimeout(r,300));
await p.screenshot({path:process.argv[2]});
await b.close(); console.log('saved',process.argv[2]);
