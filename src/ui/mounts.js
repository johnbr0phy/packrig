/**
 * Mount rings: where a bag goes is chosen ON the bike.
 *
 * DESIGN-SYSTEM principle 7: if it can be pointed at, it is pointed at. An
 * empty bike shows a pulsing ring at every place a bag can go; "Add a bag"
 * shows them again. Tapping a ring opens that place's catalogue directly.
 * Mounts that share a spot (a bar roll, a bar bag and a rando bag all hang
 * from the bars) share one ring, and the catalogue offers the choice between
 * them as chips, so the bike never grows a cluster of overlapping targets.
 *
 * The rings are real buttons, so Tab reaches them and a screen reader reads
 * "Seat pack, 78 bags". The list in the mount sheet (openMountList) is the
 * same choice for anyone who would rather read than point.
 */
import * as THREE from 'three';
import { SLOTS, productSlotFor } from '../bags.js';
import { productsForSlot } from '../catalog.js';
import { willFit } from '../bags/fit.js';

/** Places on the bike, each with the mounts that share it (first is the default). */
export const PLACES = [
  { id: 'seat', label: 'Seat pack', slots: ['seatpack', 'saddlebag'] },
  { id: 'bar', label: 'Handlebar', slots: ['barroll', 'barbag', 'randobag'] },
  { id: 'frame', label: 'Frame bag', slots: ['framebag_half', 'framebag_full'] },
  { id: 'toptube', label: 'Top tube', slots: ['toptube'] },
  { id: 'fork', label: 'Fork', slots: ['forkR', 'forkL'] },
  { id: 'stem', label: 'Stem', slots: ['stemR', 'stemL'] },
  { id: 'downtube', label: 'Down tube', slots: ['downtube'] },
  { id: 'ttrear', label: 'Rear top tube', slots: ['toptube_rear'] },
  { id: 'rack', label: 'Rear rack', slots: ['pannierR', 'pannierL', 'trunk'] },
  { id: 'pocket', label: 'Front pocket', slots: ['barpocket'] },
];
/** The order a first build fills places in: what nearly every overnighter uses. */
export const BUILD_ORDER = ['seatpack', 'barroll', 'framebag_half', 'toptube', 'forkR', 'stemR'];

export const placeOf = (slot) => PLACES.find((p) => p.slots.includes(slot)) || null;

export function initMounts(app, { onPick } = {}) {
  const layer = document.createElement('div');
  layer.className = 'mounts';
  layer.setAttribute('aria-label', 'Places for a bag');
  document.getElementById('ui-root').append(layer);
  const v = new THREE.Vector3();
  const rings = new Map();   // place id -> { el, slot }
  let mode = 'off';          // off | empty | add
  let active = null;         // place id the catalogue is showing

  const counts = new Map();
  function countFor(slot) {
    if (!counts.has(slot)) {
      counts.set(slot, productsForSlot(app.catalog, productSlotFor(slot)).filter((o) => willFit(slot, o.product, app.bike)).length);
    }
    return counts.get(slot);
  }

  /** The mount a place's ring stands for right now, or null if it is full. */
  function slotFor(place) {
    const eq = app.bags.equipped;
    if (place.id === 'pocket' && !eq.barroll && !eq.barbag) return null;
    if (place.slots.some((s) => eq[s] && !['forkR', 'forkL', 'stemR', 'stemL', 'pannierR', 'pannierL'].includes(s))) return null;
    const free = place.slots.find((s) => !eq[s] && countFor(s) > 0);
    return free || null;
  }

  function build() {
    layer.replaceChildren();
    rings.clear();
    for (const place of PLACES) {
      const slot = slotFor(place);
      if (!slot) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mount-ring';
      const n = countFor(slot);
      b.setAttribute('aria-label', `${place.label}: ${n} bags`);
      const tip = document.createElement('span');
      tip.className = 'mount-tip';
      tip.textContent = place.label;
      b.append(tip);
      b.onclick = () => { active = place.id; paintActive(); onPick?.(slot, place); };
      layer.append(b);
      rings.set(place.id, { el: b, slot, place, x: -1, y: -1 });
    }
    paintActive();
  }
  function paintActive() {
    for (const [id, r] of rings) r.el.classList.toggle('is-active', id === active);
  }

  function anchorWorld(slot) {
    const a = app.bike.anchors[SLOTS[slot]?.anchor];
    if (!a) return null;
    a.getWorldPosition(v);
    // lift the fork, stem and pannier rings to the drive side the camera sees
    return v;
  }

  function tick() {
    if (mode === 'off' || !rings.size) return;
    const W = innerWidth, H = innerHeight;
    const free = app.framing?.freeRect?.() || { left: 0, right: W, top: 0, bottom: H };
    const pts = [];
    for (const r of rings.values()) {
      const p = anchorWorld(r.slot);
      if (!p) { r.el.hidden = true; continue; }
      p.project(app.camera);
      pts.push({ r, x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H, z: p.z });
    }
    // rings that land on each other get pushed apart: two 44px targets may
    // touch but never overlap
    const MIN = 46;
    for (let k = 0; k < 6; k++) {
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d >= MIN) continue;
          if (d < 0.01) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
          const push = (MIN - d) / 2;
          a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push;
        }
      }
    }
    for (const { r, x: fx, y: fy, z } of pts) {
      const x = Math.round(fx), y = Math.round(fy);
      const out = z > 1 || x < free.left - 12 || x > free.right + 12 || y < free.top || y > free.bottom + 12;
      r.el.hidden = out;
      if (x !== r.x || y !== r.y) { r.el.style.transform = `translate(${x}px, ${y}px)`; r.x = x; r.y = y; }
    }
  }

  function show(next) {
    mode = next;
    layer.hidden = mode === 'off';
    if (mode !== 'off') build();
    else { layer.replaceChildren(); rings.clear(); active = null; }
  }

  app.bags.onChange(() => { if (mode !== 'off') build(); });

  return {
    el: layer,
    tick,
    /** 'off' | 'empty' (a bare bike) | 'add' (Add a bag was pressed) */
    show,
    get mode() { return mode; },
    setActive(placeId) { active = placeId; paintActive(); },
    refreshCounts() { counts.clear(); if (mode !== 'off') build(); },
    countFor,
    slotFor: (placeId) => slotFor(PLACES.find((p) => p.id === placeId)),
  };
}
