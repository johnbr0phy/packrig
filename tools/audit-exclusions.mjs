/**
 * Checks that no two mutually-exclusive slots are ever mounted at once.
 *
 * The exclusion table in src/bags/slots.js is enforced in exactly one place —
 * system.js equip() — so anything that mounts a bag by another route, or any
 * pair that was simply never declared, produces a bike wearing two bags in the
 * same volume. That is how a rack trunk ended up sitting inside a seat pack.
 *
 * Tests every declared exclusion pair three ways:
 *   - across N random kits ("Surprise me")
 *   - equip A then B
 *   - equip B then A
 * and separately reports pairs that share a bike anchor but declare NO
 * exclusion, which is the shape of the bug rather than the bug itself.
 *
 *   node tools/audit-exclusions.mjs            # 400 kits
 *   node tools/audit-exclusions.mjs --kits 2000
 */
import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:8735';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const argv = process.argv.slice(2);
const KITS = +(argv[argv.indexOf('--kits') + 1] || 400) || 400;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForFunction('window.__READY_DONE === true', { timeout: 30000 })
  .catch(() => errs.push('ready never fired'));

const out = await page.evaluate((kits) => {
  const table = window.__SLOTS;
  if (!table) return { fatal: 'window.__SLOTS is not exposed — src/main.js must set it, or this audit tests nothing' };
  const bags = window.app.bags;

  // Build the pair list from the table itself, so a new exclusion is covered
  // the moment someone declares it.
  const pairs = [];
  for (const [a, def] of Object.entries(table)) {
    for (const b of def.excludes || []) if (a < b) pairs.push([a, b]);
  }

  const kitFails = [];
  for (let seed = 1; seed <= kits; seed++) {
    bags.randomKit(seed);
    const eq = new Set(Object.keys(bags.equipped));
    for (const [a, b] of pairs) if (eq.has(a) && eq.has(b)) kitFails.push({ seed, a, b });
  }

  // one product per catalogue slot, for the manual equip path
  const all = window.app.catalog.flatMap((br) => br.products.map((pr) => ({ br, pr })));
  const productFor = (uiSlot) => {
    const want = (table[uiSlot] && table[uiSlot].products) || uiSlot;
    return all.find((x) => x.pr.slot === want);
  };

  const orderFails = [];
  for (const [a, b] of pairs) {
    const pa = productFor(a), pb = productFor(b);
    if (!pa || !pb) continue;
    for (const [first, second] of [[a, b], [b, a]]) {
      const pf = first === a ? pa : pb, ps = second === a ? pa : pb;
      bags.clearAll();
      bags.equip(first, pf.br, pf.pr);
      bags.equip(second, ps.br, ps.pr);
      const eq = new Set(Object.keys(bags.equipped));
      if (eq.has(a) && eq.has(b)) orderFails.push(`${first} then ${second}`);
    }
  }

  // pairs sharing an anchor with no exclusion declared either way
  const undeclared = [];
  const names = Object.keys(table);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i], b = names[j];
      if (table[a].anchor !== table[b].anchor) continue;
      const ex = (table[a].excludes || []).includes(b) || (table[b].excludes || []).includes(a);
      if (!ex) undeclared.push(`${a} + ${b} (both on anchor '${table[a].anchor}')`);
    }
  }

  bags.clearAll();
  return { pairs: pairs.map((p) => p.join(' x ')), kitFails, orderFails, undeclared };
}, KITS);

if (out.fatal) { console.error('FAIL —', out.fatal); await browser.close(); process.exit(2); }
if (!out.pairs.length) { console.error('FAIL — no exclusion pairs found; the audit would pass vacuously'); await browser.close(); process.exit(2); }
console.log(`exclusion pairs declared: ${out.pairs.length}`);
for (const p of out.pairs) console.log(`   ${p}`);
console.log(`\nrandom kits tested: ${KITS}`);
console.log(`  kits mounting an excluded pair: ${out.kitFails.length}`);
for (const f of out.kitFails.slice(0, 8)) console.log(`     seed ${f.seed}: ${f.a} + ${f.b}`);
console.log(`  manual equip orders that left both mounted: ${out.orderFails.length}`);
for (const f of out.orderFails.slice(0, 8)) console.log(`     ${f}`);

if (out.undeclared.length) {
  console.log(`\nSHARE AN ANCHOR BUT DECLARE NO EXCLUSION (${out.undeclared.length}) — check each:`);
  for (const u of out.undeclared) console.log(`   ${u}`);
}
if (errs.length) console.log('\npage errors:', [...new Set(errs)].slice(0, 5).join(' | '));

await browser.close();
const bad = out.kitFails.length + out.orderFails.length;
console.log(`\n${bad ? `FAIL — ${bad} violation(s)` : 'PASS — no excluded pair ever mounted together'}`);
process.exit(bad ? 1 : 0);
