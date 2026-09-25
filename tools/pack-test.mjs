/**
 * The packing spine, proven in node before any UI exists.
 *
 *   node tools/pack-test.mjs
 *
 * 1. Import the owner's "Megafuck" tab (flat form, as he pasted it) and the
 *    same tab rebuilt as his real matrix form. Every item lands in the right
 *    place with the right weight, and the totals are his: gear 302.1 oz,
 *    bike 398, bags 304, all-up 1004.
 * 2. Export → import again: identical.
 * 3. Share: encode to a v2 link, decode, rebuild: identical. v1 links still
 *    decode as v1.
 * 4. Solver sanity on a synthetic seat pack.
 * Exit 1 on any failure.
 */
import { readFileSync } from 'node:fs';
import { indexGear } from '../src/pack/gear.js';
import { importSheet, exportSheet, sheetTotals, OWNER_COLUMNS } from '../src/pack/sheet.js';
import { resolveItem, parsePlace } from '../src/pack/model.js';
import { computeTotals } from '../src/pack/totals.js';
import { packFromLoadout, loadoutFromPack, encodeRigV2, decodeRigV2 } from '../src/pack/share.js';
import { solveBag } from '../src/pack/solver.js';
import { gToOz, r1 } from '../src/pack/units.js';

const root = new URL('../', import.meta.url).pathname;
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  ✗ ' + msg); } else if (process.argv.includes('-v')) console.log('  ✓ ' + msg); };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);

const gear = indexGear(JSON.parse(readFileSync(root + 'data/gear.json', 'utf8')));
const flat = readFileSync(root + 'data/seed/megafuck.tsv', 'utf8');
const TOTALS = '\nGear\t\t302.1\t18.88 lb\nBike\t\t398\t24.9 lb\nBags\t\t304\t19 lb\nAll up\t\t1004\t62.76 lb\n';

