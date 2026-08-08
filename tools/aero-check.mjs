// Verifies the aero measurement engine against primitives whose answer is
// arithmetic, not judgement: a 1 m² plate must measure 1.000 m², a 0.5 m sphere
// must measure pi/4, and a plate parked behind another plate must cost nothing.
// None of these depend on a Cd being right — they check that the projection,
// the world-area-per-pixel scale, the yaw camera and the per-part attribution
// are wired up correctly. Exits non-zero on any failure.
//
// Usage: node tools/aero-check.mjs [--base http://localhost:8735]
// Starts its own static server if nothing is listening on the base URL.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : dflt;
};
const BASE = opt('base', 'http://localhost:8735');

// The test primitives are injected here rather than behind a URL param, because
// building them in the app would mean editing main.js. window.app and
// window.__THREE are already exposed for the headless audits.
//
// This runs as an async IIFE that parks its answer on a flag, and the node side
// polls for that flag. `page.evaluate(() => somePromise)` hangs forever if the
// promise never settles, and a WebGL failure inside a dynamic import is exactly
// the kind of thing that never settles.
const BROWSER_SCRIPT = `
window.__AERO_CHECK = { done: false, error: null, tests: [], info: null };
(async () => {
  const out = window.__AERO_CHECK;
  try {
    const { createAeroMeter } = await import('/src/aero/measure.js');
    const model = await import('/src/aero/model.js');
    // The two geometric expectations below are about projected AREA, so they
    // have to carry the same per-yaw Cd correction the engine applies or they
    // would start failing the day model.js exports one. Absent, it is 1.
    const yf = (deg, key) => (typeof model.yawFactor === 'function' ? model.yawFactor(deg, key) : 1);
    const THREE = window.__THREE;
    const app = window.app;
    const deps = { renderer: app.renderer, scene: app.scene };

    // A throwaway rig: any object with { group, wheels } satisfies the meter,
    // and any { mesh } satisfies a bag record — cdOf falls back to the slot's
    // default Cd when the product is null, which is all these need.
    function onPrimitives(build, opts) {
      const group = new THREE.Group();
      const equipped = {};
      const wheels = build(group, equipped) || [];
      const meter = createAeroMeter({ ...deps, bike: { group, wheels }, bags: { equipped } });
      const res = meter.measure(opts);
      meter.dispose();
      group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      return res;
    }
    const asBag = (g, equipped, slot, mesh) => {
      g.add(mesh);
      equipped[slot] = { mesh, product: null, brand: null };
      return mesh;
    };
    const rider = (g, mesh) => {
      const r = new THREE.Group();
      r.name = 'ghostRider';
      r.add(mesh);
      g.add(r);
    };
    const plate = (w, h, x) => {
      // PlaneGeometry lies in XY; rotating it about Y stands it square to the
      // wind, which blows along -X.
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial());
      m.rotation.y = Math.PI / 2;
      m.position.x = x || 0;
      return m;
    };
    const part = (res, key) => res.parts.find((p) => p.key === key) || null;

    // 1. A 1 m² plate dead ahead, inside a group named ghostRider so it is
    //    classified as the rider part and we exercise that code path too.
    //    Also swept to 20 deg, where a flat plate must lose exactly cos(20).
    const r1 = onPrimitives((g) => rider(g, plate(1, 1)), { yaws: [0, 20] });
    const p1 = part(r1, 'rider');
    out.tests.push({ name: '1.000 m² plate, frontal area', got: p1.frontalArea, want: 1, tolPct: 1 });
    out.tests.push({
      name: 'plate CdA = area x Cd',
      got: p1.cda,
      want: p1.frontalArea * p1.cd * yf(0, 'rider'),
      tolPct: 0.01,
    });
    out.tests.push({
      name: 'plate at 20° yaw = cos(20°)',
      got: r1.byYaw[1].cda,
      want: r1.byYaw[0].cda * Math.cos(20 * Math.PI / 180) * (yf(20, 'rider') / yf(0, 'rider')),
      tolPct: 1,
    });

    // 2. A 0.5 m radius sphere: frontal area pi*r^2 = 0.785398 m².
    const r2 = onPrimitives((g) => {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 128, 64), new THREE.MeshStandardMaterial()));
    }, { yaws: [0] });
    out.tests.push({
      name: '0.5 m sphere, frontal area',
      got: part(r2, 'bike').frontalArea,
      want: Math.PI * 0.25,
      tolPct: 1,
    });

    // 3. A 0.5 m plate hiding behind a 1 m plate: it must be attributed nothing,
    //    and must not steal any area from the plate that shields it.
    const r3 = onPrimitives((g) => {
      g.add(plate(1, 1, 0.2));
      const w = new THREE.Group();
      w.add(plate(0.5, 0.5, -0.2));
      g.add(w);
      return [w];
    }, { yaws: [0] });
    out.tests.push({ name: 'shielding plate, frontal area', got: part(r3, 'bike').frontalArea, want: 1, tolPct: 1 });
    out.tests.push({ name: 'body behind body: occluded CdA', got: part(r3, 'wheels').cda, want: 0, abs: 0.0025 });

    // 4. THE REGRESSION. A bag in front of a body must not delete the body: a
    //    bar bag does not remove the rider's chest. The body keeps its full
    //    1.000 m² and the bag is charged on top, so the total can only rise.
    const r4 = onPrimitives((g, eq) => {
      rider(g, plate(1, 1, -0.2));
      asBag(g, eq, 'seatpack', plate(0.5, 0.5, 0.2));
    }, { yaws: [0], resolution: 1024 });
    out.tests.push({ name: 'bag in front: body area undiminished', got: part(r4, 'rider').frontalArea, want: 1, tolPct: 1 });
    out.tests.push({ name: 'bag in front: bag area charged', got: part(r4, 'seatpack').frontalArea, want: 0.25, tolPct: 1 });
    out.tests.push({ name: 'bag in front: no wake area', got: part(r4, 'seatpack').wakeArea, want: 0, abs: 0.0025 });
    out.tests.push({
      name: 'total - baseline = sum of bags',
      got: r4.cdaHeadOn - r4.cdaBaseline,
      want: part(r4, 'seatpack').cda,
      tolPct: 0.01,
    });

    // 5. A bag BEHIND a body is in its wake: still measured at full silhouette,
    //    but flagged as shadowed so model.wakeDiscount can price it. It is not
    //    free, which is what the old single-pass accounting made it.
    const r5 = onPrimitives((g, eq) => {
      rider(g, plate(1, 1, 0.2));
      asBag(g, eq, 'seatpack', plate(0.5, 0.5, -0.2));
    }, { yaws: [0], resolution: 1024 });
    out.tests.push({ name: 'bag in wake: silhouette still measured', got: part(r5, 'seatpack').frontalArea, want: 0.25, tolPct: 1 });
    out.tests.push({ name: 'bag in wake: all of it shadowed', got: part(r5, 'seatpack').wakeArea, want: 0.25, tolPct: 1 });
    out.tests.push({ name: 'bag in wake: body area undiminished', got: part(r5, 'rider').frontalArea, want: 1, tolPct: 1 });

    // 6. Bag-on-bag shielding is real and must survive: a stem bag tucked behind
    //    a bar roll genuinely costs nothing.
    const r6 = onPrimitives((g, eq) => {
      asBag(g, eq, 'barroll', plate(1, 1, 0.2));
      asBag(g, eq, 'seatpack', plate(0.5, 0.5, -0.2));
    }, { yaws: [0], resolution: 1024 });
    out.tests.push({ name: 'bag behind bag: fully shielded', got: part(r6, 'seatpack').frontalArea, want: 0, abs: 0.0025 });
    out.tests.push({ name: 'bag behind bag: shielding bag charged', got: part(r6, 'barroll').frontalArea, want: 1, tolPct: 1 });

    // 6b. A rider faded to invisible is still a body in the airflow. rider.js
    //     clears depthWrite while the ghost is faded out (it has to — GTAO reads
    //     depth through an override material that ignores opacity), and that
    //     silently took the single largest contributor out of the measurement.
    //     Presentation state must never reach the physics.
    const r6b = onPrimitives((g) => {
      const m = plate(1, 1);
      m.material.transparent = true;
      m.material.opacity = 0;
      m.material.depthWrite = false;
      rider(g, m);
    }, { yaws: [0] });
    out.tests.push({ name: 'rider faded to 0 still measured', got: part(r6b, 'rider')?.frontalArea ?? 0, want: 1, tolPct: 1 });

    // 6c. areaRatio must be pure geometry — the TOTAL silhouette ratio, taken
    //     before the wake discount touches anything. Nothing about the totals
    //     would flag it if the discounted area were fed in instead, so this
    //     isolates it.
    //
    //     Two rigs with IDENTICAL geometry and identical bounds, the plates
    //     merely swapped in x: in one the bag sits wholly in the body's wake, in
    //     the other wholly in clean air. The bag's silhouette is the same in
    //     both at every yaw, so its areaRatio must be too, and the ONLY thing
    //     separating the two CdAs is then the wake discount at that angle. Feed
    //     yawFactor the discounted area instead and the discount's ramp with
    //     yaw leaks into the shape term, which breaks this equality by ~8%.
    const wakeRig = (bagX, bodyX) => onPrimitives((g, eq) => {
      rider(g, plate(1, 1, bodyX));
      asBag(g, eq, 'seatpack', plate(0.5, 0.5, bagX));
    }, { yaws: [0, 20], resolution: 1024 });
    const inWake = wakeRig(-0.2, 0.2);
    const clear = wakeRig(0.2, -0.2);
    // The body is the same plate at the same yaw in both rigs, so its own CdA at
    // 20° is identical and computable from what it measured head-on: a flat
    // plate's silhouette ratio is exactly cos(20°).
    const c20 = Math.cos(20 * Math.PI / 180);
    const bodyAt20 = (res) => {
      const b = part(res, 'rider');
      return b.frontalArea * c20 * b.cd * yf(20, 'rider', c20);
    };
    const bagAt20 = (res) => res.byYaw[1].cda - bodyAt20(res);
    const disc20 = typeof model.wakeDiscount === 'function' ? model.wakeDiscount('seatpack', 20) : 1;
    out.tests.push({
      name: 'areaRatio is silhouette, not charged area',
      got: bagAt20(inWake) / bagAt20(clear),
      want: disc20,
      tolPct: 1,
    });

    // 6d. The merge credit — the ONLY term in the whole engine that reduces a
    //     total, so it gets pinned hard. The frame plate sits directly behind the
    //     bag, making the bag-over-frame overlap exactly the bag's own 0.25 m².
    const mergeRig = (slot) => onPrimitives((g, eq) => {
      g.add(plate(1, 1, -0.2));                    // the frame, behind
      asBag(g, eq, slot, plate(0.5, 0.5, 0.2));    // the bag, skinned over it
    }, { yaws: [0], resolution: 1024 });
    const mc = (slot, overlap, bagCda) => (typeof model.mergeCredit === 'function'
      ? model.mergeCredit(slot, overlap, bagCda, model.BODY_CD.bike) : 0);

    const rm = mergeRig('seatpack');
    const pm = part(rm, 'seatpack');
    // Head-on and fully exposed: no wake, areaRatio exactly 1, so the charge
    // before any credit is just area x Cd.
    const grossM = pm.frontalArea * pm.cd;
    out.tests.push({ name: 'merge: frame overlap measured', got: pm.mergeArea, want: 0.25, tolPct: 1 });
    out.tests.push({
      name: 'merge: credit actually applied',
      got: pm.cda,
      want: grossM - mc('seatpack', pm.mergeArea, grossM),
      tolPct: 0.01,
    });
    // A frame bag is priced at a quarter of the frame it wraps, so an uncapped
    // give-back on this overlap would take it well negative. It must stop at 0.
    const pc = part(mergeRig('framebag_full'), 'framebag_full');
    out.tests.push({ name: 'merge: credit stops at zero, never below', got: pc.cda, want: 0, abs: 0.0001 });

    // 7. On the real bike with a full kit, the parts must add up to the whole,
    //    and fitting luggage must never come out as a saving.
    app.bags.fullKit();
    const meter = createAeroMeter({ ...deps, bike: app.bike, bags: app.bags });
    const loaded = meter.measure();
    const isBag = (p) => p.key !== 'bike' && p.key !== 'wheels' && p.key !== 'rider';
    out.tests.push({
      name: 'full kit: parts sum to cdaHeadOn',
      got: loaded.parts.reduce((s, p) => s + p.cda, 0),
      want: loaded.cdaHeadOn,
      tolPct: 1,
    });
    out.tests.push({
      name: 'full kit: parts sum to cdaWeighted',
      got: loaded.parts.reduce((s, p) => s + p.cdaWeighted, 0),
      want: loaded.cdaWeighted,
      tolPct: 1,
    });
    out.tests.push({
      name: 'full kit: loaded - baseline = bags',
      got: loaded.cdaHeadOn - loaded.cdaBaseline,
      want: loaded.parts.filter(isBag).reduce((s, p) => s + p.cda, 0),
      tolPct: 0.01,
    });
    // Stated as a floor rather than an equality: this is the property that was
    // violated, and it must hold for ANY kit, not just this one.
    out.tests.push({
      name: 'full kit: a kit never subtracts drag',
      got: loaded.cdaHeadOn > loaded.cdaBaseline ? 1 : 0,
      want: 1,
      tolPct: 0.01,
    });
    // A full kit fits a full frame bag, which hides both bidons. The bare-state
    // body pass has to fire, or that saving is invisible the way the rack's cost
    // was — the same bug with the sign flipped.
    out.tests.push({
      name: 'full kit: frame bag stows the bottles',
      got: (loaded.parts.find((p) => p.key === 'bottles')?.cda ?? 0) < 0 ? 1 : 0,
      want: 1,
      tolPct: 0.01,
    });
    // A full kit fits panniers, so updateFixtures() raises the rear rack. That
    // rack must be charged to the kit rather than hidden inside the baseline.
    out.tests.push({
      name: 'full kit: rack charged, not baselined',
      got: (loaded.parts.find((p) => p.key === 'racks')?.cda ?? 0) > 0 ? 1 : 0,
      want: 1,
      tolPct: 0.01,
    });

    // 5. The frame-by-frame path must agree with the blocking one, and both must
    //    hand the bike back to the scene it was borrowed from.
    const spread = await meter.measureAsync({ yaws: [0, 10] });
    const blocking = meter.measure({ yaws: [0, 10] });
    out.tests.push({
      name: 'measureAsync agrees with measure',
      got: spread.cdaHeadOn,
      want: blocking.cdaHeadOn,
      tolPct: 0.01,
    });
    out.tests.push({
      name: 'bike restored to the app scene',
      got: app.bike.group.parent === app.scene ? 1 : 0,
      want: 1,
      tolPct: 0.01,
    });

    // Cost of the call index.js makes twice per kit change, with a full kit on
    // (the most parts, so the worst case). The cold number is taken on a meter
    // that has never run, since that one pays for the render target and the id
    // materials; the meter above is warm by this point and would not show it.
    const sweep = { yaws: [0, 5, 10, 15, 20] };
    const cold = createAeroMeter({ ...deps, bike: app.bike, bags: app.bags });
    const tCold = performance.now();
    cold.measure(sweep);
    const coldMs = performance.now() - tCold;
    cold.dispose();

    const runs = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      meter.measure(sweep);
      runs.push(performance.now() - t0);
    }
    const gl = app.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');

    // Informational: the absolute numbers, for a sanity check against the ~0.09
    // m² that a bare bike alone is usually quoted at.
    app.bags.clearAll();
    const bare = meter.measure({ includeRider: false });
    out.info = {
      bare: { cdaHeadOn: bare.cdaHeadOn, cdaWeighted: bare.cdaWeighted, byYaw: bare.byYaw, parts: bare.parts },
      loaded: {
        cdaHeadOn: loaded.cdaHeadOn,
        cdaWeighted: loaded.cdaWeighted,
        cdaBaseline: loaded.cdaBaseline,
        parts: loaded.parts,
      },
      timing: {
        cold: coldMs,
        rest: runs.sort((a, b) => a - b),
        parts: loaded.parts.length,
        gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      },
    };
    meter.dispose();
  } catch (e) {
    out.error = (e && e.stack) || String(e);
  } finally {
    out.done = true;
  }
})();
`;

