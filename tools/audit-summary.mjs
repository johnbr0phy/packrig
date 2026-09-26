/**
 * Before and after, in numbers, from the screens reports.
 *
 *   node tools/audit-summary.mjs shots/before/report.json shots/after/report.json
 *
 * Bike size on the phone (the builder with no sheet, and with a sheet at
 * half), every font size that carried text, touch targets under 44px on the
 * phone, and buttons with no name.
 */
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
const PEEK = ['S04-builder', 'S08-rig', 'S18-shared', 'S23-units', 'S24-suggest'];
const HALF = ['S06-catalogue', 'S07-product', 'S09-inside', 'S10-wontfit', 'S13-quick', 'S19-share'];
for (const f of files) {
  const rows = JSON.parse(readFileSync(f, 'utf8')).filter((r) => r.audit && !r.audit.error);
  const phone = rows.filter((r) => r.device === 'phone');
  const frac = (ids) => phone.filter((r) => ids.includes(r.id)).map((r) => [`${r.id}-${r.state}`, r.audit.bike.frac]);
  const sizes = new Map();
  for (const r of rows) for (const [k, n] of Object.entries(r.audit.fonts)) sizes.set(k, (sizes.get(k) || 0) + n);
  const px = [...sizes.keys()].map(parseFloat).sort((a, b) => a - b);
  const small = phone.reduce((n, r) => n + r.audit.small, 0);
  const smallList = [...new Set(phone.flatMap((r) => r.audit.smallList))].slice(0, 20);
  const unl = rows.reduce((n, r) => n + r.audit.unlabelled.length, 0);
  const pk = frac(PEEK), hf = frac(HALF);
  const min = (a) => (a.length ? Math.min(...a.map((x) => x[1])) : null);
  console.log(`\n${f}: ${rows.length} shots`);
  console.log(`  bike, phone, no sheet or peek: min ${min(pk)}  ${pk.map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`  bike, phone, sheet at half:    min ${min(hf)}  ${hf.map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`  font sizes carrying text: ${px.length} (${px.join(', ')}); half-pixel: ${px.filter((x) => !Number.isInteger(x)).join(', ') || 'none'}; under 11: ${px.filter((x) => x < 11).join(', ') || 'none'}`);
  console.log(`  phone targets under 44px (summed over shots): ${small}`);
  if (smallList.length) console.log(`    e.g. ${smallList.join(' | ')}`);
  console.log(`  buttons with no name: ${unl}`);
}
