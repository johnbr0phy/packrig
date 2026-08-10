/**
 * The eval: product photograph, two versions, which is better.
 *
 *   node tools/eval-render.mjs --set apidura-v1 --label something   # make runs
 *   node tools/eval-review.mjs                                      # judge them
 *   → http://localhost:8736
 *
 * Blind pairwise, and nothing else. Scoring a bag 1-5 asks a reviewer to hold a
 * scale steady across seventy products; picking the better of two asks a
 * question people are reliably good at, and it is the question that actually
 * matters — is this version better than the last one.
 *
 * Both versions are real geometry, turnable and zoomable, because a still
 * cannot be rotated and the live app can only ever show the CURRENT code. Each
 * run exports a GLB per bag at render time; this serves them.
 *
 * Votes append to evals/labels/pairwise-<who>.jsonl, recording which run was
 * shown on the left so position bias stays auditable rather than assumed away.
 */
import http from 'node:http';
import { readFileSync, appendFileSync, existsSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const PORT = +(arg('port', '8736'));
const WHO = arg('who', 'john');
const RUNS = join(root, 'evals/runs');
const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.avif': 'image/avif', '.glb': 'model/gltf-binary', '.js': 'text/javascript', '.mjs': 'text/javascript',
};

const listRuns = () => (existsSync(RUNS)
  ? readdirSync(RUNS).filter((d) => existsSync(join(RUNS, d, 'meta.json'))).sort()
    .map((d) => ({ id: d, meta: JSON.parse(readFileSync(join(RUNS, d, 'meta.json'))) }))
  : []);

const readVotes = () => {
  const f = join(root, 'evals/labels', `pairwise-${WHO}.jsonl`);
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
};

function build() {
  const runs = listRuns();
  // A per-bag geometry fingerprint, so the page can skip bags that cannot have
  // changed. Only four of thirteen builders have been touched, so most bags are
  // identical between any two runs — and being asked to choose between two
  // identical pictures seventy times is how you lose faith in the tool.
  //
  // Two parts, because profile40 only exists in runs taken after it was added:
  // folding it into one string makes every older run look wholly different.
  const fp = {};
  for (const r of runs) {
    const p = join(RUNS, r.id, 'shots/report.json');
    if (!existsSync(p)) continue;
    fp[r.id] = Object.fromEntries(JSON.parse(readFileSync(p)).map((x) => [x.slug, {
      box: JSON.stringify([x.bbox_body_mm, x.bbox_mm, x.groundClearance_mm, x.dropped]),
      shape: x.profile40 ? JSON.stringify(x.profile40) : null,
    }]));
  }
  const items = runs.length
    ? JSON.parse(readFileSync(join(RUNS, runs[runs.length - 1].id, 'items.json')))
    : [];
  return {
    who: WHO,
    // The geometry fingerprint of the whole run. Two runs that share it cannot
    // differ in the picture, so the page refuses to offer them as a comparison.
    runs: runs.map((r) => ({
      id: r.id, label: r.meta.label, at: r.meta.started_at,
      // Component-wise, not one joined string: profiles_sha was added after
      // some runs were taken, and a missing field must not make an identical
      // pair look different. Compared field by field, absent = don't care.
      geom: { b: r.meta.builders_sha || null, c: r.meta.catalogue_sha || null, p: r.meta.profiles_sha || null },
    })),
    items: items.map((it) => ({
      slug: it.slug, brand: it.brand, line: it.line, name: it.name, size: it.size,
      refs: it.refs.map((r) => r.path), refs_remote: it.refs_remote || [],
    })),
    votes: readVotes(),
    fp,
  };
}

const send = (res, code, type, body) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); res.end(body); };

