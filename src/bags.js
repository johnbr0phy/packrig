import * as THREE from 'three';
import { v3, deg, labelTexture, fabricTexture, tubeBetween, tubeAlong, disposeObject } from './lib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { productsForSlot } from './catalog.js';

/** Mount slots. Each maps to a bike anchor and knows what it conflicts with. */
export const SLOTS = {
  seatpack:      { anchor: 'seatpack',  label: 'Seat pack',        excludes: ['saddlebag'] },
  saddlebag:     { anchor: 'seatpack',  label: 'Saddle bag',       excludes: ['seatpack'] },
  barroll:       { anchor: 'barroll',   label: 'Handlebar roll',   excludes: ['barbag', 'randobag'] },
  barbag:        { anchor: 'barroll',   label: 'Handlebar bag',    excludes: ['barroll', 'randobag'] },
  randobag:      { anchor: 'basket',    label: 'Rando / basket',   excludes: ['barroll', 'barbag'], needs: 'frontRack' },
  framebag_full: { anchor: 'framebag',  label: 'Full frame bag',   excludes: ['framebag_half'], hidesBottles: true },
  framebag_half: { anchor: 'framebag',  label: 'Half frame bag',   excludes: ['framebag_full'] },
  toptube:       { anchor: 'toptube',   label: 'Top tube bag',     excludes: [] },
  toptube_rear:  { anchor: 'toptubeRear', label: 'Rear top tube bag', excludes: [], products: 'toptube_rear' },
  stemL:         { anchor: 'stemL',     label: 'Stem bag (L)',     excludes: [], products: 'stembag' },
  stemR:         { anchor: 'stemR',     label: 'Stem bag (R)',     excludes: [], products: 'stembag' },
  forkL:         { anchor: 'forkL',     label: 'Fork bag (L)',     excludes: [], products: 'forkbag' },
  forkR:         { anchor: 'forkR',     label: 'Fork bag (R)',     excludes: [], products: 'forkbag' },
  downtube:      { anchor: 'downtube',  label: 'Downtube bag',     excludes: [] },
  pannierL:      { anchor: 'pannierL',  label: 'Pannier (L)',      excludes: [], products: 'pannier', needs: 'rearRack' },
  pannierR:      { anchor: 'pannierR',  label: 'Pannier (R)',      excludes: [], products: 'pannier', needs: 'rearRack' },
  trunk:         { anchor: 'rackTop',   label: 'Rack trunk bag',   excludes: [], needs: 'rearRack' },
};

export function productSlotFor(uiSlot) {
  return SLOTS[uiSlot].products || uiSlot;
}

// ---- soft-goods deformation ---------------------------------------------
// Stuffed luggage never reads as a primitive: the fabric bulges between the
// seams. We displace vertices along a *welded* normal so hard-edge geometry
// (rounded boxes, extrusions) can't crack open at its duplicated seams.

function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return L(
    L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v),
    L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v),
    w
  ) * 2 - 1;
}

function fbm(x, y, z, freq, seed, octaves) {
  let amp = 1, tot = 0, sum = 0, f = freq;
  const o = seed * 13.37 + 2.5;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * f + o, y * f + o * 1.7, z * f + o * 2.3);
    tot += amp;
    amp *= 0.5;
    f *= 2.17;
  }
  return sum / tot;
}

/** Position-welded vertex groups: key → { n: averaged normal, idx: [...] }. */
function weldGroups(geo) {
  const pos = geo.attributes.position;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  const groups = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * 16)},${Math.round(pos.getY(i) * 16)},${Math.round(pos.getZ(i) * 16)}`;
    let g = groups.get(k);
    if (!g) { g = { n: new THREE.Vector3(), idx: [] }; groups.set(k, g); }
    g.n.x += nor.getX(i); g.n.y += nor.getY(i); g.n.z += nor.getZ(i);
    g.idx.push(i);
  }
  for (const g of groups.values()) {
    if (g.n.lengthSq() < 1e-8) g.n.set(0, 1, 0); else g.n.normalize();
  }
  return groups;
}

/** Re-derive smooth normals across welded groups (computeVertexNormals facets non-indexed meshes). */
function smoothNormals(geo, groups) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  for (const g of groups.values()) g.n.set(0, 0, 0);
  const byIndex = new Array(pos.count);
  for (const g of groups.values()) for (const i of g.idx) byIndex[i] = g;
  const idx = geo.index;
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), fn = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3;
    const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    ab.subVectors(b, a); ac.subVectors(c, a);
    fn.crossVectors(ab, ac);
    for (const i of [i0, i1, i2]) { const g = byIndex[i]; if (g) g.n.add(fn); }
  }
  for (const g of groups.values()) {
    if (g.n.lengthSq() < 1e-12) continue;
    g.n.normalize();
    for (const i of g.idx) nor.setXYZ(i, g.n.x, g.n.y, g.n.z);
  }
  nor.needsUpdate = true;
}

/**
 * Push vertices out along their (welded) normals with a few octaves of value
 * noise — the difference between a smooth primitive and a packed dry bag.
 * `flatAxis` restricts displacement to the two big faces of an extrusion.
 */
function stuffed(geometry, { amp = 3, freq = 0.03, seed = 1, octaves = 3, flatAxis = null, bulge = null } = {}) {
  const pos = geometry.attributes.position;
  const groups = weldGroups(geometry);
  const axis = flatAxis === 'z' ? 'z' : flatAxis === 'y' ? 'y' : flatAxis === 'x' ? 'x' : null;
  for (const g of groups.values()) {
    let dx = g.n.x, dy = g.n.y, dz = g.n.z;
    if (axis) {
      const c = g.n[axis];
      if (Math.abs(c) < 0.8) continue; // leave the bevel band alone: silhouette holds
      dx = dy = dz = 0;
      if (axis === 'x') dx = Math.sign(c); else if (axis === 'y') dy = Math.sign(c); else dz = Math.sign(c);
    }
    const i0 = g.idx[0];
    const px = pos.getX(i0), py = pos.getY(i0), pz = pos.getZ(i0);
    let d = fbm(px, py, pz, freq, seed, octaves) * amp;
    if (bulge) d += bulge(px, py, pz, dx, dy, dz);
    for (const i of g.idx) {
      pos.setXYZ(i, pos.getX(i) + dx * d, pos.getY(i) + dy * d, pos.getZ(i) + dz * d);
    }
  }
  pos.needsUpdate = true;
  smoothNormals(geometry, groups);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Noise alone is invisible on a 500mm panel. What actually reads as "packed"
 * is the panel doming between its seams, so bulge each flat face toward its
 * centre and pinch it back in at the stitch lines.
 */
function pillowFalloff(t, power = 0.6) {
  const a = Math.min(Math.abs(t), 1);
  return Math.max(0, 1 - a ** 2.2) ** power;
}

/** Dome the six faces of a boxy bag. */
function boxBulge(hx, hy, hz, amount) {
  return (x, y, z, nx, ny, nz) => {
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const m = Math.max(ax, ay, az);
    if (m < 0.72) return 0;
    if (m === ax) return amount * pillowFalloff(y / hy) * pillowFalloff(z / hz);
    if (m === ay) return amount * pillowFalloff(x / hx) * pillowFalloff(z / hz);
    return amount * pillowFalloff(x / hx) * pillowFalloff(y / hy);
  };
}

/** Dome an extruded outline, pinched back at its stitch lines. */
function shapeBulge(poly, amount, seams = [], reach = 60) {
  const segs = poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
  const edgeDist = (x, y) => {
    let best = Infinity;
    for (const [a, b] of segs) {
      const vx = b.x - a.x, vy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy || 1)));
      best = Math.min(best, Math.hypot(x - (a.x + vx * t), y - (a.y + vy * t)));
    }
    return best;
  };
  return (x, y) => {
    let w = Math.min(edgeDist(x, y) / reach, 1) ** 0.55;
    for (const s of seams) {
      const v = s.axis === 'y' ? y : x;
      w *= 1 - 0.72 * Math.exp(-(((v - s.at) / 24) ** 2));
    }
    return amount * w;
  };
}

/**
 * Baked occlusion: fabric bunches and shades toward the bottom of a bag.
 * Stored as a greyscale multiplier so it composes with the material colour.
 */
function shadeAO(geo, { dir = new THREE.Vector3(0, -1, 0), k = 0.82, span = 0.45 } = {}) {
  const pos = geo.attributes.position;
  const d = dir.clone().normalize();
  let lo = Infinity, hi = -Infinity;
  const proj = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const p = pos.getX(i) * d.x + pos.getY(i) * d.y + pos.getZ(i) * d.z;
    proj[i] = p;
    if (p < lo) lo = p;
    if (p > hi) hi = p;
  }
  const range = Math.max(hi - lo, 1e-6);
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = (proj[i] - lo) / range;            // 1 = furthest along `dir` (the underside)
    const w = t <= 1 - span ? 0 : ((t - (1 - span)) / span) ** 1.4;
    const m = 1 - w * (1 - k);
    cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = m;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

// ---- fabric materials ----------------------------------------------------
const texCache = {};
function fabricMaterial(fabricKey, colorHex) {
  const color = new THREE.Color(colorHex);
  if (!texCache.cordura) {
    texCache.cordura = fabricTexture({ xpac: false, scale: 7 });
    texCache.xpac = fabricTexture({ xpac: true, scale: 5 });
  }
  const m = fabricMaterialInner(fabricKey, color);
  m.envMapIntensity = 0.32; // fabric barely mirrors the HDRI
  m.metalness = 0;
  return m;
}

function fabricMaterialInner(fabricKey, color) {
  switch (fabricKey) {
    case 'tpu':
      return new THREE.MeshPhysicalMaterial({
        color, roughness: 0.72, metalness: 0.0, clearcoat: 0.08, clearcoatRoughness: 0.6,
        bumpMap: texCache.cordura, bumpScale: 0.42,
      });
    // Sheen is a broad white-ish lobe over the whole albedo. Pushed hard it lifts
    // every colourway toward off-white and inverts the ordering — a #1c1c1c black
    // rendered lighter than a #b0b4b7 grey. Keep it weak and tinted to the cloth.
    case 'xpac':
      return new THREE.MeshPhysicalMaterial({
        color, roughness: 0.82, sheen: 0.12, sheenRoughness: 0.85, sheenColor: color.clone().lerp(new THREE.Color(0xffffff), 0.05),
        bumpMap: texCache.xpac, bumpScale: 1.05,
      });
    case 'waxed':
      return new THREE.MeshPhysicalMaterial({
        color, roughness: 0.62, sheen: 0.16, sheenRoughness: 0.75, sheenColor: color.clone().lerp(new THREE.Color(0xfff3d6), 0.35),
        bumpMap: texCache.cordura, bumpScale: 0.74,
      });
    default: // cordura
      return new THREE.MeshPhysicalMaterial({
        color, roughness: 0.9, sheen: 0.15, sheenRoughness: 0.88, sheenColor: color.clone().lerp(new THREE.Color(0xffffff), 0.05),
        bumpMap: texCache.cordura, bumpScale: 0.94,
      });
  }
}

const webbing = () => new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.85 });
const hardware = () => new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.5, metalness: 0.3 });

// Vertex-coloured twin of a fabric material, made once per bag.
const vcVariants = new WeakMap();
function vcMat(mat) {
  let m = vcVariants.get(mat);
  if (!m) { m = mat.clone(); m.vertexColors = true; vcVariants.set(mat, m); }
  return m;
}

// Panel seams read as a slightly darker shade of the shell.
const seamVariants = new WeakMap();
function seamMat(mat) {
  let m = seamVariants.get(mat);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: mat.color.clone().multiplyScalar(0.75), roughness: 0.95,
      bumpMap: mat.bumpMap || null, bumpScale: 0.4,
    });
    seamVariants.set(mat, m);
  }
  return m;
}

/** Stuffed + occluded fabric panel in one call. */
function soft(geo, mat, opts = {}) {
  const { amp = 3, freq = 0.03, seed = 1, flatAxis = null, bulge = null, aoDir = null, aoK = 0.82, aoSpan = 0.45 } = opts;
  stuffed(geo, { amp, freq, seed, flatAxis, bulge });
  if (aoDir) {
    shadeAO(geo, { dir: aoDir, k: aoK, span: aoSpan });
    return new THREE.Mesh(geo, vcMat(mat));
  }
  return new THREE.Mesh(geo, mat);
}

function shadowify(root) {
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}

function patch(grp, brand, x, y, z, w = 84, ry = 0) {
  // Brand marks on real bags are printed onto the shell. A near-opaque plaque
  // with a bright outline reads as a card glued on, so keep the ground faint.
  const tex = labelTexture(brand.short.toUpperCase(), {
    bg: 'rgba(20,22,25,0.34)', fg: '#cfc8ba', w: 256, h: 96,
    font: '600 34px "Helvetica Neue", Arial, sans-serif', radius: 10, stroke: 'rgba(255,255,255,0.06)',
  });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.82, w * 0.31),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.94, polygonOffset: true, polygonOffsetFactor: -1 })
  );
  m.position.set(x, y - w * 0.06, z);
  m.rotation.y = ry;
  m.userData.noCollide = true;
  grp.add(m);
  return m;
}

// ---- hardware / trim helpers --------------------------------------------

/**
 * A compression strap that actually hugs the bag: a flattened torus sized to
 * the local radius, a ladderlock where it closes, and a loose tail beyond it.
 * Built in the XY plane (ring axis = +z); callers rotate the returned group.
 */
function strapAssembly(wm, hwm, { r, width = 20, ellipse = 1, angle = -Math.PI / 2, tail = true }) {
  const g = new THREE.Group();
  const tube = 1.6;
  const band = new THREE.Mesh(new THREE.TorusGeometry(r + 1, tube, 6, 44), wm);
  band.scale.set(ellipse, 1, width / (tube * 2));
  g.add(band);
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const bx = (r + 4) * ca * ellipse, by = (r + 4) * sa;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(width * 1.05, 7.5, width * 0.92), hwm);
  buckle.position.set(bx, by, 0);
  buckle.rotation.z = angle + Math.PI / 2;
  g.add(buckle);
  if (tail) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(2.4, width * 1.35, width * 0.78), wm);
    t.position.set(bx + ca * 3 - sa * width * 0.5, by + sa * 3 + ca * width * 0.5, 0);
    t.rotation.z = angle + Math.PI / 2 + deg(15);
    g.add(t);
  }
  return g;
}

/** Flat webbing lying on a face, plus its buckle — for boxy bags. */
function webbingRun(grp, wm, hwm, { from, to, width = 22, normal = 'z', proud = 0.8, buckleAt = 0.62 }) {
  const dir = to.clone().sub(from);
  const len = dir.length();
  const mid = from.clone().addScaledVector(dir, 0.5);
  const thick = 2.2;
  const dims = normal === 'z' ? [width, len, thick] : normal === 'x' ? [thick, len, width] : [width, thick, len];
  const strip = new THREE.Mesh(new THREE.BoxGeometry(...dims), wm);
  strip.position.copy(mid);
  if (normal === 'z') strip.position.z += proud;
  else if (normal === 'x') strip.position.x += proud;
  else strip.position.y += proud;
  const ang = Math.atan2(dir.y, normal === 'z' ? dir.x : dir.z);
  if (normal === 'z') strip.rotation.z = ang - Math.PI / 2;
  grp.add(strip);
  const bk = new THREE.Mesh(new THREE.BoxGeometry(width * 1.15, 16, 9), hwm);
  bk.position.copy(from).addScaledVector(dir, buckleAt);
  if (normal === 'z') { bk.position.z += proud + 3; bk.rotation.z = ang - Math.PI / 2; }
  else if (normal === 'x') { bk.position.x += proud + 3; bk.rotation.y = Math.PI / 2; }
  grp.add(bk);
  return strip;
}

/**
 * Roll-top closure. A rolled dry-bag mouth is NOT a set of concentric rings —
 * the round section pinches flat into a lip roughly the bag's width but only a
 * few cm tall, that lip folds over itself two or three times, and a strap runs
 * over the fold. Built in the XY plane, stacking toward +z.
 */
function rollTop(mat, hwm, { r, depth = 7, rings = 3, buckle = true, widthScale = 1, back = true }) {
  const g = new THREE.Group();
  // `back` closes the mouth for bodies that end open; on a body that already
  // domes shut it just reads as a flat porthole disc, so callers can drop it.
  if (back) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.94, 26), mat);
    disc.scale.x = widthScale;
    g.add(disc);
  }
  const lipW = r * 1.68 * widthScale;   // flattening the mouth makes it wider than the tube
  const foldH = Math.max(r * 0.3, 5);
  for (let i = 0; i < rings; i++) {
    const h = foldH * (1 - i * 0.1);
    const fold = new THREE.Mesh(
      new RoundedBoxGeometry(lipW * (1 - i * 0.045), h, h * 1.15, 3, h * 0.4),
      mat
    );
    fold.position.set(0, r * 0.06 - i * h * 0.3, depth * 0.16 + i * h * 0.66);
    fold.rotation.z = deg(2.5 - i * 2);
    g.add(fold);
  }
  if (buckle) {
    // strap over the fold, with the buckle proud of it
    const strap = new THREE.Mesh(new THREE.BoxGeometry(16, foldH * 2.6, 2.6), webbing());
    strap.position.set(-lipW * 0.28, -foldH * 0.4, depth * 0.16 + foldH * rings * 0.5);
    g.add(strap);
    const tab = new THREE.Mesh(new THREE.BoxGeometry(19, 12, 8), hwm);
    tab.position.set(-lipW * 0.28, -foldH * 1.5, depth * 0.16 + foldH * rings * 0.45);
    g.add(tab);
  }
  return g;
}

/**
 * Seat packs are not bodies of revolution. Real ones taper in width as well as
 * height (Apidura quotes 15cm at the saddle to 5cm at the roll), and the tail
 * pinches flat into a lip before it is rolled. Applied to the lathe in its own
 * local space, where +y runs nose→tail and x/z are the radial plane.
 */
function taperAndFlatten(geo, { len, shoulder, tailWid = 0.4, squash = 0.26 }) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(Math.max(pos.getY(i) / len, 0), 1);
    // width narrows over the whole length…
    let wz = 1 + (tailWid - 1) * t ** 0.85;
    // …and past the shoulder the section collapses into a flat lip
    if (t > shoulder) {
      const k = Math.min((t - shoulder) / (1 - shoulder), 1);
      pos.setX(i, pos.getX(i) * (1 + (squash - 1) * k * k));
      wz *= 1 + 0.18 * k;
    }
    pos.setZ(i, pos.getZ(i) * wz);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Local width factor matching taperAndFlatten, so trim tracks the same body. */
const widAt = (t, tailWid = 0.4) => 1 + (tailWid - 1) * Math.min(Math.max(t, 0), 1) ** 0.85;

/**
 * Webbing that wraps a bike tube and comes back — used where a strap has to
 * visibly terminate ON something (saddle rail, bar) instead of in mid-air.
 */
function wrapStrap(wm, hwm, { from, to, tubeR, width = 14, thick = 3 }) {
  const g = new THREE.Group();
  const dir = to.clone().sub(from);
  const len = dir.length();
  if (len < 1) return g;
  const mid = from.clone().addScaledVector(dir, 0.5);
  const riser = new THREE.Mesh(new THREE.BoxGeometry(thick, len, width), wm);
  riser.position.copy(mid);
  riser.rotation.z = Math.atan2(dir.y, dir.x) - Math.PI / 2;
  g.add(riser);
  // the loop that actually closes around the rail
  const loop = new THREE.Mesh(new THREE.TorusGeometry(tubeR + thick * 0.7, thick * 0.5, 6, 20), wm);
  loop.position.copy(to);
  loop.rotation.y = Math.PI / 2;
  loop.scale.z = width / (thick * 1.6);
  g.add(loop);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, 11, thick * 2.6), hwm);
  buckle.position.copy(from).addScaledVector(dir, 0.3);
  buckle.rotation.z = Math.atan2(dir.y, dir.x) - Math.PI / 2;
  buckle.rotation.x = Math.PI / 2;
  g.add(buckle);
  return g;
}

// Outer radii of the tubes a frame bag straps to (data/geometry-journeyer57.json
// frame_tubing, mid-span values). Used both for strap sizing and for keeping the
// fabric boundary off the tube surface.
const TUBE_R = { topTube: 16, downTube: 23, seatTube: 17 };

/**
 * The hook-and-loop / Hypalon straps that hold a frame bag into the triangle.
 * Every real frame bag is covered in them and we drew none, which is most of why
 * ours read as a decal floating in the triangle. `edge` is a [from,to] pair in
 * bag-local mm along the tube; straps are spaced along it.
 */
function frameStraps(grp, wm, hwm, { edge, count, tubeR, depth, normal = v3(0, 1, 0) }) {
  if (!count) return;
  // the panel edge sits at the tube surface, so step back out to the centreline
  // or the bands wrap thin air instead of the tube
  const lift = normal.clone().multiplyScalar(tubeR);
  const from = edge[0].clone().add(lift);
  const to = edge[1].clone().add(lift);
  const dir = to.clone().sub(from);
  const len = dir.length();
  if (len < 1) return;
  const axis = dir.clone().normalize();
  for (let i = 0; i < count; i++) {
    const f = count === 1 ? 0.5 : 0.16 + (0.68 * i) / (count - 1);
    const at = from.clone().addScaledVector(dir, f);
    const band = new THREE.Group();
    // flattened torus = a webbing band seen wrapping the tube
    const loop = new THREE.Mesh(new THREE.TorusGeometry(tubeR + 4, 2.6, 6, 24), wm);
    loop.scale.z = 4.2;   // ~22mm of webbing width along the tube
    band.add(loop);
    const tab = new THREE.Mesh(new THREE.BoxGeometry(11, 5.5, 16), hwm);
    tab.position.set(0, -(tubeR + 5), 0);
    band.add(tab);
    band.quaternion.setFromUnitVectors(v3(0, 0, 1), axis);
    band.position.copy(at);
    band.userData.noCollide = true;
    band.traverse((o) => { o.userData.noCollide = true; });
    grp.add(band);
  }
}

/** A seam that follows a swept profile (used along tapered bodies). */
function seamCurve(mat, points, r = 1.2) {
  const m = tubeAlong(points, r, seamMat(mat), { segments: Math.max(24, points.length * 4), radialSegments: 6 });
  m.userData.noCollide = true;
  return m;
}

function seamRing(mat, r, tube = 1.15) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 5, 48), seamMat(mat));
  m.userData.noCollide = true;
  return m;
}

function seamStrip(mat, w, h, d = 1.6) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), seamMat(mat));
  m.userData.noCollide = true;
  return m;
}

// ---- per-product identity ------------------------------------------------
// Two bags from the same catalogue slot should never be mistaken for each
// other. Everything that varies — noise, taper, strap spacing, patch placement
// — is driven off a hash of the product's identity, so it is stable across
// reloads but different for every model and size.

function productSeed(brand, p) {
  const s = `${brand?.name || ''}|${p?.line || ''}|${p?.name || ''}|${p?.size || ''}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic per-product jitter source. */
