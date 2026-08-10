// Per-product bag inspection: renders ONE bag on an otherwise bare bike from
// several angles and reports how close its geometry comes to every part of the
// bike, in millimetres, with penetrations called out.
//
// This exists because the recurring failure mode in this project is a bag that
// is placed by a hard-coded offset rather than derived from the bike, and the
// only thing that ever caught it was a human looking at a picture. This gives a
// number as well as the picture.
//
//   node tools/bagshot.mjs --brand "Apidura" --name "Saddle Pack" --size 9L
//   node tools/bagshot.mjs --slot seatpack --limit 12
//   node tools/bagshot.mjs --brand Ortlieb            # every Ortlieb product
//   node tools/bagshot.mjs --brand Ortlieb --no-shots # clearance numbers only
//
// Output: shots/bag/<slug>/{side,tq,top,rear,front}.png and report.json,
// plus a summary table on stdout. Exit code 1 if anything penetrates.
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'http://localhost:8735';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = new URL('../', import.meta.url).pathname;

// ---- args ----------------------------------------------------------------
const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const has = (k) => argv.includes(`--${k}`);

const want = {
  brand: arg('brand'),
  line: arg('line'),
  name: arg('name'),
  size: arg('size'),
  slot: arg('slot'),
  limit: parseInt(arg('limit', '0'), 10) || 0,
  shots: !has('no-shots'),
  angles: (arg('angles') || 'side,tq,rear,front').split(','),
  // Output controls, added for the eval harness. Defaults reproduce the
  // original behaviour exactly: shots/bag, PNG, 2x. An eval run keeps every
  // version forever, and a 4 MB PNG x 4 angles x 70 products is 1.1 GB per
  // run — so eval-render.mjs asks for JPEG at 1.5x instead (~100 MB).
  out: arg('out'),
  glb: has('glb'),
  slugs: arg('slugs'),
  fmt: arg('fmt', 'png'),
  quality: parseInt(arg('quality', '82'), 10),
  dsf: parseFloat(arg('dsf', '2')),
};
const OUT_ROOT = want.out ? (want.out.endsWith('/') ? want.out : want.out + '/') : `${root}shots/bag/`;

// Catalogue slot names are not UI slot names — mapping only `pannier` once made
// every fork/stem bag read back as "dropped".
const SLOT_UI = { pannier: 'pannierR', stembag: 'stemR', forkbag: 'forkR' };

// A bag is SUPPOSED to touch what it straps to. Without this the tool flags
// every correctly-mounted seat pack, because its nose grips the seatpost.
// Anything not on a slot's list is a real clash at negative clearance, and no
// slot may ever touch a tyre.
const CONTACT_OK = {
  seatpack:      ['saddle', 'seatpost', 'seat cluster'],
  saddlebag:     ['saddle', 'seatpost', 'seat cluster'],
  barroll:       ['handlebar', 'stem / head'],
  barbag:        ['handlebar', 'stem / head'],
  randobag:      ['handlebar', 'stem / head', 'fork crown'],
  framebag_full: ['top tube', 'down tube', 'seat tube', 'head tube', 'seat cluster', 'crank / BB'],
  framebag_half: ['top tube', 'down tube', 'seat tube', 'head tube', 'seat cluster'],
  toptube:       ['top tube', 'stem / head', 'head tube'],
  toptube_rear:  ['top tube', 'seat tube', 'seat cluster'],
  stembag:       ['handlebar', 'stem / head'],
  forkbag:       ['fork leg', 'fork crown'],
  downtube:      ['down tube', 'crank / BB'],
  pannier:       ['rear hub', 'seatstay', 'chainstay'],
  trunk:         ['seatstay', 'seat cluster', 'rear hub'],
};
// How far a strap may legitimately bite into the thing it wraps.
const CONTACT_DEPTH_MM = 8;
const NEVER_TOUCH = ['front tyre', 'rear tyre'];

