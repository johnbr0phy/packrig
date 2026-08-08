/**
 * Bundles Packrig into ONE self-contained HTML file for publishing as an
 * Artifact (strict CSP: no external hosts, 16MB ceiling).
 *
 * Three things have to be solved:
 *   1. ES modules + node_modules importmap  -> esbuild bundles it flat.
 *   2. data/brands.json is fetched at runtime -> embedded, served by a fetch shim.
 *   3. 31MB of 2k HDRIs                      -> decoded, box-downsampled to
 *      256x128, re-encoded as RLE RGBE, embedded. They are only ever used to
 *      light the bike (studio mode draws a flat tint as the backdrop), so the
 *      resolution loss is invisible.
 *
 * Nothing in src/ is modified. The shim intercepts the same URLs the app asks
 * for, so the bundled app and the served app run identical code.
 *
 *   node tools/build-artifact.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decodeHDR, downsample, encodeHDR } from './hdr-codec.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_W = 256, OUT_H = 128;

// ------------------------------------------------------------------- build

const HDRS = [
  'kiara_1_dawn_2k.hdr', 'lakeside_2k.hdr', 'forest_slope_2k.hdr',
  'syferfontein_1d_clear_2k.hdr', 'dikhololo_night_2k.hdr',
];

console.log('· HDRIs');
const hdrPayload = {};
for (const name of HDRS) {
  const src = decodeHDR(readFileSync(join(root, 'assets/hdri', name)));
  const small = encodeHDR(downsample(src, OUT_W, OUT_H));
  hdrPayload[name] = small.toString('base64');
  console.log(`   ${name}: ${src.w}x${src.h} -> ${OUT_W}x${OUT_H}, ${(small.length / 1024).toFixed(0)}KB`);
}

console.log('· bundling with esbuild');
mkdirSync(join(root, 'build'), { recursive: true });
const bundlePath = join(root, 'build/packrig.bundle.js');
execFileSync('npx', ['--no-install', 'esbuild', 'src/main.js',
  '--bundle', '--format=esm', '--minify', '--target=es2022',
  '--outfile=' + bundlePath], { cwd: root, stdio: 'inherit' });
const bundle = readFileSync(bundlePath, 'utf8');
console.log(`   bundle: ${(bundle.length / 1024 / 1024).toFixed(2)}MB`);

console.log('· catalogue');
const brands = JSON.parse(readFileSync(join(root, 'data/brands.json'), 'utf8'));
// Product photos are hot-linked from maker CDNs. A published Artifact runs under
// a CSP that blocks every external host, so those requests can only ever fail.
// Either embed a thumbnail from our local copy, or drop the field so the UI
// shows its no-photo state instead of firing 500 doomed requests on open.
const WITH_THUMBS = !process.argv.includes('--no-thumbs');
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
let embedded = 0, dropped = 0;
for (const b of brands) {
  const dir = join(root, 'assets/products', slug(b.name));
  for (const p of b.products) {
    delete p.images;
    if (!WITH_THUMBS) { dropped++; continue; }
    // same stem rule as tools/fetch-images.mjs
    const stem = slug([p.line, p.name, p.size].filter(Boolean).join('-'));
    let src = null;
    for (const ext of ['.jpg', '.jpeg', '.png']) {      // sips cannot read .webp
      const f = join(dir, `${stem}-1${ext}`);
      if (existsSync(f)) { src = f; break; }
    }
    if (!src) { dropped++; continue; }
    const tmp = join(root, 'build/_thumb.jpg');
    try {
      execFileSync('sips', ['-Z', '200', '-s', 'format', 'jpeg', '-s', 'formatOptions', '62',
        src, '--out', tmp], { stdio: 'ignore' });
      p.images = ['data:image/jpeg;base64,' + readFileSync(tmp).toString('base64')];
      embedded++;
    } catch { dropped++; }
  }
}
console.log(`   ${brands.length} brands · ${embedded} thumbnails embedded · ${dropped} without a photo`);
const catalogJSON = JSON.stringify(brands);

// Both stylesheets: the wind tunnel's HUD styles live in src/aero/aero.css, and
// this build inlines rather than links, so a missing file is silent.
const css = readFileSync(join(root, 'src/ui.css'), 'utf8')
  + '\n' + readFileSync(join(root, 'src/aero/aero.css'), 'utf8');

const shim = `
// Serve the two things the app fetches from memory. Same URLs, same shapes, so
// src/ runs unmodified.
(() => {
  const B64 = ${JSON.stringify(hdrPayload)};
  const bytes = (b64) => { const s = atob(b64); const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  const CATALOG = ${catalogJSON};
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = String(input && input.url ? input.url : input);
    if (url.includes('brands.json')) return Promise.resolve(new Response(JSON.stringify(CATALOG),
      { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const hit = Object.keys(B64).find((n) => url.includes(n));
    if (hit) return Promise.resolve(new Response(bytes(B64[hit]),
      { status: 200, headers: { 'Content-Type': 'image/vnd.radiance' } }));
    return real(input, init);
  };
})();
`;

const html = `<title>Packrig — Bikepacking Bag Configurator</title>
<style>
html, body { height: 100%; margin: 0; background: #121212; overflow: hidden; }
#app { position: fixed; inset: 0; }
#scene { display: block; width: 100%; height: 100%; }
</style>
<style>
${css}
</style>
<div id="app">
  <canvas id="scene"></canvas>
  <div id="ui-root"></div>
</div>
<script>${shim}</script>
<script type="module">
${bundle}
</script>
`;

const outPath = join(root, 'build/packrig.html');
writeFileSync(outPath, html);
const mb = Buffer.byteLength(html) / 1024 / 1024;
console.log(`\n${outPath}  ${mb.toFixed(2)}MB  ${mb > 16 ? 'OVER THE 16MB LIMIT' : '(under the 16MB limit)'}`);