function variantOf(brand, p) {
  const seed = productSeed(brand, p);
  let a = seed;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed,
    rnd,
    /** symmetric jitter in ±m */
    j: (m) => (rnd() * 2 - 1) * m,
    /** value in [lo, hi] */
    range: (lo, hi) => lo + rnd() * (hi - lo),
    pick: (arr) => arr[Math.floor(rnd() * arr.length) % arr.length],
  };
}

/** Normalised feature block; every field is safe to read before the data lands. */
function featuresOf(p) {
  const f = (p && p.features) || {};
  return {
    closure: f.closure || null,
    pockets: Array.isArray(f.pockets) ? f.pockets : [],
    daisyChains: !!f.daisyChains,
    compressionStraps: Number.isFinite(f.compressionStraps) ? Math.max(0, Math.min(6, f.compressionStraps)) : null,
    cord: !!f.cord,
    reflective: !!f.reflective,
    valve: !!f.valve,
    shape: f.shape || null,
    colorways: Array.isArray(f.colorways) && f.colorways.length ? f.colorways : null,
  };
}

/** Resolve body/accent colours: colorways win, product.colors is the fallback. */
const hexToInt = (h) => (typeof h === 'number' ? h : parseInt(String(h).replace('#', ''), 16));

export function colorwayFor(brand, product, index = 0) {
  const ways = product?.features?.colorways;
  if (Array.isArray(ways) && ways.length) {
    const cw = ways[((index % ways.length) + ways.length) % ways.length];
    if (cw && cw.main != null) return { main: cw.main, accent: cw.accent ?? cw.main, name: cw.name };
    // verification records use { name, hex } — without this the ~1800 colourways
    // scraped from the makers' own pages are silently ignored
    if (cw && cw.hex != null) {
      const main = hexToInt(cw.hex);
      if (Number.isFinite(main)) {
        return { main, accent: cw.accentHex != null ? hexToInt(cw.accentHex) : main, name: cw.name };
      }
    }
    if (typeof cw === 'string') {
      const main = hexToInt(cw);
      if (Number.isFinite(main)) return { main, accent: main, name: null };
    }
  }
  return {
    main: product?.colors?.[0] ?? brand?.palette?.[0] ?? 0x3b3f45,
    accent: product?.colors?.[1] ?? brand?.palette?.[1] ?? product?.colors?.[0] ?? 0x2a2d31,
    name: null,
  };
}

// ---- feature geometry ----------------------------------------------------

const meshPanelMat = () => new THREE.MeshPhysicalMaterial({
  color: 0x141414, roughness: 0.86, metalness: 0, transparent: true, opacity: 0.85,
  bumpMap: texCache.xpac || null, bumpScale: 1.4, envMapIntensity: 0.2,
});

const reflectiveMat = () => new THREE.MeshStandardMaterial({
  color: 0xd8dade, roughness: 0.45, metalness: 0.1,
  emissive: 0xbfc4c9, emissiveIntensity: 0.08,
});

const cordMat = () => new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.7 });

/** Zip track: tape, a brighter tooth chain, slider and pull tab. */
function zipperRun(a, b, hwm, { tape = 2.0, accentMat = null } = {}) {
  const g = new THREE.Group();
  const teeth = new THREE.MeshStandardMaterial({ color: 0x8d9299, roughness: 0.42, metalness: 0.65 });
  g.add(tubeBetween(a, b, tape, tape, accentMat || webbing(), 8));
  g.add(tubeBetween(a, b, tape * 0.5, tape * 0.5, teeth, 6));
  const dir = b.clone().sub(a);
  const slider = new THREE.Mesh(new THREE.BoxGeometry(11, 7.5, 7.5), hwm);
  slider.position.copy(a).addScaledVector(dir, 0.78);
  slider.quaternion.setFromUnitVectors(v3(1, 0, 0), dir.clone().normalize());
  g.add(slider);
  const pull = new THREE.Mesh(new THREE.BoxGeometry(4, 15, 2.6), hwm);
  pull.position.copy(slider.position).add(v3(0, -10, 0));
  g.add(pull);
  g.traverse((o) => { o.userData.noCollide = true; });
  return g;
}

/** Cinched end: radial pleats gathered to a hub, with a cord lock. */
function drawcordEnd(mat, hwm, { r, depth = 11, pleats = 0 }) {
  const g = new THREE.Group();
  const n = pleats || Math.max(8, Math.min(16, Math.round(r / 7)));
  const hub = new THREE.Mesh(new THREE.SphereGeometry(Math.max(r * 0.3, 5), 14, 10), mat);
  hub.position.z = depth * 0.5;
  hub.scale.z = 0.6;
  g.add(hub);
  // gathered fabric, not a fan: short pleats tucked inside the mouth radius
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const pl = new THREE.Mesh(new THREE.BoxGeometry(r * 0.46, Math.max(r * 0.14, 3), 3.5), mat);
    pl.position.set(Math.cos(ang) * r * 0.46, Math.sin(ang) * r * 0.46, depth * 0.26);
    pl.rotation.z = ang;
    pl.rotation.y = -0.5;
    g.add(pl);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.55, 1.6, 5, 24), cordMat());
  ring.position.z = depth * 0.62;
  g.add(ring);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(11, 8.5, 9), hwm);
  lock.position.set(r * 0.18, -r * 0.5, depth * 0.75);
  g.add(lock);
  return g;
}

/** Lid flap with two strap-and-buckle closures down the front face. */
function flapLid(accent, wm, hwm, { w, d, drop = 46 }) {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new RoundedBoxGeometry(w, 9, d, 4, 4), accent);
  g.add(plate);
  const skirt = new THREE.Mesh(new RoundedBoxGeometry(w * 0.97, drop, 8, 3, 3), accent);
  skirt.position.set(0, -drop / 2, d / 2);
  g.add(skirt);
  for (const sx of [-0.27, 0.27]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(21, drop * 1.45, 3.2), wm);
    strap.position.set(sx * w, -drop * 0.62, d / 2 + 5.5);
    g.add(strap);
    const bk = new THREE.Mesh(new THREE.BoxGeometry(25, 15, 8.5), hwm);
    bk.position.set(sx * w, -drop * 1.18, d / 2 + 6.5);
    g.add(bk);
  }
  return g;
}

/** Exposed cradle: alloy plates plus the two wide straps holding a drybag. */
function harnessCradle(wm, { r, len }) {
  const g = new THREE.Group();
  const alloy = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, metalness: 0.8, roughness: 0.42 });
  for (const s of [1, -1]) {
    const plate = new THREE.Mesh(new RoundedBoxGeometry(10, r * 1.5, 26, 3, 4), alloy);
    plate.position.set(-r * 0.72, 0, s * len * 0.3);
    plate.rotation.z = deg(12 * s);
    g.add(plate);
    const band = new THREE.Mesh(new THREE.TorusGeometry(r + 4, 2.4, 6, 34), wm);
    band.scale.z = 9;
    band.position.z = s * len * 0.3;
    g.add(band);
  }
  const spine = new THREE.Mesh(new THREE.BoxGeometry(9, 16, len * 0.66), alloy);
  spine.position.set(-r * 0.8, 0, 0);
  g.add(spine);
  return g;
}

/**
 * Orient a lathe-built part: its axis (local +Y) onto `axisDir`, and the centre
 * of its arc (local +Z) onto `aimDir`.
 */
function orientArc(obj, axisDir, aimDir) {
  const y = axisDir.clone().normalize();
  const aim = aimDir.clone().normalize();
  const x = new THREE.Vector3().crossVectors(y, aim);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return obj;
}

/**
 * Pocket for a round-bodied bag. A flat slab applied to a lathe leaves its
 * corners hanging in the air, so this is a curved shell swept at the body's
 * own radius. Lathe axis is local +Y, arc centred on local +Z.
 */
function pocketArc(mat, hwm, { R, arc = deg(76), len = 110, proud = 5, mesh = false, stretch = false }) {
  const g = new THREE.Group();
  const rIn = R - 2, rOut = R + proud;
  const lip = Math.min(proud * 0.9, len * 0.2);
  const prof = [
    new THREE.Vector2(rIn, -len / 2),
    new THREE.Vector2(rOut, -len / 2 + lip),
    new THREE.Vector2(rOut, len / 2 - lip),
    new THREE.Vector2(rIn, len / 2),
  ];
  const geo = new THREE.LatheGeometry(prof, 26, -arc / 2, arc);
  const body = new THREE.Mesh(geo, mesh ? meshPanelMat() : mat);
  g.add(body);
  if (mesh || stretch) {
    const hem = new THREE.Mesh(new THREE.TorusGeometry(rOut * 0.995, 2.2, 5, 26, arc), webbing());
    hem.rotation.x = -Math.PI / 2;
    hem.rotation.z = -arc / 2 + Math.PI / 2;
    hem.position.y = len / 2 - lip;
    g.add(hem);
  } else {
    const zip = new THREE.Mesh(new THREE.TorusGeometry(rOut * 1.002, 1.4, 5, 26, arc), hwm);
    zip.rotation.x = -Math.PI / 2;
    zip.rotation.z = -arc / 2 + Math.PI / 2;
    zip.position.y = len / 2 - lip * 1.6;
    g.add(zip);
    const pull = new THREE.Mesh(new THREE.BoxGeometry(3.5, 13, 2.4), hwm);
    pull.position.set(Math.sin(arc * 0.42) * rOut, len / 2 - lip * 1.6 - 8, Math.cos(arc * 0.42) * rOut);
    g.add(pull);
  }
  return g;
}

/** Storm flap draped over a round body, with strap tails at its edge. */
function flapArc(accent, wm, hwm, { R, len, arc = deg(170) }) {
  const g = new THREE.Group();
  const prof = [
    new THREE.Vector2(R + 1, -len / 2),
    new THREE.Vector2(R + 5, -len / 2 + 7),
    new THREE.Vector2(R + 5, len / 2 - 7),
    new THREE.Vector2(R + 1, len / 2),
  ];
  g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 32, -arc / 2, arc), accent));
  for (const s of [-1, 1]) {
    const a = s * arc * 0.42;
    const strap = new THREE.Mesh(new THREE.BoxGeometry(3.2, len * 0.34, 22), wm);
    strap.position.set(Math.sin(a) * (R + 6), 0, Math.cos(a) * (R + 6));
    strap.rotation.y = a;
    g.add(strap);
    const bk = new THREE.Mesh(new THREE.BoxGeometry(9, 14, 25), hwm);
    bk.position.set(Math.sin(a) * (R + 9), -len * 0.2, Math.cos(a) * (R + 9));
    bk.rotation.y = a;
    g.add(bk);
  }
  return g;
}

/** Criss-cross bungee sampled onto a cylinder so it hugs a round body. */
function bungeeArc(hwm, { R, arc = deg(80), len = 140, n = 4 }) {
  const g = new THREE.Group();
  const cm = cordMat();
  const at = (side, i) => {
    const a = (side * arc) / 2;
    return v3(Math.sin(a) * (R + 2), (i / n - 0.5) * len, Math.cos(a) * (R + 2));
  };
  const span = (p, q) => {
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const y = p.y + (q.y - p.y) * t;
      const a0 = Math.atan2(p.x, p.z), a1 = Math.atan2(q.x, q.z);
      const a = a0 + (a1 - a0) * t;
      pts.push(v3(Math.sin(a) * (R + 2), y, Math.cos(a) * (R + 2)));
    }
    g.add(tubeAlong(pts, 1.7, cm, { segments: 14, radialSegments: 5 }));
  };
  for (let i = 0; i < n; i++) {
    span(at(-1, i), at(1, i + 1));
    span(at(1, i), at(-1, i + 1));
  }
  for (const p of [at(-1, 0), at(1, 0), at(-1, n), at(1, n)]) {
    const hook = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 6), hwm);
    hook.position.copy(p);
    g.add(hook);
  }
  g.traverse((o) => { o.userData.noCollide = true; });
  return g;
}

/** Reflective band that follows a round body. */
function reflectiveArc({ R, arc = deg(60), width = 8 }) {
  const prof = [new THREE.Vector2(R + 1.4, -width / 2), new THREE.Vector2(R + 1.4, width / 2)];
  const m = new THREE.Mesh(new THREE.LatheGeometry(prof, 24, -arc / 2, arc), reflectiveMat());
  m.userData.noCollide = true;
  return m;
}

/** Applied pocket: proud rounded block with its own zip, or a mesh panel. */
function pocketBlock(mat, hwm, { w, h, proud = 5, mesh = false, stretch = false }) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(w, h, proud * 2, 4, Math.min(w, h, proud * 2) * 0.22),
    mesh ? meshPanelMat() : mat
  );
  g.add(body);
  if (mesh || stretch) {
    const hem = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 4.5, proud * 2.1), webbing());
    hem.position.y = h / 2 - 2;
    g.add(hem);
  } else {
    g.add(zipperRun(v3(-w * 0.42, h * 0.34, proud * 0.92), v3(w * 0.42, h * 0.34, proud * 0.92), hwm, { tape: 1.5 }));
  }
  return g;
}

/** Webbing ladder — two rows of raised loop bars. */
function daisyChain(wm, { len, rows = 2, band = 17 }) {
  const g = new THREE.Group();
  for (let r = 0; r < rows; r++) {
    const z = (r - (rows - 1) / 2) * (band + 9);
    const base = new THREE.Mesh(new THREE.BoxGeometry(len, 3.2, band), wm);
    base.position.z = z;
    g.add(base);
    const n = Math.max(3, Math.round(len / 36));
    for (let i = 0; i < n; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(11, 6, band * 1.06), wm);
      bar.position.set(-len / 2 + (i + 0.5) * (len / n), 2.6, z);
      g.add(bar);
    }
  }
  return g;
}

