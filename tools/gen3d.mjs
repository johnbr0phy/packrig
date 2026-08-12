/**
 * Generate a mesh per product from its photographs, using an open image-to-3D
 * model that we host rather than a service we pay per model.
 *
 *   PROVIDER=fal FAL_KEY=… node tools/gen3d.mjs --set apidura-v1 --limit 8
 *   PROVIDER=local GEN3D_URL=http://gpu-box:8000 node tools/gen3d.mjs --brand Apidura
 *
 * Writes assets/generated/<slug>.glb plus a manifest at
 * data/generated.json so the app can pick the mesh up per product.
 *
 * WHY THIS SHAPE. The expensive part of image-to-3D is the model, and the good
 * ones are open: TRELLIS (Microsoft, 2B params) and Hunyuan3D 2.x (Tencent,
 * 10B) both run on a single consumer GPU and beat the commercial services on
 * published benchmarks. Paying $1/model for 702 products is ~$700; renting a
 * GPU to run the same class of model is tens of dollars. So the provider is a
 * seam, not a dependency — swap the endpoint, keep the pipeline.
 *
 * Providers, in order of preference:
 *   local     a TRELLIS / Hunyuan3D server you control. Cheapest at 702 items.
 *   fal       fal.ai serverless. Per-second GPU, no box to keep alive.
 *   replicate same idea, different host.
 *   tripo     the paid API, kept only as the quality reference to measure the
 *             open models against.
 *
 * WHAT THIS DOES NOT DO. It gets a mesh; it does not get a bag that hangs on a
 * bicycle. Orienting, scaling to the published dimensions and attaching it to
 * the mount frame is tools/gen-fit.mjs, and it is the harder half.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};

const PROVIDER = process.env.PROVIDER || 'local';
const OUT = join(root, 'assets/generated');
const MANIFEST = join(root, 'data/generated.json');

// ---- providers -----------------------------------------------------------
// Each returns a Buffer of GLB bytes, or throws. `images` are data URLs; the
// first is the primary view. Multi-view materially beats single-image — the
// back and sides come from real photographs instead of being invented — so
// every provider is handed all the views we have.

const providers = {
  /** A TRELLIS or Hunyuan3D server. See docs/GEN3D.md for the container. */
  async local(images, { slug }) {
    const url = process.env.GEN3D_URL;
    if (!url) throw new Error('set GEN3D_URL to your TRELLIS/Hunyuan3D server');
    const res = await fetch(`${url}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images, name: slug, format: 'glb', texture: true }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`.slice(0, 200));
    return Buffer.from(await res.arrayBuffer());
  },

  /** fal.ai serverless GPU. Per-second billing, nothing to keep running. */
  async fal(images, { slug }) {
    const key = process.env.FAL_KEY;
    if (!key) throw new Error('set FAL_KEY');
    const model = process.env.FAL_MODEL || 'fal-ai/trellis';
    const res = await fetch(`https://fal.run/${model}`, {
      method: 'POST',
      headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(images.length > 1
        ? { image_urls: images }
        : { image_url: images[0] }),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    const out = await res.json();
    const link = out?.model_mesh?.url || out?.mesh?.url || out?.glb?.url;
    if (!link) throw new Error(`no mesh in response: ${JSON.stringify(out).slice(0, 200)}`);
    return Buffer.from(await (await fetch(link)).arrayBuffer());
  },

  async replicate(images, { slug }) {
    const key = process.env.REPLICATE_API_TOKEN;
    if (!key) throw new Error('set REPLICATE_API_TOKEN');
    const version = process.env.REPLICATE_VERSION;
    if (!version) throw new Error('set REPLICATE_VERSION to a TRELLIS/Hunyuan3D version id');
    const start = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version, input: { images } }),
    }).then((r) => r.json());
    let job = start;
    // Replicate is async; poll rather than hold the connection open.
    for (let i = 0; i < 240 && !['succeeded', 'failed', 'canceled'].includes(job.status); i++) {
      await new Promise((r) => setTimeout(r, 2500));
      job = await fetch(job.urls.get, { headers: { Authorization: `Bearer ${key}` } }).then((r) => r.json());
    }
    if (job.status !== 'succeeded') throw new Error(`replicate ${job.status}: ${String(job.error).slice(0, 160)}`);
    const link = Array.isArray(job.output) ? job.output[0] : (job.output?.glb || job.output);
    return Buffer.from(await (await fetch(link)).arrayBuffer());
  },

  /** The paid reference. Kept so the open models can be measured against it. */
  async tripo(images, { slug }) {
    const key = process.env.TRIPO_API_KEY;
    if (!key) throw new Error('set TRIPO_API_KEY');
    const H = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    const task = await fetch('https://api.tripo3d.ai/v2/openapi/task', {
      method: 'POST', headers: H,
      body: JSON.stringify({ type: 'image_to_model', file: { type: 'jpg', url: images[0] } }),
    }).then((r) => r.json());
    const id = task?.data?.task_id;
    if (!id) throw new Error(`no task id: ${JSON.stringify(task).slice(0, 200)}`);
    for (let i = 0; i < 240; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const s = await fetch(`https://api.tripo3d.ai/v2/openapi/task/${id}`, { headers: H }).then((r) => r.json());
      const st = s?.data?.status;
      if (st === 'success') {
        const link = s.data.output?.pbr_model || s.data.output?.model;
        return Buffer.from(await (await fetch(link)).arrayBuffer());
      }
      if (['failed', 'cancelled', 'banned'].includes(st)) throw new Error(`tripo ${st}`);
    }
    throw new Error('tripo timed out');
  },
};

