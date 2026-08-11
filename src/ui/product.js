/**
 * How a catalogue product is described to a person.
 *
 * Lifted out of `ui.js` whole when the bag sheet arrived (REDESIGN.md phase 2)
 * and needed the same names, sizes and links the rig panel was already
 * rendering. Two things drawing the same product from the same data should not
 * disagree about what it is called.
 *
 * Everything here is pure: product and brand records in, strings or a detached
 * element out. No app, no DOM queries, no state.
 */

const elt = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

const WORD = /[\p{L}\p{N}]+/gu;

/** Words that identify the brand, from both its full and short name. */
export function brandWords(brand) {
  const set = new Set();
  for (const s of [brand?.name, brand?.short]) {
    if (!s) continue;
    for (const m of String(s).matchAll(WORD)) set.add(m[0].toLowerCase());
  }
  return set;
}

/** "Rapha Explore Seat Pack 10L" under brand RAPHA → "Explore Seat Pack 10L". */
export function modelName(product, brand) {
  const full = String(product?.name || '');
  const words = brandWords(brand);
  if (!words.size) return full;
  let cut = 0;
  for (const m of full.matchAll(WORD)) {
    if (!words.has(m[0].toLowerCase())) { cut = m.index; break; }
    cut = m.index + m[0].length;
  }
  const rest = full.slice(cut).replace(/^[\s\-–—·/,:.]+/, '').trim();
  return rest || full;
}

/** Capacity to one decimal at most: 10 → "10 L", 3.75 → "3.8 L". */
export function litersOf(p) {
  const l = Number(p?.liters);
  // A harness carries drybags sold separately, so it has NO capacity rather
  // than zero litres — "0 L" reads as a product that holds nothing.
  if (l === 0) return '—';
  return Number.isFinite(l) ? `${Math.round(l * 10) / 10} L` : '—';
}

/** Model name with the trailing capacity dropped — it gets its own column. */
export function displayName(product, brand) {
  const name = modelName(product, brand);
  if (product?.liters == null) return name;
  const tail = new RegExp(`[\\s·\\-–—]*${String(product.liters).replace('.', '\\.')}\\s*L$`, 'i');
  return name.replace(tail, '').trim() || name;
}

/** Product family ("Expedition"). Older catalog entries have no line. */
export const lineOf = (p) => String(p?.line || '').trim();

/** "14L" / "Large" — falls back to the volume when the catalog has no size. */
export function sizeOf(product) {
  const s = String(product?.size ?? '').trim();
  const base = s || (Number.isFinite(Number(product?.liters))
    ? `${Math.round(Number(product.liters) * 10) / 10}L` : '');
  // Some listings ship two bags. The maker's own "scope of delivery" tells us
  // which; a bare "20L" on a paired listing reads as one bag and misleads.
  const per = Number(product?.features?.bagsPerListing);
  if (per === 2 && !/pair/i.test(base)) return `${base} · pair`;
  return base;
}

/**
 * True when the size adds nothing the NAME has already said. "Standard SnakPak
 * 9.5\"" followed by "· Standard (9.5 inch)" is the same words twice, which is
 * how a bag row ends up on three lines saying one thing.
 */
export function sizeEchoesName(product, brand) {
  const size = sizeOf(product);
  if (!size) return true;
  const words = (t) => (String(t).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length >= 3);
  const said = new Set(words(modelTitle(product, brand)));
  const own = words(size);
  return own.length > 0 && own.every((w) => said.has(w));
}

/** True when the size says nothing the volume column isn't already saying. */
export function sizeIsVolume(product) {
  const l = Number(product?.liters);
  if (!Number.isFinite(l)) return false;
  return sizeOf(product).replace(/\s+/g, '').toLowerCase() === `${Math.round(l * 10) / 10}l`;
}

/** Drop a leading line name so cards under "EXPEDITION" don't repeat it. */
export function stripLine(name, line) {
  if (!line || !name.toLowerCase().startsWith(line.toLowerCase())) return name;
  const rest = name.slice(line.length).replace(/^[\s\-–—·]+/, '').trim();
  return rest || name;
}

/** Full model name including its line: "Expedition Handlebar Pack". */
export function modelTitle(product, brand) {
  const line = lineOf(product);
  const base = stripLine(displayName(product, brand), line);
  if (!line) return base;
  if (base.toLowerCase() === line.toLowerCase()) return base;
  /*
   * The line and the name overlap in more ways than a shared prefix. Makers
   * repeat their own line inside the product name — sensible on their site,
   * nonsense once the two are concatenated:
   *
   *   "52Hz Gravel" + "52Hz Waterproof Framebag"  -> said it twice
   *   "Loader"      + "BackLoader"                -> said it twice
   *   "Bar System"  + "Bar Bag System - MTB Flat" -> said it twice
   *
   * The rule that handles all of them: if the name already carries a
   * significant word of the line — as a whole word or inside one — the name is
   * doing the work on its own, so use it alone. The line only survives when it
   * adds something the name does not say.
   */
  const words = (t) => (String(t).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length >= 3);
  const nameWords = words(base);
  const echoed = words(line).some((lw) => nameWords.some((nw) => nw === lw || nw.includes(lw) || lw.includes(nw)));
  return echoed ? base : `${line} ${base}`;
}

/** Official product page — only http(s), since the href comes from data. */
export function srcOf(product) {
  const raw = String(product?.src || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

/** Link out to the maker's product page; null when the catalog has no URL. */
export function buyLink(product, brand, label, cls) {
  const href = srcOf(product);
  if (!href) return null;
  const a = elt('a', cls, label);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.title = `Buy at ${brand?.short || brand?.name || 'the maker'}`;
  a.onclick = (e) => e.stopPropagation(); // buying is not equipping
  return a;
}

export function swatchStyle(product, brand) {
  const cols = (product?.colors?.length ? product.colors : brand?.palette) || [];
  if (cols.length > 1) return `linear-gradient(135deg, ${cols[0]} 0 50%, ${cols[1]} 50% 100%)`;
  return cols[0] || '#5b6068';
}