/** Criss-cross bungee over a face, hooked at the four corners. */
function bungeeLattice(hwm, { w, h, n = 4 }) {
  const g = new THREE.Group();
  const cm = cordMat();
  const L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const y = (i / n - 0.5) * h;
    L.push(v3(-w / 2, y, 0));
    R.push(v3(w / 2, y, 0));
  }
  for (let i = 0; i < n; i++) {
    g.add(tubeBetween(L[i], R[i + 1], 1.7, 1.7, cm, 6));
    g.add(tubeBetween(R[i], L[i + 1], 1.7, 1.7, cm, 6));
  }
  for (const p of [L[0], R[0], L[n], R[n]]) {
    const hook = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 5), hwm);
    hook.position.copy(p);
    g.add(hook);
  }
  g.traverse((o) => { o.userData.noCollide = true; });
  return g;
}

function valveDisc(hwm) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 3, 20), hwm);
  disc.rotation.x = Math.PI / 2;
  g.add(disc);
  const nub = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.2, 7, 12), hwm);
  nub.rotation.x = Math.PI / 2;
  nub.position.z = 4;
  g.add(nub);
  return g;
}

function reflectiveStrip(w, h) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.6), reflectiveMat());
  m.userData.noCollide = true;
  return m;
}

/**
 * Shared pocket pass. `faces` maps a face name to a placement callback that
 * knows how big a pocket that surface can carry and how to orient it, so each
 * builder keeps control of where its own surfaces actually are.
 */
function addPockets(grp, feats, mat, hwm, faces) {
  feats.pockets.forEach((pk, i) => {
    const place = faces[pk.face] || faces.side || faces.front || faces.top;
    if (!place) return;
    const kind = pk.type || 'zip';
    const proud = kind === 'slip' ? 3.5 : kind === 'mesh' ? 4 : 5;
    const opts = { proud, mesh: kind === 'mesh', stretch: kind === 'stretch' };
    const make = (w, h) => {
      const g = pocketBlock(mat, hwm, { w, h, ...opts });
      grp.add(g);
      return g;
    };
    // round-bodied builders call make.arc() so the pocket wraps the body
    make.arc = (R, len, arc) => {
      const g = pocketArc(mat, hwm, { R, len, arc, ...opts });
      grp.add(g);
      return g;
    };
    place(make, i, pk);
  });
}

// ---- builders (mm-local, parented to bike anchors) ----------------------

function buildSeatpack(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  // trust the catalogue: caps here are sanity guards, not size levellers
  const len = Math.min(p.mm.len, 720);
  const tailR = Math.min(p.mm.hgt, 260) / 2;
  const noseR = Math.max(tailR * vr.range(0.42, 0.58), 34);
  const widScale = Math.min(Math.min(p.mm.wid, 260) / Math.min(p.mm.hgt, 260), 1.3);
  const shape = feats.shape || 'tapered';
  // real packs are fullest just behind the saddle and shrink from there, and
  // narrow in plan as well (Apidura Expedition quotes 15cm → 5cm nose to tail)
  const belly = vr.range(0.2, 0.3);
  const shoulder = vr.range(0.78, 0.86);    // where the tail starts closing
  const tailWid = vr.range(0.34, 0.46);
  const profileR = (t) => {
    if (shape === 'cylindrical') {
      return t < 0.06 ? tailR * Math.sqrt(t / 0.06) * 0.96 + 2
        : t < shoulder ? tailR
        : tailR * Math.sqrt(Math.max(0, 1 - ((t - shoulder) / (1 - shoulder)) ** 2));
    }
    if (shape === 'wedge') {
      // straight ramp from a slim nose to a square-ish tail
      const r = noseR + (tailR - noseR) * Math.min(t / shoulder, 1);
      return t > shoulder ? r * Math.sqrt(Math.max(0, 1 - ((t - shoulder) / (1 - shoulder)) ** 2)) : Math.max(r, 2);
    }
    if (shape === 'teardrop') {
      // fattest early, drawn out to a fine tail
      const r = t < 0.3 ? noseR + (tailR - noseR) * (t / 0.3) ** 0.6 : tailR * (1 - 0.55 * ((t - 0.3) / 0.7) ** 1.6);
      return Math.max(r, 2);
    }
    if (t < 0.05) return noseR * Math.sqrt(t / 0.05) * 0.96 + 2;
    if (t < belly) return noseR + (tailR - noseR) * ((t - 0.05) / (belly - 0.05)) ** vr.range(0.8, 1.05);
    if (t < shoulder) return tailR;
    return tailR * Math.sqrt(Math.max(0.0, 1 - ((t - shoulder) / (1 - shoulder)) ** 2));
  };
  // A roll closure is not a taper to a point: the body stops where the mouth is
  // and the folds take over. Running the lathe all the way to t=1 buried every
  // fold inside a cone of shell.
  const closure = feats.closure || 'rolltop';
  const bodyEnd = closure === 'rolltop' ? 0.9 : 1;
  const pts = [new THREE.Vector2(0.5, 0)];
  const N = 34;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * bodyEnd;
    pts.push(new THREE.Vector2(Math.max(profileR(t), 0.5), t * len));
  }
  pts.push(new THREE.Vector2(0.5, bodyEnd * len));
  // lathe axis is local +y; the group rotates it to −x, so local +x is world "up"
  const bodyAmp = vr.range(3.2, 4.6);
  const lift = bodyAmp + 1.5; // trim must clear the stuffing, or the shell pokes through
  const lathe = soft(taperAndFlatten(new THREE.LatheGeometry(pts, 44), { len, shoulder, tailWid }), main, {
    amp: bodyAmp, freq: vr.range(0.02, 0.03), seed: vr.seed % 997,
    aoDir: new THREE.Vector3(-1, 0, 0), aoK: 0.8, aoSpan: 0.5,
  });
  lathe.rotation.z = Math.PI / 2; // axis −X: tail behind saddle
  const body = new THREE.Group();
  body.add(lathe);
  // longitudinal panel seams down each side, following the taper
  for (const s of [1, -1]) {
    const sp = [];
    for (let i = 1; i <= 14; i++) {
      const t = (i / 15) * bodyEnd;   // stop with the shell, not past its cut end
      sp.push(v3(-t * len, 0, s * (profileR(t) * widAt(t, tailWid) + 0.6)));
    }
    body.add(seamCurve(main, sp, 1.3));
  }
  body.scale.z = widScale;
  grp.add(body);
  const wm = webbing();
  const hwm = hardware();
  // compression straps: honour the stated count, spread over the body. The
  // buckle rides on the flank, not slung under the belly — a row of buckles
  // dangling below the silhouette is what made these read as barrel hoops.
  const nStraps = feats.compressionStraps ?? 2;
  for (let i = 0; i < nStraps; i++) {
    const t = nStraps === 1 ? 0.55 : 0.34 + (0.42 * i) / Math.max(nStraps - 1, 1) + vr.j(0.02);
    const rr = profileR(t);
    const st = strapAssembly(wm, hwm, {
      r: rr, width: 22, ellipse: widScale * widAt(t, tailWid), angle: deg(-24), tail: i === 0,
    });
    st.rotation.y = Math.PI / 2;
    st.position.x = -t * len;
    grp.add(st);
  }
  // tail closure
  if (closure === 'drawcord') {
    const dc = drawcordEnd(main, hwm, { r: profileR(shoulder) * 0.9, depth: 12 });
    dc.rotation.y = -Math.PI / 2;
    dc.position.x = -len * 0.97;
    dc.scale.x = widScale;
    grp.add(dc);
  } else if (closure === 'zip') {
    grp.add(zipperRun(v3(-len * 0.2, tailR * 0.78, 0), v3(-len * 0.9, tailR * 0.72, 0), hwm, { accentMat: accent }));
  } else if (closure === 'flap') {
    const t = 0.72;
    const fl = flapArc(accent, wm, hwm, { R: profileR(t) + lift, len: len * 0.4, arc: deg(165) });
    orientArc(fl, v3(-1, 0, 0), v3(0, 1, 0));
    fl.position.x = -t * len;
    body.add(fl);
  } else {
    // taperAndFlatten has pinched the tail into a lip; stack the folds off the
    // very end of it, or they sit buried inside the shell and the pack reads as
    // a blunt rounded tube with no closure at all
    const t = bodyEnd;
    // flattening a round mouth makes the lip WIDER than the tube, so size it
    // from the body's own half-width here rather than from the tapered radius
    const cap = rollTop(main, hwm, {
      r: profileR(t), depth: 16, widthScale: widScale * widAt(t, tailWid) * 1.4,
    });
    cap.rotation.y = -Math.PI / 2;  // local +z (fold stack) → world −x, local +x → world +z
    cap.position.x = -t * len;
    body.add(cap);
  }
  if (feats.daisyChains) {
    // sit on the shell at its own station, not at the body's widest radius —
    // referencing tailR left the ladder hovering above a tapering back, and a
    // long span overhung the flattened tail entirely
    const dc = daisyChain(wm, { len: len * 0.3, rows: 2, band: Math.min(tailR * 0.34, 17) });
    dc.position.set(-len * 0.5, profileR(0.5) + lift - 1, 0);
    dc.rotation.z = deg(4);
    grp.add(dc);
  } else {
    const daisy = new THREE.Mesh(new THREE.BoxGeometry(len * 0.28, 3, 20), wm);
    daisy.position.set(-len * 0.5, profileR(0.5) + lift - 2, 0);
    daisy.rotation.z = deg(4);
    grp.add(daisy);
  }
  if (feats.cord) {
    const t = 0.5;
    const lat = bungeeArc(hwm, { R: profileR(t) + lift, arc: deg(84), len: len * 0.4, n: 4 });
    orientArc(lat, v3(-1, 0, 0), v3(0, 1, 0));
    lat.position.x = -t * len;
    body.add(lat);
  }
  if (feats.valve) {
    const vd = valveDisc(hwm);
    vd.position.set(-len * 0.34, tailR * 0.3, tailR * widScale + 1);
    grp.add(vd);
  }
  if (feats.reflective) {
    // on the rear-facing tail panel, which is the surface traffic actually
    // sees — at mid-flank it landed straight across the brand patch
    for (const s of [1, -1]) {
      const t = 0.76;
      const rs = reflectiveArc({ R: profileR(t) * widAt(t, tailWid) + lift, arc: deg(74), width: 16 });
      orientArc(rs, v3(-1, 0, 0), v3(0, -0.2, s));
      rs.position.x = -t * len;
      body.add(rs);
    }
  }
  addPockets(grp, feats, main, hwm, {
    side: (make, i) => {
      const s = i % 2 === 0 ? 1 : -1;
      const t = 0.52 + 0.1 * Math.floor(i / 2);
      const g = make.arc(profileR(t) + lift, Math.min(len * 0.28, 150), deg(74));
      orientArc(g, v3(-1, 0, 0), v3(0, 0.1, s));
      g.position.x = -t * len;
      body.add(g);
    },
    top: (make) => {
      const t = 0.5;
      const g = make.arc(profileR(t) + lift, Math.min(len * 0.26, 140), deg(58));
      orientArc(g, v3(-1, 0, 0), v3(0, 1, 0));
      g.position.x = -t * len;
      body.add(g);
    },
  });
  // Tail UP: a rail-and-post pack is clamped low on the post at the nose and
  // rises toward the rear. (+z rotation drops the tail, so this must be
  // negative — the old comment claimed 'kicks up' while doing the opposite.)
  grp.rotation.z = deg(-11);

  // ---- mounting ----------------------------------------------------------
  // Everything above is built in grp-local mm. The bike's seatpost and saddle
  // rails live in frame coords, so derive the placement from them instead of
  // guessing offsets — a fixed nose X is what left the pack hanging in clear
  // air between the post and the rails.
  const postR = (ctx.geo.seatpostDia || 27.2) / 2;
  const sd = ctx.points.sd;
  const anchorPos = ctx.anchors.seatpack.position;
  // where the seatpost crosses a given frame height
  const postXAt = (yFrame) => ctx.points.seatTop.x + sd.x * ((yFrame - ctx.points.seatTop.y) / sd.y);
  // Hang the pack UNDER the rails. Sitting it on the anchor put the crown of a
  // 300mm-tall pack above the saddle, which no rail-mounted pack does.
  const railY = ctx.rails
    ? (ctx.rails.right[0].y + ctx.rails.right[1].y) / 2
    : anchorPos.y + 46;
  // Hang below the rails, but never so low that the pack fouls the rear tyre —
  // the collision resolver DELETES a bag it cannot place, so an over-eager drop
  // makes the product vanish from the scene rather than merely sit wrong.
  // Clamp lower on the seatpost, not tucked right under the rails — the nose
  // of these packs sits well down the post with the body rising behind it.
  const railTarget = railY - anchorPos.y - profileR(belly) - 62;
  // points.tireR is the tyre's CENTRELINE radius, so the casing reaches a
  // further tireWidth/2 beyond it — using tireR alone under-clears by ~22mm and
  // the pack still fouls the wheel (and gets deleted by the resolver).
  const tyreOuter = ctx.points.tireR + ctx.geo.tireWidth / 2;
  // The pack is tilted tail-down by grp.rotation.z, so its underside keeps
  // falling as it runs back over the wheel. Clearing the tyre at the NOSE is not
  // enough — measure at the station above the rear axle, where the tyre is
  // highest and the droop has already accumulated.
  const tilt = grp.rotation.z;
  const postXHere = postXAt(anchorPos.y);
  const runToAxle = Math.max(0, Math.min(len, postXHere - ctx.points.rearAxle.x));
  const droopAtAxle = runToAxle * Math.tan(tilt);
  const tyreFloor = ctx.points.rearAxle.y + tyreOuter + 18 + profileR(belly)
    + droopAtAxle - anchorPos.y;
  const dropY = Math.min(Math.max(railTarget, tyreFloor), -2);
  grp.position.set(postXAt(anchorPos.y + dropY) - anchorPos.x - postR - 2, dropY, 0);
  grp.userData.noseX = grp.position.x + 30;

  const toLocal = (pFrame) => pFrame.clone().sub(anchorPos).sub(grp.position)
    .applyAxisAngle(v3(0, 0, 1), -grp.rotation.z);
  const postDir = v3(sd.x, sd.y, 0).normalize().applyAxisAngle(v3(0, 0, 1), -grp.rotation.z);
  const postAtLocalY = (ly) => {
    const yFrame = ly + grp.position.y + anchorPos.y;
    return toLocal(v3(postXAt(yFrame), yFrame, 0));
  };
  // Two Hypalon collars clamp the nose to the post. Always drawn: the nose now
  // seats against the post, so these are the join, not a gap-filler.
  for (const dy of [14, -18]) {
    const post = postAtLocalY(dy);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(postR + 4.5, 4.2, 6, 24), wm);
    collar.quaternion.setFromUnitVectors(v3(0, 0, 1), postDir);
    collar.position.set(post.x, dy, 0);
    grp.add(collar);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(9, 13, 15), hwm);
    buckle.position.set(post.x - postR - 4, dy, 0);
    grp.add(buckle);
    // webbing from the collar back onto the pack's nose panel
    const noseX = noseR * 0.25;
    const gap = post.x - postR - noseX;
    if (gap > 2) {
      const web = new THREE.Mesh(new THREE.BoxGeometry(gap + 4, 15, 3.2), wm);
      web.position.set(noseX + gap / 2, dy, 0);
      grp.add(web);
    }
  }
  // rail straps: exactly two (one per side), each terminating in a loop that
  // closes around the real rail rather than stopping in mid-air
  const rails = ctx.rails;
  if (rails) {
    const nRail = feats.railStraps ?? 2;
    for (const side of [1, -1]) {
      const bar = side > 0 ? rails.right : rails.left;
      for (let i = 0; i < Math.max(1, Math.round(nRail / 2)); i++) {
        const f = nRail <= 2 ? 0.45 : 0.3 + 0.35 * i;
        const railPt = toLocal(bar[0].clone().lerp(bar[1], f));
        const tBody = 0.16 + 0.1 * i;
        const from = v3(-tBody * len, profileR(tBody) * 0.72, side * profileR(tBody) * widScale * widAt(tBody, tailWid) * 0.55);
        const to = v3(railPt.x, railPt.y, side * rails.z);
        grp.add(wrapStrap(wm, hwm, { from, to, tubeR: rails.r, width: 15 }));
      }
    }
  }
  const patchT = 0.62;
  const patchZ = profileR(patchT) * widScale * widAt(patchT, tailWid) + lift + 1.5;
  patch(grp, brand, -len * patchT, -tailR * 0.1, patchZ, 74, 0);
  patch(grp, brand, -len * patchT, -tailR * 0.1, -patchZ, 74, Math.PI);
  return shadowify(grp);
}

/**
 * Handlebar bags mount just clear of the bar tops. Keeping the body inboard of
 * the hoods (|z| < barWidth/2 − 26) is what lets it sit tight to the bars
 * instead of floating out past the levers.
 */
function barMount(ctx, r) {
  const bc = ctx.points.barCenter;
  const anchor = ctx.anchors.barroll.position;
  const barR = 16;                 // drop-bar tube radius as drawn in bike.js
  const gap = 26;                  // spacer standoff between bar and pack
  return {
    maxHalfLen: Math.max(ctx.geo.barWidth / 2 - 26, 120),
    x: bc.x + barR + gap + r - anchor.x,   // pack rear face sits `gap` off the bar
    y: bc.y - 4 - anchor.y,
    barR,
    gap,
  };
}

