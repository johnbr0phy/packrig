/**
 * Item thumbnails, rendered from the item's own model.
 *
 * The list and the 3D view must always agree about what a thing looks like,
 * so there are no thumbnail images: each one is the archetype mesh the scene
 * uses, drawn once into a small offscreen canvas and cached as a data URL.
 *
 * A second WebGL context, created on first use and only ever 176 px square.
 * The main renderer is not borrowed: reading pixels back from it would need
 * `preserveDrawingBuffer` everywhere (REDESIGN §11 says why not), and a render
 * target would skip the tone mapping and output conversion the scene gets.
 *
 * Rendering is queued and drained a few per frame, so opening a 300-item
 * catalogue never stalls a phone.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildItem } from '../kit3d.js';

const SIZE = 176;
let r = null;
const cache = new Map();
const waiting = new Map();          // key → [resolve]
const queue = [];
let pumping = false;

function renderer() {
  if (r) return r;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  gl.setPixelRatio(1);
  gl.setSize(SIZE, SIZE, false);
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(gl).fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(-1.2, 2, 2.4);
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0x404040, 0.9));
  // a rim from behind so black things have an edge
  const rim = new THREE.DirectionalLight(0xffffff, 1.4);
  rim.position.set(1.5, 1, -2);
  scene.add(rim);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
  r = { gl, scene, cam, canvas };
  return r;
}

export const thumbKey = (it) => `${it.archetype}|${it.dims.map((d) => Math.round(d)).join('x')}|${it.color || ''}|${it.ref || it.name}`;

function drawOne(it) {
  const node = buildItem(it.archetype, { dims: it.dims.map((c) => c * 10), color: it.color || '#6b7580', seed: it.ref || it.name });
  // the same three-quarter view for everything, so thumbnails read as a set
  node.rotation.set(-0.55, 0.62, 0.08);
  return drawNode(node);
}

/** Draw any object, fitted and centred, into the shared canvas. */
function drawNode(node, { pad = 0.56, size = SIZE, aspect = 1 } = {}) {
  const { gl, scene, cam, canvas } = renderer();
  const w = size, h = Math.round(size / aspect);
  if (canvas.width !== w || canvas.height !== h) gl.setSize(w, h, false);
  scene.add(node);
  // only what is drawn: builders carry hidden collision proxies, and a box
  // round those puts the bag off-centre and small
  node.updateMatrixWorld(true);
  const bb = new THREE.Box3();
  node.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    for (let q = o; q && q !== node.parent; q = q.parent) if (!q.visible) return;
    o.geometry.computeBoundingBox?.();
    if (o.geometry.boundingBox) bb.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
  });
  if (bb.isEmpty()) bb.setFromObject(node);
  const c = bb.getCenter(new THREE.Vector3());
  const s = bb.getSize(new THREE.Vector3());
  const half = Math.max(s.x / aspect, s.y) * pad;
  cam.left = c.x - half * aspect; cam.right = c.x + half * aspect; cam.top = c.y + half; cam.bottom = c.y - half;
  cam.near = -1e6; cam.far = 1e6;
  cam.position.set(c.x, c.y, c.z + 1000);
  cam.updateProjectionMatrix();
  gl.setClearColor(0x000000, 0);
  gl.render(scene, cam);
  const url = canvas.toDataURL('image/png');
  scene.remove(node);
  return url;
}

function pump() {
  if (pumping) return;
  pumping = true;
  const step = () => {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 8) {
      const { key, it } = queue.shift();
      let url = null;
      try { url = it.__build ? drawBuilt(it.__build, it.__size, it.__aspect) : drawOne(it); } catch (e) { url = null; }
      cache.set(key, url);
      for (const res of waiting.get(key) || []) res(url);
      waiting.delete(key);
    }
    if (queue.length) requestAnimationFrame(step); else pumping = false;
  };
  requestAnimationFrame(step);
}

function drawBuilt(build, size = SIZE, aspect = 1) {
  const b = build();
  if (!b) return null;
  try { return drawNode(b.node, { pad: 0.54, size, aspect }); } finally { b.dispose?.(); }
}

/**
 * Queue any render under a cache key: `build()` returns { node, dispose }.
 * Bag thumbnails (src/ui/bagthumbs.js) share this canvas and this queue.
 */
export function queueThumb(key, build, { size = SIZE, aspect = 1 } = {}) {
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  return new Promise((res) => {
    if (!waiting.has(key)) { waiting.set(key, []); queue.push({ key, it: { __build: build, __size: size, __aspect: aspect } }); }
    waiting.get(key).push(res);
    pump();
  });
}
/** A finished render, null for a failed one, undefined if never drawn. */
export const cachedThumb = (key) => cache.get(key);

/** Promise of a data URL for a resolved item (or catalogue entry shaped like one). */
export function thumbFor(it) {
  const key = thumbKey(it);
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  return new Promise((res) => {
    if (!waiting.has(key)) { waiting.set(key, []); queue.push({ key, it }); }
    waiting.get(key).push(res);
    pump();
  });
}

/** An <img> that fills in when its render is ready. Empty until then, never broken. */
export function thumbImg(it, cls = 'pkg-thumb') {
  const img = document.createElement('img');
  img.className = cls;
  img.alt = '';
  img.decoding = 'async';
  img.width = img.height = 44;
  const key = thumbKey(it);
  if (cache.get(key)) { img.src = cache.get(key); return img; }
  // Lazy: a 327-row locker must not queue 327 renders. Draw a row's model
  // only once it scrolls near the view (clipping by the sheet counts).
  if (!lazy) { thumbFor(it).then((u) => { if (u) img.src = u; }); return img; }
  pendingImg.set(img, it);
  lazy.observe(img);
  return img;
}

const pendingImg = new WeakMap();
const lazy = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const img = e.target, it = pendingImg.get(img);
    lazy.unobserve(img);
    pendingImg.delete(img);
    if (it) thumbFor(it).then((u) => { if (u) img.src = u; });
  }
}, { rootMargin: '240px 0px' }) : null;

/** How many thumbnails are still to draw (tools wait for 0 before a screenshot). */
export const thumbsPending = () => queue.length + (pumping ? 1 : 0);

/** Catalogue entry → the shape thumbFor wants. */
export const asThumbItem = (g) => ({ archetype: g.archetype, dims: g.packed_cm, color: g.color, ref: g.id, name: g.name });
