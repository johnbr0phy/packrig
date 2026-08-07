// Downscale downloaded product photography to a sane size for the UI.
// Originals stay recoverable: product.images_remote keeps the source URLs.
// Usage: node tools/shrink-images.mjs [--max 900]
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url).pathname;
const dir = root + 'assets/products';
const mi = process.argv.indexOf('--max');
const MAX = mi >= 0 ? parseInt(process.argv[mi + 1], 10) || 900 : 900;

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);

const files = walk(dir);
let before = 0, after = 0, done = 0, failed = 0;
for (const f of files) {
  before += statSync(f).size;
  try {
    // sips ships with macOS; -Z scales the LONGER side, preserving aspect
    execFileSync('sips', ['-Z', String(MAX), f], { stdio: 'ignore' });
    done++;
  } catch { failed++; }
  after += statSync(f).size;
  if (done % 200 === 0) process.stdout.write(`\r  ${done}/${files.length}`);
}
process.stdout.write('\r');
console.log(`${files.length} images, longest side capped at ${MAX}px`);
console.log(`${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB`);
if (failed) console.log(`${failed} could not be processed (left untouched)`);