function buildBarroll(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const r = Math.min(p.mm.dia, 260) / 2;
  const mount = barMount(ctx, r);
  const len = Math.min(p.mm.len, mount.maxHalfLen * 2);
  const shape = feats.shape || 'cylindrical';
  const endFlat = vr.range(0.06, 0.1);
  // stuffed roll: cylinder body with gently domed (not spherical) ends
  const prof = [];
  const NP = 28;
  for (let i = 0; i <= NP; i++) {
    const t = i / NP;
    const dome = Math.min(t, 1 - t) / endFlat; // ends flatten quickly (rolled closure)
    let rr = r * (dome >= 1 ? 1 : 0.55 + 0.45 * Math.sqrt(1 - (1 - dome) ** 2));
    if (shape === 'barrel') rr *= 0.9 + 0.1 * Math.sin(t * Math.PI) * 2.2;   // fat waist
    else if (shape === 'tapered') rr *= 1 - 0.16 * t;                         // one end slimmer
    prof.push(new THREE.Vector2(Math.max(Math.min(rr, r * 1.12), 3), (t - 0.5) * len));
  }
  // The profile opens at 0.55r, and a lathe does not cap its ends — so the bag
  // was a tube you could see straight through. Close both mouths.
  prof.unshift(new THREE.Vector2(0.4, -len / 2));
  prof.push(new THREE.Vector2(0.4, len / 2));
  // lathe axis local +y → rotated to +z, so world "down" is local +z
  const bodyAmp = vr.range(2.8, 4.0);
  const lift = bodyAmp + 1.5;
  const body = soft(new THREE.LatheGeometry(prof, 40), main, {
    amp: bodyAmp, freq: vr.range(0.022, 0.032), seed: vr.seed % 991,
    aoDir: new THREE.Vector3(0, 0, 1), aoK: 0.8, aoSpan: 0.5,
  });
  body.rotation.x = Math.PI / 2; // axis along Z
  grp.add(body);
  const wm = webbing();
  const hwm = hardware();
  const closure = feats.closure || 'rolltop';
  for (const s of [1, -1]) {
    if (closure === 'drawcord') {
      const dc = drawcordEnd(main, hwm, { r: r * 0.8, depth: 11 });
      dc.position.z = s * (len / 2 - 2);
      if (s < 0) dc.rotation.y = Math.PI;
      grp.add(dc);
    } else if (closure !== 'harness') {
      // Apidura's roll-down ends: the lip spans nearly the pack's full width.
      // At r*0.72 with no width scale it read as a porthole in a flat disc.
      const cap = rollTop(main, hwm, { r: r * 0.86, depth: 9, widthScale: 1.28, back: false });
      cap.position.z = s * (len / 2 - 3);
      if (s < 0) cap.rotation.y = Math.PI;
      grp.add(cap);
    }
    // seam ring just inboard of each end
    const sr = seamRing(main, r * 0.985, 1.3);
    sr.position.z = s * (len / 2 - Math.min(34, len * 0.1));
    grp.add(sr);
    // Mount. Apidura's Expedition pack rides on two BarSpace spacer modules
    // that hold the pack off the bar, with a stability cord round bar and stem.
    // A thin angled slab bridging nothing was why the roll looked levitated.
    const zAt = s * Math.min(78, len * 0.32);
    const standoff = new THREE.Mesh(new RoundedBoxGeometry(mount.gap + 10, 26, 30, 3, 4), hwm);
    standoff.position.set(-r - mount.gap / 2 + 4, -r * 0.15, zAt);
    standoff.userData.noCollide = true;
    grp.add(standoff);
    // webbing wrapping the bar itself, just behind the standoff. The bar runs
    // along Z, so the torus keeps its default +Z axis — rotating it to X laid
    // the strap across the pack's end face instead of round the bar.
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(mount.barR + 5, 2.6, 6, 20), wm);
    wrap.scale.z = 3.4;
    wrap.position.set(-r - mount.gap - mount.barR + 2, -r * 0.15, zAt);
    wrap.userData.noCollide = true;
    grp.add(wrap);
  }
  if (closure === 'harness') {
    grp.add(harnessCradle(wm, { r, len }));
  } else {
    const nStraps = feats.compressionStraps ?? 2;
    for (let i = 0; i < nStraps; i++) {
      const f = nStraps === 1 ? 0 : (i / (nStraps - 1) - 0.5) * 2;
      const st = strapAssembly(wm, hwm, { r, width: 22, angle: -Math.PI / 2 });
      st.position.z = f * len * vr.range(0.24, 0.3);
      grp.add(st);
    }
  }
  if (feats.cord) {
    const lat = bungeeArc(hwm, { R: r + lift, arc: deg(72), len: len * 0.6, n: 4 });
    orientArc(lat, v3(0, 0, 1), v3(1, 0, 0));
    grp.add(lat);
  }
  if (feats.reflective) {
    // "Reflective graphics" — a pair of short marks near each end, not one
    // white panel down half the pack. scale.y = len*0.5/9 made a billboard.
    for (const s of [1, -1]) {
      const rs = reflectiveArc({ R: r + lift, arc: deg(26), width: 9 });
      orientArc(rs, v3(0, 0, 1), v3(1, -0.5, 0));
      rs.scale.y = Math.min(len * 0.13, 60) / 9;
      rs.position.z = s * len * 0.3;
      grp.add(rs);
    }
  }
  addPockets(grp, feats, main, hwm, {
    front: (make, i) => {
      const g = make.arc(r + lift, Math.min(len * 0.34, 200), deg(70));
      orientArc(g, v3(0, 0, 1), v3(1, -0.15, 0));
      g.position.z = (i % 2 === 0 ? -1 : 1) * len * 0.24;
      grp.add(g);
    },
    side: (make, i) => {
      const g = make.arc(r + lift, Math.min(len * 0.3, 180), deg(62));
      orientArc(g, v3(0, 0, 1), v3(1, 0.5, 0));
      g.position.z = (i % 2 === 0 ? -1 : 1) * len * 0.22;
      grp.add(g);
    },
  });
  patch(grp, brand, r + 2.5, vr.j(r * 0.12), vr.j(len * 0.06), 92, 0).rotation.set(0, Math.PI / 2, 0);
  grp.position.set(mount.x, mount.y, 0);
  grp.userData.halfLen = len / 2;
  grp.userData.radius = r;
  return shadowify(grp);
}

function buildBarbag(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const wm = webbing();
  const hwm = hardware();
  const hasDia = p.dims_cm && p.dims_cm.dia;
  if (hasDia) {
    // barrel bag: soft cylinder along the bars
    const r = Math.min(p.mm.dia, 230) / 2;
    const mount = barMount(ctx, r);
    const len = Math.min(p.mm.len, mount.maxHalfLen * 2);
    const bodyAmp = vr.range(2.6, 3.8);
    const lift = bodyAmp + 1.5;
    const body = soft(new THREE.CapsuleGeometry(r * 0.98, Math.max(len - 2 * r, 6), 10, 30), main, {
      amp: bodyAmp, freq: vr.range(0.024, 0.034), seed: vr.seed % 983,
      bulge: feats.shape === 'barrel' ? boxBulge(r, len / 2, r, r * 0.1) : null,
      aoDir: new THREE.Vector3(0, 0, 1), aoK: 0.81, aoSpan: 0.5,
    });
    body.rotation.x = Math.PI / 2;
    grp.add(body);
    const closure = feats.closure || 'drawcord';
    for (const sgn of [1, -1]) {
      if (closure === 'rolltop') {
        const cap = rollTop(main, hwm, { r: r * 0.7, depth: 8 });
        cap.position.z = sgn * (len / 2 - 3);
        if (sgn < 0) cap.rotation.y = Math.PI;
        grp.add(cap);
      } else {
        const dc = drawcordEnd(main, hwm, { r: r * 0.76, depth: 10 });
        dc.position.z = sgn * (len / 2 - 3);
        if (sgn < 0) dc.rotation.y = Math.PI;
        grp.add(dc);
      }
      const sr = seamRing(main, r * 0.99, 1.2);
      sr.position.z = sgn * (len / 2 - Math.min(28, len * 0.09));
      grp.add(sr);
    }
    const nStraps = feats.compressionStraps ?? 2;
    for (let i = 0; i < nStraps; i++) {
      const f = nStraps === 1 ? 0 : (i / (nStraps - 1) - 0.5) * 2;
      const st = strapAssembly(wm, hwm, { r, width: 20, angle: -Math.PI / 2 });
      st.position.z = f * len * vr.range(0.22, 0.28);
      grp.add(st);
    }
    if (feats.cord) {
      const lat = bungeeArc(hwm, { R: r + lift, arc: deg(70), len: len * 0.55, n: 3 });
      orientArc(lat, v3(0, 0, 1), v3(1, 0, 0));
      grp.add(lat);
    }
    if (feats.reflective) {
      const rs = reflectiveArc({ R: r + lift, arc: deg(30), width: 9 });
      orientArc(rs, v3(0, 0, 1), v3(1, -0.5, 0));
      rs.scale.y = len * 0.45 / 9;
      grp.add(rs);
    }
    addPockets(grp, feats, main, hwm, {
      front: (make, i) => {
        const g = make.arc(r + lift, Math.min(len * 0.32, 180), deg(68));
        orientArc(g, v3(0, 0, 1), v3(1, -0.1, 0));
        g.position.z = (i % 2 === 0 ? -1 : 1) * len * 0.22;
        grp.add(g);
      },
    });
    patch(grp, brand, r + 2.5, vr.j(r * 0.1), vr.j(len * 0.05), 70, 0).rotation.set(0, Math.PI / 2, 0);
    grp.position.set(mount.x, mount.y, 0);
    grp.userData.halfLen = len / 2;
    grp.userData.radius = r;
    return shadowify(grp);
  }
  const w = Math.min(p.mm.len, 400), h = Math.min(p.mm.hgt, 300), d = Math.min(p.mm.wid, 260);
  const body = soft(new RoundedBoxGeometry(d, h, w, 7, Math.min(20, d * 0.3)), main, {
    amp: vr.range(2.2, 3.2), freq: vr.range(0.026, 0.034), seed: vr.seed % 977,
    bulge: boxBulge(d / 2, h / 2, w / 2, Math.min(d, h, w) * vr.range(0.08, 0.13)),
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.45,
  });
  grp.add(body);
  const closure = feats.closure || 'flap';
  if (closure === 'flap') {
    // params are NOT pre-swapped: the rotation below already maps the lid's
    // local X (width) across the bike and its Z (depth) fore-aft. Swapping here
    // too made the lid a shelf as deep as the bag is wide.
    const fl = flapLid(accent, wm, hwm, { w: w * 0.99, d: d * 0.99, drop: h * 0.42 });
    fl.rotation.y = Math.PI / 2;
    fl.position.y = h / 2 + 2;
    grp.add(fl);
  } else if (closure === 'zip') {
    const lid = new THREE.Mesh(new RoundedBoxGeometry(d * 0.94, 18, w * 1.02, 4, 9), accent);
    lid.position.y = h / 2 - 4;
    grp.add(lid);
    grp.add(zipperRun(v3(d / 2 + 1, h / 2 - 12, -w * 0.44), v3(d / 2 + 1, h / 2 - 12, w * 0.44), hwm, { accentMat: accent }));
  } else if (closure === 'rolltop') {
    const cap = rollTop(main, hwm, { r: Math.min(d, w) * 0.4, depth: 9 });
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = h / 2 - 2;
    grp.add(cap);
  } else {
    const lid = new THREE.Mesh(new RoundedBoxGeometry(d * 0.94, 18, w * 1.02, 4, 9), accent);
    lid.position.y = h / 2 - 4;
    grp.add(lid);
  }
  // horizontal panel seam a third of the way up
  const seam = seamStrip(main, d + 2.4, 2.6, w * 0.97);
  seam.position.y = -h / 6 + vr.j(h * 0.05);
  grp.add(seam);
  const nStraps = feats.compressionStraps ?? 2;
  for (let i = 0; i < nStraps; i++) {
    const f = nStraps === 1 ? 0 : (i / (nStraps - 1) - 0.5) * 2;
    webbingRun(grp, wm, hwm, {
      from: v3(d / 2, h * 0.42, f * w * 0.3), to: v3(d / 2, -h * 0.46, f * w * 0.3),
      width: 22, normal: 'x', proud: 1.0,
    });
  }
  if (feats.cord) {
    const lat = bungeeLattice(hwm, { w: w * 0.8, h: h * 0.6, n: 3 });
    lat.rotation.y = Math.PI / 2;
    lat.position.x = d / 2 + 2;
    grp.add(lat);
  }
  if (feats.reflective) {
    const rs = reflectiveStrip(w * 0.62, 10);
    rs.rotation.y = Math.PI / 2;
    rs.position.set(d / 2 + 2, -h * 0.34, 0);
    grp.add(rs);
  }
  if (feats.daisyChains) {
    const dcn = daisyChain(wm, { len: w * 0.7, rows: 2, band: Math.min(h * 0.16, 16) });
    dcn.rotation.y = Math.PI / 2;
    dcn.rotation.z = Math.PI / 2;
    dcn.position.set(d / 2 + 2, h * 0.1, 0);
    grp.add(dcn);
  }
  addPockets(grp, feats, main, hwm, {
    front: (make, i) => {
      const g = make(Math.min(w * 0.5, 170), h * 0.5);
      g.position.set(d / 2 + 1, -h * 0.08 - i * 4, 0);
      g.rotation.y = Math.PI / 2;
    },
    side: (make, i) => {
      const s2 = i % 2 === 0 ? 1 : -1;
      const g = make(Math.min(d * 0.7, 120), h * 0.5);
      g.position.set(0, -h * 0.05, s2 * (w / 2 + 1));
      if (s2 < 0) g.rotation.y = Math.PI;
    },
    top: (make) => {
      const g = make(Math.min(w * 0.5, 150), Math.min(d * 0.7, 120));
      g.position.set(0, h / 2 + 1, 0);
      g.rotation.x = -Math.PI / 2;
    },
  });
  patch(grp, brand, d / 2 + 1.6, h * 0.12 + vr.j(h * 0.06), vr.j(w * 0.08), 76, 0).rotation.set(0, Math.PI / 2, 0);
  const P = ctx.points;
  const bc = P.barCenter, anchor = ctx.anchors.barroll.position;
  // a deep bag would otherwise hang into the front wheel: ride it high enough
  // that its underside clears the tyre at the bag's forwardmost point
  const wheelR = P.tireR + ctx.geo.tireWidth / 2;
  const dx = Math.abs(bc.x + 18 + d - P.frontAxle.x);
  const wheelTop = P.frontAxle.y + (dx < wheelR ? Math.sqrt(wheelR * wheelR - dx * dx) : 0);
  const bottomY = Math.max(wheelTop + 24, bc.y - h + 14);
  grp.position.set(bc.x + 18 + d / 2 - anchor.x, bottomY + h / 2 - anchor.y, 0);
  return shadowify(grp);
}

function buildRandobag(p, brand, main, accent) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const w = Math.min(p.mm.len, 440), h = Math.min(p.mm.hgt, 380), d = Math.min(p.mm.wid, 340);
  const body = soft(new RoundedBoxGeometry(d, h, w, 7, Math.min(20, d * 0.28)), main, {
    amp: vr.range(2.4, 3.4), freq: vr.range(0.024, 0.032), seed: vr.seed % 971,
    bulge: boxBulge(d / 2, h / 2, w / 2, Math.min(d, h, w) * vr.range(0.08, 0.13)),
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.45,
  });
  body.position.y = h / 2;
  grp.add(body);
  const wm = webbing();
  const hwm = hardware();
  const closure = feats.closure || 'flap';
  if (closure === 'flap') {
    const fl = flapLid(accent, wm, hwm, { w: w * 1.02, d: d * 1.02, drop: h * 0.4 });
    fl.rotation.y = Math.PI / 2;
    fl.position.y = h + 2;
    grp.add(fl);
  } else if (closure === 'rolltop') {
    const cap = rollTop(main, hwm, { r: Math.min(d, w) * 0.42, depth: 10 });
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = h;
    grp.add(cap);
  } else {
    const lid = new THREE.Mesh(new RoundedBoxGeometry(d * 1.04, 16, w * 1.05, 4, 8), accent);
    lid.position.y = h - 2;
    grp.add(lid);
    if (closure === 'zip') {
      grp.add(zipperRun(v3(d / 2 + 1, h - 12, -w * 0.46), v3(d / 2 + 1, h - 12, w * 0.46), hwm, { accentMat: accent }));
    }
  }
  const seam = seamStrip(main, d + 2.4, 2.6, w * 0.97);
  seam.position.y = h * vr.range(0.3, 0.42);
  grp.add(seam);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(d * 0.9, 6, 26), wm);
  strap.position.set(0, h + 4, 0);
  grp.add(strap);
  const nStraps = feats.compressionStraps ?? 2;
  for (let i = 0; i < nStraps; i++) {
    const f = nStraps === 1 ? 0 : (i / (nStraps - 1) - 0.5) * 2;
    webbingRun(grp, wm, hwm, {
      from: v3(d / 2, h * 0.98, f * w * 0.28), to: v3(d / 2, h * 0.12, f * w * 0.28),
      width: 22, normal: 'x', proud: 1.0, buckleAt: 0.7,
    });
  }
  if (feats.cord) {
    const lat = bungeeLattice(hwm, { w: w * 0.8, h: h * 0.55, n: 3 });
    lat.rotation.y = Math.PI / 2;
    lat.position.set(d / 2 + 2, h * 0.5, 0);
    grp.add(lat);
  }
  if (feats.reflective) {
    const rs = reflectiveStrip(w * 0.6, 11);
    rs.rotation.y = Math.PI / 2;
    rs.position.set(d / 2 + 2, h * 0.2, 0);
    grp.add(rs);
  }
  if (feats.daisyChains) {
    const dcn = daisyChain(wm, { len: w * 0.7, rows: 2, band: 16 });
    dcn.rotation.set(0, Math.PI / 2, Math.PI / 2);
    dcn.position.set(d / 2 + 2, h * 0.62, 0);
    grp.add(dcn);
  }
  addPockets(grp, feats, main, hwm, {
    front: (make, i) => {
      const g = make(Math.min(w * 0.55, 190), h * 0.34);
      g.position.set(d / 2 + 1, h * (0.3 + i * 0.06), 0);
      g.rotation.y = Math.PI / 2;
    },
    side: (make, i) => {
      const s2 = i % 2 === 0 ? 1 : -1;
      const g = make(Math.min(d * 0.7, 150), h * 0.4);
      g.position.set(0, h * 0.42, s2 * (w / 2 + 1));
      if (s2 < 0) g.rotation.y = Math.PI;
    },
    lid: (make) => {
      const g = make(Math.min(w * 0.5, 160), Math.min(d * 0.6, 130));
      g.position.set(0, h + 10, 0);
      g.rotation.x = -Math.PI / 2;
    },
  });
  patch(grp, brand, d / 2 + 1.6, h * vr.range(0.5, 0.62), vr.j(w * 0.08), 84, 0).rotation.set(0, Math.PI / 2, 0);
  return shadowify(grp);
}

