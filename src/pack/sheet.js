/**
 * The owner's spreadsheet, in and out.
 *
 * What Google Sheets puts on the clipboard is tab-separated rows. The owner's
 * tabs are a MATRIX: item | category | oz | one column per bag, with an X where
 * the item goes and the X carrying detail, "X (on top)", "X (dangle)",
 * "X (Left)". Some people keep the flat form instead, item | category | oz |
 * where, so both are read. Totals rows ("Gear", "Bike", "Bags", "All up") can
 * sit anywhere; the bike and bags figures are the only place those weights
 * exist, so they are kept.
 *
 * Export writes the matrix back in the owner's own column names and spellings,
 * with the totals rows computed the way his SUM computes them, so a sheet that
 * goes out and comes back in is identical.
 */

import { gToOz, ozToG, r1, r2 } from './units.js';
import { addItem, emptyLocker, emptyLoadout, formatPlace, parsePlace, setPlace } from './model.js';
import { matchGear } from './gear.js';

// ---- column names ↔ placements ---------------------------------------------
// Keys are compared after lowercasing and stripping everything but letters, so
// "Seat post bag", "Seatpost Bag" and "seat-post bag" are one column.
const key = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

/** Sheet column → base placement. See DECISIONS.md §5.1 for the why of each. */
const COLUMN_PLACE = {
  seatpostbag: 'seatpack', seatpack: 'seatpack', seatbag: 'seatpack', saddlepack: 'seatpack',
  saddlebag: 'saddlebag',
  handlebarpack: 'barroll', handlebarbag: 'barroll', handlebarroll: 'barroll', barroll: 'barroll',
  barbag: 'barbag',
  frontpocket: 'barpocket', accessorypocket: 'barpocket', barpocket: 'barpocket',
  halfframebag: 'framebag_half', halfframe: 'framebag_half',
  framebag: 'framebag_full', fullframebag: 'framebag_full', framepack: 'framebag_full',
  toptubebag: 'toptube', toptube: 'toptube', ttbag: 'toptube', gastank: 'toptube',
  ttsack: 'toptube_rear', rearttsack: 'toptube_rear', jerrycan: 'toptube_rear', jerrycanbag: 'toptube_rear', reartoptube: 'toptube_rear',
  forkright: 'forkR', rightfork: 'forkR', forkr: 'forkR',
  forkleft: 'forkL', leftfork: 'forkL', forkl: 'forkL',
  stembag: 'stemR', stembagright: 'stemR', stemright: 'stemR', stembagleft: 'stemL', stemleft: 'stemL',
  downtube: 'downtube', downtubebag: 'downtube',
  pannierleft: 'pannierL', leftpannier: 'pannierL', pannierright: 'pannierR', rightpannier: 'pannierR', panniers: 'pannierR', pannier: 'pannierR',
  trunkbag: 'trunk', rackbag: 'trunk', rack: 'trunk',
  onframe: 'frame', frame: 'frame', onbike: 'frame',
  onme: 'body', worn: 'body', wearing: 'body', onbody: 'body',
  hipsack: 'body:hip', hippack: 'body:hip', bumbag: 'body:hip', fannypack: 'body:hip',
  jerseypocket: 'body:pocket', pocket: 'body:pocket', backpack: 'body:pack',
  notpacked: 'home', home: 'home', notbringing: 'home', leftathome: 'home',
};

/** The owner's own column headings, used on export and in his order. */
export const OWNER_COLUMNS = [
  ['Seat post bag', 'seatpack'],
  ['Fork right', 'forkR'],
  ['Fork left', 'forkL'],
  ['Handle bar pack', 'barroll'],
  ['Front Pocket', 'barpocket'],
  ['Half Frame bag', 'framebag_half'],
  ['Top Tube Bag', 'toptube'],
  ['TT sack', 'toptube_rear'],
  ['On frame', 'frame'],
  ['On me', 'body'],
  ['Hip sack', 'body:hip'],
  ['not packed', 'home'],
];
// Columns the owner's main tab does not have, named the way the rest of his
// headings are, for loadouts that use those bags.
const EXTRA_COLUMNS = {
  saddlebag: 'Saddle bag', barbag: 'Handle bar bag', randobag: 'Rando bag',
  framebag_full: 'Frame bag', stemL: 'Stem bag left', stemR: 'Stem bag right',
  downtube: 'Down tube bag', pannierL: 'Pannier left', pannierR: 'Pannier right',
  trunk: 'Trunk bag', 'body:pocket': 'Jersey pocket', 'body:pack': 'Backpack',
};

