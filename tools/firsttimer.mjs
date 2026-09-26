/**
 * The honest first-timer pass: a fresh, signed-out visitor on a phone and a
 * desktop picks a bike, puts three bags on it, packs a tent, a mat, a stove
 * and a rain jacket, sees where each went and whether it fits, and shares
 * the result, using only what is on screen.
 *
 *   node tools/firsttimer.mjs [--flows before]
 *
 * The flow and its checks live in tools/lib/flows-after.mjs (and the UI as
 * it was in flows-before.mjs); tools/tasks.mjs runs it, counts every tap and
 * notes every hesitation. The target is 12 taps or fewer on a phone.
 */
import { spawnSync } from 'node:child_process';
const set = process.argv.includes('--flows') ? process.argv[process.argv.indexOf('--flows') + 1] : 'after';
const r = spawnSync(process.execPath, [new URL('./tasks.mjs', import.meta.url).pathname, '--flows', set, '--only', 'firsttimer'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
