/**
 * The packing list, in a form that travels.
 *
 * A rig document (localStorage, Firestore, a share link) carries its packing
 * list as `rig.pack`, self-contained: the items THIS loadout lists and where
 * each one goes. Catalogue items are referred to by id and only spelled out
 * where the owner overrode something (his own weight, his own name); custom
 * items carry everything. So a stranger opening the link needs nothing but the
 * public catalogue to see exactly what is in every bag.
 *
 *   pack = { bike_g?, bags_g?, items: [PackItem], at: [code] }   (parallel)
 *   PackItem = "gear-id"                        catalogue item, as is
 *            | ["gear-id", grams?, "name"?]      catalogue item, overridden
 *            | { n, g, c?, a?, d?, col? }        custom
 *
 * Share links carry it deflated: `?r=2.<base64url(deflate-raw(json))>`.
 * A v1 link is base64url of a JSON array starting "[1," and never starts with
 * "2.", so the two can never be confused, and every v1 link reads as it
 * always did.
 */

import { addItem, emptyLocker, emptyLoadout, resolveItem } from './model.js';

// ---- rig.pack <-> locker + loadout -----------------------------------------
export function packFromLoadout(locker, loadout, gearIndex) {
  if (!loadout) return null;
  const items = [], at = [];
  for (const it of locker.items) {
    const code = loadout.place?.[it.uid];
    if (code === undefined) continue;
    const c = it.ref ? gearIndex?.get(it.ref) : null;
    if (c) {
      const g = Number.isFinite(it.g) && Math.abs(it.g - c.weight_g) > 0.6 ? Math.round(it.g * 10) / 10 : null;
      const n = it.name && it.name !== c.name ? it.name : null;
      items.push(g == null && n == null ? c.id : n == null ? [c.id, g] : [c.id, g, n]);
    } else {
      const r = resolveItem(it, gearIndex);
      const o = { n: r.name, g: Math.round(r.g * 10) / 10 };
      if (it.cat) o.c = it.cat;
      if (it.a) o.a = it.a;
      if (it.d) o.d = it.d;
      if (it.col) o.col = it.col;
      items.push(o);
    }
    at.push(code);
  }
  if (!items.length && !loadout.bike_g && !loadout.bags_g) return null;
  const out = { items, at };
  if (loadout.bike_g) out.bike_g = loadout.bike_g;
  if (loadout.bags_g) out.bags_g = loadout.bags_g;
  return out;
}

/**
 * The other direction: a fresh locker + loadout from a rig's pack. Used to
 * show someone else's packing list, and, through `adoptPack`, to copy it.
 */
export function loadoutFromPack(pack, gearIndex, name = '') {
  const locker = emptyLocker();
  const loadout = emptyLoadout(name);
  if (!pack?.items) return { locker, loadout };
  pack.items.forEach((p, i) => {
    let fields;
    if (typeof p === 'string') fields = { ref: p };
    else if (Array.isArray(p)) fields = { ref: p[0], ...(p[1] != null ? { g: p[1] } : {}), ...(p[2] ? { name: p[2] } : {}) };
    else fields = { name: p.n, g: p.g, ...(p.c ? { cat: p.c } : {}), ...(p.a ? { a: p.a } : {}), ...(p.d ? { d: p.d } : {}), ...(p.col ? { col: p.col } : {}) };
    // a ref this catalogue no longer has survives as a custom item, never dropped
    if (fields.ref && gearIndex && !gearIndex.get(fields.ref)) {
      fields = { name: fields.name || fields.ref, g: fields.g ?? 100 };
    }
    const it = addItem(locker, fields);
    loadout.place[it.uid] = pack.at?.[i] || 'home';
  });
  if (pack.bike_g) loadout.bike_g = pack.bike_g;
  if (pack.bags_g) loadout.bags_g = pack.bags_g;
  return { locker, loadout };
}

/**
 * Copy someone else's setup into my locker. Items I already own (same
 * catalogue id, or same name for custom items) are reused rather than
 * duplicated; everything else is added and FLAGGED so the UI can say
 * "you don't own these yet".
 */
export function adoptPack(myLocker, theirs, theirLoadout, name) {
  const lo = emptyLoadout(name || theirLoadout.name || 'Copied setup');
  const missing = [];
  const used = new Set();
  for (const it of theirs.items) {
    const code = theirLoadout.place[it.uid];
    if (code === undefined) continue;
    const mine = myLocker.items.find((m) => !used.has(m.uid) && (
      (it.ref && m.ref === it.ref) || (!it.ref && m.name && it.name && m.name.toLowerCase() === it.name.toLowerCase())));
    if (mine) { used.add(mine.uid); lo.place[mine.uid] = code; continue; }
    const { uid, ...fields } = it;
    const added = addItem(myLocker, { ...fields, wanted: true });
    used.add(added.uid);
    lo.place[added.uid] = code;
    missing.push(added.uid);
  }
  if (theirLoadout.bike_g) lo.bike_g = theirLoadout.bike_g;
  return { loadout: lo, missing };
}

// ---- link encoding ----------------------------------------------------------
const b64url = {
  fromBytes(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  toBytes(s) {
    const b = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  },
};

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function deflateString(s) {
  return b64url.fromBytes(await pipe(new TextEncoder().encode(s), new CompressionStream('deflate-raw')));
}
export async function inflateString(s) {
  return new TextDecoder().decode(await pipe(b64url.toBytes(s), new DecompressionStream('deflate-raw')));
}

/**
 * v2 link payload: [2, env, paint, bags, size, name, pack]. Same positional
 * shape as v1 for the first five, so the bag half is decoded by the same code.
 */
export async function encodeRigV2(rig) {
  const payload = [
    2, rig.env || '', rig.paint || '',
    (rig.bags || []).map((b) => [b.slot, b.brand, b.line, b.name, b.size, b.cw || 0]),
    rig.size || 'M', rig.name || '', rig.pack || null,
  ];
  return `2.${await deflateString(JSON.stringify(payload))}`;
}

export async function decodeRigV2(str) {
  try {
    const [v, env, paint, bags, size, name, pack] = JSON.parse(await inflateString(str.slice(2)));
    if (v !== 2 || !Array.isArray(bags)) return null;
    return {
      v: 2, name: name || '', env, paint, size: size || 'M',
      bags: bags.map(([slot, brand, line, nm, sz, cw]) => ({ slot, brand, line, name: nm, size: sz, cw: cw || 0 })),
      pack: pack || null,
    };
  } catch {
    return null;
  }
}
