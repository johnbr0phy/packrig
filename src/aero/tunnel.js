import * as THREE from 'three';
import { labelTexture, disposeObject } from '../lib.js';

// Amber accent from ui.css (--accent). Not importable as a JS value from CSS,
// so the hex is restated here to keep the tunnel's markings on-brand.
const ACCENT = 0xe8a848;

// The camera fly lands slightly before the rest of the dissolve (lighting,
// fog, fades, post) finishes — matches the brief: "~1.2s" for the camera,
// "~1.5s" for the orchestrated whole.
const CAM_DURATION = 1.2;
const FX_DURATION = 1.5;

const TUNNEL_BG = new THREE.Color(0x9aa0a6);
const TUNNEL_FOG_COLOR = new THREE.Color(0x9aa0a6);
const TUNNEL_FOG_DENSITY = 0.0015;
// kept low, not zero: the HDRI is still what's lighting the bike's paint and
// metal, but at full strength an outdoor (often warm/dusk) env map tints the
// backdrop — the opposite of "restrained, technical, expensive-looking"
const TUNNEL_ENV_INTENSITY = 0.12;
const TUNNEL_HEMI_INTENSITY = 0.24;  // small neutral fill so key/rim aren't the only light
const TUNNEL_HEMI_COLOR = new THREE.Color(0xd7dade);
const TUNNEL_GTAO_RADIUS = 0.06;   // clean bright space — heavy AO reads as dirt
const BLOOM_LIFT = 0.05;           // so the smoke picks up a glow
const KEY_INTENSITY = 3.6;
const RIM_INTENSITY = 4.6;         // strong — this is what makes smoke read as volume

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function collectMaterials(root) {
  const list = [];
  root.traverse((o) => {
    if (!o.material) return;
    const arr = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of arr) list.push(m);
  });
  return list;
}

// Records each material's own opacity as a baseline (so a material that's
// meant to sit at 0.5 opacity still fades proportionally) and flips it
// transparent so the fade can actually render. Also drops depthWrite —
// a "faded to invisible" mesh (the old terrain, with its noisy height field)
// still writes real depth by default, which corrupts GTAO's depth/normal
// read and shows up as blotchy ambient occlusion baked into the tunnel floor.
function snapshotFade(materials) {
  return materials.map((m) => {
    const rec = { m, opacity: m.opacity, wasTransparent: m.transparent, wasDepthWrite: m.depthWrite };
    m.transparent = true;
    m.depthWrite = false;
    return rec;
  });
}

function applyFadeAlpha(snap, alpha) {
  for (const s of snap) s.m.opacity = alpha * s.opacity;
}

function restoreFade(snap) {
  for (const s of snap) {
    s.m.opacity = s.opacity;
    s.m.transparent = s.wasTransparent;
    s.m.depthWrite = s.wasDepthWrite;
  }
}

// Re-arms an already-settled (opaque, depth-writing) fade for another pass —
// used on the tunnel's own set, which — unlike the old world — ends an
// `enter()` fully opaque and needs to become fadable again before `exit()`.
function makeFadable(snap) {
  for (const s of snap) { s.m.transparent = true; s.m.depthWrite = false; }
}

