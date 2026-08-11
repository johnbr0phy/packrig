/** The Save rig CTA — REDESIGN.md §6. */
import puppeteer from 'puppeteer-core';
const [,,URL,W='1440',H='900',MOB='desktop'] = process.argv;
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--hide-scrollbars','--enable-unsafe-swiftshader']});
const p=await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
p.on('console',m=>{if(m.type()==='error'&&!/ERR_BLOCKED_BY_RESPONSE|net::ERR_/.test(m.text()))errs.push(m.text())});
await p.setViewport({width:+W,height:+H,isMobile:MOB==='mobile',hasTouch:MOB==='mobile'});
await p.goto(URL,{waitUntil:'networkidle0',timeout:60000});
await p.waitForFunction('window.__READY_DONE === true',{timeout:30000}).catch(()=>{});
const w=(ms=600)=>new Promise(r=>setTimeout(r,ms)); await w(900);
const fail=[]; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fail.push(m)};
const save=()=>p.evaluate(()=>{const b=document.querySelector('.save-btn');return{hidden:b.hidden,text:b.textContent.trim(),done:b.classList.contains('is-done')}});

ok((await save()).hidden, 'empty bike: hidden');
await p.evaluate(()=>document.querySelector('.btn.quiet')?.click()); await w(1000);
let s=await save(); ok(!s.hidden && s.text==='Save rig' && !s.done, `bags added: shows "${s.text}"`);
await p.evaluate(()=>document.querySelector('.save-btn').click()); await w(1200);
s=await save(); ok(s.done && /Saved/.test(s.text), `after saving: "${s.text}"`);
ok(await p.evaluate(()=>!!document.querySelector('.toast.on')), 'a toast confirms the save');
ok(await p.evaluate(()=>/Rename/.test(document.querySelector('.toast-act')?.textContent||'')), 'the toast offers Rename');
ok(await p.evaluate(()=>{try{return JSON.parse(localStorage.getItem('packrig_rigs')||'[]').length>0}catch{return false}}), 'signed out, the rig really is in localStorage');
// change the bike -> the CTA comes back
await p.evaluate(()=>document.querySelector('.btn.quiet')?.click()); await w(1000);
s=await save(); ok(!s.done && s.text==='Save rig', 'changing the bike brings the CTA back');
ok(errs.length===0, `no app console errors ${errs.slice(0,2).join(' | ')}`);
await b.close();
console.log(fail.length?`\nFAILED ${fail.length}`:'\nALL PASS');
process.exit(fail.length?1:0);
