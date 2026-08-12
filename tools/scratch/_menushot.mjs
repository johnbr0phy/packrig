import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--hide-scrollbars','--enable-unsafe-swiftshader']});
const p=await b.newPage();
await p.setViewport({width:+process.argv[3],height:+process.argv[4],deviceScaleFactor:2,isMobile:process.argv[5]==='mobile',hasTouch:process.argv[5]==='mobile'});
await p.goto(process.argv[2],{waitUntil:'domcontentloaded',timeout:60000});
await p.waitForFunction('window.__READY_DONE === true',{timeout:30000}).catch(()=>{});
await new Promise(r=>setTimeout(r,1200));
await p.evaluate(()=>{const a=window.app;a.home?.close?.();a.bags.randomKit(7);a.rigs.save('Highland overnighter');a.bags.randomKit(19);a.rigs.save('Race setup');a.bags.randomKit(31);a.rigs.save('Full tour');a.clearAll();a.ui?.sync?.();a.home?.open?.();});
await new Promise(r=>setTimeout(r,900));
if(process.argv[7]) for(const s of process.argv[7].split('|')){ await p.evaluate(x=>document.querySelector(x)?.click(),s); await new Promise(r=>setTimeout(r,1400)); }
await p.screenshot({path:process.argv[6]});
await b.close(); console.log('saved',process.argv[6]);
