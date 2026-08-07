// Feature geometry: zips, drawcords, lids, pockets, bungees, daisy chains,
// reflective trim — the parts a builder bolts onto a body, plus the shared
// pocket pass.

import * as THREE from 'three';
import { v3, deg, tubeBetween, tubeAlong } from '../lib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { texCache, webbing } from './materials.js';

// ---- feature geometry ----------------------------------------------------

export const meshPanelMat = () => new THREE.MeshPhysicalMaterial({
  color: 0x141414, roughness: 0.86, metalness: 0, transparent: true, opacity: 0.85,
  bumpMap: texCache.xpac || null, bumpScale: 1.4, envMapIntensity: 0.2,
});

export const reflectiveMat = () => new THREE.MeshStandardMaterial({
  color: 0xd8dade, roughness: 0.45, metalness: 0.1,
  emissive: 0xbfc4c9, emissiveIntensity: 0.08,
});

export const cordMat = () => new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.7 });

/** Zip track: tape, a brighter tooth chain, slider and pull tab. */
export function zipperRun(a, b, hwm, { tape = 2.0, accentMat = null } = {}) {
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
export function drawcordEnd(mat, hwm, { r, depth = 11, pleats = 0 }) {
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
export function flapLid(accent, wm, hwm, { w, d, drop = 46 }) {
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
export function harnessCradle(wm, { r, len }) {
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
export function orientArc(obj, axisDir, aimDir) {
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
export function pocketArc(mat, hwm, { R, arc = deg(76), len = 110, proud = 5, mesh = false, stretch = false }) {
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
export function flapArc(accent, wm, hwm, { R, len, arc = deg(170) }) {
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
export function bungeeArc(hwm, { R, arc = deg(80), len = 140, n = 4 }) {
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
export function reflectiveArc({ R, arc = deg(60), width = 8 }) {
  const prof = [new THREE.Vector2(R + 1.4, -width / 2), new THREE.Vector2(R + 1.4, width / 2)];
  const m = new THREE.Mesh(new THREE.LatheGeometry(prof, 24, -arc / 2, arc), reflectiveMat());
  m.userData.noCollide = true;
  return m;
}

/** Applied pocket: proud rounded block with its own zip, or a mesh panel. */
export function pocketBlock(mat, hwm, { w, h, proud = 5, mesh = false, stretch = false }) {
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
export function daisyChain(wm, { len, rows = 2, band = 17 }) {
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
export function bungeeLattice(hwm, { w, h, n = 4 }) {
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

export function valveDisc(hwm) {
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

export function reflectiveStrip(w, h) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.6), reflectiveMat());
  m.userData.noCollide = true;
  return m;
}

/**
 * Shared pocket pass. `faces` maps a face name to a placement callback that
 * knows how big a pocket that surface can carry and how to orient it, so each
 * builder keeps control of where its own surfaces actually are.
 */
export function addPockets(grp, feats, mat, hwm, faces) {
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
