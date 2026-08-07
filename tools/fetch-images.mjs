// Download product photography referenced by data/brands.json into the repo.
// Rewrites product.images to local paths and keeps the original URLs in
// product.images_remote so provenance survives.
// Usage: node tools/fetch-images.mjs [--per N] [--dry]
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const pi = args.indexOf('--per');
const PER = pi >= 0 ? parseInt(args[pi + 1], 10) || 4 : 4;   // images kept per product

const brands = JSON.parse(readFileSync(root + 'data/brands.json'));
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const jobs = [];
for (const b of brands) {
  for (const p of b.products) {
    const remote = p.images_remote || p.images || [];
    if (!remote.length) continue;
    const keep = [...new Set(remote)].slice(0, PER);
    const base = `assets/products/${slug(b.name)}`;
    const stem = slug([p.line, p.name, p.size].filter(Boolean).join('-'));
    jobs.push({ p, remote, local: keep.map((url, i) => {
      const ext = (url.split('?')[0].match(/\.(jpe?g|png|webp|avif)$/i) || ['.jpg'])[0].toLowerCase();
      return { url, path: `${base}/${stem}-${i + 1}${ext}` };
    }) });
  }
}
const total = jobs.reduce((n, j) => n + j.local.length, 0);
console.log(`${jobs.length} products, ${total} images (max ${PER}/product)`);
if (dry) process.exit(0);

let ok = 0, skip = 0, fail = 0, bytes = 0;
const failures = [];
const CONC = 8;
const queue = jobs.flatMap((j) => j.local.map((f) => ({ ...f, j })));

async function worker() {
  for (;;) {
    const item = queue.shift();
    if (!item) return;
    const abs = root + item.path;
    if (existsSync(abs) && statSync(abs).size > 1024) { skip++; bytes += statSync(abs).size; continue; }
    try {
      const res = await fetch(item.url, {
        headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', accept: 'image/*' },
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) throw new Error(`too small (${buf.length}B)`);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, buf);
      ok++; bytes += buf.length;
    } catch (e) {
      fail++;
      failures.push({ url: item.url, path: item.path, error: String(e.message).slice(0, 90) });
      item.dead = true;
    }
    if ((ok + skip + fail) % 100 === 0) process.stdout.write(`\r  ${ok + skip + fail}/${total}`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
process.stdout.write('\r');

// rewrite the catalogue to point at what actually landed
for (const j of jobs) {
  const got = j.local.filter((f) => !f.dead && existsSync(root + f.path));
  if (!got.length) continue;
  j.p.images_remote = j.remote;
  j.p.images = got.map((f) => f.path);
}
writeFileSync(root + 'data/brands.json', JSON.stringify(brands, null, 1));
if (failures.length) writeFileSync(root + 'data/image-failures.json', JSON.stringify(failures, null, 1));
console.log(`downloaded ${ok}, already had ${skip}, failed ${fail}`);
console.log(`on disk: ${(bytes / 1024 / 1024).toFixed(1)} MB in assets/products/`);
if (failures.length) console.log(`see data/image-failures.json (first: ${failures[0].error})`);
