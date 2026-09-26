/**
 * Text contrast over every environment, measured from pixels.
 *
 *   node tools/contrast.mjs [--envs desert,forest,night] [--device phone]
 *
 * For each environment, device and scene: shoot the page, then shoot it
 * again with every glyph made transparent (backgrounds, glass and the scene
 * untouched). For each visible text element, the background is the 90th
 * percentile luminance of the text-free shot inside the element's box (the
 * light end, so a bright patch behind a word counts), the text colour is its
 * computed colour composited over that, and the ratio is WCAG's. Anything
 * under 4.5:1 is listed. Output: shots/contrast/report.json.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { CHROME } from './lib/chrome.mjs';
import { takeRenderLock } from './lib/renderlock.mjs';

const argv = process.argv.slice(2);
const ENVS = argv.includes('--envs') ? argv[argv.indexOf('--envs') + 1].split(',') : ['desert', 'forest', 'night', 'mountain', 'lake'];
const onlyDevice = argv.includes('--device') ? argv[argv.indexOf('--device') + 1] : null;
const root = new URL('../', import.meta.url).pathname;
const OUT = root + 'shots/contrast/';
mkdirSync(OUT, { recursive: true });
const HELPERS = readFileSync(root + 'tools/lib/screen-helpers.js', 'utf8');
const SHEET = readFileSync(root + 'data/seed/megafuck.tsv', 'utf8');
const DEVICES = {
  phone: { width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
};
const SCENES = {
  start: 'await __w(800);',
  rig: 'await __mine(); await __w(2500);',
  bag: "await __mine(); await __w(800); await __product('seatpack'); await __w(2500);",
  empty: 'await __builder(); await __w(1200);',
};

function png(buf) {
  let o = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; }
    if (type === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat)), out = new Uint8Array(w * h * 3);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const pr = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1
        : (() => { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; })();
      cur[i] = (line[i] + pr) & 255;
    }
    for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) out[(y * w + x) * 3 + k] = cur[x * bpp + k];
    prev = cur;
  }
  return { w, h, px: out };
}
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

await takeRenderLock('contrast');
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
const report = [];
for (const env of ENVS) {
  for (const [device, vp] of Object.entries(DEVICES)) {
    if (onlyDevice && device !== onlyDevice) continue;
    for (const [scene, setup] of Object.entries(SCENES)) {
      const ctx = await b.createBrowserContext();
      const p = await ctx.newPage();
      await p.setViewport(vp);
      await p.goto(`http://localhost:8735/?still&env=${env}`, { waitUntil: 'load', timeout: 120000 });
      await p.waitForFunction('window.__READY_DONE', { timeout: 120000 });
      await p.evaluate(`window.__SHEET = ${JSON.stringify(SHEET)};` + HELPERS);
      await p.evaluate(`(async () => { ${setup} })()`).catch((e) => console.log('setup', e.message));
      await p.evaluate(async () => { for (let i = 0; i < 60; i++) { if (!app.framing?.animating) break; await new Promise((r) => setTimeout(r, 150)); } await new Promise((r) => setTimeout(r, 600)); });
      const texts = await p.evaluate(() => {
        const out = [];
        const walk = document.createTreeWalker(document.getElementById('ui-root'), NodeFilter.SHOW_TEXT);
        const seen = new Set();
        for (let t; (t = walk.nextNode());) {
          if (!t.textContent.trim()) continue;
          const e = t.parentElement;
          if (!e || seen.has(e)) continue;
          seen.add(e);
          const cs = getComputedStyle(e);
          if (cs.visibility === 'hidden' || +cs.opacity === 0 || e.closest('[inert],[hidden]')) continue;
          const range = document.createRange(); range.selectNodeContents(t);
          const r = range.getBoundingClientRect();
          if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
          // clipped by a scroller or covered by something: not visible, not measured
          const top = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)));
          if (!top || !(top === e || e.contains(top) || top.contains(e))) continue;
          // effective opacity up the tree
          let op = 1; for (let q = e; q && q !== document.body; q = q.parentElement) op *= +getComputedStyle(q).opacity;
          const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(cs.color);
          out.push({ text: t.textContent.trim().slice(0, 40), cls: e.className?.baseVal ?? e.className, size: parseFloat(cs.fontSize), weight: +cs.fontWeight,
            rgb: m ? [+m[1], +m[2], +m[3]] : [255, 255, 255], a: (m && m[4] != null ? +m[4] : 1) * op,
            r: [r.left, r.top, r.width, r.height] });
        }
        return out;
      });
      const A = await p.screenshot();
      await p.addStyleTag({ content: '#ui-root *, #ui-root *::placeholder { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }' });
      await new Promise((r) => setTimeout(r, 200));
      const B = png(await p.screenshot());
      writeFileSync(`${OUT}${env}-${device}-${scene}.png`, A);
      const dpr = vp.deviceScaleFactor;
      let worst = null, fails = [];
      for (const t of texts) {
        const [x, y, w, h] = t.r.map((v) => Math.round(v * dpr));
        const ls = [];
        for (let yy = Math.max(0, y); yy < Math.min(B.h, y + h); yy += 2) {
          for (let xx = Math.max(0, x); xx < Math.min(B.w, x + w); xx += 2) {
            const i = (yy * B.w + xx) * 3;
            ls.push([lum(B.px[i], B.px[i + 1], B.px[i + 2]), B.px[i], B.px[i + 1], B.px[i + 2]]);
          }
        }
        if (!ls.length) continue;
        ls.sort((a, c) => a[0] - c[0]);
        const bg = ls[Math.min(ls.length - 1, Math.floor(ls.length * 0.9))];
        const mix = t.rgb.map((c, k) => c * t.a + bg[k + 1] * (1 - t.a));
        const lt = lum(...mix), lb = bg[0];
        const ratio = (Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05);
        const need = (t.size >= 24 || (t.size >= 18.5 && t.weight >= 700)) ? 3 : 4.5;
        const row = { text: t.text, cls: String(t.cls).slice(0, 40), size: t.size, ratio: +ratio.toFixed(2), need };
        if (!worst || ratio < worst.ratio) worst = row;
        if (ratio < need) fails.push(row);
      }
      report.push({ env, device, scene, n: texts.length, worst, fails });
      console.log(`${fails.length ? '✗' : '✓'} ${env.padEnd(8)} ${device.padEnd(7)} ${scene.padEnd(6)} ${texts.length} texts, worst ${worst?.ratio}:1 "${worst?.text}"${fails.length ? `, ${fails.length} under` : ''}`);
      for (const f of fails.slice(0, 5)) console.log(`      ${f.ratio}:1 (needs ${f.need}) ${f.size}px "${f.text}" .${f.cls}`);
      await ctx.close();
    }
  }
}
await b.close();
writeFileSync(OUT + 'report.json', JSON.stringify(report, null, 1));
const bad = report.reduce((n, r) => n + r.fails.length, 0);
console.log(bad ? `\n${bad} text elements under their contrast floor` : '\nall text passes');
process.exit(bad ? 1 : 0);
