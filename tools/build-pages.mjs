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
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
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
execFileSync('npx', ['--no-install', 'esbuild', 'src/main.js',
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

copyFileSync(join(root, 'src/ui.css'), join(docs, 'ui.css'));

writeFileSync(join(docs, 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Packrig — Bikepacking Bag Configurator</title>
<meta name="description" content="Build a bikepacking rig in 3D from a catalogue of 700+ real bags across 50 makers." />
<link rel="stylesheet" href="ui.css" />
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
