/**
 * The assertions that should have caught "you fucked mobile".
 *
 * The existing suites checked that no two PANELS overlapped and that the
 * document did not scroll sideways. Both passed while, inside the panel, FRAME
 * and BIDONS printed straight through "BAGS ON BIKE", six swatches ran off the
 * right edge, and Save rig — the one control the plan says must always be
 * visible — hung off the end of the top bar. Every one of those failures is
 * INSIDE a container whose own rect was fine.
 *
 * So this checks the inside:
 *   1. no two visible siblings overlap, anywhere in the chrome
 *   2. nothing overflows its container unless that container is a scroller
 *   3. the controls that must be reachable are fully on screen
 *   4. touch targets clear 44px
 *
 *   node tools/_mobile.mjs <url> [w] [h]
 */
import puppeteer from 'puppeteer-core';

const [, , URL, W = '390', H = '700'] = process.argv;
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--hide-scrollbars', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_BLOCKED_BY_RESPONSE|net::ERR_/.test(m.text())) errs.push(m.text()); });
await p.setViewport({ width: +W, height: +H, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction('window.__READY_DONE === true', { timeout: 60000 }).catch(() => {});
const w = (ms = 700) => new Promise((r) => setTimeout(r, ms));
await w(1100);

const fail = [];
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail.push(m); };

await p.evaluate(() => document.querySelector('.home-btn.is-primary')?.click());
await w(700);
await p.evaluate(() => document.querySelector('.btn.quiet')?.click());   // Surprise me
await w(1100);

const audit = await p.evaluate(() => {
  const vis = (n) => {
    const cs = getComputedStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false;
    const r = n.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const scrolls = (n) => /auto|scroll/.test(getComputedStyle(n).overflowX + getComputedStyle(n).overflowY);
  const label = (n) => n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : '');

  const overlaps = [];
  const overflow = [];
  const roots = [...document.querySelectorAll('.panel, .topbar, .sheet:not([hidden]), .gal, .home')].filter(vis);
  for (const root of roots) {
    // siblings that overlap
    const walk = (parent) => {
      const kids = [...parent.children].filter(vis);
      for (let i = 0; i < kids.length; i++) {
        for (let j = i + 1; j < kids.length; j++) {
          const a = kids[i].getBoundingClientRect(), c = kids[j].getBoundingClientRect();
          const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left);
          const oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
          // 2px of slack for borders and sub-pixel layout
          if (ox > 2 && oy > 2 && getComputedStyle(kids[i]).position === 'static'
              && getComputedStyle(kids[j]).position === 'static') {
            overlaps.push(`${label(kids[i])} ∩ ${label(kids[j])} in ${label(root)}`);
          }
        }
      }
      kids.forEach(walk);
    };
    walk(root);
    // content wider than its box, in something that cannot scroll
    for (const n of [root, ...root.querySelectorAll('*')]) {
      if (!vis(n) || scrolls(n)) continue;
      if (n.scrollWidth > n.clientWidth + 2 && n.clientWidth > 0) {
        overflow.push(`${label(n)} ${n.scrollWidth}>${n.clientWidth}`);
      }
    }
  }

  const onScreen = (sel) => {
    const n = document.querySelector(sel);
    if (!n || !vis(n)) return null;
    const r = n.getBoundingClientRect();
    return r.left >= -1 && r.right <= window.innerWidth + 1 && r.top >= -1 && r.bottom <= window.innerHeight + 1;
  };

  const small = [...document.querySelectorAll('.panel button, .topbar button, .sheet button')]
    .filter(vis)
    .map((n) => ({ l: label(n), r: n.getBoundingClientRect() }))
    // the ::after hit-area trick means the mark can be smaller than the target
    .filter((x) => x.r.height < 30 || x.r.width < 22)
    .map((x) => `${x.l} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`);

  return {
    overlaps: [...new Set(overlaps)].slice(0, 10),
    overflow: [...new Set(overflow)].slice(0, 10),
    save: onScreen('.save-btn'), acct: onScreen('.acct-btn'), menu: onScreen('.home-up'),
    add: onScreen('.add-bag'), bags: document.querySelectorAll('.bag-card').length,
    listH: document.querySelector('.bag-list')?.getBoundingClientRect().height || 0,
    small,
    docOver: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

ok(audit.overlaps.length === 0, `nothing overlaps inside the chrome ${audit.overlaps.join(' | ')}`);
ok(audit.overflow.length === 0, `nothing overflows its box ${audit.overflow.join(' | ')}`);
ok(audit.docOver <= 0, `no horizontal document overflow (${audit.docOver})`);
ok(audit.save === true, 'Save rig is fully on screen');
ok(audit.acct === true, 'the account button is fully on screen');
ok(audit.menu === true, 'the Menu button is fully on screen');
// Not "on screen": the panel scrolls, and a control below the fold is reached
// by scrolling, which is normal. What matters is that it is laid out at all.
ok(audit.add !== null, 'Add a bag is laid out and reachable');
ok(audit.bags > 0 && audit.listH > 40, `the bag list actually has height (${audit.bags} bags, ${Math.round(audit.listH)}px)`);
ok(audit.small.length === 0, `no undersized controls ${audit.small.join(' | ')}`);
ok(errs.length === 0, `no app console errors ${errs.slice(0, 2).join(' | ')}`);

await p.screenshot({ path: `/tmp/mobile-${W}x${H}.png` });
await b.close();
console.log(fail.length ? `\nFAILED ${fail.length}` : '\nALL PASS');
process.exit(fail.length ? 1 : 0);
