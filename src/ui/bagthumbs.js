/**
 * Bag thumbnails rendered from the bag's own model.
 *
 * A maker photo is the best picture of a bag, but a third of the catalogue
 * has none, and the rest are hot-linked from maker CDNs that can be slow,
 * blocked or gone. A grey plate or a triangle in their place says "broken".
 * So when there is no photo, or the photo fails, the thumbnail is the same
 * mesh the bike wears: built by the bag's own builder at its real size, in
 * its real colourway, and drawn once into the shared offscreen renderer that
 * item thumbnails already use (src/pack/ui/thumbs.js). Same view angle for
 * every bag so a list of them reads as a set.
 */
import * as THREE from 'three';
import { BUILDERS } from '../bags/registry.js';
import { SLOTS, productSlotFor } from '../bags/slots.js';
import { colorwayFor } from '../bags/identity.js';
import { fabricMaterial } from '../bags/materials.js';
import { disposeObject } from '../lib.js';
import { queueThumb, cachedThumb } from '../pack/ui/thumbs.js';

const keyOf = (brand, product, cw) => `bag|${brand?.name}|${product?.line || ''}|${product?.name}|${product?.size || ''}|${cw || 0}`;

/** A UI slot a catalogue product can be drawn in (panniers and forks: the right side). */
function drawSlot(product) {
  const s = product?.slot;
  if (s === 'pannier') return 'pannierR';
  if (s === 'stembag') return 'stemR';
  if (s === 'forkbag') return 'forkR';
  if (SLOTS[s]) return s;
  return Object.keys(SLOTS).find((k) => (SLOTS[k].products || k) === s) || 'seatpack';
}

function build(app, brand, product, cw) {
  const uiSlot = drawSlot(product);
  const builder = BUILDERS[SLOTS[uiSlot]?.products || productSlotFor(uiSlot) || uiSlot] || BUILDERS[productSlotFor(uiSlot)];
  if (!builder) return null;
  const c = colorwayFor(brand, product, cw || 0);
  const main = fabricMaterial(brand.fabricKey, c.main);
  const accent = fabricMaterial(brand.fabricKey, c.accent);
  const mesh = builder(product, brand, main, accent, app.bike, 1);
  // three-quarter from the drive side and a little above, like a studio shot
  const g = new THREE.Group();
  g.add(mesh);
  g.rotation.set(0.28, -0.62, 0);
  return g;
}

/**
 * Promise of a data URL for a bag, drawn from its model.
 * `app` is needed for the bike: frame bags take their shape from the frame.
 */
export function bagThumb(app, brand, product, cw = 0, size = 176, aspect = 1) {
  const key = keyOf(brand, product, cw) + `|${size}|${aspect}`;
  const hit = cachedThumb(key);
  if (hit !== undefined) return Promise.resolve(hit);
  return queueThumb(key, () => {
    const node = build(app, brand, product, cw);
    return node ? { node, dispose: () => disposeObject(node) } : null;
  }, { size, aspect });
}

/**
 * An <img> for a bag: the maker's photo when it loads, the model when it
 * doesn't or there isn't one. Never blank for long, never broken.
 */
export function bagImg(app, brand, product, { cls = 'bag-img', cw = 0, photo = true, lazy = true, size = 176, aspect = 1 } = {}) {
  const img = document.createElement('img');
  img.className = cls;
  img.alt = '';
  img.decoding = 'async';
  const shot = photo ? product?.images?.[0] : null;
  let fellBack = false;
  const fallback = () => {
    if (fellBack) return;
    fellBack = true;
    img.classList.remove('is-photo');
    img.classList.add('is-model');
    img.removeAttribute('src');
    const hit = cachedThumb(keyOf(brand, product, cw) + `|${size}|${aspect}`);
    if (hit) { img.src = hit; return; }
    const go = () => bagThumb(app, brand, product, cw, size, aspect).then((u) => { if (u) img.src = u; });
    if (lazy && io) { waiting.set(img, go); io.observe(img); } else go();
  };
  if (shot && !product.rendered) {
    img.referrerPolicy = 'no-referrer';
    img.loading = lazy ? 'lazy' : 'eager';
    img.classList.add('is-photo');
    img.onerror = fallback;
    img.src = shot;
  } else if (shot && product.rendered) {
    // a stored portrait of our own model: already the fallback, and local
    img.classList.add('is-model');
    img.src = shot;
    img.onerror = fallback;
  } else {
    fallback();
  }
  return img;
}

const waiting = new WeakMap();
const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    io.unobserve(e.target);
    const go = waiting.get(e.target);
    waiting.delete(e.target);
    go?.();
  }
}, { rootMargin: '240px 0px' }) : null;
