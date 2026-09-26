/**
 * The packing model.
 *
 * ITEMS BELONG TO A PERSON; PLACEMENTS BELONG TO A LOADOUT. That is the owner's
 * spreadsheet, which is the real data model: rows are things owned once, and
 * every tab is a different arrangement of the same things. So:
 *
 *   Locker   { v, items: [Item] }              , everything I own, once
 *   Item     { uid, ref?, name?, g?, cat?, a?, d?, l?, cmp?, col?, note? }
 *              `ref` is a gear-catalogue id; every other field overrides the
 *              catalogue (the owner's own scale beats a spec sheet). An item
 *              with no `ref` is custom and carries everything itself.
 *   Loadout  { name, place: { [uid]: code }, bike_g?, bags_g? }
 *              an item with no entry is at home.
 *
 * A placement is a short string so it survives JSON, Firestore, a share link
 * and a spreadsheet cell without a schema of its own:
 *
 *   home                        owned, not coming
 *   <slot>                      in a bag           seatpack, forkR, barpocket…
 *   <slot>:L | <slot>:R         one side of a two-sided frame bag
 *   <slot>:lashed               strapped to the outside of that bag
 *   <slot>:dangle               hanging off that bag
 *   frame | frame:<mount>       bolted to the bike: bottle | bar | pump | top
 *   body | body:<in>            worn; or in a body container: hip | pocket | pack
 *
 * Nothing in this file touches three.js or the DOM, so it runs in node, the
 * round-trip tests in tools/pack-test.mjs import it directly.
 */

import { ozToG } from './units.js';

// ---- categories ------------------------------------------------------------
// The order people think in when they lay kit out on the floor: the big camp
// things, then what you eat and drink, then what you wear, then the small stuff.
export const CATS = [
  { id: 'sleep', label: 'Sleep' },
  { id: 'shelter', label: 'Shelter' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'water', label: 'Water' },
  { id: 'food', label: 'Food' },
  { id: 'clothing', label: 'Clothing' },
  { id: 'repair', label: 'Repair' },
  { id: 'electronics', label: 'Electronics' },
  { id: 'hygiene', label: 'Hygiene' },
  { id: 'firstaid', label: 'First aid' },
  { id: 'misc', label: 'Everything else' },
];
export const CAT_LABEL = Object.fromEntries(CATS.map((c) => [c.id, c.label]));

// ---- placements ------------------------------------------------------------
export const BAG_SLOTS = [
  'seatpack', 'saddlebag', 'barroll', 'barbag', 'barpocket', 'randobag',
  'framebag_full', 'framebag_half', 'toptube', 'toptube_rear',
  'stemL', 'stemR', 'forkL', 'forkR', 'downtube', 'pannierL', 'pannierR', 'trunk',
];
const BAG_SET = new Set(BAG_SLOTS);
export const FRAME_MOUNTS = ['bottle', 'bar', 'pump', 'top'];
export const BODY_IN = ['hip', 'pocket', 'pack'];

/** code → { loc, slot?, side?, mount?, in? }. Unknown codes read as home. */
export function parsePlace(code) {
  const s = String(code || 'home').trim();
  const [head, tail] = s.split(':');
  if (head === 'home' || !head) return { loc: 'home' };
  if (head === 'frame') return { loc: 'frame', mount: FRAME_MOUNTS.includes(tail) ? tail : null };
  if (head === 'body') return { loc: 'body', in: BODY_IN.includes(tail) ? tail : null };
  if (BAG_SET.has(head)) {
    if (tail === 'lashed' || tail === 'dangle') return { loc: tail, slot: head };
    if (tail === 'L' || tail === 'R') return { loc: 'bag', slot: head, side: tail };
    return { loc: 'bag', slot: head };
  }
  return { loc: 'home' };
}

export function formatPlace(p) {
  if (!p || p.loc === 'home') return 'home';
  if (p.loc === 'frame') return p.mount ? `frame:${p.mount}` : 'frame';
  if (p.loc === 'body') return p.in ? `body:${p.in}` : 'body';
  if (p.loc === 'lashed' || p.loc === 'dangle') return `${p.slot}:${p.loc}`;
  if (p.loc === 'bag') return p.side ? `${p.slot}:${p.side}` : p.slot;
  return 'home';
}