function classify(slot, clearance) {
  const ok = CONTACT_OK[slot] || [];
  const clash = [], contact = [], tight = [];
  for (const c of clearance) {
    const allowed = ok.includes(c.part) && !NEVER_TOUCH.includes(c.part);
    // Point-cloud colliders cannot report a negative depth; anything under 3mm
    // from a sampled surface vertex is a touch, not clearance.
    const touching = c.kind === 'cloud' ? c.mm < 3 : c.mm < 0;
    if (touching) {
      if (allowed && c.mm >= -CONTACT_DEPTH_MM) contact.push(c);
      else clash.push(c);
    } else if (c.mm < 10 && !allowed) tight.push(c);
  }
  return { clash, contact, tight };
}

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// An explicit slug list, one per line — how the eval harness asks for exactly
// the frozen set and nothing else, across any number of brands.
const only = want.slugs
  ? new Set(readFileSync(want.slugs, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean))
  : null;

const brands = JSON.parse(readFileSync(root + 'data/brands.json'));
const jobs = [];
brands.forEach((b, bi) => b.products.forEach((p, pi) => {
  if (only && !only.has(slugify([b.name, p.line, p.name, p.size].filter(Boolean).join(' ')))) return;
  if (want.brand && b.name.toLowerCase() !== want.brand.toLowerCase()) return;
  if (want.line && String(p.line || '').toLowerCase() !== want.line.toLowerCase()) return;
  if (want.name && !String(p.name).toLowerCase().includes(want.name.toLowerCase())) return;
  if (want.size && String(p.size || '').toLowerCase() !== want.size.toLowerCase()) return;
  if (want.slot && p.slot !== want.slot) return;
  jobs.push({
    bi, pi, brand: b.name, line: p.line || '', name: p.name, size: p.size || '',
    slot: p.slot, ui: SLOT_UI[p.slot] || p.slot, dims: p.dims_cm, liters: p.liters,
    slug: slugify([b.name, p.line, p.name, p.size].filter(Boolean).join(' ')),
  });
}));
if (!jobs.length) {
  console.error('no products matched. --brand/--line/--name/--size/--slot');
  process.exit(2);
}
const list = want.limit ? jobs.slice(0, want.limit) : jobs;
console.log(`${list.length} product(s)\n`);

