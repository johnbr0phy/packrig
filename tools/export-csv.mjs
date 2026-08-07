// Flatten the catalogue (plus any verified overrides) to one CSV row per product.
// Usage: node tools/export-csv.mjs [out.csv]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const brands = JSON.parse(readFileSync(root + 'data/brands.json'));

// verified/*.json records override the base catalogue, keyed brand|line|name|size
const verified = new Map();
const vdir = root + 'data/verified/';
if (existsSync(vdir)) {
  for (const f of readdirSync(vdir).filter((x) => x.endsWith('.json'))) {
    let rows;
    try { rows = JSON.parse(readFileSync(vdir + f)); } catch { console.warn(`skip ${f}: bad JSON`); continue; }
    for (const r of Array.isArray(rows) ? rows : []) {
      verified.set([r.brand, r.line || '', r.name, r.size || ''].join('|'), r);
    }
  }
}

const COLS = [
  'brand', 'line', 'model', 'size', 'slot', 'capacity_l',
  'len_cm', 'wid_cm', 'hgt_cm', 'dia_cm',
  'dims_state', 'dims_raw', 'dims_note', 'dims_source', 'dims_source_url',
  'fabric', 'closure', 'shape', 'compression_straps', 'pockets',
  'bags_per_listing', 'mounting_system', 'max_load', 'colorway_count', 'colorways', 'image_count', 'images', 'product_url',
];
const esc = (v) => {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const rows = [COLS.join(',')];
let nVerified = 0, nUnrolled = 0, nImages = 0, nWays = 0;
for (const b of brands) {
  for (const p of b.products) {
    const v = verified.get([b.name, p.line || '', p.name, p.size || ''].join('|'));
    if (v?.verified || v?.dims_source === 'retailer') nVerified++;
    if (v?.dims_state === 'unrolled') nUnrolled++;
    const d = ((v?.verified || v?.dims_source === 'retailer') && v.dims_cm) || p.dims_cm || {};
    const ways = v?.colorways || (p.features?.colorways || []).map((c) => (typeof c === 'string' ? { name: c } : c));
    const imgs = v?.images || [];
    nImages += imgs.length;
    nWays += ways.length;
    const f = p.features || {};
    rows.push([
      b.name, p.line || '', p.name, p.size || '', p.slot, v?.capacity_l ?? p.liters ?? '',
      d.len ?? '', d.wid ?? '', d.hgt ?? '', d.dia ?? '',
      v?.dims_state || 'unknown', v?.dims_raw || '', v?.dims_note || '',
      p.dims_verified || 'none', p.dims_source_url || '',
      b.fabric || '', f.closure || '', f.shape || '', f.compressionStraps ?? '',
      Array.isArray(f.pockets) ? f.pockets.map((x) => x.type || x).join(' ') : '',
      f.bagsPerListing ?? 1, f.mountingSystem || '', f.maxLoad || '',
      ways.length, ways.map((c) => (c.hex ? `${c.name} ${c.hex}` : c.name)).join(' | '),
      imgs.length, imgs.join(' | '), p.src || '',
    ].map(esc).join(','));
  }
}
const out = process.argv[2] || root + 'data/packrig-products.csv';
writeFileSync(out, rows.join('\n') + '\n');
console.log(`${rows.length - 1} products → ${out}`);
console.log(`verified against maker page: ${nVerified}`);
console.log(`unrolled dims adjusted:      ${nUnrolled}`);
console.log(`colourways captured:         ${nWays}`);
console.log(`image URLs captured:         ${nImages}`);
