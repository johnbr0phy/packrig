/**
 * Pull everything a maker publishes about each product page, for ANY brand.
 *
 *   node tools/harvest-brand.mjs --brand Tailfin [--dry] [--limit N]
 *
 * `harvest-apidura.mjs` does this for one brand by matching media FILENAMES
 * against the product slug. That works on Apidura because Apidura names its
 * media after the product. It does not generalise: Tailfin's half frame bag
 * page calls its files `HFP-FEATURED-IMAGE.jpg`, `SIZES-HFP.jpg`,
 * `hfp-Explore-Hero-Retina-copy.jpg` — a slug matcher keeps none of them.
 *
 * So this one scopes by CROSS-PAGE FREQUENCY instead of by name. Site
 * furniture (mega-menu tiles, warranty badges, the related-products rail) is
 * exactly the media that appears on many product pages; a photograph of one
 * product appears on one or two. That rule needs no per-brand knowledge and
 * it is the thing that makes this reusable across the remaining 49 brands.
 *
 * Writes:
 *   assets/products/<brand-slug>/full/<page-slug>/<kind>-<n>.<ext>
 *   assets/products/<brand-slug>/full/<page-slug>/page.txt
 *   data/media/<brand-slug>.json                          the manifest
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const DRY = argv.includes('--dry');
const LIMIT = parseInt(arg('limit', '0'), 10) || Infinity;
const BRAND = arg('brand');
if (!BRAND) { console.error('need --brand'); process.exit(2); }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const brands = JSON.parse(readFileSync(join(root, 'data/brands.json')));
const brand = brands.find((b) => norm(b.name) === norm(BRAND)) || brands.find((b) => new RegExp(BRAND, 'i').test(b.name));
if (!brand) { console.error(`no such brand: ${BRAND}`); process.exit(2); }
const bslug = norm(brand.name);
const OUT = join(root, `assets/products/${bslug}/full`);
const MANIFEST = join(root, `data/media/${bslug}.json`);

/** page url -> the SKUs that live on it */
const pages = new Map();
for (const p of brand.products) {
  if (!p.src || !/^https?:/.test(p.src)) continue;
  if (!pages.has(p.src)) pages.set(p.src, []);
  pages.get(p.src).push({ line: p.line, name: p.name, size: p.size, slot: p.slot, liters: p.liters });
}
const pageList = [...pages.keys()].slice(0, LIMIT);
if (!pageList.length) { console.error(`${brand.name} has no product page urls`); process.exit(2); }

// Which hosts serve this brand's media. Inferred from the catalogue's own
// image urls plus the page host, so no per-brand table is needed.
const hosts = new Set();
for (const p of brand.products) for (const u of (p.images || [])) {
  try { hosts.add(new URL(u).host); } catch {}
}
for (const u of pageList) { try { hosts.add(new URL(u).host); } catch {} }
console.log(`${brand.name}: ${pageList.length} pages, ${brand.products.length} SKUs, media hosts: ${[...hosts].join(', ')}`);

// WordPress and Shopify both serve a size ladder off one original.
const original = (u) =>
  u.replace(/-(\d{2,4})x(\d{2,4})(?=\.[a-z0-9]+(\?|$))/i, '')   // wordpress
   .replace(/_(\d{2,4})x(\d{2,4})?(@\dx)?(?=\.[a-z0-9]+(\?|$))/i, '') // shopify
   .replace(/\?.*$/, '');

const EXT = /\.(jpe?g|png|webp|svg|pdf)$/i;
// Site chrome that names itself. The frequency rule catches most of it; these
// are the ones that appear on only one or two pages and would survive.
const CHROME = /(mega-?menu|menus-|logo|favicon|icon|sprite|placeholder|warranty|payment|klarna|paypal|visa|trustpilot|star|avatar|flag|swatch|-mb\.|mobile-banner|banner-mobile|newsletter|instagram|social)/i;

