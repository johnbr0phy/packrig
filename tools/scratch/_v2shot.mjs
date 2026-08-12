import puppeteer from 'puppeteer-core';
const [url,w,h,mode,out,clicks,seed] = process.argv.slice(2);
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--hide-scrollbars','--enable-unsafe-swiftshader']});
const p=await b.newPage();
const errs=[];
p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
await p.setViewport({width:+w,height:+h,deviceScaleFactor:2,isMobile:mode==='mobile',hasTouch:mode==='mobile'});
await p.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
await p.waitForFunction('window.__READY_DONE === true',{timeout:30000}).catch(()=>{});
await new Promise(r=>setTimeout(r,1300));
if(seed==='rigs'){
  await p.evaluate(async()=>{const a=window.app;a.menu?.close?.();
    a.bags.randomKit(7); await a.rigs.save('Highland overnighter');
    a.bags.randomKit(19); await a.rigs.save('Race setup');
    a.bags.randomKit(31); await a.rigs.save('Full tour');
    a.bags.randomKit(5);  await a.rigs.save('Winter commuter');
    a.clearAll(); a.ui?.sync?.(); a.menu?.open?.('start');});
  await new Promise(r=>setTimeout(r,900));
}
if(clicks) for(const s of clicks.split('|')){
  if(s.startsWith('wait:')){ await new Promise(r=>setTimeout(r,+s.slice(5))); continue; }
  const ok = await p.evaluate(x=>{const n=document.querySelector(x); if(n){n.click(); return true;} return false;},s);
  if(!ok) errs.push('NO SUCH SELECTOR: '+s);
  await new Promise(r=>setTimeout(r,1400));
}
await p.screenshot({path:out});
await b.close();
console.log('saved',out);
if(errs.length){console.log('--- console errors ---'); errs.slice(0,12).forEach(e=>console.log(' ',e));}
