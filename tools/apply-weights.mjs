/**
 * data/weights/<brand>.json → data/brands.json (`weight_g`, `weight_basis`,
 * `weight_src`, `weight_note`). Idempotent; `--dry` previews.
 *
 * Joined on brand + line + name + size exactly as the worklist wrote them —
 * the research passes copied those keys verbatim for this reason. Anything
 * that does not join is printed by name, never counted silently (the lesson of
 * apply-models.mjs: three brands were once dropped without a word).
 *
 * `weight_basis` is what the UI uses to be honest: 'maker' | 'retailer' |
 * 'review' | 'size-interpolated' are sourced; 'recall' and 'family-estimate'
 * are shown with an "est." tag.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const dry = process.argv.includes('--dry');
const brands = JSON.parse(readFileSync(join(root, 'data/brands.json'), 'utf8'));
const k = (b, p) => [b, p.line, p.name, p.size].map((s) => String(s ?? '').trim().toLowerCase()).join('|');
// renamed after the worklist was cut (see DECISIONS.md: the Rapha developer note)
const RENAMED = { '4 tapered wide x 10 high; json had wid/hgt swapped)': 'rapha explore top tube bag - long' };

const want = new Map();
for (const f of readdirSync(join(root, 'data/weights')).filter((f) => f.endsWith('.json') && !f.startsWith('_'))) {
  const d = JSON.parse(readFileSync(join(root, 'data/weights', f), 'utf8'));
  for (const p of d.products || []) {
    const name = RENAMED[String(p.name).trim().toLowerCase()] || p.name;
    want.set(k(d.brand, { ...p, name }), { ...p, file: f });
  }
}

let hit = 0;
const counts = {};
const missing = [];
for (const b of brands) {
  for (const p of b.products) {
    const w = want.get(k(b.name, p));
    if (!w || !(w.weight_g > 0)) { missing.push(`${b.name} | ${p.line || ''} | ${p.name} | ${p.size || ''}`); continue; }
    want.delete(k(b.name, p));
    hit++;
    p.weight_g = Math.round(w.weight_g);
    p.weight_basis = w.basis;
    if (w.source) p.weight_src = w.source; else delete p.weight_src;
    const note = [w.quote ? `"${w.quote}"` : null, w.note || null].filter(Boolean).join(' — ');
    if (note) p.weight_note = note.slice(0, 400); else delete p.weight_note;
    counts[w.basis] = (counts[w.basis] || 0) + 1;
  }
}
console.log(`${hit} weighted`, counts);
if (missing.length) { console.log(`${missing.length} catalogue products with no weight:`); missing.forEach((m) => console.log('  ' + m)); }
if (want.size) { console.log(`${want.size} weight records that joined nothing:`); for (const [key] of want) console.log('  ' + key); }
if (!dry) writeFileSync(join(root, 'data/brands.json'), JSON.stringify(brands, null, 2) + '\n');
