import * as THREE from 'three';

// mm → scene meters
export const mm = (v) => v * 0.001;
export const deg = (v) => (v * Math.PI) / 180;

const _up = new THREE.Vector3(0, 1, 0);

/** Cylinder (optionally tapered) whose axis runs from a to b. */
export function tubeBetween(a, b, r1, r2 = r1, material, radialSegments = 24) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r2, r1, len, radialSegments, 1, false);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(_up, dir.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Capsule between two points (round-capped tube). */
export function capsuleBetween(a, b, r, material, capSegments = 6, radialSegments = 20) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CapsuleGeometry(r, len, capSegments, radialSegments);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(_up, dir.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Tube along a curve. */
export function tubeAlong(points, r, material, { closed = false, segments = 64, radialSegments = 16 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.5);
  const geo = new THREE.TubeGeometry(curve, segments, r, radialSegments, closed);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function v3(x, y, z = 0) {
  return new THREE.Vector3(x, y, z);
}

/** Canvas texture with text — used for brand patches / labels. */
export function labelTexture(text, { bg = '#111111', fg = '#f5f2ea', w = 256, h = 128, font = 'bold 44px "Helvetica Neue", Arial, sans-serif', radius = 18, stroke = 'rgba(255,255,255,0.25)' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, radius);
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // shrink to fit
  let size = parseInt(font.match(/(\d+)px/)[1], 10);
  while (ctx.measureText(text).width > w * 0.84 && size > 10) {
    size -= 2;
    ctx.font = font.replace(/\d+px/, `${size}px`);
  }
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Subtle woven-fabric bump/roughness texture, optionally with X-Pac diagonal grid. */
export function fabricTexture({ xpac = false, scale = 6, color = null } = {}) {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, s, s);
  // woven noise
  const img = ctx.getImageData(0, 0, s, s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      const weave = ((x % 4 < 2) !== (y % 4 < 2)) ? 8 : -8;
      const n = (Math.random() - 0.5) * 14 + weave;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 128 + n;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (xpac) {
    ctx.strokeStyle = 'rgba(230,230,230,0.5)';
    ctx.lineWidth = 2;
    const step = s / 4;
    for (let d = -s; d < s * 2; d += step) {
      ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + s, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(d + s, 0); ctx.lineTo(d, s); ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(scale, scale);
  return tex;
}

export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        for (const k of ['map', 'normalMap', 'roughnessMap', 'bumpMap']) if (m[k]) m[k].dispose();
        m.dispose();
      });
    }
  });
}
