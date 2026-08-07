// Roll ranges must render CLOSED. Earlier passes stored min + 0.3*(max-min);
// this rewrites those axes to the range minimum. Usage: [--apply]
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url).pathname;
const brands = JSON.parse(readFileSync(root + 'data/brands.json'));
const apply = process.argv.includes('--apply');

// "13-48h cm" / "8"-19"" / "27 - 55cm" — a low-high pair in the raw spec string
const RANGE = /(\d+(?:\.\d+)?)\s*(?:"|in|cm|mm)?\s*[-–]\s*(\d+(?:\.\d+)?)\s*(?:"|in|cm|mm)?/g;

const rows = [];
for (const b of brands) {
  for (const p of b.products) {
    if (p.dims_state !== 'unrolled') continue;
    const raw = String(p.dims_raw || '');
    const inches = /"|inch|in\b/i.test(raw);
    const pairs = [...raw.matchAll(RANGE)]
      .map(([, a, c]) => [parseFloat(a), parseFloat(c)])
      .filter(([a, c]) => c > a && c / a >= 1.25);           // a real roll range
    if (!pairs.length) { rows.push({ p, b, skip: 'no parseable range in dims_raw' }); continue; }
    // pick the axis whose stored value sits inside a range and above its low end
    let best = null;
    for (const [lo, hi] of pairs) {
      const loCm = inches ? lo * 2.54 : lo, hiCm = inches ? hi * 2.54 : hi;
      for (const k of ['len', 'wid', 'hgt']) {
        const v = Number(p.dims_cm?.[k]);
        if (!Number.isFinite(v)) continue;
        if (v > loCm * 1.03 && v <= hiCm * 1.03) {
          const gain = v - loCm;
          if (!best || gain > best.gain) best = { k, from: v, to: +loCm.toFixed(1), gain };
        }
      }
    }
    if (!best) { rows.push({ p, b, skip: 'stored value already at or below the range low end' }); continue; }
    rows.push({ p, b, ...best });
  }
}

const changes = rows.filter((r) => r.k);
console.log(`${rows.length} unrolled records — ${changes.length} would change, ${rows.length - changes.length} skipped\n`);
for (const r of changes) {
  console.log(`  ${r.b.name} ${r.p.name} ${r.p.size || ''}: ${r.k} ${r.from} -> ${r.to}cm`);
}
const skipped = rows.filter((r) => r.skip);
if (skipped.length) {
  console.log(`\nskipped (need a human):`);
  for (const r of skipped) console.log(`  ${r.b.name} ${r.p.name} ${r.p.size || ''} — ${r.skip}`);
}
if (!apply) { console.log('\n(dry run — pass --apply to write)'); process.exit(0); }
for (const r of changes) {
  r.p.dims_cm[r.k] = r.to;
  r.p.dims_state = 'packed';
  r.p.dims_note = `${r.p.dims_note ? r.p.dims_note + ' ' : ''}Rolled-down (closed) ${r.k} taken as the low end of the published range; was ${r.from}cm from an earlier min+0.3*(max-min) estimate.`;
}
writeFileSync(root + 'data/brands.json', JSON.stringify(brands, null, 1));
console.log(`\nwrote data/brands.json (${changes.length} axes corrected)`);
