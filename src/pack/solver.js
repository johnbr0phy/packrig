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
 *   1. rigid and heavy first, against the mount, the pot, the stove, the
 *      canister go where the bag is held, so they don't swing;
 *   2. then soft things, densest first, and they FILL: a sleeping bag takes
 *      the shape of whatever space is left, squashing up to its `compress`;
 *   3. never overflow silently: an item that won't fit is returned as such,
 *      with the reason, and stays out of the picture.
 *
 * FILL IS VOLUME, NOT GEOMETRY. The meter reads litres against the maker's
 * rating. The picture is laid out in the cavity's own geometry, scaled so a
 * litre of kit takes the same share of the drawn space as it does of the
 * rating, so the meter and the picture cannot tell different stories.
 */

// A bag's rated litres are its litres: a roll-top can be stuffed to its rating.
// Past 95% the solver says "packed tight" rather than refusing.
export const USABLE = 1.0;

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
    /** Hand back the far `len` of an interval just taken (the cursor steps back). */
    give(iv, len) {
      for (const d of ['1', '-1']) {
        if (d === '1' && Math.abs(cur.pos['1'] - iv[1]) < 1e-6) { cur.pos['1'] -= len; return; }
        if (d === '-1' && Math.abs(cur.pos['-1'] - iv[0]) < 1e-6) { cur.pos['-1'] += len; return; }
      }
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
function lengthFor(cav, start, dir, mm3, limit, areaFn = area) {
  let u = start, got = 0;
  const step = Math.max((cav.u1 - cav.u0) / 200, 0.5);
  while (got < mm3) {
    const nu = u + dir * step;
    if ((dir > 0 && nu > limit) || (dir < 0 && nu < limit)) return Math.abs(limit - start);
    got += areaFn(stationAt(cav, (u + nu) / 2)) * step;
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
export function solveBag(cav, items, opts = {}) {
  const slot = opts.slot ?? null;
  const rated = cav.litres || cavityLitres(cav);
  const cap = rated * USABLE;
  const geoL = cavityLitres(cav);
  const k = geoL > 0 ? geoL / rated : 1;          // drawn litres per rated litre
  void k;
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
    // Length never stretches; the cross-section can, by the bag's `bulge`.
    const bg = opts.bulge ?? 1.45;
    if (it.rigid && (mm[0] > box[0] + 1 || mm[1] > box[1] * bg + 1 || mm[2] > box[2] * bg + 1)) {
      overflow.push({ uid: it.uid, reason: mm[0] > box[0] + 1 ? 'length' : 'shape', needMm: Math.round(mm[0] > box[0] + 1 ? mm[0] : mm[2]), haveMm: Math.round(mm[0] > box[0] + 1 ? box[0] : box[2] * bg) });
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

  // ---- 3. rigid layout: shelves from the floor up, lanes across, outward from the mount
  //
  // How hard things really go into a bag: lying flat on the floor of it,
  // heaviest first, starting where the bag is held and working away; when a
  // layer is full the next goes on top. So: shelves stacked in v (up), each
  // shelf split into lanes across w, and each lane filled along u outward from
  // the mount, both ways from the middle for a centre-mounted bar roll.
  //
  // A soft bag gives: fabric bulges around a canister in a half frame bag.
  // `bulge` is how far past its drawn section a soft bag may stretch (1.0 for
  // a rigid shell); anything that only fits by stretching is placed AND
  // reported, because a bulging frame bag rubs knees.
  const placed = [];
  const dense = (a2, b2) => (b2.g / b2.litres) - (a2.g / a2.litres);
  const bulge = opts.bulge ?? 1.45;
  const m0 = Math.min(Math.max(cav.mount ?? cav.u1, cav.u0), cav.u1);
  const span = cav.u1 - cav.u0;
  const centreMount = m0 - cav.u0 > span * 0.2 && cav.u1 - m0 > span * 0.2;
  const awayDir = (m0 - cav.u0) > (cav.u1 - m0) ? -1 : 1;
  const stationsIn = (a2, b2) => cav.stations.filter((st) => st.u1 > a2 && st.u0 < b2);
  const secOk = (a2, b2, vLo, vHi, wHalf, tol) => {
    const sts = stationsIn(a2, b2);
    if (!sts.length) return false;
    for (const st of sts) {
      const wc = (st.w0 + st.w1) / 2, hw = ((st.w1 - st.w0) / 2) * tol;
      const vTop = st.v0 + (st.v1 - st.v0) * (tol > 1 ? Math.min(tol, 1.15) : 1);
      if (vLo < st.v0 - 0.5 || vHi > vTop + 0.5) return false;
      if (wHalf > hw + 0.5 && Math.abs(wc) >= 0) {
        // lanes are offset from the section centre; wHalf is |offset|+half width
        return false;
      }
    }
    return true;
  };
  const floorAt = (a2, b2) => Math.max(...stationsIn(a2, b2).map((st) => st.v0));
  const shelves = [];                    // { off, h, lanes: [{ w, off, lo, hi }] }
  const bulged = new Set();
  const rigidSorted = rigid.slice().sort(dense);
  let rigidTopByU = [];                  // [u0,u1,vTop] boxes, for the soft fill
  for (const it of rigidSorted) {
    const [L, Mm, Sm] = it.mm;
    let spot = null;
    for (const tol of [1, bulge]) {
      // lie flat: smallest dimension up, middle across
      for (const [h, wd] of [[Sm, Mm], [Mm, Sm]]) {
        // try existing shelves, then a new one on top
        for (let si = 0; si <= shelves.length && !spot; si++) {
          const sh = shelves[si] || { off: shelves.length ? shelves[shelves.length - 1].off + shelves[shelves.length - 1].h : 0, h: 0, lanes: [], fresh: true };
          const shH = Math.max(sh.h, h);
          const laneTry = [...sh.lanes.filter((ln) => ln.w >= wd - 0.5), null];
          for (const ln0 of laneTry) {
            let lane = ln0;
            if (!lane) {
              // a new lane: alternate either side of the centre line
              const used = sh.lanes.reduce((a2, l2) => a2 + l2.w, 0);
              const k = sh.lanes.length;
              const off = k === 0 ? 0 : (k % 2 ? 1 : -1) * (used / 2 + wd / 2);
              lane = { w: wd, off, lo: null, hi: null, fresh: true };
            }
            // where along u: as close to the mount as the shape allows, or at
            // the lane's growing edge, stepping on past any part of the bag
            // too pinched to take it (a canister skips a seat pack's nose)
            const cands = [];
            const STEP = Math.max(span / 60, 6);
            for (let t = 0; t <= span; t += STEP) {
              if (lane.lo === null) {
                if (centreMount) cands.push([m0 - L / 2 + t, m0 + L / 2 + t], [m0 - L / 2 - t, m0 + L / 2 - t]);
                else cands.push(awayDir > 0 ? [m0 + t, m0 + t + L] : [m0 - L - t, m0 - t]);
              } else if (centreMount) cands.push([lane.hi + t, lane.hi + t + L], [lane.lo - L - t, lane.lo - t]);
              else cands.push(awayDir > 0 ? [lane.hi + t, lane.hi + t + L] : [lane.lo - L - t, lane.lo - t]);
            }
            for (let [ua, ub] of cands) {
              // slide inward if the run starts off the end (short bag, long item)
              if (ua < cav.u0) { ub += cav.u0 - ua; ua = cav.u0; }
              if (ub > cav.u1) { ua -= ub - cav.u1; ub = cav.u1; }
              if (ua < cav.u0 - 0.5 || ub > cav.u1 + 0.5) continue;
              // never slide back over what this lane already holds
              if (lane.lo !== null && ub > lane.lo + 0.5 && ua < lane.hi - 0.5) continue;
              const floor = floorAt(ua, ub);
              const vLo = floor + sh.off, vHi = vLo + h;
              const wHalf = Math.abs(lane.off) + wd / 2;
              // shelves above this one must still fit if it grows taller
              if (!secOk(ua, ub, vLo, vHi, wHalf, tol)) continue;
              if (sh.fresh && !shelves.includes(sh)) shelves.push(sh);
              delete sh.fresh;
              sh.h = shH;
              if (lane.fresh) { sh.lanes.push(lane); delete lane.fresh; }
              lane.lo = lane.lo === null ? ua : Math.min(lane.lo, ua);
              lane.hi = lane.hi === null ? ub : Math.max(lane.hi, ub);
              const wc = (stationsIn(ua, ub)[0].w0 + stationsIn(ua, ub)[0].w1) / 2 + lane.off;
              spot = { center: [(ua + ub) / 2, vLo + h / 2, wc], size: [L, h, wd] };
              rigidTopByU.push([ua, ub, vHi]);
              if (tol > 1) bulged.add(it.uid);
              break;
            }
            if (spot) break;
          }
        }
        if (spot) break;
      }
      if (spot) break;
    }
    if (!spot) {
      // The volume says it goes in and nothing about it is too big for the
      // bag; only my tidy shelving ran out. That is a tightly packed bag, not
      // an impossible one, so it goes in loose, on top, where there is most
      // room, and the bag is flagged as tight. Only a thing longer or fatter
      // than the bag can ever be refused (checked at admission).
      let best = cav.stations[0];
      for (const st of cav.stations) if (area(st) > area(best)) best = st;
      const ua = Math.max(cav.u0, Math.min((best.u0 + best.u1) / 2 - L / 2, cav.u1 - L));
      const top = Math.max(best.v0, Math.min(rigidTopByU.filter(([ra, rb]) => rb > ua && ra < ua + L).reduce((m, [, v]) => Math.max(m, v), -Infinity), best.v1 - Sm));
      spot = { center: [ua + L / 2, top + Sm / 2, (best.w0 + best.w1) / 2], size: [L, Sm, Mm], loose: true };
      bulged.add(it.uid);
    }
    placed.push({ uid: it.uid, rigid: true, ...spot, squeeze: 0 });
  }
  if (bulged.size) warnings.push({ kind: 'bulge', uids: [...bulged] });

  // What the rigid layer leaves: a soft thing fills the rest of the section
  // above the hard things (a jacket stuffed on top of the pot), so the soft
  // fill runs along the whole bag with its floor raised where needed.
  const rigidTop = (a2, b2) => {
    let t = -Infinity;
    for (const [ra, rb, rv] of rigidTopByU) if (rb > a2 && ra < b2) t = Math.max(t, rv);
    return t;
  };
  const softArea = (st) => {
    const top = rigidTop(st.u0, st.u1);
    const v0 = Number.isFinite(top) ? Math.min(Math.max(top, st.v0), st.v1) : st.v0;
    return Math.max(st.v1 - v0, 0) * Math.max(st.w1 - st.w0, 0);
  };
  let softGeo = 0;
  for (const st of cav.stations) softGeo += softArea(st) * (st.u1 - st.u0);

  // ---- 4. soft fill ----------------------------------------------------------
  soft.sort(dense);
  // Soft things fill the whole length, starting at the mount end and working
  // toward the opening: the first thing in (the sleeping bag) ends up
  // deepest, against the post, lying on top of the hard things.
  const free = centreMount
    ? [[m0, cav.u1, 1], [cav.u0, m0, -1]]
    : [awayDir > 0 ? [cav.u0, cav.u1, 1] : [cav.u0, cav.u1, -1]];
  let fi = 0;
  const ptr = free.map(([a, b, d]) => (d > 0 ? a : b));
  for (const it of soft) {
    // this item's share of the soft space, in the same proportion as its
    // share of the litres the soft things have to fill
    const want = softGeo * (effL(it) / Math.max(rated - rigidL, 0.01));
    let done = false;
    for (let tries = 0; tries < free.length && !done; tries++) {
      const [a, b, d] = free[fi];
      const start = ptr[fi];
      const limit = d > 0 ? b : a;
      const len = lengthFor(cav, start, d, want, limit, softArea);
      if (len > 1) {
        const end = start + d * len;
        const lo = Math.min(start, end), hi = Math.max(start, end);
        ptr[fi] = end;
        const st = stationAt(cav, (lo + hi) / 2);
        // fill the section above whatever hard things are under it, less a
        // little air so neighbours read as separate
        const fitted = volBetween(cav, lo, hi) / 1e6;
        const top = rigidTop(lo, hi);
        // the ceiling is the LOWEST top along the run, not the middle's: a
        // half frame bag's top line and a seat pack's rail line change along
        // the bag, and a mid-station ceiling pushed a mat up into the top tube
        const run = stationsIn(lo, hi);
        const ceil = run.length ? Math.min(...run.map((x) => x.v1)) : st.v1;
        const vFloor = Number.isFinite(top) ? Math.min(Math.max(top, st.v0), ceil - 6) : Math.min(st.v0, ceil - 6);
        const vs = (ceil - vFloor) * 0.94, ws = (st.w1 - st.w0) * 0.94;
        placed.push({
          uid: it.uid, rigid: false,
          center: [(lo + hi) / 2, (vFloor + ceil) / 2, (st.w0 + st.w1) / 2],
          size: [Math.max(hi - lo - 3, 2), vs, ws],
          squeeze: it.compress * squeeze,
          partial: fitted < 0,
        });
        done = true;
      } else fi = (fi + 1) % free.length;
      if (!done && Math.abs(ptr[fi] - (free[fi][2] > 0 ? free[fi][1] : free[fi][0])) < 1) fi = (fi + 1) % free.length;
    }
    if (!done) {
      // Volume admitted it but the rigid layout ate the length. Draw it where
      // it will do least harm, squashed against the far end, rather than
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
  if (usedL / rated > 0.95 && !overflow.length) warnings.push({ kind: 'tight' });
  return {
    placed, overflow, warnings,
    fill: { usedL, ratedL: rated, frac: usedL / rated, squeeze, rigidL, softFullL: softFull, kg },
  };
}

/**
 * Split a frame bag into its two sides when anything is placed on one.
 * Items with no side go to whichever side has more room.
 */
export function splitSides(cav, frac = 0.5) {
  const mid = (s) => s.w0 + (s.w1 - s.w0) * frac;
  const half = (side) => ({
    ...cav,
    litres: cav.litres / 2,
    stations: cav.stations.map((s) => (side === 'L' ? { ...s, w1: mid(s) } : { ...s, w0: mid(s) })),
  });
  return { L: half('L'), R: half('R') };
}
