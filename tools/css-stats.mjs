/**
 * The stylesheet numbers UX-WRITEUP reports: files, lines, distinct hex
 * colours, distinct font sizes (and half-pixel ones), all over the CSS the
 * app actually loads (index.html's <link rel=stylesheet>).
 *
 *   node tools/css-stats.mjs [--json]
 */
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url).pathname;
const html = readFileSync(root + 'index.html', 'utf8');
const files = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
let lines = 0;
const hex = new Set(), sizes = new Set();
const per = [];
for (const f of files) {
  const t = readFileSync(root + f, 'utf8');
  const n = t.split('\n').length;
  lines += n;
  per.push([f, n]);
  const css = t.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    let h = m[0].toLowerCase();
    if (h.length === 4) h = '#' + [...h.slice(1)].map((c) => c + c).join('');
    hex.add(h);
  }
  for (const m of css.matchAll(/font-size\s*:\s*([^;}]+)/g)) sizes.add(m[1].trim());
  for (const m of css.matchAll(/--(?:fs|t)-[\w-]+\s*:\s*([\d.]+px)/g)) sizes.add(m[1]);
}
const px = [...sizes].filter((s) => /^[\d.]+px$/.test(s));
const half = px.filter((s) => !Number.isInteger(parseFloat(s)));
const out = { files: files.length, lines, hex: hex.size, fontSizes: sizes.size, pxSizes: px.length, halfPx: half, per, hexList: [...hex].sort(), sizeList: [...sizes].sort() };
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else {
  for (const [f, n] of per) console.log(String(n).padStart(6), f);
  console.log(`${files.length} files, ${lines} lines, ${hex.size} distinct hex, ${sizes.size} distinct font-size values (${px.length} px, half-pixel: ${half.join(' ') || 'none'})`);
}
