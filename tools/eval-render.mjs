/**
 * Render one version of an eval set.
 *
 * Every invocation produces a new immutable run directory. Nothing is ever
 * overwritten, because the whole point is to put v1 next to v2 next to v3 and
 * see what a prompt change did. (EVAL-PLAN.md §7 phase 4, §8)
 *
 *   node tools/eval-render.mjs --set apidura-v1 --label baseline
 *   node tools/eval-render.mjs --set apidura-v1 --label spec-v2
 *
 * Writes evals/runs/<stamp>-<label>/
 *   meta.json    what everything was when this was taken — git sha, catalogue
 *                sha, models sha, spec sha. A score is only comparable to
 *                another score taken with the same everything.
 *   items.json   the set's items PLUS the fidelity record as it stood, so the
 *                UI can diff record-v1 against record-v2 as well as the pixels
 *   shots/<slug>/{side,tq,rear,front}.jpg
 *   report.json  bagshot's measurements: bbox, clearances, dropped flag
 *
 * Renders are serialised through bagshot-q.mjs. That is not optional on an
 * 8 GB machine; see EVAL-PLAN.md §9.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};

const setName = arg('set', 'apidura-v1');
const label = arg('label', 'run');
const setFile = join(root, 'evals/sets', setName + '.json');
if (!existsSync(setFile)) { console.error(`no such set: ${setFile}`); process.exit(2); }
const set = JSON.parse(readFileSync(setFile));

const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);
const shaFile = (p) => (existsSync(join(root, p)) ? sha(readFileSync(join(root, p))) : null);
const shaDir = (d) => {
  const dir = join(root, d);
  const h = createHash('sha256');
  for (const f of readdirSync(dir).sort()) h.update(f).update(readFileSync(join(dir, f)));
  return h.digest('hex').slice(0, 16);
};
const git = (c) => { try { return execSync(c, { cwd: root, encoding: 'utf8' }).trim(); } catch { return null; } };

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const runId = `${stamp}-${label}`;
const runDir = join(root, 'evals/runs', runId);
mkdirSync(join(runDir, 'shots'), { recursive: true });

// The catalogue is what bagshot actually renders from, and apply-models.mjs
// merges the records into it — so a record edit only reaches a render after
// that tool has run. Recording both shas is how a confusing "I fixed it and
// nothing changed" gets diagnosed later.
const meta = {
  run: runId,
  label,
  set: setName,
  set_frozen_at: set.frozen_at,
  started_at: new Date().toISOString(),
  git_sha: git('git rev-parse --short HEAD'),
  git_dirty: !!git('git status --porcelain'),
  git_branch: git('git rev-parse --abbrev-ref HEAD'),
  catalogue_sha: shaFile('data/brands.json'),
  models_sha: shaDir('data/models'),
  spec_sha: sha(Buffer.concat([
    readFileSync(join(root, 'data/models/MODEL-SPEC.md')),
    readFileSync(join(root, 'src/bags/BUILDER-BRIEF.md')),
  ])),
  builders_sha: shaDir('src/bags/builders'),
  // Measured silhouettes are a geometry input now, so a run that differs only
  // by re-measuring must still read as a different render.
  profiles_sha: shaFile('data/profiles.json'),
  render_profile: { viewport: [1100, 820], dsf: 1.5, fmt: 'jpeg', quality: 82,
                    angles: ['side', 'tq', 'rear', 'front'], env: 'lake' },
  items: set.items.length,
};
writeFileSync(join(runDir, 'meta.json'), JSON.stringify(meta, null, 1));

// Snapshot the record alongside the render. When v2 arrives, the UI can show
// what changed in the DATA as well as what changed in the picture — which is
// the difference between "the prompt improved the prose" and "the prompt
// improved the model". (EVAL-PLAN.md §7 phase 4C, step 4)
writeFileSync(join(runDir, 'items.json'), JSON.stringify(set.items, null, 1));

const slugFile = join(runDir, 'slugs.txt');
writeFileSync(slugFile, set.items.map((i) => i.slug).join('\n'));

// The app has to be up for puppeteer to load it.
const serving = await fetch('http://localhost:8735/index.html').then((r) => r.ok).catch(() => false);
let server = null;
if (!serving) {
  console.log('[eval-render] starting tools/serve.mjs on :8735');
  server = spawn(process.execPath, [join(root, 'tools/serve.mjs')], { cwd: root, stdio: 'ignore', detached: false });
  await new Promise((r) => setTimeout(r, 800));
}

console.log(`[eval-render] ${runId} — ${set.items.length} items`);
const t0 = Date.now();
const child = spawn(process.execPath, [
  join(root, 'tools/bagshot-q.mjs'),
  '--slugs', slugFile,
  '--out', join(runDir, 'shots'),
  '--fmt', 'jpeg', '--quality', '82', '--dsf', '1.5', '--glb',
], { cwd: root, stdio: 'inherit' });

const code = await new Promise((r) => child.on('exit', r));
const secs = Math.round((Date.now() - t0) / 1000);
server?.kill();

// Throughput decides how often a full run is affordable, and everything
// downstream is planned around it — so it is recorded, not estimated.
meta.finished_at = new Date().toISOString();
meta.wall_clock_seconds = secs;
meta.seconds_per_item = +(secs / set.items.length).toFixed(1);
meta.bagshot_exit = code;
writeFileSync(join(runDir, 'meta.json'), JSON.stringify(meta, null, 1));

console.log(`\n[eval-render] ${runId} done in ${Math.floor(secs / 60)}m${secs % 60}s (${meta.seconds_per_item}s/item)`);
console.log(`[eval-render] node tools/eval-review.mjs   # then open http://localhost:8736`);