// ---- the in-page measurement --------------------------------------------
// Runs inside the browser. Recovers analytic colliders straight from the bike's
// own meshes rather than a hand-maintained table, so it cannot drift out of
// sync with src/bike.js.
function measureInPage(uiSlot) {
  const app = window.app;
  const THREE = window.__THREE;
  if (!app || !app.bags) return { err: 'no app' };
  const rec = app.bags.equipped[uiSlot];
  if (!rec) return { dropped: true, unfitted: !!(app.bags.unfitted || {})[uiSlot] };

  const bike = app.bike;
  const bagRoot = rec.mesh;

  // Landmarks in bike-local mm, used only to give a collider a human name.
  const P = bike.points;
  const g = bike.geo;
  const marks = [
    ['rearAxle', P.rearAxle], ['frontAxle', P.frontAxle],
    ['bb', new THREE.Vector3(0, 0, 0)], ['seatTop', P.seatTop],
    ['headTop', P.headTop], ['headBottom', P.headBottom],
    ['saddle', P.saddlePos], ['bar', P.barCenter],
  ];
  const nameFor = (a, b) => {
    const near = (v) => {
      let best = null, bd = 1e9;
      for (const [n, m] of marks) {
        const d = Math.hypot(v.x - m.x, v.y - m.y);
        if (d < bd) { bd = d; best = n; }
      }
      return bd < 130 ? best : null;
    };
    const na = near(a), nb = near(b);
    const key = [...new Set([na, nb].filter(Boolean))].sort().join('-');
    return ({
      'bb-seatTop': 'seat tube', 'headTop-seatTop': 'top tube',
      'bb-headBottom': 'down tube', 'headBottom-headTop': 'head tube',
      'bb-rearAxle': 'chainstay', 'rearAxle-seatTop': 'seatstay',
      'frontAxle-headBottom': 'fork leg', 'saddle-seatTop': 'seatpost',
      saddle: 'saddle', bar: 'handlebar', bb: 'crank / BB',
      rearAxle: 'rear hub', frontAxle: 'front hub', seatTop: 'seat cluster',
      headTop: 'stem / head', headBottom: 'fork crown',
    })[key] || key || 'unnamed part';
  };

  // Collect colliders from the bike, skipping anything that is itself a bag,
  // plus the ground-shadow planes and the invisible racks.
  const bagObjects = new Set();
  for (const k of Object.keys(app.bags.equipped)) {
    app.bags.equipped[k].mesh.traverse((o) => bagObjects.add(o));
  }
  // Everything below works in the FRAME group's own space, which is millimetres.
  // World space is metres (the frame group is scaled by 0.001), and the bike's
  // landmark points are mm — mixing the two silently reports every distance
  // 1000x too small, which reads as "everything collides".
  bike.group.updateWorldMatrix(true, true);
  bike.frameGroup.updateWorldMatrix(true, true);
  const toLocal = bike.frameGroup.matrixWorld.clone().invert();
  const localMat = (o) => new THREE.Matrix4().multiplyMatrices(toLocal, o.matrixWorld);
  const localBox = (o) => {
    const b = new THREE.Box3().setFromObject(o);
    b.min.applyMatrix4(toLocal);
    b.max.applyMatrix4(toLocal);
    return b;
  };

  const colliders = [];
  const seen = new Set();
  bike.group.traverse((o) => {
    if (!o.isMesh || bagObjects.has(o)) return;
    let p = o.parent, hidden = !o.visible;
    while (p && !hidden) { if (!p.visible) hidden = true; p = p.parent; }
    if (hidden) return;
    const geo = o.geometry;
    const t = geo?.type;
    const par = geo?.parameters || {};
    if (t === 'PlaneGeometry') return;              // contact shadows
    const M = localMat(o);
    const sc = new THREE.Vector3().setFromMatrixScale(M);
    const k = Math.max(sc.x, sc.y, sc.z);
    if (t === 'TorusGeometry' && par.radius * k > 250) {
      // a tyre: treat as a disc of half-thickness par.tube
      const c = new THREE.Vector3().applyMatrix4(M);
      const side = c.x > 0 ? 'front' : 'rear';
      const key = `tyre-${side}`;
      if (seen.has(key)) return; seen.add(key);
      colliders.push({ kind: 'disc', name: `${side} tyre`, c: c.toArray(),
        R: (par.radius + par.tube) * k, half: par.tube * k });
      return;
    }
    if (t === 'CylinderGeometry' && par.height * k > 40) {
      const a = new THREE.Vector3(0, par.height / 2, 0).applyMatrix4(M);
      const b = new THREE.Vector3(0, -par.height / 2, 0).applyMatrix4(M);
      const r = Math.max(par.radiusTop, par.radiusBottom) * k;
      if (r > 60) return;                            // rims / big discs, not tubes
      colliders.push({ kind: 'seg', name: nameFor(a, b), a: a.toArray(), b: b.toArray(), r });
      return;
    }
    // Anything else — curved fork blades (TubeGeometry), the saddle, the bars —
    // becomes a decimated point cloud. An AABB is useless here: a curved fork
    // blade's box spans the whole wheel and reads as a permanent collision.
    if (o.isInstancedMesh) return;                   // spokes; the tyre disc covers that volume
    const pos = geo?.attributes?.position;
    if (!pos) return;
    const box = localBox(o);
    const s = box.getSize(new THREE.Vector3());
    if (s.x < 20 && s.y < 20 && s.z < 20) return;    // bolts, trim, small hardware
    const c = box.getCenter(new THREE.Vector3());
    const step = Math.max(1, Math.floor(pos.count / 260));
    const cloud = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(M);
      cloud.push(v.x, v.y, v.z);
    }
    colliders.push({ kind: 'cloud', name: nameFor(c, c), pts: cloud });
  });

  // Bag surface points, in frame-local mm, decimated so this stays fast.
  //
  // Skip anything flagged `noCollide` — cargo-cage arms, rack hooks, bar
  // standoffs, the straps that wrap a tube. That hardware is SUPPOSED to reach
  // into the bike; it is how the bag attaches. src/bags/resolve.js:59 has always
  // excluded it, and this tool not doing so made every cargo-cage fork bag read
  // as 9mm from the front tyre when what it was measuring was the cage arm
  // reaching for the fork blade.
  const noCollide = (o) => {
    for (let n = o; n; n = n.parent) {
      if (n.userData?.noCollide) return true;
      if (n === bagRoot) break;
    }
    return false;
  };
  const pts = [];
  bagRoot.updateWorldMatrix(true, true);
  bagRoot.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    if (noCollide(o)) return;
    const pos = o.geometry.attributes.position;
    const M = localMat(o);
    const step = Math.max(1, Math.floor(pos.count / 700));
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(M);
      pts.push(v.x, v.y, v.z);
    }
  });
  if (!pts.length) return { err: 'bag has no geometry' };

  const dDisc = (x, y, z, c) => {
    const rad = Math.hypot(x - c.c[0], y - c.c[1]);
    const dr = rad - c.R;                    // outside the rim if > 0
    const dz = Math.abs(z - c.c[2]) - c.half;
    if (dr > 0 && dz > 0) return Math.hypot(dr, dz);
    if (dr > 0) return dr;
    if (dz > 0) return dz;
    return Math.max(dr, dz);                 // inside: negative = penetration
  };
  const dSeg = (x, y, z, c) => {
    const ax = c.a[0], ay = c.a[1], az = c.a[2];
    const bx = c.b[0] - ax, by = c.b[1] - ay, bz = c.b[2] - az;
    const L2 = bx * bx + by * by + bz * bz || 1;
    let t = ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(x - (ax + bx * t), y - (ay + by * t), z - (az + bz * t)) - c.r;
  };
  // Surface-to-surface distance approximated by nearest sampled vertex. It
  // cannot go negative, so a cloud collider reports "touching" (~0) rather than
  // a penetration depth — enough to see that a bag is inside a fork blade.
  const dCloud = (x, y, z, c) => {
    const q = c.pts;
    let best = Infinity;
    for (let i = 0; i < q.length; i += 3) {
      const dx = x - q[i], dy = y - q[i + 1], dz = z - q[i + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  };

  const results = colliders.map((c) => ({ name: c.name, kind: c.kind, min: Infinity }));
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i], y = pts[i + 1], z = pts[i + 2];
    for (let k = 0; k < colliders.length; k++) {
      const c = colliders[k];
      const d = c.kind === 'disc' ? dDisc(x, y, z, c)
        : c.kind === 'seg' ? dSeg(x, y, z, c) : dCloud(x, y, z, c);
      if (d < results[k].min) results[k].min = d;
    }
  }

  // Merge duplicates (both chainstays, both fork legs) to the worst case.
  const byName = new Map();
  for (const r of results) {
    if (!Number.isFinite(r.min)) continue;
    const prev = byName.get(r.name);
    if (!prev || r.min < prev.min) byName.set(r.name, r);
  }

  // The bag's own side-elevation profile, measured exactly the way
  // tools/silhouette.mjs measures the product photograph: principal axis of the
  // silhouette, then the perpendicular half-extent at 40 stations, peak
  // normalised. That makes the two directly comparable, so the harness can
  // score the one thing every other gate is blind to — does this look like the
  // shape in the photo. `pts` is already hardware-free, which matches the way
  // the photo measurement drops strap spikes.
  const NST = 40;
  const profile40 = (() => {
    let mx = 0, my = 0, k = 0;
    for (let i = 0; i < pts.length; i += 3) { mx += pts[i]; my += pts[i + 1]; k++; }
    if (!k) return null;
    mx /= k; my /= k;
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < pts.length; i += 3) {
      const dx = pts[i] - mx, dy = pts[i + 1] - my;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    const th = 0.5 * Math.atan2(2 * (sxy / k), sxx / k - syy / k);
    const ux = Math.cos(th), uy = Math.sin(th), vx = -uy, vy = ux;
    let uMin = Infinity, uMax = -Infinity;
    for (let i = 0; i < pts.length; i += 3) {
      const u = (pts[i] - mx) * ux + (pts[i + 1] - my) * uy;
      if (u < uMin) uMin = u; if (u > uMax) uMax = u;
    }
    const L = uMax - uMin;
    if (!(L > 1)) return null;
    const lo = new Array(NST).fill(Infinity), hi = new Array(NST).fill(-Infinity);
    for (let i = 0; i < pts.length; i += 3) {
      const dx = pts[i] - mx, dy = pts[i + 1] - my;
      const u = dx * ux + dy * uy, v = dx * vx + dy * vy;
      let s = Math.floor(((u - uMin) / L) * NST);
      if (s < 0) s = 0; if (s >= NST) s = NST - 1;
      if (v < lo[s]) lo[s] = v;
      if (v > hi[s]) hi[s] = v;
    }
    const half = lo.map((l, s) => (Number.isFinite(l) ? (hi[s] - l) / 2 : 0));
    const peak = Math.max(...half);
    if (!(peak > 0)) return null;
    const norm = half.map((h) => +(h / peak).toFixed(4));
    // Orient MOUNTING END FIRST, decided by where the bag actually hangs.
    //
    // This used to put the NARROW end first, matching how the reference
    // profiles were oriented. That made the IoU score structurally unable to
    // see a bag drawn back to front: reversing the geometry also reverses
    // which end the rule picks, so the two profiles line up again and the
    // score is unchanged. It is not a small blind spot — when v3 reversed the
    // taper on all eleven seat packs, this metric rated them 0.862, the
    // highest of any slot in the catalogue, while a critic scored the same
    // bags 1 and 2 out of 5.
    //
    // The mount is the fixed fact: the bag's parent IS its anchor, so project
    // the anchor onto the principal axis and start from whichever end it sits
    // nearer. Now a reversed bag scores badly, which is the entire point of
    // having the metric.
    const anchorWorld = new THREE.Vector3();
    (bagRoot.parent || bagRoot).getWorldPosition(anchorWorld);
    const aL = anchorWorld.applyMatrix4(toLocal);
    const uA = (aL.x - mx) * ux + (aL.y - my) * uy;
    if (Math.abs(uA - uMax) < Math.abs(uA - uMin)) norm.reverse();
    return norm;
  })();

  const box = localBox(bagRoot);
  const size = box.getSize(new THREE.Vector3());

  // The same box over the BODY only — no straps, buckles or cage arms. Those
  // stand off the bag by design and wrap the frame, so including them inflates
  // width by tens of percent on every slot at once, which reads as a builder
  // fault when it is the measurement. `pts` is already hardware-free.
  const bodyBox = new THREE.Box3();
  for (let i = 0; i < pts.length; i += 3) bodyBox.expandByPoint(new THREE.Vector3(pts[i], pts[i + 1], pts[i + 2]));
  const bodySize = bodyBox.getSize(new THREE.Vector3());
  const groundY = P.rearAxle.y - (P.tireR + g.tireWidth / 2);
  return {
    dropped: false,
    samples: pts.length / 3,
    bbox_mm: { x: +size.x.toFixed(1), y: +size.y.toFixed(1), z: +size.z.toFixed(1) },
    bbox_body_mm: { x: +bodySize.x.toFixed(1), y: +bodySize.y.toFixed(1), z: +bodySize.z.toFixed(1) },
    profile40,
    frame_min: box.min.toArray().map((n) => +n.toFixed(1)),
    frame_max: box.max.toArray().map((n) => +n.toFixed(1)),
    groundClearance_mm: +(box.min.y - groundY).toFixed(1),
    clearance: [...byName.values()]
      .map((r) => ({ part: r.name, mm: +r.min.toFixed(1), kind: r.kind }))
      .sort((a, b) => a.mm - b.mm),
  };
}