function serveFile(res, abs) {
  const safe = normalize(abs);
  if (!safe.startsWith(normalize(root)) || !existsSync(safe) || !statSync(safe).isFile()) { send(res, 404, 'text/plain', 'not found'); return; }
  const buf = readFileSync(safe);
  // Sniff, don't trust the extension. Several Apidura "photos" are SVG
  // dimension diagrams saved as .jpg; served as image/jpeg no browser can
  // decode them, and a blank pane reads as a missing reference.
  const head = buf.subarray(0, 300).toString('latin1').trimStart();
  const type = (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg')))
    ? 'image/svg+xml'
    : MIME[extname(safe).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'max-age=3600' });
  res.end(buf);
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');

  if (u.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', PAGE);
  if (u.pathname === '/api/data') return send(res, 200, 'application/json', JSON.stringify(build()));
  if (u.pathname === '/img/ref') return serveFile(res, join(root, u.searchParams.get('p') || ''));

  // The rendered stills. Runs made before the GLB exporter existed have no
  // geometry to turn, and the viewer falls back to these — so dropping this
  // route silently emptied half of every comparison.
  if (u.pathname === '/img/shot') {
    const [run, slug, cam] = ['run', 'slug', 'cam'].map((k) => u.searchParams.get(k) || '');
    const dir = join(RUNS, run, 'shots', slug);
    const f = ['jpg', 'png'].map((e) => join(dir, `${cam}.${e}`)).find(existsSync);
    return f ? serveFile(res, f) : send(res, 404, 'text/plain', 'no shot');
  }

  // three.js for the two viewers. serveFile is already sandboxed to the repo.
  if (u.pathname.startsWith('/node_modules/')) return serveFile(res, join(root, u.pathname));

  // The bag's geometry as it was in that run — the only way to turn a PAST
  // version around, since the live app can only ever show the current code.
  if (u.pathname === '/model') {
    const f = join(RUNS, u.searchParams.get('run') || '', 'shots', u.searchParams.get('slug') || '', 'bag.glb');
    return existsSync(f) ? serveFile(res, f) : send(res, 404, 'text/plain', 'no model');
  }

  if (u.pathname === '/api/vote' && req.method === 'POST') {
    let body = '';
    for await (const c of req) body += c;
    const rec = { ...JSON.parse(body), who: WHO, at: new Date().toISOString() };
    mkdirSync(join(root, 'evals/labels'), { recursive: true });
    appendFileSync(join(root, 'evals/labels', `pairwise-${WHO}.jsonl`), JSON.stringify(rec) + '\n');
    return send(res, 200, 'application/json', '{"ok":true}');
  }

  send(res, 404, 'text/plain', 'not found');
}).listen(PORT, () => {
  const runs = listRuns();
  console.log(`which is better → http://localhost:${PORT}`);
  console.log(runs.length >= 2
    ? `${runs.length} runs · newest ${runs[runs.length - 1].meta.label}`
    : 'need two runs — node tools/eval-render.mjs --set apidura-v1 --label something');
});

