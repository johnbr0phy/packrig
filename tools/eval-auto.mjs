/**
 * The free graders: pass/fail gates and signed dimension error, applied to a
 * run. No model, no human, no ambiguity — a gate failure is a bug, not a low
 * score, and is never offset by looking good. (EVAL-PLAN.md §4)
 *
 *   node tools/eval-auto.mjs                       # newest run
 *   node tools/eval-auto.mjs --run <stamp> --vs <stamp>
 *
 * Writes <run>/auto.json and prints pass rates per gate and per builder,
 * because the builder is the unit of improvement — one edit to seatpack.js
 * moves 78 products, so a ranked list of individual bags is not actionable.
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

// Kept identical to tools/bagshot.mjs: a bag is SUPPOSED to touch what it
// straps to, and no slot may ever touch a tyre.
const CONTACT_OK = {
  seatpack: ['saddle', 'seatpost', 'seat cluster'],
  saddlebag: ['saddle', 'seatpost', 'seat cluster'],
  barroll: ['handlebar', 'stem / head'],
  barbag: ['handlebar', 'stem / head'],
  randobag: ['handlebar', 'stem / head', 'fork crown'],
  framebag_full: ['top tube', 'down tube', 'seat tube', 'head tube', 'seat cluster', 'crank / BB'],
  framebag_half: ['top tube', 'down tube', 'seat tube', 'head tube', 'seat cluster'],
  toptube: ['top tube', 'stem / head', 'head tube'],
  toptube_rear: ['top tube', 'seat tube', 'seat cluster'],
  stembag: ['handlebar', 'stem / head'],
  forkbag: ['fork leg', 'fork crown'],
  downtube: ['down tube', 'crank / BB'],
  pannier: ['rear hub', 'seatstay', 'chainstay'],
  trunk: ['seatstay', 'seat cluster', 'rear hub'],
};
const CONTACT_DEPTH_MM = 8;
const TYRE_MIN_MM = 15;
const ATTACH_MAX_MM = 12;

// Outlines measured off the maker's dimensioned engineering drawings, used by
// the shape gate. Preferred over the photo-traced ones because a drawing is
// orthographic and unlit; falls back to the photo profiles where no drawing
// was measured.
const TRUTH = (() => {
  const d = existsSync(join(root, 'data/diagram-profiles.json'))
    ? JSON.parse(readFileSync(join(root, 'data/diagram-profiles.json'))) : {};
  const p2 = existsSync(join(root, 'data/profiles.json'))
    ? JSON.parse(readFileSync(join(root, 'data/profiles.json'))) : {};
  return { ...p2, ...d };
})();
// 0.75 is deliberately loose. The point is to catch a bag drawn back to front
// or a silhouette that is a different object, not to police a taper constant.
const SHAPE_MIN = 0.75;
const SIZE_HI = 0.25, SIZE_LO = -0.10;

/**
 * Which bbox axis a spec axis lands on. Null where the axis is a diagonal.
 *
 * MODEL-SPEC.md §`mount.axes` also allows TUBE-RELATIVE values —
 * `along_toptube`, `along_downtube`, `along_seattube`, `along_forkleg`,
 * `perp_downtube` and so on — because a bag strapped under a sloping tube does
 * not have its own axes on the world axes. 42 of the 70 Apidura records use
 * them, and this function used to return null for every one, so those axes were
 * SILENTLY NOT SIZE-CHECKED AT ALL. That is why the per-builder table printed
 * `—` for length on every frame pack and top tube pack: not "no error", but
 * "never measured".
 *
 * Resolving them to the nearest world axis is an approximation — a top tube
 * slopes a few degrees, a down tube far more — so it slightly overstates the
 * measured extent on the steepest tubes. That is a much smaller error than not
 * measuring, and it is disclosed here rather than hidden.
 */
