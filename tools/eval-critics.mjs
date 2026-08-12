/**
 * Aggregate one round of critic verdicts into the numbers that decide the fix.
 *
 *   node tools/eval-critics.mjs --run <stamp>
 *
 * Reports, in this order of usefulness:
 *
 *   1. COMMON FAULTS, per builder. The most valuable output in the round. One
 *      edit to seatpack.js moves 78 catalogue products, so "all eleven are
 *      wrong the same way" is worth more than eleven separate complaints.
 *   2. LAYER SPLIT. Whether the round's work is editing records (A), editing
 *      builders (B), or designing new concepts (C) — three different jobs, and
 *      knowing the mix before starting is what stops a builder agent trying to
 *      draw something the vocabulary cannot express.
 *   3. Score distribution and the worst bags.
 *
 * Deliberately NOT reported: a single overall mean. Averaging seventy bags
 * across eleven builders produces a number that moves by a tenth and hides
 * which builder broke. The per-builder median and the score histogram say what
 * a mean would, without inviting anyone to celebrate 2.9 -> 3.1.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const RUNS = join(root, 'evals/runs');
const newest = () => readdirSync(RUNS).filter((d) => existsSync(join(RUNS, d, 'critics'))).sort().pop();
const run = arg('run', newest());
const dir = join(RUNS, run, 'critics');
if (!existsSync(dir)) { console.error(`no critics in ${run}`); process.exit(2); }

const reports = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  try { reports.push(JSON.parse(readFileSync(join(dir, f), 'utf8'))); }
  catch (e) { console.error(`  ✗ ${f}: ${e.message}`); }
}

const bags = reports.flatMap((r) => (r.bags || []).map((b) => ({ ...b, slot: r.slot, critic: r.critic })));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

console.log(`\n=== CRITIC ROUND — ${run} ===`);
console.log(`${reports.length} critics, ${bags.length} bags judged\n`);

console.log('--- COMMON FAULTS (the leverage) ---');
for (const r of reports.sort((a, b) => (a.slot || '').localeCompare(b.slot || ''))) {
  if (!r.common_fault) continue;
  const mine = (r.bags || []).map((b) => b.score);
  console.log(`\n  [${r.critic}]  ${mine.length} bags, median ${med(mine)}`);
  console.log(`  ${r.common_fault}`);
}

console.log('\n\n--- SCORES BY BUILDER ---');
const bySlot = new Map();
for (const b of bags) { if (!bySlot.has(b.slot)) bySlot.set(b.slot, []); bySlot.get(b.slot).push(b); }
const rows = [...bySlot.entries()].map(([slot, list]) => ({
  slot, n: list.length, median: med(list.map((b) => b.score)),
  worst: Math.min(...list.map((b) => b.score)),
})).sort((a, b) => a.median - b.median);
for (const r of rows) {
  console.log(`  ${r.slot.padEnd(18)} n=${String(r.n).padStart(3)}  median ${r.median}  worst ${r.worst}`);
}

console.log('\n--- SCORE DISTRIBUTION ---');
for (let s = 1; s <= 5; s++) {
  const n = bags.filter((b) => b.score === s).length;
  console.log(`  ${s}  ${'█'.repeat(n)} ${n}`);
}

console.log('\n--- WHERE THE WORK IS (layer) ---');
const LAYER = { A: 'record is wrong — edit data/models', B: 'builder is wrong — edit src/bags/builders', C: 'no concept exists — design work' };
for (const l of ['A', 'B', 'C']) {
  const n = bags.filter((b) => (b.layer || '').toUpperCase().startsWith(l)).length;
  console.log(`  ${l}  ${String(n).padStart(3)}  ${LAYER[l]}`);
}

console.log('\n--- WORST BAGS ---');
for (const b of bags.filter((x) => x.score <= 2).sort((a, b2) => a.score - b2.score)) {
  console.log(`  ${String(b.score)}  ${b.slug}`);
  console.log(`     ${b.biggest_gap}`);
}

const summary = {
  run, critics: reports.length, bags: bags.length,
  distribution: Object.fromEntries([1, 2, 3, 4, 5].map((s) => [s, bags.filter((b) => b.score === s).length])),
  layers: Object.fromEntries(['A', 'B', 'C'].map((l) => [l, bags.filter((b) => (b.layer || '').toUpperCase().startsWith(l)).length])),
  by_slot: rows,
  common_faults: reports.filter((r) => r.common_fault).map((r) => ({ critic: r.critic, slot: r.slot, fault: r.common_fault })),
  bags,
};
writeFileSync(join(RUNS, run, 'critics-summary.json'), JSON.stringify(summary, null, 1));
console.log(`\nwrote ${join(RUNS, run, 'critics-summary.json')}`);
