/**
 * Walks the catalogue all the way down — mount grid, brand list, brand detail,
 * model cards — and asserts each level actually fills the sheet. Phase 1 moved
 * these bodies into the shell and nothing tested below the first level, which
 * is how a catalogue that rendered one 40px card shipped.
 */
import puppeteer from 'puppeteer-core';
const [,,URL,W='1440',H='900',MOB='desktop',SHOT='/tmp/drill.png'] = process.argv;
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--hide-scrollbars','--enable-unsafe-swiftshader']});
const p=await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
p.on('console',m=>{if(m.type()==='error'&&!/ERR_BLOCKED_BY_RESPONSE|net::ERR_/.test(m.text()))errs.push(m.text())});
await p.setViewport({width:+W,height:+H,isMobile:MOB==='mobile',hasTouch:MOB==='mobile'});
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
await p.waitForFunction('window.__READY_DONE === true',{timeout:30000}).catch(()=>{});
const w=(ms=600)=>new Promise(r=>setTimeout(r,ms)); await w(900);
// The root menu is the landing level now; every one of these suites tests the
// builder, so step through it the way a person would rather than reaching past
// it with element.click().
await p.evaluate(()=>document.querySelector('.home-btn.is-primary')?.click());
await new Promise(r=>setTimeout(r,700));
const fail=[]; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fail.push(m)};

// every visible tile in the sheet must be big enough to read
const tiles = () => p.evaluate(()=>{
  const sel='.sheet-body .card, .sheet-body .brand-row, .sheet-body .mount-btn';
  const ns=[...document.querySelectorAll(sel)].filter(n=>n.offsetParent!==null);
  const rs=ns.map(n=>n.getBoundingClientRect());
  const sheet=document.querySelector('.sheet').getBoundingClientRect();
  return {n:ns.length, minW:Math.min(...rs.map(r=>r.width)), maxRight:Math.max(...rs.map(r=>r.right)), sheetRight:sheet.right, sheetW:sheet.width,
          clipped:[...document.querySelectorAll('.sheet-body *')].filter(n=>n.scrollWidth>n.clientWidth+2&&n.clientWidth>0&&getComputedStyle(n).overflowX!=='auto').length};
});
const step = async (label, want) => {
  const t = await tiles();
  // A landscape phone's sheet is narrower than a desktop's, so a fixed pixel
  // floor would fail a card that is in fact half the sheet. Ask for `want`, or
  // 45% of the sheet, whichever is less.
  const min = Math.round(Math.min(want, t.sheetW * 0.45));
  ok(t.n>0, `${label}: has tiles (${t.n})`);
  ok(t.minW>=min, `${label}: smallest tile is ${Math.round(t.minW)}px in a ${Math.round(t.sheetW)}px sheet (needs >= ${min})`);
  ok(t.maxRight<=t.sheetRight+1, `${label}: nothing spills past the sheet edge`);
  ok(t.clipped===0, `${label}: no clipped text (${t.clipped})`);
};

await p.evaluate(()=>document.querySelector('.add-bag')?.click()); await w();
await step('mount grid', 120);
const wentToBrands = await p.evaluate(()=>{
  const n=[...document.querySelectorAll('.sheet-body .mount-btn')].find(x=>/Handlebar roll/i.test(x.textContent));
  if(!n) return false; n.click(); return true;
});
ok(wentToBrands, 'picked a mount point');
await w(700);
await step('brand list', 120);
const opened = await p.evaluate(()=>{const n=document.querySelector('.sheet-body .brand-row'); if(!n)return false; n.click(); return true;});
ok(opened, 'opened a brand');
await w(700);
await step('brand detail', 200);
ok(await p.evaluate(()=>{const c=document.querySelector('.sheet-title')?.textContent?.trim(); const cur=document.querySelector('.crumb.cur')?.textContent?.trim(); return !cur || cur!==c;}), 'the sheet title is not repeated in the breadcrumb');
ok(errs.length===0, `no app console errors ${errs.slice(0,2).join(' | ')}`);
await p.screenshot({path:SHOT});
await b.close();
console.log(fail.length?`\nFAILED ${fail.length}`:'\nALL PASS');
process.exit(fail.length?1:0);