async function serverUp() {
  try {
    const r = await fetch(BASE, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

let server = null;
if (!(await serverUp())) {
  server = spawn(process.execPath, [new URL('./serve.mjs', import.meta.url).pathname], { stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await serverUp()); i++) await new Promise((r) => setTimeout(r, 150));
  if (!(await serverUp())) {
    console.error(`no server at ${BASE} and could not start one`);
    server.kill();
    process.exit(2);
  }
  console.log(`started a static server at ${BASE}`);
}

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--hide-scrollbars', '--window-size=1024,768'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 768 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
// The console text for a failed fetch does not name the resource, which makes a
// stale 404 impossible to tell apart from a new one. Take the URL from the
// response instead.
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
page.on('requestfailed', (r) => errors.push(`request failed ${r.url()} (${r.failure()?.errorText})`));

let result = null;
let failure = null;
try {
  await page.goto(`${BASE}/?shot=1&env=mountain`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction('window.__READY_DONE === true', { timeout: 20000 });
  await page.evaluate(BROWSER_SCRIPT);
  await page.waitForFunction('window.__AERO_CHECK.done === true', { timeout: 60000, polling: 200 });
  result = await page.evaluate('window.__AERO_CHECK');
} catch (e) {
  failure = String(e);
}
await browser.close();
server?.kill();

if (failure) {
  console.error('aero-check could not run:', failure);
  for (const e of [...new Set(errors)]) console.error(' -', e);
  process.exit(2);
}
if (result.error) {
  console.error('aero-check threw in the page:\n' + result.error);
  process.exit(2);
}

const num = (v, w = 10) => v.toFixed(6).padStart(w);
let failed = 0;
console.log('');
console.log('  measured     expected      err       test');
console.log('  ' + '-'.repeat(74));
for (const t of result.tests) {
  const err = Math.abs(t.got - t.want);
  const ok = t.abs !== undefined ? err <= t.abs : err <= Math.abs(t.want) * (t.tolPct / 100);
  const errText = t.abs !== undefined ? num(err, 9) : (t.want === 0 ? '     n/a ' : ((err / Math.abs(t.want)) * 100).toFixed(3).padStart(7) + '%');
  if (!ok) failed++;
  console.log(`  ${num(t.got)} ${num(t.want, 11)}  ${errText}  ${ok ? 'PASS' : 'FAIL'}  ${t.name}`);
}
console.log('');

const i = result.info;
const table = (parts) => parts
  .filter((p) => p.cda !== 0)
  .sort((a, b) => b.cda - a.cda)
  .map((p) => `      ${p.key.padEnd(14)} Cd ${p.cd.toFixed(2)}  area ${p.frontalArea.toFixed(4)} m²` +
    `  wake ${p.wakeArea.toFixed(4)}  merge ${(p.mergeArea ?? 0).toFixed(4)}  CdA ${p.cda.toFixed(4)} m²`)
  .join('\n');
console.log(`  bare bike, no bags, no rider: CdA ${i.bare.cdaHeadOn.toFixed(4)} m² head-on, ${i.bare.cdaWeighted.toFixed(4)} m² yaw-weighted`);
console.log(table(i.bare.parts));
console.log('      by yaw: ' + i.bare.byYaw.map((y) => `${y.deg}° ${y.cda.toFixed(4)}`).join('   '));
console.log(`\n  full kit: CdA ${i.loaded.cdaHeadOn.toFixed(4)} m² head-on, ${i.loaded.cdaWeighted.toFixed(4)} m² yaw-weighted`);
console.log(`      baseline ${i.loaded.cdaBaseline.toFixed(5)}   loaded ${i.loaded.cdaHeadOn.toFixed(5)}   ` +
  `delta ${(i.loaded.cdaHeadOn - i.loaded.cdaBaseline >= 0 ? '+' : '')}${(i.loaded.cdaHeadOn - i.loaded.cdaBaseline).toFixed(5)}`);
console.log(table(i.loaded.parts));

const t = i.timing;
const med = t.rest[Math.floor(t.rest.length / 2)];
console.log(`\n  measure() cost, 5 yaws, ${t.parts} parts, on ${t.gpu}`);
console.log(`      ${med.toFixed(1)} ms median, ${t.rest[0].toFixed(1)}–${t.rest[t.rest.length - 1].toFixed(1)} ms range` +
  `, ${t.cold.toFixed(1)} ms cold on a fresh meter`);

if (errors.length) {
  console.log('\n  page errors:');
  for (const e of [...new Set(errors)]) console.log('   -', e);
}
console.log(`\n  ${result.tests.length - failed}/${result.tests.length} checks passed\n`);
process.exit(failed ? 1 : 0);
