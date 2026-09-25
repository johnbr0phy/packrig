/**
 * A bag's inside, measured off the bag's own mesh.
 *
 * The solver needs to know how much room there is at every point along the
 * bag, so a tapered seat pack's tail really is smaller than its shoulder and a
 * frame bag really is a triangle. Rather than restate thirteen builders'
 * geometry here (and drift from it the first time one is fixed), this reads
 * the body the builder actually drew: slice it along its long axis and take
 * the inside extents of each slice, inset by the fabric.
 *
 * Result, in the bag group's LOCAL space (the space its children live in):
 *   { o, U, V, W,            origin + unit axes; V is the axis most aligned
 *                            with world up, W the other short one
 *     u0, u1, mount,         see solver.js
 *     stations: [{u0,u1,v0,v1,w0,w1}],
 *     litres }
 * `toLocal(u, v, w)` maps a solver point back to bag-local mm.
 */
import * as THREE from 'three';

const N_STATIONS = 14;
const FABRIC_MM = 2.5;     // shell + lining the contents never reach
const INSET = 0.03;        // stuffed corners are rounder than the shell

/**
 * Where on the long axis the load is held, per slot family.
 *   origin — the mount is where the builder put the anchor (seat pack post,
 *            top tube stem end, down tube)
 *   centre — load the middle, soft things out to the ends (bar roll, frame bag,
 *            trunk)
 *   low    — for bags that stand upright, the bottom (fork cage, stem, pannier):
 *            heavy low is the rule that matters most there
 */
const MOUNT_MODE = {
  seatpack: 'origin', saddlebag: 'origin', toptube: 'origin', toptube_rear: 'origin', downtube: 'origin',
  barroll: 'centre', barbag: 'centre', barpocket: 'centre', randobag: 'centre',
  framebag_full: 'centre', framebag_half: 'centre', trunk: 'centre',
  forkL: 'low', forkR: 'low', stemL: 'low', stemR: 'low', pannierL: 'low', pannierR: 'low',
};

const _v = new THREE.Vector3();

export function measureCavity(bag, slot, litres) {
  bag.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(bag.matrixWorld).invert();
  const pts = [];
  bag.traverse((o) => {
    if (!o.isMesh || o.userData.noCollide || o.userData.packItem || o.userData.notBody) return;
    const pos = o.geometry?.attributes?.position;
    if (!pos) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const stride = Math.max(1, Math.floor(pos.count / 1500));
    for (let i = 0; i < pos.count; i += stride) pts.push(_v.fromBufferAttribute(pos, i).applyMatrix4(m).clone());
  });
  if (pts.length < 8) return null;
  const bb = new THREE.Box3().setFromPoints(pts);
  const size = bb.getSize(new THREE.Vector3());

  // world up, expressed in the bag's local frame
  const q = new THREE.Quaternion();
  bag.getWorldQuaternion(q);
  const upL = new THREE.Vector3(0, 1, 0).applyQuaternion(q.invert()).normalize();
  const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const ext = [size.x, size.y, size.z];
  const order = [0, 1, 2].sort((a, b) => ext[b] - ext[a]);
  const U = axes[order[0]].clone();
  const rest = order.slice(1);
  rest.sort((a, b) => Math.abs(axes[b].dot(upL)) - Math.abs(axes[a].dot(upL)));
  const V = axes[rest[0]].clone();
  if (V.dot(upL) < 0) V.negate();
  let W = axes[rest[1]].clone();
  // right-handed U×V = W keeps item orientation from mirroring
  if (new THREE.Vector3().crossVectors(U, V).dot(W) < 0) W.negate();
  // for an upright bag, run U upward too, so "low" means low
  if (Math.abs(U.dot(upL)) > 0.7 && U.dot(upL) < 0) { U.negate(); W.negate(); }

  const o = new THREE.Vector3(0, 0, 0);
  const proj = pts.map((p) => [p.dot(U), p.dot(V), p.dot(W)]);
  let uMin = Infinity, uMax = -Infinity;
  for (const [u] of proj) { uMin = Math.min(uMin, u); uMax = Math.max(uMax, u); }
  const span = uMax - uMin;
  const stations = [];
  for (let i = 0; i < N_STATIONS; i++) {
    const a = uMin + (span * i) / N_STATIONS, b = uMin + (span * (i + 1)) / N_STATIONS;
    let v0 = Infinity, v1 = -Infinity, w0 = Infinity, w1 = -Infinity, n = 0;
    for (const [u, v, w] of proj) {
      if (u < a - span * 0.02 || u > b + span * 0.02) continue;
      n++;
      v0 = Math.min(v0, v); v1 = Math.max(v1, v); w0 = Math.min(w0, w); w1 = Math.max(w1, w);
    }
    stations.push(n ? { u0: a, u1: b, v0, v1, w0, w1 } : null);
  }
  // fill gaps from neighbours, then inset
  for (let i = 0; i < stations.length; i++) {
    if (stations[i]) continue;
    const prev = stations.slice(0, i).reverse().find(Boolean);
    const next = stations.slice(i + 1).find(Boolean);
    const s = prev || next;
    const a = uMin + (span * i) / N_STATIONS;
    stations[i] = { ...s, u0: a, u1: a + span / N_STATIONS };
  }
  const inset = (lo, hi) => {
    const d = (hi - lo) * INSET + FABRIC_MM;
    return hi - lo > 2 * d + 4 ? [lo + d, hi - d] : [(lo + hi) / 2 - 2, (lo + hi) / 2 + 2];
  };
  for (const s of stations) {
    [s.v0, s.v1] = inset(s.v0, s.v1);
    [s.w0, s.w1] = inset(s.w0, s.w1);
  }
  // the end slices are the rolled closure / the nose hardware — keep out
  const u0 = uMin + FABRIC_MM, u1 = uMax - FABRIC_MM;
  stations[0].u0 = u0;
  stations[stations.length - 1].u1 = u1;

  const mode = MOUNT_MODE[slot] || 'centre';
  let mount;
  if (mode === 'origin') mount = Math.min(Math.max(o.dot(U), u0), u1);
  else if (mode === 'low') mount = u0;
  else mount = (u0 + u1) / 2;
  // an origin that sits in the middle third of the bag is not an end
  if (mode === 'origin' && mount - u0 > (u1 - u0) * 0.33 && u1 - mount > (u1 - u0) * 0.33) {
    mount = mount - u0 < u1 - mount ? u0 : u1;
  }
  return {
    o, U, V, W, u0, u1, mount, stations, litres,
    toLocal(u, v, w) {
      return new THREE.Vector3().addScaledVector(U, u).addScaledVector(V, v).addScaledVector(W, w).add(o);
    },
  };
}