// the same tab in the owner's real matrix form
function toMatrix(text) {
  const rows = text.trim().split('\n').map((l) => l.split('\t'));
  const heads = OWNER_COLUMNS.map(([h]) => h);
  const out = [['Item', 'Category', 'oz', ...heads].join('\t')];
  for (const [item, cat, oz, where] of rows) {
    const m = where.match(/^([^(]+?)\s*(\((.*)\))?$/);
    const col = heads.findIndex((h) => h.toLowerCase() === m[1].trim().toLowerCase());
    const cells = heads.map((_, i) => (i === col ? (m[3] ? `X (${m[3]})` : 'X') : ''));
    out.push([item, cat, oz, ...cells].join('\t'));
  }
  return out.join('\n');
}

const EXPECT = {
  'Sleeping Bag': 'seatpack', 'Tent - YMG 1P Cirriform': 'forkR', Chair: 'barroll',
  'Battery Pack': 'framebag_half', 'Camp shoes': 'seatpack:lashed', Pot: 'seatpack:dangle',
  'Cycling Shorts': 'body', 'iPhone 14 pro': 'frame', 'Leatherman skeletool': 'toptube_rear',
  Headlamp: 'barpocket', Wallet: 'body:hip', 'Pedco ultra pod': 'body:hip',
  'Cycling gloves - fingerless': 'framebag_half:L', 'Zip lock lock': 'framebag_half:L',
  'Water filter': 'home', 'Eye Glasses / Sunglasses / case': 'toptube', 'Waterproof Trousers': 'forkL',
};

function check(label, text) {
  console.log(`\n${label}`);
  const { locker, loadout, totals, report } = importSheet(text, { gear, name: 'Megafuck' });
  const R = (it) => resolveItem(it, gear);
  eq(locker.items.length, 67, 'all 67 rows became items');
  for (const [name, code] of Object.entries(EXPECT)) {
    const it = locker.items.find((i) => i.name === name);
    ok(it, `found ${name}`);
    if (it) eq(loadout.place[it.uid], code, `${name} placed`);
  }
  // every weight exactly the sheet's, to 0.1 oz
  const src = flat.trim().split('\n').map((l) => l.split('\t'));
  for (const [name, , oz] of src) {
    const it = locker.items.find((i) => i.name === name);
    eq(r1(gToOz(R(it).g)), r1(parseFloat(oz)), `${name} weight`);
  }
  const st = sheetTotals(locker, loadout, (it) => R(it).g);
  eq([st.gear, st.bike, st.bags, st.allup], [302.1, 398, 304, 1004.1], 'sheet-math totals');
  // his sheet shows all-up as 1004 (1004.1 to whole ounces); our export writes the decimal
  ok(Math.abs(totals.allup - 1004) < 0.15 && totals.gear === 302.1 && totals.bike === 398 && totals.bags === 304, `totals rows read: ${JSON.stringify(totals)}`);
  const t = computeTotals(locker.items.map(R), loadout, {});
  eq(r1(gToOz(t.home)), 2, 'home = the water filter');
  eq(r1(gToOz(t.worn)), 23, 'on the body: 16.1 worn + 6.9 in the hip sack');
  eq(r1(gToOz(t.allup)), 1002.1, 'app all-up leaves the filter at home');
  console.log(`  matched ${report.matched.length} to the catalogue, ${report.custom.length} custom; notes: ${report.notes.join('; ') || 'none'}`);
  return { locker, loadout, R };
}

const a = check('flat form', flat + TOTALS);
const b = check('matrix form', toMatrix(flat) + TOTALS);

console.log('\nexport → import');
const out = exportSheet({ locker: b.locker, loadout: b.loadout, resolve: b.R });
const c = check('re-imported export', out);
const sig = (x) => x.locker.items.map((i) => [i.name, r1(gToOz(x.R(i).g)), x.loadout.place[i.uid]]);
eq(sig(c), sig(b), 'export round trip identical');

console.log('\nshare link');
const pack = packFromLoadout(b.locker, b.loadout, gear);
const rig = { v: 2, name: 'Megafuck', env: 'mountain', paint: 'Slate', size: 'M', bags: [{ slot: 'seatpack', brand: 'Apidura', line: 'Expedition', name: 'Saddle Pack', size: '14L', cw: 0 }], pack };
const link = await encodeRigV2(rig);
console.log(`  link payload ${link.length} chars for ${pack.items.length} items (raw JSON ${JSON.stringify(rig).length})`);
const back = await decodeRigV2(link);
eq(back.bags, rig.bags, 'bags survive');
const d = loadoutFromPack(back.pack, gear, back.name);
const dR = (it) => resolveItem(it, gear);
eq(d.locker.items.map((i) => [i.name || dR(i).name, r1(gToOz(dR(i).g)), d.loadout.place[i.uid]]), sig(b), 'packing list survives the link');
eq([d.loadout.bike_g, d.loadout.bags_g], [b.loadout.bike_g, b.loadout.bags_g], 'bike and bags weights survive');

console.log('\nsolver');
// a 14 L wedge: 480 mm long, deep at the post (u=480) tapering to the tail
const stations = [];
for (let i = 0; i < 12; i++) {
  const u0 = i * 40, u1 = u0 + 40, t = (u0 + 20) / 480;
  const h = 70 + 90 * t, w = 50 + 90 * t;
  stations.push({ u0, u1, v0: -h, v1: h, w0: -w / 2, w1: w / 2 });
}
const cav = { u0: 0, u1: 480, mount: 480, stations, litres: 14 };
const items = ['sleeping-bag', 'montbell-anorak', 'casual-shorts', 'buff', 'gas-100']
  .map((id) => gear.get(id)).filter(Boolean)
  .map((g, i) => resolveItem({ uid: `u${i}`, ref: g.id }, gear));
const res = solveBag(cav, items, { slot: 'seatpack' });
console.log(`  ${res.placed.length} placed, ${res.overflow.length} overflow, fill ${(res.fill.frac * 100).toFixed(0)}%`);
ok(res.fill.frac <= 1.0001, 'never over the rated volume');
ok(res.placed.every((p) => p.center[0] >= 0 && p.center[0] <= 480), 'everything inside the bag length');

// a wedge that is NARROW at the mount: the canister must go further in, not fail
{
  const st2 = [];
  for (let i = 0; i < 12; i++) {
    const u0 = i * 40, t = 1 - (u0 + 20) / 480;              // t=1 at the tail (u=0), 0 at the post
    const h = 30 + 130 * t, w = 30 + 110 * t;
    st2.push({ u0, u1: u0 + 40, v0: -h / 2, v1: h / 2, w0: -w / 2, w1: w / 2 });
  }
  const cav2 = { u0: 0, u1: 480, mount: 480, stations: st2, litres: 13 };
  const can = resolveItem({ uid: 'c', ref: 'gas-100' }, gear);
  const r2 = solveBag(cav2, [can], { slot: 'seatpack' });
  ok(r2.placed.length === 1, `canister finds the fat part of a pinched-nose pack (${JSON.stringify(r2.overflow)})`);
  const poles = resolveItem({ uid: 'p', name: 'Tent poles', g: 400, a: 'pole_bundle', d: [55, 5, 5] }, gear);
  const cav3 = { ...cav2, u1: 300, stations: st2.map((s) => ({ ...s, u0: s.u0 * 0.625, u1: s.u1 * 0.625 })), mount: 300 };
  const r3 = solveBag(cav3, [poles], { slot: 'toptube' });
  ok(r3.overflow[0]?.reason === 'length', 'poles longer than the bag are refused, with the reason');
  const big = ['sleeping-bag', 'tent-1p', 'puffy-synth', 'rain-jacket'].map((id, i) => resolveItem({ uid: `b${i}`, ref: id }, gear));
  const r4 = solveBag({ ...cav2, litres: 5 }, big, { slot: 'seatpack' });
  ok(r4.overflow.some((o) => o.reason === 'volume') && r4.fill.frac <= 1.0001, `a 5 L bag says no politely (${r4.overflow.length} refused, ${Math.round(r4.fill.frac * 100)}%)`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
