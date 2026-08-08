/**
 * Nothing that can be clicked is covered by something else.
 *
 * Written after a shipped regression: `.sheet` set `display: flex`, which beats
 * the UA's `[hidden] { display: none }`, so a closed sheet sat invisibly over
 * the right third of the viewport and ate every click that landed on it —
 * including the wind tunnel button. Nothing threw, nothing logged, the button
 * simply stopped working.
 *
 * For every interactive element: is it the topmost node at its own centre?
 * Run in the default state and with a sheet open.
 */
import puppeteer from 'puppeteer-core';

const URL = process.argv[2] || 'http://localhost:8735/';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
await p.setViewport({ width: 1600, height: 950 });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(URL, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction('window.__READY_DONE === true', { timeout: 60000 }).catch(() => {});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(1500);

const probe = () => p.evaluate(() => {
  const out = [];
  for (const nodeEl of document.querySelectorAll('#ui-root button, #ui-root a, #ui-root [role="button"], #ui-root input')) {
    const r = nodeEl.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;                 // legitimately hidden
    if (getComputedStyle(nodeEl).visibility === 'hidden') continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;  // off-screen
    const hit = document.elementFromPoint(cx, cy);
    if (!hit) continue;
    if (nodeEl === hit || nodeEl.contains(hit)) continue;      // itself, or its own icon
    out.push({
      control: (nodeEl.getAttribute('aria-label') || nodeEl.textContent || '').trim().slice(0, 34)
        || nodeEl.className,
      coveredBy: hit.id ? `#${hit.id}` : (typeof hit.className === 'string' && hit.className) || hit.tagName,
    });
  }
  return out;
});

const closed = await probe();
await p.evaluate(() => window.app.openSheet({ kind: 'detail', title: 'Hit test', render: (bd) => { bd.textContent = 'x'; } }));
await wait(1300);
const open = await probe();
await p.evaluate(() => window.app.sheets.closeSheet());
await wait(1300);
const reclosed = await probe();

const report = (name, rows) => {
  console.log(`${name}: ${rows.length ? `${rows.length} OCCLUDED` : 'all controls reachable'}`);
  for (const r of rows) console.log(`   "${r.control}" covered by ${r.coveredBy}`);
};
report('sheet closed ', closed);
report('sheet open   ', open);
report('after close  ', reclosed);
console.log(errs.length ? `PAGE ERRORS: ${errs.join(' | ')}` : 'no page errors');
await b.close();
process.exit(closed.length + reclosed.length ? 1 : 0);