/** Is this item on the bike (in, on, or bolted to it)? Worn and home are not. */
export const onBike = (code) => {
  const p = parsePlace(code);
  return p.loc === 'bag' || p.loc === 'lashed' || p.loc === 'dangle' || p.loc === 'frame';
};

// ---- catalogue + archetype guessing ----------------------------------------
/**
 * Density fallbacks per archetype, g per litre of packed volume, plus a
 * default compressibility. Used ONLY for a custom item with no dimensions, so
 * a pasted row "Chair, 18 oz" still arrives with a believable size instead of a
 * 1-litre cube. Each figure is the median of that archetype in data/gear.json
 * at the time of writing (see DECISIONS.md §8).
 */
export const ARCH_DEFAULTS = {
  stuffsack: { gpl: 90, cmp: 0.5, shape: [2.2, 1, 1] },
  sleeping_bag: { gpl: 110, cmp: 0.6, shape: [1.6, 1, 1] },
  mat_rolled: { gpl: 330, cmp: 0.15, shape: [2.8, 1, 1] },
  mat_folded: { gpl: 45, cmp: 0.1, shape: [2.6, 2.3, 1] },
  tent_bundle: { gpl: 280, cmp: 0.35, shape: [2.8, 1, 1] },
  pole_bundle: { gpl: 700, cmp: 0, shape: [12, 1, 1] },
  canister: { gpl: 520, cmp: 0, shape: [1, 1, 0.8] },
  stove: { gpl: 350, cmp: 0, shape: [1.3, 1, 1] },
  pot: { gpl: 160, cmp: 0, shape: [1.1, 1.1, 1] },
  mug: { gpl: 180, cmp: 0, shape: [1.1, 1, 1] },
  bottle: { gpl: 130, cmp: 0.05, shape: [3, 1, 1] },
  bladder: { gpl: 150, cmp: 0.6, shape: [2.4, 1.6, 1] },
  utensil: { gpl: 400, cmp: 0, shape: [8, 1.6, 1] },
  lighter: { gpl: 700, cmp: 0, shape: [3.2, 1.2, 1] },
  clothing_folded: { gpl: 160, cmp: 0.45, shape: [1.5, 1.2, 1] },
  clothing_rolled: { gpl: 180, cmp: 0.4, shape: [2.2, 1, 1] },
  shoes: { gpl: 120, cmp: 0.15, shape: [2.6, 1.1, 1] },
  inner_tube: { gpl: 450, cmp: 0.1, shape: [2.2, 1.4, 1] },
  pump: { gpl: 700, cmp: 0, shape: [9, 1, 1] },
  phone: { gpl: 1900, cmp: 0, shape: [7, 3.4, 1] },
  power_bank: { gpl: 1800, cmp: 0, shape: [3.6, 2.2, 1] },
  action_camera: { gpl: 1000, cmp: 0, shape: [1.5, 1.2, 1] },
  headlamp: { gpl: 500, cmp: 0.05, shape: [2, 1.4, 1] },
  cable_coil: { gpl: 400, cmp: 0.2, shape: [2, 2, 1] },
  pouch: { gpl: 350, cmp: 0.3, shape: [2, 1.4, 1] },
  box: { gpl: 500, cmp: 0, shape: [2, 1.3, 1] },
  multitool: { gpl: 1600, cmp: 0, shape: [4, 1.7, 1] },
  tube_bottle: { gpl: 900, cmp: 0.05, shape: [3.5, 1.3, 1] },
  chair: { gpl: 400, cmp: 0, shape: [3, 1, 1] },
};
export const ARCHETYPES = Object.keys(ARCH_DEFAULTS);

/**
 * Keyword → archetype, for custom items and unmatched sheet rows. First hit
 * wins, so the specific phrases are listed before the general ones ("pot lid"
 * before "pot", "sleeping bag" before "bag").
 */
