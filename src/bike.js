import * as THREE from 'three';
import { mm, deg, v3, tubeBetween, capsuleBetween, tubeAlong, labelTexture } from './lib.js';

/**
 * Parametric drop-bar gravel/adventure bike, built in millimetres from a real
 * geometry chart (Trek Checkpoint-class, size 56) then scaled to metres.
 * Coordinate system: +X = forward, +Y = up, +Z = drive side (faces camera).
 */
export const GEO = {
  wheelbase: 1032,
  chainstay: 428,
  bbDrop: 76,
  headAngle: 71.7,
  seatAngle: 73.3,
  stack: 583,
  reach: 386,
  headTube: 155,
  seatTube: 520,
  forkOffset: 49,
  rimBSD: 622,
  tireWidth: 45,
  saddleHeight: 705,
  saddleLength: 270,
  saddleWidth: 143,
  saddleRailSpacing: 44,   // data/geometry-journeyer57.json: saddle_rail_spacing_z
  saddleRailDia: 7,
  crankLength: 172.5,
  barWidth: 440,
  barReach: 70,
  barDrop: 115,
  stemLength: 90,
  spacers: 48,
  rotor: 160,
};

export const PAINTS = {
  Slate:   { color: 0x4a5560, accent: 0xd84a35 },
  Forest:  { color: 0x2c4634, accent: 0xe8c87a },
  Oxblood: { color: 0x5e2326, accent: 0xe6ddc8 },
  Midnight:{ color: 0x232b3a, accent: 0x7fd1c0 },
  Sand:    { color: 0xc9b28a, accent: 0x2f3a45 },
  Violet:  { color: 0x584a72, accent: 0xf0a848 },
};

export function computePoints(g = GEO) {
  const rearAxle = v3(-Math.sqrt(g.chainstay ** 2 - g.bbDrop ** 2), g.bbDrop);
  const frontAxle = v3(g.wheelbase + rearAxle.x, g.bbDrop);
  const headTop = v3(g.reach, g.stack);
  const hd = v3(Math.cos(deg(g.headAngle)), -Math.sin(deg(g.headAngle))); // down the steerer
  const headBottom = headTop.clone().addScaledVector(hd, g.headTube);
  const sd = v3(-Math.cos(deg(g.seatAngle)), Math.sin(deg(g.seatAngle))); // up the seat tube
  const seatTop = sd.clone().multiplyScalar(g.seatTube);
  const saddlePos = sd.clone().multiplyScalar(g.saddleHeight);
  const steererTop = headTop.clone().addScaledVector(hd, -g.spacers);
  const stemPitch = deg(-6);
  const barCenter = steererTop.clone().add(v3(Math.cos(stemPitch), Math.sin(stemPitch)).multiplyScalar(g.stemLength));
  const tireR = g.rimBSD / 2 + g.tireWidth / 2;
  return { rearAxle, frontAxle, headTop, headBottom, seatTop, saddlePos, steererTop, barCenter, hd, sd, tireR };
}

function contactShadowTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 6, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

