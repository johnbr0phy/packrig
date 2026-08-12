import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
await p.setViewport({ width: 1600, height: 950 });
await p.goto('http://localhost:8735/', { waitUntil: 'networkidle0' });
await p.waitForFunction('window.__READY_DONE === true', { timeout: 60000 }).catch(()=>{});
const wait = (ms) => new Promise(r => setTimeout(r, ms));
await wait(1200);
await p.evaluate(() => window.app.openSheet({ kind:'detail', title:'Expedition Saddle Pack',
  render: (bd) => { bd.innerHTML = `
   <p class="t-label" style="color:var(--ink-3)">Specifications</p>
   <p class="t-title1" style="color:var(--ink-1);margin:8px 0">Expedition Saddle Pack</p>
   <p class="t-body" style="color:var(--ink-2)">A tapered wedge that clamps to the seatpost and blades to a rolled tail.</p>
   <p class="t-data" style="color:var(--ink-1)">9 L · 42 × 15 × 16 cm · 342 g</p>
   <p class="t-caption" style="color:var(--ink-3)">Ink-3 caption at 12.5px, the smallest text the system allows.</p>`; } }));
await wait(1400);
for (const env of ['desert','night','snow']) {
  await p.evaluate((e) => window.app.setEnv(e), env);
  await wait(2600);
  const k = await p.evaluate(() => ({ k: window.app.scrim.k, L: window.app.scrim.L }));
  await p.screenshot({ path: `/tmp/claude-502/-Users-johnbrophy-bikes/57c3e027-02e6-454b-907b-ea832d8c3964/scratchpad/ds-${env}.png` });
  console.log(env, JSON.stringify(k));
}
await b.close();
