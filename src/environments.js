import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ENV_NAMES = ['mountain', 'lake', 'forest', 'desert', 'night'];

/**
 * Each environment is a hand-built 3D world — layered ridges, water, forests,
 * mesas, a camp — under a per-env gradient sky dome. A real CC0 HDRI (Poly
 * Haven, 2k) is still loaded per env but only as the PBR light source
 * (PMREM → scene.environment); the visible background is all geometry, so the
 * scene has genuine parallax when the camera orbits.
 *
 * Framing note that drives every size below: main.js shoots a 27° vertical
 * lens from ~3 m out at 0.9 m, pitched down ~6°, so only about 7° of sky sits
 * above the horizon and anything in the 10–30 m band is enormous on screen.
 * Hence the layout law — tiny detail inside 18 m, mid scrub to 50 m, and all
 * the drama (trees, ridges, buttes) beyond 40 m at low angular height.
 *
 * Everything renders through main.js's EffectComposer, i.e. into a half-float
 * render target, so material shaders here output LINEAR colour and OutputPass
 * does the ACES tonemap. Colours above 1.0 are intentional — they feed bloom.
 */

// ---------------------------------------------------------------- utilities

function makeRnd(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
}

/** Gentle rolling relief; dead flat inside the bike stage. */
export function terrainH(x, z) {
  const r = Math.hypot(x, z);
  const ramp = smoothstep(17, 60, r);
  return (
    ramp *
    (Math.sin(x * 0.034 + 1.7) * Math.cos(z * 0.027 - 0.6) * 1.9 +
      Math.sin((x + z) * 0.016 + 0.4) * 1.3 +
      Math.sin(x * 0.0085 - z * 0.0105) * 2.6)
  );
}

/** Large-scale ground tone patches (0.78 … 1.16), so the plane is never flat. */
function mottle(x, z) {
  const v =
    Math.sin(x * 0.031 + 0.7) * Math.cos(z * 0.027 - 1.1) +
    0.62 * Math.sin(x * 0.083 - 2.1) * Math.cos(z * 0.071 + 0.4) +
    0.34 * Math.sin((x + z) * 0.19 + 1.7) +
    0.2 * Math.sin(x * 0.41 - z * 0.37);
  return 0.78 + 0.38 * clamp01((v / 2.16) * 0.5 + 0.5);
}

