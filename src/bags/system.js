// BagSystem: equip/remove, bike fixture visibility, and the nudge-shrink-drop
// collision resolver.

import * as THREE from 'three';
import { v3, disposeObject } from '../lib.js';
import { productsForSlot } from '../catalog.js';
import { colorwayFor } from './identity.js';
import { fabricMaterial } from './materials.js';
import { BUILDERS } from './registry.js';
import { RESOLVE, STEP, TOL, boxesOverlap, proxyBoxes } from './resolve.js';
import { SLOTS, productSlotFor } from './slots.js';

// ---- BagSystem -----------------------------------------------------------
export class BagSystem {
  constructor(bike, catalog) {
    this.bike = bike;
    this.catalog = catalog;
    this.equipped = {}; // uiSlot → {brand, product, mesh, basePos, baseScale, proxy}
    this.unfitted = {}; // uiSlot → {brand, product} the resolver could not place
    this._batch = false;
    this._resolving = false;
  }

  equip(uiSlot, brand, product, colorwayIndex = 0) {
    if (!brand || !product || !SLOTS[uiSlot]) return;
    const slotDef = SLOTS[uiSlot];
    this.remove(uiSlot);
    for (const ex of slotDef.excludes) this.remove(ex);
    const builderKey = slotDef.products || uiSlot;
    const builder = BUILDERS[builderKey];
    if (!builder) return;
    const cw = colorwayFor(brand, product, colorwayIndex);
    const main = fabricMaterial(brand.fabricKey, cw.main);
    const accent = fabricMaterial(brand.fabricKey, cw.accent);
    const side = uiSlot.endsWith('L') ? -1 : 1;
    const mesh = builder(product, brand, main, accent, this.bike, side);
    mesh.name = `bag:${uiSlot}`;
    this.bike.anchors[slotDef.anchor].add(mesh);
    this.equipped[uiSlot] = {
      brand, product, mesh, colorwayIndex, colorway: cw,
      basePos: mesh.position.clone(),
      baseScale: mesh.scale.clone(),
      proxy: proxyBoxes(mesh),
    };
    this.updateFixtures();
    if (!this._batch) this.resolveCollisions();
  }

  /** Re-dress an equipped bag in another of its colourways. */
  setColorway(uiSlot, colorwayIndex) {
    const cur = this.equipped[uiSlot];
    if (!cur) return;
    this.equip(uiSlot, cur.brand, cur.product, colorwayIndex);
  }

  /** How many colourways a product offers (1 when the data has none). */
  static colorwayCount(product) {
    const ways = product?.features?.colorways;
    return Array.isArray(ways) && ways.length ? ways.length : 1;
  }

  remove(uiSlot) {
    delete this.unfitted[uiSlot];
    const cur = this.equipped[uiSlot];
    if (!cur) return;
    cur.mesh.parent?.remove(cur.mesh);
    disposeObject(cur.mesh);
    delete this.equipped[uiSlot];
    this.updateFixtures();
    if (!this._batch) this.resolveCollisions();
  }

  clearAll() {
    const wasBatch = this._batch;
    this._batch = true;
    for (const k of Object.keys(this.equipped)) this.remove(k);
    this._batch = wasBatch;
  }

  updateFixtures() {
    const has = (s) => !!this.equipped[s];
    this.bike.rearRack.visible = has('pannierL') || has('pannierR') || has('trunk');
    this.bike.frontRack.visible = has('randobag');
    this.bike.bottles.visible = !has('framebag_full');
    this.adjustBottles();
  }

  /** B-RAD: slide each bottle down its tube until it clears the frame bag. */
  adjustBottles() {
    const mounts = this.bike.bottleMounts;
    if (!mounts) return;
    const fb = this.equipped.framebag_full || this.equipped.framebag_half;
    // reset to stock position first
    for (const key of ['st', 'dt']) {
      this.bike.slideBottle(key, 0);
      mounts[key].group.visible = true;
    }
    if (!fb || this.equipped.framebag_full) return; // full bag hides bottles entirely
    fb.mesh.updateWorldMatrix(true, false);
    const bagBox = new THREE.Box3().setFromObject(fb.mesh);
    for (const key of ['st', 'dt']) {
      const m = mounts[key];
      let ok = false;
      // slide toward the BB in 20mm steps (B-RAD rail travel), up to 140mm
      for (let off = 0; off >= -140; off -= 20) {
        this.bike.slideBottle(key, off);
        m.group.updateWorldMatrix(true, false);
        const bb = new THREE.Box3().setFromObject(m.group);
        if (!bb.intersectsBox(bagBox)) { ok = true; break; }
      }
      if (!ok) {
        this.bike.slideBottle(key, 0);
        m.group.visible = false;
      }
    }
  }

