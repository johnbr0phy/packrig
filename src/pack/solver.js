/**
 * The packing solver. Pure: numbers in, numbers out, no three.js.
 *
 * A bag's INSIDE is described by `cavity` (built from the bag's own mesh by
 * src/pack/cavity.js, so a tapered seat pack really is smaller at the tail):
 *
 *   { u0, u1, mount,          extent along the bag's long axis u, and where
 *                             on it the bag is held (seatpost end, fork leg,
 *                             centre of a bar roll…)
 *     stations: [{ u0, u1, v0, v1, w0, w1 }],   inside cross-section per slice;
 *                             v is UP, w is across
 *     litres }                the maker's rated volume
 *
 * The rules are the ones an experienced rider packs by:
 *   1. rigid and heavy first, against the mount — the pot, the stove, the
 *      canister go where the bag is held, so they don't swing;
 *   2. then soft things, densest first, and they FILL: a sleeping bag takes
 *      the shape of whatever space is left, squashing up to its `compress`;
 *   3. never overflow silently: an item that won't fit is returned as such,
 *      with the reason, and stays out of the picture.
 *
 * FILL IS VOLUME, NOT GEOMETRY. The meter reads litres against the maker's
 * rating. The picture is laid out in the cavity's own geometry, scaled so a
 * litre of kit takes the same share of the drawn space as it does of the
 * rating — so the meter and the picture cannot tell different stories.
 */

export const USABLE = 0.92;   // nobody gets the last 8% of a roll-top closed

/** Typical maker load ratings per slot, kg. See DECISIONS.md §5.3. */
export const LOAD_LIMIT_KG = {
  seatpack: 5, saddlebag: 6, barroll: 5, barbag: 4, barpocket: 1.5, randobag: 5,
  framebag_full: 5, framebag_half: 4, toptube: 1.5, toptube_rear: 1.2,
  stemL: 1, stemR: 1, forkL: 1.5, forkR: 1.5, downtube: 1.5,
  pannierL: 10, pannierR: 10, trunk: 8,
};

const area = (s) => Math.max(s.v1 - s.v0, 0) * Math.max(s.w1 - s.w0, 0);

/** Geometric volume of the cavity in litres (mm³ → L). */
export function cavityLitres(cav) {
  let v = 0;
  for (const s of cav.stations) v += area(s) * (s.u1 - s.u0);
  return v / 1e6;
}

/** Cross-section at u (the slice containing it). */
function stationAt(cav, u) {
  for (const s of cav.stations) if (u >= s.u0 && u <= s.u1) return s;
  return u < cav.u0 ? cav.stations[0] : cav.stations[cav.stations.length - 1];
}

/**
 * Walk outward from the mount. For an end-mounted bag that is one direction;
 * for a centre-mounted one (bar roll) it alternates sides, so the heavy items
 * end up in the middle and the soft ones out at the rolled ends.
 */
function makeCursor(cav) {
  const span = cav.u1 - cav.u0;
  const m = Math.min(Math.max(cav.mount ?? cav.u1, cav.u0), cav.u1);
  const centre = m - cav.u0 > span * 0.2 && cav.u1 - m > span * 0.2;
  const dirToFar = (m - cav.u0) > (cav.u1 - m) ? -1 : 1;
  const cur = { m, centre, pos: { '1': m, '-1': m }, flip: dirToFar };
  return {
    centre,
    /** Take `len` of u; returns [a, b] or null if there is no room left. */
    take(len) {
      const tryDir = (d) => {
        const p = cur.pos[d];
        const q = p + d * len;
        if (q < cav.u0 - 0.5 || q > cav.u1 + 0.5) return null;
        cur.pos[d] = q;
        return d > 0 ? [p, q] : [q, p];
      };
      if (!centre) return tryDir(dirToFar);
      // alternate, starting on the side with more room
      const a = cur.flip, b = -cur.flip;
      cur.flip = -cur.flip;
      return tryDir(a) || tryDir(b);
    },
    remaining() {
      if (!centre) return dirToFar > 0 ? cav.u1 - cur.pos['1'] : cur.pos['-1'] - cav.u0;
      return (cav.u1 - cur.pos['1']) + (cur.pos['-1'] - cav.u0);
    },
    /** The free intervals left, for soft items to fill. */
    free() {
      if (!centre) return dirToFar > 0 ? [[cur.pos['1'], cav.u1, 1]] : [[cav.u0, cur.pos['-1'], -1]];
      return [[cur.pos['1'], cav.u1, 1], [cav.u0, cur.pos['-1'], -1]];
    },
  };
}

