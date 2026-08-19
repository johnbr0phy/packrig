/**
 * Builds the GitHub Pages deploy into docs/ (Pages source = main branch, /docs).
 *
 * Differences from tools/build-artifact.mjs, which targets a strict-CSP Artifact:
 *   - Pages has no CSP, so product photos stay HOT-LINKED to the makers' own
 *     CDNs. Where an earlier fetch-images pass rewrote product.images to a local
 *     assets/products/ path, we restore the URL it stashed in images_remote, so
 *     no maker photo is copied into the repo (assets/products is gitignored, and
 *     src/ui.js says as much).
 *   - Files stay separate and cacheable rather than inlined into one HTML blob.
 *   - HDRIs ship at 512x256 rather than 256x128; still only ever PMREM'd into
 *     scene.environment, never drawn, so this is well past enough.
 *
 * src/ is not modified: the bundle fetches the same relative URLs it always has.
 *
 *   node tools/build-pages.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync, cpSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decodeHDR, downsample, encodeHDR } from './hdr-codec.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');
const OUT_W = 512, OUT_H = 256;

const HDRS = [
  'kiara_1_dawn_2k.hdr', 'lakeside_2k.hdr', 'forest_slope_2k.hdr',
  'syferfontein_1d_clear_2k.hdr', 'dikhololo_night_2k.hdr',
];

rmSync(docs, { recursive: true, force: true });
mkdirSync(join(docs, 'assets/hdri'), { recursive: true });
mkdirSync(join(docs, 'data'), { recursive: true });

console.log('· HDRIs');
let hdrTotal = 0;
for (const name of HDRS) {
  const src = decodeHDR(readFileSync(join(root, 'assets/hdri', name)));
  const small = encodeHDR(downsample(src, OUT_W, OUT_H));
  writeFileSync(join(docs, 'assets/hdri', name), small);
  hdrTotal += small.length;
  console.log(`   ${name}: ${src.w}x${src.h} -> ${OUT_W}x${OUT_H}, ${(small.length / 1024).toFixed(0)}KB`);
}

console.log('· bundling with esbuild');
execFileSync('npx', ['--yes', 'esbuild', 'src/main.js',
  '--bundle', '--format=esm', '--minify', '--target=es2022',
  '--outfile=' + join(docs, 'packrig.js')], { cwd: root, stdio: 'inherit' });

console.log('· catalogue');
const brands = JSON.parse(readFileSync(join(root, 'data/brands.json'), 'utf8'));
let restored = 0, hotlinked = 0, noPhoto = 0;
for (const b of brands) {
  for (const p of b.products) {
    if (p.images?.length && !p.images[0].startsWith('http')) {
      // a local assets/products/ path that this deploy does not ship
      if (p.images_remote?.length) { p.images = p.images_remote; restored++; }
      else { delete p.images; }
    }
    delete p.images_remote;                       // provenance lives in the repo, not the deploy
    if (p.images?.length) hotlinked++; else noPhoto++;
  }
}
console.log(`   ${hotlinked} products hot-link a photo (${restored} URLs restored from images_remote) · ${noPhoto} without`);
writeFileSync(join(docs, 'data/brands.json'), JSON.stringify(brands));

// The measured silhouettes. src/catalog.js fetches BOTH of these and falls back
// to the builders' parametric curves when a fetch 404s — silently, because a
// missing profile is a legitimate state for the 201 products that have none.
// So shipping without them does not break the build or log anything: it just
// quietly serves the old guessed shapes, and every bag that was fixed by
// measuring the maker's engineering drawing reverts on the live site only.
// `diagram-profiles.json` is the one that matters most — it is what took the
// seat packs from back-to-front to correct.
// `loadouts.json` is not optional in the same way the profile files are: the
// Loadouts level of the menu is a whole section of the app, and without this
// file it renders its empty state on the live site while working perfectly in
// the dev build. Build it from source rather than copying, so a catalogue
// change that breaks a curated rig fails HERE rather than shipping a loadout
// that quietly mounts six bags instead of ten.
console.log('· loadouts');
execFileSync('node', ['tools/build-loadouts.mjs'], { cwd: root, stdio: 'inherit' });
copyFileSync(join(root, 'data/loadouts.json'), join(docs, 'data/loadouts.json'));

for (const f of ['profiles.json', 'diagram-profiles.json', 'portraits.json']) {
  const src = join(root, 'data', f);
  if (!existsSync(src)) { console.log(`   (no data/${f} — skipping)`); continue; }
  writeFileSync(join(docs, 'data', f), JSON.stringify(JSON.parse(readFileSync(src, 'utf8'))));
  console.log(`   data/${f}: ${(readFileSync(join(docs, 'data', f)).length / 1024).toFixed(0)}KB`);
}

// DESIGN-SYSTEM.md §12 step 1. tokens.css sits at src/ui/tokens.css in the
// repo and at docs/tokens.css in the deploy, so its @font-face URL — which is
// resolved relative to the STYLESHEET, not the page — has to be rewritten for
// the shallower path. Getting this wrong fails silently: the page renders in
// the system fallback and looks nearly right.
// The rendered portraits for the 201 products that ship no photograph. Without
// them the deployed catalogue falls back to coloured plates while the dev build
// shows pictures, which is the sort of difference nobody notices until a
// screenshot of the live site turns up looking worse than the local one.
{
  const src = join(root, 'assets/portraits');
  if (existsSync(src)) {
    cpSync(src, join(docs, 'assets/portraits'), { recursive: true });
    const n = readdirSync(join(docs, 'assets/portraits')).length;
    const kb = readdirSync(join(docs, 'assets/portraits'))
      .reduce((t, f) => t + statSync(join(docs, 'assets/portraits', f)).size, 0) / 1024;
    console.log(`   portraits: ${n} files, ${kb.toFixed(0)}KB`);
  } else {
    console.log('   (no assets/portraits — run tools/bag-portraits.mjs)');
  }
}

mkdirSync(join(docs, 'assets/fonts'), { recursive: true });
copyFileSync(join(root, 'assets/fonts/InterVariable.woff2'), join(docs, 'assets/fonts/InterVariable.woff2'));
copyFileSync(join(root, 'assets/fonts/Inter-LICENSE.txt'), join(docs, 'assets/fonts/Inter-LICENSE.txt'));
{
  const tokens = readFileSync(join(root, 'src/ui/tokens.css'), 'utf8');
  const rewritten = tokens.replace('../../assets/fonts/', './assets/fonts/');
  if (rewritten === tokens) throw new Error('tokens.css: expected @font-face url ../../assets/fonts/ to rewrite');
  writeFileSync(join(docs, 'tokens.css'), rewritten);
}
copyFileSync(join(root, 'src/ui/sheet.css'), join(docs, 'sheet.css'));

copyFileSync(join(root, 'src/ui.css'), join(docs, 'ui.css'));
// `src/rigs.css` is gone with rigsui.js — the account is a dialogue in
// ui/v2/builder.css and saved rigs are a menu view.
// The wind tunnel's HUD styles live in their own file. index.html below must
// link BOTH — the panel renders unstyled if this is copied and not linked, or
// missing entirely if neither, and nothing in the bundle would complain.
copyFileSync(join(root, 'src/aero/aero.css'), join(docs, 'aero.css'));
// Last in the cascade, so it re-skins everything the others set.
copyFileSync(join(root, 'src/ui/theme.css'), join(docs, 'theme.css'));
// ...and after even that, the v2 menu layer, which is a self-contained dark
// surface and has to win over the light re-skin for everything under `.pr`.
copyFileSync(join(root, 'src/ui/v2/menu.css'), join(docs, 'menu.css'));
copyFileSync(join(root, 'src/ui/v2/builder.css'), join(docs, 'builder.css'));

// The link-preview image the meta tags below point at. Built by
// tools/og-card.mjs from a real measured rig — see that file — and copied
// rather than generated here, because making it needs a GPU pass through the
// wind tunnel and this build must stay a pure transform of the tree.
copyFileSync(join(root, 'assets/social/og.png'), join(docs, 'og.png'));

writeFileSync(join(docs, 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAzMiAzMic+PHJlY3Qgd2lkdGg9JzMyJyBoZWlnaHQ9JzMyJyByeD0nNycgZmlsbD0nIzEyMTIxMicvPjxnIHN0cm9rZT0nI0ZGN0E0NScgc3Ryb2tlLXdpZHRoPScyLjYnIHN0cm9rZS1saW5lY2FwPSdyb3VuZCcgZmlsbD0nbm9uZSc+PHBhdGggZD0nTTYgMTJoMTNhMy4yIDMuMiAwIDEgMC0zLjItMy4yJy8+PHBhdGggZD0nTTYgMThoMTZhMy4yIDMuMiAwIDEgMS0zLjIgMy4yJy8+PHBhdGggZD0nTTYgMjRoOScvPjwvZz48L3N2Zz4=" />
<title>Packrig — Bikepacking Bag Configurator</title>
<meta name="description" content="Build a bikepacking rig in 3D from a catalogue of 635 real bags across 50 makers that fit Checkpoint-class S/M/L." />
<!-- The link preview: what X, Slack, iMessage and LinkedIn show when the URL
     is pasted. The image is built by tools/og-card.mjs from a real measured rig
     in the wind tunnel, and og:image MUST stay absolute — crawlers do not
     resolve relative paths. -->
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Packrig" />
<meta property="og:url" content="https://johnbr0phy.github.io/packrig/" />
<meta property="og:title" content="Packrig — 635 real bikepacking bags, one wind tunnel" />
<meta property="og:description" content="Build a bikepacking rig in 3D from bags that actually exist — 635 of them, across 50 makers — then put it in the wind tunnel and find out what they cost you in watts." />
<meta property="og:image" content="https://johnbr0phy.github.io/packrig/og.png" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="A loaded bikepacking bike in Packrig's wind tunnel, airflow streamlining past it, beside its measured numbers: CdA 0.458 m², 180 W to hold 28 km/h, +28 W for the bags." />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Packrig — 635 real bikepacking bags, one wind tunnel" />
<meta name="twitter:description" content="Build a bikepacking rig in 3D from bags that actually exist — 635 of them, across 50 makers — then put it in the wind tunnel and find out what they cost you in watts." />
<meta name="twitter:image" content="https://johnbr0phy.github.io/packrig/og.png" />
<meta name="twitter:image:alt" content="A loaded bikepacking bike in Packrig's wind tunnel, airflow streamlining past it, beside its measured numbers: CdA 0.458 m², 180 W to hold 28 km/h, +28 W for the bags." />
<link rel="preload" href="assets/fonts/InterVariable.woff2" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="tokens.css" />
<link rel="stylesheet" href="ui.css" />
<link rel="stylesheet" href="sheet.css" />
<link rel="stylesheet" href="aero.css" />
<link rel="stylesheet" href="theme.css" />
<link rel="stylesheet" href="menu.css" />
<link rel="stylesheet" href="builder.css" />
<style>html,body{height:100%;margin:0;background:#121212;overflow:hidden}#app{position:fixed;inset:0}#scene{display:block;width:100%;height:100%}</style>
</head>
<body>
<div id="app">
  <canvas id="scene"></canvas>
  <div id="ui-root"></div>
</div>
<script type="module" src="packrig.js"></script>
</body>
</html>
`);

writeFileSync(join(docs, '.nojekyll'), '');       // serve paths starting with _ verbatim

const bundleKB = readFileSync(join(docs, 'packrig.js')).length / 1024;
const dataKB = readFileSync(join(docs, 'data/brands.json')).length / 1024;
console.log(`\ndocs/  bundle ${bundleKB.toFixed(0)}KB · catalogue ${dataKB.toFixed(0)}KB · hdri ${(hdrTotal / 1024).toFixed(0)}KB`);
console.log(`total ${((bundleKB + dataKB + hdrTotal / 1024) / 1024).toFixed(2)}MB`);