// Soft radial sheen for the backdrop — cool grey, darker at the edges, so a
// smoked-glass rider and white smoke both separate from it.
function backdropTexture() {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s * 0.32, s * 0.1, s / 2, s * 0.55, s * 0.82);
  g.addColorStop(0, '#c9cdd2');
  g.addColorStop(0.55, '#a3a8ae');
  g.addColorStop(1, '#6f747a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- the set

function buildFloor(floorLen, floorW) {
  const geo = new THREE.PlaneGeometry(floorLen, floorW, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xc7cbd0, roughness: 0.75, metalness: 0, envMapIntensity: 0.35,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * The floor-to-backdrop sweep: a quarter-circle arc (radius `coveR`) tangent
 * to the floor at `backX`, continuing as a flat vertical wall up to `wallH`.
 * Built as an explicit profile extruded across `width` rather than a
 * primitive, so the tangency (and therefore the seamless floor↔wall read)
 * is exact — see contract note on deriving geometry, never eyeballing it.
 */
function buildCove(width, coveR, wallH, backX) {
  const halfW = width / 2;
  const arcSegs = 16;
  const straightSegs = 6;
  const rows = [];
  for (let i = 0; i <= arcSegs; i++) {
    const a = (i / arcSegs) * (Math.PI / 2);
    rows.push({
      x: backX - coveR * Math.sin(a),
      y: coveR - coveR * Math.cos(a),
      nx: Math.sin(a), ny: Math.cos(a),
    });
  }
  const yArcTop = rows[rows.length - 1].y;
  for (let i = 1; i <= straightSegs; i++) {
    const t = i / straightSegs;
    rows.push({ x: backX - coveR, y: yArcTop + t * (wallH - yArcTop), nx: 1, ny: 0 });
  }

  const pos = [], nrm = [], uv = [];
  rows.forEach((r, i) => {
    const v = i / (rows.length - 1);
    pos.push(r.x, r.y, -halfW, r.x, r.y, halfW);
    nrm.push(r.nx, r.ny, 0, r.nx, r.ny, 0);
    uv.push(0, v, 1, v);
  });
  const idx = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const a0 = i * 2, a1 = i * 2 + 1, b0 = (i + 1) * 2, b1 = (i + 1) * 2 + 1;
    idx.push(a0, b0, a1, a1, b0, b1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);

  const mat = new THREE.MeshStandardMaterial({
    map: backdropTexture(), roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Centreline + yaw fan (±5/10/15/20°), radiating from the bike's own centre
 * toward the nose — the wind-facing end, where the sweep actually matters.
 * Every mesh is oriented via explicit quaternion composition (flatten, then
 * yaw about world Y) rather than Euler angles, since combining an X-tilt
 * with a Z-spin through `.rotation` is exactly the axis-order trap this
 * codebase keeps tripping on.
 */
function buildMarkings(pivot, floorLen, wb, maxFanReach) {
  const g = new THREE.Group();
  const y = 0.004;
  const qFlat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

  const lineW = wb * 0.016;
  const centerMat = new THREE.MeshBasicMaterial({ color: ACCENT, toneMapped: false, transparent: true });
  const cl = new THREE.Mesh(new THREE.PlaneGeometry(floorLen * 0.98, lineW), centerMat);
  cl.quaternion.copy(qFlat);
  cl.position.set(pivot.x, y, pivot.z);
  g.add(cl);

  // Near-white on a light floor all but disappeared under real lighting (see
  // report) — dark graphite reads as a painted line against the floor at any
  // exposure, the way the centreline's amber already did.
  //
  // `maxFanReach` is already the exact, margin-included distance the fan can
  // extend along +X before it projects below the bottom of frame (solved in
  // frameBike() from the camera's own basis vectors) — not `floorLen` (sized
  // to cover the whole frustum, including corners nowhere near the bike) and
  // not raw camera distance either, both of which put the fan's own labels
  // outside the frame before this was solved for directly instead of
  // guessed at — see report.
  const fanRadius = maxFanReach;
  const fanMat = new THREE.MeshBasicMaterial({ color: 0x2a2d31, toneMapped: false, transparent: true, opacity: 0.85 });
  for (const sign of [-1, 1]) {
    for (const degStep of [5, 10, 15, 20]) {
      const rad = THREE.MathUtils.degToRad(degStep) * sign;
      const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rad);
      const dir = new THREE.Vector3(1, 0, 0).applyQuaternion(qYaw);

      const line = new THREE.Mesh(new THREE.PlaneGeometry(fanRadius, lineW), fanMat.clone());
      line.quaternion.copy(qYaw).multiply(qFlat);
      line.position.copy(pivot).addScaledVector(dir, fanRadius / 2);
      line.position.y = y;
      g.add(line);

      const tex = labelTexture(`${degStep}°`, {
        bg: '#1a1c1f', fg: '#e8a848', w: 128, h: 72,
        font: 'bold 34px "Helvetica Neue", Arial, sans-serif', radius: 10,
      });
      const lw = wb * 0.2, lh = lw * (72 / 128);
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(lw, lh),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })
      );
      // sits inside the line's own span, not past its tip — the tip can run
      // off the edge of the visible floor depending on camera framing, and a
      // label that goes with it is a label nobody sees (see report)
      label.quaternion.copy(qFlat); // labels stay upright, unlike the line they mark
      label.position.copy(pivot).addScaledVector(dir, fanRadius * 0.78);
      label.position.y = y + 0.001;
      g.add(label);
    }
  }
  return g;
}

function buildSet(dims) {
  const group = new THREE.Group();
  const floor = buildFloor(dims.floorLen, dims.floorW);
  floor.position.set(dims.bikeCenter.x, 0, 0);
  group.add(floor);
  group.add(buildCove(dims.floorW * 1.04, dims.coveR, dims.wallH, dims.backX));
  group.add(buildMarkings(dims.bikeCenter, dims.floorLen, dims.wb, dims.maxFanReach));
  return group;
}

// ------------------------------------------------------------- the module

// eslint-disable-next-line no-unused-vars -- `meter` is part of the contracted
// signature; nothing here calls it today (see report: panel.js looks like the
// natural owner of measure() calls, not the enter/exit choreography).
// `passes` ({ gtao, bloom }) isn't in CONTRACT.md's createTunnel signature, but
// index.js's composition root already passes it through — see report.
export function createTunnel(app, { smoke, rider, meter, passes } = {}) {
  const { scene, camera, controls, bike, envs } = app;
  const gtao = passes?.gtao;
  const bloom = passes?.bloom;

  // wb/bikeCenter are still used for the markings' pivot and line-width scale
  // (those want to look like real-world tape width regardless of framing) —
  // everything about the set's actual FOOTPRINT now comes from frameBike().
  const P = bike.points;
  const wb = (P.frontAxle.x - P.rearAxle.x) * 0.001;
  const bikeCenter = new THREE.Vector3(((P.rearAxle.x + P.frontAxle.x) / 2) * 0.001, 0, 0);

  // The set starts empty and is (re)built by frameBike() on every enter() —
  // see the long comment there for why a size fixed at module-load time is
  // wrong regardless of how generous the multiplier is.
  let setGroup = new THREE.Group();
  scene.add(setGroup);
  let setFade = [];

  const key = new THREE.DirectionalLight(0xffffff, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.00035;
  key.shadow.normalBias = 0.01;
  key.visible = false;
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight(0xdfe8ff, 0);
  rim.visible = false;
  scene.add(rim, rim.target);

  /**
   * Fits a 3/4-front camera to the bike's CURRENT bounding box (frame, wheels,
   * whatever bags happen to be mounted — bag meshes are parented inside
   * bike.group, so Box3.setFromObject already sees them), repositions the
   * key/rim rig off the resulting camera, and — this is the part that was
   * missing — resizes the set itself from what the camera can actually see.
   *
   * The bug this replaced: the set was sized once from the bare bike's
   * wheelbase/height, but camera distance is a function of the CURRENT kit
   * (bags grow the box, which pushes the camera back, which widens the
   * frustum). A bare or lightly-loaded bike never showed it. A five-bag kit
   * pulled the camera out far enough that the frustum reached past the
   * floor/cove edges, and everything beyond them rendered as empty
   * background — a black slab, mis-diagnosed twice before landing here.
   * Fixed by solving the set's footprint from the frustum directly, at the
   * backdrop's depth, instead of from the bike.
   */
  function frameBike() {
    const box = new THREE.Box3().setFromObject(bike.group);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const CAM_MARGIN = 1.45; // comfortable headroom, not a tight crop — see report
    const distForHeight = (size.y / 2) / Math.tan(vFov / 2);
    const distForWidth = (size.x / 2) / Math.tan(hFov / 2);
    const camDist = Math.max(distForHeight, distForWidth) * CAM_MARGIN;

    const az = THREE.MathUtils.degToRad(38); // 3/4 off the nose
    const el = THREE.MathUtils.degToRad(15); // gentle elevation
    const viewDir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));

    const camPos = center.clone().addScaledVector(viewDir, camDist);
    const camTgt = center.clone();

    const camDir = new THREE.Vector3().subVectors(camTgt, camPos).normalize();
    const rightDir = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize();
    const upDir = new THREE.Vector3().crossVectors(rightDir, camDir).normalize();
    const rigScale = Math.max(size.x, size.y) * 0.5;

    // How far the yaw-fan markings can reach along the bike's own +X (the
    // direction they're actually drawn in) before they project below the
    // bottom of frame. A point P is visible when its offset along `upDir`,
    // relative to the camera, is no more than tan(vFov/2) times its depth
    // along `camDir`; solving that inequality as an equality for distance
    // `d` along +X from `bikeCenter` gives the exact reach, with `FRAME_SAFE`
    // pulling it in from the true edge for margin. (An earlier version
    // measured "nearest visible ground point" along the camera's own view
    // ray instead of along +X — a different direction, off by nearly 40° at
    // this azimuth — and the fan still ran off the bottom of frame.)
    const FRAME_SAFE = 0.82;
    const K = Math.tan(vFov / 2) * FRAME_SAFE;
    const relPivot = new THREE.Vector3().subVectors(bikeCenter, camPos);
    const denom = upDir.x + K * camDir.x;
    const maxFanReach = Math.abs(denom) > 1e-6
      ? -(relPivot.dot(upDir) + K * relPivot.dot(camDir)) / denom
      : camDist;

    key.position.copy(camPos).addScaledVector(rightDir, -rigScale * 1.6).add(new THREE.Vector3(0, rigScale * 1.8, 0));
    key.target.position.copy(center);
    // continue PAST the target along the camera's own view direction — that's
    // the far side of the bike from the camera, i.e. "behind" it
    rim.position.copy(center).addScaledVector(camDir, rigScale * 2.0).add(new THREE.Vector3(0, rigScale * 1.6, 0));
    rim.target.position.copy(center);

    // key light's shadow frustum: same kit-aware scale as everything else
    // here, not the bare wheelbase — a wide kit sticking past the old ±wb
    // bound produced the exact blocky shadow-map artifact fixed earlier,
    // just from the bag side instead of the terrain side.
    const ksc = key.shadow.camera;
    ksc.left = -rigScale * 2.6; ksc.right = rigScale * 2.6;
    ksc.top = rigScale * 2.2; ksc.bottom = -rigScale * 2.2;
    ksc.near = 0.05; ksc.far = rigScale * 9;
    ksc.updateProjectionMatrix();

    // ---- set footprint, solved from the frustum at the backdrop's depth,
    // not from the bike. `halfFov` is a circular (not rectangular) bound —
    // safe at any camera azimuth without having to reason about how an
    // axis-aligned floor rectangle clips against an off-axis frustum.
    const backdropDepth = camDist * 2.1;
    const halfFov = Math.hypot(Math.tan(hFov / 2), Math.tan(vFov / 2));
    const SET_MARGIN = 1.35;
    const footprintR = backdropDepth * halfFov * SET_MARGIN;

    const floorHalf = Math.max(footprintR, camDist * 1.3);
    const floorLen = floorHalf * 2;
    const floorW = floorHalf * 1.4;
    const wallH = footprintR * 0.9;
    const coveR = rigScale * 1.1;
    const backX = bikeCenter.x - floorHalf; // downwind end: wind blows −X, hits the nose (+X) first

    disposeObject(setGroup);
    scene.remove(setGroup);
    setGroup = buildSet({ bikeCenter, wb, floorLen, floorW, wallH, coveR, backX, maxFanReach });
    setGroup.visible = false;
    scene.add(setGroup);
    setFade = snapshotFade(collectMaterials(setGroup));

    return { camPos, camTgt };
  }

  const tunnel = {
    _mix: 0,        // 0 = original scene, 1 = full tunnel (lighting/fades/post/rider)
    _camMix: 0,     // camera/controls track their own, slightly faster, clock
    _dir: 0,        // +1 entering, -1 exiting, 0 idle — drives the visual crossfade only
    _entered: false, // the logical on/off switch — flips the instant enter()/exit() is called
    _saved: null,
    _oldWorldFade: null,
    _hardSwapped: false,

    // `active` is the caller-facing on/off state, not "is a crossfade playing" —
    // it must flip the moment enter()/exit() is called so the mode is instantly
    // re-toggleable, independent of how long the visual dissolve takes.
    get active() {
      return this._entered;
    },

    enter() {
      this._entered = true;
      if (this._dir === 1 || (this._dir === 0 && this._mix >= 1)) return; // already entering/entered visually
      if (this._dir === 0 && this._mix === 0) this._beginFresh();
      controls.enabled = false;
      this._dir = 1;
    },

    exit() {
      this._entered = false;
      if (this._dir === -1 || (this._dir === 0 && this._mix <= 0)) return; // already exiting/exited visually
      controls.enabled = false;
      makeFadable(setFade); // re-arm: enter() left these opaque/depth-writing
      this._dir = -1;
    },

    _beginFresh() {
      this._saved = {
        camPos: camera.position.clone(),
        camTarget: controls.target.clone(),
        controlsEnabled: controls.enabled,
        bg: scene.background ? scene.background.clone() : null,
        fogColor: scene.fog.color.clone(),
        fogDensity: scene.fog.density,
        envIntensity: scene.environmentIntensity,
        sunIntensity: envs.sun.intensity,
        hemiIntensity: envs.hemi.intensity,
        hemiSky: envs.hemi.color.clone(),
        hemiGround: envs.hemi.groundColor.clone(),
        skyVisible: envs.sky.visible,
        campVisible: envs.camp.visible,
        // undefined until the caller passes `passes: { gtao, bloom }` — no-ops otherwise
        gtaoRadius: gtao ? gtao.gtaoMaterial.uniforms.radius.value : null,
        bloomStrength: bloom ? bloom.strength : null,
      };
      const activeWorld = envs.worlds[envs.current];
      const oldWorldRoots = [envs.ground, envs.rocks, envs.vignette, envs.shoreDisc, activeWorld?.group].filter(Boolean);
      this._oldWorldFade = snapshotFade(oldWorldRoots.flatMap(collectMaterials));
      this._hardSwapped = false;

      // re-fit every time: whatever's mounted now (or not) is what has to fit
      const { camPos, camTgt } = frameBike();
      this._tunnelCamPos = camPos;
      this._tunnelCamTgt = camTgt;

      setGroup.visible = true;
      key.visible = true;
      rim.visible = true;
      smoke?.setEnabled(true);
    },

    tick(dt) {
      if (this._dir === 0 && this._mix === 0) return;
      if (this._dir !== 0) {
        this._mix = clamp01(this._mix + this._dir * (dt / FX_DURATION));
        this._camMix = clamp01(this._camMix + this._dir * (dt / CAM_DURATION));
        this._apply(easeInOutCubic(this._camMix), easeInOutCubic(this._mix));
        if (this._dir === 1 && this._mix >= 1) { this._dir = 0; this._finishEnter(); }
        else if (this._dir === -1 && this._mix <= 0) { this._dir = 0; this._finishExit(); }
      }
      if (this._mix > 0) smoke?.tick(dt);
    },

    _apply(camT, fxT) {
      camera.position.lerpVectors(this._saved.camPos, this._tunnelCamPos, camT);
      controls.target.lerpVectors(this._saved.camTarget, this._tunnelCamTgt, camT);
      controls.update();

      applyFadeAlpha(this._oldWorldFade, 1 - fxT);
      applyFadeAlpha(setFade, fxT);

      key.intensity = KEY_INTENSITY * fxT;
      rim.intensity = RIM_INTENSITY * fxT;
      envs.sun.intensity = this._saved.sunIntensity * (1 - fxT);
      envs.hemi.intensity = THREE.MathUtils.lerp(this._saved.hemiIntensity, TUNNEL_HEMI_INTENSITY, fxT);
      envs.hemi.color.lerpColors(this._saved.hemiSky, TUNNEL_HEMI_COLOR, fxT);
      envs.hemi.groundColor.lerpColors(this._saved.hemiGround, TUNNEL_HEMI_COLOR, fxT);

      if (scene.background) scene.background.lerpColors(this._saved.bg, TUNNEL_BG, fxT);
      scene.fog.color.lerpColors(this._saved.fogColor, TUNNEL_FOG_COLOR, fxT);
      scene.fog.density = THREE.MathUtils.lerp(this._saved.fogDensity, TUNNEL_FOG_DENSITY, fxT);
      scene.environmentIntensity = THREE.MathUtils.lerp(this._saved.envIntensity, TUNNEL_ENV_INTENSITY, fxT);

      if (gtao) gtao.updateGtaoMaterial({ radius: THREE.MathUtils.lerp(this._saved.gtaoRadius, TUNNEL_GTAO_RADIUS, fxT) });
      if (bloom) bloom.strength = THREE.MathUtils.lerp(this._saved.bloomStrength, this._saved.bloomStrength + BLOOM_LIFT, fxT);

      rider?.setOpacity(fxT);

      // sky shader / campfire light have no alpha to fade (see report) — cut
      // them at the crossfade's midpoint, where everything else is mid-churn
      const wantHard = fxT >= 0.5;
      if (wantHard !== this._hardSwapped) {
        envs.sky.visible = wantHard ? false : this._saved.skyVisible;
        envs.camp.visible = wantHard ? false : this._saved.campVisible;
        this._hardSwapped = wantHard;
      }
    },

    _finishEnter() {
      this._mix = 1; this._camMix = 1;
      controls.enabled = true;
      // settle the (now fully opaque) set back to normal depth-writing
      // geometry — leaving depthWrite off forever would let it mis-sort
      // against the smoke and its own markings
      restoreFade(setFade);
    },

    _finishExit() {
      this._mix = 0; this._camMix = 0;
      camera.position.copy(this._saved.camPos);
      controls.target.copy(this._saved.camTarget);
      controls.update();
      controls.enabled = this._saved.controlsEnabled;

      restoreFade(this._oldWorldFade);
      applyFadeAlpha(setFade, 0);
      setGroup.visible = false;
      key.visible = false; rim.visible = false;
      key.intensity = 0; rim.intensity = 0;

      envs.sun.intensity = this._saved.sunIntensity;
      envs.hemi.intensity = this._saved.hemiIntensity;
      envs.hemi.color.copy(this._saved.hemiSky);
      envs.hemi.groundColor.copy(this._saved.hemiGround);
      envs.sky.visible = this._saved.skyVisible;
      envs.camp.visible = this._saved.campVisible;

      if (scene.background) scene.background.copy(this._saved.bg);
      scene.fog.color.copy(this._saved.fogColor);
      scene.fog.density = this._saved.fogDensity;
      scene.environmentIntensity = this._saved.envIntensity;

      if (gtao) gtao.updateGtaoMaterial({ radius: this._saved.gtaoRadius });
      if (bloom) bloom.strength = this._saved.bloomStrength;

      rider?.setOpacity(0);
      smoke?.setEnabled(false);

      this._saved = null;
      this._oldWorldFade = null;
    },
  };

  return tunnel;
}
