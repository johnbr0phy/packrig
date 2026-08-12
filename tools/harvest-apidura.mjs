/**
 * Pull EVERYTHING Apidura publishes about each product, not the first four
 * images that happened to be in the catalogue.
 *
 *   node tools/harvest-apidura.mjs [--dry] [--limit N]
 *
 * Why this exists. `fetch-images.mjs` was capped at 4 images per product and
 * in practice kept 1-3, all of them studio shots on white. A real Apidura
 * product page carries about nine photographs INCLUDING two on-bike shots,
 * plus dimension and clearance diagrams as SVG. Those are the two things the
 * eval has been missing and they are the two that matter most:
 *
 *   - the on-bike shots are the only evidence of ORIENTATION and MOUNTING,
 *     which is what half of findings-01 is arguing about;
 *   - the dimension diagrams are VECTOR line drawings of the bag, i.e. the
 *     true outline as maths rather than pixels we trace and guess at.
 *
 * Writes:
 *   assets/products/apidura/full/<page-slug>/<kind>-<n>.<ext>
 *   assets/products/apidura/full/<page-slug>/page.txt      visible page text
 *   data/apidura-media.json                                the manifest
 *
 * The old flat files under assets/products/apidura/ are left alone; nothing
 * that currently reads them breaks. `apply-apidura-media.mjs` is what wires
 * the manifest into the records.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const li = argv.indexOf('--limit');
const LIMIT = li >= 0 ? parseInt(argv[li + 1], 10) : Infinity;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const OUT = join(root, 'assets/products/apidura/full');
const MANIFEST = join(root, 'data/apidura-media.json');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---- which pages -----------------------------------------------------------
const brands = JSON.parse(readFileSync(join(root, 'data/brands.json')));
const apidura = brands.find((b) => /apidura/i.test(b.name));
if (!apidura) { console.error('no Apidura in data/brands.json'); process.exit(2); }

/** page url -> the SKUs that live on it */
const pages = new Map();
for (const p of apidura.products) {
  const url = p.src;
  if (!url || !/apidura\.com/.test(url)) continue;
  if (!pages.has(url)) pages.set(url, []);
  pages.get(url).push({
    slug: norm([p.line, p.name, p.size].filter(Boolean).join('-')),
    line: p.line, name: p.name, size: p.size, slot: p.slot, liters: p.liters,
  });
}
const pageList = [...pages.keys()].slice(0, LIMIT);
console.log(`${pageList.length} Apidura product pages, ${apidura.products.length} SKUs`);

// ---- url hygiene -----------------------------------------------------------
// WordPress serves a size ladder off one original: foo-225x150.jpg,
// foo-800x533.jpg, foo.jpg. We want the original, once.
const RESIZE = /-(\d{2,4})x(\d{2,4})(?=\.[a-z0-9]+$)/i;
const original = (u) => u.replace(RESIZE, '');

// Everything on the page that is NOT this product: nav thumbnails, the blog
// rail, feature icons, related products. Matching on the page slug is blunt
// and it is right — Apidura names its media after the product.
//
// Careful with "feature": `-feature-image-` is a blog thumbnail, while
// `-feature-strap-attachment-` is a close-up of the hardware, which is one of
// the most useful frames on the page. Only the former is chrome.
const looksLikeChrome = (base) =>
  /(icon|main-menu|feature-image|logo|placeholder|co2e|chart|swatch)/i.test(base);

const KINDS = [
  [/clearance-diagram/i, 'clearance'],
  [/dimension-diagram/i, 'dimensions'],
  // Every SVG on this site is a technical drawing — there is no such thing as
  // a lifestyle vector. The front rack pack names its diagrams
  // `...-20l-cm.svg`, with no `dimension-diagram` in the name at all, and was
  // being filed as a studio photo.
  [/\.svg$/i, 'dimensions'],
  [/on-bike/i, 'on-bike'],
  [/-feature-|pull-tab|padding|attachment/i, 'feature'],
  [/lifestyle|banner/i, 'lifestyle'],
  [/detail/i, 'detail'],
  [/.*/, 'studio'],
];
const kindOf = (base) => KINDS.find(([re]) => re.test(base))[1];

/**
 * Does this media file belong to the product this page is about?
 *
 * Apidura names media after the product, but not identically to the page URL,
 * and the two ways it differs each silently cost us a whole page on an earlier
 * run:
 *
 *   separators   page `expedition-ebike-charger-pack`
 *                media `...expedition-e-bike-charger-pack...`   (and 4.3l/4-3l)
 *   word order   page `apidura-x-canyon-saddle-pack`
 *                media `apidura-canyon-saddle-pack-5l-1`        (no `x`)
 *
 * So: try the whole slug with separators removed, then fall back to requiring
 * every MEANINGFUL token to appear. `apidura`, `x` and `v2` are dropped
 * because they are page-URL furniture, and the fallback demands ALL remaining
 * tokens — which is what keeps the Racing saddle pack's clearance diagram, sat
 * on the Canyon page as a related product, from being hoovered up: it has
 * `saddle` and `pack` but not `canyon`.
 */
const compact = (s) => s.replace(/[^a-z0-9]/g, '');
const FURNITURE = new Set(['apidura', 'x', 'v2', 'shop', 'the']);

// Words shared by half the catalogue. Present in a filename they prove
// nothing; a match made only of these is a match with another product.
const GENERIC = new Set([
  'pack', 'bag', 'saddle', 'handlebar', 'frame', 'top', 'tube', 'bolt', 'on',
  'front', 'rear', 'long', 'mini', 'half', 'full', 'module', 'system', 'bar',
  'cage', 'cargo', 'tool', 'food', 'pouch', 'downtube', 'stem', 'accessory',
  'charger', 'rack',
]);

