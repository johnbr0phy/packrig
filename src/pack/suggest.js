/**
 * "Suggest a layout": pack a list of kit into the bags on the bike the way an
 * experienced rider would. Pure, resolved items and bag capacities in,
 * placement codes out, so it is testable in node and the UI can preview it
 * before committing.
 *
 * The rules, in order of how much they matter:
 *  1. Worn things are worn.
 *  2. Each item's catalogue `places` list is the first opinion, it encodes
 *     where riders actually put that thing and why.
 *  3. Heavy and dense goes low and central (frame bag, then fork cages and
 *     the down tube), never high on the bars or out on the seat pack tail.
 *  4. Things you need while riding go where you can reach them: top tube,
 *     stem, front pocket.
 *  5. Bulky and light fills the ends: seat pack, bar roll.
 *  6. Nothing overflows: every placement is checked against the bag's volume
 *     (with the item's compressibility) and its load rating. If nothing fits,
 *     the item stays home and the reason is returned.
 */
import { LOAD_LIMIT_KG, USABLE } from './solver.js';

/** Catalogue place names → the concrete slots they can mean on a bike. */
const EXPAND = {
  fork: ['forkR', 'forkL'], stem: ['stemR', 'stemL'], pannier: ['pannierR', 'pannierL'],
  seatpack: ['seatpack'], saddlebag: ['saddlebag', 'seatpack'], barroll: ['barroll', 'barbag'],
  barbag: ['barbag', 'barroll'], barpocket: ['barpocket'], framebag_full: ['framebag_full', 'framebag_half'],
  framebag_half: ['framebag_half', 'framebag_full'], toptube: ['toptube'], toptube_rear: ['toptube_rear', 'toptube'],
  downtube: ['downtube'], trunk: ['trunk'], randobag: ['randobag'],
};

/** Where heavy things belong, best first (low and central). */
const HEAVY_ORDER = ['framebag_full', 'framebag_half', 'downtube', 'forkR', 'forkL', 'pannierR', 'pannierL', 'trunk', 'toptube', 'toptube_rear', 'seatpack', 'saddlebag', 'barroll', 'barbag', 'randobag', 'barpocket', 'stemR', 'stemL'];
/** Where bulky, light things belong. */
const BULKY_ORDER = ['seatpack', 'saddlebag', 'barroll', 'barbag', 'randobag', 'pannierR', 'pannierL', 'trunk', 'forkR', 'forkL', 'framebag_full', 'framebag_half', 'downtube', 'toptube', 'toptube_rear', 'barpocket', 'stemR', 'stemL'];
/** Reach-while-riding spots. */
const REACH_ORDER = ['toptube', 'stemR', 'stemL', 'barpocket', 'framebag_half', 'framebag_full', 'toptube_rear', 'barroll', 'seatpack'];

/**
 * @param items  resolved items to place (uid, g, litres, compress, rigid, dims, worn, access, places, archetype)
 * @param bags   [{ slot, litres, maxLenMm? }], the bags on the bike
 * @param keep   { uid: code } placements to leave alone (the person's own overrides)
 * @returns {{ place: {uid: code}, homeless: [{uid, why}] }}
 */
export function suggestLayout(items, bags, keep = {}) {
  const room = new Map(bags.map((b) => [b.slot, { ...b, freeL: b.litres * USABLE, kg: 0 }]));
  const place = {};
  const homeless = [];
  const need = (it) => it.litres * (1 - (it.rigid ? 0 : it.compress));
  const fits = (it, slot) => {
    const r = room.get(slot);
    if (!r) return false;
    if (need(it) > r.freeL + 1e-6) return false;
    const lim = LOAD_LIMIT_KG[slot];
    if (lim && r.kg + it.g / 1000 > lim) return false;
    // a rigid thing has to fit the bag's inside in all three directions:
    // a 9 cm gas canister does not go in a 5 cm half frame bag, whatever
    // the litres say
    if (it.rigid && r.box) {
      const d = it.dims.map((c) => c * 10).sort((a, b) => b - a);
      if (d[0] > r.box[0] + 1 || d[1] > r.box[1] + 1 || d[2] > r.box[2] + 1) return false;
    } else if (it.rigid && r.maxLenMm && it.dims[0] * 10 > r.maxLenMm) return false;
    return true;
  };
  const take = (it, slot) => {
    const r = room.get(slot);
    r.freeL -= need(it);
    r.kg += it.g / 1000;
    place[it.uid] = slot;
  };
  // the person's pinned placements use up room first
  for (const it of items) {
    const code = keep[it.uid];
    if (!code) continue;
    place[it.uid] = code;
    const slot = code.split(':')[0];
    if (room.has(slot) && !/lashed|dangle/.test(code)) take(it, slot);
  }

  // Hardest to place first: big rigid things, then heavy things, then bulk.
  const todo = items.filter((it) => !keep[it.uid]);
  todo.sort((a, b) => (b.rigid - a.rigid) || (need(b) - need(a)) || (b.g - a.g));

  for (const it of todo) {
    if (it.worn) { place[it.uid] = 'body'; continue; }
    // bottles and cages go on the frame; a phone to the bar if nothing else
    if (it.archetype === 'bottle' && /bidon|bottle/i.test(it.name) && !it.consumable) { place[it.uid] = 'frame:bottle'; continue; }

    const candidates = [];
    for (const p of it.places || []) {
      if (p.at === 'body' || p.at === 'pocket') { candidates.push(p.at === 'pocket' ? 'body:pocket' : 'body'); continue; }
      if (p.at === 'frame') { candidates.push('frame'); continue; }
      if (p.at === 'outside') { candidates.push('outside'); continue; }
      for (const s of EXPAND[p.at] || []) candidates.push(s);
    }
    const density = it.g / Math.max(it.litres, 0.01);           // g per litre
    const heavy = it.g >= 250 && density >= 250;
    const order = it.access === 'ride' ? REACH_ORDER : heavy ? HEAVY_ORDER : density < 180 ? BULKY_ORDER : HEAVY_ORDER;
    for (const s of order) if (!candidates.includes(s)) candidates.push(s);

    let done = false;
    for (const c of candidates) {
      if (c === 'body' || c === 'body:pocket') {
        // only small things ride in a pocket, and only if the catalogue said so
        if (it.g <= 250) { place[it.uid] = c; done = true; break; }
        continue;
      }
      if (c === 'frame') {
        if (['pump', 'bottle', 'phone', 'action_camera'].includes(it.archetype)) { place[it.uid] = 'frame'; done = true; break; }
        continue;
      }
      if (c === 'outside') continue;          // lashing is a last resort, below
      if (fits(it, c)) { take(it, c); done = true; break; }
    }
    if (done) continue;
    // Last resort for soft bulk: strap it on top of the seat pack or bar roll.
    // That is what riders really do with a pad or a jacket that won't go in.
    const lashTo = ['seatpack', 'barroll', 'saddlebag', 'trunk'].find((s) => room.has(s));
    if (!it.rigid && lashTo && it.litres <= 6) { place[it.uid] = `${lashTo}:lashed`; continue; }
    place[it.uid] = 'home';
    homeless.push({ uid: it.uid, why: bags.length ? 'no bag with room for it' : 'no bags on the bike' });
  }
  return { place, homeless };
}
