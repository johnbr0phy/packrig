/**
 * Accounts, publishing and the gallery, end to end against tools/scratch/_mockbackend.mjs.
 * Two separate browser contexts stand in for two different people, so the
 * gallery is genuinely proven to cross between users rather than just echoing
 * one session's own rows back.
 */
import puppeteer from 'puppeteer-core';
const APP = 'http://localhost:8735/';
const API = 'http://localhost:8799';
const b = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true });
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const errs = [];

async function person(label) {
  const ctx = await b.createBrowserContext();          // its own localStorage
  const p = await ctx.newPage();
  await p.setViewport({ width:1400, height:950 });
  p.on('pageerror', e => errs.push(`${label}: ${e.message}`));
  await p.goto(APP, { waitUntil:'networkidle0' });
  await p.evaluate((api) => { localStorage.packrig_supabase = JSON.stringify({ url: api, key: 'anon-test-key' }); }, API);
  await p.reload({ waitUntil:'networkidle0' });
  await p.waitForFunction('window.__READY_DONE === true', { timeout:60000 }).catch(()=>{});
  await wait(1200);
  return { p, ctx, label };
}

const signUp = async ({p}, email) => {
  await p.click('.rigs-btn'); await wait(300);
  await p.evaluate(() => [...document.querySelectorAll('.rig-link')].find(b=>b.textContent==='Sign in to sync').click());
  await wait(300);
  await p.evaluate(() => [...document.querySelectorAll('.rig-link')].find(b=>b.textContent==='Create an account').click());
  await wait(300);
  await p.type('input[type=email]', email);
  await p.type('input[type=password]', 'hunter2hunter2');
  await p.click('.rig-save-btn.is-wide'); await wait(900);
  return p.evaluate(() => document.querySelector('.rig-notice')?.textContent);
};

// ---- Alice builds a bike, saves it, publishes it --------------------------
const alice = await person('alice');
console.log('alice signup:', await signUp(alice, 'alice@example.com'));
await alice.p.evaluate(() => { window.app.bags.randomKit(5); window.app.ui.sync(); });
await wait(600);
await alice.p.type('.rig-name', 'Cairngorms loop');
await alice.p.click('.rig-save-btn'); await wait(900);
console.log('alice saved:', await alice.p.evaluate(() => document.querySelector('.rig-title')?.textContent));

await alice.p.evaluate(() => [...document.querySelectorAll('.rig-act')].find(b=>b.textContent==='Publish').click());
await wait(400);
await alice.p.evaluate(() => { const i=document.querySelector('.rig-input'); i.value='Alice'; });
await alice.p.click('.rig-save-btn.is-wide'); await wait(900);
console.log('alice publish:', await alice.p.evaluate(() => ({
  notice: document.querySelector('.rig-notice')?.textContent,
  btn: [...document.querySelectorAll('.rig-act')].map(b=>b.textContent).join(','),
})));

// ---- Bob, a different person, browses the gallery signed OUT --------------
const bob = await person('bob');
await bob.p.click('.rigs-btn'); await wait(400);
await bob.p.evaluate(() => [...document.querySelectorAll('.rig-link')].find(b=>b.textContent==='Browse the gallery').click());
await wait(900);
const seen = await bob.p.evaluate(() => ({
  cards: document.querySelectorAll('.rig-card').length,
  title: document.querySelector('.rig-title')?.textContent,
  meta: document.querySelector('.rig-meta')?.textContent,
  signedIn: window.app.auth.signedIn,
}));
console.log('bob (signed out) sees:', JSON.stringify(seen));

// and can load it onto his own bike
await bob.p.evaluate(() => document.querySelector('.rig-act.is-primary').click());
await wait(1200);
const bobBags = await bob.p.evaluate(() => Object.keys(window.app.bags.equipped).length);
const aliceBags = await alice.p.evaluate(() => Object.keys(window.app.bags.equipped).length);
console.log(`bob loaded ${bobBags} bags; alice built ${aliceBags} — match:`, bobBags === aliceBags);

// ---- the gallery must not leak who published --------------------------------
const leak = await bob.p.evaluate(async (api) => {
  const r = await fetch(`${api}/rest/v1/public_rigs?select=id,name,author,rig,published_at`, { headers:{ apikey:'anon-test-key', Authorization:'Bearer anon-test-key' } });
  const rows = await r.json();
  return { keys: Object.keys(rows[0] || {}), hasUserId: rows.some(x => 'user_id' in x) };
}, API);
console.log('gallery row exposes:', leak.keys.join(','), '| leaks user_id:', leak.hasUserId);

// ---- unpublish takes it back out ------------------------------------------
await alice.p.evaluate(() => [...document.querySelectorAll('.rig-act')].find(b=>b.textContent==='Published').click());
await wait(900);
await bob.p.evaluate(() => window.app.openRigs('gallery')); await wait(900);
console.log('after unpublish, bob sees:', await bob.p.evaluate(() => ({
  cards: document.querySelectorAll('.rig-card').length,
  empty: document.querySelector('.rig-empty')?.textContent?.slice(0,40),
})));

console.log(errs.length ? 'ERRORS:\n  '+errs.join('\n  ') : 'no page errors');
await b.close();
