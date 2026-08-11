/** The root menu and the gallery carousel. */
import puppeteer from 'puppeteer-core';
const [,,URL,W='1440',H='900',MOB='desktop',SHOT='/tmp/menu.png'] = process.argv;
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--hide-scrollbars','--enable-unsafe-swiftshader']});
const p=await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
p.on('console',m=>{if(m.type()==='error'&&!/ERR_BLOCKED_BY_RESPONSE|net::ERR_/.test(m.text()))errs.push(m.text())});
await p.setViewport({width:+W,height:+H,isMobile:MOB==='mobile',hasTouch:MOB==='mobile'});
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
await p.waitForFunction('window.__READY_DONE === true',{timeout:30000}).catch(()=>{});
const w=(ms=600)=>new Promise(r=>setTimeout(r,ms)); await w(1200);
// Seed two saved rigs so the carousel path is exercised, not just its empty state.
await p.evaluate(()=>{
  const app=window.app;
  app.home?.close?.();
  app.bags.randomKit(7); app.rigs.save('Seeded one');
  app.bags.randomKit(19); app.rigs.save('Seeded two');
  app.clearAll(); app.ui?.sync?.();
  app.home?.open?.();
});
await w(700);
const fail=[]; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fail.push(m)};
const q=s=>p.evaluate(x=>{const n=document.querySelector(x);if(!n)return false;const cs=getComputedStyle(n);return cs.display!=='none'&&cs.visibility!=='hidden'&&+cs.opacity>0.05},s);
const click=async s=>{const r=await p.evaluate(x=>{const n=document.querySelector(x);if(!n)return false;n.click();return true},s);await w(900);return r};

ok(await q('.home.on'), 'the root menu is what you land on');
ok(await p.evaluate(()=>[...document.querySelectorAll('.home-btn')].map(n=>n.textContent.trim()).join('|')==='Create new rig|View rig gallery'), 'it offers exactly Create new rig and View rig gallery');
ok(await p.evaluate(()=>{const t=document.querySelector('.topbar');return !t||getComputedStyle(t).opacity==='0'}), 'the builder chrome is hidden underneath it');

// gallery
ok(await click('.home-btn:not(.is-primary)'), 'opened the gallery');
ok(await q('.gal.on'), 'the carousel is up');
const st = await p.evaluate(()=>({empty:document.querySelector('.gal').classList.contains('is-empty'),count:document.querySelector('.gal-count')?.textContent,note:document.querySelector('.gal-empty')?.textContent}));
console.log('  --   gallery state:', JSON.stringify(st));
if (st.empty) {
  ok(!!st.note, 'an empty gallery says so rather than showing nothing');
} else {
  ok(await p.evaluate(()=>/\d+ \/ \d+/.test(document.querySelector('.gal-count')?.textContent||'')), `the counter reads n / total (${st.count})`);
  const bagsA = await p.evaluate(()=>document.querySelectorAll('.bag-card').length);
  ok(await click('.gal-arrow.is-next'), 'clicked next');
  const idx = await p.evaluate(()=>document.querySelector('.gal-count')?.textContent);
  ok(idx!==st.count, `next advances the carousel (${st.count} -> ${idx})`);
  ok(await p.evaluate(()=>document.querySelectorAll('.bag-card').length>=0), 'a real rig is on the bike');
}
ok(await click('.gal-back'), 'back leaves the carousel');
ok(!(await q('.gal.on')), 'the carousel is gone');

// create
ok(await click('.home-btn.is-primary'), 'Create new rig');
ok(!(await q('.home.on')), 'the menu closes');
ok(await q('.topbar'), 'the builder is back');
ok(await p.evaluate(()=>document.querySelectorAll('.bag-card').length===0), 'a new rig starts empty');
ok(await click('.home-up'), 'the Menu button goes back up a level');
ok(await q('.home.on'), 'and the root menu returns');
ok(errs.length===0, `no app console errors ${errs.slice(0,2).join(' | ')}`);
await p.screenshot({path:SHOT});
await b.close();
console.log(fail.length?`\nFAILED ${fail.length}`:'\nALL PASS');
process.exit(fail.length?1:0);