const TUBE_AXIS = {
  along_toptube: 'x', along_downtube: 'x', along_chainstay: 'x',
  along_seattube: 'y', along_forkleg: 'y', along_headtube: 'y',
  perp_downtube: 'y', perp_toptube: 'y', perp_seattube: 'x', perp_forkleg: 'x',
  across: 'z', lateral: 'z',
};
function axisOf(axes, k) {
  const raw = String((axes || {})[k] || '');
  const a = raw.replace('-', '');
  if (['x', 'y', 'z'].includes(a)) return a;
  return TUBE_AXIS[a.toLowerCase()] || null;
}

function grade(it, m) {
  const g = {}, why = [];
  const slot = it.slot;
  const ok = CONTACT_OK[slot] || [];
  const cl = m?.clearance || [];

  g.placed = !!m && !m.dropped && !m.err;
  if (!g.placed) why.push(m?.err || 'dropped — resolver could not place it');

  if (g.placed) {
    const clash = cl.filter((c) => {
      const touching = c.kind === 'cloud' ? c.mm < 3 : c.mm < 0;
      if (!touching) return false;
      if (/tyre/.test(c.part)) return true;
      return !(ok.includes(c.part) && c.mm >= -CONTACT_DEPTH_MM);
    });
    g.no_clash = !clash.length;
    if (clash.length) why.push('clash: ' + clash.map((c) => `${c.part} ${c.mm}mm`).join(', '));

    const tyres = cl.filter((c) => /tyre/.test(c.part));
    g.tyre = tyres.every((c) => c.mm >= TYRE_MIN_MM);
    if (!g.tyre) why.push('tyre: ' + tyres.filter((c) => c.mm < TYRE_MIN_MM).map((c) => `${c.part} ${c.mm}mm`).join(', '));

    // A fork bag 39 mm clear of the fork is floating, not mounted.
    const attach = (it.record?.mount?.attachesTo || []).length ? ok : ok;
    const near = cl.filter((c) => attach.includes(c.part)).map((c) => c.mm);
    g.attached = near.length ? Math.min(...near) <= ATTACH_MAX_MM : null;
    if (g.attached === false) why.push(`floating — nearest mount ${Math.min(...near).toFixed(1)}mm`);

    // Size, mapped through mount.axes, body-only where the run has it.
    const bb = m.bbox_body_mm || m.bbox_mm;
    const rd = it.record?.render || {};
    const d = it.dims_cm || {};
    const spec = { len: rd.len_cm ?? d.len, wid: rd.wid_cm ?? d.wid, hgt: rd.hgt_cm ?? d.hgt };
    g.err = {}; let sized = 0, failed = [];
    for (const k of ['len', 'wid', 'hgt']) {
      const a = axisOf(it.record?.mount?.axes, k);
      if (!a || !spec[k]) { g.err[k] = null; continue; }          // diagonal or no spec
      const e = (bb[a] / 10 - spec[k]) / spec[k];
      g.err[k] = +e.toFixed(3);
      sized++;
      if (e > SIZE_HI || e < SIZE_LO) failed.push(`${k} ${(e * 100).toFixed(0)}%`);
    }
    g.size_sane = sized ? !failed.length : null;
    if (failed.length) why.push('size: ' + failed.join(', '));
    g.body_bbox = !!m.bbox_body_mm;

    // SHAPE. Every other gate here measures how BIG the bag is and where it
    // sits; none of them can see what it looks like. That gap is not
    // theoretical: v3 reversed the taper on all eleven seat packs and this
    // file reported zero regressions, because a bag drawn back to front is
    // exactly the right size in exactly the right place.
    //
    // So compare the rendered outline with the one measured off the maker's
    // engineering drawing. Both are 40 stations, peak-normalised and oriented
    // mounting-end-first, so intersection-over-union is a pure shape score.
    // Null where we have no drawing for the product (23 of 70) — an unscored
    // item must not read as a pass.
    const truth = TRUTH[it.slug]?.profile;
    if (truth && Array.isArray(m.profile40)) {
      let inter = 0, union = 0;
      const n = Math.min(truth.length, m.profile40.length);
      for (let i = 0; i < n; i++) {
        inter += Math.min(m.profile40[i], truth[i]);
        union += Math.max(m.profile40[i], truth[i]);
      }
      g.shape_iou = union > 0 ? +(inter / union).toFixed(3) : null;
      g.shape_ok = g.shape_iou == null ? null : g.shape_iou >= SHAPE_MIN;
      if (g.shape_ok === false) why.push(`shape IoU ${g.shape_iou}`);
    } else {
      g.shape_iou = null;
      g.shape_ok = null;
    }
  }
  return { ...g, why };
}

