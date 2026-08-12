/**
 * Measure a bag's shape from its product photograph.
 *
 * The builders were being tuned by hand — write a taper constant, render, look,
 * adjust — which is a loop with a person in the middle of every iteration and
 * does not converge. This replaces the guessing with a measurement: segment the
 * maker's photo, find the bag's own long axis, and read its half-depth at 40
 * stations along it. The result is a normalised profile the builder sweeps
 * directly, so the silhouette comes from the product rather than from me.
 *
 *   node tools/silhouette.mjs --brand Apidura --slot seatpack
 *   node tools/silhouette.mjs --set apidura-v1 --write
 *
 * Writes data/profiles.json, keyed by product slug:
 *   { profile: [40 half-depths, peak-normalised], aspect, source, score }
 *
 * Why in a browser: decoding JPEG in Node needs a dependency this repo does not
 * have, and puppeteer is already here. All the pixel work happens on a canvas.
 *
 * What it does NOT do yet: width (a top-down view), and telling nose from tail.
 * Orientation is resolved by the rule the owner gave — the narrow end is the
 * end that attaches — not by anything in the image.
 */
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const has = (k) => argv.includes(`--${k}`);

const STATIONS = 40;

/**
 * Runs inside the page. Returns a measured profile, or a reason it refused.
 *
 * Refusing matters as much as measuring. A photo of the bag mounted on a bike,
 * or a lifestyle shot, produces a confident and completely wrong outline, and a
 * wrong profile is worse than no profile because the builder will sweep it.
 */