/** Integrate cavity area over [a,b] of u, mm³. */
function volBetween(cav, a, b) {
  let v = 0;
  for (const s of cav.stations) {
    const lo = Math.max(a, s.u0), hi = Math.min(b, s.u1);
    if (hi > lo) v += area(s) * (hi - lo);
  }
  return v;
}

/** Find the u-length from `start` in direction `dir` that encloses `mm3` of cavity. */
function lengthFor(cav, start, dir, mm3, limit) {
  let u = start, got = 0;
  const step = Math.max((cav.u1 - cav.u0) / 200, 0.5);
  while (got < mm3) {
    const nu = u + dir * step;
    if ((dir > 0 && nu > limit) || (dir < 0 && nu < limit)) return Math.abs(limit - start);
    got += area(stationAt(cav, (u + nu) / 2)) * step;
    u = nu;
  }
  return Math.abs(u - start);
}

/**
 * Solve one bag.
 * @param cav     cavity (see top)
 * @param items   resolved items: { uid, g, litres, compress, rigid, dims:[cm…] }
 * @returns {{ placed, overflow, fill, warnings }}
 */
export function solveBag(cav, items, { slot = null } = {}) {
  const rated = cav.litres || cavityLitres(cav);
  const cap = rated * USABLE;
  const geoL = cavityLitres(cav);
  const k = geoL > 0 ? geoL / rated : 1;          // drawn litres per rated litre
  const maxU = cav.u1 - cav.u0;
  let maxV = 0, maxW = 0;
  for (const s of cav.stations) { maxV = Math.max(maxV, s.v1 - s.v0); maxW = Math.max(maxW, s.w1 - s.w0); }
  const box = [maxU, Math.max(maxV, maxW), Math.min(maxV, maxW)].sort((a, b) => b - a);

  // ---- 1. admission, in the order the person added things --------------------
  const overflow = [], admitted = [], warnings = [];
  let minVol = 0;
  for (const it of items) {
    const mm = it.dims.map((c) => c * 10).sort((a, b) => b - a);
    const need = it.litres * (1 - (it.rigid ? 0 : it.compress));
    if (it.rigid && (mm[0] > box[0] + 1 || mm[1] > box[1] + 1 || mm[2] > box[2] + 1)) {
      overflow.push({ uid: it.uid, reason: mm[0] > box[0] + 1 ? 'length' : 'shape', needMm: Math.round(mm[0]), haveMm: Math.round(box[0]) });
      continue;
    }
    if (minVol + need > cap + 1e-9) {
      overflow.push({ uid: it.uid, reason: 'volume', needL: need, freeL: Math.max(cap - minVol, 0) });
      continue;
    }
    minVol += need;
    admitted.push({ ...it, mm });
  }

  // ---- 2. how much the soft things must squash ------------------------------
  const rigid = admitted.filter((i) => i.rigid);
  const soft = admitted.filter((i) => !i.rigid);
  const rigidL = rigid.reduce((a, i) => a + i.litres, 0);
  const softFull = soft.reduce((a, i) => a + i.litres, 0);
  const softMinL = soft.reduce((a, i) => a + i.litres * (1 - i.compress), 0);
  const roomForSoft = Math.max(cap - rigidL, 0);
  // squeeze ∈ [0,1]: 0 = everything at full loft, 1 = everything fully squashed
  const squeeze = softFull <= roomForSoft || softFull === softMinL ? 0
    : Math.min((softFull - roomForSoft) / (softFull - softMinL), 1);
  const effL = (i) => (i.rigid ? i.litres : i.litres * (1 - i.compress * squeeze));

  // ---- 3. rigid layout: shelves across the section, outward from the mount ----
  const placed = [];
  const cur = makeCursor(cav);
  const dense = (a, b) => (b.g / b.litres) - (a.g / a.litres);
  rigid.sort(dense);
  let slab = null;                    // { a, b, depth, rows: {vTop, wCursor, rowH} }
  const openSlab = (depth) => {
    const iv = cur.take(depth);
    if (!iv) return null;
    const st = stationAt(cav, (iv[0] + iv[1]) / 2);
    return { a: iv[0], b: iv[1], st, depth, v: st.v0, w: st.w0, rowH: 0 };
  };
  for (const it of rigid) {
    // longest dimension along the bag, the other two in the section; the
    // bigger of those across whichever of v/w has more room
    const [L, M, S] = it.mm;
    const put = (sl) => {
      const st = sl.st;
      const vSpan = st.v1 - st.v0, wSpan = st.w1 - st.w0;
      let fv = S, fw = M;                     // footprint in the section
      if (vSpan > wSpan) { fv = M; fw = S; }
      if (L > sl.depth + 0.5) return null;
      if (sl.w + fw > st.w1 + 0.5) { sl.v += sl.rowH; sl.w = st.w0; sl.rowH = 0; }
      if (sl.v + fv > st.v1 + 0.5 || fw > wSpan + 0.5) return null;
      const c = [(sl.a + sl.b) / 2, sl.v + fv / 2, sl.w + fw / 2];
      sl.w += fw; sl.rowH = Math.max(sl.rowH, fv);
      return { center: c, size: [L, fv, fw] };
    };
    let spot = slab && put(slab);
    if (!spot) {
      const ns = openSlab(Math.max(L, 10));
      if (ns) { slab = ns; spot = put(slab); }
    }
    if (!spot) {
      // did not fit the SHAPE, even though the volume said yes
      overflow.push({ uid: it.uid, reason: 'shape', needMm: Math.round(L) });
      continue;
    }
    placed.push({ uid: it.uid, rigid: true, ...spot, squeeze: 0 });
  }

  // ---- 4. soft fill ----------------------------------------------------------
  soft.sort(dense);
  const free = cur.free().filter(([a, b]) => b - a > 1);
  let fi = 0;
  const ptr = free.map(([a, b, d]) => (d > 0 ? a : b));
  // any unused depth in the last rigid slab is fair game for soft items too:
  // a jacket stuffs around the pot
  for (const it of soft) {
    const want = effL(it) * k * 1e6;           // mm³ of drawn cavity
    let done = false;
    for (let tries = 0; tries < free.length && !done; tries++) {
      const [a, b, d] = free[fi];
      const start = ptr[fi];
      const limit = d > 0 ? b : a;
      const len = lengthFor(cav, start, d, want, limit);
      if (len > 1) {
        const end = start + d * len;
        const lo = Math.min(start, end), hi = Math.max(start, end);
        ptr[fi] = end;
        const st = stationAt(cav, (lo + hi) / 2);
        // fill the section, less a little air so neighbours read as separate
        const fitted = volBetween(cav, lo, hi) / 1e6;
        const vs = (st.v1 - st.v0) * 0.94, ws = (st.w1 - st.w0) * 0.94;
        placed.push({
          uid: it.uid, rigid: false,
          center: [(lo + hi) / 2, (st.v0 + st.v1) / 2, (st.w0 + st.w1) / 2],
          size: [Math.max(hi - lo - 3, 2), vs, ws],
          squeeze: it.compress * squeeze,
          partial: fitted * 1.02 < effL(it) * k,
        });
        done = true;
      } else fi = (fi + 1) % free.length;
      if (!done && Math.abs(ptr[fi] - (free[fi][2] > 0 ? free[fi][1] : free[fi][0])) < 1) fi = (fi + 1) % free.length;
    }
    if (!done) {
      // Volume admitted it but the rigid layout ate the length. Draw it where
      // it will do least harm — squashed against the far end — rather than
      // lose it: the volume meter already says it fits, and it does.
      const st = cav.stations[cav.stations.length - 1];
      placed.push({
        uid: it.uid, rigid: false, squeeze: it.compress,
        center: [(st.u0 + st.u1) / 2, (st.v0 + st.v1) / 2, (st.w0 + st.w1) / 2],
        size: [Math.max(st.u1 - st.u0, 4), (st.v1 - st.v0) * 0.8, (st.w1 - st.w0) * 0.8],
        partial: true,
      });
    }
  }

  // ---- 5. fill + load --------------------------------------------------------
  const usedL = admitted.filter((i) => placed.some((p) => p.uid === i.uid)).reduce((a, i) => a + effL(i), 0);
  const kg = admitted.reduce((a, i) => a + i.g, 0) / 1000;
  const lim = slot ? LOAD_LIMIT_KG[slot] : null;
  if (lim && kg > lim) warnings.push({ kind: 'load', kg, limit: lim });
  return {
    placed, overflow, warnings,
    fill: { usedL, ratedL: rated, frac: usedL / rated, squeeze, rigidL, softFullL: softFull, kg },
  };
}

/**
 * Split a frame bag into its two sides when anything is placed on one.
 * Items with no side go to whichever side has more room.
 */
export function splitSides(cav) {
  const mid = (s) => (s.w0 + s.w1) / 2;
  const half = (side) => ({
    ...cav,
    litres: cav.litres / 2,
    stations: cav.stations.map((s) => (side === 'L' ? { ...s, w1: mid(s) } : { ...s, w0: mid(s) })),
  });
  return { L: half('L'), R: half('R') };
}