function belongsToPage(stem, pageSlug, isSvg = false) {
  if (compact(stem).includes(compact(pageSlug))) return true;
  const tokens = pageSlug.split('-').filter((t) => t && !FURNITURE.has(t));
  if (tokens.length < 2) return false;
  const hay = compact(stem);
  const hit = (t) => hay.includes(compact(t));
  if (tokens.every(hit)) return true;

  // Diagrams get a second chance, because they are the most valuable file on
  // the page and the most inconsistently named: the Expedition handlebar
  // pack's are filed under `expedition2-handlebar-SYSTEM`, and the bolt-on top
  // tube pack's simply omit the `-1l`. Requiring every token loses both.
  //
  // The relaxation is: most tokens, AND at least one token that actually
  // identifies the product. Without that second clause the Racing saddle
  // pack's clearance diagram — which sits on the Canyon page as a related
  // product and shares `saddle` and `pack` — would come along too.
  if (!isSvg) return false;
  const distinctive = tokens.filter((t) => !GENERIC.has(t));
  if (!distinctive.length || !distinctive.some(hit)) return false;
  return tokens.filter(hit).length / tokens.length >= 0.6;
}

// `4.3l` in a filename vs `4-3l` in our slug; `9L` vs `9l`.
const sizeOf = (base) => {
  const m = base.match(/[-_](\d+(?:[.-]\d+)?)\s*l(?=[-_.]|$)/i);
  return m ? m[1].replace('.', '-') + 'l' : null;
};

const text = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n')
    .trim();

// ---- run -------------------------------------------------------------------
const manifest = { brand: 'Apidura', harvested_at: new Date().toISOString(), pages: {} };
let dl = 0, skipped = 0, failed = 0, bytes = 0, orphaned = 0;

async function get(url, asText = false) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: asText ? 'text/html,*/*' : 'image/*,*/*' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return asText ? res.text() : Buffer.from(await res.arrayBuffer());
}

for (const url of pageList) {
  const pageSlug = norm(url.replace(/^https?:\/\/[^/]+\/shop\//, '').replace(/\/+$/, ''));
  const skus = pages.get(url);
  let html;
  try {
    html = await get(url, true);
  } catch (e) {
    console.log(`  ✗ ${pageSlug}: page ${e.message}`);
    failed++;
    continue;
  }

  const found = [...new Set([...html.matchAll(/https:\/\/medias\.apidura\.com\/[^"'\s)\\]+/g)].map((m) => m[0]))];
  const keep = new Map();               // original url -> meta
  for (const u of found) {
    const o = original(u);
    const base = o.split('/').pop();
    const stem = norm(base.replace(/\.[a-z0-9]+$/i, ''));
    // Must be named after THIS product, and must not be site furniture.
    if (!belongsToPage(stem, pageSlug, /\.svg$/i.test(o))) continue;
    if (looksLikeChrome(base)) continue;
    if (!/\.(jpe?g|png|webp|svg)$/i.test(o)) continue;
    if (keep.has(o)) continue;
    keep.set(o, { url: o, base, kind: kindOf(base), size: sizeOf(stem) });
  }

  // inches duplicates of every diagram add nothing — keep the cm ones
  const items = [...keep.values()].filter((i) => !/diagram-in\./i.test(i.base));

  const dir = join(OUT, pageSlug);
  const byKind = {};
  const records = [];
  for (const it of items) {
    byKind[it.kind] = (byKind[it.kind] || 0) + 1;
    const ext = (it.base.match(/\.[a-z0-9]+$/i) || ['.jpg'])[0].toLowerCase();
    const local = `assets/products/apidura/full/${pageSlug}/${it.kind}-${byKind[it.kind]}${ext}`;
    records.push({ ...it, local });
    if (DRY) continue;
    const abs = join(root, local);
    if (existsSync(abs) && statSync(abs).size > 512) { skipped++; bytes += statSync(abs).size; continue; }
    try {
      const buf = await get(it.url);
      if (buf.length < 512) throw new Error(`too small (${buf.length}B)`);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, buf);
      dl++; bytes += buf.length;
    } catch (e) {
      console.log(`    ✗ ${it.base}: ${e.message}`);
      failed++;
    }
  }

  if (!DRY) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'page.txt'), text(html));
    // Filenames encode the CLASSIFICATION (`feature-3.jpg`), so re-running
    // after a classifier change renames things and the old names survive as
    // orphans that no manifest points at. A critic handed a stale duplicate is
    // grading a file we do not think exists. Sweep them.
    const want = new Set(records.map((r) => r.local.split('/').pop()));
    for (const f of readdirSync(dir)) {
      if (f === 'page.txt' || want.has(f)) continue;
      unlinkSync(join(dir, f));
      orphaned++;
    }
  }

  manifest.pages[pageSlug] = { url, skus, images: records, counts: byKind };
  const summary = Object.entries(byKind).map(([k, n]) => `${n} ${k}`).join(', ');
  console.log(`  ${pageSlug.padEnd(42)} ${String(items.length).padStart(3)} imgs  (${summary})`);
}

if (!DRY) {
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
}

const total = Object.values(manifest.pages).reduce((n, p) => n + p.images.length, 0);
const kinds = {};
for (const p of Object.values(manifest.pages)) for (const [k, n] of Object.entries(p.counts)) kinds[k] = (kinds[k] || 0) + n;
console.log(`\n${total} images across ${Object.keys(manifest.pages).length} pages`);
console.log(Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `  ${k}: ${n}`).join('\n'));
console.log(`downloaded ${dl}, already had ${skipped}, failed ${failed}, removed ${orphaned} stale, ${(bytes / 1e6).toFixed(1)} MB`);
if (!DRY) console.log(`manifest → data/apidura-media.json`);