const GUESS = [
  [/sleeping bag|quilt|\bbag\b.*sleep|down bag/i, 'sleeping_bag'],
  [/neo ?air|x-?lite|\bmat\b|pad|tensor|uberlite/i, 'mat_rolled'],
  [/z-?lite|foam|ccf/i, 'mat_folded'],
  [/pillow/i, 'stuffsack'],
  [/tent|bivy|bivvy|shelter|tarp|x-?mid/i, 'tent_bundle'],
  [/pole|peg|stake/i, 'pole_bundle'],
  [/gas|canister|fuel/i, 'canister'],
  [/stove|burner|jetboil|pocket ?rocket/i, 'stove'],
  [/\blid\b/i, 'pot'],
  [/\bpot\b|pan|cook/i, 'pot'],
  [/mug|cup/i, 'mug'],
  [/bladder|reservoir|hydration/i, 'bladder'],
  [/bottle|bidon|flask|water\b/i, 'bottle'],
  [/spork|spoon|fork|knife|utensil/i, 'utensil'],
  [/lighter|matches|fire/i, 'lighter'],
  [/shoe|sandal|croc|slipper|bootie/i, 'shoes'],
  [/sock|buff|boxer|underwear|brief|shorts|beanie|glove|mitt|cap\b|hat/i, 'clothing_rolled'],
  [/jacket|anorak|shell|shakedry|fleece|puffy|shirt|jersey|capilene|base ?layer|trouser|pant|overshoe|tights|vest|gilet|hoody|hoodie/i, 'clothing_folded'],
  [/tubolito|inner ?tube|\btube\b|spare tube/i, 'inner_tube'],
  [/pump|co2|inflator/i, 'pump'],
  [/leatherman|skeletool|multi-?tool|bike tool|chain tool|allen/i, 'multitool'],
  [/iphone|phone|pixel|galaxy/i, 'phone'],
  [/battery pack|power ?bank|powerbank|anker|nitecore/i, 'power_bank'],
  [/go ?pro|insta360|action cam/i, 'action_camera'],
  [/head ?lamp|head ?torch|bindi|actik/i, 'headlamp'],
  [/cable|cord|charger|plug|line\b|paracord|lock/i, 'cable_coil'],
  [/battery/i, 'box'],
  [/sunscreen|spray|repellent|toothpaste|tooth|lotion|cream|balm|sanitiser|sanitizer/i, 'tube_bottle'],
  [/chair/i, 'chair'],
  [/glasses|case|watch|ultra ?pod|tripod/i, 'box'],
  [/first aid|kit|wipes|soap|wallet|pouch|patch|tape|lever|plug/i, 'pouch'],
  [/backpack|daypack|sack|dry ?bag|stuff/i, 'stuffsack'],
];

export function guessArchetype(name) {
  for (const [re, a] of GUESS) if (re.test(name)) return a;
  return 'pouch';
}