export function columnToPlace(heading) {
  const k = key(heading);
  if (COLUMN_PLACE[k]) return COLUMN_PLACE[k];
  // looser: "Seat post bag (Apidura 14L)" → starts with a known key
  for (const [ck, v] of Object.entries(COLUMN_PLACE)) if (ck.length > 4 && k.startsWith(ck)) return v;
  return null;
}

/**
 * One cell's detail on top of its column. "X" → the column itself.
 * "X (on top)" → lashed, "X (dangle)" → dangle, "X (Left)" / "(right)" → side.
 */
function applyDetail(base, detail) {
  const d = String(detail || '').toLowerCase();
  const p = parsePlace(base);
  if (p.loc === 'bag') {
    if (/on top|outside|lash|strap/.test(d)) return formatPlace({ loc: 'lashed', slot: p.slot });
    if (/dangl|hang|clip/.test(d)) return formatPlace({ loc: 'dangle', slot: p.slot });
    if (/\bleft\b|\(l\)/.test(d)) return formatPlace({ ...p, side: 'L' });
    if (/\bright\b|\(r\)/.test(d)) return formatPlace({ ...p, side: 'R' });
  }
  return base;
}

// ---- parsing ------------------------------------------------------------------
/** Tab first (what Sheets copies), then comma with quotes, then pipes. */
export function splitRows(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const sep = lines.some((l) => l.includes('\t')) ? '\t' : lines.some((l) => l.includes('|')) ? '|' : ',';
  return lines.map((l) => (sep === ',' ? csvSplit(l) : l.split(sep)).map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ''));
}
function csvSplit(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

const num = (s) => {
  const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
};

/** A totals row: first cell names a total and there is no placement on it. */
const TOTAL_KINDS = [
  [/^(total\s*)?gear(\s*total)?$|^gear weight$|^total$|^kit$/i, 'gear'],
  [/^(total\s*)?bike(\s*weight)?$|^bike weight$/i, 'bike'],
  [/^(total\s*)?bags?(\s*weight)?$|^luggage$/i, 'bags'],
  [/^all[\s-]*up|^grand total|^total weight|^system weight|^everything$/i, 'allup'],
  [/^worn/i, 'worn'],
];
const totalKind = (s) => {
  const t = String(s || '').trim();
  for (const [re, k] of TOTAL_KINDS) if (re.test(t)) return k;
  return null;
};

/**
 * Read a pasted sheet.
 * @returns {{ locker, loadout, totals, report }}
 *   `totals` is what the SHEET says (oz), for reconciliation.
 *   `report` lists what was matched, what became custom, and anything skipped.
 */
export function importSheet(text, { gear = null, name = '' } = {}) {
  const rows = splitRows(text);
  const locker = emptyLocker();
  const loadout = emptyLoadout(name);
  const totals = {};
  const report = { rows: 0, matched: [], custom: [], skipped: [], notes: [] };

  // Header detection: the first row whose cells name at least two placements
  // (matrix), or that names item/weight/where (flat).
  let header = null, hi = -1;
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const places = rows[i].filter((c) => columnToPlace(c)).length;
    const named = rows[i].some((c) => /^(item|gear|name|thing)s?$/i.test(c));
    if (places >= 2 || named) { header = rows[i]; hi = i; break; }
  }

  // Which column holds what. Without a header, assume the owner's flat order:
  // item, category, oz, where.
  let cItem = 0, cCat = 1, cWt = 2, cWhere = 3, unit = 'oz';
  const placeCols = [];                  // [colIndex, basePlacement, heading]
  if (header) {
    cWhere = -1;
    header.forEach((h, i) => {
      const k = key(h);
      if (/^(item|gear|name|thing)s?$/.test(k)) cItem = i;
      else if (/^(category|cat|type|group)$/.test(k)) cCat = i;
      else if (/^(oz|ounces?|weightoz|wt|weight)$/.test(k) || /\boz\b|ounce/i.test(h)) { cWt = i; unit = 'oz'; }
      else if (/^(g|grams?|weightg)$/.test(k) || /\(g\)|grams/i.test(h)) { cWt = i; unit = 'g'; }
      else if (/^(where|location|bag|packedin|goesin|place)$/.test(k)) cWhere = i;
      else {
        const p = columnToPlace(h);
        if (p) placeCols.push([i, p, h]);
      }
    });
  }
  const body = header ? rows.slice(hi + 1) : rows;

  const seenSlots = {};
  for (const r of body) {
    const label = r[cItem];
    if (!label) continue;
    const tk = totalKind(label);
    const hasX = placeCols.some(([i]) => /^x/i.test(r[i] || ''));
    const wt = num(r[cWt]);
    if (tk && !hasX) {
      // "Bike | | 398 | 24.9 lb", the first number after the label is the total
      const n = Number.isFinite(wt) ? wt : num(r.slice(1).find((c) => Number.isFinite(num(c))));
      if (Number.isFinite(n)) totals[tk] = unit === 'g' ? r2(gToOz(n)) : n;
      continue;
    }
    if (!Number.isFinite(wt)) {
      // a section heading or a blank-weight row
      if (r.length > 1) report.skipped.push({ row: r.join(' | '), why: 'no weight' });
      continue;
    }
    report.rows++;
    const g = unit === 'g' ? wt : Math.round(ozToG(wt) * 10) / 10;

    // placement
    let code = 'home';
    if (cWhere >= 0 && r[cWhere]) {
      const where = r[cWhere];
      const m = where.match(/^([^(]+?)\s*(\(.*\))?\s*$/);
      const base = columnToPlace(m ? m[1] : where);
      if (base) code = applyDetail(base, m?.[2]);
      else report.notes.push(`"${label}": did not recognise "${where}", left at home`);
    } else {
      const hits = placeCols.filter(([i]) => /^x/i.test(r[i] || ''));
      if (hits.length) {
        const [i, base] = hits[0];
        code = applyDetail(base, r[i].replace(/^x\s*/i, ''));
        if (hits.length > 1) report.notes.push(`"${label}" is marked in ${hits.length} columns; used "${hits[0][2]}"`);
      }
    }
    const pp = parsePlace(code);
    if (pp.slot) {
      // Two columns that land on one slot (TT sack + Jerry Can) share the bag.
      const col = cWhere >= 0 ? key(r[cWhere]).replace(/\(.*$/, '') : key(placeCols.find(([i]) => /^x/i.test(r[i] || ''))?.[2]);
      seenSlots[pp.slot] = seenSlots[pp.slot] || new Set();
      seenSlots[pp.slot].add(col.replace(/(left|right|ontop|dangle)$/, ''));
    }

    // catalogue match
    const hit = gear ? matchGear(gear, label, r[cCat]) : null;
    const item = addItem(locker, hit
      ? { ref: hit.id, name: label, g, cat: r[cCat] || undefined }
      : { name: label, g, cat: r[cCat] || undefined });
    (hit ? report.matched : report.custom).push({ name: label, ref: hit?.id || null, g });
    setPlace(loadout, item.uid, code);
  }
  for (const [slot, cols] of Object.entries(seenSlots)) {
    if (cols.size > 1) report.notes.push(`${[...cols].join(' and ')} both map to ${slot}; they share that bag`);
  }
  if (Number.isFinite(totals.bike)) loadout.bike_g = Math.round(ozToG(totals.bike) * 10) / 10;
  if (Number.isFinite(totals.bags)) loadout.bags_g = Math.round(ozToG(totals.bags) * 10) / 10;
  return { locker, loadout, totals, report };
}

// ---- totals the way the sheet computes them --------------------------------
/**
 * The owner's sheet sums EVERY gear row, including the one marked "not
 * packed" (302.1 oz includes the 2.0 oz water filter; 302.1 + 398 + 304 is his
 * 1004). This reproduces that arithmetic for the export and the reconciliation
 * line, and nothing else. The app's own all-up leaves home items at home.
 */
export function sheetTotals(locker, loadout, weightOf) {
  let gear = 0;
  for (const it of locker.items) if (loadout.place?.[it.uid] !== undefined) gear += r1(gToOz(weightOf(it)));
  const bike = loadout.bike_g ? r1(gToOz(loadout.bike_g)) : 0;
  const bags = loadout.bags_g ? r1(gToOz(loadout.bags_g)) : 0;
  return { gear: r1(gear), bike, bags, allup: r1(gear + bike + bags) };
}

// ---- export -------------------------------------------------------------------
/**
 * The loadout as the owner's matrix, tab-separated, ready to paste into a
 * sheet. `rows` is the list of locker items that belong on this tab, for an
 * imported tab, every row it had (home items included, as "not packed").
 */
export function exportSheet({ locker, loadout, resolve, rows = null, bagsG = null }) {
  const listed = locker.items.filter((i) => loadout.place?.[i.uid] !== undefined);
  const items = rows ? rows.map((uid) => locker.items.find((i) => i.uid === uid)).filter(Boolean) : listed;
  // columns: the owner's, then any extra slot this loadout actually uses
  const used = new Set(items.map((it) => {
    const p = parsePlace(loadout.place?.[it.uid] || 'home');
    if (p.loc === 'frame') return 'frame';
    if (p.loc === 'body') return p.in ? `body:${p.in}` : 'body';
    if (p.loc === 'home') return 'home';
    return p.slot;
  }));
  const cols = OWNER_COLUMNS.slice();
  for (const [code, head] of Object.entries(EXTRA_COLUMNS)) if (used.has(code)) cols.splice(cols.length - 3, 0, [head, code]);

  const lines = [['Item', 'Category', 'oz', ...cols.map(([h]) => h)].join('\t')];
  let gearOz = 0;
  for (const it of items) {
    const r = resolve(it);
    const oz = r1(gToOz(r.g));
    gearOz += oz;
    const p = parsePlace(loadout.place?.[it.uid] || 'home');
    const colCode = p.loc === 'frame' ? 'frame' : p.loc === 'body' ? (p.in ? `body:${p.in}` : 'body')
      : p.loc === 'home' ? 'home' : p.slot;
    const cell = p.loc === 'lashed' ? 'X (on top)' : p.loc === 'dangle' ? 'X (dangle)'
      : p.side === 'L' ? 'X (Left)' : p.side === 'R' ? 'X (Right)' : 'X';
    const cells = cols.map(([, code]) => (code === colCode ? cell : ''));
    lines.push([it.name || r.name, it.cat || r.sheetCat || catLabel(r.cat), fmtOz(oz), ...cells].join('\t'));
  }
  const bike = loadout.bike_g ? r1(gToOz(loadout.bike_g)) : 0;
  const bags = r1(gToOz(bagsG ?? loadout.bags_g ?? 0));
  const gear = r1(gearOz);
  const all = r1(gear + bike + bags);
  const lb = (oz) => `${r2(oz / 16)} lb`;
  lines.push('');
  lines.push(['Gear', '', fmtOz(gear), lb(gear)].join('\t'));
  lines.push(['Bike', '', fmtOz(bike), lb(bike)].join('\t'));
  lines.push(['Bags', '', fmtOz(bags), lb(bags)].join('\t'));
  lines.push(['All up', '', fmtOz(all), lb(all)].join('\t'));
  return lines.join('\n');
}

const fmtOz = (oz) => (Number.isInteger(oz) ? `${oz}` : oz.toFixed(1));
const CAT_SHEET = { sleep: 'Camp', shelter: 'Camp', kitchen: 'Kitchen', water: 'Kitchen', food: 'Food', clothing: 'Clothing', repair: 'Bike', electronics: 'Electronics', hygiene: 'Bathroom', firstaid: 'Bathroom', misc: 'Camp' };
const catLabel = (c) => CAT_SHEET[c] || 'Camp';
