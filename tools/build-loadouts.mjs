/**
 * Curated example rigs — the "Loadouts" level of the v2 menu.
 *
 * WHY THIS FILE EXISTS RATHER THAN A HAND-WRITTEN JSON. A loadout names real
 * products by (brand, line, name, size), which is the same durable identity
 * src/rig.js uses. Hand-writing those quadruples is how you get a loadout that
 * silently loads five bags instead of eight the next time somebody tidies a
 * product name — the exact failure rig.js was built to prevent. So the specs
 * live here as source, this script RESOLVES every one of them against
 * data/brands.json, and it FAILS LOUDLY if a single product cannot be found.
 * Re-run it after any catalogue change:
 *
 *   node tools/build-loadouts.mjs
 *
 * Output: data/loadouts.json — read by src/ui/v2/loadouts.js and shipped by
 * tools/build-pages.mjs.
 *
 * The litre totals in the output are COMPUTED, never typed. A curated rig that
 * advertises 54 L and mounts 48 is worse than one that advertises nothing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/*
 * The mount slots, read out of the one file that defines them.
 *
 * `package.json` declares `"type": "commonjs"`, so `src/bags/slots.js` — which
 * is ESM, and is only ever loaded by the browser — cannot be `import`ed from a
 * Node `.mjs` script: node resolves it as CJS and the named export is not
 * there. Parsing the keys is the alternative, and it is fine for this purpose:
 * the point is to catch a TYPO in a slot name in the table below, so the check
 * only needs the set of legal names, and if this regex ever stopped matching
 * the build would fail loudly on the very first loadout rather than pass a
 * broken one.
 */