/** Where a seam line crosses the outline — keeps stitching inside the panel. */
function crossSpan(poly, at, axis) {
  const a = axis === 'x' ? 'x' : 'y', b = axis === 'x' ? 'y' : 'x';
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    if ((p[a] - at) * (q[a] - at) > 0) continue;
    const denom = q[a] - p[a];
    if (Math.abs(denom) < 1e-6) continue;
    const t = (at - p[a]) / denom;
    const v = p[b] + (q[b] - p[b]) * t;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return hi > lo ? { lo, hi } : null;
}

function insetPoly(points, inset) {
  const c = points.reduce((a, p) => a.add(p.clone()), new THREE.Vector3()).multiplyScalar(1 / points.length);
  return points.map((p) => p.clone().lerp(c, inset / p.distanceTo(c)));
}

/**
 * Offset each EDGE along its own inward normal by its own amount, then
 * re-intersect to rebuild the corners. insetPoly moves vertices toward the
 * centroid instead, which gives a wildly uneven perpendicular clearance —
 * acute corners barely move, obtuse ones move a lot — so a frame bag ended up
 * sunk into the down tube at one corner and floating off the seat tube at
 * another. `insets[i]` applies to the edge points[i] → points[i+1].
 */
function offsetPolyEdges(points, insets) {
  const n = points.length;
  const c = points.reduce((a, p) => a.add(p.clone()), new THREE.Vector3()).multiplyScalar(1 / n);
  const lines = points.map((p, i) => {
    const q = points[(i + 1) % n];
    const d = q.clone().sub(p).setZ(0).normalize();
    let nor = v3(-d.y, d.x, 0);
    if (nor.dot(c.clone().sub(p)) < 0) nor.negate();   // point it inward
    return { p: p.clone().addScaledVector(nor, insets[i] ?? 0), d };
  });
  const out = [];
  for (let i = 0; i < n; i++) {
    const A = lines[(i - 1 + n) % n], B = lines[i];
    const den = A.d.x * B.d.y - A.d.y * B.d.x;
    if (Math.abs(den) < 1e-6) { out.push(B.p.clone()); continue; }   // parallel: no corner to build
    const t = ((B.p.x - A.p.x) * B.d.y - (B.p.y - A.p.y) * B.d.x) / den;
    out.push(A.p.clone().addScaledVector(A.d, t));
  }
  return out;
}

/** Frame-bag boundary: hug the tubes, tucking slightly under the top tube. */
function framePanelPoly(ctx) {
  const r = ctx.frameEdgeR;
  if (!r) return insetPoly(ctx.framePoly, 14);
  // edges are [seat tube, top tube, head tube, down tube]; the top tube inset is
  // a shade under its radius so the fabric disappears behind the tube and reads
  // as compressed up against it rather than hanging below it
  return offsetPolyEdges(ctx.framePoly, [r[0] + 3, r[1] - 1, r[2] + 3, r[3] + 2]);
}

/** Sutherland–Hodgman against one half-plane; keeps the side where (q−p0)·n ≤ 0. */
function clipHalfPlane(poly, p0, n) {
  const out = [];
  const d = (q) => (q.x - p0.x) * n.x + (q.y - p0.y) * n.y;
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    const dA = d(A), dB = d(B);
    if (dA <= 0) out.push(A.clone());
    if ((dA < 0 && dB > 0) || (dA > 0 && dB < 0)) out.push(A.clone().lerp(B, dA / (dA - dB)));
  }
  return out;
}

function buildFrameFull(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const full = framePanelPoly(ctx);
  // Fit the catalogue panel INSIDE the triangle instead of always filling it.
  // Ignoring p.mm.len/hgt drew a 300x180mm Backcountry 2.5L at the same size as
  // a 546x502mm Ripio XL — every full pack was the same object.
  const ttA = full[1], ttB = full[2];              // seat-side → head-side along TT
  const ttDir = ttB.clone().sub(ttA).normalize();
  const down = v3(ttDir.y, -ttDir.x, 0).normalize();
  const downSign = down.y > 0 ? -1 : 1;            // make sure it points at the BB
  down.multiplyScalar(downSign);
  const runLen = Math.min(p.mm.len, ttA.distanceTo(ttB));
  const drop = Math.min(p.mm.hgt, 520);
  let poly = clipHalfPlane(full, ttB.clone().addScaledVector(ttDir, -runLen), ttDir.clone().negate());
  poly = clipHalfPlane(poly, ttA.clone().addScaledVector(down, drop), down);
  if (poly.length < 3) poly = full;                // degenerate catalogue dims: fall back
  const anchor = ctx.anchors.framebag.position;
  const shape = new THREE.Shape();
  poly.forEach((pt, i) => (i === 0 ? shape.moveTo(pt.x - anchor.x, pt.y - anchor.y) : shape.lineTo(pt.x - anchor.x, pt.y - anchor.y)));
  const depth = Math.min(p.mm.wid, 140);
  const bevel = 7;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3,
    curveSegments: 4, steps: 1,
  });
  geo.translate(0, 0, -depth / 2);
  const local = poly.map((pt) => ({ x: pt.x - anchor.x, y: pt.y - anchor.y }));
  const mid = poly.reduce((acc, q) => acc.add(q.clone()), new THREE.Vector3()).multiplyScalar(1 / poly.length).sub(anchor);
  // Trim must key off the panel's real extent — the old fixed offsets (−150,
  // −120, 170×90 pockets) assumed a full-triangle panel and now that small
  // products get small panels they would hang in open air beside the bag.
  const bx = local.reduce((m, q) => Math.max(m, Math.abs(q.x - mid.x)), 0);
  const by = local.reduce((m, q) => Math.max(m, Math.abs(q.y - mid.y)), 0);
  const sA = mid.x + vr.j(bx * 0.1) - bx * 0.42, sB = mid.x + vr.j(bx * 0.1) + bx * 0.3, sY = mid.y + by * 0.3;
  const seams = [{ axis: 'x', at: sA }, { axis: 'x', at: sB }, { axis: 'y', at: sY }];
  const bulgeAmt = Math.min(depth * vr.range(0.2, 0.28), 20);
  // tessellate the flat faces so the panels can actually bulge
  const body = soft(subdivideXY(geo, 34), main, {
    amp: vr.range(2.6, 3.8), freq: vr.range(0.017, 0.024), seed: vr.seed % 967, flatAxis: 'z',
    bulge: shapeBulge(local, bulgeAmt, seams),
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.78, aoSpan: 0.5,
  });
  grp.add(body);
  const seamZ = depth / 2 + bevel + bulgeAmt * 0.28 + 1.6;
  const patchZ = depth / 2 + bevel + bulgeAmt * 0.85 + 1.6;
  // zipper along the top edge
  const a = poly[1].clone().sub(anchor), b = poly[2].clone().sub(anchor);
  a.z = b.z = depth / 2 - 8;
  const zipDir = b.clone().sub(a);
  const za = a.clone().addScaledVector(zipDir, 0.06).add(v3(0, -9, 0));
  const zb = a.clone().addScaledVector(zipDir, 0.94).add(v3(0, -9, 0));
  // Use the real zip helper (tape + teeth + slider + pull) rather than a bare
  // rod, and honour a declared roll closure — the Ortlieb RC line was rendering
  // identically to its Tizip siblings because nothing branched on it.
  if (feats.closure === 'rolltop') {
    const mouth = rollTop(main, hardware(), { r: zipDir.length() * 0.5, depth: 14, rings: 2, widthScale: 0.5 });
    mouth.rotation.x = -Math.PI / 2;
    mouth.position.copy(za.clone().lerp(zb, 0.5)).add(v3(0, 6, 0));
    grp.add(mouth);
  } else {
    grp.add(zipperRun(za, zb, hardware(), { accentMat: accent }));
  }
  // quilted panel divisions, sitting in the pinch the bulge leaves for them
  const hSpan = crossSpan(local, sY, 'y');
  for (const s of [1, -1]) {
    for (const sx of [sA, sB]) {
      const v = crossSpan(local, sx, 'x');
      if (!v) continue;
      const sm = seamStrip(main, 3.0, Math.max(v.hi - v.lo - 18, 20), 2.8);
      sm.position.set(sx, (v.lo + v.hi) / 2, s * seamZ);
      grp.add(sm);
    }
    if (hSpan) {
      const horiz = seamStrip(main, Math.max(hSpan.hi - hSpan.lo - 18, 20), 3.0, 2.8);
      horiz.position.set((hSpan.lo + hSpan.hi) / 2, sY, s * seamZ);
      grp.add(horiz);
    }
  }
  const wmF = webbing();
  const hwmF = hardware();
  if (feats.closure === 'zip') {
    const zy = mid.y - by * 0.35;
    const zs = crossSpan(local, zy, 'y');
    if (zs) grp.add(zipperRun(v3(zs.lo + 14, zy, seamZ), v3(zs.hi - 14, zy, seamZ), hwmF, { accentMat: accent }));
  }
  if (feats.daisyChains) {
    const dcn = daisyChain(wmF, { len: Math.min(150, bx * 1.1), rows: 2, band: 15 });
    dcn.position.set(mid.x - bx * 0.1, mid.y - by * 0.55, seamZ);
    grp.add(dcn);
  }
  if (feats.reflective) {
    const ry = mid.y - by * 0.62;
    const rspan = crossSpan(local, ry, 'y');
    for (const s of [1, -1]) {
      const rs = reflectiveStrip(Math.min(150, rspan ? (rspan.hi - rspan.lo) * 0.6 : bx), 10);
      rs.position.set(rspan ? (rspan.lo + rspan.hi) / 2 : mid.x, ry, s * seamZ);
      grp.add(rs);
    }
  }
  addPockets(grp, feats, main, hwmF, {
    side: (make, i) => {
      const s2 = i % 2 === 0 ? 1 : -1;
      const g = make(Math.min(170, bx * 1.2), Math.min(90, by * 0.8));
      g.position.set(mid.x + vr.j(bx * 0.1) - bx * 0.14, mid.y + by * 0.18 - i * 12, s2 * seamZ);
      if (s2 < 0) g.rotation.y = Math.PI;
    },
  });
  // Stability straps to the three tubes the panel actually touches. Apidura
  // quotes eight on the Expedition Full (3 top / 3 down / 2 seat); without any
  // of them the panel read as a decal floating in the triangle.
  const straps = feats.straps || {};
  const asLocal = (q) => v3(q.x - anchor.x, q.y - anchor.y, 0);
  const edgeOf = (i, j) => [asLocal(poly[i % poly.length]), asLocal(poly[j % poly.length])];
  const ttI = poly.indexOf(poly.reduce((hi, q) => (q.y > hi.y ? q : hi), poly[0]));
  frameStraps(grp, wmF, hwmF, {
    edge: [asLocal(ttA), asLocal(ttB)], count: straps.topTube ?? 3,
    tubeR: TUBE_R.topTube, depth, normal: v3(0, 1, 0),
  });
  // lower edge of the clipped panel rides the down tube only when it reaches it
  const lowest = poly.reduce((lo, q) => (q.y < lo.y ? q : lo), poly[0]);
  if (lowest.distanceTo(ctx.framePoly[0]) < 90) {
    frameStraps(grp, wmF, hwmF, {
      edge: edgeOf(poly.indexOf(lowest), poly.indexOf(lowest) + 1),
      count: straps.downTube ?? 3, tubeR: TUBE_R.downTube, depth, normal: down.clone().negate(),
    });
  }
  const patchW = Math.max(40, Math.min(60, p.mm.len * 0.15, p.mm.hgt * 0.3));
  patch(grp, brand, mid.x, mid.y - 60, patchZ, patchW, 0);
  patch(grp, brand, mid.x, mid.y - 60, -patchZ, patchW, Math.PI);
  return shadowify(grp);
}

/** Split large triangles of an extruded face so displacement has vertices to move. */
function subdivideXY(geo, target) {
  const src = geo.toNonIndexed();
  const pos = src.attributes.position;
  const nor = src.attributes.normal;
  const uv = src.attributes.uv;
  const outP = [], outN = [], outU = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const na = new THREE.Vector3(), nb = new THREE.Vector3(), nc = new THREE.Vector3();
  const ua = new THREE.Vector2(), ub = new THREE.Vector2(), uc = new THREE.Vector2();
  const push = (p0, p1, p2, n0, n1, n2, t0, t1, t2, depth) => {
    const e = Math.max(p0.distanceTo(p1), p1.distanceTo(p2), p2.distanceTo(p0));
    if (e < target || depth > 4) {
      outP.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      outN.push(n0.x, n0.y, n0.z, n1.x, n1.y, n1.z, n2.x, n2.y, n2.z);
      outU.push(t0.x, t0.y, t1.x, t1.y, t2.x, t2.y);
      return;
    }
    const m01 = p0.clone().lerp(p1, 0.5), m12 = p1.clone().lerp(p2, 0.5), m20 = p2.clone().lerp(p0, 0.5);
    const q01 = n0.clone().lerp(n1, 0.5).normalize(), q12 = n1.clone().lerp(n2, 0.5).normalize(), q20 = n2.clone().lerp(n0, 0.5).normalize();
    const w01 = t0.clone().lerp(t1, 0.5), w12 = t1.clone().lerp(t2, 0.5), w20 = t2.clone().lerp(t0, 0.5);
    push(p0, m01, m20, n0, q01, q20, t0, w01, w20, depth + 1);
    push(m01, p1, m12, q01, n1, q12, w01, t1, w12, depth + 1);
    push(m20, m12, p2, q20, q12, n2, w20, w12, t2, depth + 1);
    push(m01, m12, m20, q01, q12, q20, w01, w12, w20, depth + 1);
  };
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    na.fromBufferAttribute(nor, i); nb.fromBufferAttribute(nor, i + 1); nc.fromBufferAttribute(nor, i + 2);
    if (uv) { ua.fromBufferAttribute(uv, i); ub.fromBufferAttribute(uv, i + 1); uc.fromBufferAttribute(uv, i + 2); }
    push(a.clone(), b.clone(), c.clone(), na.clone(), nb.clone(), nc.clone(), ua.clone(), ub.clone(), uc.clone(), 0);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(outP, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(outN, 3));
  // ExtrudeGeometry hands back UVs in raw millimetres, which tiles the weave
  // thousands of times and greys it out — re-derive them at fabric scale.
  for (let i = 0; i < outP.length / 3; i++) {
    outU[i * 2] = outP[i * 3] / 150;
    outU[i * 2 + 1] = outP[i * 3 + 1] / 150;
  }
  out.setAttribute('uv', new THREE.Float32BufferAttribute(outU, 2));
  geo.dispose();
  src.dispose();
  return out;
}

function buildFrameHalf(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const anchor = ctx.anchors.framebag.position;
  const panel = framePanelPoly(ctx);
  const a = panel[1].clone(), b = panel[2].clone(); // seat-side → head-side along TT
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const h = Math.min(p.mm.hgt, 300);
  // Honour the catalogue length. Spanning 4%→96% of the top tube regardless of
  // p.mm.len made a 205mm Racing pack the same object as a 490mm Expedition.
  // Real half packs are pushed forward against the head tube.
  const ttDir = b.clone().sub(a).normalize();
  const ttLen = a.distanceTo(b);
  const runLen = Math.min(p.mm.len, ttLen - 36);
  const inB = b.clone().addScaledVector(ttDir, -18);
  const inA = inB.clone().addScaledVector(ttDir, -runLen);
  const shape = new THREE.Shape();
  // wedge: full depth at the seat-tube end, tapering toward the head tube
  const hFront = h * 0.62;
  const pts = [inA, inB, v3(inB.x - 22, inB.y - hFront), v3(inA.x + 16, inA.y - h)];
  const L = pts.map((pt) => v3(pt.x - anchor.x, pt.y - anchor.y, 0));
  shape.moveTo(L[0].x, L[0].y);
  shape.lineTo(L[1].x, L[1].y);
  // soft goods, not plywood — round the two lower corners
  const fillet = Math.min(26, h * 0.3, runLen * 0.2);
  shape.lineTo(L[2].x + fillet * 0.2, L[2].y + fillet);
  shape.quadraticCurveTo(L[2].x, L[2].y, L[2].x - fillet, L[2].y);
  shape.lineTo(L[3].x + fillet, L[3].y);
  shape.quadraticCurveTo(L[3].x, L[3].y, L[3].x, L[3].y + fillet);
  shape.lineTo(L[0].x, L[0].y);
  const depth = Math.min(p.mm.wid, 130);
  const bevel = 6;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4, steps: 1,
  });
  geo.translate(0, 0, -depth / 2);
  const mid = v3((pts[0].x + pts[2].x) / 2 - anchor.x, (pts[0].y + pts[2].y) / 2 - anchor.y + 6);
  const local = pts.map((pt) => ({ x: pt.x - anchor.x, y: pt.y - anchor.y }));
  const hA = mid.x + vr.j(22) + 40, hB = mid.x + vr.j(22) - 120;
  const seams = [{ axis: 'x', at: hA }, { axis: 'x', at: hB }];
  const bulgeAmt = Math.min(depth * vr.range(0.2, 0.28), 18);
  grp.add(soft(subdivideXY(geo, 30), main, {
    amp: vr.range(2.4, 3.6), freq: vr.range(0.018, 0.026), seed: vr.seed % 953, flatAxis: 'z',
    bulge: shapeBulge(local, bulgeAmt, seams, 48),
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.78, aoSpan: 0.5,
  }));
  const za = pts[0].clone().sub(anchor).add(v3(14, -12, depth / 2 - 6));
  const zbv = pts[1].clone().sub(anchor).add(v3(-14, -12, depth / 2 - 6));
  grp.add(zipperRun(za, zbv, hardware(), { accentMat: accent }));
  const seamZ = depth / 2 + bevel + bulgeAmt * 0.28 + 1.4;
  for (const s of [1, -1]) {
    for (const sx of [hA, hB]) {
      const v = crossSpan(local, sx, 'x');
      if (!v) continue;
      const sm = seamStrip(main, 2.6, Math.max(v.hi - v.lo - 16, 18), 2.4);
      sm.position.set(sx, (v.lo + v.hi) / 2, s * seamZ);
      grp.add(sm);
    }
  }
  if (feats.reflective) {
    for (const s of [1, -1]) {
      const rs = reflectiveStrip(120, 9);
      rs.position.set(mid.x - 30, mid.y - h * 0.3, s * seamZ);
      grp.add(rs);
    }
  }
  addPockets(grp, feats, main, hardware(), {
    side: (make, i) => {
      const s2 = i % 2 === 0 ? 1 : -1;
      const g = make(150, Math.min(h * 0.5, 80));
      g.position.set(mid.x + vr.j(16), mid.y - i * 10, s2 * seamZ);
      if (s2 < 0) g.rotation.y = Math.PI;
    },
  });
  // straps to the top tube (and one down low toward the down tube)
  const strapCounts = feats.straps || {};
  frameStraps(grp, webbing(), hardware(), {
    edge: [L[0].clone(), L[1].clone()],
    count: strapCounts.topTube ?? 3, tubeR: TUBE_R.topTube, depth,
  });
  const patchZ = depth / 2 + bevel + bulgeAmt * 0.85 + 1.4;
  const patchW = Math.max(38, Math.min(56, p.mm.len * 0.16, h * 0.34));
  patch(grp, brand, mid.x - 40, mid.y, patchZ, patchW, 0);
  patch(grp, brand, mid.x - 40, mid.y, -patchZ, patchW, Math.PI);
  return shadowify(grp);
}

