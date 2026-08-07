// Fold data/verified/*.json corrections back into data/brands.json.
// Only touches products whose record is verified:true and carries dims_cm.
// Usage: node tools/apply-verified.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync, existsSync, copyFileSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const dry = process.argv.includes('--dry');
const brands = JSON.parse(readFileSync(root + 'data/brands.json'));

const vdir = root + 'data/verified/';
const recs = new Map();
if (existsSync(vdir)) {
  // Later files overwrite earlier ones, and readdir is alphabetical — which
  // silently let midsize.json clobber the dimfix-*.json corrections written to
  // fix it. Load the correction passes LAST so they win.
  const files = readdirSync(vdir).filter((x) => x.endsWith('.json'))
    .sort((a, b) => (a.startsWith('dimfix') ? 1 : 0) - (b.startsWith('dimfix') ? 1 : 0));
  for (const f of files) {
    let rows;
    try { rows = JSON.parse(readFileSync(vdir + f)); } catch { console.warn(`skip ${f}: bad JSON`); continue; }
    for (const r of Array.isArray(rows) ? rows : []) {
      recs.set([r.brand, r.line || '', r.name, r.size || ''].join('|'), r);
    }
  }
}

const changes = [];
for (const b of brands) {
  for (const p of b.products) {
    const r = recs.get([b.name, p.line || '', p.name, p.size || ''].join('|'));
    // Maker-verified records, plus retailer-sourced ones where the maker's own
    // site is unreachable. The two are NOT equivalent and must not be conflated,
    // so provenance is recorded per product rather than flattened to a boolean.
    const fromRetailer = r?.dims_source === 'retailer';
    if (!r || (!r.verified && !fromRetailer)) continue;
    // slot-only corrections carry no dims — apply the slot and move on, or
    // every finding from the slot audit is silently dropped here
    if (!r.dims_cm) {
      if (r.slot_should_be && r.slot_should_be !== p.slot) {
        console.log(`  slot: ${b.name} ${p.name} ${p.size || ''}: ${p.slot} -> ${r.slot_should_be}`);
        p.slot = r.slot_should_be;
        if (r.dims_note) p.dims_note = r.dims_note;
      }
      continue;
    }
    const before = { ...(p.dims_cm || {}) };
    const after = {};
    for (const k of ['len', 'wid', 'hgt', 'dia']) {
      if (r.dims_cm[k] !== undefined && r.dims_cm[k] !== null) after[k] = r.dims_cm[k];
    }
    if (!Object.keys(after).length) continue;
    const moved = Object.keys(after).filter((k) => Math.abs((before[k] ?? 0) - after[k]) > 0.05);
    if (moved.length) {
      changes.push({
        who: `${b.name} ${p.line || ''} ${p.name} ${p.size || ''}`.replace(/\s+/g, ' ').trim(),
        before, after, state: r.dims_state, note: r.dims_note,
      });
    }
    p.dims_cm = { ...before, ...after };
    p.dims_verified = fromRetailer ? 'retailer' : 'maker';
    if (fromRetailer) p.dims_source_url = r.dims_source_url || '';
    if (r.dims_state) p.dims_state = r.dims_state;
    if (r.dims_raw) p.dims_raw = r.dims_raw;
    if (r.dims_note) p.dims_note = r.dims_note;
    if (r.capacity_l !== undefined) p.liters = r.capacity_l;
    // A product researched into the wrong mount moves slot too — the VAUDE
    // Trailfront is a bar-clamped cage + dry bag, i.e. a barroll, not a barbag.
    if (r.slot_should_be && r.slot_should_be !== p.slot) {
      console.log(`  slot: ${b.name} ${p.name} ${p.size || ''}: ${p.slot} -> ${r.slot_should_be}`);
      p.slot = r.slot_should_be;
    }
    // `size` is the join key between brands.json and the verified records, so
    // pair-vs-single is carried as data (bagsPerListing) rather than by
    // rewriting size strings, which would break every future merge.
    if (r.features) p.features = { ...(p.features || {}), ...r.features };
    if (r.colorways?.length) p.features = { ...(p.features || {}), colorways: r.colorways };
    if (r.images?.length) p.images = r.images;
    if (!fromRetailer) delete p.est;   // maker-confirmed, no longer an estimate
  }
}

console.log(`${recs.size} verified records; ${changes.length} products with changed dimensions\n`);
for (const c of changes) {
  const f = (o) => ['len', 'wid', 'hgt', 'dia'].filter((k) => o[k] !== undefined).map((k) => `${k}:${o[k]}`).join(' ');
  console.log(`  ${c.who}\n    ${f(c.before)}  →  ${f({ ...c.before, ...c.after })}${c.state && c.state !== 'unknown' ? `   [${c.state}]` : ''}`);
  if (c.note) console.log(`    ${c.note}`);
}
if (dry) { console.log('\n(dry run — nothing written)'); process.exit(0); }
// Only snapshot the FIRST time: this tool is idempotent and gets re-run as more
// verification lands, so copying every time would overwrite the pristine
// catalogue with an already-modified one.
const backup = root + 'data/brands.backup.json';
if (!existsSync(backup)) {
  copyFileSync(root + 'data/brands.json', backup);
  console.log('\nsnapshotted original → data/brands.backup.json');
}
writeFileSync(root + 'data/brands.json', JSON.stringify(brands, null, 1));
console.log('wrote data/brands.json');
