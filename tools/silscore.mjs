/**
 * Silhouette score: how well the outline of our render matches the outline of
 * the real product, as a number to drive up.
 *
 *   node tools/silscore.mjs --slot seatpack            # every product in the slot
 *   node tools/silscore.mjs --slot seatpack --traced   # only products with a traced outline
 *   node tools/silscore.mjs --brand Apidura --slot barroll --out shots/sil/after
 *
 * For each product: equip it alone, render ONLY the bag as a white mask with an
 * orthographic camera (side-on for bags that run fore-aft, front-on for bags
 * that run across the bike — the view the maker's photo or drawing was taken
 * from), read the principal axis, and measure half-depth at 40 stations along
 * it, peak-normalised. That is exactly how tools/silhouette.mjs and
 * tools/diagram-outline.mjs measured the maker's outline, so the two profiles
 * are directly comparable:
 *
 *   IoU = Σ min(ours, theirs) / Σ max(ours, theirs)          1.0 = identical
 *
 * plus the rendered aspect (length / max depth) against the truth's, because
 * a correct curve on a sausage twice too long is not a match.
 *   score = IoU × aspectMatch,  aspectMatch = min(a, b) / max(a, b)
 *
 * ORIENTATION. The traced outlines were oriented by an old rule ("the narrow
 * end attaches") that the owner has since contradicted for seat packs, so the
 * IoU is taken as the better of the two directions and reported separately as
 * `reversed`. Which way a bag faces is checked by eye and by the builder's
 * own axis comment, not by this number.
 *
 * Products with no traced outline are scored against their FORM's template
 * (the median of the traced products sharing `geometry.form`), flagged
 * `vs: template`; where no traced product shares the form there is no score.
 *
 * Writes <out>/scores.json and <out>/<slug>.png (mask over truth, for eyes).
 * One headless Chrome, serialised behind the bagshot lock.
 */
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CHROME } from './lib/chrome.mjs';

const root = new URL('../', import.meta.url).pathname;
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const has = (k) => argv.includes(`--${k}`);
const OUT = join(root, arg('out', `shots/sil/${arg('slot') || 'all'}`));
mkdirSync(OUT, { recursive: true });

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const brands = JSON.parse(readFileSync(join(root, 'data/brands.json'), 'utf8'));
const photo = existsSync(join(root, 'data/profiles.json')) ? JSON.parse(readFileSync(join(root, 'data/profiles.json'))) : {};
const drawn = existsSync(join(root, 'data/diagram-profiles.json')) ? JSON.parse(readFileSync(join(root, 'data/diagram-profiles.json'))) : {};
const truthOf = (k) => (drawn[k]?.profile ? { profile: drawn[k].profile, aspect: drawn[k].aspect, kind: 'drawing' }
  : photo[k]?.profile ? { profile: photo[k].profile, aspect: photo[k].aspect, kind: 'photo' } : null);

// UI slot a catalogue slot is drawn in
const UI = { pannier: 'pannierR', stembag: 'stemR', forkbag: 'forkR' };
// bags that run across the bike are photographed and drawn from the front
const FRONT_VIEW = new Set(['barroll', 'barbag', 'barpocket', 'saddlebag', 'randobag', 'trunk']);

const jobs = [];
brands.forEach((b, bi) => b.products.forEach((p, pi) => {
  if (arg('slot') && p.slot !== arg('slot')) return;
  if (arg('brand') && b.name !== arg('brand')) return;
  const key = slug([b.name, p.line, p.name, p.size].filter(Boolean).join(' '));
  const truth = truthOf(key);
  if (has('traced') && !truth) return;
  jobs.push({ bi, pi, key, slot: p.slot, ui: UI[p.slot] || p.slot, form: p.geometry?.form || null, truth, name: [b.name, p.line, p.name, p.size].filter(Boolean).join(' ') });
}));
const limit = +arg('limit', 0);
if (limit) jobs.splice(limit);

