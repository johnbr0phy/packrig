/**
 * No em dashes: in copy, comments or docs (the owner's rule for this repo).
 *
 *   node tools/no-emdash.mjs [--check]
 *
 * --check lists files that still carry one and exits 1. Without it, rewrites:
 *   an em dash as a "no value" mark  -> an en dash
 *   inside a regex character class   -> its \u escape (still matches data)
 *   between clauses                  -> ", "  (": " in src/bags/fit.js, whose
 *                                               reasons read as a verdict then
 *                                               its numbers)
 * data/ is not touched: product records are data, and share links match by
 * name. docs/ is build output and is rebuilt from src. The dash is built
 * from its code point so this file can run over itself.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const root = new URL('../', import.meta.url).pathname;
const check = process.argv.includes('--check');
const SKIP = new Set(['node_modules', 'vendor', 'docs', 'data', 'shots', '.git', 'assets', 'build', 'reference']);
const EXT = /\.(js|mjs|css|html|md|py|sh|txt)$/;
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    if (SKIP.has(n)) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (EXT.test(n)) files.push(p);
  }
})(root);

const all = (s, a, b) => s.split(a).join(b);
let left = 0, changed = 0;
for (const f of files) {
  const t = readFileSync(f, 'utf8');
  if (!t.includes(EM)) continue;
  const rel = relative(root, f);
  if (check) { left++; console.log(rel, t.split(EM).length - 1); continue; }
  let s = t;
  for (const q of ["'", '"', '`']) s = all(s, q + EM + q, q + EN + q);
  s = s.replace(/\[[^\]\n]*\]/g, (m) => all(m, EM, '\\u2014'));
  if (rel === 'src/bags/fit.js') s = all(s, ` ${EM} `, ': ');
  s = all(s, ` ${EM} `, ', ');
  s = all(s, ` ${EM}\n`, ',\n');
  s = s.replace(new RegExp(`\\n(\\s*)${EM} `, 'g'), '\n$1');
  s = all(s, EM, ', ');
  if (s !== t) { writeFileSync(f, s); changed++; }
}
if (check) { console.log(left ? `${left} files still carry an em dash` : 'no em dashes'); process.exit(left ? 1 : 0); }
console.log(`${changed} files rewritten`);