/**
 * Export the equipped bag as a GLB, base64'd back to Node.
 *
 * A still cannot be rotated, and the live app can only ever show the CURRENT
 * code — so comparing two past versions in 3D needs the geometry of each one
 * frozen at render time. This is that. Only the bag: the bike is identical in
 * every run and would triple the file for nothing.
 */
async function exportInPage(uiSlot) {
  const app = window.app;
  const rec = app?.bags?.equipped?.[uiSlot];
  if (!rec?.mesh) return null;
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  return new Promise((resolve) => {
    new GLTFExporter().parse(rec.mesh, (buf) => {
      const bytes = new Uint8Array(buf);
      let s = '';
      // Chunked: String.fromCharCode(...bytes) blows the argument limit on
      // anything over ~100k, which is most of these.
      for (let i = 0; i < bytes.length; i += 8192) {
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      }
      resolve(btoa(s));
    }, () => resolve(null), { binary: true, onlyVisible: true });
  });
}

// ---- drive ---------------------------------------------------------------
const launch = () => puppeteer.launch({ executablePath: CHROME, headless: true,
  args: ['--hide-scrollbars'] });
let browser = await launch();
let page = await browser.newPage();
await page.setViewport({ width: 1100, height: 820, deviceScaleFactor: want.dsf });

