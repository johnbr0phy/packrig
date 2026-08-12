/**
 * Freeze an eval set.
 *
 * A set is a list of products that never changes, so that two runs taken weeks
 * apart are comparable. Everything the review UI and the graders need is
 * captured at freeze time: the catalogue indices bagshot needs to render the
 * item, the fidelity record as it stood, and the reference photographs with
 * their hashes so a silently-changed image cannot silently change a score.
 *
 *   node tools/eval-set.mjs --brand Apidura --freeze apidura-v1
 *   node tools/eval-set.mjs --holdout --exclude Apidura --n 60 --freeze holdout-v1
 *
 * Writes evals/sets/<name>.json. Refuses to overwrite: a frozen set is frozen.
 * See EVAL-PLAN.md §0, §1.1, §7 phase 0.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const has = (k) => argv.includes(`--${k}`);

const name = arg('freeze');
if (!name) { console.error('need --freeze <set-name>'); process.exit(2); }

// Slot names in data/brands.json are not the UI slot names the app equips by.
// Kept identical to tools/bagshot.mjs — if these drift, every fork/stem bag
// reads back as "dropped".
const SLOT_UI = { pannier: 'pannierR', stembag: 'stemR', forkbag: 'forkR' };
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const key = (p) => slugify([p.line, p.name, p.size].filter(Boolean).join(' '));
const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

const brands = JSON.parse(readFileSync(root + 'data/brands.json'));

/** The per-product fidelity record for a brand, indexed by line+name+size. */
function recordsFor(brandName) {
  const f = join(root, 'data/models', slugify(brandName) + '.json');
  if (!existsSync(f)) return new Map();
  const j = JSON.parse(readFileSync(f));
  return new Map((j.products || []).map((r) => [key(r), r]));
}

const wantBrand = arg('brand');
const exclude = (arg('exclude') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const holdout = has('holdout');
const N = parseInt(arg('n', '60'), 10);

// ---- gather candidates ---------------------------------------------------
const items = [];
const skipped = { noPhoto: 0, noRecord: 0 };

brands.forEach((b, bi) => {
  if (wantBrand && b.name.toLowerCase() !== wantBrand.toLowerCase()) return;
  if (exclude.includes(b.name.toLowerCase())) return;
  const recs = recordsFor(b.name);
  b.products.forEach((p, pi) => {
    const rec = recs.get(key(p)) || null;
    if (!rec) skipped.noRecord++;

    // Reference photographs. brands.json carries ONE image per product; the
    // record's evidence[] carries every photo the reviewer actually opened —
    // 1 vs 116 for Apidura. Always prefer the record. (EVAL-PLAN.md §9)
    const local = [], remote = [];
    for (const e of (rec?.evidence || [])) {
      (String(e).startsWith('http') ? remote : local).push(e);
    }
    const img = p.image || p.img || (p.images && p.images[0]);
    if (img) (String(img).startsWith('http') ? remote : local).push(img);

    const refs = [...new Set(local)].filter((f) => existsSync(join(root, f)))
      .map((f) => ({ path: f, sha: sha(readFileSync(join(root, f))) }));

    // No reference means no fidelity judgement is possible, by anyone.
    if (!refs.length && !remote.length) { skipped.noPhoto++; return; }

    items.push({
      slug: slugify([b.name, p.line, p.name, p.size].filter(Boolean).join(' ')),
      bi, pi,
      brand: b.name, line: p.line || '', name: p.name, size: p.size || '',
      slot: p.slot, ui: SLOT_UI[p.slot] || p.slot,
      dims_cm: p.dims_cm || null, liters: p.liters ?? null,
      src: p.src || rec?.evidence?.find((e) => String(e).startsWith('http')) || null,
      refs, refs_remote: remote,
      record: rec,
    });
  });
});

// ---- the hold-out is stratified; a single-brand census is not -------------
let chosen = items;
if (holdout) {
  // Stratify by slot so every builder the working set exercises is also
  // represented by brands we are NOT looking at. Deterministic: sorted, then
  // round-robin across slots — no RNG, so the split is reproducible forever.
  const bySlot = new Map();
  for (const it of [...items].sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (!bySlot.has(it.slot)) bySlot.set(it.slot, []);
    bySlot.get(it.slot).push(it);
  }
  const slots = [...bySlot.keys()].sort();
  const perBrand = new Map();
  chosen = [];
  for (let round = 0; chosen.length < N && round < 40; round++) {
    let progressed = false;
    for (const s of slots) {
      if (chosen.length >= N) break;
      const pool = bySlot.get(s);
      // Cap any one brand so a 70-product giant cannot dominate the hold-out.
      const pick = pool.find((it) => !chosen.includes(it) && (perBrand.get(it.brand) || 0) < 3);
      if (!pick) continue;
      chosen.push(pick);
      perBrand.set(pick.brand, (perBrand.get(pick.brand) || 0) + 1);
      progressed = true;
    }
    if (!progressed) break;
  }
}

// ---- write ---------------------------------------------------------------
const out = join(root, 'evals/sets', name + '.json');
if (existsSync(out) && !has('force')) {
  console.error(`${out} already exists. A frozen set is frozen — make a v2 instead (EVAL-PLAN.md §1.1).`);
  process.exit(3);
}
mkdirSync(join(root, 'evals/sets'), { recursive: true });

const bySlotCount = {};
const byBrandCount = {};
for (const it of chosen) {
  bySlotCount[it.slot] = (bySlotCount[it.slot] || 0) + 1;
  byBrandCount[it.brand] = (byBrandCount[it.brand] || 0) + 1;
}

writeFileSync(out, JSON.stringify({
  set: name,
  kind: holdout ? 'holdout' : 'census',
  frozen_at: new Date().toISOString(),
  catalogue_sha: sha(readFileSync(root + 'data/brands.json')),
  filter: { brand: wantBrand, exclude, holdout, n: holdout ? N : null },
  counts: { items: chosen.length, slots: bySlotCount, brands: byBrandCount },
  items: chosen,
}, null, 1));

console.log(`${chosen.length} items → evals/sets/${name}.json`);
console.log(`  slots: ${Object.entries(bySlotCount).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`  brands: ${Object.keys(byBrandCount).length}`);
console.log(`  refs: ${chosen.reduce((n, it) => n + it.refs.length, 0)} local photos hashed`);
const noRec = chosen.filter((it) => !it.record).length;
if (noRec) console.log(`  ! ${noRec} items have no fidelity record`);
if (skipped.noPhoto) console.log(`  excluded, no photograph: ${skipped.noPhoto} (EVAL-PLAN.md §0.2)`);
