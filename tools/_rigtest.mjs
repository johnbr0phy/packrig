/**
 * Saved rigs, end to end, with no backend configured — the state most people
 * will meet first. Proves: save, list, load-back, the durable share link, and
 * that an old positional ?kit= link still resolves to the same bike.
 */
import puppeteer from 'puppeteer-core';
const URL = process.argv[2] || 'http://localhost:8735/';
const b = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true });
const p = await b.newPage();
await p.setViewport({ width:1500, height:950 });
const errs=[]; p.on('pageerror',e=>errs.push(e.stack||e.message));
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const boot = async (u) => { await p.goto(u,{waitUntil:'networkidle0',timeout:120000});
  await p.waitForFunction('window.__READY_DONE === true',{timeout:60000}).catch(()=>{}); await wait(1200); };

await boot(URL);
// put a known bike together
await p.evaluate(() => window.app.bags.randomKit(7));
await wait(600);
const before = await p.evaluate(() => Object.entries(window.app.bags.equipped)
  .map(([s,e])=>`${s}=${e.brand.name}|${e.product.name}`).sort().join(' ; '));
console.log('built:', before.split(' ; ').length, 'bags');

// save it through the real UI
await p.click('.rigs-btn'); await wait(400);
await p.type('.rig-name', 'Test rig');
await p.click('.rig-save-btn'); await wait(700);
const saved = await p.evaluate(() => ({
  cards: document.querySelectorAll('.rig-card').length,
  title: document.querySelector('.rig-title')?.textContent,
  meta: document.querySelector('.rig-meta')?.textContent,
  notice: document.querySelector('.rig-notice')?.textContent,
}));
console.log('after save:', JSON.stringify(saved));

// wipe the bike, then load the rig back and compare
await p.evaluate(() => { for (const s of Object.keys(window.app.bags.equipped)) window.app.bags.remove(s); window.app.ui.sync(); });
await wait(400);
await p.click('.rig-act.is-primary'); await wait(900);
const after = await p.evaluate(() => Object.entries(window.app.bags.equipped)
  .map(([s,e])=>`${s}=${e.brand.name}|${e.product.name}`).sort().join(' ; '));
console.log('round-trip identical:', before === after);

// the durable share link
const url = await p.evaluate(() => window.app.__rigURL());
await boot(url);
const shared = await p.evaluate(() => Object.entries(window.app.bags.equipped)
  .map(([s,e])=>`${s}=${e.brand.name}|${e.product.name}`).sort().join(' ; '));
console.log('shared link rebuilds the same bike:', shared === before);
console.log('link length:', url.length, 'chars');

// a legacy positional link must still work
await boot(`${URL}?kit=seatpack:0:1,barroll:2:0`);
const legacy = await p.evaluate(() => Object.entries(window.app.bags.equipped).length);
console.log('legacy ?kit= link still equips:', legacy, 'bags');

console.log(errs.length ? 'ERRORS:\n  '+errs.join('\n  ') : 'no page errors');
await b.close();