/** Canonical category for a free-text sheet category + item name. */
export function guessCat(sheetCat, name, archetype) {
  const c = String(sheetCat || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  if (/first aid/.test(n)) return 'firstaid';
  if (archetype === 'sleeping_bag' || /pillow|mat\b|neoair/.test(n)) return 'sleep';
  if (archetype === 'tent_bundle' || archetype === 'pole_bundle' || /paracord|clothes ?line/.test(n)) return 'shelter';
  if (/bottle|filter|bladder/.test(n)) return 'water';
  if (/kitchen|cook/.test(c) || ['canister', 'stove', 'pot', 'mug', 'utensil', 'lighter'].includes(archetype)) return 'kitchen';
  if (/electronic/.test(c)) return 'electronics';
  if (/bathroom|hygiene|toilet/.test(c)) return 'hygiene';
  if (/wallet|backpack|lock/.test(n)) return 'misc';
  if (/cloth/.test(c)) return 'clothing';
  if (/bike|repair|tool/.test(c)) return 'repair';
  if (/food/.test(c)) return 'food';
  if (/camp/.test(c)) return 'misc';
  return 'misc';
}

/** Believable packed dimensions (cm, l≥w≥h) for a weight and archetype. */
export function guessDims(g, archetype) {
  const d = ARCH_DEFAULTS[archetype] || ARCH_DEFAULTS.pouch;
  const litres = Math.max(g / d.gpl, 0.02);
  const [a, b, c] = d.shape;
  // l*w*h = litres*1000 cm³ with the archetype's proportions a:b:c
  const k = Math.cbrt((litres * 1000) / (a * b * c));
  return { d: [a * k, b * k, c * k].map((x) => Math.round(x * 10) / 10), l: litres };
}

// ---- resolving an item against the catalogue --------------------------------
/**
 * Everything the app needs to know about one owned item, with the catalogue
 * filling in whatever the owner did not say. The one place this merge happens,
 * so the list, the 3D view, the solver and the totals can never disagree about
 * what an item weighs or how big it is.
 */
export function resolveItem(item, gearIndex) {
  const c = item.ref ? gearIndex?.get(item.ref) : null;
  const name = item.name || c?.name || 'Item';
  const archetype = item.a || c?.archetype || guessArchetype(name);
  const g = Number.isFinite(item.g) ? item.g : c?.weight_g ?? 100;
  let dims = item.d || c?.packed_cm || null;
  let litres = Number.isFinite(item.l) ? item.l : c?.packed_l ?? null;
  if (!dims) {
    const gd = guessDims(g, archetype);
    dims = gd.d;
    litres = litres ?? gd.l;
  }
  if (!Number.isFinite(litres)) litres = (dims[0] * dims[1] * dims[2]) / 1000;
  const compress = Number.isFinite(item.cmp) ? item.cmp
    : Number.isFinite(c?.compress) ? c.compress : ARCH_DEFAULTS[archetype]?.cmp ?? 0.3;
  return {
    uid: item.uid,
    ref: item.ref || null,
    custom: !c,
    name,
    sheetCat: item.cat || null,
    cat: c?.cat || guessCat(item.cat, name, archetype),
    g,
    archetype,
    dims: [...dims].sort((x, y) => y - x),
    litres,
    compress: Math.min(Math.max(compress, 0), 0.9),
    rigid: compress < 0.1,
    fragile: !!c?.fragile || ['phone', 'action_camera'].includes(archetype),
    access: c?.access || 'camp',
    worn: !!c?.worn,
    places: c?.places || [],
    color: item.col || c?.color || null,
    brand: c?.brand || null,
    note: item.note || null,
  };
}

// ---- lockers ------------------------------------------------------------------
let uidCounter = 0;
/** Locker-local id. Short, because it never leaves the locker except in a share. */
export function newUid(taken) {
  for (;;) {
    uidCounter = (uidCounter + 1) % 1e6;
    const u = `i${(Date.now() % 1e7).toString(36)}${uidCounter.toString(36)}`;
    if (!taken || !taken.has(u)) return u;
  }
}

export const emptyLocker = () => ({ v: 1, items: [] });

export function addItem(locker, fields) {
  const taken = new Set(locker.items.map((i) => i.uid));
  const it = { uid: fields.uid && !taken.has(fields.uid) ? fields.uid : newUid(taken), ...fields };
  if (taken.has(fields.uid)) it.uid = newUid(taken);
  locker.items.push(it);
  return it;
}

export function removeItem(locker, uid, loadouts = []) {
  locker.items = locker.items.filter((i) => i.uid !== uid);
  for (const lo of loadouts) if (lo?.place) delete lo.place[uid];
}

// ---- loadouts -----------------------------------------------------------------
export const emptyLoadout = (name = '') => ({ name, place: {} });

export function placeOf(loadout, uid) { return loadout?.place?.[uid] || 'home'; }

/**
 * An explicit 'home' is kept: it means "on this list, staying home", the
 * owner's "not packed", which is different from an item this loadout never
 * mentions. Both leave the item at home; only the first is a row of the tab.
 */
export function setPlace(loadout, uid, code) {
  if (!loadout.place) loadout.place = {};
  loadout.place[uid] = formatPlace(parsePlace(code));
}
export function unsetPlace(loadout, uid) { if (loadout?.place) delete loadout.place[uid]; }
/** The items this loadout lists, in locker order. */
export const listedUids = (loadout, locker) => locker.items.map((i) => i.uid).filter((u) => loadout?.place?.[u] !== undefined);

export function duplicateLoadout(lo, name) {
  // `from` remembers the original, so Compare opens on the pair you'd expect
  return { ...JSON.parse(JSON.stringify(lo)), name: name ?? `${lo.name || 'Loadout'} copy`, from: lo.id };
}

/**
 * What moved between two loadouts of the same locker: for each item whose
 * placement differs, from → to. The compare view is this list plus the two
 * sets of totals; nothing else needs computing.
 */
export function diffLoadouts(a, b, locker) {
  const out = [];
  for (const it of locker.items) {
    const pa = placeOf(a, it.uid), pb = placeOf(b, it.uid);
    if (pa !== pb) out.push({ uid: it.uid, from: pa, to: pb });
  }
  return out;
}

// ---- convenience --------------------------------------------------------------
export const itemFromOz = (name, oz, extra = {}) => ({ name, g: Math.round(ozToG(oz) * 10) / 10, ...extra });