const KINDS = [
  [/(sizing|size[-_]?guide|spec|dimension|template|poster|measure|geometry|technical|drawing|\.pdf$)/i, 'dimensions'],
  [/(clearance|fit-?guide|compat)/i, 'clearance'],
  [/(on-?bike|bike-?fit|fitted|mounted|-bike-)/i, 'on-bike'],
  [/(feature|detail|close-?up|zip|strap|buckle|clip|pocket|hardware|valve|hydration|port|magnet)/i, 'feature'],
  [/(hero|lifestyle|banner|explore|adventure|ride|rider|gravel|action)/i, 'lifestyle'],
  [/.*/, 'studio'],
];
const kindOf = (base) => KINDS.find(([re]) => re.test(base))[1];

const text = (html) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ')
      .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

async function get(url, asText = false) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: asText ? 'text/html,*/*' : 'image/*,*/*' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return asText ? res.text() : Buffer.from(await res.arrayBuffer());
}

// ---- pass 1: fetch every page, collect candidate media --------------------
const hostRe = new RegExp(`https?://(?:${[...hosts].map((h) => h.replace(/\./g, '\\.')).join('|')})/[^"'\\s)\\\\<>]+`, 'g');
const perPage = new Map();      // pageSlug -> Set(url)
const pageText = new Map();
const seenOn = new Map();       // url -> Set(pageSlug)

