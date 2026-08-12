/**
 * Assemble, per slot, the evidence a critic needs to judge every bag in it.
 *
 *   node tools/eval-bundle.mjs --run <stamp>
 *
 * Writes evals/runs/<stamp>/bundles/<slot>.md — one file per builder, because
 * the builder is the unit of fixing (one edit to seatpack.js moves 78 products)
 * and a critic that has seen all eleven seat packs can say "they are all wrong
 * the same way", which is the sentence that actually saves work.
 *
 * The bundle is paths, not pixels. Critics open the images themselves; putting
 * eleven bags' worth of photographs into a prompt would blow the context before
 * the first verdict.
 *
 * Reference images are ORDERED, not dumped. The order encodes what each kind of
 * picture is good for:
 *
 *   dimensions   the maker's engineering drawing — the only orthographic,
 *                unlit, undistorted view. Judge SHAPE here and nowhere else.
 *   on-bike      the only evidence of orientation and what it straps to.
 *   feature      close-ups of buckles, tabs and strap ends — hardware detail.
 *   studio       overall proportion and colourway.
 *
 * Lifestyle shots are deliberately excluded: a loaded bag on a mountainside at
 * dusk is the least measurable picture on the page, and a critic given one will
 * write about the mood.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const RUNS = join(root, 'evals/runs');
const newest = () => readdirSync(RUNS).filter((d) => existsSync(join(RUNS, d, 'shots'))).sort().pop();
const run = arg('run', newest());
if (!run) { console.error('no runs found'); process.exit(2); }

const media = JSON.parse(readFileSync(join(root, 'data/apidura-media.json')));
const models = JSON.parse(readFileSync(join(root, 'data/models/apidura.json')));
const diagProf = existsSync(join(root, 'data/diagram-profiles.json'))
  ? JSON.parse(readFileSync(join(root, 'data/diagram-profiles.json'))) : {};
const items = JSON.parse(readFileSync(join(RUNS, run, 'items.json')));

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ORDER = ['dimensions', 'on-bike', 'feature', 'studio'];
const CAP = { dimensions: 3, 'on-bike': 4, feature: 4, studio: 4 };

/** page whose SKU list contains this product */
const pageFor = (slugNoBrand) =>
  Object.values(media.pages).find((p) => p.skus.some((s) => s.slug === slugNoBrand));

const bySlot = new Map();
for (const it of items) {
  const slot = it.slot || 'unknown';
  if (!bySlot.has(slot)) bySlot.set(slot, []);
  bySlot.get(slot).push(it);
}

const outDir = join(RUNS, run, 'bundles');
mkdirSync(outDir, { recursive: true });
const written = [];

for (const [slot, list] of bySlot) {
  const L = [];
  L.push(`# ${slot} — ${list.length} Apidura products`);
  L.push('');
  L.push(`Run: \`${run}\`  ·  builder: \`src/bags/builders/${slot.replace('framebag_', 'frame').replace('_', '')}.js\``);
  L.push('');

  for (const it of list) {
    const slug = it.slug;
    const noBrand = slug.replace(/^apidura-/, '');
    const rec = models.products.find(
      (p) => norm([p.line, p.name, p.size].filter(Boolean).join('-')) === noBrand,
    );
    const page = pageFor(noBrand);

    L.push(`---`);
    L.push('');
    L.push(`## ${slug}`);
    L.push('');

    const shotDir = join(RUNS, run, 'shots', slug);
    const shots = existsSync(shotDir) ? readdirSync(shotDir).filter((f) => /\.(jpg|png)$/i.test(f)) : [];
    L.push(`**Our render** (judge these):`);
    for (const s of shots) L.push(`- ${join(RUNS, run, 'shots', slug, s)}`);
    if (!shots.length) L.push(`- MISSING — no render produced`);
    L.push('');

    L.push(`**The maker's own images** (the bar):`);
    if (page) {
      const sizeTok = norm(String(rec?.size || '')).replace(/[^0-9l-]/g, '');
      for (const kind of ORDER) {
        let pool = page.images.filter((i) => i.kind === kind);
        // a page covers several sizes; prefer this size's files when tagged
        const sized = pool.filter((i) => i.size && sizeTok && i.size === sizeTok);
        if (sized.length) pool = sized;
        for (const im of pool.slice(0, CAP[kind])) {
          // Point at the rasterised copy of any diagram. Image tools cannot
          // open SVG, so listing the .svg here would put the single most
          // useful reference in front of every critic in a form none of them
          // can actually look at.
          const png = im.local.replace(/\.svg$/i, '.png');
          const rel = /\.svg$/i.test(im.local) && existsSync(join(root, png)) ? png : im.local;
          L.push(`- [${kind}] ${join(root, rel)}`);
        }
      }
    } else {
      L.push(`- NONE FOUND — flag this`);
    }
    L.push('');

    if (rec) {
      L.push(`**What our record claims** (it may be wrong — say so if it is):`);
      L.push('```json');
      L.push(JSON.stringify({
        dims_cm: rec.dims_cm, dims_state: rec.dims_state, capacity_l: rec.capacity_l,
        geometry: rec.geometry, closure: rec.closure, straps: rec.straps,
        pockets: rec.pockets, zips: rec.zips,
      }, null, 1));
      L.push('```');
      L.push('');
    }

    const dp = diagProf[slug];
    if (dp) {
      L.push(`**Outline measured from the drawing** — agreement with published dims `
        + `${(dp.agreement.side * 100) | 0}%, drawn ${dp.drawn_state}`
        + `${dp.view_ambiguous ? ', VIEW AMBIGUOUS (may be the top view, not the side)' : ''}`);
      L.push('');
    }
  }

  const file = join(outDir, `${slot}.md`);
  writeFileSync(file, L.join('\n'));
  written.push([slot, list.length, file]);
}

for (const [slot, n, f] of written) console.log(`  ${slot.padEnd(16)} ${String(n).padStart(3)} bags  ${f}`);
console.log(`\n${written.length} bundles → ${outDir}`);