// form templates: median of the traced products of each form (any slot)
const templates = {};
{
  const byForm = {};
  brands.forEach((b) => b.products.forEach((p) => {
    const t = truthOf(slug([b.name, p.line, p.name, p.size].filter(Boolean).join(' ')));
    if (!t || !p.geometry?.form) return;
    (byForm[`${p.slot}|${p.geometry.form}`] = byForm[`${p.slot}|${p.geometry.form}`] || []).push(t);
  }));
  for (const [k, list] of Object.entries(byForm)) {
    const n = list[0].profile.length;
    const prof = [];
    for (let i = 0; i < n; i++) { const v = list.map((t) => Math.max(t.profile[i], t.profile[n - 1 - i])).sort((a, c) => a - c); prof.push(v[v.length >> 1]); }
    const asp = list.map((t) => t.aspect).filter(Boolean).sort((a, c) => a - c);
    templates[k] = { profile: prof, aspect: asp[asp.length >> 1] || null, kind: 'template', n: list.length };
  }
}

// ---- the render lock (same as bagshot-q) -----------------------------------------
const LOCK = join(root, '.bagshot.lock');
for (let i = 0; ; i++) {
  try { mkdirSync(LOCK); writeFileSync(join(LOCK, 'owner.json'), JSON.stringify({ pid: process.pid, at: Date.now(), argv })); break; } catch {
    let o = null; try { o = JSON.parse(readFileSync(join(LOCK, 'owner.json'))); } catch { /* */ }
    let alive = false; try { process.kill(o?.pid, 0); alive = true; } catch { /* */ }
    if (!o || !alive) { rmSync(LOCK, { recursive: true, force: true }); continue; }
    if (i === 0) console.error(`[silscore] waiting for the render lock (pid ${o.pid})`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
const release = () => rmSync(LOCK, { recursive: true, force: true });
process.on('exit', release);
process.on('SIGINT', () => { release(); process.exit(130); });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.setViewport({ width: 800, height: 600 });
await page.goto('http://localhost:8735/?shot=1', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.__READY_DONE', { timeout: 120000 });

const results = [];
for (const j of jobs) {
  const m = await page.evaluate(async ({ bi, pi, ui, front }) => {
    const THREE = window.__THREE;
    const brand = app.catalog[bi], product = brand.products[pi];
    app.bags.clearAll();
    app.bags.equip(ui, brand, product, 0);
    const rec = app.bags.equipped[ui];
    if (!rec) return { dropped: true };
    const bag = rec.mesh;
    bag.updateWorldMatrix(true, true);
    // the bag alone, flat white, in a scene of its own
    const scene = new THREE.Scene();
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const clone = bag.clone(true);
    clone.traverse((o) => { if (o.isMesh) { o.material = white; if (o.userData.noCollide && !o.userData.bodyTrim) o.visible = o.userData.keepInMask === true; } });
    bag.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
    scene.add(clone);
    clone.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(clone);
    const c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3());
    const N = 512;
    const half = Math.max(front ? Math.max(s.z, s.y) : Math.max(s.x, s.y), 0.01) * 0.6;
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, -10, 10);
    if (front) cam.position.set(c.x + 1, c.y, c.z); else cam.position.set(c.x, c.y, c.z + 1);
    cam.up.set(0, 1, 0);
    cam.lookAt(c);
    cam.updateProjectionMatrix();
    const rt = new THREE.WebGLRenderTarget(N, N);
    const r = app.renderer;
    const prevBg = scene.background;
    scene.background = new THREE.Color(0x000000);
    r.setRenderTarget(rt);
    r.render(scene, cam);
    const px = new Uint8Array(N * N * 4);
    r.readRenderTargetPixels(rt, 0, 0, N, N, px);
    r.setRenderTarget(null);
    rt.dispose();
    scene.background = prevBg;
    // mask → points
    const pts = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (px[(y * N + x) * 4] > 128) pts.push([x, y]);
    if (pts.length < 50) return { dropped: false, empty: true };
    // principal axis
    let mx = 0, my = 0;
    for (const [x, y] of pts) { mx += x; my += y; }
    mx /= pts.length; my /= pts.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of pts) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ux = Math.cos(ang), uy = Math.sin(ang);
    let t0 = Infinity, t1 = -Infinity;
    const tv = pts.map(([x, y]) => { const t = (x - mx) * ux + (y - my) * uy; const v = -(x - mx) * uy + (y - my) * ux; t0 = Math.min(t0, t); t1 = Math.max(t1, t); return [t, v]; });
    const S = 40, lo = new Array(S).fill(Infinity), hi = new Array(S).fill(-Infinity);
    for (const [t, v] of tv) { const i = Math.min(S - 1, Math.floor(((t - t0) / (t1 - t0 + 1e-6)) * S)); lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v); }
    const prof = lo.map((l, i) => (Number.isFinite(l) ? (hi[i] - l) / 2 : 0));
    const peak = Math.max(...prof) || 1;
    // which end is the mount: the end nearer the anchor (bag local origin)
    const o = new THREE.Vector3(0, 0, 0).applyMatrix4(bag.matrixWorld).project(cam);
    const ox = (o.x * 0.5 + 0.5) * N, oy = (o.y * 0.5 + 0.5) * N;
    const ot = (ox - mx) * ux + (oy - my) * uy;
    const mountFirst = Math.abs(ot - t0) <= Math.abs(ot - t1);
    const out = prof.map((v) => Math.round((v / peak) * 1e4) / 1e4);
    // a small mask image for eyes
    const cv = document.createElement('canvas'); cv.width = cv.height = 160;
    const g = cv.getContext('2d'); const img = g.createImageData(N, N);
    for (let i = 0; i < N * N; i++) { const yy = N - 1 - Math.floor(i / N), xx = i % N; const k = (yy * N + xx) * 4; const on = px[i * 4] > 128; img.data[k] = img.data[k + 1] = img.data[k + 2] = on ? 235 : 20; img.data[k + 3] = 255; }
    const big = document.createElement('canvas'); big.width = big.height = N; big.getContext('2d').putImageData(img, 0, 0);
    g.drawImage(big, 0, 0, 160, 160);
    return { profile: mountFirst ? out : out.slice().reverse(), aspect: (t1 - t0) / (2 * peak), png: cv.toDataURL('image/png') };
  }, { bi: j.bi, pi: j.pi, ui: j.ui, front: FRONT_VIEW.has(j.slot) });

  const truth = j.truth || templates[`${j.slot}|${j.form}`] || null;
  const row = { name: j.name, key: j.key, slot: j.slot, form: j.form, vs: truth?.kind || null };
  if (m.dropped || m.empty) { row.error = m.dropped ? 'dropped' : 'empty mask'; results.push(row); console.log(`✗ ${j.name}: ${row.error}`); continue; }
  if (truth) {
    const iou = (a, b) => { let n = 0, d = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) { n += Math.min(a[i], b[i]); d += Math.max(a[i], b[i]); } return d ? n / d : 0; };
    const f = iou(m.profile, truth.profile), r = iou(m.profile.slice().reverse(), truth.profile);
    const aspM = truth.aspect ? Math.min(m.aspect, truth.aspect) / Math.max(m.aspect, truth.aspect) : 1;
    row.iou = +Math.max(f, r).toFixed(3);
    row.reversed = r > f + 0.02;
    row.aspect = +m.aspect.toFixed(2);
    row.truthAspect = truth.aspect ? +truth.aspect.toFixed(2) : null;
    row.score = +(Math.max(f, r) * aspM).toFixed(3);
  }
  row.profile = m.profile;
  writeFileSync(join(OUT, `${j.key}.png`), Buffer.from(m.png.split(',')[1], 'base64'));
  results.push(row);
  console.log(`${row.score != null ? row.score.toFixed(3) : '  —  '}  ${row.vs ? row.vs.padEnd(8) : 'no truth'} ${j.name}${row.reversed ? '  (reversed)' : ''}`);
}
await browser.close();
const scored = results.filter((r) => r.score != null);
const mean = scored.length ? scored.reduce((a, r) => a + r.score, 0) / scored.length : null;
writeFileSync(join(OUT, 'scores.json'), JSON.stringify({ at: new Date().toISOString(), mean, n: scored.length, results }, null, 1));
console.log(`\n${scored.length} scored · mean ${mean?.toFixed(3) ?? '—'} → ${OUT}/scores.json`);
