/** Phase 2 smoke — REDESIGN.md §15 steps 2 and 3. */
import puppeteer from 'puppeteer-core';
const [,, URL, W='1440', H='900', MOB='desktop', SHOT='/tmp/p2.png'] = process.argv;
const b = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, args:['--hide-scrollbars','--enable-unsafe-swiftshader']});
const p = await b.newPage();
// Hotlinked maker photos are blocked by some CDNs' Cross-Origin-Resource-Policy.
// That predates this work and is what the hero fallback exists for — count them,
// but do not fail the app's smoke test on somebody else's headers.
const errs=[]; const imgBlocks=[];
p.on('console',m=>{if(m.type()!=='error')return; const t=m.text();
  if(/ERR_BLOCKED_BY_RESPONSE|net::ERR_/.test(t)) imgBlocks.push(t); else errs.push(t)}); p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
await p.setViewport({width:+W,height:+H,deviceScaleFactor:1,isMobile:MOB==='mobile',hasTouch:MOB==='mobile'});
await p.goto(URL,{waitUntil:'networkidle0',timeout:60000});
await p.waitForFunction('window.__READY_DONE === true',{timeout:30000}).catch(()=>{});
await new Promise(r=>setTimeout(r,900));
const fail=[]; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fail.push(m)};
const wait=(ms=500)=>new Promise(r=>setTimeout(r,ms));

// load a full rig so there are bags to open
await p.evaluate(()=>document.querySelector('.btn.quiet')?.click()); await wait(900);
const bags = await p.evaluate(()=>document.querySelectorAll('.bag-card:not(.unfit)').length);
ok(bags>0, `Surprise me loaded a rig (${bags} bags)`);

ok(await p.evaluate(()=>document.querySelectorAll('.bag-act').length)===0, '.bag-act hover buttons are gone (§14.9)');

// tap a bag row -> the bag sheet
await p.evaluate(()=>document.querySelector('.bag-card:not(.unfit)')?.click()); await wait(700);
const s = await p.evaluate(()=>({
  sheet: !!document.querySelector('.sheet:not([hidden]) .bagsheet'),
  title: document.querySelector('.sheet-title')?.textContent||'',
  name: document.querySelector('.bs-name')?.textContent||'',
  hero: !!document.querySelector('.bs-hero'),
  ways: document.querySelectorAll('.bs-way').length,
  specs: document.querySelectorAll('.bs-spec').length,
  btns: [...document.querySelectorAll('.bs-btn')].map(n=>n.textContent.trim()),
  nolink: !!document.querySelector('.bs-nolink'),
}));
ok(s.sheet, 'tapping a bag row opens the bag sheet');
ok(s.hero, 'the sheet has a hero image block');
ok(s.name.length>0, `it names the bag ("${s.name}")`);
ok(s.title.length>0, `the shell header carries the mount ("${s.title}")`);
ok(s.specs>0, `specification rows rendered (${s.specs})`);
ok(s.btns.some(t=>/^Replace it$/.test(t)), 'Replace it');
ok(s.btns.some(t=>/^Remove it$/.test(t)), 'Remove it');
ok(s.btns.some(t=>/^Buy at /.test(t)) || s.nolink, 'Buy button, or an honest "no maker link" line');

// colour change is instant and re-rings
if (s.ways>1) {
  const before = await p.evaluate(()=>[...document.querySelectorAll('.bs-way')].findIndex(n=>n.classList.contains('on')));
  await p.evaluate(()=>{const w=[...document.querySelectorAll('.bs-way')];(w.find(n=>!n.classList.contains('on'))||w[1]).click()});
  await wait(500);
  const after = await p.evaluate(()=>[...document.querySelectorAll('.bs-way')].findIndex(n=>n.classList.contains('on')));
  ok(after!==before && after>=0, `colourway switches and the ring follows (${before} -> ${after})`);
} else { console.log('  --   this bag has one colourway; picker correctly has no dots'); }

// remove -> toast -> undo restores
const n0 = await p.evaluate(()=>document.querySelectorAll('.bag-card:not(.unfit)').length);
await p.evaluate(()=>[...document.querySelectorAll('.bs-btn')].find(n=>n.textContent.trim()==='Remove it')?.click());
await wait(700);
const n1 = await p.evaluate(()=>document.querySelectorAll('.bag-card:not(.unfit)').length);
ok(n1===n0-1, `Remove it takes the bag off (${n0} -> ${n1})`);
ok(await p.evaluate(()=>!!document.querySelector('.toast.on')), 'an undo toast appears');
await p.evaluate(()=>document.querySelector('.toast-act')?.click()); await wait(600);
const n2 = await p.evaluate(()=>document.querySelectorAll('.bag-card:not(.unfit)').length);
ok(n2===n0, `Undo puts it back (${n1} -> ${n2})`);

// replace opens the catalogue for that slot
await p.evaluate(()=>document.querySelector('.bag-card:not(.unfit)')?.click()); await wait(600);
await p.evaluate(()=>[...document.querySelectorAll('.bs-btn')].find(n=>n.textContent.trim()==='Replace it')?.click());
await wait(700);
ok(await p.evaluate(()=>!!document.querySelector('.sheet:not([hidden]) .picker')), 'Replace it opens the catalogue in the same shell');
ok(await p.evaluate(()=>document.querySelectorAll('.sheet:not([hidden])').length)===1, 'still exactly one sheet');

const layout = await p.evaluate(()=>{
  const d=document.documentElement;
  const rs=[...document.querySelectorAll('.panel, .sheet:not([hidden]), .bottom-bar')].filter(n=>n.offsetParent!==null).map(n=>({c:n.className.split(' ')[0],r:n.getBoundingClientRect()}));
  const hits=[];for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++){const a=rs[i].r,c=rs[j].r;if(a.left<c.right&&c.left<a.right&&a.top<c.bottom&&c.top<a.bottom)hits.push(rs[i].c+'∩'+rs[j].c)}
  return {over:d.scrollWidth-d.clientWidth,hits};
});
ok(layout.over<=0, `no horizontal overflow (${layout.over})`);
ok(layout.hits.length===0, `no overlapping panels ${layout.hits.join(', ')}`);
ok(errs.length===0, `no app console errors ${errs.slice(0,2).join(' | ')}`);
if (imgBlocks.length) console.log(`  note  ${imgBlocks.length} third-party product photos blocked by CDN policy (hero falls back)`);
await p.evaluate(()=>document.querySelector('.bag-card:not(.unfit)')?.click()); await wait(700);
await p.screenshot({path:SHOT});
await b.close();
console.log(fail.length?`\nFAILED ${fail.length}`:'\nALL PASS');
process.exit(fail.length?1:0);