export function createBike({ paint = 'Slate' } = {}) {
  const g = GEO;
  const P = computePoints(g);
  const root = new THREE.Group();
  root.name = 'bike';

  const paintDef = PAINTS[paint] || PAINTS.Slate;
  const M = {
    paint: new THREE.MeshPhysicalMaterial({
      color: paintDef.color, metalness: 0.35, roughness: 0.38,
      clearcoat: 0.8, clearcoatRoughness: 0.22, envMapIntensity: 0.85,
    }),
    aluDark: new THREE.MeshStandardMaterial({ color: 0x26282b, metalness: 0.85, roughness: 0.42 }),
    aluBright: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.95, roughness: 0.28 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x565a5f, metalness: 0.92, roughness: 0.36 }),
    chain: new THREE.MeshStandardMaterial({ color: 0x565a5e, metalness: 0.7, roughness: 0.55 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1d1c1a, roughness: 0.95, metalness: 0 }),
    tape: new THREE.MeshStandardMaterial({ color: 0x2b2724, roughness: 0.92 }),
    hose: new THREE.MeshStandardMaterial({ color: 0x161719, roughness: 0.7 }),
    saddle: new THREE.MeshStandardMaterial({ color: 0x241d17, roughness: 0.62 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x232527, metalness: 0.8, roughness: 0.38 }),
  };

  const S = mm(1);
  const F = new THREE.Group();
  F.scale.setScalar(S);
  root.add(F);

  const pt = (p, z = 0) => v3(p.x, p.y, z);

  // ---- Frame tubes -------------------------------------------------------
  const headR = 24, ttR = 16, dtR1 = 20, dtR2 = 25, stR = 15.5, csR = 10, ssR = 8;
  F.add(tubeBetween(pt(P.headTop).addScaledVector(v3(P.hd.x, P.hd.y), -8), pt(P.headBottom).addScaledVector(v3(P.hd.x, P.hd.y), 8), headR, headR, M.paint));
  const ttHead = pt(P.headTop).addScaledVector(v3(P.hd.x, P.hd.y), 30);
  const ttSeat = pt(P.seatTop).addScaledVector(v3(P.sd.x, P.sd.y), -12);
  F.add(tubeBetween(ttHead, ttSeat, ttR, ttR, M.paint));
  const dtHead = pt(P.headBottom).addScaledVector(v3(P.hd.x, P.hd.y), -12);
  F.add(tubeBetween(v3(10, 6), dtHead, dtR2, dtR1, M.paint));
  F.add(tubeBetween(v3(0, 0), pt(P.seatTop), stR, stR, M.paint));
  const bb = new THREE.Mesh(new THREE.CylinderGeometry(23, 23, 74, 24), M.paint);
  bb.rotation.x = Math.PI / 2;
  bb.castShadow = true;
  F.add(bb);
  // seatpost clamp collar
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(stR + 3, stR + 3, 14, 20), M.aluDark);
  collar.position.copy(pt(P.seatTop));
  collar.quaternion.setFromUnitVectors(v3(0, 1, 0), v3(P.sd.x, P.sd.y, 0));
  F.add(collar);
  for (const side of [1, -1]) {
    const dropout = v3(P.rearAxle.x, P.rearAxle.y, side * 67);
    F.add(tubeBetween(v3(-15, -2, side * 40), dropout, csR, csR * 0.8, M.paint));
    const seatCluster = pt(P.seatTop).addScaledVector(v3(P.sd.x, P.sd.y), -28);
    seatCluster.z = side * 20;
    F.add(tubeBetween(dropout, seatCluster, ssR * 0.85, ssR, M.paint));
    const dp = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 10, 16), M.aluDark);
    dp.position.copy(dropout);
    dp.rotation.x = Math.PI / 2;
    F.add(dp);
  }
  // Head badge
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 19),
    new THREE.MeshBasicMaterial({ map: labelTexture('PACKRIG', { bg: '#1a1d20', w: 128, h: 96, font: 'bold 20px Arial' }), transparent: true })
  );
  const badgePos = pt(P.headTop).addScaledVector(v3(P.hd.x, P.hd.y), g.headTube * 0.5);
  badge.position.set(badgePos.x + headR + 1, badgePos.y, 0);
  badge.rotation.y = Math.PI / 2;
  badge.rotation.z = -deg(90 - g.headAngle);
  F.add(badge);

  // ---- Fork --------------------------------------------------------------
  const crown = pt(P.headBottom).addScaledVector(v3(P.hd.x, P.hd.y), 20);
  for (const side of [1, -1]) {
    const a = v3(crown.x, crown.y, side * 30);
    const axle = v3(P.frontAxle.x, P.frontAxle.y, side * 48);
    // nearly straight blade, slight forward sweep in the lower third
    const m1 = a.clone().lerp(axle, 0.45).add(v3(-4, 0, side * 4));
    const m2 = a.clone().lerp(axle, 0.8).add(v3(3, 0, side * 2));
    // Name the blade explicitly. bagshot identifies a collider by which frame
    // LANDMARK its bounding-box centre is nearest, within 130mm. A curved blade
    // is a TubeGeometry whose bbox centre sits ~190mm from the front axle and
    // ~211mm from the head bottom, so it matches nothing and is reported as
    // "unnamed part" — meaning the thing a fork bag is actually bolted to was
    // measured and then ignored by every clearance rule, while the collider the
    // harness DID call "fork leg" was a wheel spoke.
    const blade = tubeAlong([a, m1, m2, axle], 12, M.paint, { segments: 24 });
    blade.userData.part = 'fork leg';
    F.add(blade);
  }
  const crownMesh = new THREE.Mesh(new THREE.BoxGeometry(42, 30, 74), M.paint);
  crownMesh.position.copy(crown);
  crownMesh.rotation.z = -deg(90 - g.headAngle);
  crownMesh.castShadow = true;
  F.add(crownMesh);

  // ---- Wheels ------------------------------------------------------------
  const wheels = [];
  function wheel(center) {
    const W = new THREE.Group();
    W.position.copy(center);
    // vertex-colored tire: tread cap wraps the shoulders, tan sidewall band
    const tireGeo = new THREE.TorusGeometry(P.tireR, g.tireWidth / 2, 44, 96);
    const tread = new THREE.Color(0x201d1a), wall = new THREE.Color(0xa5825c), inner = new THREE.Color(0x2a2723);
    const posA = tireGeo.attributes.position;
    const cols = new Float32Array(posA.count * 3);
    const R = P.tireR;
    for (let i = 0; i < posA.count; i++) {
      const d = Math.hypot(posA.getX(i), posA.getY(i));
      const t = (d - R) / (g.tireWidth / 2);
      let c;
      if (t > -0.34) c = tread;
      else if (t > -0.46) c = tread.clone().lerp(wall, (-0.34 - t) / 0.12);
      else if (t < -0.82) c = inner;
      else c = wall;
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    tireGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const tire = new THREE.Mesh(tireGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, envMapIntensity: 0.35 }));
    tire.castShadow = true;
    tire.receiveShadow = true;
    W.add(tire);
    // knobs: instanced boxes in staggered rows over the tread cap
    const knobGeo = new THREE.BoxGeometry(6, 4.5, 5);
    const knobMat = new THREE.MeshStandardMaterial({ color: 0x201d1a, roughness: 0.95 });
    const rows = [
      { off: 0, rr: R + g.tireWidth / 2 - 1.5, n: 72, s: 1 },
      { off: 9, rr: R + g.tireWidth / 2 - 3.5, n: 64, s: 1.05 },
      { off: -9, rr: R + g.tireWidth / 2 - 3.5, n: 64, s: 1.05 },
      { off: 16, rr: R + g.tireWidth / 2 - 8, n: 56, s: 1.2 },
      { off: -16, rr: R + g.tireWidth / 2 - 8, n: 56, s: 1.2 },
    ];
    const total = rows.reduce((n, r) => n + r.n, 0);
    const knobs = new THREE.InstancedMesh(knobGeo, knobMat, total);
    const dummy = new THREE.Object3D();
    let ki = 0;
    for (const row of rows) {
      for (let i = 0; i < row.n; i++) {
        const a = (i / row.n) * Math.PI * 2 + row.off * 0.01;
        dummy.position.set(Math.cos(a) * row.rr, Math.sin(a) * row.rr, row.off);
        dummy.rotation.set(0, 0, a + Math.PI / 2);
        dummy.scale.setScalar(row.s);
        dummy.updateMatrix();
        knobs.setMatrixAt(ki++, dummy.matrix);
      }
    }
    knobs.castShadow = false;
    W.add(knobs);
    // rim ring
    const rimOuter = g.rimBSD / 2, rimInner = rimOuter - 20;
    const rimProfile = [
      new THREE.Vector2(rimInner, -9), new THREE.Vector2(rimOuter, -12),
      new THREE.Vector2(rimOuter, 12), new THREE.Vector2(rimInner, 9),
      new THREE.Vector2(rimInner, -9),
    ];
    const rim = new THREE.Mesh(new THREE.LatheGeometry(rimProfile, 72), M.rim);
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    W.add(rim);
    // hub
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 88, 20), M.aluDark);
    hub.rotation.x = Math.PI / 2;
    W.add(hub);
    for (const side of [1, -1]) {
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(27, 27, 5, 24), M.aluDark);
      flange.rotation.x = Math.PI / 2;
      flange.position.z = side * 38;
      W.add(flange);
    }
    // spokes — 32, 2-cross tangential lacing, alternating flanges
    const spokeMat = new THREE.MeshStandardMaterial({ color: 0x83888d, metalness: 0.9, roughness: 0.4 });
    for (let i = 0; i < 32; i++) {
      const ang = (i / 32) * Math.PI * 2;
      const side = i % 2 === 0 ? 1 : -1;
      const dir = (i % 4 < 2 ? 1 : -1);
      const hubAng = ang + dir * 1.05;
      const a = v3(Math.cos(hubAng) * 33, Math.sin(hubAng) * 33, side * 38);
      const b = v3(Math.cos(ang) * (g.rimBSD / 2 - 6), Math.sin(ang) * (g.rimBSD / 2 - 6), side * 2);
      const spoke = tubeBetween(a, b, 1.15, 1.15, spokeMat, 5);
      spoke.castShadow = false;
      W.add(spoke);
    }
    const valve = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 34, 8), M.aluDark);
    valve.position.set(0, -(g.rimBSD / 2 - 6), 6);
    W.add(valve);
    // rotor: carrier + braking band + 6 spider arms (non-drive side)
    const rz = -40;
    const band = new THREE.Mesh(new THREE.TorusGeometry(g.rotor / 2 - 8, 7, 4, 48), M.aluBright);
    band.position.z = rz;
    band.scale.z = 0.16;
    W.add(band);
    const carrier = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 3, 20), M.aluDark);
    carrier.rotation.x = Math.PI / 2;
    carrier.position.z = rz;
    W.add(carrier);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const arm = tubeBetween(
        v3(Math.cos(a) * 24, Math.sin(a) * 24, rz),
        v3(Math.cos(a + 0.5) * (g.rotor / 2 - 12), Math.sin(a + 0.5) * (g.rotor / 2 - 12), rz),
        2.6, 2.6, M.aluDark, 6
      );
      arm.castShadow = false;
      W.add(arm);
    }
    F.add(W);
    wheels.push(W);
    return W;
  }
  wheel(pt(P.rearAxle));
  wheel(pt(P.frontAxle));

  // Brake calipers straddling the rotors
  for (const [x, y] of [
    [P.frontAxle.x - 12, P.frontAxle.y + 62],
    [P.rearAxle.x + 26, P.rearAxle.y + 58],
  ]) {
    const cal = new THREE.Mesh(new THREE.BoxGeometry(52, 30, 26), new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.8, roughness: 0.45 }));
    cal.position.set(x, y, -44);
    cal.rotation.z = deg(-55);
    cal.castShadow = true;
    F.add(cal);
  }

  // ---- Drivetrain --------------------------------------------------------
  // 1x11 gravel group at real dimensions (Shimano GRX-class): 40T narrow-wide
  // ring, 11-42 cassette, long-cage mech, and a chain assembled from individual
  // plates / rollers / pins strung along a properly tangent belt path.
  const CHAIN_PITCH = 12.7;
  const COG_TEETH = [42, 36, 32, 28, 25, 22, 19, 17, 15, 13, 11];
  const ENGAGED = 2;                                   // cog the chain sits on
  const RING_TEETH = 40, RING_Z = 50;
  const pitchR = (n) => CHAIN_PITCH / (2 * Math.sin(Math.PI / n)); // roller circle
  const cogZ = (i) => 27.3 + i * 3.9;
  const cogTipR = (i) => pitchR(COG_TEETH[i]) + 3.6;
  const ringR = pitchR(RING_TEETH);
  const jockeyR = pitchR(11);
  const dtZ = cogZ(ENGAGED);                           // working chainline plane

  const MD = {
    cogEdge: new THREE.MeshStandardMaterial({ color: 0x3c4045, metalness: 0.92, roughness: 0.44 }),
    roller: new THREE.MeshStandardMaterial({ color: 0x44484c, metalness: 0.95, roughness: 0.34 }),
    pin: new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 1.0, roughness: 0.22 }),
    der: new THREE.MeshStandardMaterial({ color: 0x2b2e33, metalness: 0.86, roughness: 0.4 }),
    cage: new THREE.MeshStandardMaterial({ color: 0x4b5158, metalness: 0.94, roughness: 0.34 }),
    derBright: new THREE.MeshStandardMaterial({ color: 0x8d9298, metalness: 0.95, roughness: 0.3 }),
    jockey: new THREE.MeshStandardMaterial({ color: 0x2e3237, metalness: 0.2, roughness: 0.58 }),
    jockeyTooth: new THREE.MeshStandardMaterial({ color: 0x4a4f55, metalness: 0.25, roughness: 0.55 }),
  };
  // machined faces brighten toward the small end, where less of the stack shades them
  const cogFaceMat = (i) => new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x4b5057).lerp(new THREE.Color(0x848b93), i / (COG_TEETH.length - 1)),
    metalness: 0.95, roughness: 0.28,
  });

  /** Flat part with rounded ends: long axis +X, thickness along Z, centred. */
  function flatPart(len, r1, r2, thick, mat) {
    const s = new THREE.Shape();
    s.absarc(len / 2, 0, r1, -Math.PI / 2, Math.PI / 2, false);
    s.absarc(-len / 2, 0, r2, Math.PI / 2, Math.PI * 1.5, false);
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: thick, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 1, curveSegments: 10,
    });
    geo.translate(0, 0, -thick / 2);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  }
  /** Position a flatPart so its two ends land on a and b, in the plane z. */
  function spanPart(mesh, a, b, z) {
    mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, z);
    mesh.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
    return mesh;
  }
  /** Same, but spanning two 3D points — the part keeps its faces toward ±Z. */
  const _t = new THREE.Vector3(), _b = new THREE.Vector3(), _y = new THREE.Vector3();
  function spanPart3(mesh, a, b, lateral = 0) {
    _t.subVectors(b, a).normalize();
    _b.set(0, 0, 1).addScaledVector(_t, -_t.z).normalize();
    _y.crossVectors(_b, _t);
    mesh.position.copy(a).add(b).multiplyScalar(0.5).addScaledVector(_b, lateral);
    mesh.setRotationFromMatrix(new THREE.Matrix4().makeBasis(_t, _y, _b));
    return mesh;
  }
  /** Rounded slab in the XY plane, extruded along Z. */
  function roundedSlab(w, h, thick, r, mat) {
    const s = new THREE.Shape();
    const x = w / 2 - r, y = h / 2 - r;
    s.absarc(x, y, r, 0, Math.PI / 2, false);
    s.absarc(-x, y, r, Math.PI / 2, Math.PI, false);
    s.absarc(-x, -y, r, Math.PI, Math.PI * 1.5, false);
    s.absarc(x, -y, r, Math.PI * 1.5, Math.PI * 2, false);
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: thick, bevelEnabled: true, bevelThickness: 0.7, bevelSize: 0.7, bevelSegments: 2, curveSegments: 8,
    });
    geo.translate(0, 0, -thick / 2);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  }
  /** Flat annulus (cutaway sprocket / chainring web). */
  function annulus(rOuter, rInner, thick, mat, seg = 64) {
    const s = new THREE.Shape();
    s.absarc(0, 0, rOuter, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, rInner, 0, Math.PI * 2, true);
    s.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: seg });
    geo.translate(0, 0, -thick / 2);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  }
  /** Disc lying in the XY plane (cylinder axis along Z). */
  function disc(r, thick, mat, seg = 32) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, thick, seg), mat);
    m.rotation.x = Math.PI / 2;
    m.castShadow = true;
    return m;
  }

  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 120, 16), M.steel);
  spindle.rotation.x = Math.PI / 2;
  F.add(spindle);

  // --- chain path: true tangent belt around ring, engaged cog, both jockeys --
  const j1 = v3(P.rearAxle.x + 30, P.rearAxle.y - 96, dtZ);    // guide pulley
  const j2 = v3(j1.x + 16, j1.y - 76, dtZ);                    // tension pulley
  // s = +1 wraps counter-clockwise; the guide pulley is the S-bend, so it is -1
  const PULLEYS = [
    { c: new THREE.Vector2(0, 0), r: ringR, s: 1, z: RING_Z },
    { c: new THREE.Vector2(P.rearAxle.x, P.rearAxle.y), r: pitchR(COG_TEETH[ENGAGED]), s: 1, z: dtZ },
    { c: new THREE.Vector2(j1.x, j1.y), r: jockeyR, s: -1, z: dtZ },
    { c: new THREE.Vector2(j2.x, j2.y), r: jockeyR, s: 1, z: dtZ },
  ];
  const chainPath = (() => {
    const nP = PULLEYS.length;
    const rot90 = (v) => new THREE.Vector2(-v.y, v.x);
    // common tangent between each consecutive pair, honouring wrap direction
    const tang = [];
    for (let i = 0; i < nP; i++) {
      const A = PULLEYS[i], B = PULLEYS[(i + 1) % nP];
      const d = new THREE.Vector2().subVectors(B.c, A.c);
      const dh = d.clone().normalize();
      const c = THREE.MathUtils.clamp((A.s * A.r - B.s * B.r) / d.length(), -1, 1);
      const n = dh.clone().multiplyScalar(c).addScaledVector(rot90(dh), -Math.sqrt(1 - c * c));
      tang.push({
        P: A.c.clone().addScaledVector(n, A.s * A.r),
        Q: B.c.clone().addScaledVector(n, B.s * B.r),
      });
    }
    const pts = [];
    for (let i = 0; i < nP; i++) {
      const A = PULLEYS[i], B = PULLEYS[(i + 1) % nP];
      const inP = tang[(i - 1 + nP) % nP].Q, outP = tang[i].P;
      const a0 = Math.atan2(inP.y - A.c.y, inP.x - A.c.x);
      let sweep = Math.atan2(outP.y - A.c.y, outP.x - A.c.x) - a0;
      if (A.s > 0) { while (sweep < 0) sweep += Math.PI * 2; }
      else { while (sweep > 0) sweep -= Math.PI * 2; }
      const steps = Math.max(2, Math.ceil(Math.abs(sweep) / 0.05));
      for (let k = 0; k <= steps; k++) {
        const a = a0 + (sweep * k) / steps;
        pts.push({ x: A.c.x + Math.cos(a) * A.r, y: A.c.y + Math.sin(a) * A.r, z: A.z, p: i });
      }
      // taut run to the next sprocket, chainline z lerped across it
      for (let k = 1; k < 8; k++) {
        const t = k / 8;
        pts.push({
          x: outP.x + (tang[i].Q.x - outP.x) * t,
          y: outP.y + (tang[i].Q.y - outP.y) * t,
          z: A.z + (B.z - A.z) * t,
          p: -1,
        });
      }
    }
    return pts;
  })();
  // resample the closed path at (near-)exact 12.7 mm pitch, even link count
  const chainLinks = (() => {
    const n = chainPath.length;
    const cum = [0];
    for (let i = 0; i < n; i++) {
      const a = chainPath[i], b = chainPath[(i + 1) % n];
      cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
    }
    const count = 2 * Math.round(cum[n] / (2 * CHAIN_PITCH));
    const step = cum[n] / count;
    const out = [];
    let seg = 0;
    for (let i = 0; i < count; i++) {
      const s = i * step;
      while (seg < n - 1 && cum[seg + 1] < s) seg++;
      const t = (s - cum[seg]) / Math.max(1e-6, cum[seg + 1] - cum[seg]);
      const a = chainPath[seg], b = chainPath[(seg + 1) % n];
      out.push({
        pos: v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t),
        p: a.p,
      });
    }
    return out;
  })();
  // phase each sprocket so its teeth fall between the rollers they mesh with
  const toothPhase = PULLEYS.map((pl, i) => {
    const s = chainLinks.find((q) => q.p === i);
    return (s ? Math.atan2(s.pos.y - pl.c.y, s.pos.x - pl.c.x) : 0);
  });

  // --- chainring ------------------------------------------------------------
  const ringWeb = annulus(ringR - 1.5, 58, 3, M.aluDark);
  ringWeb.position.z = RING_Z;
  F.add(ringWeb);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const arm = flatPart(46, 8, 11, 3, M.aluDark);
    F.add(spanPart(arm, { x: Math.cos(a) * 64, y: Math.sin(a) * 64 }, { x: Math.cos(a) * 18, y: Math.sin(a) * 18 }, RING_Z));
    const bolt = disc(4.6, 6, M.aluBright, 12);          // 110 BCD chainring bolt
    bolt.position.set(Math.cos(a) * 55, Math.sin(a) * 55, RING_Z);
    F.add(bolt);
  }
  const spiderHub = disc(20, 7, M.aluDark, 24);
  spiderHub.position.z = RING_Z;
  F.add(spiderHub);
  {
    // 2.9 deep, just inside the 3 mm web, so the shared base faces cannot z-fight
    const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(4.4, 5.1, 2.9), M.steel, RING_TEETH);
    const d = new THREE.Object3D();
    for (let i = 0; i < RING_TEETH; i++) {
      const a = toothPhase[0] + Math.PI / RING_TEETH + (i / RING_TEETH) * Math.PI * 2;
      d.position.set(Math.cos(a) * (ringR + 1.05), Math.sin(a) * (ringR + 1.05), RING_Z);
      d.rotation.set(0, 0, a + Math.PI / 2);
      d.scale.set(i % 2 ? 1 : 1.5, 1, 1);               // narrow-wide 1x profile
      d.updateMatrix();
      teeth.setMatrixAt(i, d.matrix);
    }
    F.add(teeth);
  }

  // crank arms + pedals
  const crankDir = v3(Math.cos(deg(-12)), Math.sin(deg(-12)));
  for (const side of [1, -1]) {
    const zA = side * 62;
    const armEnd = v3(crankDir.x * g.crankLength * side, crankDir.y * g.crankLength * side, zA);
    const arm = capsuleBetween(v3(0, 0, zA), armEnd, 12, M.aluDark);
    F.add(arm);
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(92, 12, 78), M.rubber);
    pedal.position.set(armEnd.x, armEnd.y, zA + side * 52);
    pedal.castShadow = true;
    F.add(pedal);
    const spindleP = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 56, 10), M.steel);
    spindleP.rotation.x = Math.PI / 2;
    spindleP.position.set(armEnd.x, armEnd.y, zA + side * 26);
    F.add(spindleP);
  }

  // --- cassette: 11-42, diameters derived from real tooth counts ------------
  const TOOTHED = COG_TEETH.length;   // one shared box geometry, ~260 instances
  {
    const teethTotal = COG_TEETH.slice(0, TOOTHED).reduce((s, n) => s + n, 0);
    const cogTeeth = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 5.6, 1.7), MD.cogEdge, teethTotal);
    const d = new THREE.Object3D();
    let ti = 0;
    for (let i = 0; i < COG_TEETH.length; i++) {
      const n = COG_TEETH[i], pr = pitchR(n), z = cogZ(i);
      const bodyR = i < TOOTHED ? pr - 2 : cogTipR(i);
      const face = cogFaceMat(i);
      const body = i === 0 ? annulus(bodyR, 56, 1.8, face) : disc(bodyR, 1.8, [MD.cogEdge, face, face], 48);
      body.position.set(P.rearAxle.x, P.rearAxle.y, z);
      F.add(body);
      if (i >= TOOTHED) continue;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        d.position.set(P.rearAxle.x + Math.cos(a) * (pr + 0.8), P.rearAxle.y + Math.sin(a) * (pr + 0.8), z);
        d.rotation.set(0, 0, a + Math.PI / 2);
        d.updateMatrix();
        cogTeeth.setMatrixAt(ti++, d.matrix);
      }
    }
    F.add(cogTeeth);
    // alloy spider carrying the 42T cog
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 6;
      const arm = flatPart(44, 7, 10, 1.8, MD.cogEdge);
      F.add(spanPart(arm,
        { x: P.rearAxle.x + Math.cos(a) * 60, y: P.rearAxle.y + Math.sin(a) * 60 },
        { x: P.rearAxle.x + Math.cos(a) * 16, y: P.rearAxle.y + Math.sin(a) * 16 },
        cogZ(0)));
    }
    const carrier = disc(20, 7, MD.cogEdge, 20);
    carrier.position.set(P.rearAxle.x, P.rearAxle.y, cogZ(0) + 2);
    F.add(carrier);
  }
  const lockring = disc(19, 4, M.aluDark, 24);
  lockring.position.set(P.rearAxle.x, P.rearAxle.y, cogZ(10) + 2.9);
  F.add(lockring);

  // --- rear derailleur: B-knuckle, parallelogram, long cage, 11T jockeys ----
  {
    // body hangs outboard of the whole cassette (z 27→66); the parallelogram
    // then carries the cage back inboard to the engaged cog's chainline
    const bK = v3(P.rearAxle.x - 8, P.rearAxle.y - 24, 76);
    const pK = v3(j1.x - 6, j1.y + 31, 54);
    // hanger plate + B-pivot bolt
    F.add(spanPart3(flatPart(46, 7, 11, 7, MD.der), v3(P.rearAxle.x + 4, P.rearAxle.y + 4, 70), bK));
    const bBolt = disc(6.5, 22, MD.derBright, 14);
    bBolt.position.set(P.rearAxle.x + 4, P.rearAxle.y + 4, 70);
    F.add(bBolt);
    const bKnuckle = roundedSlab(28, 34, 20, 8, MD.der);
    bKnuckle.position.copy(bK);
    bKnuckle.rotation.z = deg(-26);
    F.add(bKnuckle);
    const pKnuckle = roundedSlab(26, 32, 22, 9, MD.der);
    pKnuckle.position.copy(pK);
    pKnuckle.rotation.z = deg(14);
    F.add(pKnuckle);
    // parallelogram: two link plates straddling the knuckles, plus pivot bosses
    const linkA = v3(bK.x + 4, bK.y - 11, bK.z - 2);
    const linkB = v3(pK.x + 4, pK.y + 10, pK.z - 2);
    for (const lat of [11, -11]) {
      F.add(spanPart3(flatPart(linkA.distanceTo(linkB) - 12, 7, 7, 3.6, MD.cage), linkA, linkB, lat));
    }
    for (const p of [linkA, linkB]) {
      const pivot = disc(4, 30, MD.derBright, 10);
      pivot.position.copy(p);
      F.add(pivot);
    }
    // cage spring barrel on the P axis
    const barrel = disc(8.5, 14, MD.cage, 20);
    barrel.position.set(pK.x + 2, pK.y - 11, 47);
    F.add(barrel);
    // cage plates sandwiching the two jockeys, plus the P-knuckle bridge
    for (const z of [dtZ + 6.4, dtZ - 6.4]) {
      F.add(spanPart(flatPart(j1.distanceTo(j2), 12, 14, 3, MD.cage), j1, j2, z));
    }
    F.add(spanPart3(flatPart(pK.distanceTo(j1) - 6, 9, 12, 3, MD.cage), pK, j1, 0));
    // 11T jockey wheels
    const jTeeth = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 5.1, 2), MD.jockeyTooth, 22);
    const d = new THREE.Object3D();
    let ji = 0;
    for (const [k, jp] of [j1, j2].entries()) {
      const body = disc(jockeyR - 1.5, 6.2, MD.jockey, 28);
      body.position.copy(jp);
      F.add(body);
      const hub = disc(8, 8.4, MD.cage, 16);
      hub.position.copy(jp);
      F.add(hub);
      const bolt = disc(4.2, 17, MD.derBright, 12);
      bolt.position.copy(jp);
      F.add(bolt);
      for (let i = 0; i < 11; i++) {
        const a = toothPhase[2 + k] + Math.PI / 11 + (i / 11) * Math.PI * 2;
        d.position.set(jp.x + Math.cos(a) * (jockeyR + 1.05), jp.y + Math.sin(a) * (jockeyR + 1.05), jp.z);
        d.rotation.set(0, 0, a + Math.PI / 2);
        d.updateMatrix();
        jTeeth.setMatrixAt(ji++, d.matrix);
      }
    }
    F.add(jTeeth);
  }

  // --- chain: outer/inner plates, rollers and pins on every link ------------
  {
    const nL = chainLinks.length;
    // plate outline: pin bosses at ±pitch/2 joined by a waisted figure-8
    const ang = Math.PI / 3, pr = 4.3, waist = 3.1, hx = CHAIN_PITCH / 2;
    const sh = new THREE.Shape();
    sh.absarc(hx, 0, pr, -ang, ang, false);
    sh.quadraticCurveTo(0, waist, -hx + pr * Math.cos(Math.PI - ang), pr * Math.sin(Math.PI - ang));
    sh.absarc(-hx, 0, pr, Math.PI - ang, Math.PI + ang, false);
    sh.quadraticCurveTo(0, -waist, hx + pr * Math.cos(-ang), pr * Math.sin(-ang));
    const plateGeo = new THREE.ExtrudeGeometry(sh, {
      depth: 0.85, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 1, curveSegments: 6,
    });
    plateGeo.translate(0, 0, -0.425);
    const rollerGeo = new THREE.CylinderGeometry(3.87, 3.87, 2.18, 12);
    rollerGeo.rotateX(Math.PI / 2);
    const pinGeo = new THREE.CylinderGeometry(1.85, 1.85, 5.9, 8);
    pinGeo.rotateX(Math.PI / 2);
    const outer = new THREE.InstancedMesh(plateGeo, M.chain, nL);
    const inner = new THREE.InstancedMesh(plateGeo, M.chain, nL);
    const rollers = new THREE.InstancedMesh(rollerGeo, MD.roller, nL);
    const pins = new THREE.InstancedMesh(pinGeo, MD.pin, nL);
    const tAx = new THREE.Vector3(), bAx = new THREE.Vector3(), yAx = new THREE.Vector3();
    const mtx = new THREE.Matrix4(), pos = new THREE.Vector3();
    let oi = 0, ii = 0;
    for (let i = 0; i < nL; i++) {
      const a = chainLinks[i].pos, b = chainLinks[(i + 1) % nL].pos;
      tAx.subVectors(b, a).normalize();
      bAx.set(0, 0, 1).addScaledVector(tAx, -tAx.z).normalize();   // lateral, ⟂ tangent
      yAx.crossVectors(bAx, tAx);
      const isOuter = i % 2 === 0;
      for (const sgn of [1, -1]) {
        pos.copy(a).add(b).multiplyScalar(0.5).addScaledVector(bAx, sgn * (isOuter ? 2.38 : 1.52));
        mtx.makeBasis(tAx, yAx, bAx).setPosition(pos);
        if (isOuter) outer.setMatrixAt(oi++, mtx); else inner.setMatrixAt(ii++, mtx);
      }
      mtx.makeBasis(tAx, yAx, bAx).setPosition(a);
      rollers.setMatrixAt(i, mtx);
      pins.setMatrixAt(i, mtx);
    }
    outer.count = oi;
    inner.count = ii;
    for (const m of [outer, inner, rollers, pins]) { m.castShadow = true; F.add(m); }
  }

  // ---- Cockpit -----------------------------------------------------------
  F.add(tubeBetween(pt(P.headTop), pt(P.steererTop), 14, 14, M.aluDark));
  // headset cups top + bottom of the head tube
  for (const [end, off] of [[P.headTop, -4], [P.headBottom, 4]]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(headR + 2.5, headR + 2.5, 12, 24), M.aluDark);
    cup.position.copy(pt(end)).addScaledVector(v3(P.hd.x, P.hd.y), off);
    cup.quaternion.setFromUnitVectors(v3(0, 1, 0), v3(-P.hd.x, -P.hd.y, 0));
    F.add(cup);
  }
  F.add(tubeBetween(pt(P.steererTop), pt(P.barCenter), 16, 14, M.aluDark));
  const faceplate = new THREE.Mesh(new THREE.BoxGeometry(22, 36, 40), M.aluDark);
  faceplate.position.copy(pt(P.barCenter));
  faceplate.castShadow = true;
  F.add(faceplate);
  const barGrp = new THREE.Group();
  barGrp.position.copy(pt(P.barCenter));
  const half = g.barWidth / 2;
  for (const side of [1, -1]) {
    const p = (x, y, z) => v3(x, y, z * side);
    // tops: round tube from center to the bend
    barGrp.add(tubeAlong([p(0, 0, 0), p(0, 0, half * 0.6), p(4, 0, half * 0.9), p(18, -2, half)], 11.9, M.aluDark, { segments: 24 }));
    // single clean hook: ramp → hood nose → drop → drop end
    const hook = [
      p(18, -2, half),
      p(48, -6, half + 3),
      p(g.barReach + 6, -26, half + 5),
      p(g.barReach + 14, -g.barDrop * 0.55, half + 5),
      p(g.barReach - 20, -g.barDrop, half + 3),
      p(g.barReach - 62, -g.barDrop - 2, half + 1),
    ];
    barGrp.add(tubeAlong(hook, 13.8, M.tape, { segments: 48 }));
    // tubeAlong leaves an open cylinder, so the drop ended in a visible hole —
    // cap it the way a real bar does, with an end plug.
    const plug = new THREE.Mesh(new THREE.SphereGeometry(13.6, 16, 10), M.aluDark);
    plug.position.copy(hook[hook.length - 1]);
    barGrp.add(plug);
    // hood body: tapered capsule angled slightly up, with lever blade
    barGrp.add(capsuleBetween(p(34, 12, half + 1), p(92, 14, half + 4), 15.5, M.rubber));
    const lever = new THREE.Mesh(new THREE.BoxGeometry(10, 80, 12), M.aluDark);
    lever.position.set(102, -34, side * (half + 5));
    lever.rotation.z = deg(14);
    lever.castShadow = true;
    barGrp.add(lever);
  }
  F.add(barGrp);
  // brake hoses: bar → front caliper, bar → rear caliper (non-drive side)
  const hoseStart = pt(P.barCenter).add(v3(20, -18, 0));
  F.add(tubeAlong([
    hoseStart.clone().setZ(-30),
    pt(P.headBottom).add(v3(-24, -10, -30)),
    v3(crown.x - 10, crown.y - 30, -44),
    v3(P.frontAxle.x - 26, P.frontAxle.y + 110, -46),
  ], 2.6, M.hose, { segments: 24 }));
  F.add(tubeAlong([
    hoseStart.clone().setZ(-14),
    pt(P.headBottom).add(v3(-20, 6, -16)),
    dtHead.clone().add(v3(-6, -dtR1 - 6, -14)),
    v3(60, -14, -20),
    v3(-15, -12, -42),
    v3(P.rearAxle.x + 60, P.rearAxle.y + 46, -44),
  ], 2.6, M.hose, { segments: 32 }));

  // ---- Seatpost + saddle -------------------------------------------------
  const saddleTopY = P.saddlePos.y + 30;
  F.add(tubeBetween(pt(P.seatTop).addScaledVector(v3(P.sd.x, P.sd.y), -20), pt(P.saddlePos), 13.6, 13.6, M.aluDark));
  const saddleGrp = new THREE.Group();
  saddleGrp.position.set(P.saddlePos.x - 14, saddleTopY, 0);
  // shell: narrow nose, wide rear, thin profile
  const L = g.saddleLength, Wd = g.saddleWidth;
  const sShape = new THREE.Shape();
  sShape.moveTo(-L / 2, 0);
  sShape.bezierCurveTo(-L / 2, Wd * 0.52, -L * 0.28, Wd * 0.52, -L * 0.06, Wd * 0.30);
  sShape.bezierCurveTo(L * 0.2, Wd * 0.13, L * 0.36, 10.5, L / 2, 10);
  sShape.bezierCurveTo(L / 2 + 14, 0, L / 2 + 14, 0, L / 2, -10);
  sShape.bezierCurveTo(L * 0.36, -10.5, L * 0.2, -Wd * 0.13, -L * 0.06, -Wd * 0.30);
  sShape.bezierCurveTo(-L * 0.28, -Wd * 0.52, -L / 2, -Wd * 0.52, -L / 2, 0);
  const sGeo = new THREE.ExtrudeGeometry(sShape, { depth: 5, bevelEnabled: true, bevelThickness: 8, bevelSize: 6, bevelSegments: 5 });
  const saddleMesh = new THREE.Mesh(sGeo, M.saddle);
  saddleMesh.rotation.x = -Math.PI / 2;
  saddleMesh.position.y = -4;
  saddleMesh.castShadow = true;
  saddleGrp.add(saddleMesh);
  saddleGrp.rotation.z = deg(-3);
  const railZ = g.saddleRailSpacing / 2;
  const railY = -22;
  const railX0 = -L * 0.4, railX1 = L * 0.26;
  for (const side of [1, -1]) {
    saddleGrp.add(tubeBetween(v3(railX0, railY, side * railZ), v3(railX1, railY, side * railZ), g.saddleRailDia / 2, g.saddleRailDia / 2, M.steel));
  }
  // Bag builders need to land straps ON the rails, so publish them in frame
  // coords rather than making every builder re-derive the saddle transform.
  saddleGrp.updateMatrix();
  const railPoint = (x, side) => v3(x, railY, side * railZ).applyMatrix4(saddleGrp.matrix);
  const rails = {
    z: railZ,
    r: g.saddleRailDia / 2,
    left: [railPoint(railX0, -1), railPoint(railX1, -1)],
    right: [railPoint(railX0, 1), railPoint(railX1, 1)],
  };
  const clamp = new THREE.Mesh(new THREE.BoxGeometry(30, 22, 34), M.aluDark);
  clamp.position.set(-6, -24, 0);
  saddleGrp.add(clamp);
  F.add(saddleGrp);

  // ---- Bottles + cages on B-RAD slide rails ------------------------------
  // Real bottle silhouette (lathe: body → shoulder → neck → cap) in a
  // side-load cage, mounted on a rail so the bag system can slide it down
  // the tube when a frame bag needs the room (Wolf Tooth B-RAD style).
  const bottles = new THREE.Group();
  const bottleMounts = {};
  const BOTTLE_COLORS = [0x6fa892, 0xc2601f]; // muted mint + burnt orange, per club photos
  function bottle(key, tubeDir, alongDist, perpOffset, flip, colorHex) {
    const grp = new THREE.Group();
    const dir = tubeDir.clone().normalize();
    const perp = v3(dir.y * flip, -dir.x * flip, 0);
    const base = dir.clone().multiplyScalar(alongDist).addScaledVector(perp, perpOffset);
    const cageMat = M.aluDark;
    // The cage is drawn on local -x. Which world direction that is depends on
    // `flip`: for the seat tube -x points AT the tube, for the down tube it
    // points away, which put the cage on top of the bottle instead of between
    // bottle and frame. Rotating 180° about Y mirrors x without inverting
    // normals (the cage is symmetric in z).
    const cage = new THREE.Group();
    if (flip < 0) cage.rotation.y = Math.PI;
    grp.add(cage);
    // B-RAD rail plate against the tube
    // B-RAD slide rail: a slim plate lying flat along the tube. The geometry is
    // already built standing up (150mm on Y); the two 90° rotations laid it
    // ACROSS the bottle instead, drawing a cross over the bidon.
    const rail = new THREE.Mesh(new THREE.BoxGeometry(8, 150, 22), new THREE.MeshStandardMaterial({ color: 0x151618, roughness: 0.6 }));
    rail.position.set(-44, 60, 0);
    cage.add(rail);
    // cage: alloy spine plate + wrap-around hoop with side-load lips
    const plate = new THREE.Mesh(new THREE.BoxGeometry(7, 92, 30), cageMat);
    plate.position.set(-39, 52, 0);
    cage.add(plate);
    const hoopPts = [
      v3(-36, 84, -20), v3(-10, 84, -38), v3(24, 84, -20),
      v3(38, 84, 0), v3(24, 84, 20), v3(-10, 84, 38), v3(-36, 84, 20),
    ];
    cage.add(tubeAlong(hoopPts, 2.6, cageMat, { segments: 32 }));
    cage.add(tubeBetween(v3(-36, 10, 0), v3(-4, 2, 0), 2.6, 2.6, cageMat, 8));
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(16, 18, 6, 16), cageMat);
    foot.position.y = 2;
    cage.add(foot);
    // Bidon: 750ml is ~73mm across and ~215mm tall, with a rounded base, a
    // slight grip waist, a domed shoulder and a short threaded neck under a
    // push-pull cap. The old profile was a plain straight-sided tube.
    const R = 36.5;
    const prof = [
      new THREE.Vector2(0.5, 0),
      new THREE.Vector2(R * 0.5, 0.5), new THREE.Vector2(R * 0.85, 4), new THREE.Vector2(R, 12),
      new THREE.Vector2(R, 42),
      new THREE.Vector2(R * 0.955, 62), new THREE.Vector2(R * 0.945, 80), new THREE.Vector2(R * 0.975, 98), // waist
      new THREE.Vector2(R, 118),
      new THREE.Vector2(R * 0.99, 140), new THREE.Vector2(R * 0.93, 156),
      new THREE.Vector2(R * 0.74, 172), new THREE.Vector2(R * 0.52, 183),   // shoulder
      new THREE.Vector2(R * 0.40, 190), new THREE.Vector2(R * 0.40, 198),   // neck
    ];
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: colorHex, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35, envMapIntensity: 0.45,
    });
    const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), bodyMat);
    body.position.y = 6;
    body.castShadow = true;
    grp.add(body);
    // moulded rib where the grip waist starts, so the silhouette reads as plastic
    for (const ry of [66, 94]) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(R * 0.955, 1.1, 6, 30), bodyMat);
      rib.rotation.x = Math.PI / 2;
      rib.position.y = 6 + ry;
      grp.add(rib);
    }
    const capMat = new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.5 });
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.46, R * 0.46, 9, 24), capMat);
    collar.position.y = 6 + 200;
    grp.add(collar);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.42, R * 0.47, 13, 24), capMat);
    cap.position.y = 6 + 210;
    grp.add(cap);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.17, R * 0.24, 11, 16), capMat);
    nozzle.position.y = 6 + 222;
    grp.add(nozzle);
    grp.position.copy(base);
    grp.quaternion.setFromUnitVectors(v3(0, 1, 0), dir);
    bottles.add(grp);
    bottleMounts[key] = { group: grp, dir: dir.clone(), base: base.clone(), offset: 0, hidden: false, bodyMat };
  }
  // perpOffset is measured from the TUBE CENTRELINE, and the cage/rail stack
  // reaches back to local x ≈ −48, so anything less than tubeR + 48 buries the
  // cage (and most of the bottle) inside the tube. It used to be tubeR + 6.
  const CAGE_BACK = 41;
  bottle('st', v3(P.sd.x, P.sd.y), 175, stR + CAGE_BACK, 1, BOTTLE_COLORS[0]);
  bottle('dt', dtHead.clone().normalize(), 300, dtR2 + CAGE_BACK, -1, BOTTLE_COLORS[1]);
  F.add(bottles);
  /** Slide a bottle along its tube (negative = toward the BB). B-RAD style. */
  function slideBottle(key, mmOffset) {
    const m = bottleMounts[key];
    if (!m) return;
    m.offset = mmOffset;
    m.group.position.copy(m.base).addScaledVector(m.dir, mmOffset);
  }

  /** Recolour a bidon. `key` is 'st' | 'dt'; hex is a number like 0x6fa892. */
  function setBottleColor(key, hex) {
    const m = bottleMounts[key];
    if (m) m.bodyMat.color.setHex(hex);
  }

  // ---- Contact shadows ---------------------------------------------------
  const csTex = contactShadowTexture();
  for (const axle of [P.rearAxle, P.frontAxle]) {
    const cs = new THREE.Mesh(
      new THREE.PlaneGeometry(760, 360),
      new THREE.MeshBasicMaterial({ map: csTex, transparent: true, opacity: 0.42, depthWrite: false })
    );
    cs.rotation.x = -Math.PI / 2;
    cs.position.set(axle.x, axle.y - P.tireR - g.tireWidth / 2 + 2, 0);
    cs.renderOrder = 1;
    F.add(cs);
  }

  // ---- Mount anchors -----------------------------------------------------
  const anchors = {};
  function anchor(name, pos, ry = 0) {
    const o = new THREE.Object3D();
    o.position.copy(pos);
    o.rotation.y = ry;
    o.name = `anchor:${name}`;
    F.add(o);
    anchors[name] = o;
    return o;
  }
  anchor('seatpack', v3(P.saddlePos.x - 58, saddleTopY - 68, 0));
  anchor('saddlebag', v3(P.saddlePos.x - 58, saddleTopY - 68, 0));
  anchor('barroll', v3(P.barCenter.x + 45, P.barCenter.y - 35, 0));
  anchor('randobag', v3(P.barCenter.x + 60, P.barCenter.y - 90, 0));
  anchor('toptube', ttHead.clone().add(v3(45, ttR, 0)));
  // Rear top-tube bags (Andrew The Maker's Rear TT Sack, Revelate Jerrycan)
  // mount at the SEAT-TUBE end of the top tube, not up by the stem.
  anchor('toptubeRear', ttSeat.clone().add(v3(70, ttR, 0)));
  anchor('stemL', v3(P.barCenter.x - 48, P.barCenter.y - 16, -80));
  anchor('stemR', v3(P.barCenter.x - 48, P.barCenter.y - 16, 80));
  const fbCentroid = v3((0 + P.seatTop.x + P.headBottom.x + P.headTop.x) / 4, (0 + P.seatTop.y + P.headBottom.y + P.headTop.y) / 4);
  anchor('framebag', fbCentroid);
  const dtDir = dtHead.clone().normalize();
  // Mid-tube, not 70% toward the head: the down tube runs ~610mm, so anchoring
  // at 430 left a 440mm pack overhanging into the front wheel with nowhere to go.
  anchor('downtube', dtDir.clone().multiplyScalar(310).add(v3(0, -dtR2 - 12, 0)));
  anchor('forkL', v3(P.frontAxle.x - 28, P.frontAxle.y + 148, -62));
  anchor('forkR', v3(P.frontAxle.x - 28, P.frontAxle.y + 148, 62));
  anchor('rackTop', v3(P.rearAxle.x - 10, rearRackTopY(P, g), 0));
  anchor('pannierL', v3(P.rearAxle.x - 25, P.rearAxle.y + 150, -95));
  anchor('pannierR', v3(P.rearAxle.x - 25, P.rearAxle.y + 150, 95));
  anchor('basket', v3(P.frontAxle.x - 15, P.frontAxle.y + 362, 0));

  // Main-triangle boundary as TUBE CENTRELINES, walked seat-tube → top tube →
  // head tube → down tube. Bag builders offset each edge by that tube's own
  // radius (frameEdgeR below). The previous version mixed hand-tuned surface
  // offsets into the points, which left frame bags buried in the down tube at
  // one corner and 30mm clear of the seat tube at another.
  const framePoly = [
    v3(10, 6),          // down tube, BB end
    ttSeat.clone(),     // top tube / seat tube junction
    ttHead.clone(),     // top tube, head end
    dtHead.clone(),     // down tube, head end
  ];
  // radius of the tube along edge i (framePoly[i] → framePoly[i+1])
  const frameEdgeR = [stR, ttR, headR, dtR2];

  const rearRack = buildRearRack(P, M, g);
  rearRack.visible = false;
  F.add(rearRack);
  const frontRack = buildFrontRack(P, M);
  frontRack.visible = false;
  F.add(frontRack);

  return {
    group: root,
    frameGroup: F,
    anchors,
    points: P,
    geo: g,
    framePoly,
    frameEdgeR,
    rails,
    bottles,
    rearRack,
    frontRack,
    wheels,
    materials: M,
    bottleMounts,
    slideBottle,
    setBottleColor,
    bottleColors: BOTTLE_COLORS,
    setPaint(name) {
      const def = PAINTS[name];
      if (def) M.paint.color.setHex(def.color);
    },
  };
}

