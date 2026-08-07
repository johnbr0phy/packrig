// Collision resolution data and proxy geometry: per-slot priority/escape table
// plus the coarse AABB-grid proxy used to detect clashes.

import * as THREE from 'three';

// ---- collision resolution ------------------------------------------------
// Bags are placed by anchor, so a big pannier and a big seat pack can claim the
// same air. Everything is resolved in the bike's millimetre frame: high-priority
// bags are immovable, lower ones slide along a slot-specific escape vector,
// then shrink, then give up their spot entirely.

export const RESOLVE = {
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
export const STEP = 6;
export const TOL = 2.5; // mm of allowed touching before a clash counts

const _v = new THREE.Vector3();

/**
 * Coarse collision proxy: a grid of AABBs over the bag's two longest axes.
 * A single Box3 around a frame bag would swallow half the bike; a grid follows
 * the triangle closely enough that a downtube bag can still tuck underneath.
 */
export function proxyBoxes(grp, nA = 6, nB = 4) {
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

export function boxesOverlap(a, b) {
  for (const x of a) for (const y of b) if (x.intersectsBox(y)) return true;
  return false;
}
