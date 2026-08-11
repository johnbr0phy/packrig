/**
 * Saved rigs as the top level of the left column: find one, open it, come back.
 * The flow the old UI made hard — rigs were behind your own email address in a
 * sheet, and saving made a new copy every time.
 */
import puppeteer from 'puppeteer-core';
const [,,URL,W='1440',H='900',MOB='desktop'] = process.argv;
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--hide-scrollbars','--enable-unsafe-swiftshader']});
const p=await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
p.on('console',m=>{if(m.type()==='error'&&!/ERR_BLOCKED_BY_RESPONSE|net::ERR_/.test(m.text()))errs.push(m.text())});
await p.setViewport({width:+W,height:+H,isMobile:MOB==='mobile',hasTouch:MOB==='mobile'});
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
await p.waitForFunction('window.__READY_DONE === true',{timeout:60000}).catch(()=>{});
const w=(ms=800)=>new Promise(r=>setTimeout(r,ms)); await w(1200);
const fail=[]; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fail.push(m)};
const click=async s=>{const r=await p.evaluate(x=>{const n=document.querySelector(x);if(!n)return false;n.click();return true},s);await w(900);return r};
const level=()=>p.evaluate(()=>document.querySelector('.panel')?.dataset.level);
const rows=()=>p.evaluate(()=>document.querySelectorAll('.rn-row').length);

await p.evaluate(()=>localStorage.removeItem('packrig_rigs'));
await click('.home-btn.is-primary');
ok(await level()==='rig', 'Create new rig lands you in a rig, not a list');
ok(await p.evaluate(()=>!document.querySelector('.acct-btn')?.textContent.includes('My rigs')), 'the account button no longer pretends to be where rigs live');

await click('.btn.quiet');                     // Surprise me
await click('.save-btn');
ok(await p.evaluate(()=>/Saved/.test(document.querySelector('.save-btn')?.textContent||'')), 'saving marks the rig saved');

// rename in place, from the bar
await click('.rn-title');
await p.evaluate(()=>{const i=document.querySelector('.rn-rename'); i.value='Highland overnighter'; i.dispatchEvent(new Event('input'));});
await p.keyboard.press('Enter'); await w(700);
ok(await p.evaluate(()=>document.querySelector('.rn-title')?.textContent==='Highland overnighter'), 'the rig name is renamed where you read it');

// back to the list
await click('.rn-back');
ok(await level()==='list', 'back goes up to the list');
ok(await rows()===1, `the saved rig is in the list (${await rows()})`);
ok(await p.evaluate(()=>/Highland overnighter/.test(document.querySelector('.rn-row')?.textContent||'')), 'under its own name, not an email address');
ok(await p.evaluate(()=>{const b=document.querySelector('.save-btn');return !b||b.hidden}), 'no Save rig at the list level — there is no rig open to save');

// a second rig
await click('.rn-new');
ok(await level()==='rig', 'New rig opens an empty rig');
ok(await p.evaluate(()=>document.querySelectorAll('.bag-card').length)===0, 'and the bike is clear');
await click('.btn.quiet');
await click('.save-btn'); await w(700);
await click('.rn-back');
ok(await rows()===2, `both rigs are listed (${await rows()})`);

// saving an open rig UPDATES it rather than making a copy
await click('.rn-row');
ok(await level()==='rig', 'tapping a rig opens it');
const bags = await p.evaluate(()=>document.querySelectorAll('.bag-card').length);
ok(bags>0, `it loads onto the bike (${bags} bags)`);
await p.evaluate(()=>window.app.bags.randomKit(5)); await p.evaluate(()=>window.app.ui.sync()); await w(600);
await click('.save-btn'); await w(800);
await click('.rn-back');
ok(await rows()===2, `saving an open rig updates it instead of making a copy (${await rows()})`);

ok(errs.length===0, `no app console errors ${errs.slice(0,2).join(' | ')}`);
await p.screenshot({path:`/tmp/rignav-${W}.png`});
await b.close();
console.log(fail.length?`\nFAILED ${fail.length}`:'\nALL PASS');
process.exit(fail.length?1:0);