/** Non-indexed copy with guaranteed uv + a flat vertex colour, ready to merge. */
function prep(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** InstancedMesh built from a placement callback; `place` may return false to skip. */
function instance(geo, mat, n, place) {
  const im = new THREE.InstancedMesh(geo, mat, n);
  const d = new THREE.Object3D();
  const col = new THREE.Color();
  let k = 0;
  for (let i = 0; i < n; i++) {
    d.position.set(0, 0, 0);
    d.rotation.set(0, 0, 0);
    d.scale.set(1, 1, 1);
    col.setRGB(1, 1, 1);
    if (place(d, i, col) === false) continue;
    d.updateMatrix();
    im.setMatrixAt(k, d.matrix);
    im.setColorAt(k, col);
    k++;
  }
  im.count = k;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.frustumCulled = false;
  return im;
}

// ------------------------------------------------------------- ridge bands
/**
 * A ring of jagged peaks: ridged fractal noise around the circle, sliced into
 * four horizontal rows so the snowline can be coloured by absolute height.
 * One of these is ~1.5k triangles and reads as an entire mountain range.
 */
function ridgeGeo(o) {
  const {
    radius, height, segs = 240, seed = 1, baseY = 0,
    slope = 0.95, rJitter = 0.15, hMin = 0.16, sharp = 1.6, freq = 1,
    low, mid, high, snow = null, snowLine = 0.58, shade = 0.16,
  } = o;
  const rnd = makeRnd(seed);
  const OCT = [[1.0, 1.0], [2.3, 0.55], [4.7, 0.3], [9.9, 0.15], [21.0, 0.07]];
  const phA = OCT.map(() => rnd() * Math.PI * 2);
  const phB = OCT.map(() => rnd() * Math.PI * 2);
  const ridged = (a, ph, m) => {
    let v = 0, tot = 0;
    for (let i = 0; i < OCT.length; i++) {
      const [f, w] = OCT[i];
      v += w * (1 - Math.abs(Math.sin(a * f * freq * m + ph[i])));
      tot += w;
    }
    return v / tot;
  };

  const cLow = new THREE.Color(low);
  const cMid = new THREE.Color(mid);
  const cHigh = new THREE.Color(high);
  const cSnow = snow != null ? new THREE.Color(snow) : null;
  const ROWS = [0, 0.4, 0.72, 1];

  const H = new Float32Array(segs + 1);
  const R = new Float32Array(segs + 1);
  const S = new Float32Array(segs + 1);
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    H[i] = height * (hMin + (1 - hMin) * Math.pow(ridged(a, phA, 1), sharp));
    R[i] = radius * (1 + rJitter * (ridged(a, phB, 0.7) - 0.5) * 2);
    S[i] =
      1 -
      shade * (0.5 + 0.5 * Math.sin(a * 11.3 + phB[0])) -
      shade * 0.5 * (0.5 + 0.5 * Math.sin(a * 37.1 + phB[2]));
  }

  const pos = [], cols = [];
  const tmp = new THREE.Color();
  const vert = (i, row) => {
    const a = (i / segs) * Math.PI * 2;
    const f = ROWS[row];
    const h = H[i];
    const rr = R[i] + h * slope * (1 - f);
    pos.push(Math.cos(a) * rr, baseY + h * f, Math.sin(a) * rr);
    const yf = (h * f) / height;
    tmp.copy(cLow)
      .lerp(cMid, smoothstep(0.02, 0.34, yf))
      .lerp(cHigh, smoothstep(0.26, 0.72, yf));
    if (cSnow) tmp.lerp(cSnow, smoothstep(snowLine, snowLine + 0.13, yf));
    tmp.multiplyScalar(S[i] * (0.84 + 0.3 * f));
    cols.push(tmp.r, tmp.g, tmp.b);
  };

  for (let i = 0; i < segs; i++)
    for (let r = 0; r < ROWS.length - 1; r++) {
      vert(i, r); vert(i + 1, r); vert(i + 1, r + 1);
      vert(i, r); vert(i + 1, r + 1); vert(i, r + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

const terrainMat = () =>
  new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 1, metalness: 0, side: THREE.DoubleSide,
  });

// ------------------------------------------------------------- plant models

function conifer(rnd, { h = 7, r = 1.2, tiers = 5, trunk = 0x453322, a = 0x274d2c, b = 0x4f8c3c }) {
  const parts = [];
  const th = h * 0.34;
  const tg = new THREE.CylinderGeometry(r * 0.07, r * 0.13, th, 5, 1);
  tg.translate(0, th / 2, 0);
  parts.push(prep(tg, trunk));
  const cA = new THREE.Color(a), cB = new THREE.Color(b);
  for (let i = 0; i < tiers; i++) {
    const f = i / (tiers - 1);
    const ch = h * (0.4 - f * 0.1);
    const cr = r * (1 - f * 0.68) * (0.9 + rnd() * 0.2);
    const cy = h * (0.16 + f * 0.66);
    const cg = new THREE.ConeGeometry(cr, ch, 7, 1);
    cg.translate(0, cy + ch * 0.4, 0);
    parts.push(prep(cg, cA.clone().lerp(cB, f * 0.75 + rnd() * 0.2)));
  }
  return mergeGeometries(parts, false);
}

function broadleaf(rnd, { h = 6, r = 1.6, trunk = 0xd8d4c6, a = 0x63a03a, b = 0x9dc24a, blobs = 4 }) {
  const parts = [];
  const th = h * 0.55;
  const tg = new THREE.CylinderGeometry(r * 0.05, r * 0.09, th, 5, 1);
  tg.translate(0, th / 2, 0);
  parts.push(prep(tg, trunk));
  const cA = new THREE.Color(a), cB = new THREE.Color(b);
  for (let i = 0; i < blobs; i++) {
    const bg = new THREE.IcosahedronGeometry(r * (0.5 + rnd() * 0.45), 0);
    bg.scale(1, 0.8, 1);
    bg.translate((rnd() - 0.5) * r * 0.9, h * (0.6 + rnd() * 0.4), (rnd() - 0.5) * r * 0.9);
    parts.push(prep(bg, cA.clone().lerp(cB, rnd())));
  }
  return mergeGeometries(parts, false);
}

function bushGeo(rnd, { r = 0.5, a = 0x4e6f2e, b = 0x7d9b3c, blobs = 3 }) {
  const parts = [];
  const cA = new THREE.Color(a), cB = new THREE.Color(b);
  for (let i = 0; i < blobs; i++) {
    const g = new THREE.IcosahedronGeometry(r * (0.6 + rnd() * 0.6), 0);
    g.scale(1, 0.62, 1);
    g.translate((rnd() - 0.5) * r, r * (0.35 + rnd() * 0.35), (rnd() - 0.5) * r);
    parts.push(prep(g, cA.clone().lerp(cB, rnd())));
  }
  return mergeGeometries(parts, false);
}

/** A clump of tapered blades — cheap stand-in for grass / reeds / scrub. */
function bladeClump(rnd, { n = 7, h = 0.5, w = 0.055, bend = 0.35, spread = 0.12, a = 0x6c8f3a, b = 0xb2c455 }) {
  const pos = [], cols = [];
  const cA = new THREE.Color(a), cB = new THREE.Color(b);
  const tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const ang = rnd() * Math.PI * 2;
    const ox = Math.cos(ang) * spread * rnd();
    const oz = Math.sin(ang) * spread * rnd();
    const bh = h * (0.55 + rnd() * 0.75);
    const dir = rnd() * Math.PI * 2;
    const bx = Math.cos(dir) * bend * bh, bz = Math.sin(dir) * bend * bh;
    const nx = Math.cos(dir + Math.PI / 2) * w, nz = Math.sin(dir + Math.PI / 2) * w;
    const P = [
      [ox - nx, 0, oz - nz],
      [ox + nx, 0, oz + nz],
      [ox + bx * 0.5 + nx * 0.45, bh * 0.55, oz + bz * 0.5 + nz * 0.45],
      [ox + bx * 0.5 - nx * 0.45, bh * 0.55, oz + bz * 0.5 - nz * 0.45],
      [ox + bx, bh, oz + bz],
    ];
    const tri = (x, y, z) => {
      pos.push(...P[x], ...P[y], ...P[z]);
      for (const idx of [x, y, z]) {
        tmp.copy(cA).lerp(cB, clamp01(P[idx][1] / bh) * 0.9 + rnd() * 0.1);
        cols.push(tmp.r, tmp.g, tmp.b);
      }
    };
    tri(0, 1, 2); tri(0, 2, 3); tri(3, 2, 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------- desert forms

/** Butte / mesa: vertical striations + horizontal strata bands, flat shaded. */
function mesaGeo(rnd, { r = 14, h = 22, sides = 13, strata }) {
  const RINGS = [[0, 1.42], [0.07, 1.18], [0.16, 1.03], [0.55, 0.99], [0.86, 0.96], [0.95, 0.88], [1, 0.8]];
  const jit = [];
  for (let k = 0; k < sides; k++) jit.push(1 + (rnd() - 0.5) * 0.24);
  const pal = strata.map((c) => new THREE.Color(c));
  const colAt = (yf) => {
    const t = clamp01(yf) * (pal.length - 1);
    const i = Math.min(pal.length - 2, Math.floor(t));
    return pal[i].clone().lerp(pal[i + 1], smoothstep(0.25, 0.75, t - i));
  };
  const pos = [], cols = [];
  const P = (k, ri) => {
    const a = ((k % sides) / sides) * Math.PI * 2;
    const [yf, rm] = RINGS[ri];
    const rr = r * rm * jit[k % sides] * (1 + 0.03 * Math.sin(k * 2.7 + ri));
    return [Math.cos(a) * rr, yf * h, Math.sin(a) * rr];
  };
  const push = (p, yf) => {
    pos.push(p[0], p[1], p[2]);
    const hash = Math.abs(Math.sin(p[0] * 12.9898 + p[2] * 78.233) * 43758.5453) % 1;
    const c = colAt(yf).multiplyScalar(0.82 + hash * 0.36);
    cols.push(c.r, c.g, c.b);
  };
  for (let k = 0; k < sides; k++) {
    for (let ri = 0; ri < RINGS.length - 1; ri++) {
      const a0 = P(k, ri), a1 = P(k + 1, ri), b0 = P(k, ri + 1), b1 = P(k + 1, ri + 1);
      const y0 = RINGS[ri][0], y1 = RINGS[ri + 1][0];
      push(a0, y0); push(a1, y0); push(b1, y1);
      push(a0, y0); push(b1, y1); push(b0, y1);
    }
    const t0 = P(k, RINGS.length - 1), t1 = P(k + 1, RINGS.length - 1);
    push(t0, 1); push([0, h, 0], 1); push(t1, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

function cactusGeo(rnd, { h = 3.4, r = 0.17, a = 0x3f7a48, b = 0x63a35c }) {
  const parts = [];
  const cA = new THREE.Color(a), cB = new THREE.Color(b);
  const stem = (len, rad) => {
    const g = new THREE.CylinderGeometry(rad, rad * 1.06, len, 9, 1);
    g.translate(0, len / 2, 0);
    return g;
  };
  const cap = (rad) => new THREE.SphereGeometry(rad, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  parts.push(prep(stem(h, r), cA.clone().lerp(cB, 0.3)));
  const tc = cap(r); tc.translate(0, h, 0);
  parts.push(prep(tc, cB));
  const arms = 1 + Math.floor(rnd() * 2);
  for (let i = 0; i < arms; i++) {
    const side = i === 0 ? 1 : -1;
    const y = h * (0.36 + rnd() * 0.22);
    const out = r * (3.2 + rnd() * 2.2);
    const up = h * (0.28 + rnd() * 0.24);
    const hz = stem(out, r * 0.78);
    hz.rotateZ((-side * Math.PI) / 2);
    hz.translate(0, y, 0);
    parts.push(prep(hz, cA));
    const vt = stem(up, r * 0.78);
    vt.translate(side * out, y, 0);
    parts.push(prep(vt, cA.clone().lerp(cB, 0.5)));
    const vc = cap(r * 0.78); vc.translate(side * out, y + up, 0);
    parts.push(prep(vc, cB));
  }
  return mergeGeometries(parts, false);
}

// ------------------------------------------------------------------ canvas

function cloudTexture(seed) {
  const W = 768, H = 256;
  const rnd = makeRnd(seed);
  const grids = [6, 12, 24, 48, 96].map((n) => {
    const g = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) g[i] = rnd();
    return { n, g };
  });
  const sm = (t) => t * t * (3 - 2 * t);
  const samp = ({ n, g }, u, v) => {
    const x = u * n, y = v * n;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = sm(x - x0), fy = sm(y - y0);
    const at = (i, j) => g[((((j % n) + n) % n) * n) + (((i % n) + n) % n)];
    return (
      (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) +
      (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy
    );
  };
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      let n = 0, amp = 1, tot = 0;
      for (let o = 0; o < grids.length; o++) {
        n += amp * samp(grids[o], u, v * 0.5 + 0.22);
        tot += amp; amp *= 0.52;
      }
      n /= tot;
      let a = Math.pow(Math.max(0, n - 0.46) / 0.54, 1.2);
      a *= smoothstep(0, 0.3, v) * smoothstep(1.0, 0.74, v);
      const i = (y * W + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * 340);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function waterNormalTexture() {
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);
  const waves = [
    [3, 1, 0.55, 0.0], [1, 4, 0.42, 1.3], [6, 3, 0.24, 2.4],
    [2, 7, 0.2, 0.7], [9, 6, 0.12, 3.9], [12, 2, 0.09, 1.1],
  ];
  const hAt = (u, v) => {
    let s = 0;
    for (const [fx, fy, a, p] of waves) s += a * Math.sin(2 * Math.PI * (fx * u + fy * v) + p);
    return s;
  };
  const e = 1 / N;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      const dx = (hAt(u + e, v) - hAt(u - e, v)) / (2 * e);
      const dy = (hAt(u, v + e) - hAt(u, v - e)) / (2 * e);
      const nx = -dx * 0.012, ny = -dy * 0.012, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * N + x) * 4;
      img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Derive a tangent-space normal map from a greyscale canvas (wraps seamlessly). */
function normalFromCanvas(srcCanvas, strength) {
  const N = srcCanvas.width;
  const src = srcCanvas.getContext('2d').getImageData(0, 0, N, N).data;
  const lum = (x, y) => {
    const i = (((((y % N) + N) % N) * N) + (((x % N) + N) % N)) * 4;
    return (src[i] * 0.3 + src[i + 1] * 0.59 + src[i + 2] * 0.11) / 255;
  };
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength;
      const dy = (lum(x, y + 1) - lum(x, y - 1)) * strength;
      const l = Math.hypot(-dx, -dy, 1);
      const i = (y * N + x) * 4;
      img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / l) * 0.5 * 255 + 127.5;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function glowTexture() {
  const N = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    g.addColorStop(t, `rgba(255,255,255,${Math.pow(1 - t, 2.2).toFixed(3)})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, N, N);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function discTexture() {
  const N = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(N / 2, N / 2, N * 0.34, 0, Math.PI * 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// -------------------------------------------------------------------- defs

const DEFS = {
  mountain: {
    hdr: 'assets/hdri/kiara_1_dawn_2k.hdr',
    sun: { dir: [18, 6.5, 10], color: 0xffcb92, intensity: 3.4 },
    exposure: 1.02,
    envIntensity: 0.85,
    ground: 0xb98a4c,
    fog: 0xe9bfa4,
    fogD: 0.0015,
    hemi: 0.34,
    hemiSky: 0x9fc0f0, hemiGround: 0x6b5334, // cool dawn shadow fill against the warm sun
    sky: {
      top: 0x2359a8, mid: 0x7ba9dd, hor: 0xffc094, gnd: 0xdb9c7f,
      haze: 0xff8f5e, sun: 0xffd6a4, sunAmt: 1.6, sunSharp: 260, hazeAmt: 0.6, gain: 1.4,
    },
    cloud: { color: 0xffc0a2, opacity: 0.9, gain: 1.6 },
    rockR: 55,
  },
  lake: {
    hdr: 'assets/hdri/lakeside_2k.hdr',
    sun: { dir: [-12, 11, 14], color: 0xfff2dc, intensity: 2.9 },
    exposure: 1.0,
    envIntensity: 0.95,
    ground: 0xb0a878,
    fog: 0xcbe6e4,
    fogD: 0.0016,
    hemi: 0.34,
    hemiSky: 0x9fd6ee, hemiGround: 0x5f6a44,
    sky: {
      top: 0x1466c6, mid: 0x69b0ea, hor: 0xd8eff4, gnd: 0xa6c8c6,
      haze: 0x9fdfec, sun: 0xfff4d6, sunAmt: 1.2, sunSharp: 420, hazeAmt: 0.4, gain: 1.35,
    },
    cloud: { color: 0xffffff, opacity: 0.65, gain: 1.4 },
    rockR: 17,
  },
  forest: {
    hdr: 'assets/hdri/forest_slope_2k.hdr',
    sun: { dir: [11, 13, -6], color: 0xffeeb4, intensity: 2.9 },
    exposure: 1.06,
    envIntensity: 0.95,
    ground: 0x6d5730,
    fog: 0xa8c46e,
    fogD: 0.0034,
    hemi: 0.34,
    hemiSky: 0xc4e6a4, hemiGround: 0x3a3a1c,
    sky: {
      top: 0x2470b2, mid: 0x83c4dc, hor: 0xe8f2b6, gnd: 0xa2b672,
      haze: 0xd6ee8c, sun: 0xfff8d0, sunAmt: 1.8, sunSharp: 190, hazeAmt: 0.5, gain: 1.35,
    },
    cloud: { color: 0xf6ffdc, opacity: 0.5, gain: 1.35 },
    rockR: 40,
  },
  desert: {
    hdr: 'assets/hdri/syferfontein_1d_clear_2k.hdr',
    sun: { dir: [-18, 5.5, -11], color: 0xffb26a, intensity: 3.6 },
    exposure: 1.0,
    envIntensity: 0.8,
    ground: 0xc07445,
    fog: 0xdd8256,
    fogD: 0.0016,
    hemi: 0.36,
    hemiSky: 0x8f7ade, hemiGround: 0x7a3a1c, // violet dusk fill on the shadow side
    sky: {
      top: 0x2b3390, mid: 0x8a4ea8, hor: 0xff8c3a, gnd: 0xc85a2a,
      haze: 0xff6524, sun: 0xffcc80, sunAmt: 2.0, sunSharp: 160, hazeAmt: 0.7, gain: 1.45,
    },
    cloud: { color: 0xff9257, opacity: 0.85, gain: 1.8 },
    rockR: 55,
  },
  night: {
    hdr: 'assets/hdri/dikhololo_night_2k.hdr',
    // moon behind the bike from the default cameras → rim light on the silhouette
    //
    // Raised from 1.25 / 1.14. The rim light read beautifully on a bare frame
    // and hid a loaded one: the menu's whole argument is that the bike you are
    // reading about is the bike you are looking at, and at night a ten-bag
    // Apidura rig with a full manifest beside it rendered as one black
    // silhouette. Enough key to carry the bag faces; still unmistakably night.
    sun: { dir: [-9, 6.5, -14], color: 0x9cbcf2, intensity: 1.9 },
    exposure: 1.24,
    envIntensity: 1.35,
    ground: 0x333c55,
    fog: 0x101830,
    fogD: 0.0045,
    hemi: 0.24,
    hemiSky: 0x2c4a86, hemiGround: 0x10131c,
    sky: {
      top: 0x030815, mid: 0x0a1533, hor: 0x1c2f5c, gnd: 0x0c1327,
      haze: 0x27467c, sun: 0xc0d8ff, sunAmt: 1.0, sunSharp: 900, hazeAmt: 0.4, gain: 1.1,
    },
    cloud: { color: 0x2b3e6e, opacity: 0.55, gain: 1.0 },
    camp: true,
    rockR: 38,
  },
};

// ------------------------------------------------------------------- class

export class Environments {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
    this.loader = new RGBELoader();
    this.cache = {};
    this.worlds = {};
    this.current = null;
    this.loadToken = 0;
    this.time = 0;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = this.sun.shadow.camera;
    sc.left = -3; sc.right = 3; sc.top = 3; sc.bottom = -3;
    sc.near = 0.5; sc.far = 60;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.018;
    this.sun.shadow.radius = 5;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.sun.target.position.set(0.1, 0.6, 0);

    this.hemi = new THREE.HemisphereLight(0xbfd4e6, 0x54483c, 0.18);
    scene.add(this.hemi);

    this._buildSky();
    this._buildGround();
    this._buildRocks();

    this.tex = { cloud: null, water: null, glow: glowTexture(), disc: discTexture() };

    this.worldRoot = new THREE.Group();
    scene.add(this.worldRoot);

    this.camp = new THREE.PointLight(0xffa050, 18, 14, 1.8);
    this.camp.position.set(-2.7, 0.5, -2.4);
    this.camp.visible = false;
    scene.add(this.camp);
  }

  // ---------------------------------------------------------------- sky

  _buildSky() {
    const u = {
      cTop: { value: new THREE.Color(0x2a5fa8) },
      cMid: { value: new THREE.Color(0x8bb3dd) },
      cHor: { value: new THREE.Color(0xffc39a) },
      cGnd: { value: new THREE.Color(0xd8a08a) },
      cHaze: { value: new THREE.Color(0xff9366) },
      cSun: { value: new THREE.Color(0xffd9ad) },
      sunDir: { value: new THREE.Vector3(1, 0.3, 0).normalize() },
      sunAmt: { value: 1.4 }, sunSharp: { value: 240 }, hazeAmt: { value: 0.5 },
    };
    this.skyU = u;
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      // LINEAR out: main.js renders via EffectComposer, OutputPass does the tonemap
      fragmentShader: /* glsl */ `
        uniform vec3 cTop, cMid, cHor, cGnd, cHaze, cSun;
        uniform vec3 sunDir;
        uniform float sunAmt, sunSharp, hazeAmt;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize( vDir );
          float h = d.y;
          vec3 col = mix( cHor, cMid, smoothstep( 0.0, 0.20, h ) );
          col = mix( col, cTop, smoothstep( 0.14, 0.80, h ) );
          col = mix( col, cGnd, smoothstep( 0.005, -0.14, h ) );
          col += cHaze * exp( -abs( h ) * 11.0 ) * hazeAmt;
          float sd = max( dot( d, sunDir ), 0.0 );
          col += cSun * pow( sd, sunSharp ) * sunAmt;
          col += cSun * pow( sd, 8.0 ) * sunAmt * 0.32;
          col += cSun * pow( sd, 2.0 ) * sunAmt * 0.08;
          gl_FragColor = vec4( col, 1.0 );
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(480, 48, 32), mat);
    this.sky.renderOrder = -1000;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  // -------------------------------------------------------------- ground

  _buildGround() {
    const scene = this.scene;
    const gc = document.createElement('canvas');
    gc.width = gc.height = 512;
    const gctx = gc.getContext('2d');
    gctx.fillStyle = '#8e8a80';
    gctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 300; i++) {
      const v = 108 + Math.random() * 88;
      gctx.fillStyle = `rgba(${v},${v - 5},${v - 13},${0.06 + Math.random() * 0.1})`;
      const r = 18 + Math.random() * 46;
      const x = Math.random() * 512, y = Math.random() * 512;
      for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) {
        gctx.beginPath();
        gctx.ellipse(x + dx, y + dy, r, r * (0.4 + Math.random() * 0.6), Math.random() * 3, 0, Math.PI * 2);
        gctx.fill();
      }
    }
    for (let i = 0; i < 34000; i++) {
      const v = 92 + Math.random() * 118;
      gctx.fillStyle = `rgba(${v},${v - 6},${v - 15},${0.16 + Math.random() * 0.28})`;
      const r = Math.random() < 0.93 ? 0.8 + Math.random() * 2.2 : 3 + Math.random() * 6.5;
      const x = Math.random() * 512, y = Math.random() * 512;
      for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) {
        gctx.beginPath();
        gctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        gctx.fill();
      }
    }
    const groundTex = new THREE.CanvasTexture(gc);
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(90, 90);
    groundTex.anisotropy = 8;
    groundTex.colorSpace = THREE.SRGBColorSpace;
    // real grit relief, so the stage stops reading as a sheet of felt
    const groundNrm = normalFromCanvas(gc, 9);
    groundNrm.repeat.copy(groundTex.repeat);
    groundNrm.anisotropy = 8;

    this.groundMat = new THREE.MeshStandardMaterial({
      color: 0x7a7568, roughness: 0.98, metalness: 0, map: groundTex,
      normalMap: groundNrm, normalScale: new THREE.Vector2(0.8, 0.8),
      vertexColors: true, dithering: true,
    });

    this.ground = new THREE.Mesh(this._relief(400, 170, 96), this.groundMat);
    this.ground.receiveShadow = true;
    scene.add(this.ground);
    this.shoreDisc = new THREE.Mesh(this._relief(17.5, 30, 96), this.groundMat);
    this.shoreDisc.receiveShadow = true;
    this.shoreDisc.visible = false;
    scene.add(this.shoreDisc);

    // soft contact pool under the bike (replaces the old scene-wide vignette,
    // which flattened exactly the distance these worlds are trying to open up)
    const vg = document.createElement('canvas');
    vg.width = vg.height = 256;
    const vctx = vg.getContext('2d');
    const grad = vctx.createRadialGradient(128, 128, 4, 128, 128, 128);
    grad.addColorStop(0, 'rgba(0,0,0,0.30)');
    grad.addColorStop(0.3, 'rgba(0,0,0,0.15)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0.045)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    vctx.fillStyle = grad;
    vctx.fillRect(0, 0, 256, 256);
    const vt = new THREE.CanvasTexture(vg);
    vt.colorSpace = THREE.SRGBColorSpace;
    this.vignette = new THREE.Mesh(
      new THREE.CircleGeometry(9, 48),
      new THREE.MeshBasicMaterial({ map: vt, transparent: true, depthWrite: false })
    );
    this.vignette.rotation.x = -Math.PI / 2;
    this.vignette.position.y = 0.004;
    this.vignette.renderOrder = 2;
    scene.add(this.vignette);
  }

  /**
   * Disc in the XZ plane displaced by terrainH, uv-matched across both variants.
   * The innermost ring collapses to the origin (a fan, not an annulus) so there
   * is no pinhole under the bike, and normals come from the height field
   * analytically — computeVertexNormals would produce garbage on the sliver
   * triangles at the centre.
   */
  _relief(rOut, radSegs, angSegs) {
    const pos = [], uv = [], col = [], nrm = [];
    const E = 0.75;
    const P = (ri, ai) => {
      const t = ri / radSegs;
      const r = rOut * (0.06 * t + 0.94 * t * t);
      const a = (ai / angSegs) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const m = mottle(x, z);
      const nx = -(terrainH(x + E, z) - terrainH(x - E, z)) / (2 * E);
      const nz = -(terrainH(x, z + E) - terrainH(x, z - E)) / (2 * E);
      const l = Math.hypot(nx, 1, nz);
      return [x, terrainH(x, z), z, x / 32 + 0.5, z / 32 + 0.5, m * 1.02, m, m * 0.95, nx / l, 1 / l, nz / l];
    };
    const put = (p) => {
      pos.push(p[0], p[1], p[2]);
      uv.push(p[3], p[4]);
      col.push(p[5], p[6], p[7]);
      nrm.push(p[8], p[9], p[10]);
    };
    for (let ri = 0; ri < radSegs; ri++)
      for (let ai = 0; ai < angSegs; ai++) {
        const a0 = P(ri, ai), a1 = P(ri, ai + 1), b0 = P(ri + 1, ai), b1 = P(ri + 1, ai + 1);
        put(a0); put(b1); put(b0);
        put(a0); put(a1); put(b1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    return g;
  }

  _buildRocks() {
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 1, flatShading: true });
    const N = 150;
    const rnd = makeRnd(12);
    const list = [];
    while (list.length < N) {
      const ang = rnd() * Math.PI * 2;
      const r = 3.2 + Math.pow(rnd(), 0.8) * 50;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      if (z > -1.2 && Math.abs(x) < 4 && r < 9) continue;
      if (z > 0 && r < 7) continue;
      // stone size tracks distance, so nothing near the camera becomes a boulder
      const s = 0.05 + Math.pow(rnd(), 2) * 0.16 + smoothstep(10, 48, r) * (0.15 + rnd() * 1.05);
      list.push({ x, z, r, s, a: rnd(), b: rnd(), c: rnd(), d: rnd(), e: rnd() });
    }
    list.sort((p, q) => p.r - q.r);
    this.rockR = list.map((p) => p.r);
    const rocks = instance(rockGeo, this.rockMat, N, (dm, i, c) => {
      const p = list[i];
      dm.position.set(p.x, terrainH(p.x, p.z) + p.s * 0.28, p.z);
      dm.rotation.set(p.a * 3, p.b * 3, p.c * 3);
      dm.scale.set(p.s * (0.7 + p.d * 0.7), p.s * (0.5 + p.e * 0.5), p.s * (0.7 + p.a * 0.7));
      c.setRGB(0.82 + p.d * 0.4, 0.84 + p.e * 0.3, 0.8 + p.b * 0.35);
    });
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.rocks = rocks;
    this.scene.add(rocks);
  }

  // --------------------------------------------------------------- clouds

  _clouds(def, { thetaStart = 0.26, thetaLen = 0.235 } = {}) {
    if (!this.tex.cloud) this.tex.cloud = cloudTexture(4711);
    const c = new THREE.Color(def.cloud.color).multiplyScalar(def.cloud.gain);
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(468, 64, 24, 0, Math.PI * 2, Math.PI * thetaStart, Math.PI * thetaLen),
      new THREE.MeshBasicMaterial({
        map: this.tex.cloud, color: c, transparent: true, opacity: def.cloud.opacity,
        depthWrite: false, side: THREE.BackSide, fog: false,
      })
    );
    m.renderOrder = -900;
    m.frustumCulled = false;
    return m;
  }

  // ---------------------------------------------------------------- worlds

  _world(name) {
    if (this.worlds[name]) return this.worlds[name];
    const g = new THREE.Group();
    const anim = [];
    const ctx = { def: DEFS[name], group: g, anim };
    ({
      mountain: this._wMountain, lake: this._wLake, forest: this._wForest,
      desert: this._wDesert, night: this._wNight,
    })[name].call(this, ctx);
    this.worldRoot.add(g);
    this.worlds[name] = { group: g, anim };
    return this.worlds[name];
  }

  /** Ridge layers are sized by the angle they subtend, not by "realistic" height. */
  _ridges(group, layers) {
    const M = terrainMat();
    for (const l of layers) group.add(new THREE.Mesh(ridgeGeo(l), M));
    return M;
  }

  // ---- mountain: four ridge layers out to 430 m, alpine dawn --------------
  _wMountain({ def, group, anim }) {
    this._ridges(group, [
      // the far range deliberately runs off the top of frame — that is what
      // makes a 27° lens read "mountains" rather than "hills"
      { radius: 432, height: 145, segs: 300, seed: 3, slope: 0.85, rJitter: 0.12, hMin: 0.26, sharp: 1.5, freq: 0.75,
        low: 0x51648f, mid: 0x7186ad, high: 0xa8b4d6, snow: 0xfdf9ff, snowLine: 0.42, shade: 0.14 },
      { radius: 258, height: 31, segs: 280, seed: 17, slope: 0.95, rJitter: 0.16, hMin: 0.2, sharp: 1.6, freq: 1.1,
        low: 0x5a5142, mid: 0x877659, high: 0xada08b, snow: 0xf4f2fd, snowLine: 0.74, shade: 0.18 },
      { radius: 142, height: 12, segs: 260, seed: 41, slope: 1.25, rJitter: 0.24, hMin: 0.14, sharp: 1.9, freq: 1.5,
        low: 0x4f5630, mid: 0x767642, high: 0x9c9557, shade: 0.2 },
      { radius: 74, height: 4.0, segs: 200, seed: 91, slope: 2.6, rJitter: 0.34, hMin: 0.05, sharp: 2.3, freq: 2.3,
        low: 0x6d6640, mid: 0x8f8352, high: 0xac9a66, shade: 0.22 },
    ]);

    const rnd = makeRnd(7);
    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    const bladeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });

    // conifers: never inside 42 m, and small until well past that
    const pine = conifer(rnd, { h: 8, r: 1.2, tiers: 5, a: 0x1d4a30, b: 0x437442 });
    group.add(instance(pine, leafMat, 260, (d, i, c) => {
      const a = rnd() * Math.PI * 2;
      const r = 42 + Math.pow(rnd(), 0.75) * 105;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const s = 0.28 + rnd() * 0.2 + smoothstep(45, 130, r) * 0.75;
      d.position.set(x, terrainH(x, z) - 0.12, z);
      d.rotation.y = rnd() * 6.28;
      d.scale.set(s * (0.82 + rnd() * 0.36), s * (0.85 + rnd() * 0.4), s * (0.82 + rnd() * 0.36));
      c.setRGB(0.78 + rnd() * 0.5, 0.86 + rnd() * 0.32, 0.72 + rnd() * 0.4);
    }));
    // low alpine scrub across the 9–48 m band
    const scrub = bushGeo(rnd, { r: 0.34, a: 0x455a26, b: 0x7d8c3a, blobs: 3 });
    group.add(instance(scrub, leafMat, 340, (d, i, c) => {
      const a = rnd() * Math.PI * 2;
      const r = 9 + Math.pow(rnd(), 0.65) * 42;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const s = 0.5 + rnd() * 0.6 + smoothstep(20, 50, r) * 0.9;
      d.position.set(x, terrainH(x, z) - 0.05, z);
      d.rotation.y = rnd() * 6.28;
      d.scale.set(s, s * (0.6 + rnd() * 0.5), s);
      c.setRGB(0.75 + rnd() * 0.55, 0.85 + rnd() * 0.35, 0.6 + rnd() * 0.4);
    }));
    // ankle-height tussock right across the stage
    const tuft = bladeClump(rnd, { n: 6, h: 0.15, w: 0.02, bend: 0.4, spread: 0.09, a: 0x5f6c2c, b: 0xb8b64c });
    group.add(instance(tuft, bladeMat, 900, (d, i, c) => {
      const a = rnd() * Math.PI * 2;
      const r = 2.2 + Math.pow(rnd(), 0.55) * 34;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z > -1.1 && Math.abs(x) < 1.4 && r < 2.8) return false;
      const s = 0.6 + rnd() * 0.8 + smoothstep(8, 34, r) * 1.9;
      d.position.set(x, terrainH(x, z), z);
      d.rotation.y = rnd() * 6.28;
      d.scale.setScalar(s);
      c.setRGB(0.72 + rnd() * 0.55, 0.82 + rnd() * 0.4, 0.55 + rnd() * 0.45);
    }));

    const cl = this._clouds(def, { thetaStart: 0.395, thetaLen: 0.12 });
    group.add(cl);
    anim.push((t) => { cl.rotation.y = t * 0.0018; });
  }

  // ---- lake: gravel spit ringed by open water, forested far shore ---------
  _wLake({ def, group, anim }) {
    if (!this.tex.water) this.tex.water = waterNormalTexture();
    const wtex = this.tex.water;
    wtex.repeat.set(300, 300);
    wtex.anisotropy = 8;

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0f6b80, roughness: 0.1, metalness: 0.12,
      normalMap: wtex, normalScale: new THREE.Vector2(1.1, 1.1),
      envMapIntensity: 1.9,
    });
    // second, counter-scrolling ripple layer injected into the standard shader
    waterMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = { value: 0 };
      sh.fragmentShader = 'uniform float uTime;\n' + sh.fragmentShader.replace(
        'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
        `vec3 mapN = texture2D( normalMap, vNormalMapUv + vec2( uTime * 0.0035, uTime * 0.0021 ) ).xyz * 2.0 - 1.0;
         vec3 mapN2 = texture2D( normalMap, vNormalMapUv * 2.3 + vec2( -uTime * 0.0026, uTime * 0.0044 ) ).xyz * 2.0 - 1.0;
         mapN = normalize( mapN + mapN2 * 0.85 );`
      );
      waterMat.userData.shader = sh;
    };
    const water = new THREE.Mesh(new THREE.RingGeometry(14, 440, 160, 16), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.09; // shore relief ripples through this, so the waterline reads organic
    group.add(water);
    anim.push((t) => {
      const sh = waterMat.userData.shader;
      if (sh) sh.uniforms.uTime.value = t;
      else { wtex.offset.x = t * 0.003; wtex.offset.y = t * 0.002; }
    });

    this._ridges(group, [
      // far shore tree wall — high-frequency profile reads as canopy, not rock
      { radius: 192, height: 16, segs: 340, seed: 5, slope: 0.5, rJitter: 0.1, hMin: 0.36, sharp: 1.25, freq: 4.0,
        low: 0x0e3320, mid: 0x1a552b, high: 0x3f8636, shade: 0.26 },
      { radius: 305, height: 58, segs: 260, seed: 23, slope: 0.9, rJitter: 0.15, hMin: 0.24, sharp: 1.5, freq: 1.4,
        low: 0x24505c, mid: 0x356f7c, high: 0x5e9bb2, shade: 0.14 },
      { radius: 442, height: 128, segs: 240, seed: 61, slope: 0.85, rJitter: 0.12, hMin: 0.26, sharp: 1.5, freq: 0.85,
        low: 0x5482a2, mid: 0x729bb6, high: 0xa5c4d8, snow: 0xf4faff, snowLine: 0.5, shade: 0.09 },
    ]);

    const rnd = makeRnd(31);
    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    const bladeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    const pine = conifer(rnd, { h: 9, r: 1.3, tiers: 5, a: 0x143a24, b: 0x2f6c34 });
    group.add(instance(pine, leafMat, 260, (d, i, c) => {
      const a = rnd() * Math.PI * 2;
      const r = 188 + rnd() * 28;
      const s = 1.0 + rnd() * 1.1;
      d.position.set(Math.cos(a) * r, -0.6, Math.sin(a) * r);
      d.rotation.y = rnd() * 6.28;
      d.scale.set(s, s * (0.85 + rnd() * 0.5), s);
      c.setRGB(0.75 + rnd() * 0.5, 0.85 + rnd() * 0.35, 0.7 + rnd() * 0.4);
    }));

    // shoreline: pebble berm and a broken band of reeds, not a curtain
    const reed = bladeClump(rnd, { n: 8, h: 0.42, w: 0.02, bend: 0.14, spread: 0.1, a: 0x5f7328, b: 0xc4cc60 });
    group.add(instance(reed, bladeMat, 460, (d, i, c) => {
      const a = rnd() * Math.PI * 2;
      // clumped: reeds only grow where a slow angular wave says they do
      if (Math.sin(a * 5.3 + 1.1) + 0.55 * Math.sin(a * 11.7) < -0.15) return false;
      const r = 15.4 + Math.pow(rnd(), 0.6) * 2.6;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const s = 0.7 + rnd() * 1.3;
      d.position.set(x, terrainH(x, z) - 0.05, z);
      d.rotation.y = rnd() * 6.28;
      d.scale.set(s * 0.8, s, s * 0.8);
      c.setRGB(0.78 + rnd() * 0.45, 0.85 + rnd() * 0.35, 0.6 + rnd() * 0.45);
    }));
    const tuft = bladeClump(rnd, { n: 6, h: 0.15, w: 0.02, bend: 0.45, spread: 0.09, a: 0x5c7530, b: 0xb4c455 });
    group.add(instance(tuft, bladeMat, 620, (d, i, c) => {
      const a = rnd() * Math.PI * 2;
      const r = 2.4 + Math.pow(rnd(), 0.6) * 13;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z > -1.1 && Math.abs(x) < 1.4 && r < 2.8) return false;
      const s = 0.6 + rnd() * 0.9 + smoothstep(6, 15, r) * 0.9;
      d.position.set(x, terrainH(x, z), z);
      d.rotation.y = rnd() * 6.28;
      d.scale.setScalar(s);
      c.setRGB(0.72 + rnd() * 0.55, 0.85 + rnd() * 0.35, 0.55 + rnd() * 0.45);
    }));
    const pebble = new THREE.IcosahedronGeometry(1, 0);
    group.add(instance(pebble, new THREE.MeshStandardMaterial({ color: 0x8d8874, roughness: 1, flatShading: true }), 520, (d, i, c) => {
      const a = rnd() * Math.PI * 2;
      const r = 11 + Math.pow(rnd(), 0.6) * 6;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const s = 0.07 + Math.pow(rnd(), 2) * 0.3;
      d.position.set(x, terrainH(x, z) + s * 0.18, z);
      d.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      d.scale.set(s, s * 0.55, s * (0.8 + rnd() * 0.5));
      c.setRGB(0.85 + rnd() * 0.35, 0.85 + rnd() * 0.3, 0.78 + rnd() * 0.32);
    }));

    const cl = this._clouds(def, { thetaStart: 0.30, thetaLen: 0.21 });
    group.add(cl);
    anim.push((t) => { cl.rotation.y = t * 0.0012; });
  }

  // ---- forest: conifer + birch stands around a dirt trail -----------------
  _wForest({ def, group, anim }) {
    this._ridges(group, [
      { radius: 155, height: 22, segs: 340, seed: 9, slope: 0.5, rJitter: 0.15, hMin: 0.4, sharp: 1.2, freq: 4.4,
        low: 0x123018, mid: 0x224d1e, high: 0x437c28, shade: 0.26 },
      { radius: 248, height: 46, segs: 280, seed: 29, slope: 0.7, rJitter: 0.14, hMin: 0.3, sharp: 1.4, freq: 2.3,
        low: 0x21462a, mid: 0x33632f, high: 0x5c8c41, shade: 0.18 },
      { radius: 402, height: 96, segs: 240, seed: 77, slope: 1.0, rJitter: 0.14, hMin: 0.3, sharp: 1.4, freq: 1.0,
        low: 0x4d7a64, mid: 0x6a9278, high: 0x9ab8a2, shade: 0.11 },
    ]);

    const rnd = makeRnd(53);
    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    const bladeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });

    const wind = (x) => Math.sin(x * 0.055) * 3.4 + Math.sin(x * 0.017 + 1.2) * 6;
    const offTrail = (x, z, w) => Math.abs(x) > 62 || Math.abs(z - wind(x)) > w;

    const archetypes = [
      conifer(rnd, { h: 13, r: 1.7, tiers: 6, a: 0x18401f, b: 0x3a7a2c }),
      conifer(rnd, { h: 9.5, r: 1.45, tiers: 5, a: 0x1f4b23, b: 0x4f9134 }),
      broadleaf(rnd, { h: 8.5, r: 2.2, trunk: 0xe4e0cd, a: 0x5a9b2c, b: 0xaed44a, blobs: 5 }),
      broadleaf(rnd, { h: 6, r: 1.7, trunk: 0x6a5b42, a: 0x468a26, b: 0x93c33d, blobs: 4 }),
    ];
    for (let k = 0; k < archetypes.length; k++) {
      group.add(instance(archetypes[k], leafMat, k < 2 ? 150 : 95, (d, i, c) => {
        const a = rnd() * Math.PI * 2;
        const r = 26 + Math.pow(rnd(), 0.6) * 115;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (!offTrail(x, z, 4.5)) return false;
        // stay small close in; only the deep stands get full height
        const s = 0.32 + rnd() * 0.18 + smoothstep(28, 95, r) * 0.85;
        d.position.set(x, terrainH(x, z) - 0.2, z);
        d.rotation.set((rnd() - 0.5) * 0.06, rnd() * 6.28, (rnd() - 0.5) * 0.06);
        d.scale.set(s * (0.82 + rnd() * 0.36), s * (0.85 + rnd() * 0.45), s * (0.82 + rnd() * 0.36));
        c.setRGB(0.7 + rnd() * 0.6, 0.86 + rnd() * 0.34, 0.62 + rnd() * 0.45);
      }));
    }

    // winding dirt trail under the bike, running off into the trees
    {
      const pos = [], uv = [], col = [];
      const halfW = (x) => 1.35 + Math.sin(x * 0.09) * 0.22;
      const tmp = new THREE.Color();
      const P = (x, s) => {
        const z = wind(x) + s * halfW(x);
        const edge = Math.abs(s);
        const m = mottle(x * 1.7, z * 1.7);
        tmp.setRGB((1.42 - edge * 0.55) * m, (1.26 - edge * 0.48) * m, (1.02 - edge * 0.4) * m);
        return [x, terrainH(x, z) + 0.014, z, x * 0.09, (s * 0.5 + 0.5) * 0.9, tmp.r, tmp.g, tmp.b];
      };
      const put = (p) => { pos.push(p[0], p[1], p[2]); uv.push(p[3], p[4]); col.push(p[5], p[6], p[7]); };
      const S = [-1, -0.62, -0.25, 0.25, 0.62, 1];
      for (let x = -70; x < 70; x += 1.2)
        for (let k = 0; k < S.length - 1; k++) {
          const a0 = P(x, S[k]), a1 = P(x + 1.2, S[k]), b0 = P(x, S[k + 1]), b1 = P(x + 1.2, S[k + 1]);
          put(a0); put(b0); put(b1);
          put(a0); put(b1); put(a1);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      const trailTex = this.groundMat.map.clone();
      trailTex.needsUpdate = true;
      trailTex.repeat.set(16, 3);
      const trail = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        color: 0xc99a5c, map: trailTex, vertexColors: true, roughness: 1,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      trail.receiveShadow = true;
      group.add(trail);
    }

    // undergrowth: low ferns everywhere off-trail, shrubs deeper in
    const fern = bladeClump(rnd, { n: 8, h: 0.26, w: 0.045, bend: 0.66, spread: 0.1, a: 0x2f6420, b: 0x8ac93e });
    group.add(instance(fern, bladeMat, 1300, (d, i, c) => {
      const a = rnd() * Math.PI * 2;
      const r = 2.2 + Math.pow(rnd(), 0.5) * 48;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!offTrail(x, z, 1.55)) return false;
      const s = 0.55 + rnd() * 0.85 + smoothstep(8, 45, r) * 2.4;
      d.position.set(x, terrainH(x, z), z);
      d.rotation.y = rnd() * 6.28;
      d.scale.setScalar(s);
      c.setRGB(0.68 + rnd() * 0.62, 0.86 + rnd() * 0.34, 0.5 + rnd() * 0.5);
    }));
    const shrub = bushGeo(rnd, { r: 0.42, a: 0x2a5a1e, b: 0x6a9c2c, blobs: 4 });
    group.add(instance(shrub, leafMat, 300, (d, i, c) => {
      const a = rnd() * Math.PI * 2;
      const r = 7 + Math.pow(rnd(), 0.6) * 70;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!offTrail(x, z, 2.4)) return false;
      const s = 0.55 + rnd() * 0.6 + smoothstep(15, 60, r) * 1.5;
      d.position.set(x, terrainH(x, z), z);
      d.rotation.y = rnd() * 6.28;
      d.scale.set(s, s * (0.7 + rnd() * 0.6), s);
      c.setRGB(0.68 + rnd() * 0.6, 0.86 + rnd() * 0.34, 0.55 + rnd() * 0.45);
    }));

    const cl = this._clouds(def, { thetaStart: 0.31, thetaLen: 0.20 });
    group.add(cl);
    anim.push((t) => { cl.rotation.y = -t * 0.001; });
  }

  // ---- desert: red-rock buttes at three depths, saguaro, dusk grade -------
  _wDesert({ def, group, anim }) {
    const M = terrainMat();
    const rnd = makeRnd(101);
    const STRATA = [0x5e2a1e, 0x8f3f24, 0xc26536, 0x9c3f26, 0xd8873f, 0xb04a26, 0xeaa85e];

    // depth cue: the far bands are dimmed and pulled toward the violet dusk haze
    const bands = [
      { r: 145, count: 8, hs: [10, 18], rs: [8, 18], dim: 1.08, haze: 0.0 },
      { r: 272, count: 10, hs: [26, 44], rs: [18, 40], dim: 0.95, haze: 0.22 },
      { r: 428, count: 13, hs: [55, 92], rs: [34, 72], dim: 0.86, haze: 0.45 },
    ];
    const HAZE = new THREE.Color(0x8b6bb8);
    for (const b of bands) {
      const parts = [];
      for (let i = 0; i < b.count; i++) {
        const a = ((i + rnd() * 0.7) / b.count) * Math.PI * 2;
        const rr = b.r * (0.85 + rnd() * 0.34);
        const h = b.hs[0] + rnd() * (b.hs[1] - b.hs[0]);
        const rad = b.rs[0] + rnd() * (b.rs[1] - b.rs[0]);
        const g = mesaGeo(rnd, {
          r: rad, h, sides: 11 + Math.floor(rnd() * 5),
          strata: STRATA.map((c) => new THREE.Color(c).multiplyScalar(b.dim).lerp(HAZE, b.haze)),
        });
        g.rotateY(rnd() * 6.28);
        g.translate(Math.cos(a) * rr, -h * 0.03, Math.sin(a) * rr);
        parts.push(g);
      }
      group.add(new THREE.Mesh(mergeGeometries(parts, false), M));
    }
    group.add(new THREE.Mesh(ridgeGeo({
      radius: 452, height: 72, segs: 240, seed: 13, slope: 0.4, rJitter: 0.14, hMin: 0.44, sharp: 1.2, freq: 1.4,
      low: 0x6a4258, mid: 0x855260, high: 0xa8746e, shade: 0.11,
    }), M));
    group.add(new THREE.Mesh(ridgeGeo({
      radius: 62, height: 2.6, segs: 220, seed: 205, slope: 3.4, rJitter: 0.4, hMin: 0.05, sharp: 2.2, freq: 2.4,
      low: 0xa5623a, mid: 0xc9834b, high: 0xe4a865, shade: 0.2,
    }), M));

    const plantMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    const bladeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    const cactus = cactusGeo(rnd, { h: 3.6, r: 0.19, a: 0x33683e, b: 0x5f9c56 });
    group.add(instance(cactus, plantMat, 90, (d, i, c) => {
      const a = rnd() * Math.PI * 2;
      const r = 28 + Math.pow(rnd(), 0.7) * 95;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const s = 0.55 + rnd() * 0.35 + smoothstep(35, 110, r) * 0.9;
      d.position.set(x, terrainH(x, z), z);
      d.rotation.y = rnd() * 6.28;
      d.scale.set(s * (0.85 + rnd() * 0.3), s * (0.85 + rnd() * 0.5), s * (0.85 + rnd() * 0.3));
      c.setRGB(0.8 + rnd() * 0.4, 0.85 + rnd() * 0.3, 0.75 + rnd() * 0.4);
    }));
    const brush = bushGeo(rnd, { r: 0.26, a: 0x6b5f2f, b: 0xa89a53, blobs: 4 });
    group.add(instance(brush, plantMat, 420, (d, i, c) => {
      const a = rnd() * Math.PI * 2;
      const r = 4.5 + Math.pow(rnd(), 0.6) * 62;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z > -1.4 && Math.abs(x) < 1.8 && r < 3.6) return false;
      const s = 0.5 + rnd() * 0.5 + smoothstep(12, 55, r) * 1.7;
      d.position.set(x, terrainH(x, z) - 0.04, z);
      d.rotation.y = rnd() * 6.28;
      d.scale.set(s, s * (0.55 + rnd() * 0.6), s);
      c.setRGB(0.8 + rnd() * 0.45, 0.82 + rnd() * 0.35, 0.68 + rnd() * 0.4);
    }));
    const dryGrass = bladeClump(rnd, { n: 6, h: 0.17, w: 0.02, bend: 0.5, spread: 0.09, a: 0x8a7538, b: 0xe0c473 });
    group.add(instance(dryGrass, bladeMat, 620, (d, i, c) => {
      const a = rnd() * Math.PI * 2;
      const r = 2.4 + Math.pow(rnd(), 0.6) * 40;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z > -1.1 && Math.abs(x) < 1.4 && r < 2.8) return false;
      const s = 0.55 + rnd() * 0.8 + smoothstep(8, 38, r) * 1.9;
      d.position.set(x, terrainH(x, z), z);
      d.rotation.y = rnd() * 6.28;
      d.scale.setScalar(s);
      c.setRGB(0.85 + rnd() * 0.4, 0.85 + rnd() * 0.3, 0.68 + rnd() * 0.35);
    }));

    const cl = this._clouds(def, { thetaStart: 0.32, thetaLen: 0.19 });
    group.add(cl);
    anim.push((t) => { cl.rotation.y = t * 0.0009; });
  }

  // ---- night: camp, moon, stars, fireflies --------------------------------
  _wNight({ def, group, anim }) {
    const rnd = makeRnd(777);
    this._ridges(group, [
      { radius: 178, height: 22, segs: 280, seed: 19, slope: 0.7, rJitter: 0.18, hMin: 0.3, sharp: 1.5, freq: 2.6,
        low: 0x080f1c, mid: 0x0d1729, high: 0x14213a, shade: 0.2 },
      { radius: 335, height: 80, segs: 260, seed: 47, slope: 0.95, rJitter: 0.15, hMin: 0.26, sharp: 1.5, freq: 1.05,
        low: 0x101a2e, mid: 0x18243c, high: 0x243456, shade: 0.14 },
    ]);

    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    const bladeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    const pine = conifer(rnd, { h: 8, r: 1.25, tiers: 5, a: 0x0a1a18, b: 0x18302a });
    group.add(instance(pine, leafMat, 200, (d, i, c) => {
      const a = rnd() * Math.PI * 2;
      const r = 32 + Math.pow(rnd(), 0.7) * 105;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const s = 0.3 + rnd() * 0.22 + smoothstep(38, 120, r) * 0.85;
      d.position.set(x, terrainH(x, z) - 0.15, z);
      d.rotation.y = rnd() * 6.28;
      d.scale.set(s, s * (0.85 + rnd() * 0.5), s);
      c.setRGB(0.8 + rnd() * 0.4, 0.85 + rnd() * 0.3, 0.9 + rnd() * 0.3);
    }));
    const tuft = bladeClump(rnd, { n: 6, h: 0.15, w: 0.02, bend: 0.45, spread: 0.09, a: 0x21301f, b: 0x44532e });
    group.add(instance(tuft, bladeMat, 700, (d, i, c) => {
      const a = rnd() * Math.PI * 2;
      const r = 2.2 + Math.pow(rnd(), 0.6) * 30;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z > -1.1 && Math.abs(x) < 1.4 && r < 2.8) return false;
      d.position.set(x, terrainH(x, z), z);
      d.rotation.y = rnd() * 6.28;
      d.scale.setScalar(0.6 + rnd() * 0.9 + smoothstep(8, 30, r) * 1.8);
      c.setRGB(0.8 + rnd() * 0.4, 0.85 + rnd() * 0.35, 0.8 + rnd() * 0.35);
    }));

    // ---- starfield with a denser milky-way band
    {
      // The lens only shows ~7° of sky, so stars are biased hard toward the
      // horizon band; a uniform hemisphere puts almost all of them off-frame.
      const N = 3200;
      const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), sz = new Float32Array(N);
      const axis = new THREE.Vector3(0.45, 0.62, -0.64).normalize();
      const e1 = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 1, 0)).normalize();
      const e2 = new THREE.Vector3().crossVectors(axis, e1).normalize();
      const c = new THREE.Color();
      for (let i = 0; i < N; i++) {
        let v;
        if (i % 5 < 2) {
          const t = rnd() * Math.PI * 2;
          v = e1.clone().multiplyScalar(Math.cos(t)).add(e2.clone().multiplyScalar(Math.sin(t)));
          v.add(axis.clone().multiplyScalar((rnd() - 0.5) * 0.26)).normalize();
        } else {
          const el = Math.pow(rnd(), 2.6) * (Math.PI / 2);
          const az = rnd() * Math.PI * 2;
          v = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
        }
        if (v.y < 0.004) v.y = 0.004 + rnd() * 0.02;
        v.normalize().multiplyScalar(450);
        pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
        const warm = rnd() < 0.2;
        c.setRGB(warm ? 1.0 : 0.72 + rnd() * 0.3, 0.8 + rnd() * 0.25, warm ? 0.72 : 0.95 + rnd() * 0.2);
        const b = 0.75 + Math.pow(rnd(), 2.6) * 3.4;
        col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
        sz[i] = 1.5 + Math.pow(rnd(), 2.6) * 4.8;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
      const stars = new THREE.Points(g, new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uPR: { value: Math.min(window.devicePixelRatio || 1, 2) } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, vertexColors: true,
        vertexShader: /* glsl */ `
          attribute float aSize;
          varying vec3 vC; varying float vTw;
          uniform float uTime, uPR;
          void main() {
            vC = color;
            vTw = 0.72 + 0.28 * sin( uTime * 1.7 + position.x * 0.7 + position.z * 0.3 );
            gl_PointSize = aSize * uPR;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vC; varying float vTw;
          void main() {
            float d = length( gl_PointCoord - 0.5 );
            float a = smoothstep( 0.5, 0.06, d );
            gl_FragColor = vec4( vC * vTw * a, a );
          }`,
      }));
      stars.renderOrder = -950;
      stars.frustumCulled = false;
      group.add(stars);
      anim.push((t) => { stars.material.uniforms.uTime.value = t; });
    }

    // ---- moon + halo, low enough to sit inside the long lens' sky band
    {
      const d = new THREE.Vector3(...def.sun.dir);
      const az = Math.atan2(d.z, d.x);
      const el = THREE.MathUtils.degToRad(5.2);
      const p = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).multiplyScalar(420);
      // Meshes, not Sprites: main.js's GTAO prepass turns a large Sprite into a
      // flat occluder and stamps a black quad across the sky behind it.
      const card = (geo, mat, order) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(p);
        m.lookAt(0, 1, 0);
        m.renderOrder = order;
        group.add(m);
      };
      card(new THREE.PlaneGeometry(150, 150), new THREE.MeshBasicMaterial({
        map: this.tex.glow, color: new THREE.Color(0x88b0ee).multiplyScalar(0.42),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }), -930);
      // over the bloom threshold, so the pass draws the halo for us
      card(new THREE.CircleGeometry(6.4, 48), new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xf6f9ff).multiplyScalar(3.2), depthWrite: false, fog: false,
      }), -928);
    }

    // ---- tent
    {
      const tent = new THREE.Group();
      const fab = new THREE.MeshStandardMaterial({ color: 0x2e5148, roughness: 0.85, flatShading: true, side: THREE.DoubleSide });
      const L = 2.6, W = 2.0, H = 1.35;
      const v = [];
      const push = (...p) => v.push(...p);
      push(-L / 2, 0, -W / 2, L / 2, 0, -W / 2, L / 2, H, 0);
      push(-L / 2, 0, -W / 2, L / 2, H, 0, -L / 2, H, 0);
      push(-L / 2, 0, W / 2, -L / 2, H, 0, L / 2, H, 0);
      push(-L / 2, 0, W / 2, L / 2, H, 0, L / 2, 0, W / 2);
      push(L / 2, 0, -W / 2, L / 2, 0, W / 2, L / 2, H, 0);
      push(-L / 2, 0, W / 2, -L / 2, 0, -W / 2, -L / 2, H, 0);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.computeVertexNormals();
      tent.add(new THREE.Mesh(g, fab));
      const stakeMat = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 1 });
      for (const sx of [-1, 1]) {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 4), stakeMat);
        s.position.set(sx * (L / 2 + 0.5), 0.45, 0);
        s.rotation.z = sx * 0.5;
        tent.add(s);
      }
      tent.position.set(7.6, terrainH(7.6, -6.4), -6.4);
      tent.rotation.y = -0.95;
      group.add(tent);
    }

    // ---- campfire: stone ring, logs, flame cones, ember glow
    {
      const fire = new THREE.Group();
      const fx = -2.7, fz = -2.4;
      fire.position.set(fx, terrainH(fx, fz), fz);
      const logMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 1, flatShading: true });
      const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5b544c, roughness: 1, flatShading: true });
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12 + rnd() * 0.06, 0), stoneMat);
        s.position.set(Math.cos(a) * 0.52, 0.05, Math.sin(a) * 0.52);
        s.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
        s.scale.y = 0.7;
        fire.add(s);
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.85, 6), logMat);
        log.position.set(Math.cos(a) * 0.14, 0.12, Math.sin(a) * 0.14);
        log.rotation.set(Math.PI / 2 - 0.55, a, 0, 'YXZ');
        fire.add(log);
      }
      const flames = [];
      const flameCols = [0xff5a10, 0xff9a20, 0xffd868];
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(
          new THREE.ConeGeometry(0.19 - i * 0.045, 0.62 - i * 0.13, 7, 1),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(flameCols[i]).multiplyScalar(1.5 + i * 0.7),
            transparent: true, opacity: 0.8 - i * 0.12,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
          })
        );
        m.position.y = 0.22 + i * 0.05;
        fire.add(m);
        flames.push(m);
      }
      // firelight spilling onto the ground, as a flat disc rather than a
      // billboard — a big Sprite here breaks main.js's GTAO prepass
      const emb = new THREE.Mesh(
        new THREE.CircleGeometry(1.9, 40),
        new THREE.MeshBasicMaterial({
          map: this.tex.glow, color: new THREE.Color(0xff7418).multiplyScalar(0.85),
          transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        })
      );
      emb.rotation.x = -Math.PI / 2;
      emb.position.y = 0.02;
      emb.renderOrder = 3;
      fire.add(emb);
      group.add(fire);

      const camp = this.camp;
      camp.position.set(fx, terrainH(fx, fz) + 0.5, fz);
      anim.push((t) => {
        const f = 0.78 + 0.22 * Math.sin(t * 9.3) + 0.14 * Math.sin(t * 21.7 + 1.1) + 0.08 * Math.sin(t * 3.1);
        camp.intensity = 17 * f;
        emb.scale.setScalar(0.9 + 0.16 * f);
        for (let i = 0; i < flames.length; i++) {
          const p = t * (7 + i * 2.6) + i * 2;
          flames[i].scale.set(0.85 + 0.25 * Math.sin(p), 0.8 + 0.35 * Math.sin(p * 1.37 + 0.5), 0.85 + 0.25 * Math.cos(p * 0.9));
          flames[i].rotation.z = 0.09 * Math.sin(p * 0.7);
          flames[i].position.x = 0.03 * Math.sin(p * 0.6);
        }
      });
    }

    // ---- fireflies
    {
      const N = 110;
      const pos = new Float32Array(N * 3), ph = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const a = rnd() * Math.PI * 2;
        const r = 3 + Math.pow(rnd(), 0.6) * 15;
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = 0.2 + rnd() * 1.6;
        pos[i * 3 + 2] = Math.sin(a) * r;
        ph[i * 3] = rnd() * 6.28;
        ph[i * 3 + 1] = rnd() * 6.28;
        ph[i * 3 + 2] = 0.5 + rnd() * 1.1;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aPh', new THREE.BufferAttribute(ph, 3));
      const flies = new THREE.Points(g, new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uPR: { value: Math.min(window.devicePixelRatio || 1, 2) } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        vertexShader: /* glsl */ `
          attribute vec3 aPh;
          uniform float uTime, uPR;
          varying float vA;
          void main() {
            vec3 p = position;
            p.x += sin( uTime * 0.35 * aPh.z + aPh.x ) * 1.1;
            p.z += cos( uTime * 0.29 * aPh.z + aPh.y ) * 1.1;
            p.y += sin( uTime * 0.62 + aPh.x ) * 0.28;
            vA = smoothstep( 0.1, 0.95, sin( uTime * 1.9 * aPh.z + aPh.y * 3.0 ) );
            vec4 mv = modelViewMatrix * vec4( p, 1.0 );
            gl_PointSize = ( 80.0 * uPR ) / max( -mv.z, 0.6 );
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main() {
            float d = length( gl_PointCoord - 0.5 );
            float a = smoothstep( 0.5, 0.0, d );
            gl_FragColor = vec4( vec3( 2.6, 1.9, 0.55 ) * a * vA, a * vA );
          }`,
      }));
      flies.frustumCulled = false;
      group.add(flies);
      anim.push((t) => { flies.material.uniforms.uTime.value = t; });
    }

    const cl = this._clouds(def, { thetaStart: 0.34, thetaLen: 0.17 });
    group.add(cl);
    anim.push((t) => { cl.rotation.y = t * 0.0006; });
  }

  // ------------------------------------------------------------------ api

  async load(name) {
    if (this.cache[name]) return this.cache[name];
    const tex = await this.loader.loadAsync(DEFS[name].hdr);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const env = this.pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
    this.cache[name] = { env };
    return this.cache[name];
  }

  async set(name) {
    name = DEFS[name] ? name : 'mountain';
    const def = DEFS[name];
    this.current = name;
    const token = ++this.loadToken;

    // STUDIO MODE (default): worlds hidden for speed — clean tinted backdrop,
    // HDRI still lights the bike. Re-enable the 3D worlds with ?world=1.
    this.studio = !new URLSearchParams(location.search).has('world');
    const STUDIO_TINT = { mountain: 0xb9bec6, lake: 0xb2bfba, forest: 0xaab5a5, desert: 0xccbaa2, night: 0x22252b };

    const s = this.scene;
    if (this.studio) {
      for (const k of Object.keys(this.worlds)) if (this.worlds[k]) this.worlds[k].group.visible = false;
      if (this.sky) this.sky.visible = false;
      s.background = new THREE.Color(STUDIO_TINT[name] ?? 0xb9bec6);
      s.fog = new THREE.FogExp2(new THREE.Color(STUDIO_TINT[name] ?? 0xb9bec6).multiplyScalar(0.97).getHex(), 0.012);
    } else {
      if (this.sky) this.sky.visible = true;
      const world = this._world(name);
      for (const k of Object.keys(this.worlds)) this.worlds[k].group.visible = k === name;
      this.active = world;
      s.background = null;
      s.fog = new THREE.FogExp2(def.fog, def.fogD);
    }
    this.renderer.toneMappingExposure = def.exposure;

    this.sun.position.set(...def.sun.dir);
    this.sun.color.set(def.sun.color);
    this.sun.intensity = def.sun.intensity;
    this.hemi.intensity = def.hemi;
    this.hemi.color.set(def.hemiSky);
    this.hemi.groundColor.set(def.hemiGround);

    const sk = def.sky, u = this.skyU, g = sk.gain;
    u.cTop.value.set(sk.top).multiplyScalar(g);
    u.cMid.value.set(sk.mid).multiplyScalar(g);
    u.cHor.value.set(sk.hor).multiplyScalar(g);
    u.cGnd.value.set(sk.gnd).multiplyScalar(g);
    u.cHaze.value.set(sk.haze).multiplyScalar(g);
    u.cSun.value.set(sk.sun).multiplyScalar(g);
    u.sunAmt.value = sk.sunAmt;
    u.sunSharp.value = sk.sunSharp;
    u.hazeAmt.value = sk.hazeAmt;
    // pin the sky's sun below the light rig so its glow lands in the visible band
    u.sunDir.value.set(def.sun.dir[0], def.sun.dir[1] * 0.28, def.sun.dir[2]).normalize();

    this.groundMat.color.set(def.ground);
    this.rockMat.color.set(def.ground).multiplyScalar(0.85);
    const isLake = name === 'lake';
    this.ground.visible = !isLake;
    this.shoreDisc.visible = isLake;
    let n = 0;
    while (n < this.rockR.length && this.rockR[n] < def.rockR) n++;
    this.rocks.count = this.studio ? 0 : (n);
    this.camp.visible = !!def.camp && !this.studio;

    const { env } = await this.load(name);
    if (token !== this.loadToken) return; // a newer switch superseded this one
    s.environment = env;
    s.environmentIntensity = def.envIntensity;
  }

  tick(t) {
    this.time = t;
    if (!this.active) return;
    for (const fn of this.active.anim) fn(t);
  }
}