// ---- page ----------------------------------------------------------------
const PAGE = String.raw`<!doctype html>
<meta charset="utf-8">
<title>which is better</title>
<script type="importmap">
{ "imports": {
    "three": "/node_modules/three/build/three.module.js",
    "three/addons/": "/node_modules/three/examples/jsm/"
} }
</script>
<style>
  :root{ --bg:#0d0e10; --line:#23262b; --ink:#eceef1; --dim:#878e96; --accent:#7cc4ff; --good:#6ee7a8; }
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;overflow:hidden;background:var(--bg);color:var(--ink);
    font:14px/1.5 ui-sans-serif,-apple-system,"SF Pro Text",Segoe UI,sans-serif}
  body{display:flex;flex-direction:column;height:100vh}

  header{display:flex;gap:16px;align-items:baseline;padding:12px 20px;border-bottom:1px solid var(--line);flex:none}
  .count{font:600 15px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dim);font-variant-numeric:tabular-nums}
  .count b{color:var(--ink)}
  h1{font-size:17px;font-weight:620;margin:0;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sp{flex:1}
  select{background:#1a1d21;color:var(--dim);border:1px solid var(--line);border-radius:6px;
    padding:4px 8px;font:inherit;font-size:12px}
  select:focus-visible{outline:2px solid var(--accent)}

  .stage{flex:1;display:grid;grid-template-columns:minmax(0,0.9fr) minmax(0,1fr) minmax(0,1fr);
    gap:1px;background:var(--line);min-height:0}
  .cell{background:#0a0b0d;display:flex;flex-direction:column;min-height:0;min-width:0;position:relative}
  .view{flex:1;min-height:0;position:relative}
  .view canvas{display:block;width:100%;height:100%}
  /* runs rendered before the GLB export existed have no geometry to turn, so
     they fall back to the still rather than showing an empty box */
  .view img.fallback{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;
    padding:14px;display:none;background:#0a0b0d}
  .view img.fallback.on{display:block}
  .cell img.photo{flex:1;min-height:0;width:100%;object-fit:contain;padding:14px;cursor:zoom-in}
  .tag{position:absolute;top:10px;left:12px;font:600 12px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.1em;text-transform:uppercase;color:var(--dim);pointer-events:none;z-index:2}
  .cell.pick{outline:2px solid var(--accent);outline-offset:-2px}
  .cell.pick .tag{color:var(--accent)}

  /* the choice sits directly under the thing it refers to */
  .under{flex:none;padding:10px;display:flex;gap:8px;align-items:center;justify-content:center;
    border-top:1px solid var(--line);background:#0d0e10;min-height:60px}
  .thumbs{display:flex;gap:5px;overflow-x:auto}
  .thumbs img{height:40px;width:auto;object-fit:contain;border:2px solid transparent;border-radius:3px;
    cursor:pointer;background:#111;flex:none}
  .thumbs img.on{border-color:var(--accent)}
  button{font:inherit;font-weight:600;color:var(--ink);background:#1a1d21;border:1px solid var(--line);
    border-radius:8px;padding:10px 0;cursor:pointer;flex:1}
  button:hover:not(:disabled){border-color:#3d444d}
  button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  button:disabled{opacity:.35;cursor:default}
  button kbd{font:inherit;font-size:11px;color:var(--dim);margin-left:8px}
  .same{background:transparent;border-color:transparent;color:var(--dim);flex:0 0 auto;padding:10px 18px}

  footer{flex:none;display:flex;gap:18px;align-items:center;padding:9px 20px;border-top:1px solid var(--line)}
  .tally{color:var(--dim);font-size:13px;font-variant-numeric:tabular-nums}
  .tally b{color:var(--good)}
  .hint{color:var(--dim);font-size:12px}
  dialog{border:0;background:#000;padding:0;max-width:96vw;max-height:96vh}
  dialog img{max-width:96vw;max-height:96vh;display:block}
  dialog::backdrop{background:#000e}
</style>

<header>
  <span class="count"><b id="idx">–</b> / <span id="tot">–</span></span>
  <h1 id="title">—</h1>
  <span class="sp"></span>
  <span id="scope" class="hint"></span>
  <select id="runA" title="version A"></select>
  <span class="hint">vs</span>
  <select id="runB" title="version B"></select>
  <span id="warn" style="color:#ffb454;font-size:12px;display:none"></span>
</header>

<div class="stage">
  <div class="cell">
    <span class="tag">product</span>
    <img class="photo" id="photo" alt="product photograph">
    <div class="under"><div class="thumbs" id="thumbs"></div></div>
  </div>
  <div class="cell" id="cellL">
    <span class="tag">1</span>
    <div class="view"><canvas id="cvL"></canvas><img class="fallback" id="fbL" alt=""></div>
    <div class="under"><button id="p1">This one<kbd>1</kbd></button></div>
  </div>
  <div class="cell" id="cellR">
    <span class="tag">2</span>
    <div class="view"><canvas id="cvR"></canvas><img class="fallback" id="fbR" alt=""></div>
    <div class="under"><button id="p2">This one<kbd>2</kbd></button><button class="same" id="p3">same<kbd>3</kbd></button></div>
  </div>
</div>

<footer>
  <span class="hint">drag either model to turn both · scroll to zoom · ← → next bag · , . photo</span>
  <span class="sp"></span>
  <span class="tally" id="tally"></span>
</footer>

<dialog id="zoomdlg" onclick="this.close()"><img id="zoomimg" alt=""></dialog>

<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let S = null, i = 0, ph = 0, A = null, B = null, pair = null, list = [];
const $ = (id) => document.getElementById(id);
const item = () => list[i];
const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const labelOf = (id) => (S.runs.find((r) => r.id === id) || {}).label || id;
const zoom = (src) => { if (!src) return; $('zoomimg').src = src; $('zoomdlg').showModal(); };

// ---- two viewers, one camera --------------------------------------------
// Each bag is normalised to a unit sphere at the origin before it is shown, so
// the two panes are framed identically and a size difference cannot masquerade
// as a shape difference. One set of controls drives both cameras: turning one
// model turns the other, which is the only way a side-by-side is a fair test.
const loader = new GLTFLoader();
function makeView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  camera.position.set(1.6, 0.9, 2.2);
  scene.add(new THREE.HemisphereLight(0xdfe6ec, 0x30302c, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.5, 3.5, 2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbfd4e6, 0.7);
  fill.position.set(-2, 0.5, -1.5);
  scene.add(fill);
  const holder = new THREE.Group();
  scene.add(holder);
  return { renderer, scene, camera, holder, canvas };
}
const L = makeView($('cvL')), R = makeView($('cvR'));
const controls = new OrbitControls(L.camera, $('cvL'));
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 0.7; controls.maxDistance = 8;
// Dragging the right pane must feel the same, so it gets its own controls and
// whichever was touched last becomes the master.
const controlsR = new OrbitControls(R.camera, $('cvR'));
controlsR.enableDamping = true; controlsR.dampingFactor = 0.08;
controlsR.minDistance = 0.7; controlsR.maxDistance = 8;
let master = controls;
$('cvL').addEventListener('pointerdown', () => { master = controls; });
$('cvR').addEventListener('pointerdown', () => { master = controlsR; });
$('cvL').addEventListener('wheel', () => { master = controls; }, { passive: true });
$('cvR').addEventListener('wheel', () => { master = controlsR; }, { passive: true });

function load(view, run, slug, fb) {
  view.holder.clear();
  $(fb).classList.remove('on');
  if (!run || !slug) return;
  loader.load('/model?run=' + encodeURIComponent(run) + '&slug=' + encodeURIComponent(slug),
    (gltf) => {
      const obj = gltf.scene;
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) return;
      const c = box.getCenter(new THREE.Vector3());
      const s = box.getSize(new THREE.Vector3());
      const k = 1 / Math.max(s.x, s.y, s.z, 1e-6);
      obj.position.sub(c);
      const wrap = new THREE.Group();
      wrap.add(obj);
      wrap.scale.setScalar(k);
      view.holder.add(wrap);
    },
    undefined,
    () => {
      // No GLB in this run: fall back to the still so the pane is not empty.
      $(fb).src = '/img/shot?run=' + encodeURIComponent(run) + '&slug=' + encodeURIComponent(slug) + '&cam=side';
      $(fb).classList.add('on');
    });
}

function resize(v) {
  const w = v.canvas.clientWidth, h = v.canvas.clientHeight;
  if (!w || !h) return;
  if (v.canvas.width !== w * renderer_dpr() || v.canvas.height !== h * renderer_dpr()) {
    v.renderer.setSize(w, h, false);
    v.camera.aspect = w / h;
    v.camera.updateProjectionMatrix();
  }
}
const renderer_dpr = () => Math.min(devicePixelRatio, 2);

function tick() {
  requestAnimationFrame(tick);
  master.update();
  const follower = master === controls ? controlsR : controls;
  const mCam = master === controls ? L.camera : R.camera;
  const fCam = master === controls ? R.camera : L.camera;
  fCam.position.copy(mCam.position);
  fCam.quaternion.copy(mCam.quaternion);
  follower.target.copy(master.target);
  for (const v of [L, R]) { resize(v); v.renderer.render(v.scene, v.camera); }
}
tick();

// ---- data ----------------------------------------------------------------
async function boot(){
  S = await (await fetch('/api/data')).json();
  if (S.runs.length < 2) {
    document.body.innerHTML = '<p style="padding:48px;color:#878e96">Need two runs to compare.</p>';
    return;
  }
  const last = S.runs[S.runs.length-1];
  B = last.id;
  const differs = S.runs.slice(0, -1).reverse().find((r) => !sameGeom(r.geom, last.geom));
  A = (differs || S.runs[0]).id;
  for (const [el, get] of [['runA', () => A], ['runB', () => B]]) {
    $(el).innerHTML = S.runs.map((r) => '<option value="'+esc(r.id)+'">'+esc(r.label)+'</option>').join('');
    $(el).value = get();
    $(el).onchange = () => { A = $('runA').value; B = $('runB').value; checkSame(); rebuild(); show(); };
  }
  $('p1').onclick = () => vote(1); $('p2').onclick = () => vote(2); $('p3').onclick = () => vote('tie');
  checkSame(); rebuild(); show();
}

// Two runs with the same geometry fingerprint cannot differ in the picture, so
// there is nothing to choose between them and the buttons say so.
// Two fingerprints match if every field they BOTH carry matches. A run taken
// before a field existed cannot disagree about it.
function sameGeom(x, y){
  if (!x || !y) return false;
  for (const k of ['b','c','p']) if (x[k] && y[k] && x[k] !== y[k]) return false;
  return true;
}

function checkSame(){
  const ga = (S.runs.find((r) => r.id === A) || {}).geom;
  const gb = (S.runs.find((r) => r.id === B) || {}).geom;
  const same = sameGeom(ga, gb);
  $('warn').textContent = same ? 'identical geometry — nothing to choose between' : '';
  $('warn').style.display = same ? 'inline' : 'none';
  for (const b of ['p1','p2','p3']) $(b).disabled = same;
}

// Only the bags whose geometry actually differs between the two runs: four of
// thirteen builders have been touched, so most bags are identical in any pair.
function rebuild(){
  const a = S.fp[A] || {}, b = S.fp[B] || {};
  const differs = S.items.filter((it) => {
    const x = a[it.slug], y = b[it.slug];
    if (!x || !y) return false;
    if (x.box !== y.box) return true;
    return !!(x.shape && y.shape && x.shape !== y.shape);
  });
  // Zero differing bags is a fact worth stating. Falling back to all 70 asked
  // for seventy votes on seventy identical pairs, which is worse than useless:
  // it puts noise in the tally and it teaches you to distrust the tool.
  const none = differs.length === 0;
  list = none ? [] : differs;
  $('tot').textContent = list.length;
  $('scope').textContent = none ? 'no bag differs between these two runs'
    : differs.length < S.items.length ? differs.length + ' of ' + S.items.length + ' changed' : '';
  $('scope').style.color = none ? '#ffb454' : '';
  for (const b of ['p1','p2','p3']) $(b).disabled = $(b).disabled || none;
  i = Math.min(i, Math.max(list.length - 1, 0));
}

function show(){
  const it = item();
  if (!it) {
    $('idx').textContent = '0';
    $('title').textContent = 'nothing to compare';
    load(L, null, null, 'fbL'); load(R, null, null, 'fbR');
    $('photo').removeAttribute('src'); $('thumbs').innerHTML = '';
    drawTally();
    return;
  }
  $('idx').textContent = i + 1;
  $('title').textContent = [it.brand, it.line, it.name, it.size].filter(Boolean).join(' ');

  const photos = it.refs.map((p) => '/img/ref?p=' + encodeURIComponent(p)).concat(it.refs_remote);
  ph = Math.min(Math.max(ph, 0), Math.max(0, photos.length-1));
  $('photo').src = photos[ph] || '';
  $('photo').onclick = () => zoom($('photo').src);
  $('thumbs').innerHTML = photos.length > 1
    ? photos.map((p, n) => '<img src="'+p+'" class="'+(n===ph?'on':'')+'" data-n="'+n+'" onerror="this.remove()" alt="">').join('')
    : '';
  $('thumbs').querySelectorAll('img').forEach((el) => el.onclick = () => { ph = +el.dataset.n; show(); });

  // Which version is on the left is decided by the bag's own name: stable if you
  // come back to it, but not a side you can learn. Labels stay hidden.
  const flip = [...it.slug].reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 7) % 2 === 1;
  pair = { left: flip ? B : A, right: flip ? A : B };
  load(L, pair.left, it.slug, 'fbL');
  load(R, pair.right, it.slug, 'fbR');

  const mine = S.votes.filter((v) => v.slug === it.slug && v.a === A && v.b === B);
  const lastV = mine[mine.length-1];
  $('cellL').classList.toggle('pick', !!lastV && lastV.winner === pair.left);
  $('cellR').classList.toggle('pick', !!lastV && lastV.winner === pair.right);
  drawTally();
}

// The only number this page produces: how often each version won, head to head.
function drawTally(){
  const rel = S.votes.filter((v) => v.a === A && v.b === B);
  const wins = (id) => rel.filter((v) => v.winner === id).length;
  const ties = rel.filter((v) => v.winner === 'tie').length;
  if (!rel.length) { $('tally').textContent = 'no votes yet'; return; }
  const a = wins(A), b = wins(B);
  const lead = a === b ? 'level' : (a > b ? labelOf(A) : labelOf(B)) + ' leads';
  $('tally').innerHTML = '<b>' + esc(lead) + '</b> · ' + esc(labelOf(A)) + ' ' + a
    + ' — ' + b + ' ' + esc(labelOf(B)) + (ties ? ' · ' + ties + ' same' : '')
    + ' · ' + rel.length + '/' + list.length;
}

async function vote(which){
  if ($('p1').disabled || !pair) return;
  const winner = which === 'tie' ? 'tie' : (which === 1 ? pair.left : pair.right);
  const body = { slug: item().slug, a: A, b: B, shownLeft: pair.left, winner };
  await fetch('/api/vote', { method: 'POST', body: JSON.stringify(body) });
  S.votes.push({ ...body, who: S.who, at: new Date().toISOString() });
  next(1);
}
function next(d){ if (!list.length) return; i = (i + d + list.length) % list.length; ph = 0; show(); }

document.onkeydown = (e) => {
  if (e.target.tagName === 'SELECT') return;
  const k = e.key;
  if (k === '1' || k === '2') vote(+k);
  else if (k === '3') vote('tie');
  else if (k === 'ArrowRight') next(1);
  else if (k === 'ArrowLeft') next(-1);
  else if (k === ',' || k === '.') { ph += (k === '.' ? 1 : -1); show(); }
  else return;
  e.preventDefault();
};

boot();
</script>`;
