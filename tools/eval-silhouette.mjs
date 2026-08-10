/**
 * Score how closely the rendered bag's outline matches the product's own.
 *
 * Every other gate measures dimensional compliance — is the box the size the
 * maker published. None of them can see SHAPE, which is the thing the human
 * review actually complains about and the thing the measured profiles exist to
 * fix. That made the harness structurally biased: the moment a builder started
 * sweeping the photograph's real outline instead of a curve fitted to the
 * published numbers, every number we had could only get worse.
 *
 *   node tools/eval-silhouette.mjs --run <stamp> [--vs <stamp>]
 *
 * The two profiles are measured the same way at both ends — principal axis of
 * the silhouette, perpendicular half-extent at 40 stations, peak normalised,
 * mounting-end first — so they are directly comparable. The score is the
 * intersection over union of the two swept areas:
 *
 *     IoU = Σ min(render, photo) / Σ max(render, photo)
 *
 * 1.0 is identical. Because both are peak-normalised this is a pure SHAPE
 * score and says nothing about size — that is deliberate, size already has
 * three gates of its own.
 *
 * Known blind spot: both are oriented by the same narrow-end-first rule, so a
 * bag drawn back-to-front scores well. Orientation is a question for the human
 * review, not for this.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const RUNS = join(root, 'evals/runs');
const newest = () => readdirSync(RUNS).filter((d) => existsSync(join(RUNS, d, 'shots/report.json'))).sort().pop();

const profiles = existsSync(join(root, 'data/profiles.json'))
  ? JSON.parse(readFileSync(join(root, 'data/profiles.json'))) : {};
// Outlines measured off the maker's dimensioned engineering drawing beat ones
// traced off a lit photograph at an unknown angle, so prefer them where they
// exist (47 of the 70 Apidura products). Same shape of data, same orientation
// convention — mounting-end-first — so they drop straight in.
const diagrams = existsSync(join(root, 'data/diagram-profiles.json'))
  ? JSON.parse(readFileSync(join(root, 'data/diagram-profiles.json'))) : {};
const truthFor = (slug) => diagrams[slug]?.profile || profiles[slug]?.profile || null;
const truthKind = (slug) => (diagrams[slug]?.profile ? 'drawing' : profiles[slug]?.profile ? 'photo' : null);

function iou(a, b) {
  if (!a?.length || !b?.length) return null;
  const n = Math.min(a.length, b.length);
  let inter = 0, union = 0;
  for (let i = 0; i < n; i++) {
    inter += Math.min(a[i], b[i]);
    union += Math.max(a[i], b[i]);
  }
  return union > 0 ? inter / union : null;
}

function score(runId) {
  const report = JSON.parse(readFileSync(join(RUNS, runId, 'shots/report.json')));
  const rows = [];
  for (const r of report) {
    const photo = truthFor(r.slug);
    const drawn = r.profile40;
    const v = iou(drawn, photo);
    rows.push({ slug: r.slug, slot: r.slot, iou: v == null ? null : +v.toFixed(3),
                source: truthKind(r.slug),
                why: !photo ? 'no measured outline' : !drawn ? 'no rendered profile' : null });
  }
  return rows;
}

const runId = arg('run') || newest();
if (!runId) { console.error('no runs yet'); process.exit(2); }
const rows = score(runId);
writeFileSync(join(RUNS, runId, 'silhouette.json'), JSON.stringify({ run: runId, rows }, null, 1));

const scored = rows.filter((r) => r.iou != null);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const fmt = (v) => (v == null ? '   —' : v.toFixed(3));

console.log(`\n${runId} — silhouette IoU against the product photograph`);
console.log(`  scored ${scored.length}/${rows.length}   mean ${fmt(mean(scored.map((r) => r.iou)))}`);

console.log('\nBY BUILDER');
for (const s of [...new Set(rows.map((r) => r.slot))].sort()) {
  const g = scored.filter((r) => r.slot === s);
  if (!g.length) { console.log(`  ${s.padEnd(15)}   — (none measured)`); continue; }
  console.log(`  ${s.padEnd(15)} ${String(g.length).padStart(3)}  mean ${fmt(mean(g.map((r) => r.iou)))}  worst ${fmt(Math.min(...g.map((r) => r.iou)))}`);
}

console.log('\nWORST 10');
for (const r of [...scored].sort((a, b) => a.iou - b.iou).slice(0, 10)) {
  console.log(`  ${fmt(r.iou)}  ${r.slug}`);
}

// A mean can rise while a fifth of the items get worse, so name the movers.
const vs = arg('vs');
if (vs) {
  const prev = Object.fromEntries(score(vs).map((r) => [r.slug, r.iou]));
  const d = scored.map((r) => ({ slug: r.slug, delta: prev[r.slug] == null ? null : r.iou - prev[r.slug] }))
    .filter((x) => x.delta != null && Math.abs(x.delta) > 0.005);
  const up = d.filter((x) => x.delta > 0), down = d.filter((x) => x.delta < 0);
  const prevMean = mean(Object.values(prev).filter((v) => v != null));
  console.log(`\nVS ${vs}`);
  console.log(`  mean ${fmt(prevMean)} → ${fmt(mean(scored.map((r) => r.iou)))}`);
  console.log(`  improved ${up.length} · regressed ${down.length} · unchanged ${scored.length - up.length - down.length}`);
  for (const x of down.sort((a, b) => a.delta - b.delta).slice(0, 8)) console.log(`  ✗ ${x.slug} ${x.delta.toFixed(3)}`);
  for (const x of up.sort((a, b) => b.delta - a.delta).slice(0, 5)) console.log(`  ✓ ${x.slug} +${x.delta.toFixed(3)}`);
}
