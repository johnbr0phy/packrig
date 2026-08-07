// Slot-consistency audit. Two independent signals, because a wrong slot passes
// every numeric check — the Carradice SQR Slim was `seatpack` while its own
// siblings were `saddlebag`, and it rendered as a tapered roll instead of a box.
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url).pathname;
const brands = JSON.parse(readFileSync(root + 'data/brands.json'));

// What the product's own NAME says it is. Order matters — most specific first.
const NAME_SLOT = [
  [/\bpannier|panniers\b/i, ['pannier']],
  [/\brack(-|\s)?(top|bag|trunk)|trunk bag\b/i, ['trunk']],
  [/\bfull frame\b/i, ['framebag_full']],
  [/\bframe (bag|pack)\b/i, ['framebag_full', 'framebag_half']],
  [/\btop ?tube\b/i, ['toptube', 'toptube_rear']],
  [/\bstem (bag|pack|pouch|caddy)|feed ?bag|food pouch|snack bag\b/i, ['stembag']],
  // "Bar Cage Bag" is a BAR bag — don't let "cage" pull it to the fork
  [/\bbar cage\b/i, ['barroll', 'barbag']],
  [/\bfork (bag|pack)|cargo cage|fork cage\b/i, ['forkbag']],
  [/\bdown ?tube\b/i, ['downtube']],
  [/\bhandlebar|bar (bag|pack|roll)\b/i, ['barroll', 'barbag', 'randobag']],
  [/\bsaddle ?bag\b/i, ['saddlebag', 'seatpack']],
  [/\bseat ?(pack|bag)\b/i, ['seatpack', 'saddlebag']],
  [/\bbasket\b/i, ['randobag']],
];

const issues = [];
for (const b of brands) {
  // ---- signal 1: a product whose slot disagrees with its own line siblings
  const lines = new Map();
  for (const p of b.products) {
    const key = (p.line || '').toLowerCase();
    if (!key) continue;
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push(p);
  }
  for (const [line, items] of lines) {
    if (items.length < 3) continue;                    // too few to have a majority
    const counts = {};
    for (const p of items) counts[p.slot] = (counts[p.slot] || 0) + 1;
    const [top, n] = Object.entries(counts).sort((a, c) => c[1] - a[1])[0];
    if (n / items.length < 0.6) continue;              // no clear majority
    for (const p of items) {
      if (p.slot === top) continue;
      // the product's own name is stronger evidence than its line's majority
      const named = NAME_SLOT.find(([re]) => re.test(`${p.line || ''} ${p.name}`));
      if (named && named[1].includes(p.slot)) continue;
      issues.push({ kind: 'line-outlier', brand: b.name, line: p.line, name: p.name, size: p.size || '',
        slot: p.slot, expected: top, src: p.src,
        detail: `${n}/${items.length} of the "${p.line}" line are ${top}, this one is ${p.slot}` });
    }
  }
  // ---- signal 2: the product's own name contradicts its slot
  for (const p of b.products) {
    const hay = `${p.line || ''} ${p.name}`;
    for (const [re, ok] of NAME_SLOT) {
      if (!re.test(hay)) continue;
      if (!ok.includes(p.slot)) {
        issues.push({ kind: 'name-mismatch', brand: b.name, line: p.line || '', name: p.name, size: p.size || '',
          slot: p.slot, expected: ok.join('|'), src: p.src,
          detail: `name matches /${re.source}/ which implies ${ok.join(' or ')}, but slot is ${p.slot}` });
      }
      break;                                            // first (most specific) match wins
    }
  }
}

const byKind = {};
for (const i of issues) byKind[i.kind] = (byKind[i.kind] || 0) + 1;
const total = brands.reduce((n, b) => n + b.products.length, 0);
console.log(`${total} products — ${issues.length} slot issues`);
for (const [k, n] of Object.entries(byKind)) console.log(`  ${k.padEnd(16)} ${n}`);
console.log();
for (const i of issues) console.log(`  [${i.kind}] ${i.brand} | ${i.line} | ${i.name} ${i.size}\n      ${i.detail}`);
const ji = process.argv.indexOf('--json');
if (ji >= 0) { writeFileSync(process.argv[ji + 1], JSON.stringify(issues, null, 1)); console.log(`\nwrote ${process.argv[ji + 1]}`); }
