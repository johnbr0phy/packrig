/**
 * The two bugs reported from a real phone: the sheet would not close, and
 * double-tap zoomed the page and left it there with the top bar off screen.
 */
import puppeteer from 'puppeteer-core';
const [,,URL,W='390',H='780'] = process.argv;
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--hide-scrollbars','--enable-unsafe-swiftshader']});
const p=await b.newPage();
await p.setViewport({width:+W,height:+H,isMobile:true,hasTouch:true,deviceScaleFactor:2});
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
await p.waitForFunction('window.__READY_DONE === true',{timeout:60000}).catch(()=>{});
const w=(ms=700)=>new Promise(r=>setTimeout(r,ms)); await w(1200);
const fail=[]; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fail.push(m)};

await p.evaluate(()=>document.querySelector('.home-btn.is-primary')?.click()); await w();
await p.evaluate(()=>document.querySelector('.btn.quiet')?.click()); await w(1100);

const panelH = () => p.evaluate(()=>Math.round(document.querySelector('.panel').getBoundingClientRect().height));
const open0 = await panelH();
ok(open0 > 200, `the sheet starts open (${open0}px)`);

await p.evaluate(()=>document.querySelector('.panel-head').click()); await w(800);
const closed = await panelH();
ok(closed < 90, `tapping the header closes it (${open0} -> ${closed}px)`);
ok(await p.evaluate(()=>!!document.querySelector('.panel').getBoundingClientRect().height), 'it stays on screen as a peek, not gone');

await p.evaluate(()=>document.querySelector('.panel-head').click()); await w(800);
const open1 = await panelH();
ok(open1 > 200, `tapping again reopens it (${closed} -> ${open1}px)`);

// double-tap must not hand the page to the browser's zoom
const ta = await p.evaluate(()=>{
  const g=s=>{const n=document.querySelector(s);return n?getComputedStyle(n).touchAction:null};
  return {body:g('body'), canvas:g('#scene'), head:g('.panel-head'), btn:g('.save-btn')};
});
ok(/manipulation|none/.test(ta.body||''), `body drops double-tap zoom (touch-action: ${ta.body})`);
ok(ta.canvas === 'none', `the canvas owns its gestures (touch-action: ${ta.canvas})`);
ok(/manipulation|none/.test(ta.btn||''), `buttons drop double-tap zoom (touch-action: ${ta.btn})`);

// and the top bar is where it should be, at the top, on screen
const bar = await p.evaluate(()=>{const r=document.querySelector('.topbar').getBoundingClientRect();return {top:Math.round(r.top),bottom:Math.round(r.bottom)}});
ok(bar.top >= -1 && bar.bottom > 0, `the top bar is on screen (top ${bar.top})`);

await p.screenshot({path:'/tmp/phonebugs.png'});
await b.close();
console.log(fail.length?`\nFAILED ${fail.length}`:'\nALL PASS');
process.exit(fail.length?1:0);
