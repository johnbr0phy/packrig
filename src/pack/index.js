/**
 * Packing: the controller. One object, `app.pack`, owns
 *
 *   lib    — MY stuff, persisted: { locker, loadouts[], active, unit }
 *   view   — someone else's packing list I am looking at (a shared link or a
 *            gallery rig), never written into my locker unless I copy it
 *   open   — which bags are open in the scene
 *
 * and recomputes, whenever anything changes, one `state` everybody reads:
 * resolved items, per-bag solver results, totals, balance, warnings. The
 * panel, the bag sheet, the 3D contents and the share link all read that one
 * object, which is how the fill meter and the picture are kept honest with
 * each other.
 *
 * A LOADOUT IS A BIKE PLUS WHERE EVERYTHING GOES. Switching loadouts puts that
 * loadout's bags on the bike; changing bags on the bike updates the active
 * loadout. Signed out, all of it lives in this browser; signed in, it syncs to
 * one Firestore document per person (lockers/{uid}).
 */
import * as THREE from 'three';
import { loadGear } from './gear.js';
import {
  addItem, duplicateLoadout, emptyLocker, emptyLoadout, parsePlace, removeItem, resolveItem, setPlace, unsetPlace,
} from './model.js';
import { solveBag, splitSides, LOAD_LIMIT_KG } from './solver.js';
import { computeTotals, computeBalance } from './totals.js';
import { measureCavity } from './cavity.js';
import { stiffnessOf } from '../bags/identity.js';
import { createPack3D } from './pack3d.js';
import { suggestLayout } from './suggest.js';
import { importSheet, exportSheet } from './sheet.js';
import { adoptPack, loadoutFromPack, packFromLoadout } from './share.js';

const KEY = 'packrig_pack_v1';
export const DEFAULT_BIKE_G = 11000;     // a steel gravel bike of the modelled class
// The racks and cages the bags hang from are luggage too; see DECISIONS §8.
const CARRIER_G = { rearRack: 650, frontRack: 480, forkCage: 110 };

/** The largest box a cavity can take, sorted: [along, across, deep], mm. */
function boxOf(cav) {
  let v = 0, w = 0;
  for (const st of cav.stations) { v = Math.max(v, st.v1 - st.v0); w = Math.max(w, st.w1 - st.w0); }
  return [cav.u1 - cav.u0, v, w].sort((a, b) => b - a);
}

