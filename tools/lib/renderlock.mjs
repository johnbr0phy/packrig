// The render lock shared with bagshot-q: one headless Chrome at a time.
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const LOCK = join(root, '.bagshot.lock');

export async function takeRenderLock(tag, argv = process.argv.slice(2)) {
  for (let i = 0; ; i++) {
    try { mkdirSync(LOCK); writeFileSync(join(LOCK, 'owner.json'), JSON.stringify({ pid: process.pid, at: Date.now(), argv })); break; } catch {
      let o = null; try { o = JSON.parse(readFileSync(join(LOCK, 'owner.json'))); } catch { /* */ }
      let alive = false; try { process.kill(o?.pid, 0); alive = true; } catch { /* */ }
      if (!o || !alive) { rmSync(LOCK, { recursive: true, force: true }); continue; }
      if (i === 0) console.error(`[${tag}] waiting for the render lock (pid ${o.pid})`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  const release = () => rmSync(LOCK, { recursive: true, force: true });
  process.on('exit', release);
  process.on('SIGINT', () => { release(); process.exit(130); });
  return release;
}