// ---- run -----------------------------------------------------------------
const runId = arg('run') || newest();
if (!runId) { console.error('no runs with a report.json yet'); process.exit(2); }
const dir = join(RUNS, runId);
const items = JSON.parse(readFileSync(join(dir, 'items.json')));
const report = JSON.parse(readFileSync(join(dir, 'shots/report.json')));
const byslug = Object.fromEntries(report.map((x) => [x.slug, x]));

const graded = items.map((it) => ({ slug: it.slug, slot: it.slot, ...grade(it, byslug[it.slug]) }));
writeFileSync(join(dir, 'auto.json'), JSON.stringify({ run: runId, gates: graded }, null, 1));

const GATES = ['placed', 'no_clash', 'tyre', 'attached', 'size_sane', 'shape_ok'];
const pct = (n, d) => (d ? Math.round(n / d * 100) + '%' : '  —');

console.log(`\n${runId} — ${graded.length} items` + (graded[0]?.body_bbox ? '' : '  (no body-only bbox in this run; sizes include straps)'));

console.log('\nGATE PASS RATE');
for (const k of GATES) {
  const rel = graded.filter((g) => g[k] !== null && g[k] !== undefined);
  const pass = rel.filter((g) => g[k]).length;
  console.log(`  ${k.padEnd(11)} ${String(pass).padStart(3)}/${String(rel.length).padEnd(3)} ${pct(pass, rel.length).padStart(5)}`);
}

console.log('\nBY BUILDER');
const slots = [...new Set(graded.map((g) => g.slot))].sort();
console.log('  ' + 'builder'.padEnd(15) + 'n'.padStart(3) + GATES.map((k) => k.slice(0, 9).padStart(10)).join('') + '   mean signed err len/wid/hgt');
for (const s of slots) {
  const rows = graded.filter((g) => g.slot === s);
  const cells = GATES.map((k) => {
    const rel = rows.filter((g) => g[k] !== null && g[k] !== undefined);
    return (rel.length ? pct(rel.filter((g) => g[k]).length, rel.length) : '—').padStart(10);
  }).join('');
  const mean = ['len', 'wid', 'hgt'].map((k) => {
    const v = rows.map((g) => g.err?.[k]).filter((x) => x != null);
    return v.length ? ((v.reduce((a, b) => a + b, 0) / v.length) * 100).toFixed(0) + '%' : '—';
  }).join(' / ');
  console.log('  ' + s.padEnd(15) + String(rows.length).padStart(3) + cells + '   ' + mean);
}

const broken = graded.filter((g) => g.why.length);
console.log(`\nFAILING ITEMS (${broken.length})`);
for (const g of broken.slice(0, 24)) console.log(`  ${g.slug.padEnd(46)} ${g.why.join(' · ')}`);
if (broken.length > 24) console.log(`  … ${broken.length - 24} more in auto.json`);

// ---- comparison ----------------------------------------------------------
// A mean can rise while a fifth of the items get worse, so regressions are
// named rather than averaged away. (EVAL-PLAN.md §1.9)
const vs = arg('vs');
if (vs) {
  const prev = JSON.parse(readFileSync(join(RUNS, vs, 'auto.json'))).gates;
  const p = Object.fromEntries(prev.map((g) => [g.slug, g]));
  const score = (g) => GATES.filter((k) => g[k] === true).length;
  const up = [], down = [];
  for (const g of graded) {
    const q = p[g.slug]; if (!q) continue;
    const d = score(g) - score(q);
    if (d > 0) up.push(g.slug); else if (d < 0) down.push(`${g.slug} (${g.why.join(' · ')})`);
  }
  console.log(`\nVS ${vs} — improved ${up.length} · regressed ${down.length} · unchanged ${graded.length - up.length - down.length}`);
  for (const d of down) console.log('  ✗ ' + d);
}
