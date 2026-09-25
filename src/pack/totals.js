/**
 * The numbers people argue about, split the way the owner's sheet splits them.
 *
 *   gear          everything coming that isn't food or water — packed, bolted
 *                 on, and worn (the sheet counts clothes you ride in)
 *     worn        the part of gear that is on the rider
 *   food & water  consumables coming; changes day to day, so kept apart
 *   bags          the bags on the rig, plus the racks and cages they need
 *   bike          the bike itself
 *   all-up        all of the above
 *   on the bike   all-up minus worn — what the wheels actually carry
 *   home          owned and listed, not coming (the sheet's "not packed")
 *
 * Pure: pass in resolved items and bag weights. The 3D view, the list and the
 * compare view all call this, so they cannot disagree.
 */

import { parsePlace } from './model.js';

export const isConsumable = (r) => r.cat === 'food' || !!r.consumable;

/**
 * @param {Array<{uid,g,cat,consumable?}>} resolved  resolved items of the locker
 * @param {object} loadout
 * @param {{ bagsG?:number, bikeG?:number }} opts
 */
export function computeTotals(resolved, loadout, { bagsG = 0, bikeG = 0 } = {}) {
  const t = { gear: 0, worn: 0, food: 0, bags: 0, bike: 0, home: 0, allup: 0, onBike: 0, count: 0, bySlot: {}, byLoc: {} };
  for (const r of resolved) {
    const code = loadout?.place?.[r.uid];
    if (code === undefined) continue;
    const p = parsePlace(code);
    const g = r.g * (r.qty || 1);
    if (p.loc === 'home') { t.home += g; continue; }
    t.count++;
    if (isConsumable(r)) t.food += g; else t.gear += g;
    if (p.loc === 'body') t.worn += g;
    t.byLoc[p.loc] = (t.byLoc[p.loc] || 0) + g;
    if (p.slot) t.bySlot[p.slot] = (t.bySlot[p.slot] || 0) + g;
  }
  // an explicit override (from a sheet) beats the catalogue sum
  t.bags = Number.isFinite(loadout?.bags_g) ? loadout.bags_g : bagsG;
  t.bike = Number.isFinite(loadout?.bike_g) ? loadout.bike_g : bikeG;
  t.allup = t.gear + t.food + t.bags + t.bike;
  t.onBike = t.allup - t.worn;
  return t;
}

/**
 * Balance from point masses in the bike's frame (mm, +x forward, +y up,
 * +z drive side). Front/rear is the static lever split between the axles —
 * what each tyre actually carries — not "how much is in front of the BB".
 */
export function computeBalance(masses, { rearAxleX, frontAxleX, groundY = 0 }) {
  let m = 0, x = 0, y = 0, z = 0, left = 0, right = 0;
  for (const p of masses) {
    if (!(p.g > 0)) continue;
    m += p.g; x += p.g * p.x; y += p.g * p.y; z += p.g * p.z;
    if (p.z < -5) left += p.g; else if (p.z > 5) right += p.g;
  }
  if (!m) return null;
  const com = { x: x / m, y: y / m, z: z / m };
  const wb = frontAxleX - rearAxleX;
  const front = Math.min(Math.max((com.x - rearAxleX) / wb, 0), 1);
  return {
    com, mass: m,
    front, rear: 1 - front,
    left, right,
    heightMm: com.y - groundY,
  };
}