/**
 * Rear top-tube sack: same construction, but it hangs UNDER the tube at the
 * seat end rather than sitting on top of it by the stem.
 */
function buildToptubeRear(p, brand, main, accent, ctx, side) {
  const grp = buildToptube(p, brand, main, accent, ctx, side, 'toptubeRear');
  const h = Math.min(p.mm.hgt, 220);
  grp.position.y -= h + 26;   // below the tube, not perched on it
  return grp;
}

// NOTE: the builder call signature is (product, brand, main, accent, ctx, side) —
// anchorName must come AFTER `side`, or it receives the side integer and the
// anchor lookup silently becomes ctx.anchors[1].
function buildToptube(p, brand, main, accent, ctx, side, anchorName = 'toptube') {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const len = Math.min(p.mm.len, 460), h = Math.min(p.mm.hgt, 220), w = Math.min(p.mm.wid, 170);
  const P = ctx.points;
  const anchor = ctx.anchors[anchorName].position;
  const hd = v3(P.hd.x, P.hd.y, 0);
  const ttSeat = P.seatTop.clone().addScaledVector(v3(P.sd.x, P.sd.y, 0), -12);
  const ttHead = P.headTop.clone().addScaledVector(hd, 30);
  const ang = Math.atan2(ttHead.y - ttSeat.y, ttHead.x - ttSeat.x);
  const slope = (ttHead.y - ttSeat.y) / (ttHead.x - ttSeat.x);
  const ttR = Math.min(Math.max(anchor.y - ttHead.y, 10), 26); // anchor sits on the tube crown
  const EMBED = 10;
  // With the base plane parallel to the tube, the tube centreline stays at a
  // constant height in bag space — so the underside can be a fixed channel.
  const tubeY = EMBED - ttR;
  const chanR = Math.min(ttR + 2, w / 2 - 3);
  const corner = Math.min(w * 0.22, h * 0.3, 12); // keep the base broad and flat
  const bulge = boxBulge(len / 2, h / 2, w / 2, Math.min(len, h, w) * 0.09);
  // Tailfin's own copy: "specially sculpted 3D welded shapes eliminate knee
  // rub". These bags are full height at the seat-tube end and taper to a slim
  // nose at the stem, narrowing in plan too. A constant-section box reads as a
  // pencil case strapped on top.
  const NOSE_H = 0.46, NOSE_W = 0.62;        // fraction of full size at the nose
  // t = 0 at the geometry's -x end, 1 at its +x end. The nose (slim end) is the
  // -x end, which is the one that points forward once the group is placed.
  const hFactor = (t) => 1 + (NOSE_H - 1) * (1 - t) ** 1.35;
  const wFactor = (t) => 1 + (NOSE_W - 1) * (1 - t) ** 1.35;
  /** Body height at a group-local x, so trim can follow the taper. */
  const hAtLocal = (x) => {
    const t = Math.min(Math.max((x - (-len / 2 + 10)) / len + 0.5, 0), 1);
    return h * hFactor(t);
  };
  const shapedBox = (() => {
    const g = new RoundedBoxGeometry(len, h, w, 8, corner);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(Math.max(pos.getX(i) / len + 0.5, 0), 1);
      // scale about the BASE, not the centre — scaling about the centre lifts
      // the underside as it lowers the crown, floating the bag off the tube
      pos.setY(i, -h / 2 + (pos.getY(i) + h / 2) * hFactor(t));
      pos.setZ(i, pos.getZ(i) * wFactor(t));
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  })();
  const body = soft(shapedBox, main, {
    amp: vr.range(1.7, 2.5), freq: vr.range(0.034, 0.046), seed: vr.seed % 937,
    bulge: (x, y, z, nx, ny, nz) => {
      if (ny < -0.6) {
        // hollow the underside so the tube nests into it instead of hovering
        const s = chanR * chanR - z * z;
        return s > 0 ? -Math.max(tubeY + Math.sqrt(s), 0) : 0;
      }
      return bulge(x, y, z, nx, ny, nz);
    },
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.45,
  });
  body.position.set(-len / 2 + 10, h / 2, 0);
  grp.add(body);
  // the zip must ride the tapered crown, or it juts out past the thin end
  const zip = tubeBetween(
    v3(-len + 24, hAtLocal(-len + 24) - 3, 0),
    v3(-2, hAtLocal(-2) - 3, 0), 2, 2, hardware(), 8);
  grp.add(zip);
  // side panel seams
  for (const s of [1, -1]) {
    const sm = seamStrip(main, len * 0.92, 2.4, 2.2);
    sm.position.set(-len / 2 + 10, h * 0.34, s * (w / 2 + 1.6));
    grp.add(sm);
  }
  const wm = webbing();
  const hwm = hardware();
  // velcro wraps that close around the tube; their upper arc hides inside the bag
  for (const t of [0.14, 0.5, 0.86]) {
    const px = 10 - len * t;
    const wrap = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(ttR + 3, 1.9, 6, 28), wm);
    band.scale.z = 6;
    wrap.add(band);
    const tab = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 24), hwm);
    tab.position.set(0, -(ttR + 5), 0);
    wrap.add(tab);
    wrap.rotation.y = Math.PI / 2;
    wrap.position.set(px, tubeY, 0);
    wrap.traverse((o) => { o.userData.noCollide = true; });
    grp.add(wrap);
  }
  // front anchor strap around the head tube — repositioned after collision
  // resolution so it keeps reaching the tube if the bag gets nudged back
  const ring = new THREE.Mesh(new THREE.TorusGeometry(28, 2.1, 6, 28), wm);
  ring.scale.z = 4;
  ring.userData.noCollide = true;
  grp.add(ring);
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(1, 4.5, 22).translate(0.5, 0, 0), wm);
  tongue.userData.noCollide = true;
  grp.add(tongue);
  const target = P.headTop.clone().addScaledVector(hd, 34);
  grp.userData.reseat = (toLocal, toLocalDir) => {
    const lp = toLocal(target);
    ring.position.copy(lp);
    ring.quaternion.setFromUnitVectors(v3(0, 0, 1), toLocalDir(hd).normalize());
    const from = v3(6, h * 0.12, 0);
    const d = lp.clone().sub(from);
    tongue.position.copy(from);
    tongue.rotation.z = Math.atan2(d.y, d.x);
    tongue.scale.x = Math.max(d.length() - 4, 2);
  };
  patch(grp, brand, -len / 2, h * 0.55, w / 2 + 1.6, Math.min(70, len * 0.6), 0);
  patch(grp, brand, -len / 2, h * 0.55, -(w / 2 + 1.6), Math.min(70, len * 0.6), Math.PI);
  grp.rotation.z = ang;
  const originX = P.headTop.x - 38;
  const crownY = ttHead.y + (originX - ttHead.x) * slope + ttR;
  grp.position.set(originX - anchor.x, crownY - EMBED - anchor.y, 0);
  grp.userData.bodyLen = len;
  return shadowify(grp);
}

function buildStembag(p, brand, main, accent) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const r = Math.min(p.mm.dia, 130) / 2;
  const h = Math.min(p.mm.hgt, 240);
  const taper = vr.range(0.82, 0.95);
  const body = soft(new THREE.CylinderGeometry(r, r * taper, h, 30, 8), main, {
    amp: vr.range(1.7, 2.5), freq: vr.range(0.04, 0.052), seed: vr.seed % 929,
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.5,
  });
  body.position.y = -h / 2;
  grp.add(body);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.86, 5, 8, 26), accent);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -4;
  grp.add(rim);
  const sr = seamRing(main, r * 0.98, 1.2);
  sr.rotation.x = Math.PI / 2;
  sr.position.y = -h * 0.62;
  grp.add(sr);
  const wm = webbing();
  const hwm = hardware();
  const st = strapAssembly(wm, hwm, { r: r * 0.97, width: 16, angle: Math.PI });
  st.rotation.x = Math.PI / 2;
  st.position.y = -h * 0.3;
  grp.add(st);
  const cinch = new THREE.Mesh(new THREE.BoxGeometry(10, 14, 10), hwm);
  cinch.position.set(r * 0.7, -10, 0);
  grp.add(cinch);
  if (feats.cord) {
    const lat = bungeeArc(hwm, { R: r + 4, arc: deg(96), len: h * 0.5, n: 3 });
    lat.position.y = -h * 0.45;
    grp.add(lat);
  }
  if (feats.reflective) {
    const rs = reflectiveArc({ R: r + 4, arc: deg(70), width: 7 });
    rs.position.y = -h * 0.78;
    grp.add(rs);
  }
  addPockets(grp, feats, main, hwm, {
    side: (make) => {
      const g = make.arc(r + 4, h * 0.4, deg(80));
      g.position.y = -h * 0.42;
      grp.add(g);
    },
  });
  patch(grp, brand, 0, -h * vr.range(0.4, 0.52), r + 1.6, 58, 0);
  grp.userData.radius = r;
  return shadowify(grp);
}

function buildForkbag(p, brand, main, accent, ctx, side) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  // A fork bag stands UP the blade, so its long axis is whichever catalogue
  // dimension is largest — not `len`. Andrew The Maker's Many Things Sack is
  // 8.9 x 25.4 x 16.5cm, where `len` is the 3.5in depth; taking len as the
  // height gave CapsuleGeometry a negative cylinder section, which collapses
  // silently to a perfect sphere. Sort the dims and never let that happen.
  const dims = [p.mm.len, p.mm.wid, p.mm.hgt].filter((d) => d > 0).sort((a, b) => b - a);
  const len = Math.min(dims[0] ?? 300, 400);
  const girth = Math.min(dims[1] ?? 120, 150);
  const r = Math.min(girth / 2, len / 2 - 6);   // keep a real cylinder section
  const anchorZ = Math.abs(ctx.anchors[side > 0 ? 'forkR' : 'forkL'].position.z) || 62;
  grp.position.z = side * Math.max(r + 64 - anchorZ, 8);
  const body = soft(new THREE.CapsuleGeometry(r, Math.max(len - 2 * r, 8), 10, 28), main, {
    amp: vr.range(2.5, 3.5), freq: vr.range(0.028, 0.038), seed: vr.seed % 919,
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.81, aoSpan: 0.5,
  });
  grp.add(body);
  const wm = webbing();
  const hwm = hardware();
  const nStraps = feats.compressionStraps ?? 3;
  for (let i = 0; i < nStraps; i++) {
    const t = nStraps === 1 ? 0 : (i / (nStraps - 1) - 0.5) * 0.56;
    // ring axis → −Y; local +Y maps to world +Z, so the buckle lands outboard
    const st = strapAssembly(wm, hwm, { r, width: 18, angle: side > 0 ? Math.PI / 2 : -Math.PI / 2 });
    st.rotation.x = Math.PI / 2;
    st.position.y = t * len;
    grp.add(st);
  }
  const sr = seamRing(main, r * 0.99, 1.2);
  sr.rotation.x = Math.PI / 2;
  sr.position.y = -len * 0.42;
  grp.add(sr);
  // roll-top closure on the upper end
  const cap = rollTop(main, hwm, { r: r * 0.72, depth: 8, rings: 3 });
  cap.rotation.x = -Math.PI / 2;
  cap.position.y = len / 2 - 4;
  grp.add(cap);
  // cargo cage: struts and a base hoop on the inboard face, against the leg
  const cageMat = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, metalness: 0.8, roughness: 0.45 });
  // the cage is *meant* to reach the blade, so it sits out of the collision proxy
  for (const xc of [-r * 0.5, r * 0.5]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, len * 0.76, 8), cageMat);
    strut.position.set(xc, 0, -side * (r + 3));
    strut.userData.noCollide = true;
    grp.add(strut);
  }
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(r * 0.62, 2.4, 6, 20, Math.PI), cageMat);
  hoop.rotation.set(Math.PI / 2, 0, 0);
  hoop.position.set(0, -len * 0.38, -side * r * 0.35);
  hoop.userData.noCollide = true;
  grp.add(hoop);
  // mounting arms reaching back to the fork blade
  for (const yc of [-len * 0.3, len * 0.3]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(9, 7, r + 22), cageMat);
    arm.position.set(0, yc, -side * (r * 0.6 + 14));
    arm.userData.noCollide = true;
    grp.add(arm);
  }
  if (feats.reflective) {
    const rs = reflectiveArc({ R: r + 5, arc: deg(40), width: 8 });
    orientArc(rs, v3(0, 1, 0), v3(0, 0, side));
    rs.position.y = -len * 0.16;
    grp.add(rs);
  }
  addPockets(grp, feats, main, hwm, {
    side: (make) => {
      const g = make.arc(r + 5, len * 0.3, deg(70));
      orientArc(g, v3(0, 1, 0), v3(0, 0, side));
      g.position.y = len * 0.08;
      grp.add(g);
    },
  });
  patch(grp, brand, 0, vr.j(len * 0.08), side * (r + 2), 60, side > 0 ? 0 : Math.PI);
  // lean with the fork blade
  grp.rotation.z = deg(-(90 - ctx.geo.headAngle));
  return shadowify(grp);
}

function buildDowntube(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const r = Math.min(Math.max(p.mm.hgt, p.mm.wid), 150) / 2;
  const len = Math.min(p.mm.len, 380);
  const ang = Math.atan2(ctx.points.headBottom.y, ctx.points.headBottom.x);
  const body = soft(new THREE.CapsuleGeometry(r, len - 2 * r, 8, 24), main, {
    amp: vr.range(1.7, 2.4), freq: vr.range(0.04, 0.05), seed: vr.seed % 911,
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.82, aoSpan: 0.5,
  });
  body.rotation.z = ang - Math.PI / 2;
  grp.add(body);
  // The bag is centred on the anchor, so it projects len/2 up the tube toward
  // the front wheel. The down tube is only ~620mm and the anchor sits mid-tube,
  // which leaves ~55mm of tyre clearance against bags up to 380mm long — so
  // long packs speared the wheel. Slide back until the FRONT tip is clear.
  const dTube = v3(Math.cos(ang), Math.sin(ang), 0);
  const axle = ctx.points.frontAxle;
  const anchorP = ctx.anchors.downtube.position;
  const R = ctx.points.tireR + ctx.geo.tireWidth / 2 + 18;   // + clearance
  const A = v3(anchorP.x - axle.x, anchorP.y - axle.y, 0);
  const b2 = A.dot(dTube);
  const disc = b2 * b2 - (A.lengthSq() - R * R);
  if (disc > 0) {
    const sEnter = -b2 - Math.sqrt(disc);      // where the tube line meets the tyre
    const shift = len / 2 - sEnter;
    if (shift > 0) grp.position.addScaledVector(dTube, -shift);
  }
  const wm = webbing();
  const hwm = hardware();
  for (const t of [-0.26, 0.26]) {
    const st = strapAssembly(wm, hwm, { r, width: 15, angle: -Math.PI / 2 });
    st.quaternion.setFromUnitVectors(v3(0, 0, 1), v3(Math.cos(ang), Math.sin(ang), 0));
    st.position.set(Math.cos(ang) * t * len, Math.sin(ang) * t * len, 0);
    grp.add(st);
  }
  // bolt-on straps closing around the down tube itself
  const hd = v3(ctx.points.hd.x, ctx.points.hd.y, 0);
  const dtHead = ctx.points.headBottom.clone().addScaledVector(hd, -12);
  const dtFoot = v3(10, 6, 0);
  const wraps = [];
  for (let i = 0; i < 2; i++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(27, 2.0, 6, 28), wm);
    band.scale.z = 6;
    band.userData.noCollide = true;
    grp.add(band);
    wraps.push(band);
  }
  grp.userData.reseat = (toLocal, toLocalDir) => {
    const a = toLocal(dtFoot), b = toLocal(dtHead);
    const u = b.clone().sub(a).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), u);
    const along = -a.dot(u); // project the bag's origin onto the tube axis
    wraps.forEach((band, i) => {
      band.quaternion.copy(q);
      band.position.copy(a).addScaledVector(u, along + (i === 0 ? -1 : 1) * len * 0.26);
    });
  };
  patch(grp, brand, 0, 0, r + 1.6, 54, 0);
  return shadowify(grp);
}

