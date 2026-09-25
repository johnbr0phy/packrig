/**
 * data/gear/src/*.json → data/gear.json, validated.
 *
 *   node tools/build-gear.mjs          # build + report
 *   node tools/build-gear.mjs --check  # report only
 *
 * Each research pass writes one file per category and never touches another's,
 * the same isolation that made the bag catalogue safe to parallelise. This is
 * the only thing that merges them, so it is the only place the rules live:
 * ids unique and link-safe, dimensions sorted and sane against the stated
 * volume, archetypes and places from the vocabulary in DECISIONS.md, and every
 * number traceable — a `basis` of sourced / owner / recall, never silent.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ARCHETYPES, CATS } from '../src/pack/model.js';

const root = new URL('../', import.meta.url).pathname;
const SRC = join(root, 'data/gear/src');
const check = process.argv.includes('--check');

const PLACES = new Set(['seatpack', 'saddlebag', 'barroll', 'barbag', 'barpocket', 'framebag_full', 'framebag_half',
  'toptube', 'toptube_rear', 'stem', 'fork', 'downtube', 'pannier', 'trunk', 'outside', 'frame', 'body', 'pocket', 'randobag']);
const CATSET = new Set(CATS.map((c) => c.id));
const ARCH = new Set(ARCHETYPES);

const all = [];
const problems = [];
const fixes = [];
for (const f of readdirSync(SRC).filter((f) => f.endsWith('.json')).sort()) {
  let arr;
  try { arr = JSON.parse(readFileSync(join(SRC, f), 'utf8')); } catch (e) { problems.push(`${f}: does not parse (${e.message})`); continue; }
  for (const it of arr) all.push({ ...it, __file: f });
}

const seen = new Map();
const out = [];
for (const it of all) {
  const where = `${it.__file}:${it.id}`;
  if (!/^[a-z0-9-]{1,16}$/.test(it.id || '')) { problems.push(`${where}: bad id`); continue; }
  if (seen.has(it.id)) { problems.push(`${where}: duplicate of ${seen.get(it.id)}`); continue; }
  seen.set(it.id, it.__file);
  if (!CATSET.has(it.cat)) problems.push(`${where}: unknown cat ${it.cat}`);
  if (!ARCH.has(it.archetype)) {
    problems.push(`${where}: unknown archetype ${it.archetype}`);
    continue;
  }
  if (!(it.weight_g > 0)) { problems.push(`${where}: no weight`); continue; }
  let d = Array.isArray(it.packed_cm) && it.packed_cm.length === 3 ? it.packed_cm.map(Number) : null;
  if (!d || d.some((x) => !(x > 0))) { problems.push(`${where}: bad packed_cm`); continue; }
  const sorted = [...d].sort((a, b) => b - a);
  if (sorted.join() !== d.join()) { fixes.push(`${where}: packed_cm sorted`); d = sorted; }
  let l = Number(it.packed_l);
  const box = (d[0] * d[1] * d[2]) / 1000;
  if (!(l > 0)) { l = Math.round(box * 0.85 * 100) / 100; fixes.push(`${where}: packed_l from box`); }
  // A stated volume far from the stated box means one of them is wrong. A
  // cylinder fills 79% of its box and a lumpy stuff sack less; anything
  // outside 0.3–1.15 of the box is flagged, not silently fixed.
  if (box > 0.1 && (l > box * 1.15 || l < box * 0.3)) problems.push(`${where}: packed_l ${l} vs box ${box.toFixed(2)} L`);
  const places = (it.places || []).filter((p) => PLACES.has(p.at));
  if ((it.places || []).length !== places.length) problems.push(`${where}: unknown place(s) ${(it.places || []).map((p) => p.at).filter((a) => !PLACES.has(a)).join(',')}`);
  if (!it.sources?.length) problems.push(`${where}: no source`);
  const basis = it.basis || (it.sources?.some((s) => /^https?:/.test(s.url || '')) ? 'sourced' : 'owner');
  const compress = Math.min(Math.max(Number(it.compress) || 0, 0), 0.9);
  out.push({
    id: it.id, name: it.name, cat: it.cat, sub: it.sub || null,
    generic: !!it.generic, brand: it.brand || null, model: it.model || null,
    weight_g: Math.round(it.weight_g),
    packed_cm: d, packed_l: Math.round(l * 100) / 100,
    compress, archetype: it.archetype, color: it.color || null,
    rigid: compress < 0.1, fragile: !!it.fragile, access: it.access || 'camp', worn: !!it.worn,
    ...(it.consumable ? { consumable: true } : {}),
    places, sources: it.sources || [], basis, note: it.note || '', aliases: it.aliases || [],
  });
}

const byCat = {};
for (const g of out) byCat[g.cat] = (byCat[g.cat] || 0) + 1;
const byBasis = {};
for (const g of out) byBasis[g.basis] = (byBasis[g.basis] || 0) + 1;
console.log(`${out.length} items`, byCat, byBasis);
if (fixes.length) console.log(`${fixes.length} fixes applied, e.g.`, fixes.slice(0, 5));
if (problems.length) { console.log(`${problems.length} problems:`); for (const p of problems) console.log('  ' + p); }
if (!check) {
  // category order, then generic first, then name — the order the locker shows
  const order = Object.fromEntries(CATS.map((c, i) => [c.id, i]));
  out.sort((a, b) => (order[a.cat] - order[b.cat]) || (b.generic - a.generic) || a.name.localeCompare(b.name));
  writeFileSync(join(root, 'data/gear.json'), JSON.stringify(out));
  console.log('wrote data/gear.json', (JSON.stringify(out).length / 1024).toFixed(0), 'KB');
}
