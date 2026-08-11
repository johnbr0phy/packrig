import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader','--hide-scrollbars']});
const p=await b.newPage(); await p.setViewport({width:1440,height:900,deviceScaleFactor:2});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(process.argv[2],{waitUntil:'networkidle0',timeout:60000});
await p.waitForFunction('window.__READY_DONE === true',{timeout:30000}).catch(()=>{});
await new Promise(r=>setTimeout(r,900));
await p.evaluate(()=>document.querySelector('.btn.quiet')?.click()); await new Promise(r=>setTimeout(r,1400));
await p.evaluate(()=>{const t=[...document.querySelectorAll('.tool-btn')].pop(); t?.click();});
await p.waitForFunction(()=>{const n=document.querySelector('.grade-letter');return n&&n.textContent.trim()&&n.textContent.trim()!=='\u2014'},{timeout:30000}).catch(()=>{});
await new Promise(r=>setTimeout(r,900));
console.log(JSON.stringify(await p.evaluate(()=>{
  const secs=[...document.querySelectorAll('.aero-sec')].map(n=>n.className.replace('aero-sec ','').trim());
  return {first:secs[0], secs:secs.slice(0,4), letter:document.querySelector('.grade-letter')?.textContent,
          name:document.querySelector('.grade-name')?.textContent, blurb:document.querySelector('.grade-blurb')?.textContent};
})));
console.log('errors:',errs.slice(0,2));
await p.screenshot({path:process.argv[3]});
await b.close(); console.log('saved',process.argv[3]);