function buildPannier(p, brand, main, accent, ctx, side) {
  const grp = new THREE.Group();
  // panniers hang tall and narrow: biggest listed dimension is the drop
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const dims = [p.mm.len, p.mm.wid, p.mm.hgt].sort((a, b) => b - a);
  const h = Math.min(dims[0], 520), w = Math.min(dims[1], 440), d = Math.min(dims[2], 260);
  // The stuffing pushes the face out by `bulgeAmt`; trim placed on the
  // undeformed half-depth therefore sinks INSIDE the shell — which is why
  // reflectors, straps and half the brand patch were invisible.
  const bulgeAmt = Math.min(w, h, d) * vr.range(0.09, 0.14);
  const faceZ = d / 2 + bulgeAmt;
  const body = soft(new RoundedBoxGeometry(w, h, d, 8, Math.min(24, d * 0.28)), main, {
    amp: vr.range(2.6, 3.8), freq: vr.range(0.02, 0.028), seed: vr.seed % 947,
    bulge: boxBulge(w / 2, h / 2, d / 2, bulgeAmt),
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.42,
  });
  grp.add(body);
  const wm = webbing();
  const hwm = hardware();
  const closure = feats.closure || 'rolltop';
  if (closure === 'rolltop') {
    const roll = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const rr = d * 0.23 * (1 - i * 0.16);
      const fold = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, w * (0.94 - i * 0.05), 18), main);
      fold.rotation.z = Math.PI / 2;
      fold.position.set(0, i * rr * 0.34, i * rr * 0.62);
      roll.add(fold);
    }
    roll.position.y = h / 2 - d * 0.06;
    grp.add(roll);
    const rollBuckle = new THREE.Mesh(new THREE.BoxGeometry(18, 12, 24), hwm);
    rollBuckle.position.set(0, h / 2 + d * 0.11, 0);
    grp.add(rollBuckle);
  } else if (closure === 'flap') {
    const fl = flapLid(accent, wm, hwm, { w: w * 1.01, d: d * 1.01, drop: h * 0.3 });
    fl.position.y = h / 2 + 3;
    if (side < 0) fl.rotation.y = Math.PI;
    grp.add(fl);
  } else if (closure === 'zip') {
    const lid = new THREE.Mesh(new RoundedBoxGeometry(w * 1.01, 16, d * 1.01, 4, 8), accent);
    lid.position.y = h / 2 + 2;
    grp.add(lid);
    grp.add(zipperRun(v3(-w * 0.46, h / 2 - 8, side * (faceZ + 1)), v3(w * 0.46, h / 2 - 8, side * (faceZ + 1)), hwm, { accentMat: accent }));
  } else {
    const dc = drawcordEnd(main, hwm, { r: Math.min(w, d) * 0.4, depth: 12 });
    dc.rotation.x = -Math.PI / 2;
    dc.position.y = h / 2;
    grp.add(dc);
  }
  // horizontal panel seam a third up + flat vertical webbing on the outer face
  const seam = seamStrip(main, w * 0.99, 2.6, d + 2.4);
  seam.position.y = -h / 6 + vr.j(h * 0.05);
  grp.add(seam);
  const nStraps = feats.compressionStraps ?? 2;
  for (let i = 0; i < nStraps; i++) {
    const f = nStraps === 1 ? 0 : (i / (nStraps - 1) - 0.5) * 2;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(24, h * 0.92, 2.4), wm);
    strip.position.set(f * w * 0.28, -h * 0.02, side * (faceZ + 0.8));
    grp.add(strip);
    const bk = new THREE.Mesh(new THREE.BoxGeometry(28, 15, 9), hwm);
    bk.position.set(f * w * 0.28, -h * 0.3, side * (faceZ + 4));
    grp.add(bk);
  }
  if (feats.cord) {
    const lat = bungeeLattice(hwm, { w: w * 0.7, h: h * 0.5, n: 4 });
    lat.position.set(0, -h * 0.05, side * (faceZ + 2));
    if (side < 0) lat.rotation.y = Math.PI;
    grp.add(lat);
  }
  if (feats.reflective) {
    const rs = reflectiveStrip(w * 0.7, 12);
    rs.position.set(0, -h * 0.4, side * (faceZ + 2));
    grp.add(rs);
  }
  if (feats.daisyChains) {
    const dcn = daisyChain(wm, { len: h * 0.55, rows: 2, band: 16 });
    dcn.rotation.z = Math.PI / 2;
    dcn.rotation.y = side < 0 ? Math.PI : 0;
    dcn.position.set(-w * 0.32, 0, side * (faceZ + 2));
    grp.add(dcn);
  }
  addPockets(grp, feats, main, hwm, {
    side: (make, i) => {
      const g = make(Math.min(w * 0.62, 210), Math.min(h * 0.34, 150));
      g.position.set(vr.j(w * 0.05), h * (0.16 - i * 0.24), side * (faceZ + 1));
      if (side < 0) g.rotation.y = Math.PI;
    },
    front: (make, i) => {
      const g = make(Math.min(d * 0.7, 130), Math.min(h * 0.35, 150));
      g.position.set(w / 2 + bulgeAmt + 1, h * (0.1 - i * 0.2), 0);
      g.rotation.y = Math.PI / 2;
    },
  });
  // QL-style mount: a plate on the inboard face carrying the upper hooks, plus
  // a lower stabiliser hook. The hooks used to sit h/2 + d*0.3 + 6 up, i.e.
  // clear ABOVE the bag's own top edge, so they read as loose blocks floating
  // beside the tyre instead of hardware gripping the rack rail.
  const inZ = -side * (d / 2 + 1);
  const plate = new THREE.Mesh(new RoundedBoxGeometry(w * 0.62, 46, 7, 3, 3), hwm);
  plate.position.set(-w * 0.04, h / 2 - 34, inZ);
  plate.userData.noCollide = true;
  grp.add(plate);
  for (const sx of [-0.24, 0.24]) {
    const hook = new THREE.Mesh(new THREE.BoxGeometry(24, 26, 15), hwm);
    hook.position.set(sx * w, h / 2 - 20, inZ - side * 7);
    hook.userData.noCollide = true;
    grp.add(hook);
    // the lip that closes over the rack rail
    const lip = new THREE.Mesh(new THREE.BoxGeometry(24, 8, 26), hwm);
    lip.position.set(sx * w, h / 2 - 8, inZ - side * 13);
    lip.userData.noCollide = true;
    grp.add(lip);
  }
  const lowHook = new THREE.Mesh(new THREE.BoxGeometry(20, 30, 12), hwm);
  lowHook.position.set(-w * 0.22, -h * 0.3, inZ - side * 5);
  lowHook.userData.noCollide = true;
  grp.add(lowHook);
  patch(grp, brand, -w * 0.16 + vr.j(w * 0.06), h * 0.05 + vr.j(h * 0.06), side > 0 ? faceZ + 2 : -(faceZ + 2), 96, side > 0 ? 0 : Math.PI);
  // hang outboard of the rack rails (|z| ≈ 72) with the top just under the top rail
  const anchor = ctx.anchors[side > 0 ? 'pannierR' : 'pannierL'].position;
  const rackTopY = ctx.anchors.rackTop ? ctx.anchors.rackTop.position.y : ctx.points.rearAxle.y + 300;
  grp.position.y = rackTopY - 24 - h / 2 - anchor.y;
  grp.position.z = side * (76 + d / 2) - anchor.z;
  return shadowify(grp);
}

function buildTrunk(p, brand, main, accent) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  const w = Math.min(p.mm.len, 500), h = Math.min(p.mm.hgt, 340), d = Math.min(p.mm.wid, 300);
  const body = soft(new RoundedBoxGeometry(w, h, d, 8, Math.min(22, d * 0.26)), main, {
    amp: vr.range(2.4, 3.6), freq: vr.range(0.024, 0.032), seed: vr.seed % 941,
    bulge: boxBulge(w / 2, h / 2, d / 2, Math.min(w, h, d) * vr.range(0.09, 0.14)),
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.42,
  });
  body.position.y = h / 2 + 6;
  grp.add(body);
  const wm = webbing();
  const hwm = hardware();
  const closure = feats.closure || 'zip';
  if (closure === 'flap') {
    const fl = flapLid(accent, wm, hwm, { w: w * 1.01, d: d * 1.01, drop: h * 0.34 });
    fl.position.y = h + 8;
    grp.add(fl);
  } else if (closure === 'rolltop') {
    const cap = rollTop(main, hwm, { r: Math.min(w, d) * 0.4, depth: 10 });
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = h + 6;
    grp.add(cap);
  } else {
    const lid = new THREE.Mesh(new RoundedBoxGeometry(w * 1.02, 14, d * 1.02, 4, 8), accent);
    lid.position.y = h + 8;
    grp.add(lid);
    if (closure === 'zip') {
      grp.add(zipperRun(v3(-w * 0.46, h + 1, d / 2 + 1), v3(w * 0.46, h + 1, d / 2 + 1), hwm, { accentMat: accent }));
    }
  }
  const seam = seamStrip(main, w * 0.99, 2.6, d + 2.4);
  seam.position.y = h * vr.range(0.3, 0.42);
  grp.add(seam);
  const nStraps = feats.compressionStraps ?? 2;
  for (let i = 0; i < nStraps; i++) {
    const f = nStraps === 1 ? 0 : (i / (nStraps - 1) - 0.5) * 2;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(22, h * 0.86, d + 2.6), wm);
    strip.position.set(f * w * 0.32, h / 2 + 8, 0);
    grp.add(strip);
    const bk = new THREE.Mesh(new THREE.BoxGeometry(26, 14, 9), hwm);
    bk.position.set(f * w * 0.32, h * 0.24, d / 2 + 4);
    grp.add(bk);
  }
  if (feats.cord) {
    const lat = bungeeLattice(hwm, { w: w * 0.7, h: d * 0.6, n: 3 });
    lat.rotation.x = -Math.PI / 2;
    lat.position.y = h + 14;
    grp.add(lat);
  }
  if (feats.reflective) {
    const rs = reflectiveStrip(w * 0.62, 12);
    rs.position.set(0, h * 0.2, d / 2 + 2);
    grp.add(rs);
  }
  if (feats.daisyChains) {
    const dcn = daisyChain(wm, { len: w * 0.66, rows: 2, band: 16 });
    dcn.rotation.x = -Math.PI / 2;
    dcn.position.set(0, h + 12, 0);
    grp.add(dcn);
  }
  addPockets(grp, feats, main, hwm, {
    side: (make, i) => {
      const s2 = i % 2 === 0 ? 1 : -1;
      const g = make(Math.min(w * 0.6, 200), Math.min(h * 0.5, 140));
      g.position.set(vr.j(w * 0.05), h * 0.45, s2 * (d / 2 + 1));
      if (s2 < 0) g.rotation.y = Math.PI;
    },
    front: (make, i) => {
      const g = make(Math.min(d * 0.7, 150), Math.min(h * 0.5, 140));
      g.position.set(w / 2 + 1, h * (0.45 - i * 0.12), 0);
      g.rotation.y = Math.PI / 2;
    },
    lid: (make) => {
      const g = make(Math.min(w * 0.55, 190), Math.min(d * 0.6, 150));
      g.position.set(0, h + 14, 0);
      g.rotation.x = -Math.PI / 2;
    },
  });
  patch(grp, brand, -w / 2 - 1.6, h * 0.55, 0, 70, -Math.PI / 2);
  patch(grp, brand, 0, h * 0.55, d / 2 + 1.6, 84, 0);
  return shadowify(grp);
}

function buildSaddlebag(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  // A classic saddlebag (Carradice Barley, Restrap Adventure) is WIDE ACROSS the
  // bike and shallow fore-aft, with its flap and buckles facing rearward. The
  // catalogue's `len` is that across-bike width, not the depth — mapping it to
  // X made the bag project backwards like a suitcase, 90 degrees out.
  const across = Math.min(p.mm.len, 380);          // long axis, across the bike (Z)
  const h = Math.min(p.mm.hgt, 220);
  const deep = Math.min(p.mm.wid, 220);            // fore-aft (X)
  const body = soft(new RoundedBoxGeometry(deep, h, across, 8, Math.min(18, deep * 0.28)), main, {
    amp: vr.range(1.6, 2.3), freq: vr.range(0.042, 0.054), seed: vr.seed % 907,
    bulge: boxBulge(deep / 2, h / 2, across / 2, Math.min(deep, h, across) * vr.range(0.09, 0.13)),
    aoDir: new THREE.Vector3(0, -1, 0), aoK: 0.8, aoSpan: 0.5,
  });
  grp.add(body);
  // flap closes over the REAR face
  const flap = new THREE.Mesh(new RoundedBoxGeometry(20, h * 0.9, across * 1.03, 4, 8), accent);
  flap.position.x = -deep / 2 + 6;
  grp.add(flap);
  for (const s of [1, -1]) {
    const sm = seamStrip(main, deep * 0.9, 2.2, 2.0);
    sm.position.set(2, -h / 6, s * (across / 2 + 1.4));
    grp.add(sm);
  }
  const wm = webbing();
  const hwm = hardware();
  // two vertical compression straps over the top, spread along the width
  for (const f of [-0.26, 0.26]) {
    const st = strapAssembly(wm, hwm, { r: Math.max(h, deep) * 0.52, width: 16, angle: -Math.PI / 2 });
    st.position.z = f * across;
    st.scale.set(1, h / Math.max(h, deep), 1);
    grp.add(st);
  }
  patch(grp, brand, -deep / 2 - 2, 0, 0, 56, -Math.PI / 2);
  grp.rotation.z = deg(-8);
  // A saddlebag hangs BEHIND the seatpost. The old fixed +30 offset took no
  // account of where the post actually is, so the post ran straight through
  // the bag. Seat the bag's front face just aft of the post instead.
  const sd = ctx?.points?.sd;
  const anchorPos = ctx?.anchors?.seatpack?.position;
  let frontX = 30 + deep / 2;
  if (sd && anchorPos && ctx.points.seatTop) {
    const postR = (ctx.geo?.seatpostDia || 27.2) / 2;
    const yFrame = anchorPos.y + 4 - h / 2;
    const postX = ctx.points.seatTop.x + sd.x * ((yFrame - ctx.points.seatTop.y) / sd.y);
    frontX = Math.min(frontX, postX - anchorPos.x - postR - 6);
  }
  grp.position.x = frontX - deep / 2;
  grp.position.y = 4 - h / 2; // hang clear beneath the saddle rails
  grp.userData.noseX = 30 + deep / 2;

  // A saddlebag hangs from the saddle RAILS. The compression strap above only
  // wraps the bag, so nothing connected it to the bike — it read as a box
  // floating under the saddle. Run a strap up each side onto the real rail.
  if (ctx?.rails && ctx.anchors?.seatpack) {
    const anchorPos = ctx.anchors.seatpack.position;
    const toLocal = (pFrame) => pFrame.clone().sub(anchorPos).sub(grp.position)
      .applyAxisAngle(v3(0, 0, 1), -grp.rotation.z);
    for (const side of [1, -1]) {
      const bar = side > 0 ? ctx.rails.right : ctx.rails.left;
      const railPt = toLocal(bar[0].clone().lerp(bar[1], 0.55));
      const from = v3(-deep * 0.04, h / 2 - 4, side * across * 0.32);
      const to = v3(railPt.x, railPt.y, side * ctx.rails.z);
      grp.add(wrapStrap(wm, hwm, { from, to, tubeR: ctx.rails.r, width: 14 }));
    }
  }
  return shadowify(grp);
}

const BUILDERS = {
  seatpack: buildSeatpack,
  saddlebag: buildSaddlebag,
  barroll: buildBarroll,
  barbag: buildBarbag,
  randobag: buildRandobag,
  framebag_full: buildFrameFull,
  framebag_half: buildFrameHalf,
  toptube: buildToptube,
  toptube_rear: buildToptubeRear,
  stembag: buildStembag,
  forkbag: buildForkbag,
  downtube: buildDowntube,
  pannier: buildPannier,
  trunk: buildTrunk,
};

// ---- collision resolution ------------------------------------------------
// Bags are placed by anchor, so a big pannier and a big seat pack can claim the
// same air. Everything is resolved in the bike's millimetre frame: high-priority
// bags are immovable, lower ones slide along a slot-specific escape vector,
// then shrink, then give up their spot entirely.

const RESOLVE = {
  framebag_full: { pri: 0, fixed: true },
  framebag_half: { pri: 1, fixed: true },
  // A seat pack with no escape route gets DELETED the moment it clashes, which
  // is how whole Ortlieb sizes silently vanished. Let it ride up and forward
  // toward the saddle first — that is what a real pack does when you cinch it.
  seatpack:      { pri: 2, dirs: [[0, 1, 0], [1, 0, 0]], max: 70, minScale: 0.8, ignore: ['saddle', 'seatpost'] },
  saddlebag:     { pri: 3, dirs: [[1, 0, 0]], max: 30, minScale: 0.8, ignore: ['saddle', 'seatpost'] },
  // A handlebar bag MOUNTS TO the bar. Leaving 'bars' as an obstacle made the
  // resolver shove it up to 110mm forward, so it floated off the front of the
  // bike with its straps reaching nothing. Same bug the fork bags had.
  barroll:       { pri: 4, dirs: [[1, 0, 0], [0, 1, 0]], max: 60, minScale: 0.82, ignore: ['bars', 'stem'] },
  barbag:        { pri: 5, dirs: [[0, 1, 0], [1, 0, 0]], max: 60, minScale: 0.82, ignore: ['bars', 'stem'] },
  randobag:      { pri: 6, dirs: [[1, 0, 0], [0, 1, 0]], max: 80, minScale: 0.82, ignore: ['bars'] },
  pannierL:      { pri: 7, dirs: [[0, 0, -1]], max: 80, minScale: 0.86 },
  pannierR:      { pri: 7, dirs: [[0, 0, 1]], max: 80, minScale: 0.86 },
  trunk:         { pri: 8, dirs: [[0, 1, 0]], max: 70, minScale: 0.82 },
  toptube:       { pri: 9, dirs: [[-1, 0, 0]], max: 110, minScale: 0.75 },
  toptube_rear:  { pri: 9, dirs: [[1, 0, 0]], max: 90, minScale: 0.75, ignore: ['saddle', 'seatpost'] },
  // A fork bag BOLTS TO the fork blade, so treating the fork as an obstacle
  // meant no placement could ever succeed and every one was deleted.
  forkL:         { pri: 10, dirs: [[0, 0, -1], [0.31, -0.95, 0]], max: 70, minScale: 0.8, ignore: ['fork'] },
  forkR:         { pri: 10, dirs: [[0, 0, 1], [0.31, -0.95, 0]], max: 70, minScale: 0.8, ignore: ['fork'] },
  // stem bags sit at the bar/stem junction: sliding outboard reads far better
  // than dropping them down the head tube
  stemL:         { pri: 12, dirs: [[0, 0, -1], [-1, 0, 0], [0, -1, 0]], max: 60, minScale: 0.8, ignore: ['bars', 'stem', 'head'] },
  stemR:         { pri: 12, dirs: [[0, 0, 1], [-1, 0, 0], [0, -1, 0]], max: 60, minScale: 0.8, ignore: ['bars', 'stem', 'head'] },
  // The downtube anchor sits near the front wheel, so the useful escape is
  // BACK along the tube toward the BB — straight down just drives into the
  // tyre. Without it the longest packs had nowhere to go and were deleted.
  downtube:      { pri: 14, dirs: [[-0.72, -0.69, 0], [0, -1, 0], [-0.31, 0.95, 0]], max: 90, minScale: 0.8 },
};
const STEP = 6;
const TOL = 2.5; // mm of allowed touching before a clash counts

const _v = new THREE.Vector3();