function measureInPage(src, STATIONS) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => resolve({ ok: false, why: 'decode failed' });
    img.onload = () => {
      // Work at a fixed height: the profile is shape-only, and a 3000px studio
      // shot costs 30x the pixels for no extra fidelity in 40 stations.
      const H = 420;
      const W = Math.max(8, Math.round((img.width / img.height) * H));
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, W, H);
      const d = ctx.getImageData(0, 0, W, H).data;
      const at = (x, y) => (y * W + x) * 4;

      // Background from the border ring. Product shots are on white or a light
      // sweep; anything else and we bail rather than guess.
      let br = 0, bg = 0, bb = 0, n = 0;
      const edge = (x, y) => { const i = at(x, y); br += d[i]; bg += d[i + 1]; bb += d[i + 2]; n++; };
      for (let x = 0; x < W; x++) { edge(x, 0); edge(x, H - 1); }
      for (let y = 0; y < H; y++) { edge(0, y); edge(W - 1, y); }
      br /= n; bg /= n; bb /= n;

      // How uniform is that border? A cluttered or outdoor background varies a
      // lot and cannot be thresholded.
      let varSum = 0;
      const dev = (x, y) => {
        const i = at(x, y);
        varSum += Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb);
      };
      for (let x = 0; x < W; x++) { dev(x, 0); dev(x, H - 1); }
      for (let y = 0; y < H; y++) { dev(0, y); dev(W - 1, y); }
      const borderDev = varSum / n;
      if (borderDev > 26) { resolve({ ok: false, why: 'background not uniform (' + borderDev.toFixed(0) + ')' }); return; }

      // Foreground mask.
      const TH = 34;
      const fg = new Uint8Array(W * H);
      let count = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = at(x, y);
          const diff = Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb);
          if (diff > TH) { fg[y * W + x] = 1; count++; }
        }
      }
      const cover = count / (W * H);
      if (cover < 0.03) { resolve({ ok: false, why: 'nothing found' }); return; }
      if (cover > 0.75) { resolve({ ok: false, why: 'background is not background' }); return; }

      // Largest connected component: kills the drop shadow, the size chart, the
      // watermark and the second product in a lifestyle shot.
      const lab = new Int32Array(W * H).fill(-1);
      const stack = new Int32Array(W * H);
      let best = -1, bestN = 0, next = 0;
      for (let p = 0; p < W * H; p++) {
        if (!fg[p] || lab[p] >= 0) continue;
        const id = next++;
        let sp = 0, size = 0;
        stack[sp++] = p; lab[p] = id;
        while (sp) {
          const q = stack[--sp]; size++;
          const qx = q % W, qy = (q / W) | 0;
          for (let k = 0; k < 4; k++) {
            const nx = qx + [1, -1, 0, 0][k], ny = qy + [0, 0, 1, -1][k];
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const r = ny * W + nx;
            if (fg[r] && lab[r] < 0) { lab[r] = id; stack[sp++] = r; }
          }
        }
        if (size > bestN) { bestN = size; best = id; }
      }
      if (bestN < 400) { resolve({ ok: false, why: 'component too small' }); return; }

      // Principal axis by image moments — product shots are rarely level, and a
      // bag photographed nose-down measures as a wedge if you sample columns.
      let sx = 0, sy = 0, m = 0;
      for (let p = 0; p < W * H; p++) if (lab[p] === best) { sx += p % W; sy += (p / W) | 0; m++; }
      const cx = sx / m, cy = sy / m;
      let xx = 0, yy = 0, xy = 0;
      for (let p = 0; p < W * H; p++) {
        if (lab[p] !== best) continue;
        const dx = (p % W) - cx, dy = ((p / W) | 0) - cy;
        xx += dx * dx; yy += dy * dy; xy += dx * dy;
      }
      xx /= m; yy /= m; xy /= m;
      const theta = 0.5 * Math.atan2(2 * xy, xx - yy);
      const ux = Math.cos(theta), uy = Math.sin(theta);      // long axis
      const vx = -uy, vy = ux;                               // across it

      // Project every foreground pixel onto that frame, then take the extent
      // across the axis at each station.
      let uMin = Infinity, uMax = -Infinity;
      for (let p = 0; p < W * H; p++) {
        if (lab[p] !== best) continue;
        const u = ((p % W) - cx) * ux + (((p / W) | 0) - cy) * uy;
        if (u < uMin) uMin = u;
        if (u > uMax) uMax = u;
      }
      const L = uMax - uMin;
      if (L < 20) { resolve({ ok: false, why: 'degenerate' }); return; }

      const lo = new Float64Array(STATIONS).fill(Infinity);
      const hi = new Float64Array(STATIONS).fill(-Infinity);
      const hits = new Int32Array(STATIONS);
      for (let p = 0; p < W * H; p++) {
        if (lab[p] !== best) continue;
        const dx = (p % W) - cx, dy = ((p / W) | 0) - cy;
        const u = dx * ux + dy * uy, v = dx * vx + dy * vy;
        let s = Math.floor(((u - uMin) / L) * STATIONS);
        if (s < 0) s = 0; if (s >= STATIONS) s = STATIONS - 1;
        if (v < lo[s]) lo[s] = v;
        if (v > hi[s]) hi[s] = v;
        hits[s]++;
      }

      const half = new Array(STATIONS);
      for (let s = 0; s < STATIONS; s++) {
        half[s] = hits[s] > 2 ? (hi[s] - lo[s]) / 2 : 0;
      }
      // A dangling strap or a buckle puts a one-station spike in the outline.
      // A 3-wide median keeps the corners and drops the spikes.
      const med = half.map((_, s) => {
        const a = half[Math.max(s - 1, 0)], b = half[s], c2 = half[Math.min(s + 1, STATIONS - 1)];
        return [a, b, c2].sort((p, q) => p - q)[1];
      });
      const peak = Math.max(...med);
      if (!(peak > 0)) { resolve({ ok: false, why: 'empty profile' }); return; }

      resolve({
        ok: true,
        profile: med.map((h) => +(h / peak).toFixed(4)),
        aspect: +(L / (peak * 2)).toFixed(3),      // length ÷ depth, as photographed
        coverage: +cover.toFixed(3),
        borderDev: +borderDev.toFixed(1),
        angle: +((theta * 180) / Math.PI).toFixed(1),
      });
    };
    img.src = src;
  });
}

