/**
 * Measure a bag's true outline from the maker's own dimensioned drawing.
 *
 *   node tools/diagram-outline.mjs                      # all, dry
 *   node tools/diagram-outline.mjs --slug apidura-expedition-saddle-pack-9l
 *   node tools/diagram-outline.mjs --write              # save
 *
 * WHY THIS REPLACES tools/silhouette.mjs AS GROUND TRUTH.
 *
 * silhouette.mjs measures the outline off a photograph. A photograph is a lit
 * object at an unknown angle in perspective, so every profile it produces
 * carries an unknown error, and it has to REFUSE most images (three-quarter
 * views, lifestyle shots) because measuring them confidently produces a
 * confidently wrong answer.
 *
 * Apidura publishes, for nearly every product, a two-view orthographic
 * engineering drawing as SVG: the bag from above and from the side, drawn flat,
 * dimensioned, no perspective, no lighting. That is not a better photograph, it
 * is a different kind of evidence — it is the drawing our 3D model is trying to
 * reproduce. Measuring it is exact.
 *
 * HOW THE VIEWS ARE TOLD APART. Not by position — that would be an assumption
 * about Apidura's layout habits. Each view's own aspect ratio is compared with
 * the published numbers: the side view must read len:hgt and the plan view
 * len:wid. That assignment is therefore also a CHECK — if neither view matches
 * the published dimensions the drawing and the record disagree, and this
 * refuses rather than guessing. `agreement` in the output is that residual, and
 * it is the number to look at before trusting anything here.
 *
 * Output matches data/profiles.json's shape so tools/eval-silhouette.mjs scores
 * it unchanged, plus `plan` (the width profile), which photographs almost never
 * yield and which is half the shape of a bag.
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

// ---------------------------------------------------------------- svg filter
/**
 * Keep the bag, drop the draughting.
 *
 * These files carry five or six generated classes (`cls-1`…`cls-6`) whose
 * NUMBERING DIFFERS BETWEEN FILES, so they must be selected by what they do,
 * not by name. In the Expedition saddle pack drawing they are:
 *
 *   fill, no stroke     glyphs of the "15 cm" labels and the arrowheads
 *   stroke-width 2      dimension leader lines
 *   stroke-dasharray    the dashed roll-out extension — a state the bag can be
 *                       in, not its shape, so including it would inflate every
 *                       length by the roll
 *   stroke-width ≤ 1    the bag itself
 *
 * Hence: thin, solid, stroked classes only. Verified by rendering each class on
 * its own — the 2px class is nothing but dimension arrows, and the 0.5px class
 * is the bag with no arrows, no text and no dashes.
 */
function keepClasses(svg) {
  const styleBlock = (svg.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [, ''])[1];
  const props = new Map();                       // class -> {…css}
  for (const m of styleBlock.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = Object.fromEntries(
      m[2].split(';').filter(Boolean).map((d) => {
        const i = d.indexOf(':');
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
      }),
    );
    for (const sel of m[1].split(',')) {
      const cls = sel.trim().replace(/^\./, '');
      if (!/^[\w-]+$/.test(cls)) continue;
      props.set(cls, { ...(props.get(cls) || {}), ...decls });
    }
  }
  const keep = new Set();
  for (const [cls, p] of props) {
    if (!p.stroke || p.stroke === 'none') continue;
    if (p['stroke-dasharray']) continue;
    const w = parseFloat(p['stroke-width'] ?? '1');
    if (!(w <= 1)) continue;
    keep.add(cls);
  }
  return { keep, props };
}