// ---- pick the inputs -----------------------------------------------------
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const key = (p) => slugify([p.line, p.name, p.size].filter(Boolean).join(' '));

const setName = arg('set');
let items;
if (setName) {
  items = JSON.parse(readFileSync(join(root, 'evals/sets', setName + '.json'))).items;
} else {
  const brands = JSON.parse(readFileSync(join(root, 'data/brands.json')));
  const want = (arg('brand') || '').toLowerCase();
  items = [];
  for (const b of brands) {
    if (want && b.name.toLowerCase() !== want) continue;
    const mf = join(root, 'data/models', slugify(b.name) + '.json');
    const recs = existsSync(mf) ? new Map((JSON.parse(readFileSync(mf)).products || []).map((r) => [key(r), r])) : new Map();
    b.products.forEach((p) => {
      const rec = recs.get(key(p));
      items.push({
        slug: slugify([b.name, p.line, p.name, p.size].filter(Boolean).join(' ')),
        slot: p.slot, dims_cm: p.dims_cm,
        refs: (rec?.evidence || []).filter((e) => !String(e).startsWith('http')).map((path) => ({ path })),
      });
    });
  }
}
const only = arg('slot');
if (only) items = items.filter((i) => i.slot === only);
const limit = parseInt(arg('limit', '0'), 10);
if (limit) items = items.slice(0, limit);

mkdirSync(OUT, { recursive: true });
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST)) : {};
const gen = providers[PROVIDER];
if (!gen) { console.error(`unknown PROVIDER=${PROVIDER}; one of ${Object.keys(providers).join(', ')}`); process.exit(2); }

console.log(`provider ${PROVIDER} · ${items.length} product(s)\n`);
let made = 0, failed = 0, skipped = 0;

for (const it of items) {
  const dest = join(OUT, it.slug + '.glb');
  if (existsSync(dest) && !argv.includes('--force')) { skipped++; continue; }

  // Photographs only. Several "photos" in this catalogue are SVG dimension
  // diagrams saved as .jpg, and a generator handed a line drawing returns a
  // confident model of a line drawing.
  const imgs = [];
  for (const r of (it.refs || [])) {
    const abs = join(root, r.path || r);
    if (!existsSync(abs)) continue;
    const buf = readFileSync(abs);
    const head = buf.subarray(0, 200).toString('latin1').trimStart();
    if (head.startsWith('<svg') || head.startsWith('<?xml')) continue;
    imgs.push(`data:image/jpeg;base64,${buf.toString('base64')}`);
    if (imgs.length >= 4) break;          // every provider caps at four views
  }
  if (!imgs.length) { console.log(`- ${it.slug}  no usable photograph`); failed++; continue; }

  const t0 = Date.now();
  try {
    const glb = await gen(imgs, { slug: it.slug });
    writeFileSync(dest, glb);
    manifest[it.slug] = {
      file: `assets/generated/${it.slug}.glb`,
      provider: PROVIDER, views: imgs.length,
      bytes: glb.length, at: new Date().toISOString(),
      fitted: false,          // gen-fit.mjs sets this once it is oriented+scaled
    };
    made++;
    console.log(`✓ ${it.slug.padEnd(46)} ${(glb.length / 1048576).toFixed(1)} MB  ${imgs.length} view(s)  ${Math.round((Date.now() - t0) / 1000)}s`);
  } catch (e) {
    failed++;
    console.log(`✗ ${it.slug.padEnd(46)} ${String(e.message).slice(0, 120)}`);
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
}

console.log(`\nmade ${made} · failed ${failed} · already had ${skipped}`);
console.log(made ? 'next: node tools/gen-fit.mjs   # orient, scale to spec, decimate' : '');