const SLOT_NAMES = (() => {
  const src = readFileSync(join(root, 'src/bags/slots.js'), 'utf8');
  const body = src.slice(src.indexOf('export const SLOTS = {'));
  const names = new Set([...body.matchAll(/^\s{2}([a-zA-Z_]+):\s*\{/gm)].map((m) => m[1]));
  if (names.size < 10) throw new Error('build-loadouts: could not read the slot table from src/bags/slots.js');
  return names;
})();

/**
 * The curated set. Each entry is a story first and a bag list second: the
 * `note` is what makes somebody press it, and it has to say something the
 * numbers do not already say.
 *
 * `bags` are [uiSlot, brand, line, name, size]. An empty line is a brand whose
 * catalogue has no lines (Rapha); size may be empty for one-size products.
 */
const LOADOUTS = [
  {
    id: 'expedition',
    name: 'The Expedition',
    kicker: 'All Apidura',
    note: 'One maker, one line, every mount filled. This is the shape of a bike '
        + 'crossing a continent unsupported — bar to fork to frame to tail.',
    tags: ['Apidura', 'Expedition', 'Self-supported'],
    paint: 'Slate',
    env: 'mountain',
    bags: [
      ['barroll',       'Apidura', 'Expedition', 'Handlebar Pack',        '14L'],
      ['barpocket',     'Apidura', 'Expedition', 'Front Accessory Pack',  '3.5L'],
      ['framebag_full', 'Apidura', 'Expedition', 'Full Frame Pack',       '8L'],
      ['toptube',       'Apidura', 'Expedition', 'Top Tube Pack',         '1L'],
      ['stemL',         'Apidura', 'Expedition', 'Stem Pack',             '1.3L'],
      ['stemR',         'Apidura', 'Expedition', 'Stem Pack',             '1.3L'],
      ['seatpack',      'Apidura', 'Expedition', 'Saddle Pack',           '16L'],
      ['forkL',         'Apidura', 'Expedition', 'Cargo Cage Pack',       '3.5L'],
      ['forkR',         'Apidura', 'Expedition', 'Cargo Cage Pack',       '3.5L'],
      ['downtube',      'Apidura', 'Expedition', 'Downtube Pack',         '1.5L'],
    ],
  },
  {
    id: 'light-and-fast',
    name: 'Light & Fast',
    kicker: 'Apidura Racing',
    note: 'Four bags, nothing above the bars, nothing off the fork. Everything '
        + 'here is reachable at speed and nothing here flaps.',
    tags: ['Apidura', 'Racing', 'Ultra-distance'],
    paint: 'Midnight',
    env: 'mountain',
    bags: [
      ['seatpack',      'Apidura', 'Racing', 'Saddle Pack',    '5L'],
      ['barbag',        'Apidura', 'Racing', 'Handlebar Pack', '2L'],
      ['framebag_half', 'Apidura', 'Racing', 'Frame Pack',     '2.4L'],
      ['toptube',       'Apidura', 'Racing', 'Top Tube Pack',  '0.5L'],
    ],
  },
  {
    id: 'heavy-load',
    name: 'Heavy Load',
    kicker: 'Ortlieb, fully loaded',
    note: 'Racks, rollers and welded seams. The touring answer to the same '
        + 'question the soft bags ask — carry it all, and keep it dry.',
    tags: ['Ortlieb', 'Touring', 'Waterproof'],
    paint: 'Forest',
    env: 'lake',
    bags: [
      ['pannierL',      'Ortlieb', 'Back-Roller',    'Back-Roller',       '20L'],
      ['pannierR',      'Ortlieb', 'Back-Roller',    'Back-Roller',       '20L'],
      ['trunk',         'Ortlieb', 'Trunk-Bag',      'Trunk-Bag RC',      '12L'],
      ['barbag',        'Ortlieb', 'Handlebar-Pack', 'Handlebar-Pack QR', '11L'],
      ['framebag_full', 'Ortlieb', 'Frame-Pack',     'Frame-Pack',        '6L'],
      ['forkL',         'Ortlieb', 'Fork-Pack',      'Fork-Pack',         '5.8L'],
      ['forkR',         'Ortlieb', 'Fork-Pack',      'Fork-Pack',         '5.8L'],
      ['toptube',       'Ortlieb', 'Fuel-Pack',      'Fuel-Pack',         '1L'],
    ],
  },
  {
    id: 'dirt-drop',
    name: 'Dirt Drop',
    kicker: 'Revelate Designs',
    note: 'Built in Alaska for ground that fights back. Seat pack on a hard '
        + 'mount, harness up front, feed bags either side of the stem.',
    tags: ['Revelate', 'Singletrack', 'Off-road'],
    paint: 'Oxblood',
    env: 'forest',
    bags: [
      ['seatpack',      'Revelate Designs', 'Spinelock',  'Spinelock',         '16L'],
      ['barroll',       'Revelate Designs', 'Sweetroll',  'Sweetroll',         '15L'],
      ['barpocket',     'Revelate Designs', 'Scrambler',  'Scrambler Pocket',  '3.5L'],
      ['framebag_full', 'Revelate Designs', 'Ranger',     'Ranger Frame Bag',  'MD'],
      ['toptube',       'Revelate Designs', 'Mag-Tank',   'Mag-Tank 2000',     '1.4L'],
      ['toptube_rear',  'Revelate Designs', 'Jerrycan',   'Jerrycan',          'Regular'],
      ['stemL',         'Revelate Designs', 'Feedbag',    'Mountain Feedbag',  '1L'],
      ['stemR',         'Revelate Designs', 'Feedbag',    'Mountain Feedbag',  '1L'],
    ],
  },
  {
    id: 'the-system',
    name: 'The System',
    kicker: 'Tailfin, end to end',
    note: 'One engineered mounting platform carrying everything. Machined, '
        + 'modular, and heavier on the wallet than on the bike.',
    tags: ['Tailfin', 'Modular', 'Rack-based'],
    paint: 'Midnight',
    env: 'mountain',
    bags: [
      ['trunk',         'Tailfin', 'CargoPack',  'CargoPack System',           '18L'],
      ['pannierL',      'Tailfin', 'Panniers',   'Pannier',                    '16L'],
      ['pannierR',      'Tailfin', 'Panniers',   'Pannier',                    '16L'],
      ['forkL',         'Tailfin', 'Fork Packs', 'Fork Pack',                  '5L'],
      ['forkR',         'Tailfin', 'Fork Packs', 'Fork Pack',                  '5L'],
      ['barroll',       'Tailfin', 'Bar System', 'Bar Bag System - Drop Bar',  'Large (12.5L)'],
      ['framebag_half', 'Tailfin', 'Frame Bags', 'Half Frame Bag',             '4.5L'],
      ['toptube',       'Tailfin', 'Top Tube',   'Top Tube Bag',               '1.1L Zip/Flip'],
    ],
  },
  {
    id: 'overnighter',
    name: 'The Overnighter',
    kicker: 'Five small makers',
    note: 'Out after work, back before the second coffee. One sleep system, '
        + 'one change of clothes, and five bags from five people who sew.',
    tags: ['Handmade', 'Sub-24', 'Mixed'],
    paint: 'Sand',
    env: 'forest',
    bags: [
      ['seatpack',      'Outer Shell Adventure', 'Seatpack',  'Seatpack',                     '10.5L'],
      ['barbag',        'Wizard Works',          'Presto',    'Lil Presto Barrel Bag',        'Large (3.5L)'],
      ['framebag_half', 'Swift Industries',      'Hold Fast', 'Hold Fast Half Frame Bag',     '3.25L'],
      ['toptube',       'Rockgeist',             'Cache',     'Cache Top Tube Bag (Velcro)',  'Large'],
      ['stemL',         'Wizard Works',          'Voila',     'Voila Stem Bag',               'Large'],
    ],
  },
  {
    id: 'randonneur',
    name: 'The Randonneur',
    kicker: 'Front load, old rules',
    note: 'Weight over the front wheel and a saddlebag the size of a suitcase. '
        + 'The oldest way to carry a load on a bicycle, and still one of the best.',
    tags: ['Carradice', 'Swift', 'Classic'],
    paint: 'Sand',
    env: 'lake',
    bags: [
      ['randobag',      'Swift Industries', 'Sugarloaf', 'Sugarloaf Basket Bag',       '11L'],
      ['saddlebag',     'Carradice',        'Originals', 'Nelson Longflap Saddlebag',  '18L'],
      ['framebag_half', 'Swift Industries', 'Hold Fast', 'Hold Fast Half Frame Bag',   '4L'],
      ['toptube',       'Swift Industries', 'Moxie',     'Moxie Top Tube Bag',         '0.6L'],
      ['stemR',         'Swift Industries', 'Sidekick',  'Sidekick Stem Pouch',        '1L'],
    ],
  },
  {
    id: 'aero',
    name: 'Aero',
    kicker: 'Apidura Aero + Racing',
    note: 'Bags shaped by a wind tunnel rather than by a volume target. Open '
        + 'the tunnel on this one and watch where the air goes.',
    tags: ['Apidura', 'Aero', 'Time trial'],
    paint: 'Midnight',
    env: 'desert',
    bags: [
      ['framebag_half', 'Apidura', 'Aero',   'Frame Module',    'Large'],
      ['toptube',       'Apidura', 'Aero',   'Top Tube Module', '0.4L'],
      ['seatpack',      'Apidura', 'Racing', 'Saddle Pack',     '3L'],
      ['barbag',        'Apidura', 'Racing', 'Aerobar Pack',    '2.5L'],
    ],
  },
];

// ---- resolve --------------------------------------------------------------

const brands = JSON.parse(readFileSync(join(root, 'data/brands.json'), 'utf8'));
const norm = (s) => String(s ?? '').trim();
const loose = (s) => norm(s).toLowerCase().replace(/\s+/g, ' ');

function find(brandName, line, name, size) {
  const brand = brands.find((b) => loose(b.name) === loose(brandName));
  if (!brand) return { err: `no brand "${brandName}"` };
  const hit = brand.products.find((p) =>
    loose(p.line) === loose(line) && loose(p.name) === loose(name) && loose(p.size) === loose(size));
  if (!hit) return { err: `no product ${brandName} | ${line} | ${name} | ${size}` };
  return { brand, product: hit };
}

const errors = [];
const out = LOADOUTS.map((spec) => {
  let litres = 0;
  const makers = new Set();
  const seenSlots = new Set();
  const bags = spec.bags.map(([slot, brandName, line, name, size]) => {
    /*
     * The slot is checked as hard as the product is.
     *
     * A mistyped slot, or the same slot twice, used to survive into the output
     * and get counted in `stats.bags` — and a duplicate is the bad one: the
     * bike can only equip one bag per mount, so the card advertised ten bags
     * and mounted nine, which is the precise failure this file exists to make
     * impossible.
     */
    if (!SLOT_NAMES.has(slot)) { errors.push(`${spec.id}: no such mount slot "${slot}"`); return null; }
    if (seenSlots.has(slot)) { errors.push(`${spec.id}: mount slot "${slot}" used twice`); return null; }
    seenSlots.add(slot);

    const { brand, product, err } = find(brandName, line, name, size);
    if (err) { errors.push(`${spec.id}: ${err}`); return null; }

    /*
     * And the capacity. `Number(x) || 0` turns undefined, "" and NaN into zero
     * — so a product whose litres never got measured would quietly subtract
     * itself from a total the card then presents as fact. A loadout that
     * cannot state its own capacity is a loadout that does not ship.
     */
    const l = Number(product.liters);
    if (!Number.isFinite(l) || l < 0) {
      errors.push(`${spec.id}: ${brand.name} ${name} has no usable capacity (liters=${JSON.stringify(product.liters)})`);
      return null;
    }
    litres += l;
    makers.add(brand.name);
    return {
      slot,
      brand: norm(brand.name),
      line: norm(product.line),
      name: norm(product.name),
      size: norm(product.size),
      cw: 0,
    };
  }).filter(Boolean);

  return {
    id: spec.id,
    name: spec.name,
    kicker: spec.kicker,
    note: spec.note,
    tags: spec.tags,
    // The stats a person actually compares two rigs on, computed from the
    // catalogue rather than asserted here.
    stats: {
      litres: Math.round(litres * 10) / 10,
      bags: bags.length,
      makers: makers.size,
    },
    // The rig itself, in exactly the shape src/rig.js:applyRig() consumes.
    rig: { v: 1, name: spec.name, env: spec.env, paint: spec.paint, bags },
  };
});

if (errors.length) {
  console.error('LOADOUT RESOLUTION FAILED — refusing to write a broken file:');
  for (const e of errors) console.error('  ·', e);
  process.exit(1);
}

writeFileSync(join(root, 'data/loadouts.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`wrote data/loadouts.json — ${out.length} loadouts`);
for (const l of out) {
  console.log(`  ${l.name.padEnd(18)} ${String(l.stats.bags).padStart(2)} bags · `
    + `${String(l.stats.litres).padStart(5)} L · ${l.stats.makers} maker${l.stats.makers === 1 ? '' : 's'}`);
}
