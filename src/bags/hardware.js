// Hardware and trim helpers: compression straps, webbing runs, roll-top
// closures, tube-wrap straps, frame straps and seam primitives.

import * as THREE from 'three';
import { v3, deg, tubeAlong } from '../lib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { seamMat, webbing } from './materials.js';

// ---- hardware / trim helpers --------------------------------------------

/**
 * A compression strap that actually hugs the bag: a flattened torus sized to
 * the local radius, a ladderlock where it closes, and a loose tail beyond it.
 * Built in the XY plane (ring axis = +z); callers rotate the returned group.
 */
export function strapAssembly(wm, hwm, { r, width = 20, ellipse = 1, angle = -Math.PI / 2, tail = true }) {
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
export function webbingRun(grp, wm, hwm, { from, to, width = 22, normal = 'z', proud = 0.8, buckleAt = 0.62 }) {
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
export function rollTop(mat, hwm, { r, depth = 7, rings = 3, buckle = true, widthScale = 1, back = true }) {
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
export function taperAndFlatten(geo, { len, shoulder, tailWid = 0.4, squash = 0.26 }) {
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
export const widAt = (t, tailWid = 0.4) => 1 + (tailWid - 1) * Math.min(Math.max(t, 0), 1) ** 0.85;

/**
 * Webbing that wraps a bike tube and comes back — used where a strap has to
 * visibly terminate ON something (saddle rail, bar) instead of in mid-air.
 */
export function wrapStrap(wm, hwm, { from, to, tubeR, width = 14, thick = 3 }) {
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
export const TUBE_R = { topTube: 16, downTube: 23, seatTube: 17 };

/**
 * The hook-and-loop / Hypalon straps that hold a frame bag into the triangle.
 * Every real frame bag is covered in them and we drew none, which is most of why
 * ours read as a decal floating in the triangle. `edge` is a [from,to] pair in
 * bag-local mm along the tube; straps are spaced along it.
 */
export function frameStraps(grp, wm, hwm, { edge, count, tubeR, depth, normal = v3(0, 1, 0) }) {
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
export function seamCurve(mat, points, r = 1.2) {
  const m = tubeAlong(points, r, seamMat(mat), { segments: Math.max(24, points.length * 4), radialSegments: 6 });
  m.userData.noCollide = true;
  return m;
}

export function seamRing(mat, r, tube = 1.15) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 5, 48), seamMat(mat));
  m.userData.noCollide = true;
  return m;
}

export function seamStrip(mat, w, h, d = 1.6) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), seamMat(mat));
  m.userData.noCollide = true;
  return m;
}