const uidL = () => `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function readLib() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && v.locker && Array.isArray(v.loadouts)) return v;
  } catch { /* private window, blocked storage */ }
  return null;
}

export function initPack(app) {
  const listeners = new Set();
  const scene3d = createPack3D(app);
  let gear = null;
  let lib = readLib() || { v: 1, locker: emptyLocker(), loadouts: [], active: null, unit: 'metric' };
  let view = null;                    // { locker, loadout, name, from }
  const open = new Set();
  const cavCache = new WeakMap();     // bag mesh → { key, cav }
  let applying = false;
  let state = null;
  let saveTimer = null;

  const gearReady = loadGear().then((g) => { gear = g; recompute(); return g; });

  // ---- persistence ------------------------------------------------------------
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(lib)); } catch { /* storage full or blocked */ }
      remote?.push(lib);
    }, 250);
  }
  let remote = null;          // set by attachRemote (Firestore), see store.js

  // ---- loadouts ----------------------------------------------------------------
  const activeLoadout = () => lib.loadouts.find((l) => l.id === lib.active) || null;
  function ensureActive() {
    let lo = activeLoadout();
    if (!lo) {
      lo = { ...emptyLoadout('My loadout'), id: uidL() };
      lib.loadouts.push(lo);
      lib.active = lo.id;
    }
    return lo;
  }
  const bagsOfBike = () => Object.entries(app.bags.equipped).map(([slot, e]) => ({
    slot, brand: e.brand?.name, line: e.product?.line || '', name: e.product?.name, size: e.product?.size || '', cw: e.colorwayIndex || 0,
  }));

  /** What is showing: someone else's list, or my active loadout. */
  function current() {
    if (view) return { locker: view.locker, loadout: view.loadout, mine: false };
    return { locker: lib.locker, loadout: ensureActive(), mine: true };
  }

  // ---- the one recompute --------------------------------------------------------
  function cavityFor(slot) {
    const eq = app.bags.equipped[slot];
    if (!eq) return null;
    const key = `${eq.mesh.scale.x.toFixed(3)},${eq.mesh.scale.y.toFixed(3)},${eq.mesh.scale.z.toFixed(3)},${eq.mesh.position.x.toFixed(1)}`;
    const c = cavCache.get(eq.mesh);
    if (c && c.key === key) return c.cav;
    const cav = measureCavity(eq.mesh, slot, Number(eq.product?.liters) || 1);
    cavCache.set(eq.mesh, { key, cav });
    return cav;
  }

  /** How far a bag's fabric stretches around a hard thing: a moulded shell not at all. */
  function bulgeOf(slot) {
    const s2 = stiffnessOf(app.bags.equipped[slot]?.product);
    return s2 === 'rigid' ? 1.05 : s2 === 'semi' ? 1.25 : 1.5;
  }

  function bagsWeight() {
    let g = 0;
    const list = [];
    for (const [slot, e] of Object.entries(app.bags.equipped)) {
      const w = Number(e.product?.weight_g) || 0;
      g += w;
      list.push({ slot, g: w, est: !['maker', 'retailer', 'review', 'size-interpolated'].includes(e.product?.weight_basis) });
      if (/^fork/.test(slot) && !/cage|system/i.test(`${e.product?.line} ${e.product?.name}`)) g += CARRIER_G.forkCage;
    }
    if (app.bike.rearRack?.visible) g += CARRIER_G.rearRack;
    if (app.bike.frontRack?.visible) g += CARRIER_G.frontRack;
    return { g, list };
  }

  function recompute({ animate = true } = {}) {
    const { locker, loadout, mine } = current();
    const resolved = new Map(locker.items.map((it) => [it.uid, resolveItem(it, gear)]));
    // group in-bag items by slot, keeping the order they were listed in
    const bySlot = {};
    const outside = [];
    const orphans = [];
    for (const it of locker.items) {
      const code = loadout.place?.[it.uid];
      if (code === undefined) continue;
      const p = parsePlace(code);
      if (p.loc === 'bag') {
        if (!app.bags.equipped[p.slot]) { orphans.push({ uid: it.uid, slot: p.slot }); continue; }
        (bySlot[p.slot] = bySlot[p.slot] || []).push({ it: resolved.get(it.uid), side: p.side || null });
      } else if (p.loc === 'lashed' || p.loc === 'dangle') {
        if (!app.bags.equipped[p.slot]) { orphans.push({ uid: it.uid, slot: p.slot }); continue; }
        outside.push({ uid: it.uid, it: resolved.get(it.uid), place: p });
      } else if (p.loc === 'frame') outside.push({ uid: it.uid, it: resolved.get(it.uid), place: p });
    }

    const results = {};
    for (const [slot, list] of Object.entries(bySlot)) {
      const cav = cavityFor(slot);
      if (!cav) continue;
      const sided = list.some((x) => x.side);
      if (sided && /^framebag/.test(slot)) {
        // One bag with two sides: the left takes what is put on the left (up
        // to half the bag), and everything else gets whatever it leaves —
        // not a fixed half each, which refused kit a real bag holds.
        // the left is a side pocket: as wide as its share of the kit, a third
        // to a half of the bag
        const lItems = list.filter((x) => x.side === 'L').map((x) => x.it);
        const lShare = lItems.reduce((a, i) => a + i.litres, 0) / Math.max(list.reduce((a, x) => a + x.it.litres, 0), 0.01);
        const halves = splitSides(cav, Math.min(Math.max(lShare, 0.3), 0.5));
        const L = solveBag({ ...halves.L, litres: cav.litres / 2 }, lItems, { slot: null, bulge: bulgeOf(slot) });
        // the main compartment keeps the bag's full width: a side pocket is a
        // flat sleeve on its face, not half the bag
        const R = solveBag({ ...cav, litres: Math.max(cav.litres - L.fill.usedL, 0.01) }, list.filter((x) => x.side !== 'L').map((x) => x.it), { slot: null, bulge: bulgeOf(slot) });
        const merged = {
          placed: [...L.placed, ...R.placed], overflow: [...L.overflow, ...R.overflow],
          warnings: [], sides: { L: L.fill, R: R.fill },
          fill: {
            usedL: L.fill.usedL + R.fill.usedL, ratedL: cav.litres, frac: (L.fill.usedL + R.fill.usedL) / cav.litres,
            kg: L.fill.kg + R.fill.kg, squeeze: Math.max(L.fill.squeeze, R.fill.squeeze),
          },
        };
        const lim = LOAD_LIMIT_KG[slot];
        if (lim && merged.fill.kg > lim) merged.warnings.push({ kind: 'load', kg: merged.fill.kg, limit: lim });
        if (Math.abs(L.fill.kg - R.fill.kg) > 1.2) merged.warnings.push({ kind: 'sides', L: L.fill.kg, R: R.fill.kg });
        results[slot] = { cav: { ...cav }, halves, ...merged };
      } else {
        results[slot] = { cav, ...solveBag(cav, list.map((x) => x.it), { slot, bulge: bulgeOf(slot) }) };
      }
    }
    // empty bags still have a fill (0) and a rating, for the meters
    for (const [slot, e] of Object.entries(app.bags.equipped)) {
      if (!results[slot]) results[slot] = { cav: null, placed: [], overflow: [], warnings: [], fill: { usedL: 0, ratedL: Number(e.product?.liters) || 0, frac: 0, kg: 0 } };
    }

    // ---- warnings that read the whole loadout -----------------------------------
    const warnings = [];
    for (const [slot, r] of Object.entries(results)) {
      for (const o of r.overflow) warnings.push({ kind: 'overflow', slot, uid: o.uid, reason: o.reason, detail: o });
      for (const w of r.warnings) warnings.push({ ...w, slot });
    }
    for (const o of orphans) warnings.push({ kind: 'nobag', slot: o.slot, uid: o.uid });
    for (const { uid, place } of outside) {
      const it = resolved.get(uid);
      if (place.loc === 'dangle' && it.fragile) warnings.push({ kind: 'fragile-out', uid, slot: place.slot });
    }
    // a phone you cannot reach is a phone you will stop to dig out
    for (const it of locker.items) {
      const r = resolved.get(it.uid);
      const code = loadout.place?.[it.uid];
      if (!code || r.archetype !== 'phone') continue;
      const p = parsePlace(code);
      if (p.loc === 'bag' && ['seatpack', 'saddlebag', 'pannierL', 'pannierR', 'forkL', 'forkR', 'trunk'].includes(p.slot)) warnings.push({ kind: 'buried', uid: it.uid, slot: p.slot });
    }

    const bags = bagsWeight();
    const totals = computeTotals([...resolved.values()], loadout, { bagsG: bags.g, bikeG: DEFAULT_BIKE_G });
    const balance = computeBalanceNow(resolved, results, outside, bags);

    state = { mine, locker, loadout, resolved, results, outside, orphans, warnings, totals, balance, bags, unit: lib.unit, gearReady: !!gear };

    // ---- scene ----------------------------------------------------------------
    for (const slot of [...open]) {
      if (!app.bags.equipped[slot]) { open.delete(slot); scene3d.closeBag(slot, { instant: true }); continue; }
      const r = results[slot];
      if (r?.cav) scene3d.showBag(slot, r.halves ? r.cav : r.cav, r, resolved, { animate });
      else scene3d.showBag(slot, cavityFor(slot), { placed: [] }, resolved, { animate });
    }
    if (showing) {
      scene3d.showOutside(outside);
      scene3d.showCoM(balance?.com || null);
    }
    for (const fn of listeners) fn(state);
    return state;
  }

  /**
   * Point masses in the frame's mm space: bike, bags, and every item that is
   * on the bike. Worn things are not the bike's to carry and are left out.
   */
  function computeBalanceNow(resolved, results, outside, bags) {
    const F = app.bike.frameGroup;
    if (!F) return null;
    F.updateMatrixWorld(true);
    const toF = new THREE.Matrix4().copy(F.matrixWorld).invert();
    const P = app.bike.points;
    const masses = [];
    const bikeG = current().loadout.bike_g || DEFAULT_BIKE_G;
    // wheels at the axles, the rest at the main triangle's centroid
    const wheels = Math.min(3400, bikeG * 0.32);
    masses.push({ g: wheels / 2, x: P.rearAxle.x, y: P.rearAxle.y, z: 0 });
    masses.push({ g: wheels / 2, x: P.frontAxle.x, y: P.frontAxle.y, z: 0 });
    const cx = (0 + P.seatTop.x + P.headTop.x + P.headBottom.x) / 4;
    const cy = (0 + P.seatTop.y + P.headTop.y + P.headBottom.y) / 4;
    masses.push({ g: bikeG - wheels, x: cx, y: cy * 0.8, z: 0 });
    const v = new THREE.Vector3();
    for (const b of bags.list) {
      const e = app.bags.equipped[b.slot];
      const bb = new THREE.Box3().setFromObject(e.mesh).applyMatrix4(toF);
      bb.getCenter(v);
      masses.push({ g: b.g, x: v.x, y: v.y, z: v.z });
    }
    for (const [slot, r] of Object.entries(results)) {
      if (!r.cav || !r.placed.length) continue;
      const e = app.bags.equipped[slot];
      e.mesh.updateWorldMatrix(true, false);
      const cav = r.cav;
      for (const p of r.placed) {
        const it = resolved.get(p.uid);
        const w = cav.toLocal(p.center[0], p.center[1], p.center[2]).applyMatrix4(e.mesh.matrixWorld).applyMatrix4(toF);
        masses.push({ g: it.g, x: w.x, y: w.y, z: w.z });
      }
    }
    for (const { it, place } of outside) {
      let x, y, z = 0;
      if (place.slot) {
        const e = app.bags.equipped[place.slot];
        const bb = new THREE.Box3().setFromObject(e.mesh).applyMatrix4(toF);
        bb.getCenter(v);
        x = v.x; y = place.loc === 'dangle' ? bb.min.y - 60 : bb.max.y + 30; z = v.z;
      } else if (it.archetype === 'bottle') { x = P.seatTop.x * 0.35; y = P.seatTop.y * 0.35; }
      else if (['phone', 'action_camera', 'headlamp'].includes(it.archetype)) { x = P.barCenter.x; y = P.barCenter.y; }
      else { x = P.seatTop.x * 0.5; y = P.seatTop.y * 0.5; }
      masses.push({ g: it.g, x, y, z });
    }
    const ground = P.rearAxle.y - (P.tireR + app.bike.geo.tireWidth / 2);
    return computeBalance(masses, { rearAxleX: P.rearAxle.x, frontAxleX: P.frontAxle.x, groundY: ground });
  }

  // Bags changed on the bike: remember them on the active loadout, re-solve.
  app.bags.onChange(() => {
    if (!applying && !view) {
      const lo = ensureActive();
      lo.rig = { v: 1, env: app.state.env, paint: app.state.paint, size: app.state.size, bags: bagsOfBike() };
      lo.updated = Date.now();
      save();
    }
    queueMicrotask(() => recompute());
  });

  let showing = false;     // is the packing layer visible (Gear mode)?

  const api = {
    get state() { return state || recompute({ animate: false }); },
    get lib() { return lib; },
    get view() { return view; },
    get gear() { return gear; },
    gearReady,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    recompute,
    tick: () => scene3d.tick(),

    // ---- visibility -------------------------------------------------------------
    /** Gear mode on/off: outside items and the CoM marker only show while packing. */
    setShowing(on) {
      showing = !!on;
      if (!showing) { scene3d.clearOutside(); scene3d.showCoM(null); api.closeAll(); }
      recompute();
    },
    get showing() { return showing; },
    openBag(slot) { if (!app.bags.equipped[slot]) return; open.add(slot); recompute(); },
    closeBag(slot) { open.delete(slot); scene3d.closeBag(slot); recompute(); },
    toggleBag(slot) { (open.has(slot) ? api.closeBag : api.openBag)(slot); },
    openAll() { for (const s of Object.keys(app.bags.equipped)) open.add(s); recompute(); },
    closeAll() { for (const s of [...open]) { open.delete(s); scene3d.closeBag(s); } recompute(); },
    isOpen: (slot) => open.has(slot),

    // ---- locker -----------------------------------------------------------------
    /** Add an item to MY locker, and to the active loadout at `code` (default: home). */
    add(fields, code = null) {
      if (view) return null;
      const it = addItem(lib.locker, fields);
      if (code) setPlace(ensureActive(), it.uid, code);
      save(); recompute();
      return it;
    },
    update(uid, fields) {
      const it = lib.locker.items.find((i) => i.uid === uid);
      if (!it) return;
      Object.assign(it, fields);
      save(); recompute();
    },
    remove(uid) { removeItem(lib.locker, uid, lib.loadouts); save(); recompute(); },
    place(uid, code) {
      const { loadout, mine } = current();
      if (!mine) return;
      setPlace(loadout, uid, code);
      save(); recompute();
    },
    unplace(uid) { const { loadout, mine } = current(); if (!mine) return; unsetPlace(loadout, uid); save(); recompute(); },
    setUnit(u) { lib.unit = u === 'imperial' ? 'imperial' : 'metric'; save(); recompute(); },
    setBikeWeight(g) { const lo = ensureActive(); lo.bike_g = g > 0 ? Math.round(g) : undefined; save(); recompute(); },

    /** The person's own bike, for each loadout, so switching puts it back. */
    loadouts: () => lib.loadouts,
    active: () => activeLoadout(),
    switchTo(id) {
      const lo = lib.loadouts.find((l) => l.id === id);
      if (!lo) return;
      view = null;
      lib.active = id;
      applyBikeOf(lo);
      save(); recompute();
    },
    newLoadout(name = 'New loadout', { fromCurrent = true } = {}) {
      const src = activeLoadout();
      const lo = fromCurrent && src ? { ...duplicateLoadout(src, name), id: uidL() } : { ...emptyLoadout(name), id: uidL(), rig: { v: 1, bags: bagsOfBike() } };
      lib.loadouts.push(lo);
      lib.active = lo.id;
      save(); recompute();
      return lo;
    },
    duplicate(id) {
      const src = lib.loadouts.find((l) => l.id === id) || activeLoadout();
      const lo = { ...duplicateLoadout(src), id: uidL() };
      lib.loadouts.splice(lib.loadouts.indexOf(src) + 1, 0, lo);
      lib.active = lo.id;
      save(); recompute();
      return lo;
    },
    rename(id, name) { const lo = lib.loadouts.find((l) => l.id === id); if (lo) { lo.name = name; save(); recompute(); } },
    deleteLoadout(id) {
      const i = lib.loadouts.findIndex((l) => l.id === id);
      if (i < 0) return null;
      const [gone] = lib.loadouts.splice(i, 1);
      if (lib.active === id) lib.active = lib.loadouts[Math.max(0, i - 1)]?.id || null;
      if (lib.active) applyBikeOf(activeLoadout());
      save(); recompute();
      return gone;
    },
    restoreLoadout(lo, at = lib.loadouts.length) { lib.loadouts.splice(at, 0, lo); save(); recompute(); },

    /** Totals + state for any loadout without switching to it (compare view). */
    evaluate(id) {
      const lo = lib.loadouts.find((l) => l.id === id);
      if (!lo) return null;
      const resolved = lib.locker.items.map((it) => resolveItem(it, gear));
      return computeTotals(resolved, lo, { bagsG: lo.id === lib.active ? bagsWeight().g : bagsWeightOfRig(lo.rig), bikeG: DEFAULT_BIKE_G });
    },

    // ---- suggest ------------------------------------------------------------------
    /**
     * Pack everything listed on this loadout into the bags on the bike. `only`
     * limits it to some items (e.g. the ones still at home); placements the
     * person set by hand are kept unless `all` is true.
     */
    suggest({ only = null, all = false } = {}) {
      const { locker, loadout, mine } = current();
      if (!mine) return null;
      const resolved = locker.items.map((it) => resolveItem(it, gear));
      const listed = resolved.filter((r) => loadout.place[r.uid] !== undefined && (!only || only.includes(r.uid)));
      const keep = {};
      if (!all) {
        for (const r of resolved) {
          const code = loadout.place[r.uid];
          if (code && code !== 'home' && (!only || !only.includes(r.uid))) keep[r.uid] = code;
        }
      }
      const bags = Object.entries(app.bags.equipped).filter(([s]) => s !== 'framebag_full' || true).map(([slot, e]) => {
        const cav = cavityFor(slot);
        return { slot, litres: Number(e.product?.liters) || 0, maxLenMm: cav ? cav.u1 - cav.u0 : null, box: cav ? boxOf(cav) : null };
      });
      const res = suggestLayout(listed.filter((r) => !keep[r.uid]), bags, keep);
      for (const [uid, code] of Object.entries(res.place)) setPlace(loadout, uid, code);
      save(); recompute();
      return res;
    },

    // ---- where else could this go -----------------------------------------------
    /** Best alternative bag for an item that won't fit where it is. */
    alternativeFor(uid) {
      const st = api.state;
      const it = st.resolved.get(uid);
      if (!it) return null;
      const bags = Object.entries(st.results).filter(([slot]) => slot !== parsePlace(st.loadout.place[uid]).slot)
        .map(([slot, r]) => ({ slot, litres: Math.max((r.fill.ratedL * 0.92) - r.fill.usedL, 0) / 0.92, maxLenMm: r.cav ? r.cav.u1 - r.cav.u0 : null, box: r.cav ? boxOf(r.cav) : null }));
      const res = suggestLayout([{ ...it, places: it.places }], bags, {});
      const code = res.place[uid];
      return code && code !== 'home' ? code : null;
    },

    // ---- sheets -------------------------------------------------------------------
    async importText(text, { name = 'Imported loadout', asNew = true } = {}) {
      await gearReady;
      const res = importSheet(text, { gear, name });
      // merge the imported items into my locker; the same thing twice is one thing
      const map = {};
      for (const it of res.locker.items) {
        const mine = lib.locker.items.find((m) => (it.ref && m.ref === it.ref && m.name === it.name) || (!it.ref && m.name === it.name));
        if (mine && Math.abs((mine.g ?? 0) - (it.g ?? 0)) < 1) { map[it.uid] = mine.uid; continue; }
        const { uid, ...f } = it;
        map[it.uid] = addItem(lib.locker, f).uid;
      }
      const lo = asNew ? { ...emptyLoadout(name), id: uidL() } : ensureActive();
      for (const [u, code] of Object.entries(res.loadout.place)) lo.place[map[u]] = code;
      if (res.loadout.bike_g) lo.bike_g = res.loadout.bike_g;
      if (res.loadout.bags_g) lo.bags_g = res.loadout.bags_g;
      if (asNew) {
        lo.rig = activeLoadout()?.rig || { v: 1, bags: bagsOfBike() };
        lib.loadouts.push(lo);
        lib.active = lo.id;
      }
      save(); recompute();
      return { ...res, loadout: lo };
    },
    exportText(id = null) {
      const lo = id ? lib.loadouts.find((l) => l.id === id) : current().loadout;
      const { locker } = current();
      return exportSheet({ locker, loadout: lo, resolve: (it) => resolveItem(it, gear), bagsG: lo.bags_g ?? bagsWeight().g });
    },

    // ---- rigs: the v2 `pack` field ---------------------------------------------
    /** For captureRig: the active (or viewed) loadout as a self-contained pack. */
    packForRig() {
      const { locker, loadout } = current();
      return gear || !locker.items.some((i) => i.ref) ? packFromLoadout(locker, loadout, gear) : null;
    },
    /**
     * A rig with a pack arrived (a link, a gallery rig). Show its packing list
     * without touching my locker. `mine` = it came from my own saved rigs.
     */
    async showRigPack(rig, { from = 'link', name = '' } = {}) {
      await gearReady;
      if (!rig?.pack) { view = null; recompute(); return; }
      const { locker, loadout } = loadoutFromPack(rig.pack, gear, rig.name || name);
      view = { locker, loadout, from, name: rig.name || name, rig };
      recompute();
    },
    stopViewing() { view = null; const lo = activeLoadout(); if (lo) applyBikeOf(lo); recompute(); },
    /** Copy what I'm viewing into my locker as a new loadout. */
    copyView() {
      if (!view) return null;
      const { loadout, missing } = adoptPack(lib.locker, view.locker, view.loadout, view.name || 'Copied setup');
      loadout.id = uidL();
      loadout.rig = { v: 1, env: app.state.env, paint: app.state.paint, size: app.state.size, bags: bagsOfBike() };
      lib.loadouts.push(loadout);
      lib.active = loadout.id;
      view = null;
      save(); recompute();
      return { loadout, missing };
    },
    /** Which items in the viewed list I do not own. */
    notOwned() {
      if (!view) return [];
      return view.locker.items.filter((it) => !lib.locker.items.some((m) => (it.ref && m.ref === it.ref) || (!it.ref && m.name?.toLowerCase() === it.name?.toLowerCase()))).map((i) => i.uid);
    },

    attachRemote(r) { remote = r; },
    setApplying(b) { applying = !!b; },
    save,
    /** Replace the library wholesale (remote sync on sign-in). */
    replaceLib(next) { if (next?.locker) { lib = next; save(); recompute(); } },
  };

  function bagsWeightOfRig(rig) {
    let g = 0;
    for (const b of rig?.bags || []) {
      for (const br of app.catalog) {
        if (br.name !== b.brand) continue;
        const p = br.products.find((x) => (x.line || '') === (b.line || '') && x.name === b.name && (x.size || '') === (b.size || ''));
        if (p) { g += Number(p.weight_g) || 0; break; }
      }
    }
    return g;
  }

  function applyBikeOf(lo) {
    if (!lo?.rig?.bags) return;
    applying = true;
    try {
      app.__applyRig?.({ ...lo.rig, pack: undefined });
    } finally { applying = false; }
  }

  app.pack = api;
  return api;
}
