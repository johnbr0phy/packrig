// Flag products whose dimensions cannot be right, so deep research is spent
// where it matters instead of re-reading every page.
// Usage: node tools/validate-dims.mjs [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const brands = JSON.parse(readFileSync(root + 'data/brands.json'));

// A soft bag's bounding box is always LARGER than its usable volume (corners,
// taper, roll-down). Ratios far outside this band mean a dimension is wrong.
const VOL_LO = 0.75, VOL_HI = 4.0;

// Slots whose bags are inherently elongated — a near-cube here is a red flag.
// Calibrated against makers' own published figures — earlier guesses caused
// 30 of 37 "failures" in one chunk. Removed entirely: framebag_full (a main
// triangle cannot exceed ~1.45), framebag_half (front-corner triangles are
// legitimately ~1.0 — Fairweather ADV, Revelate Cranny/Nook), toptube (the
// whole Revelate wedge family sits at 1.25-1.95), downtube. barroll relaxed to
// 1.5: the Fairweather ADV is a structured box, not a cylinder.
// Earlier note: framebag_full was
// 1.5, which a main triangle (~4:3) can never satisfy — it failed every full
// frame pack by construction. framebag_half was 2.2; Apidura's own diagrams
// cluster at 1.5-2.1. Rear top-tube packs are genuinely stubby and are exempt.
const ELONGATED = { seatpack: 1.6, barroll: 1.5 };

// Hard physical ceilings for this frame (mm), from data/geometry-journeyer57.json.
const MAX_MM = {
  barroll: { any: 620 }, barbag: { any: 480 }, toptube: { len: 620 },
  framebag_full: { len: 600, hgt: 520 }, framebag_half: { len: 600, hgt: 300 },
  stembag: { any: 260 }, forkbag: { any: 420 }, seatpack: { len: 720 },
  pannier: { any: 560 }, trunk: { any: 520 }, downtube: { len: 560 },
};

const issues = [];
for (const b of brands) {
  for (const p of b.products) {
    const d = p.dims_cm || {};
    const who = `${b.name} | ${p.line || ''} | ${p.name} | ${p.size || ''}`.replace(/\s+\|\s+\|/g, ' |');
    const push = (kind, detail, sev = 'high') =>
      issues.push({ brand: b.name, name: p.name, size: p.size || '', slot: p.slot, who, kind, detail, sev,
        dims: d, liters: p.liters, src: p.src, dims_state: p.dims_state || 'unknown', dims_source: p.dims_verified || 'none' });

    const axes = ['len', 'wid', 'hgt'].map((k) => Number(d[k])).filter((n) => Number.isFinite(n) && n > 0);
    if (axes.length < 3) {
      const dia = Number(d.dia);
      if (!(axes.length === 2 && Number.isFinite(dia) && dia > 0) && !(axes.length >= 1 && Number.isFinite(dia))) {
        push('missing-dims', `only ${axes.length} of 3 axes present: ${JSON.stringify(d)}`);
      }
      continue;
    }
    const [lo, mid, hi] = [...axes].sort((a, b2) => a - b2);
    const L = Number(p.liters);

    // 1. box volume vs stated capacity
    if (Number.isFinite(L) && L > 0) {
      const boxL = (axes[0] * axes[1] * axes[2]) / 1000;
      const ratio = boxL / L;
      if (ratio < VOL_LO) push('volume-too-small', `box ${boxL.toFixed(1)}L vs stated ${L}L (ratio ${ratio.toFixed(2)}) — dims too small for the capacity`);
      else if (ratio > VOL_HI) push('volume-too-big', `box ${boxL.toFixed(1)}L vs stated ${L}L (ratio ${ratio.toFixed(2)}) — a dimension is probably an unrolled/flat figure`);
    }

    // 2. shape sanity for slots that are inherently long
    const need = ELONGATED[p.slot];
    if (need && hi / mid < need) {
      push('too-cubic', `${p.slot} should be elongated (longest/middle >= ${need}) but is ${(hi / mid).toFixed(2)} — ${axes.join(' x ')}cm`, 'medium');
    }

    // 3. physically impossible on this frame
    const cap = MAX_MM[p.slot];
    if (cap) {
      const mmAll = axes.map((a) => a * 10);
      const TOL = 1.06;   // 5% slack: 48.3cm vs a 48cm ceiling is not a data error
      if (cap.any && Math.max(...mmAll) > cap.any * TOL) push('too-big-for-frame', `largest axis ${(Math.max(...mmAll) / 10).toFixed(1)}cm exceeds ${(cap.any / 10)}cm for ${p.slot}`);
      if (cap.len && Number(d.len) * 10 > cap.len * TOL) push('too-big-for-frame', `len ${d.len}cm exceeds ${(cap.len / 10)}cm for ${p.slot}`);
      if (cap.hgt && Number(d.hgt) * 10 > cap.hgt * TOL) push('too-big-for-frame', `hgt ${d.hgt}cm exceeds ${(cap.hgt / 10)}cm for ${p.slot}`);
    }

    // 4. a duplicated axis — len carrying the height verbatim showed up
    //    repeatedly in Apidura entries and draws a fat blob instead of a tube
    const L2 = Number(d.len), H2 = Number(d.hgt), W2 = Number(d.wid);
    const dup = [['len', 'hgt', L2, H2], ['len', 'wid', L2, W2], ['hgt', 'wid', H2, W2]]
      .find(([, , a, b2]) => Number.isFinite(a) && Number.isFinite(b2) && a > 0 && Math.abs(a - b2) < 0.05);
    // A square cross-section (the two SMALLEST axes equal) is normal on tubes
    // and pouches. The error signature is a duplicate involving the LONGEST
    // axis — that is where a height got copied into the length.
    const dupTouchesLongest = dup && (Math.abs(dup[2] - hi) < 0.05);
    if (dup && dupTouchesLongest && p.slot !== 'stembag' && p.slot !== 'forkbag') {
      push('duplicated-axis', `${dup[0]} and ${dup[1]} are both ${dup[2]}cm — one was probably copied from the other`, 'medium');
    }

    // 5. degenerate — a builder given these will produce a blob
    if (hi / lo < 1.15 && p.slot !== 'stembag') {
      push('near-cube', `all three axes within 15% (${axes.join(' x ')}cm) — renders as a ball`, 'medium');
    }
  }
}

const bySev = { high: issues.filter((i) => i.sev === 'high'), medium: issues.filter((i) => i.sev === 'medium') };
const byKind = {};
for (const i of issues) byKind[i.kind] = (byKind[i.kind] || 0) + 1;
const total = brands.reduce((n, b) => n + b.products.length, 0);
const flagged = new Set(issues.map((i) => i.who)).size;

console.log(`${total} products, ${flagged} flagged (${issues.length} issues)`);
console.log(`  high: ${bySev.high.length}   medium: ${bySev.medium.length}`);
for (const [k, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(20)} ${n}`);
const ji = process.argv.indexOf('--json');
if (ji >= 0) { writeFileSync(process.argv[ji + 1], JSON.stringify(issues, null, 1)); console.log(`\nwrote ${process.argv[ji + 1]}`); }
else for (const i of bySev.high.slice(0, 25)) console.log(`\n  [${i.kind}] ${i.who}\n    ${i.detail}`);
