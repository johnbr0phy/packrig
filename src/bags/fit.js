/**
 * Will this bag go on this frame?
 *
 * The bike publishes its triangle. The bag publishes millimetres.
 * Too long is a no. Too small still mounts, but looks lost — we grey it.
 */

import { productSlotFor } from './slots.js';

const cm = (mm) => `${Math.round(Number(mm) / 10)} cm`;

/** Usable room on the current bike, in millimetres. */
export function roomOf(bike) {
  const poly = bike?.framePoly;
  const g = bike?.geo;
  if (!poly || !g) return null;
  const tt = poly[1].distanceTo(poly[2]);
  const st = poly[1].distanceTo(poly[0]);
  const dt = poly[3].distanceTo(poly[0]);
  return {
    topTube: tt,
    seatTube: st,
    downTube: dt,
    // Tyre eats the lower down tube; a bag centred on the old 310mm anchor
    // only has this much before it kisses the front wheel.
    downTubeClear: Math.max(0, dt - 95),
    barWidth: g.barWidth,
  };
}

/**
 * @returns {{ status: 'ok'|'big'|'small', reason?: string }}
 */
export function judgeFit(uiSlot, product, bike) {
  const mm = product?.mm;
  const room = roomOf(bike);
  if (!mm || !room) return { status: 'ok' };
  const slot = productSlotFor(uiSlot) || uiSlot;

  if (slot === 'framebag_full') {
    if (mm.len > room.topTube + 12) {
      return { status: 'big', reason: `Too long — ${cm(mm.len)} needs ${cm(room.topTube)} along the top tube` };
    }
    if (mm.hgt > room.seatTube + 10) {
      return { status: 'big', reason: `Too tall — ${cm(mm.hgt)} needs ${cm(room.seatTube)} on the seat tube` };
    }
    if (mm.len < room.topTube * 0.72) {
      return { status: 'small', reason: `A bit small for this frame — ${cm(mm.len)} in a ${cm(room.topTube)} triangle` };
    }
    return { status: 'ok' };
  }

  if (slot === 'framebag_half') {
    const allow = room.topTube - 36;
    if (mm.len > allow + 8) {
      return { status: 'big', reason: `Too long — ${cm(mm.len)} needs ${cm(allow)} along the top tube` };
    }
    if (mm.len < room.topTube * 0.42) {
      return { status: 'small', reason: `A bit small for this frame — ${cm(mm.len)} on a ${cm(room.topTube)} top tube` };
    }
    return { status: 'ok' };
  }

  if (slot === 'toptube' || slot === 'toptube_rear') {
    if (mm.len > room.topTube - 30) {
      return { status: 'big', reason: `Too long for this top tube — ${cm(mm.len)} needs ${cm(room.topTube - 40)}` };
    }
    return { status: 'ok' };
  }

  if (slot === 'downtube') {
    if (mm.len > room.downTubeClear) {
      return { status: 'big', reason: `Too long — ${cm(mm.len)} would hit the front wheel (${cm(room.downTubeClear)} clear)` };
    }
    return { status: 'ok' };
  }

  if (slot === 'barroll') {
    if (mm.len > room.barWidth + 30) {
      return { status: 'big', reason: `Wider than the bars — ${cm(mm.len)} on a ${cm(room.barWidth)} bar` };
    }
    return { status: 'ok' };
  }

  return { status: 'ok' };
}

export function willFit(uiSlot, product, bike) {
  return judgeFit(uiSlot, product, bike).status !== 'big';
}