// ---- drive ---------------------------------------------------------------
const brands = JSON.parse(readFileSync(root + 'data/brands.json'));
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const key = (p) => slugify([p.line, p.name, p.size].filter(Boolean).join(' '));

const wantBrand = arg('brand');
const wantSlot = arg('slot');

const jobs = [];
for (const b of brands) {
  if (wantBrand && b.name.toLowerCase() !== wantBrand.toLowerCase()) continue;
  const mf = join(root, 'data/models', slugify(b.name) + '.json');
  const recs = existsSync(mf)
    ? new Map((JSON.parse(readFileSync(mf)).products || []).map((r) => [key(r), r]))
    : new Map();
  for (const p of b.products) {
    if (wantSlot && p.slot !== wantSlot) continue;
    const rec = recs.get(key(p));
    const photos = (rec?.evidence || []).filter((e) => !String(e).startsWith('http') && existsSync(join(root, e)));
    if (!photos.length) continue;
    jobs.push({
      slug: slugify([b.name, p.line, p.name, p.size].filter(Boolean).join(' ')),
      slot: p.slot, photos,
      // The DRAWN dimensions, not the published ones: a rolltop's published
      // height is its unfurled height and no photograph shows that.
      dims: { len: rec?.render?.len_cm ?? p.dims_cm?.len, wid: rec?.render?.wid_cm ?? p.dims_cm?.wid, hgt: rec?.render?.hgt_cm ?? p.dims_cm?.hgt },
    });
  }
}
if (!jobs.length) { console.error('no products matched'); process.exit(2); }
console.log(`${jobs.length} product(s), ${jobs.reduce((n, j) => n + j.photos.length, 0)} photo(s)\n`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:8735/index.html', { waitUntil: 'domcontentloaded' }).catch(() => {});

const out = existsSync(join(root, 'data/profiles.json'))
  ? JSON.parse(readFileSync(join(root, 'data/profiles.json')))
  : {};
let measured = 0, refused = 0;

for (const j of jobs) {
  const tries = [];
  for (const rel of j.photos) {
    const buf = readFileSync(join(root, rel));
    const ext = rel.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
    // Sniff: several "photos" in this catalogue are SVG diagrams saved as .jpg.
    const headTxt = buf.subarray(0, 200).toString('latin1').trimStart();
    if (headTxt.startsWith('<svg') || headTxt.startsWith('<?xml')) { tries.push({ rel, ok: false, why: 'SVG diagram, not a photo' }); continue; }
    const dataUrl = `data:image/${ext};base64,${buf.toString('base64')}`;
    const r = await page.evaluate(measureInPage, dataUrl, STATIONS);
    tries.push({ rel, ...r });
  }
  const good = tries.filter((t) => t.ok);
  if (!good.length) {
    refused++;
    console.log(`✗ ${j.slug}\n    ${tries.map((t) => `${t.rel.split('/').pop()}: ${t.why}`).join('\n    ')}`);
    continue;
  }

  // Which view is each photo? A studio shot carries no camera data, but the
  // published dimensions do: a side elevation has aspect len/hgt, a front
  // len/wid or wid/hgt, a plan len/wid. Score every photo against every
  // canonical ratio and take the best fit, rejecting anything that matches
  // nothing well — that is a three-quarter view, and measuring a profile off
  // one reports a foreshortened bag as a short one.
  //
  // Two views is the whole game: the SIDE gives half-depth along the length,
  // the PLAN gives half-width along it, and loft.js already sweeps a section
  // built from exactly those two numbers. That is a real reconstruction from
  // photographs, not a curve someone chose.
  const D = j.dims || {};
  const views = {
    side: (D.len || 0) / (D.hgt || 1),      // long axis = length, short = height
    plan: (D.len || 0) / (D.wid || 1),      // long axis = length, short = width
    front: (D.wid || 0) / (D.hgt || 1),     // long axis = width,  short = height
  };
  const TOL = 0.22;                          // within 22% of the expected ratio
  // When a bag's height and width are close, its side elevation and its plan
  // have the SAME aspect ratio and no silhouette can separate them — a seat
  // pack is 42x15x16, so side is 2.63 and plan is 2.80, six percent apart.
  // Guessing there produces a width profile measured off a side view, which is
  // a worse error than having no width profile at all. So: refuse.
  const ambiguous = views.side > 0 && views.plan > 0
    && Math.abs(Math.log(views.side / views.plan)) < 0.15;
  if (ambiguous) delete views.plan;
  for (const t of good) {
    let bestV = null, bestE = Infinity;
    for (const [v, want] of Object.entries(views)) {
      if (!(want > 0)) continue;
      const e = Math.abs(Math.log(t.aspect / want));   // ratio error, symmetric
      if (e < bestE) { bestE = e; bestV = v; }
    }
    t.view = bestE <= TOL ? bestV : null;
    t.viewErr = +bestE.toFixed(3);
  }
  const bySide = good.filter((t) => t.view === 'side').sort((a, b) => a.viewErr - b.viewErr);
  const byPlan = good.filter((t) => t.view === 'plan').sort((a, b) => a.viewErr - b.viewErr);
  // Fall back to the most side-on photo if nothing classified: better a
  // foreshortened elevation than no measurement at all, but say so.
  const pick = bySide[0] || good.slice().sort((a, b) => b.aspect - a.aspect)[0];
  const plan = byPlan[0] || null;
  pick.assumed = !bySide[0];
  // A studio shot faces whichever way the photographer put it, so the raw
  // profile runs in an arbitrary direction. Orient every one the same way using
  // the rule the owner gave for these packs — "the thinner end is the part that
  // attaches to the seat post" — so station 0 is always the mounting end.
  // This is the one thing the image genuinely cannot tell us.
  const n5 = Math.max(2, Math.round(pick.profile.length * 0.15));
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const headEnd = mean(pick.profile.slice(0, n5));
  const tailEnd = mean(pick.profile.slice(-n5));
  const flipped = tailEnd < headEnd;
  if (flipped) pick.profile.reverse();

  // The plan view measures half-WIDTH along the same axis, so it has to be
  // oriented to match the side view or the bag comes out widest where it should
  // be narrowest. Both are mounting-end-first.
  let widthProfile = null;
  if (plan) {
    const w = plan.profile.slice();
    if (mean(w.slice(-n5)) < mean(w.slice(0, n5))) w.reverse();
    widthProfile = w;
  }

  out[j.slug] = {
    profile: pick.profile, aspect: pick.aspect, source: pick.rel, flipped,
    width: widthProfile, widthSource: plan?.rel || null,
    assumedSide: !!pick.assumed, viewAmbiguous: ambiguous,
    ends: [+headEnd.toFixed(3), +tailEnd.toFixed(3)],
    angle: pick.angle, coverage: pick.coverage, stations: STATIONS,
    measured_at: new Date().toISOString(),
  };
  measured++;
  const wspark = widthProfile ? '  w ' + widthProfile.filter((_, i) => i % 5 === 0).map((v) => '▁▂▃▄▅▆▇█'[Math.min(7, Math.round(v * 7))]).join('') : '';
  const spark = pick.profile.filter((_, i) => i % 4 === 0).map((v) => '▁▂▃▄▅▆▇█'[Math.min(7, Math.round(v * 7))]).join('');
  console.log(`${pick.assumed ? '~' : '✓'} ${j.slug.padEnd(42)} h ${spark}${wspark}  a ${pick.aspect}`);
}

await browser.close();
if (has('write')) {
  writeFileSync(join(root, 'data/profiles.json'), JSON.stringify(out, null, 1));
  console.log(`\nwrote data/profiles.json — ${Object.keys(out).length} profiles`);
} else {
  console.log('\n(dry run — pass --write to save data/profiles.json)');
}
console.log(`measured ${measured} · refused ${refused}`);