/** Rebuild the file with only the kept elements, on white. */
function filterSvg(svg) {
  const { keep } = keepClasses(svg);
  if (!keep.size) return null;
  const viewBox = (svg.match(/viewBox="([^"]+)"/) || [, '0 0 800 600'])[1];
  const defs = (svg.match(/<defs>[\s\S]*?<\/defs>/) || [''])[0];
  const els = [];
  for (const m of svg.matchAll(/<(path|polyline|polygon|rect|circle|ellipse|line)\b[^>]*\/?>/g)) {
    const cls = (m[0].match(/class="([^"]+)"/) || [, ''])[1];
    if (cls.split(/\s+/).some((c) => keep.has(c))) els.push(m[0]);
  }
  if (els.length < 8) return null;
  const [, , vw, vh] = viewBox.split(/\s+/).map(Number);
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`
       + `<rect x="-9999" y="-9999" width="99999" height="99999" fill="#fff"/>`
       + `${defs}${els.join('')}</svg>`,
    vw, vh, kept: els.length,
  };
}

// -------------------------------------------------------------- measurement
/**
 * Runs in the page. Splits the drawing into views and profiles each one.
 *
 * Line art, not a filled silhouette — so the OUTER boundary of a column is
 * simply its topmost and bottommost ink. Interior seams, straps and panel
 * edges all sit between those two and cannot disturb the outline. That is why
 * this needs no segmentation step at all, and it is the whole reason a drawing
 * is easier to measure than a photograph.
 */
function measureInPage(dataUrl, STATIONS) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve({ ok: false, why: 'decode failed' });
    img.onload = () => {
      const H = 900;
      const W = Math.max(8, Math.round((img.width / img.height) * H));
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, W, H);
      const d = ctx.getImageData(0, 0, W, H).data;
      const ink = (x, y) => d[(y * W + x) * 4] < 200;   // near-black on white

      // rows that contain any ink
      const rowHas = new Array(H).fill(false);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) if (ink(x, y)) { rowHas[y] = true; break; }
      }
      // contiguous ink bands separated by a real gap; each band is one view
      const GAP = Math.round(H * 0.02);
      const bands = [];
      let start = -1, blank = 0;
      for (let y = 0; y < H; y++) {
        if (rowHas[y]) { if (start < 0) start = y; blank = 0; }
        else if (start >= 0 && ++blank > GAP) { bands.push([start, y - blank]); start = -1; }
      }
      if (start >= 0) bands.push([start, H - 1]);

      const views = [];
      for (const [y0, y1] of bands) {
        if (y1 - y0 < H * 0.05) continue;                 // stray marks
        let x0 = W, x1 = 0;
        for (let y = y0; y <= y1; y++) {
          for (let x = 0; x < W; x++) if (ink(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
        }
        if (x1 <= x0) continue;
        const bw = x1 - x0 + 1, bh = y1 - y0 + 1;

        // half-extent perpendicular to the long axis, at STATIONS stations
        const along = bw >= bh;                           // long axis horizontal?
        const n = along ? bw : bh;
        const prof = [];
        const centres = [];
        for (let i = 0; i < STATIONS; i++) {
          const lo = Math.floor((i / STATIONS) * n), hi = Math.max(lo + 1, Math.floor(((i + 1) / STATIONS) * n));
          let mn = Infinity, mx = -Infinity;
          for (let k = lo; k < hi; k++) {
            if (along) {
              const x = x0 + k;
              for (let y = y0; y <= y1; y++) if (ink(x, y)) { if (y < mn) mn = y; if (y > mx) mx = y; }
            } else {
              const y = y0 + k;
              for (let x = x0; x <= x1; x++) if (ink(x, y)) { if (x < mn) mn = x; if (x > mx) mx = x; }
            }
          }
          prof.push(mx >= mn ? (mx - mn + 1) / 2 : 0);
          centres.push(mx >= mn ? (mn + mx) / 2 : null);
        }
        const peak = Math.max(...prof);
        if (!(peak > 0)) continue;

        // How far the shape's local centreline wanders. This is what tells a
        // TOP view from a SIDE view when their proportions cannot: a bag seen
        // from above is mirror-symmetric about its long axis, so every
        // station's midpoint sits on one straight line; seen from the side it
        // has a flattish bottom and a domed top, so the midpoint climbs and
        // falls. Proportion alone is blind here — a saddle pack is 15 cm wide
        // and 16 cm tall, so the two views differ by 6% and the aspect test is
        // a coin toss on the single most important slot in the catalogue.
        const cs = centres.filter((c) => c !== null);
        const cMean = cs.reduce((s, v) => s + v, 0) / Math.max(cs.length, 1);
        const span = Math.max(...prof) * 2 || 1;
        const wander = cs.reduce((s, v) => s + Math.abs(v - cMean), 0) / Math.max(cs.length, 1) / span;

        views.push({
          box: [x0, y0, bw, bh],
          along,
          aspect: +(Math.max(bw, bh) / Math.min(bw, bh)).toFixed(4),
          profile: prof.map((v) => +(v / peak).toFixed(4)),
          wander: +wander.toFixed(4),
          peakPx: peak * 2,
          lenPx: along ? bw : bh,
        });
      }
      resolve(views.length ? { ok: true, views, W, H } : { ok: false, why: 'no views found' });
    };
    img.src = dataUrl;
  });
}

// ---------------------------------------------------------------------- run
const media = JSON.parse(readFileSync(join(root, 'data/apidura-media.json')));
const brands = JSON.parse(readFileSync(join(root, 'data/brands.json')));
const apidura = brands.find((b) => /apidura/i.test(b.name));
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const slugOf = (p) => norm(['apidura', p.line, p.name, p.size].filter(Boolean).join('-'));

const onlySlug = arg('slug');

/** every (product, diagram) pair we can attempt */
const jobs = [];
for (const page of Object.values(media.pages)) {
  const diagrams = page.images.filter((i) => i.kind === 'dimensions');
  if (!diagrams.length) continue;
  for (const sku of page.skus) {
    const prod = apidura.products.find(
      (p) => norm([p.line, p.name, p.size].filter(Boolean).join('-')) === sku.slug,
    );
    if (!prod || !prod.dims_cm) continue;
    const slug = slugOf(prod);
    if (onlySlug && slug !== onlySlug) continue;
    // a page's diagrams are per size; match on the size token when there is one
    const sizeTok = norm(String(sku.size || '')).replace(/[^0-9l-]/g, '');
    const pick = diagrams.find((d) => d.size && sizeTok && d.size === sizeTok) || (diagrams.length === 1 ? diagrams[0] : null);
    if (!pick) continue;
    jobs.push({ slug, prod, file: pick.local, page: page.url });
  }
}
console.log(`${jobs.length} products with a matching dimension drawing`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 });
await page.goto('about:blank');

const out = existsSync(join(root, 'data/diagram-profiles.json'))
  ? JSON.parse(readFileSync(join(root, 'data/diagram-profiles.json'))) : {};
let ok = 0, refused = 0;
const rows = [];

for (const job of jobs) {
  const abs = join(root, job.file);
  if (!existsSync(abs)) { refused++; continue; }
  const filtered = filterSvg(readFileSync(abs, 'utf8'));
  if (!filtered) { rows.push([job.slug, 'refused', 'no thin solid stroke class']); refused++; continue; }

  const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(filtered.svg).toString('base64');
  const res = await page.evaluate(measureInPage, dataUrl, STATIONS);
  if (!res.ok) { rows.push([job.slug, 'refused', res.why]); refused++; continue; }

  const { len, wid, hgt } = job.prod.dims_cm;
  if (!(len > 0 && wid > 0 && hgt > 0)) { rows.push([job.slug, 'refused', 'no published dims']); refused++; continue; }

  // Roll-top bags publish two lengths — "MIN 36 cm / MAX 42 cm" — and the
  // SOLID outline we just measured is the rolled-down state, because the
  // rolled-out extension is drawn dashed and we dropped the dashed class.
  // Comparing a rolled-down drawing against the rolled-out number reads as a
  // 15% error that is not an error. Try both and record which one the drawing
  // is in; that is itself a fact the builder needs.
  const minLen = (() => {
    const m = String(job.prod.dims_raw || '').match(/MIN\s*([\d.]+)\s*cm/i);
    const v = m ? parseFloat(m[1]) : NaN;
    return Number.isFinite(v) && v > 0 && v < len ? v : null;
  })();

  // Assign views by which published ratio each one matches. The side view is
  // len:hgt, the plan view len:wid. Both are computed long/short so they are
  // directly comparable with `aspect`.
  const ratio = (a, b) => Math.max(a, b) / Math.min(a, b);
  const want = { side: ratio(len, hgt), plan: ratio(len, wid) };
  let best = null;
  for (const v of res.views) {
    for (const which of ['side', 'plan']) {
      for (const [state, L] of [['max', len], ['min', minLen]]) {
        if (!L) continue;
        const target = ratio(L, which === 'side' ? hgt : wid);
        const err = Math.abs(v.aspect - target) / target;
        if (!best || err < best.err) best = { err, which, v, state, target };
      }
    }
  }
  // Two views whose published ratios are within 15% cannot be told apart by
  // aspect — the saddle pack is 15 cm wide and 16 cm tall, so len:wid and
  // len:hgt are 2.8 and 2.6. The measurement is still good; which of the two
  // it belongs to is a coin toss, and downstream must know that.
  const viewAmbiguous = Math.abs(want.side - want.plan) / Math.max(want.side, want.plan) < 0.15;
  // The second view is whichever OTHER band best matches the other ratio.
  const other = best.which === 'side' ? 'plan' : 'side';
  const otherLen = best.state === 'min' && minLen ? minLen : len;
  const otherTarget = ratio(otherLen, other === 'side' ? hgt : wid);
  let second = null;
  for (const v of res.views) {
    if (v === best.v) continue;
    const err = Math.abs(v.aspect - otherTarget) / otherTarget;
    if (!second || err < second.err) second = { err, v };
  }

  // A drawing whose views match neither published ratio is either not this
  // product or a record that is wrong. Either way, refuse — a wrong profile is
  // worse than none, because a builder will sweep it.
  if (best.err > 0.25) { rows.push([job.slug, 'refused', `aspect ${best.v.aspect} vs published ${best.target.toFixed(2)}`]); refused++; continue; }

  let sideV = best.which === 'side' ? best.v : second?.v;
  let planV = best.which === 'plan' ? best.v : second?.v;
  let assigned = 'by aspect';

  // Two cases where the aspect test cannot decide, and refusing would throw
  // away a good measurement:
  //
  //   one view only — many drawings publish just the side elevation. There is
  //     no second band to be the plan view, and whichever label won by a hair
  //     is not evidence that the one view we have is the wrong one.
  //   ambiguous ratios — when wid ≈ hgt the two targets are within a few per
  //     cent (saddle pack: 2.8 and 2.6) and the winner is a coin toss.
  //
  // In both, take the best-matching view as the side profile and say so. The
  // measurement is sound either way; only the LABEL is uncertain, and
  // `view_ambiguous` carries that downstream.
  if (!sideV && (res.views.length === 1 || viewAmbiguous)) {
    sideV = best.v;
    planV = second?.v ?? null;
    assigned = res.views.length === 1 ? 'only view' : 'ambiguous ratios';
  }
  if (!sideV) { rows.push([job.slug, 'refused', 'no side view']); refused++; continue; }

  // When proportions could not separate the views, symmetry can. The view whose
  // centreline wanders MORE is the side elevation (flat base, domed top); the
  // steadier one is the plan (mirror-symmetric about the long axis). Applied
  // only where the aspect test admitted defeat, so it can never override a
  // confident match — and only when the two actually differ, since two equally
  // symmetric views mean it genuinely cannot be called.
  let resolvedBy = null;
  if (viewAmbiguous && planV && sideV !== planV) {
    const a = sideV.wander ?? 0, b = planV.wander ?? 0;
    if (Math.abs(a - b) > 0.02 && b > a) {
      const t = sideV; sideV = planV; planV = t;
      resolvedBy = 'symmetry (swapped)';
    } else if (Math.abs(a - b) > 0.02) {
      resolvedBy = 'symmetry (confirmed)';
    }
    assigned = resolvedBy || 'ambiguous, symmetry inconclusive';
  }

  // Orient mounting-end-first, the same convention data/profiles.json uses, so
  // the two sources stay directly comparable in eval-silhouette.mjs.
  const n5 = Math.max(2, Math.round(STATIONS * 0.15));
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const prof = sideV.profile.slice();
  const flipped = mean(prof.slice(0, n5)) > mean(prof.slice(-n5));
  if (flipped) prof.reverse();
  const planProf = planV ? planV.profile.slice() : null;
  if (planProf && flipped) planProf.reverse();

  out[job.slug] = {
    profile: prof,
    plan: planProf,
    aspect: sideV.aspect,
    source: job.file,
    source_kind: 'diagram',
    flipped,
    published: { len, wid, hgt, minLen },
    drawn_state: best.state === 'min' ? 'rolled_down' : 'full',
    view_ambiguous: viewAmbiguous,
    view_assigned: assigned,
    agreement: {
      side: +(1 - best.err).toFixed(3),
      plan: second ? +(1 - second.err).toFixed(3) : null,
    },
    views_found: res.views.length,
    stations: STATIONS,
  };
  ok++;
  const spark = prof.filter((_, i) => i % 4 === 0)
    .map((v) => '▁▂▃▄▅▆▇█'[Math.min(7, Math.round(v * 7))]).join('');
  rows.push([job.slug, `${(1 - best.err) * 100 | 0}%`,
    `${res.views.length}v ${spark}${flipped ? ' flip' : ''}${best.state === 'min' ? ' rolled' : ''}${viewAmbiguous ? ' AMBIG' : ''}`]);
}

await browser.close();

const w = Math.max(...rows.map((r) => r[0].length));
for (const r of rows) console.log(`  ${r[0].padEnd(w)}  ${String(r[1]).padStart(8)}  ${r[2]}`);
console.log(`\n${ok} measured, ${refused} refused`);

if (has('write')) {
  writeFileSync(join(root, 'data/diagram-profiles.json'), JSON.stringify(out, null, 1));
  console.log(`wrote data/diagram-profiles.json — ${Object.keys(out).length} profiles`);
} else {
  console.log('(dry run — pass --write to save)');
}