const report = [];
let bad = 0;
let n = 0;
for (const j of list) {
  // Chrome starts refusing WebGL contexts after a couple of hundred loads.
  if (n && n % 50 === 0) {
    await browser.close().catch(() => {});
    browser = await launch();
    page = await browser.newPage();
    await page.setViewport({ width: 1100, height: 820, deviceScaleFactor: want.dsf });
  }
  n++;
  const errs = [];
  const onErr = (e) => errs.push(String(e.message || e).slice(0, 160));
  page.on('pageerror', onErr);
  const dir = `${OUT_ROOT}${j.slug}`;
  let res;
  try {
    const angles = want.shots ? want.angles : ['side'];
    for (let ai = 0; ai < angles.length; ai++) {
      const cam = angles[ai];
      const url = `${BASE}/?shot=1&kit=${j.ui}:${j.bi}:${j.pi}&cam=${cam}&focus=${j.ui}&env=lake`;
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 25000 });
      await page.waitForFunction('window.__READY_DONE === true', { timeout: 12000 }).catch(() => {});
      if (ai === 0) {
        res = await page.evaluate(measureInPage, j.ui);
        if (want.glb) {
          const b64 = await page.evaluate(exportInPage, j.ui).catch(() => null);
          if (b64) { mkdirSync(dir, { recursive: true }); writeFileSync(`${dir}/bag.glb`, Buffer.from(b64, 'base64')); }
        }
      }
      if (want.shots) {
        mkdirSync(dir, { recursive: true });
        await page.screenshot(want.fmt === 'jpeg'
          ? { path: `${dir}/${cam}.jpg`, type: 'jpeg', quality: want.quality }
          : { path: `${dir}/${cam}.png` });
      }
    }
  } catch (e) {
    res = { err: String(e.message).slice(0, 120) };
    await browser.close().catch(() => {});
    browser = await launch();
    page = await browser.newPage();
    await page.setViewport({ width: 1100, height: 820, deviceScaleFactor: want.dsf });
  }
  page.off('pageerror', onErr);

  const rec = { ...j, ...res, pageErrors: errs };
  report.push(rec);

  const label = `${j.brand} ${j.line} ${j.name} ${j.size}`.replace(/\s+/g, ' ').trim();
  if (res?.err || res?.dropped) {
    bad++;
    console.log(`✗ ${label}\n    ${res.err || (res.unfitted ? 'DROPPED — resolver could not place it' : 'DROPPED')}`);
    continue;
  }
  const { clash, contact, tight } = classify(j.slot, res.clearance);
  rec.clash = clash;
  const d = j.dims || {};
  const bb = res.bbox_mm;
  console.log(`${clash.length ? '✗' : tight.length ? '!' : '✓'} ${label}  [${j.slot}]`);
  console.log(`    spec ${d.len ?? '?'}×${d.wid ?? '?'}×${d.hgt ?? '?'} cm   rendered ${(bb.x / 10).toFixed(1)}×${(bb.z / 10).toFixed(1)}×${(bb.y / 10).toFixed(1)} cm (fore-aft × across × tall)   ground ${(res.groundClearance_mm / 10).toFixed(1)} cm`);
  if (clash.length) {
    bad++;
    console.log(`    CLASH: ${clash.map((c) => `${c.part} ${c.mm}mm`).join(', ')}`);
  }
  if (contact.length) console.log(`    mounts on: ${contact.map((c) => `${c.part} ${c.mm}mm`).join(', ')}`);
  if (tight.length) console.log(`    tight: ${tight.map((c) => `${c.part} ${c.mm}mm`).join(', ')}`);
  const clear = res.clearance.filter((c) => c.mm >= 10).slice(0, 3);
  if (clear.length) console.log(`    nearest clear: ${clear.map((c) => `${c.part} ${c.mm}mm`).join(', ')}`);
  if (errs.length) console.log(`    page errors: ${errs[0]}`);
}

mkdirSync(OUT_ROOT, { recursive: true });
const outPath = `${OUT_ROOT}report.json`;
writeFileSync(outPath, JSON.stringify(report, null, 1));
await browser.close();
console.log(`\n${list.length - bad}/${list.length} clean · report → ${outPath}`);
if (want.shots) console.log(`images → ${OUT_ROOT}<slug>/{${want.angles.join(',')}}.${want.fmt === 'jpeg' ? 'jpg' : 'png'}`);
process.exit(bad ? 1 : 0);
