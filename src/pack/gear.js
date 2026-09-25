/**
 * The gear catalogue: data/gear.json, indexed and searchable.
 *
 * Pure data + string matching — no DOM, no three.js — so the sheet importer
 * can use it in node for the round-trip tests.
 */

const norm = (s) => String(s || '').toLowerCase()
  .replace(/\*\s*\d+/g, ' ')               // "tire removal tool *2"
  .replace(/[’']/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ').trim();
/** "Water Bottle 2" → "water bottle". Tried SECOND: "Go Pro 7" is not a Go Pro 6. */
const stripCount = (n) => n.replace(/\s\d{1,2}$/, '').trim();
const tokens = (s) => new Set(norm(s).split(' ').filter((t) => t.length > 1 && !STOP.has(t)));
const STOP = new Set(['the', 'and', 'of', 'for', 'with', 'my', 'a', 'an', 'x', 'set', 'kit']);

/** Build the lookup structures once per catalogue. */
export function indexGear(items) {
  const byId = new Map(items.map((g) => [g.id, g]));
  const phrases = [];                        // [normalised phrase, item]
  for (const g of items) {
    for (const p of [g.name, g.model, ...(g.aliases || [])]) {
      const n = norm(p);
      if (n.length >= 3) phrases.push([n, g]);
    }
  }
  phrases.sort((a, b) => b[0].length - a[0].length);   // longest phrase wins
  return { items, byId, phrases, get: (id) => byId.get(id) };
}

/**
 * Best catalogue item for a free-text label, or null. Exact phrase first,
 * then the longest catalogue phrase contained in the label as whole words,
 * then token overlap. Conservative on purpose: a wrong match silently gives
 * someone's sleeping bag the size of a stuff sack; no match just makes a
 * custom item that keeps the owner's own weight.
 */
/**
 * The owner's sheet category, as a hint. "Lid" under Kitchen is a pot lid;
 * under Clothing it would be a helmet. A match outside the allowed catalogue
 * categories is refused rather than trusted.
 */
const SHEET_CATS = {
  kitchen: ['kitchen', 'water', 'food', 'repair'],
  camp: ['sleep', 'shelter', 'kitchen', 'misc', 'water', 'hygiene'],
  clothing: ['clothing', 'misc'],
  bathroom: ['hygiene', 'firstaid', 'water'],
  electronics: ['electronics'],
  bike: ['repair', 'misc'],
  food: ['food', 'water'],
};
export function matchGear(index, label, sheetCat = null) {
  if (!index) return null;
  const n = norm(label);
  if (!n) return null;
  const allowed = SHEET_CATS[String(sheetCat || '').toLowerCase().trim()] || null;
  const okCat = (g) => !allowed || allowed.includes(g.cat);
  for (const cand of [n, stripCount(n)]) {
    for (const [p, g] of index.phrases) if (p === cand && okCat(g)) return g;
  }
  for (const cand of [n, stripCount(n)]) {
    const padded = ` ${cand} `;
    for (const [p, g] of index.phrases) if (p.length >= 4 && padded.includes(` ${p} `) && okCat(g)) return g;
  }
  const want = tokens(stripCount(n));
  let best = null, bestScore = 0;
  for (const g of index.items) {
    if (!okCat(g)) continue;
    for (const p of [g.name, ...(g.aliases || [])]) {
      const have = tokens(p);
      if (!have.size) continue;
      let inter = 0;
      for (const t of want) if (have.has(t)) inter++;
      const score = inter / (want.size + have.size - inter);
      if (score > bestScore) { bestScore = score; best = g; }
    }
  }
  return bestScore >= 0.5 ? best : null;
}

/** Search for the locker's add box: name, brand, aliases, category. */
export function searchGear(index, q, { cat = null, limit = 40 } = {}) {
  const want = norm(q);
  const out = [];
  for (const g of index.items) {
    if (cat && g.cat !== cat) continue;
    if (!want) { out.push([0, g]); continue; }
    const hay = norm([g.name, g.brand, g.model, g.sub, ...(g.aliases || [])].join(' '));
    const i = hay.indexOf(want);
    if (i >= 0) out.push([i === 0 ? 0 : 1 + (g.generic ? 0 : 1), g]);
    else {
      const ts = want.split(' ');
      if (ts.every((t) => hay.includes(t))) out.push([3, g]);
    }
  }
  out.sort((a, b) => a[0] - b[0] || (b[1].generic - a[1].generic) || a[1].name.localeCompare(b[1].name));
  return out.slice(0, limit).map(([, g]) => g);
}

let loading = null;
/** Browser: fetch once, cache. */
export function loadGear(url = './data/gear.json') {
  if (!loading) {
    loading = fetch(url).then((r) => (r.ok ? r.json() : [])).catch(() => [])
      .then((items) => indexGear(Array.isArray(items) ? items : items.items || []));
  }
  return loading;
}