  /** Static bike volumes, in the frame group's millimetre space. */
  _staticColliders() {
    const P = this.bike.points, g = this.bike.geo;
    const R = P.tireR + g.tireWidth / 2;
    const out = [];
    const add = (tag, x0, x1, y0, y1, z0, z1) => {
      out.push({
        tag,
        box: new THREE.Box3(
          new THREE.Vector3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
          new THREE.Vector3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1))
        ),
      });
    };
    // wheels, sliced so bags can nest against the round profile instead of a slab
    for (const a of [P.rearAxle, P.frontAxle]) {
      const N = 9;
      for (let i = 0; i < N; i++) {
        const x0 = a.x - R + (2 * R * i) / N, x1 = a.x - R + (2 * R * (i + 1)) / N;
        const dx = Math.max(Math.abs(x0 - a.x), Math.abs(x1 - a.x));
        const hy = Math.sqrt(Math.max(R * R - dx * dx, 0));
        if (hy < 6) continue;
        add('wheel', x0, x1, a.y - hy, a.y + hy, -25, 25);
      }
    }
    // handlebar: tops across the centre, then hoods + drops on each side
    const bc = P.barCenter, half = g.barWidth / 2;
    add('bars', bc.x - 16, bc.x + 16, bc.y - 16, bc.y + 16, -half - 12, half + 12);
    for (const s of [1, -1]) {
      add('bars', bc.x + 18, bc.x + g.barReach + 45, bc.y - g.barDrop - 22, bc.y + 34,
        s * (half - 14), s * (half + 36));
    }
    // head tube + steerer + stem, sliced along the axis so the frame bag stays clear
    const hd = P.hd;
    for (let i = 0; i < 5; i++) {
      const t0 = -g.spacers + (i / 5) * (g.headTube + g.spacers);
      const t1 = -g.spacers + ((i + 1) / 5) * (g.headTube + g.spacers);
      const c = P.headTop.clone().addScaledVector(v3(hd.x, hd.y, 0), (t0 + t1) / 2);
      const halfLen = Math.abs(t1 - t0) / 2 + 4;
      add('head', c.x - 28, c.x + 28, c.y - halfLen - 20, c.y + halfLen + 20, -30, 30);
    }
    add('stem', P.steererTop.x - 10, bc.x + 12, Math.min(P.steererTop.y, bc.y) - 24, Math.max(P.steererTop.y, bc.y) + 24, -24, 24);
    // fork blades: cargo cages have to stand outboard of these, not just the tyre
    const crown = P.headBottom.clone().addScaledVector(v3(hd.x, hd.y, 0), 20);
    for (const s of [1, -1]) {
      for (let i = 0; i < 4; i++) {
        const a = crown.clone().lerp(P.frontAxle, i / 4);
        const b = crown.clone().lerp(P.frontAxle, (i + 1) / 4);
        const zc = 30 + (48 - 30) * ((i + 0.5) / 4);
        add('fork', Math.min(a.x, b.x) - 14, Math.max(a.x, b.x) + 14, Math.min(a.y, b.y) - 6, Math.max(a.y, b.y) + 6,
          s * 16, s * (zc + 14));
      }
    }
    // saddle shell
    const sx = P.saddlePos.x - 14, sy = P.saddlePos.y + 30;
    add('saddle', sx - g.saddleLength / 2, sx + g.saddleLength / 2, sy - 20, sy + 14, -80, 80);
    add('seatpost', P.seatTop.x - 20, P.saddlePos.x + 20, P.seatTop.y, sy, -18, 18);
    return out;
  }

  /**
   * Nudge, shrink, or drop bags until nothing interpenetrates. Runs after any
   * change to the kit; every bag is reset to its built pose first so repeated
   * equips are idempotent.
   */
  resolveCollisions() {
    if (this._resolving) return;
    this._resolving = true;
    try { this._resolve(); } finally { this._resolving = false; }
  }

  _resolve() {
    const bike = this.bike;
    const F = bike.frameGroup || bike.anchors.framebag?.parent;
    if (!F) return;
    bike.group.updateMatrixWorld(true);
    const toFrame = new THREE.Matrix4().copy(F.matrixWorld).invert();

    this.unfitted = {};
    const slots = Object.keys(this.equipped);
    for (const s of slots) {
      const rec = this.equipped[s];
      rec.mesh.position.copy(rec.basePos);
      rec.mesh.scale.copy(rec.baseScale);
      rec.mesh.visible = true;
    }
    this._staticFixes();

    const statics = this._staticColliders();
    const boxesFor = (rec) => {
      rec.mesh.updateWorldMatrix(true, false);
      const m = new THREE.Matrix4().multiplyMatrices(toFrame, rec.mesh.matrixWorld);
      return rec.proxy.map((b) => {
        const t = b.clone().applyMatrix4(m);
        t.expandByScalar(-TOL);
        return t.isEmpty() ? b.clone().applyMatrix4(m) : t;
      });
    };

    const placed = [];
    const doomed = [];
    slots.sort((a, b) => (RESOLVE[a]?.pri ?? 99) - (RESOLVE[b]?.pri ?? 99));

    for (const slot of slots) {
      const rec = this.equipped[slot];
      const cfg = RESOLVE[slot] || {};
      if (cfg.fixed) { placed.push(boxesFor(rec)); continue; }
      const ignore = cfg.ignore || [];
      const obstacles = statics.filter((c) => !ignore.includes(c.tag)).map((c) => c.box);
      const hits = () => {
        const mine = boxesFor(rec);
        if (boxesOverlap(mine, obstacles)) return true;
        for (const p of placed) if (boxesOverlap(mine, p)) return true;
        return false;
      };

      let ok = !hits();
      const dirs = cfg.dirs || [];
      const max = cfg.max || 0;
      let lastDir = null;
      if (!ok) {
        outer:
        for (const d of dirs) {
          const dir = this._localDir(rec.mesh.parent, F, new THREE.Vector3(d[0], d[1], d[2]).normalize());
          lastDir = dir;
          for (let t = STEP; t <= max + 1e-6; t += STEP) {
            rec.mesh.position.copy(rec.basePos).addScaledVector(dir, t);
            if (!hits()) { ok = true; break outer; }
          }
        }
      }
      if (!ok) {
        // park at full travel on the first escape route, then squeeze
        if (lastDir && dirs.length) {
          const d0 = this._localDir(rec.mesh.parent, F, new THREE.Vector3(...dirs[0]).normalize());
          rec.mesh.position.copy(rec.basePos).addScaledVector(d0, max);
        } else {
          rec.mesh.position.copy(rec.basePos);
        }
        const minS = cfg.minScale ?? 0.8;
        for (let f = 0.92; f >= minS - 1e-6; f *= 0.92) {
          rec.mesh.scale.copy(rec.baseScale).multiplyScalar(f);
          if (!hits()) { ok = true; break; }
        }
      }
      if (!ok) { doomed.push(slot); continue; }
      placed.push(boxesFor(rec));
    }

    for (const slot of doomed) {
      const rec = this.equipped[slot];
      // Drawing a bag that intersects the frame is wrong, but so is deleting it
      // with no trace — the user picked a product and it silently never appeared.
      // Remove the mesh, KEEP the choice, and let the UI say it doesn't fit.
      console.warn(`[bags] does not fit ${slot}: ${rec.brand?.name} ${rec.product?.name} ${rec.product?.size || ''}`);
      rec.mesh.parent?.remove(rec.mesh);
      disposeObject(rec.mesh);
      delete this.equipped[slot];
      this.unfitted[slot] = { brand: rec.brand, product: rec.product, colorwayIndex: rec.colorwayIndex };
    }
    if (doomed.length) this.updateFixtures();
    this._reseatStraps();
  }

  /**
   * Straps that wrap a frame tube are aimed at a fixed point on the bike, not
   * at a fixed spot on the bag — so they are re-aimed once the bag has settled.
   */
  _reseatStraps() {
    const m = new THREE.Matrix4();
    const inv = new THREE.Matrix4();
    const rot = new THREE.Matrix4();
    for (const rec of Object.values(this.equipped)) {
      const fn = rec.mesh.userData.reseat;
      if (!fn) continue;
      rec.mesh.updateMatrix();
      rec.mesh.parent.updateMatrix(); // anchors are direct children of the frame group
      m.multiplyMatrices(rec.mesh.parent.matrix, rec.mesh.matrix);
      inv.copy(m).invert();
      rot.extractRotation(m).invert();
      fn((p) => p.clone().applyMatrix4(inv), (d) => d.clone().applyMatrix4(rot));
    }
  }

  /** Escape vectors are authored in frame space; anchors may be rotated. */
  _localDir(parent, F, dirFrame) {
    const qp = new THREE.Quaternion(), qf = new THREE.Quaternion();
    parent.getWorldQuaternion(qp);
    F.getWorldQuaternion(qf);
    const rel = qf.invert().multiply(qp); // parent orientation relative to F
    return dirFrame.clone().applyQuaternion(rel.invert()).normalize();
  }

  /**
   * Deterministic size caps for pairs that always fight, applied before the
   * generic search so the resolver never has to shrink them blindly.
   */
  _staticFixes() {
    const roll = this.equipped.barroll || this.equipped.barbag;
    const stem = this.equipped.stemL || this.equipped.stemR;
    if (roll && stem && roll.mesh.userData.halfLen) {
      const stemZ = Math.abs(stem.mesh.parent.position.z + stem.mesh.position.z);
      const stemR = stem.mesh.userData.radius || 46;
      const rollBoxMinX = roll.mesh.parent.position.x + roll.mesh.position.x - (roll.mesh.userData.radius || 0);
      const stemMaxX = stem.mesh.parent.position.x + stem.mesh.position.x + stemR;
      if (rollBoxMinX < stemMaxX) { // only bind when they actually share depth
        const allow = Math.max(stemZ - stemR - 15, 60);
        const f = Math.min(1, allow / roll.mesh.userData.halfLen);
        if (f < 1) roll.mesh.scale.z = roll.baseScale.z * f;
      }
    }
    const tt = this.equipped.toptube;
    const pack = this.equipped.seatpack || this.equipped.saddlebag;
    if (tt && pack && tt.mesh.userData.bodyLen) {
      const packNose = pack.mesh.parent.position.x + (pack.mesh.userData.noseX ?? 0);
      const ttFront = tt.mesh.parent.position.x + tt.mesh.position.x + 10;
      const avail = ttFront - (packNose + 25);
      const f = Math.min(1, avail / tt.mesh.userData.bodyLen);
      if (f < 1 && f > 0.4) tt.mesh.scale.x = tt.baseScale.x * f;
    }
  }

  randomKit(seed = (Math.random() * 1e9) | 0) {
    // mulberry32
    let a = seed >>> 0;
    const rnd = () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    this._batch = true;
    this.clearAll();
    const plan = [
      { roll: 0.9, slots: ['seatpack', 'seatpack', 'seatpack', 'saddlebag'] },
      { roll: 0.88, slots: ['barroll', 'barroll', 'barbag', 'randobag'] },
      { roll: 0.75, slots: ['framebag_full', 'framebag_full', 'framebag_half'] },
      { roll: 0.65, slots: ['toptube'] },
      { roll: 0.5, slots: ['stemL'] },
      { roll: 0.5, slots: ['stemR'] },
      { roll: 0.45, slots: ['forkL'] },
      { roll: 0.45, slots: ['forkR'] },
      { roll: 0.2, slots: ['downtube'] },
      { roll: 0.3, slots: ['pannierPair', 'trunk'] },
    ];
    try {
      for (const step of plan) {
        if (rnd() > step.roll) continue;
        const uiSlot = pick(step.slots);
        if (uiSlot === 'pannierPair') {
          const opts = productsForSlot(this.catalog, 'pannier');
          if (opts.length) {
            const o = pick(opts);
            this.equip('pannierL', o.brand, o.product);
            this.equip('pannierR', o.brand, o.product);
          }
          continue;
        }
        const opts = productsForSlot(this.catalog, productSlotFor(uiSlot));
        if (!opts.length) continue;
        const o = pick(opts);
        this.equip(uiSlot, o.brand, o.product);
      }
    } finally {
      this._batch = false;
    }
    this.resolveCollisions();
    return seed;
  }

  fullKit() {
    this._batch = true;
    try {
      for (const uiSlot of ['seatpack', 'barroll', 'framebag_full', 'toptube', 'stemL', 'stemR', 'forkL', 'forkR', 'pannierL', 'pannierR']) {
        const o = productsForSlot(this.catalog, productSlotFor(uiSlot))[0];
        if (o) this.equip(uiSlot, o.brand, o.product);
      }
    } finally {
      this._batch = false;
    }
    this.resolveCollisions();
  }
}
