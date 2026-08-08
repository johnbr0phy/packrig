/**
 * Flow A end-to-end, counting the clicks a person would actually make.
 * The claim is 1 open + N picks for N bags; this proves or breaks it.
 */
import puppeteer from 'puppeteer-core';
const URL = process.argv[2] || 'http://localhost:8735/';
const b = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true });
const p = await b.newPage();
await p.setViewport({ width:1600, height:950 });
const errs=[]; p.on('pageerror',e=>errs.push(e.stack||e.message));
await p.goto(URL,{waitUntil:'networkidle0',timeout:120000});
await p.waitForFunction('window.__READY_DONE === true',{timeout:60000}).catch(()=>{});
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
await wait(1500);

let clicks = 0;
const click = async (sel, i=0) => {
  const n = await p.$$(sel);
  if (!n[i]) throw new Error('no element for ' + sel + ' #' + i);
  await n[i].click(); clicks++; await wait(340);
};

await click('.add-bag');                       // 1 · open the workbench
const state = () => p.evaluate(() => ({
  open: !!document.querySelector('.wb'),
  current: document.querySelector('.wb-slot.is-current .wb-slot-name')?.textContent || null,
  fitted: document.querySelectorAll('.wb-slot.is-fitted').length,
  count: document.querySelector('.wb-count')?.textContent,
  title: document.querySelector('.sheet-title')?.textContent,
  cards: document.querySelectorAll('.wb-card').length,
  bags: Object.keys(window.app.bags.equipped).length,
}));
console.log('after open  ', JSON.stringify(await state()));

const seen = [];
for (let i=0;i<6;i++){
  const before = await state();
  seen.push(before.current);
  await click('.wb-card');                     // one click per bag
}
const after = await state();
console.log('after 6 picks', JSON.stringify(after));
console.log('mounts visited in order:', seen.join(' → '));
console.log(`CLICKS ${clicks} for ${after.bags} bags  (old flow would be ${after.bags*4})`);
console.log(errs.length ? 'ERRORS:\n  '+errs.join('\n  ') : 'no page errors');
await p.screenshot({path:'/private/tmp/claude-502/-Users-johnbrophy-bikes/57c3e027-02e6-454b-907b-ea832d8c3964/scratchpad/wb.png'});
await b.close();
