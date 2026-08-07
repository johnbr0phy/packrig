// Fabric materials and the shared texture cache. Owns every piece of
// module-level mutable material state: texCache, vcVariants, seamVariants.
// Also the "make a stuffed, occluded panel" convenience (soft) and brand patch.

import * as THREE from 'three';
import { labelTexture, fabricTexture } from '../lib.js';
import { shadeAO, stuffed } from './deform.js';

// ---- fabric materials ----------------------------------------------------
export const texCache = {};
export function fabricMaterial(fabricKey, colorHex) {
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

export const webbing = () => new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.85 });
export const hardware = () => new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.5, metalness: 0.3 });

// Vertex-coloured twin of a fabric material, made once per bag.
const vcVariants = new WeakMap();
export function vcMat(mat) {
  let m = vcVariants.get(mat);
  if (!m) { m = mat.clone(); m.vertexColors = true; vcVariants.set(mat, m); }
  return m;
}

// Panel seams read as a slightly darker shade of the shell.
const seamVariants = new WeakMap();
export function seamMat(mat) {
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
export function soft(geo, mat, opts = {}) {
  const { amp = 3, freq = 0.03, seed = 1, flatAxis = null, bulge = null, aoDir = null, aoK = 0.82, aoSpan = 0.45 } = opts;
  stuffed(geo, { amp, freq, seed, flatAxis, bulge });
  if (aoDir) {
    shadeAO(geo, { dir: aoDir, k: aoK, span: aoSpan });
    return new THREE.Mesh(geo, vcMat(mat));
  }
  return new THREE.Mesh(geo, mat);
}

export function shadowify(root) {
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}

export function patch(grp, brand, x, y, z, w = 84, ry = 0) {
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
