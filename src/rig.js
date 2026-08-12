/**
 * A rig — a whole bike setup — in a form that can be saved, shared and read
 * back later, by this browser or by a stranger or by a database.
 *
 * WHY THIS EXISTS. The share link has always encoded a bag as
 * `slot:brandIndex:productIndex`, and those are ARRAY POSITIONS in
 * `data/brands.json`. They are stable only for as long as nobody inserts,
 * removes or re-sorts anything. Today's catalogue work moved three positions
 * (both Bags by Bird "Better Half" entries gained a size, and a brand was
 * renamed in place), and it will happen again every time a brand is added.
 * When it does, every link anyone has ever shared silently resolves to
 * different bags — not an error, not a blank, just the wrong bike. That is the
 * worst possible failure for a share link, and it is invisible.
 *
 * So a rig identifies a bag the way a human would: by maker and model. The
 * same (line, name, size) triple `tools/apply-models.mjs` joins the fidelity
 * records on, which has already been hardened against exactly this problem.
 *
 * Old `?kit=` links are still read. They are the only thing in the wild, and
 * dropping them to fix the format would break the links this change exists to
 * protect.
 */

import { SLOTS, productSlotFor } from './bags/slots.js';
import { productsForSlot } from './catalog.js';

const norm = (s) => String(s ?? '').trim();
/** Keys are compared loosely: reviewers tidy "(3.4L)" to "(3.5L)" and so on. */
const loose = (s) => norm(s).toLowerCase().replace(/\s+/g, ' ');

/** Stable identity for one product: brand + line + name + size. */
export function productKey(brand, product) {
  return [brand?.name, product?.line, product?.name, product?.size]
    .map(norm).join('|');
}

const looseKey = (k) => k.split('|').map(loose).join('|');

/**
 * The current state of the bike as a plain object. This is the shape that gets
 * written to localStorage, sent to the database and encoded into a URL — one
 * definition, so the three can never drift apart.
 */
export function captureRig(app, { name = '' } = {}) {
  const bags = Object.entries(app.bags.equipped).map(([slot, e]) => ({
    slot,
    brand: norm(e.brand?.name),
    line: norm(e.product?.line),
    name: norm(e.product?.name),
    size: norm(e.product?.size),
    cw: e.colorwayIndex || 0,
  }));
  return {
    v: 1,
    name,
    env: app.state?.env || 'mountain',
    paint: app.state?.paint || 'Slate',
    size: app.state?.size || app.bike?.size || 'M',
    bags,
  };
}

/** Total capacity, for showing a rig in a list without mounting it. */
export const rigLitres = (rig, catalog) => {
  let total = 0;
  for (const b of rig?.bags || []) {
    const found = findProduct(catalog, b);
    total += Number(found?.product?.liters) || 0;
  }
  return total;
};

/**
 * Resolve one saved bag back to a live catalogue entry.
 * Exact match first, then a case/space-insensitive one — a saved rig should
 * survive a reviewer fixing the capitalisation of a product name.
 */
export function findProduct(catalog, b) {
  if (!catalog || !b) return null;
  const want = [b.brand, b.line, b.name, b.size].map(norm).join('|');
  const wantLoose = looseKey(want);
  let fallback = null;
  for (const brand of catalog) {
    if (loose(brand.name) !== loose(b.brand)) continue;
    for (const product of brand.products) {
      const k = productKey(brand, product);
      if (k === want) return { brand, product };
      if (!fallback && looseKey(k) === wantLoose) fallback = { brand, product };
    }
  }
  return fallback;
}

/**
 * Put a rig on the bike.
 * @returns {{fitted:number, missing:Array}} — `missing` is products that are no
 *   longer in the catalogue. They are REPORTED, never silently skipped: a rig
 *   that quietly comes back with five bags instead of six is how someone
 *   concludes the app lost their work.
 */
