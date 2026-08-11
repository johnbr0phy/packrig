import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--hide-scrollbars','--enable-unsafe-swiftshader']});
const p=await b.newPage();
await p.setViewport({width:+process.argv[3],height:+process.argv[4],deviceScaleFactor:2,isMobile:process.argv[5]==='mobile',hasTouch:process.argv[5]==='mobile'});
await p.goto(process.argv[2],{waitUntil:'networkidle0',timeout:60000});
await p.waitForFunction('window.__READY_DONE === true',{timeout:30000}).catch(()=>{});
await new Promise(r=>setTimeout(r,1000));
if(process.argv[7]) for(const sel of process.argv[7].split('|')){ await p.evaluate(s=>document.querySelector(s)?.click(),sel); await new Promise(r=>setTimeout(r,1200)); }
await p.screenshot({path:process.argv[6]});
await b.close(); console.log('saved',process.argv[6]);