for (const url of pageList) {
  const pageSlug = norm(url.replace(/^https?:\/\/[^/]+\/(product|products|shop|collections)\//, '').replace(/\/+$/, ''));
  let html;
  try { html = await get(url, true); }
  catch (e) { console.log(`  ✗ ${pageSlug}: ${e.message}`); continue; }
  pageText.set(pageSlug, text(html));
  const urls = new Set();
  for (const m of html.matchAll(hostRe)) {
    const o = original(m[0].replace(/\\\//g, '/'));
    if (!EXT.test(o)) continue;
    urls.add(o);
  }
  perPage.set(pageSlug, urls);
  for (const u of urls) {
    if (!seenOn.has(u)) seenOn.set(u, new Set());
    seenOn.get(u).add(pageSlug);
  }
  console.log(`  ${pageSlug}: ${urls.size} media urls`);
}

// ---- pass 2: frequency filter ---------------------------------------------
// Anything on more than a third of the pages is furniture, whatever it is
// called. On a 16-page brand that is 6+ pages; a real product photo is on 1-2.
const N = perPage.size;
const FREQ_MAX = Math.max(2, Math.ceil(N / 3));
const manifest = { brand: brand.name, slug: bslug, harvested_at: new Date().toISOString(), pages: {} };
let dl = 0, skipped = 0, failed = 0, bytes = 0, dropped = 0;

for (const [pageSlug, urls] of perPage) {
  const items = [];
  const byKind = {};
  for (const u of [...urls].sort()) {
    const base = u.split('/').pop();
    if (seenOn.get(u).size > FREQ_MAX) { dropped++; continue; }
    if (CHROME.test(base)) { dropped++; continue; }
    const kind = kindOf(base);
    byKind[kind] = (byKind[kind] || 0) + 1;
    const ext = (base.match(/\.[a-z0-9]+$/i) || ['.jpg'])[0].toLowerCase();
    items.push({ url: u, base, kind, local: `assets/products/${bslug}/full/${pageSlug}/${kind}-${byKind[kind]}${ext}` });
  }
  const counts = {};
  for (const it of items) counts[it.kind] = (counts[it.kind] || 0) + 1;
  console.log(`  ${pageSlug}: keep ${items.length}  ${JSON.stringify(counts)}`);

  if (!DRY) {
    mkdirSync(join(OUT, pageSlug), { recursive: true });
    writeFileSync(join(OUT, pageSlug, 'page.txt'), pageText.get(pageSlug) || '');
    for (const it of items) {
      const abs = join(root, it.local);
      if (existsSync(abs) && statSync(abs).size > 512) { skipped++; bytes += statSync(abs).size; continue; }
      try {
        const buf = await get(it.url);
        if (buf.length < 512) throw new Error(`too small (${buf.length}B)`);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, buf);
        dl++; bytes += buf.length;
      } catch (e) { console.log(`    ✗ ${it.base}: ${e.message}`); failed++; }
    }
  }
  manifest.pages[pageSlug] = { url: pageList.find((u) => norm(u.replace(/^https?:\/\/[^/]+\/(product|products|shop|collections)\//, '').replace(/\/+$/, '')) === pageSlug), skus: pages.get(pageList.find((u) => norm(u.replace(/^https?:\/\/[^/]+\/(product|products|shop|collections)\//, '').replace(/\/+$/, '')) === pageSlug)) || [], items };
}

if (!DRY) { mkdirSync(dirname(MANIFEST), { recursive: true }); writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1)); }
const total = Object.values(manifest.pages).reduce((a, p) => a + p.items.length, 0);
const kinds = {};
for (const p of Object.values(manifest.pages)) for (const it of p.items) kinds[it.kind] = (kinds[it.kind] || 0) + 1;
console.log(`\n${total} media kept across ${N} pages  ${JSON.stringify(kinds)}`);
console.log(`downloaded ${dl}, already had ${skipped}, failed ${failed}, dropped as furniture ${dropped}, ${(bytes / 1e6).toFixed(1)} MB`);

// ---- pass 3: top up thin pages from the WordPress media library ------------
// The frequency filter can only keep what the HTML contains, and a WooCommerce
// variable product loads its gallery from JS. Tailfin's Bar Bag System page —
// the one the owner singled out as looking least like the real product — came
// back with 8 photographs against a median of 35, and every one of them was of
// the accessory mount rather than the bag.
//
// `/wp-json/wp/v2/media?search=` is the library itself, with human-written
// titles, and it is the same endpoint on every WordPress site. A page under the
// threshold asks it for the page's own words and keeps what matches.
const THIN = 15;
const thin = [...perPage.entries()].filter(([slug]) => (manifest.pages[slug]?.items.length || 0) < THIN);
if (thin.length && !DRY) {
  const origin = new URL(pageList[0]).origin;
  console.log(`\n${thin.length} thin page(s) — topping up from ${origin}/wp-json`);
  for (const [pageSlug] of thin) {
    const words = pageSlug.split('-').filter((w) => w.length > 2 && !/^(the|and|for|systems?|bags?)$/.test(w));
    const q = encodeURIComponent(words.slice(-3).join(' '));
    let list = [];
    try {
      const res = await fetch(`${origin}/wp-json/wp/v2/media?search=${q}&per_page=100&media_type=image&_fields=source_url,title`, { headers: { 'user-agent': UA } });
      if (res.ok) list = await res.json();
    } catch (e) { console.log(`  ✗ ${pageSlug}: wp-json ${e.message}`); }
    const page = manifest.pages[pageSlug];
    const have = new Set(page.items.map((i) => i.url));
    const byKind = {};
    for (const it of page.items) byKind[it.kind] = (byKind[it.kind] || 0) + 1;
    let added = 0;
    for (const m of Array.isArray(list) ? list : []) {
      const u = original(String(m.source_url || ''));
      if (!u || have.has(u) || !EXT.test(u)) continue;
      const base = u.split('/').pop();
      if (CHROME.test(base)) continue;
      // The title is a sentence a human wrote about the photograph, so classify
      // on title AND filename — "Front View of Tailfin Handlebar Bag on Gravel
      // Bike" is an on-bike shot whose filename says only `front-view`.
      const title = String((m.title && m.title.rendered) || '').replace(/&#\d+;/g, '-');
      const kind = kindOf(`${base} ${title}`);
      byKind[kind] = (byKind[kind] || 0) + 1;
      const ext = (base.match(/\.[a-z0-9]+$/i) || ['.jpg'])[0].toLowerCase();
      const local = `assets/products/${bslug}/full/${pageSlug}/${kind}-${byKind[kind]}${ext}`;
      const abs = join(root, local);
      try {
        const buf = await get(u);
        if (buf.length < 512) continue;
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, buf);
        page.items.push({ url: u, base, kind, local, title, via: 'wp-json' });
        added++; dl++; bytes += buf.length;
      } catch {}
    }
    console.log(`  ${pageSlug}: +${added} (now ${page.items.length})`);
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
}
