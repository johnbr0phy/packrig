// Append researched brands from data/newbrands/*.json into data/brands.json.
// Validates slots and required fields; refuses duplicates. Usage: [--dry]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const dry = process.argv.includes('--dry');
const brands = JSON.parse(readFileSync(root + 'data/brands.json'));
const have = new Set(brands.map((b) => b.name.toLowerCase()));

const VALID = new Set(['seatpack', 'saddlebag', 'barroll', 'barbag', 'randobag',
  'framebag_full', 'framebag_half', 'toptube', 'stembag', 'forkbag', 'downtube',
  'pannier', 'trunk']);

const dir = root + 'data/newbrands/';
const added = [], skipped = [], warnings = [];
if (existsSync(dir)) {
  // --only <name> restricts the merge to one file, so a half-written or
  // unreviewed research file cannot slip into the catalogue.
  const oi = process.argv.indexOf('--only');
  const only = oi >= 0 ? process.argv[oi + 1] : null;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && (!only || x === only))) {
    let rows;
    try { rows = JSON.parse(readFileSync(dir + f)); } catch (e) { warnings.push(`${f}: bad JSON (${e.message})`); continue; }
    for (const b of Array.isArray(rows) ? rows : []) {
      if (!b?.name || !Array.isArray(b.products)) { warnings.push(`${f}: brand missing name/products`); continue; }
      if (have.has(b.name.toLowerCase())) { skipped.push(b.name); continue; }
      const good = b.products.filter((p) => {
        if (!VALID.has(p.slot)) { warnings.push(`${b.name}: "${p.name}" has invalid slot "${p.slot}" — dropped`); return false; }
        if (!p.name) { warnings.push(`${b.name}: product with no name — dropped`); return false; }
        return true;
      });
      if (!good.length) { warnings.push(`${b.name}: no valid products — brand skipped`); continue; }
      brands.push({
        name: b.name, origin: b.origin || '', aesthetic: b.aesthetic || '',
        palette: b.palette || [], fabric: b.fabric || '', products: good,
      });
      have.add(b.name.toLowerCase());
      added.push({ name: b.name, n: good.length });
    }
  }
}

console.log(`${added.length} brands added, ${added.reduce((n, a) => n + a.n, 0)} products`);
for (const a of added) console.log(`  + ${a.name} (${a.n})`);
if (skipped.length) console.log(`skipped as duplicates: ${skipped.join(', ')}`);
for (const w of warnings) console.log(`  ! ${w}`);
if (dry) { console.log('\n(dry run)'); process.exit(0); }
writeFileSync(root + 'data/brands.json', JSON.stringify(brands, null, 1));
console.log(`\ndata/brands.json now has ${brands.length} brands`);