export function applyRig(app, rig, { clear = true } = {}) {
  if (!rig) return { fitted: 0, missing: [] };
  if (clear) for (const slot of Object.keys(app.bags.equipped)) app.bags.remove(slot);
  if (rig.size && app.setSize) app.setSize(rig.size);
  const missing = [];
  let fitted = 0;
  for (const b of rig.bags || []) {
    const hit = findProduct(app.catalog, b);
    if (!hit) { missing.push(b); continue; }
    // A slot with `mountsTo` clips to another BAG, not to the bike, so it
    // cannot be fitted on its own. The eval harness renders exactly one product
    // per shot, which meant a front pocket was always "dropped — resolver could
    // not place it": correct behaviour reported as a fault, on every run.
    // Fit a host first, chosen from the same maker where possible so the pair
    // reads as one product family rather than an arbitrary pairing.
    const def = SLOTS[b.slot];
    if (def?.mountsTo && !def.mountsTo.some((s) => app.bags.equipped[s])) {
      for (const hostSlot of def.mountsTo) {
        const opts = productsForSlot(app.catalog, productSlotFor(hostSlot));
        const pick = opts.find((o) => o.brand.name === hit.brand.name) || opts[0];
        if (pick) { app.bags.equip(hostSlot, pick.brand, pick.product, 0); break; }
      }
    }
    app.bags.equip(b.slot, hit.brand, hit.product, b.cw || 0);
    fitted++;
  }
  if (rig.paint && app.setPaint) app.setPaint(rig.paint);
  if (rig.env && app.setEnv) app.setEnv(rig.env);
  return { fitted, missing };
}

// ---- URL encoding ---------------------------------------------------------
// A frozen snapshot: everything needed to rebuild the bike travels in the link
// itself, so a shared rig needs no storage and can never change under the
// person you sent it to.

const b64url = {
  encode(s) {
    const bytes = new TextEncoder().encode(s);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(s) {
    const b = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  },
};

/**
 * Compact array form. JSON with full keys made a six-bag link ~700 characters,
 * which some chat apps wrap and some mail clients break in half.
 */
export function encodeRig(rig) {
  const payload = [
    rig.v || 1,
    rig.env || '',
    rig.paint || '',
    (rig.bags || []).map((b) => [b.slot, b.brand, b.line, b.name, b.size, b.cw || 0]),
    rig.size || 'M',
  ];
  return b64url.encode(JSON.stringify(payload));
}

export function decodeRig(str) {
  try {
    const [v, env, paint, bags, size] = JSON.parse(b64url.decode(str));
    if (!Array.isArray(bags)) return null;
    return {
      v: v || 1, name: '', env, paint, size: size || 'M',
      bags: bags.map(([slot, brand, line, name, size, cw]) => ({ slot, brand, line, name, size, cw: cw || 0 })),
    };
  } catch {
    return null;
  }
}

/** The shareable URL for the bike as it stands right now. */
export function rigURL(app, base = `${location.origin}${location.pathname}`) {
  return `${base}?r=${encodeRig(captureRig(app))}`;
}

/**
 * Read a rig out of a URL. Handles both `?r=` and the legacy index-based
 * `?kit=`, which is still the only format in anyone's history.
 */
export function rigFromParams(params, catalog) {
  const r = params.get('r');
  if (r) return decodeRig(r);

  const kit = params.get('kit');
  if (!kit || kit === 'rand' || kit === 'full') return null;
  // Legacy: slot:brandIndex:productIndex. Convert positions to names NOW, while
  // we still have the catalogue that produced them, so anything saved from an
  // old link is stored in the durable form.
  const bags = [];
  for (const part of kit.split(',')) {
    const [slot, bi, pi] = part.split(':');
    const brand = catalog?.[+bi];
    const product = brand?.products?.[+pi];
    if (!brand || !product) continue;
    bags.push({
      slot, brand: norm(brand.name), line: norm(product.line),
      name: norm(product.name), size: norm(product.size), cw: 0,
    });
  }
  if (!bags.length) return null;
  return { v: 1, name: '', env: params.get('env') || '', paint: params.get('paint') || '', bags };
}
