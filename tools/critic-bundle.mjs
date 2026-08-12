/**
 * Build one critique bundle per slot for a brand: what we drew, next to
 * everything the maker publishes about it.
 *
 *   node tools/critic-bundle.mjs --brand Tailfin --shots shots/tailfin-v0
 *
 * Writes evals/bundles/<brand>/<slot>.md — a plain list of file paths a critic
 * agent can open. It exists because the recurring failure in this project is
 * evidence that is present on disk and never actually looked at: if the bundle
 * does not name the file, no critic opens it.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const BRAND = arg('brand', 'Tailfin');
const SHOTS = arg('shots', 'shots/tailfin-v0');
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const bslug = norm(BRAND);

const media = JSON.parse(readFileSync(join(root, `data/media/${bslug}.json`)));
const model = JSON.parse(readFileSync(join(root, `data/models/${bslug}.json`)));
const report = JSON.parse(readFileSync(join(root, SHOTS, 'report.json')));
const byShotSlug = new Map((report.bags || report).map((b) => [b.slug, b]));

// page url -> page dir
const urlToPage = new Map();
for (const [pageSlug, p] of Object.entries(media.pages)) if (p.url) urlToPage.set(p.url, pageSlug);

const brands = JSON.parse(readFileSync(join(root, 'data/brands.json')));
const brand = brands.find((b) => norm(b.name) === bslug);
const srcOf = new Map();
for (const p of brand.products) srcOf.set(norm([p.line, p.name, p.size].filter(Boolean).join('-')), p.src);

const bySlot = new Map();
for (const p of model.products) {
  const key = norm([p.line, p.name, p.size].filter(Boolean).join('-'));
  const shotSlug = `${bslug}-${key}`;
  const pageSlug = urlToPage.get(srcOf.get(key));
  if (!bySlot.has(p.slot)) bySlot.set(p.slot, []);
  bySlot.get(p.slot).push({ p, key, shotSlug, pageSlug });
}

mkdirSync(join(root, `evals/bundles/${bslug}`), { recursive: true });
for (const [slot, items] of bySlot) {
  const L = [];
  L.push(`# ${BRAND} — slot \`${slot}\` — ${items.length} product${items.length > 1 ? 's' : ''}`);
  L.push('');
  const pageDirs = new Set();
  for (const it of items) {
    L.push(`## ${it.p.line} / ${it.p.name} / ${it.p.size}`);
    L.push(`- record dims_cm: ${JSON.stringify(it.p.dims_cm)}  render: ${JSON.stringify(it.p.render || null)}  verified: ${it.p.verified}`);
    const m = byShotSlug.get(it.shotSlug);
    // Mount axes FIRST and world axes second, deliberately. A world-aligned
    // box over a bag on a raked tube reads 2x its real size, and six rounds of
    // Apidura fixers went hunting a height bug that did not exist because that
    // was the number in front of them. Lead with the honest one.
    if (m && m.bbox_mount_mm) L.push(`- measured render size on the bag's OWN mount axes (cm): along ${(m.bbox_mount_mm.along / 10).toFixed(1)}, perp ${(m.bbox_mount_mm.perp / 10).toFixed(1)}, across ${(m.bbox_mount_mm.across / 10).toFixed(1)}  — compare these with dims_cm`);
    if (m && m.bbox_mm) L.push(`- (world-aligned box, for reference only, cm): ${(m.bbox_mm.x / 10).toFixed(1)} fore-aft x ${(m.bbox_mm.z / 10).toFixed(1)} across x ${(m.bbox_mm.y / 10).toFixed(1)} tall`);
    if (m && m.clearance) { const bad = m.clearance.filter((c) => c.mm < 3); if (bad.length) L.push(`- CLASH/contact: ${bad.map((c) => `${c.part} ${c.mm}mm`).join(', ')}`); }
    const dir = join(root, SHOTS, it.shotSlug);
    if (existsSync(dir)) L.push(`- OUR RENDER: ${readdirSync(dir).map((f) => `${SHOTS}/${it.shotSlug}/${f}`).join(', ')}`);
    else L.push(`- OUR RENDER: **missing**`);
    if (it.pageDirs) {}
    if (it.pageSlug) pageDirs.add(it.pageSlug);
    L.push(`- product page: ${srcOf.get(it.key)}`);
    L.push('');
  }
  L.push('## Maker evidence — open ALL of these');
  for (const pd of pageDirs) {
    const dir = join(root, `assets/products/${bslug}/full/${pd}`);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
    const rank = { dimensions: 0, clearance: 1, 'on-bike': 2, studio: 3, feature: 4, lifestyle: 5 };
    files.sort((a, b) => (rank[a.split('-')[0]] ?? 9) - (rank[b.split('-')[0]] ?? 9));
    L.push(`### ${pd} (${files.length} images + page.txt)`);
    L.push(files.map((f) => `assets/products/${bslug}/full/${pd}/${f}`).join('\n'));
    L.push(`assets/products/${bslug}/full/${pd}/page.txt`);
    L.push('');
  }
  writeFileSync(join(root, `evals/bundles/${bslug}/${slot}.md`), L.join('\n'));
  console.log(`${slot}: ${items.length} products, ${pageDirs.size} page(s)`);
}
