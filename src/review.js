// Review mode: the app embedded in the eval harness as a live, spinnable model
// rather than a set of stills.
//
// Loaded only when `?review=1` is present, so nothing here costs a normal visit
// anything. The harness page owns the chrome — product photo, record, scores —
// and drives this frame over postMessage. Swapping the bag in place matters:
// reloading the iframe per product means re-parsing the catalogue and re-lighting
// an HDRI for every one of 70 bags, which is the difference between stepping
// through a set and waiting for it.
//
// Protocol, all messages `{ src: 'packrig-review', cmd, ... }`:
//   → load  { slot, bi, pi }   equip that product, alone on the bike
//   → bike  { on }             show or hide the bicycle, keeping the bag
//   → cam   { name }           side | tq | rear | front | hero
//   → frame {}                 refit the camera to whatever is visible
//   → spin  { on }             turntable
// and back: `{ src: 'packrig-review', evt: 'ready' | 'loaded', ... }`.

import * as THREE from 'three';

export function initReview(app, { SLOTS, applyCam } = {}) {
  const { bike, camera, controls, scene } = app;

  const post = (evt, extra = {}) => {
    try { window.parent?.postMessage({ src: 'packrig-review', evt, ...extra }, '*'); } catch { /* not framed */ }
  };

  /** Every mesh belonging to a currently-equipped bag. */
  function bagMeshes() {
    const set = new Set();
    for (const k of Object.keys(app.bags.equipped)) {
      app.bags.equipped[k]?.mesh?.traverse((o) => set.add(o));
    }
    return set;
  }

  // The bags hang off the bike's own anchors, so `bike.group.visible = false`
  // takes the bag with it. Hide the bicycle's meshes individually instead, and
  // remember what each one's visibility WAS — racks and mounts are already
  // hidden and must stay that way when the bike comes back.
  let bikeOn = true;
  function setBikeVisible(on) {
    bikeOn = on;
    const bags = bagMeshes();
    bike.group.traverse((o) => {
      if (!o.isMesh || bags.has(o)) return;
      if (o.userData.__reviewVis === undefined) o.userData.__reviewVis = o.visible;
      o.visible = on ? o.userData.__reviewVis : false;
    });
    // The contact shadow lives on the scene, not the bike, and a bag floating
    // over the ground shadow of an absent bicycle looks like a bug.
    scene.traverse((o) => {
      if (!o.isMesh || o.geometry?.type !== 'PlaneGeometry') return;
      if (o.userData.__reviewVis === undefined) o.userData.__reviewVis = o.visible;
      o.visible = on ? o.userData.__reviewVis : false;
    });
  }

  const _box = new THREE.Box3();
  function frameObject(obj, pad = 1.35) {
    _box.setFromObject(obj);
    if (_box.isEmpty()) return;
    const c = _box.getCenter(new THREE.Vector3());
    const s = _box.getSize(new THREE.Vector3());
    const radius = Math.max(Math.max(s.x, s.y, s.z) * 0.5, 0.02);
    // Fit the box's own extents against both field angles, not its bounding
    // sphere against the vertical one: a seat pack is five times longer than it
    // is tall, and sphere-fitting a wide pane pushes the camera back until the
    // bag is a thumbnail in the middle of a lot of sky.
    const fov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(fov / 2) * camera.aspect);
    const dv = (s.y * 0.5) / Math.tan(fov / 2);
    const dh = (Math.max(s.x, s.z) * 0.5) / Math.tan(hfov / 2);
    const dist = Math.max(dv, dh) * pad + radius * 0.6;
    camera.position.copy(c).addScaledVector(new THREE.Vector3(0.62, 0.30, 1).normalize(), dist);
    camera.near = Math.max(0.01, dist - radius * 6);
    camera.far = dist + radius * 40;
    camera.setViewOffset === undefined || camera.clearViewOffset();  // no kit-panel shift here
    camera.updateProjectionMatrix();
    controls.target.copy(c);
    controls.minDistance = radius * 0.5;
    controls.maxDistance = dist * 5;
    controls.update();
  }

  /**
   * Always frame the BAG. With the bicycle on, pull back far enough that the
   * surrounding frame reads as context — the question being asked is "does it
   * hang like the real one", which needs the seatpost and the tyre in shot.
   * Framing the whole bicycle instead makes the bag 60 px tall and useless.
   */
  function frame() {
    const bag = current && app.bags.equipped[current.slot]?.mesh;
    if (!bag) { frameObject(bike.group, 1.15); return; }
    frameObject(bag, bikeOn ? 2.15 : 1.25);
  }

  let current = null;
  function load({ slot, bi, pi }) {
    const brand = app.catalog?.[+bi];
    const product = brand?.products?.[+pi];
    if (!brand || !product) { post('loaded', { ok: false, why: 'no such product' }); return; }
    app.bags.clearAll();
    // Catalogue slot names are not the UI slot names the system equips by —
    // mapping `pannier` alone once made every fork and stem bag read as dropped.
    const uiSlot = slot;
    app.bags.equip(uiSlot, brand, product, 0);
    current = { slot: uiSlot, bi: +bi, pi: +pi };
    setBikeVisible(bikeOn);          // the new meshes have never been touched
    frame();
    const rec = app.bags.equipped[uiSlot];
    post('loaded', {
      ok: !!rec,
      dropped: !rec,
      slot: uiSlot,
      name: [brand.name, product.line, product.name, product.size].filter(Boolean).join(' '),
    });
  }

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || m.src !== 'packrig-review' || !m.cmd) return;
    switch (m.cmd) {
      case 'load':  load(m); break;
      case 'bike':  setBikeVisible(!!m.on); frame(); break;
      case 'cam':   applyCam?.(m.name); break;
      case 'frame': frame(); break;
      case 'spin':  controls.autoRotate = !!m.on; break;
      default: break;
    }
  });

  // Orbiting is the whole point of this mode, so the damping stays on and the
  // clamps come off the defaults tuned for a whole bicycle.
  controls.enableDamping = true;
  controls.minDistance = 0.05;
  controls.maxDistance = 12;

  post('ready');
  return { load, setBikeVisible, frame, get current() { return current; } };
}
