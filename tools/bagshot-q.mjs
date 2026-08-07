/**
 * Serialising wrapper around tools/bagshot.mjs.
 *
 * Why this exists: every bagshot run launches a headless Chrome that peaks
 * around 0.76 GB. This machine has 8 GB total and the user's own browser
 * routinely holds ~3 GB of it. Three geometry agents each calling bagshot
 * directly is enough to push the box into swap and kill the session — which is
 * exactly what happened on 7 Aug.
 *
 * Agents cannot be trusted to coordinate with each other, so this does not ask
 * them to. Whoever calls it gets a global lock, runs, and releases; everyone
 * else queues. Identical arguments to bagshot.mjs, identical output.
 *
 *   node tools/bagshot-q.mjs --slot seatpack
 *   node tools/bagshot-q.mjs --brand "Apidura" --slot forkbag --no-shots
 *
 * Env:
 *   BAGSHOT_LOCK_TIMEOUT_MS   how long to queue before giving up (default 2h)
 *   BAGSHOT_MIN_FREE_MB       refuse to start below this much free RAM (default 1200)
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = join(root, '.bagshot.lock');
const STALE_MS = 60 * 60 * 1000;                  // a run that long has hung
const TIMEOUT_MS = +(process.env.BAGSHOT_LOCK_TIMEOUT_MS || 2 * 60 * 60 * 1000);
const MIN_FREE_MB = +(process.env.BAGSHOT_MIN_FREE_MB || 1200);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

/** Free + inactive pages, in MB. Inactive counts: macOS reclaims it on demand. */
function freeMB() {
  try {
    const out = execSync('vm_stat', { encoding: 'utf8' });
    const size = +(out.match(/page size of (\d+)/)?.[1] || 4096);
    const pages = (k) => +(out.match(new RegExp(`Pages ${k}:\\s+(\\d+)`))?.[1] || 0);
    return Math.round(((pages('free') + pages('inactive') + pages('speculative')) * size) / 1048576);
  } catch { return Infinity; }
}

function readLock() {
  try { return JSON.parse(readFileSync(join(LOCK, 'owner.json'), 'utf8')); } catch { return null; }
}

async function acquire() {
  const started = Date.now();
  let announced = false;
  for (;;) {
    try {
      mkdirSync(LOCK);                            // atomic: fails if it exists
      writeFileSync(join(LOCK, 'owner.json'),
        JSON.stringify({ pid: process.pid, at: Date.now(), argv: process.argv.slice(2) }));
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    const owner = readLock();
    // break a lock whose owner died, or one that has plainly hung
    if (!owner || (!alive(owner.pid) && owner.pid !== process.pid) || Date.now() - owner.at > STALE_MS) {
      const why = !owner ? 'unreadable' : !alive(owner.pid) ? `owner ${owner.pid} gone` : 'stale';
      console.error(`[bagshot-q] breaking lock (${why})`);
      rmSync(LOCK, { recursive: true, force: true });
      continue;
    }
    if (!announced) {
      const age = Math.round((Date.now() - owner.at) / 1000);
      console.error(`[bagshot-q] waiting — pid ${owner.pid} has been rendering ${age}s (${(owner.argv || []).join(' ')})`);
      announced = true;
    }
    if (Date.now() - started > TIMEOUT_MS) {
      console.error('[bagshot-q] gave up waiting for the render lock');
      process.exit(75);                           // EX_TEMPFAIL
    }
    await sleep(4000);
  }
}

const release = () => { try { rmSync(LOCK, { recursive: true, force: true }); } catch { /* already gone */ } };

await acquire();
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { release(); process.exit(130); });
}
process.on('exit', release);

// Hold the lock while waiting for memory too — starting a second Chrome the
// moment the first one frees its pages is how you thrash.
for (let i = 0; i < 45; i++) {
  const mb = freeMB();
  if (mb >= MIN_FREE_MB) break;
  if (i === 0) console.error(`[bagshot-q] only ${mb} MB free, need ${MIN_FREE_MB} — waiting (close browser tabs to speed this up)`);
  await sleep(4000);
}

const child = spawn(process.execPath, [join(root, 'tools/bagshot.mjs'), ...process.argv.slice(2)],
  { cwd: root, stdio: 'inherit' });
child.on('exit', (code, signal) => { release(); process.exit(signal ? 130 : code ?? 0); });