/**
 * Rack deck height. A flat +300 put the deck 56mm BELOW the crown of a 45mm
 * tyre on 622 rims, so the deck's cross-tubes ran straight through the wheel
 * and every pannier hung 56mm too low. Clear the tyre envelope instead.
 * The rackTop anchor uses the same expression — they must not drift apart.
 */
function rearRackTopY(P, g) {
  return P.rearAxle.y + Math.max(300, P.tireR + g.tireWidth / 2 + 55);
}

function buildRearRack(P, M, g) {
  const rack = new THREE.Group();
  rack.name = 'rearRack';
  const topY = rearRackTopY(P, g);
  const x0 = P.rearAxle.x - 150, x1 = P.rearAxle.x + 120;
  for (const side of [1, -1]) {
    const z = side * 70;
    rack.add(tubeBetween(v3(P.rearAxle.x + 2, P.rearAxle.y + 12, side * 68), v3(P.rearAxle.x + 10, topY, z), 5, 5, M.aluDark, 10));
    rack.add(tubeBetween(v3(x1, topY, z), v3(P.rearAxle.x + 155, P.rearAxle.y + 175, side * 22), 4.5, 4.5, M.aluDark, 10));
    rack.add(tubeBetween(v3(x0, topY, z), v3(x1, topY, z), 5, 5, M.aluDark, 10));
    rack.add(tubeBetween(v3(x0 + 30, topY - 90, side * 72), v3(x1 - 10, topY - 90, side * 72), 4, 4, M.aluDark, 10));
  }
  for (const x of [x0, (x0 + x1) / 2, x1]) {
    rack.add(tubeBetween(v3(x, topY, -70), v3(x, topY, 70), 4, 4, M.aluDark, 10));
  }
  return rack;
}

function buildFrontRack(P, M) {
  const rack = new THREE.Group();
  rack.name = 'frontRack';
  const topY = P.frontAxle.y + 360;
  for (const side of [1, -1]) {
    const z = side * 55;
    rack.add(tubeBetween(v3(P.frontAxle.x, P.frontAxle.y + 8, side * 52), v3(P.frontAxle.x - 15, topY, z), 4.5, 4.5, M.aluDark, 10));
  }
  for (const side of [1, -1]) {
    rack.add(tubeBetween(v3(P.frontAxle.x - 150, topY, side * 55), v3(P.frontAxle.x + 110, topY, side * 55), 4.5, 4.5, M.aluDark, 10));
  }
  for (const x of [-140, -50, 40, 100]) {
    rack.add(tubeBetween(v3(P.frontAxle.x + x, topY, -55), v3(P.frontAxle.x + x, topY, 55), 3.5, 3.5, M.aluDark, 10));
  }
  return rack;
}