/**
 * Coarse collision proxy: a grid of AABBs over the bag's two longest axes.
 * A single Box3 around a frame bag would swallow half the bike; a grid follows
 * the triangle closely enough that a downtube bag can still tuck underneath.
 */
function proxyBoxes(grp, nA = 6, nB = 4) {
  grp.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(grp.matrixWorld).invert();
  const pts = [];
  grp.traverse((o) => {
    if (!o.isMesh || o.userData.noCollide) return;
    const pos = o.geometry?.attributes?.position;
    if (!pos) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const stride = Math.max(1, Math.ceil(pos.count / 500));
    for (let i = 0; i < pos.count; i += stride) {
      pts.push(_v.fromBufferAttribute(pos, i).applyMatrix4(m).clone());
    }
  });
  if (!pts.length) return [];
  const bb = new THREE.Box3().setFromPoints(pts);
  const size = bb.getSize(new THREE.Vector3());
  const order = ['x', 'y', 'z'].sort((a, b) => size[b] - size[a]);
  const [A, B] = order;
  const cells = new Map();
  for (const p of pts) {
    const ia = Math.min(nA - 1, Math.floor(((p[A] - bb.min[A]) / Math.max(size[A], 1e-6)) * nA));
    const ib = Math.min(nB - 1, Math.floor(((p[B] - bb.min[B]) / Math.max(size[B], 1e-6)) * nB));
    const k = ia * nB + ib;
    let c = cells.get(k);
    if (!c) { c = new THREE.Box3(); cells.set(k, c); }
    c.expandByPoint(p);
  }
  return [...cells.values()];
}

function boxesOverlap(a, b) {
  for (const x of a) for (const y of b) if (x.intersectsBox(y)) return true;
  return false;
}

// ---- BagSystem -----------------------------------------------------------
export class BagSystem {
  constructor(bike, catalog) {
    this.bike = bike;
    this.catalog = catalog;
    this.equipped = {}; // uiSlot → {brand, product, mesh, basePos, baseScale, proxy}
    this.unfitted = {}; // uiSlot → {brand, product} the resolver could not place
    this._batch = false;
    this._resolving = false;
  }

  equip(uiSlot, brand, product, colorwayIndex = 0) {
    if (!brand || !product || !SLOTS[uiSlot]) return;
    const slotDef = SLOTS[uiSlot];
    this.remove(uiSlot);
    for (const ex of slotDef.excludes) this.remove(ex);
    const builderKey = slotDef.products || uiSlot;
    const builder = BUILDERS[builderKey];
    if (!builder) return;
    const cw = colorwayFor(brand, product, colorwayIndex);
    const main = fabricMaterial(brand.fabricKey, cw.main);
    const accent = fabricMaterial(brand.fabricKey, cw.accent);
    const side = uiSlot.endsWith('L') ? -1 : 1;
    const mesh = builder(product, brand, main, accent, this.bike, side);
    mesh.name = `bag:${uiSlot}`;
    this.bike.anchors[slotDef.anchor].add(mesh);
    this.equipped[uiSlot] = {
      brand, product, mesh, colorwayIndex, colorway: cw,
      basePos: mesh.position.clone(),
      baseScale: mesh.scale.clone(),
      proxy: proxyBoxes(mesh),
    };
    this.updateFixtures();
    if (!this._batch) this.resolveCollisions();
  }

  /** Re-dress an equipped bag in another of its colourways. */
  setColorway(uiSlot, colorwayIndex) {
    const cur = this.equipped[uiSlot];
    if (!cur) return;
    this.equip(uiSlot, cur.brand, cur.product, colorwayIndex);
  }

  /** How many colourways a product offers (1 when the data has none). */
  static colorwayCount(product) {
    const ways = product?.features?.colorways;
    return Array.isArray(ways) && ways.length ? ways.length : 1;
  }

  remove(uiSlot) {
    delete this.unfitted[uiSlot];
    const cur = this.equipped[uiSlot];
    if (!cur) return;
    cur.mesh.parent?.remove(cur.mesh);
    disposeObject(cur.mesh);
    delete this.equipped[uiSlot];
    this.updateFixtures();
    if (!this._batch) this.resolveCollisions();
  }

  clearAll() {
    const wasBatch = this._batch;
    this._batch = true;
    for (const k of Object.keys(this.equipped)) this.remove(k);
    this._batch = wasBatch;
  }

  updateFixtures() {
    const has = (s) => !!this.equipped[s];
    this.bike.rearRack.visible = has('pannierL') || has('pannierR') || has('trunk');
    this.bike.frontRack.visible = has('randobag');
    this.bike.bottles.visible = !has('framebag_full');
    this.adjustBottles();
  }

  /** B-RAD: slide each bottle down its tube until it clears the frame bag. */
  adjustBottles() {
    const mounts = this.bike.bottleMounts;
    if (!mounts) return;
    const fb = this.equipped.framebag_full || this.equipped.framebag_half;
    // reset to stock position first
    for (const key of ['st', 'dt']) {
      this.bike.slideBottle(key, 0);
      mounts[key].group.visible = true;
    }
    if (!fb || this.equipped.framebag_full) return; // full bag hides bottles entirely
    fb.mesh.updateWorldMatrix(true, false);
    const bagBox = new THREE.Box3().setFromObject(fb.mesh);
    for (const key of ['st', 'dt']) {
      const m = mounts[key];
      let ok = false;
      // slide toward the BB in 20mm steps (B-RAD rail travel), up to 140mm
      for (let off = 0; off >= -140; off -= 20) {
        this.bike.slideBottle(key, off);
        m.group.updateWorldMatrix(true, false);
        const bb = new THREE.Box3().setFromObject(m.group);
        if (!bb.intersectsBox(bagBox)) { ok = true; break; }
      }
      if (!ok) {
        this.bike.slideBottle(key, 0);
        m.group.visible = false;
      }
    }
  }

  /** Static bike volumes, in the frame group's millimetre space. */
  _staticColliders() {
    const P = this.bike.points, g = this.bike.geo;
    const R = P.tireR + g.tireWidth / 2;
    const out = [];
    const add = (tag, x0, x1, y0, y1, z0, z1) => {
      out.push({
        tag,
        box: new THREE.Box3(
          new THREE.Vector3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
          new THREE.Vector3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1))
        ),
      });
    };
    // wheels, sliced so bags can nest against the round profile instead of a slab
    for (const a of [P.rearAxle, P.frontAxle]) {
      const N = 9;
      for (let i = 0; i < N; i++) {
        const x0 = a.x - R + (2 * R * i) / N, x1 = a.x - R + (2 * R * (i + 1)) / N;
        const dx = Math.max(Math.abs(x0 - a.x), Math.abs(x1 - a.x));
        const hy = Math.sqrt(Math.max(R * R - dx * dx, 0));
        if (hy < 6) continue;
        add('wheel', x0, x1, a.y - hy, a.y + hy, -25, 25);
      }
    }
    // handlebar: tops across the centre, then hoods + drops on each side
    const bc = P.barCenter, half = g.barWidth / 2;
    add('bars', bc.x - 16, bc.x + 16, bc.y - 16, bc.y + 16, -half - 12, half + 12);
    for (const s of [1, -1]) {
      add('bars', bc.x + 18, bc.x + g.barReach + 45, bc.y - g.barDrop - 22, bc.y + 34,
        s * (half - 14), s * (half + 36));
    }
    // head tube + steerer + stem, sliced along the axis so the frame bag stays clear
    const hd = P.hd;
    for (let i = 0; i < 5; i++) {
      const t0 = -g.spacers + (i / 5) * (g.headTube + g.spacers);
      const t1 = -g.spacers + ((i + 1) / 5) * (g.headTube + g.spacers);
      const c = P.headTop.clone().addScaledVector(v3(hd.x, hd.y, 0), (t0 + t1) / 2);
      const halfLen = Math.abs(t1 - t0) / 2 + 4;
      add('head', c.x - 28, c.x + 28, c.y - halfLen - 20, c.y + halfLen + 20, -30, 30);
    }
    add('stem', P.steererTop.x - 10, bc.x + 12, Math.min(P.steererTop.y, bc.y) - 24, Math.max(P.steererTop.y, bc.y) + 24, -24, 24);
    // fork blades: cargo cages have to stand outboard of these, not just the tyre
    const crown = P.headBottom.clone().addScaledVector(v3(hd.x, hd.y, 0), 20);
    for (const s of [1, -1]) {
      for (let i = 0; i < 4; i++) {
        const a = crown.clone().lerp(P.frontAxle, i / 4);
        const b = crown.clone().lerp(P.frontAxle, (i + 1) / 4);
        const zc = 30 + (48 - 30) * ((i + 0.5) / 4);
        add('fork', Math.min(a.x, b.x) - 14, Math.max(a.x, b.x) + 14, Math.min(a.y, b.y) - 6, Math.max(a.y, b.y) + 6,
          s * 16, s * (zc + 14));
      }
    }
    // saddle shell
    const sx = P.saddlePos.x - 14, sy = P.saddlePos.y + 30;
    add('saddle', sx - g.saddleLength / 2, sx + g.saddleLength / 2, sy - 20, sy + 14, -80, 80);
    add('seatpost', P.seatTop.x - 20, P.saddlePos.x + 20, P.seatTop.y, sy, -18, 18);
    return out;
  }

  /**
   * Nudge, shrink, or drop bags until nothing interpenetrates. Runs after any
   * change to the kit; every bag is reset to its built pose first so repeated
   * equips are idempotent.
   */
  resolveCollisions() {
    if (this._resolving) return;
    this._resolving = true;
    try { this._resolve(); } finally { this._resolving = false; }
  }

  _resolve() {
    const bike = this.bike;
    const F = bike.frameGroup || bike.anchors.framebag?.parent;
    if (!F) return;
    bike.group.updateMatrixWorld(true);
    const toFrame = new THREE.Matrix4().copy(F.matrixWorld).invert();

    this.unfitted = {};
    const slots = Object.keys(this.equipped);
    for (const s of slots) {
      const rec = this.equipped[s];
      rec.mesh.position.copy(rec.basePos);
      rec.mesh.scale.copy(rec.baseScale);
      rec.mesh.visible = true;
    }
    this._staticFixes();

    const statics = this._staticColliders();
    const boxesFor = (rec) => {
      rec.mesh.updateWorldMatrix(true, false);
      const m = new THREE.Matrix4().multiplyMatrices(toFrame, rec.mesh.matrixWorld);
      return rec.proxy.map((b) => {
        const t = b.clone().applyMatrix4(m);
        t.expandByScalar(-TOL);
        return t.isEmpty() ? b.clone().applyMatrix4(m) : t;
      });
    };

    const placed = [];
    const doomed = [];
    slots.sort((a, b) => (RESOLVE[a]?.pri ?? 99) - (RESOLVE[b]?.pri ?? 99));

    for (const slot of slots) {
      const rec = this.equipped[slot];
      const cfg = RESOLVE[slot] || {};
      if (cfg.fixed) { placed.push(boxesFor(rec)); continue; }
      const ignore = cfg.ignore || [];
      const obstacles = statics.filter((c) => !ignore.includes(c.tag)).map((c) => c.box);
      const hits = () => {
        const mine = boxesFor(rec);
        if (boxesOverlap(mine, obstacles)) return true;
        for (const p of placed) if (boxesOverlap(mine, p)) return true;
        return false;
      };

      let ok = !hits();
      const dirs = cfg.dirs || [];
      const max = cfg.max || 0;
      let lastDir = null;
      if (!ok) {
        outer:
        for (const d of dirs) {
          const dir = this._localDir(rec.mesh.parent, F, new THREE.Vector3(d[0], d[1], d[2]).normalize());
          lastDir = dir;
          for (let t = STEP; t <= max + 1e-6; t += STEP) {
            rec.mesh.position.copy(rec.basePos).addScaledVector(dir, t);
            if (!hits()) { ok = true; break outer; }
          }
        }
      }
      if (!ok) {
        // park at full travel on the first escape route, then squeeze
        if (lastDir && dirs.length) {
          const d0 = this._localDir(rec.mesh.parent, F, new THREE.Vector3(...dirs[0]).normalize());
          rec.mesh.position.copy(rec.basePos).addScaledVector(d0, max);
        } else {
          rec.mesh.position.copy(rec.basePos);
        }
        const minS = cfg.minScale ?? 0.8;
        for (let f = 0.92; f >= minS - 1e-6; f *= 0.92) {
          rec.mesh.scale.copy(rec.baseScale).multiplyScalar(f);
          if (!hits()) { ok = true; break; }
        }
      }
      if (!ok) { doomed.push(slot); continue; }
      placed.push(boxesFor(rec));
    }

    for (const slot of doomed) {
      const rec = this.equipped[slot];
      // Drawing a bag that intersects the frame is wrong, but so is deleting it
      // with no trace — the user picked a product and it silently never appeared.
      // Remove the mesh, KEEP the choice, and let the UI say it doesn't fit.
      console.warn(`[bags] does not fit ${slot}: ${rec.brand?.name} ${rec.product?.name} ${rec.product?.size || ''}`);
      rec.mesh.parent?.remove(rec.mesh);
      disposeObject(rec.mesh);
      delete this.equipped[slot];
      this.unfitted[slot] = { brand: rec.brand, product: rec.product, colorwayIndex: rec.colorwayIndex };
    }
    if (doomed.length) this.updateFixtures();
    this._reseatStraps();
  }

  /**
   * Straps that wrap a frame tube are aimed at a fixed point on the bike, not
   * at a fixed spot on the bag — so they are re-aimed once the bag has settled.
   */
  _reseatStraps() {
    const m = new THREE.Matrix4();
    const inv = new THREE.Matrix4();
    const rot = new THREE.Matrix4();
    for (const rec of Object.values(this.equipped)) {
      const fn = rec.mesh.userData.reseat;
      if (!fn) continue;
      rec.mesh.updateMatrix();
      rec.mesh.parent.updateMatrix(); // anchors are direct children of the frame group
      m.multiplyMatrices(rec.mesh.parent.matrix, rec.mesh.matrix);
      inv.copy(m).invert();
      rot.extractRotation(m).invert();
      fn((p) => p.clone().applyMatrix4(inv), (d) => d.clone().applyMatrix4(rot));
    }
  }

  /** Escape vectors are authored in frame space; anchors may be rotated. */
  _localDir(parent, F, dirFrame) {
    const qp = new THREE.Quaternion(), qf = new THREE.Quaternion();
    parent.getWorldQuaternion(qp);
    F.getWorldQuaternion(qf);
    const rel = qf.invert().multiply(qp); // parent orientation relative to F
    return dirFrame.clone().applyQuaternion(rel.invert()).normalize();
  }

  /**
   * Deterministic size caps for pairs that always fight, applied before the
   * generic search so the resolver never has to shrink them blindly.
   */
  _staticFixes() {
    const roll = this.equipped.barroll || this.equipped.barbag;
    const stem = this.equipped.stemL || this.equipped.stemR;
    if (roll && stem && roll.mesh.userData.halfLen) {
      const stemZ = Math.abs(stem.mesh.parent.position.z + stem.mesh.position.z);
      const stemR = stem.mesh.userData.radius || 46;
      const rollBoxMinX = roll.mesh.parent.position.x + roll.mesh.position.x - (roll.mesh.userData.radius || 0);
      const stemMaxX = stem.mesh.parent.position.x + stem.mesh.position.x + stemR;
      if (rollBoxMinX < stemMaxX) { // only bind when they actually share depth
        const allow = Math.max(stemZ - stemR - 15, 60);
        const f = Math.min(1, allow / roll.mesh.userData.halfLen);
        if (f < 1) roll.mesh.scale.z = roll.baseScale.z * f;
      }
    }
    const tt = this.equipped.toptube;
    const pack = this.equipped.seatpack || this.equipped.saddlebag;
    if (tt && pack && tt.mesh.userData.bodyLen) {
      const packNose = pack.mesh.parent.position.x + (pack.mesh.userData.noseX ?? 0);
      const ttFront = tt.mesh.parent.position.x + tt.mesh.position.x + 10;
      const avail = ttFront - (packNose + 25);
      const f = Math.min(1, avail / tt.mesh.userData.bodyLen);
      if (f < 1 && f > 0.4) tt.mesh.scale.x = tt.baseScale.x * f;
    }
  }

  randomKit(seed = (Math.random() * 1e9) | 0) {
    // mulberry32
    let a = seed >>> 0;
    const rnd = () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    this._batch = true;
    this.clearAll();
    const plan = [
      { roll: 0.9, slots: ['seatpack', 'seatpack', 'seatpack', 'saddlebag'] },
      { roll: 0.88, slots: ['barroll', 'barroll', 'barbag', 'randobag'] },
      { roll: 0.75, slots: ['framebag_full', 'framebag_full', 'framebag_half'] },
      { roll: 0.65, slots: ['toptube'] },
      { roll: 0.5, slots: ['stemL'] },
      { roll: 0.5, slots: ['stemR'] },
      { roll: 0.45, slots: ['forkL'] },
      { roll: 0.45, slots: ['forkR'] },
      { roll: 0.2, slots: ['downtube'] },
      { roll: 0.3, slots: ['pannierPair', 'trunk'] },
    ];
    try {
      for (const step of plan) {
        if (rnd() > step.roll) continue;
        const uiSlot = pick(step.slots);
        if (uiSlot === 'pannierPair') {
          const opts = productsForSlot(this.catalog, 'pannier');
          if (opts.length) {
            const o = pick(opts);
            this.equip('pannierL', o.brand, o.product);
            this.equip('pannierR', o.brand, o.product);
          }
          continue;
        }
        const opts = productsForSlot(this.catalog, productSlotFor(uiSlot));
        if (!opts.length) continue;
        const o = pick(opts);
        this.equip(uiSlot, o.brand, o.product);
      }
    } finally {
      this._batch = false;
    }
    this.resolveCollisions();
    return seed;
  }

  fullKit() {
    this._batch = true;
    try {
      for (const uiSlot of ['seatpack', 'barroll', 'framebag_full', 'toptube', 'stemL', 'stemR', 'forkL', 'forkR', 'pannierL', 'pannierR']) {
        const o = productsForSlot(this.catalog, productSlotFor(uiSlot))[0];
        if (o) this.equip(uiSlot, o.brand, o.product);
      }
    } finally {
      this._batch = false;
    }
    this.resolveCollisions();
  }
}
