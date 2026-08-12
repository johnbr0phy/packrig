/**
 * Make the no-build dev entry runnable again.
 *
 * `index.html` resolves modules through an import map, which only understands
 * specifiers it is told about. Since accounts landed, `src/config.js` and
 * friends `import 'firebase/app'`, and the map had no entry for it — so the
 * dev entry died on `Failed to resolve module specifier "firebase/app"` and
 * the only runnable build was the bundled one in `docs/`. Every UI iteration
 * was costing a full `build-pages.mjs`.
 *
 * Mapping the specifier straight at `node_modules/firebase/app/dist/esm/` does
 * not work either: that file re-exports from `@firebase/app`, which pulls
 * `@firebase/util`, `@firebase/component`, `tslib` and a dozen more. An import
 * map would have to enumerate the whole transitive graph by hand and would rot
 * on the next `npm update`.
 *
 * So: bundle each entry point once, into `vendor/`, and map the three
 * specifiers at those files. Unminified — this is the debugging build, and a
 * readable Firebase stack trace is the entire point of running unbundled.
 *
 *   node tools/build-vendor.mjs
 *
 * Re-run after changing the firebase dependency. `vendor/` is gitignored; the
 * deployed build in `docs/` does not use it and bundles firebase itself.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'vendor');
mkdirSync(out, { recursive: true });

/** Keep in step with the `firebase/*` keys in index.html's import map. */
const ENTRIES = ['app', 'auth', 'firestore'];

for (const name of ENTRIES) {
  const file = join(out, `firebase-${name}.js`);
  execFileSync('npx', ['--no-install', 'esbuild', `firebase/${name}`,
    '--bundle', '--format=esm', '--target=es2022', '--outfile=' + file],
  { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  console.log(`   vendor/firebase-${name}.js  ${(statSync(file).size / 1024).toFixed(0)}KB`);
}
console.log('· vendor built — the dev entry (index.html) can boot again');
