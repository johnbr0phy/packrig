import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { v3, deg, tubeBetween, capsuleBetween, disposeObject } from '../lib.js';

/**
 * Ghost rider — a smoked-glass mannequin posed on the bike, shown only in
 * wind-tunnel mode.
 *
 * It is not decoration: a rider is 70-80% of the drag of a loaded bike, and a
 * seat pack / frame bag sits inside the rider's wake. The measurement pass
 * renders this group with an override material to get real occlusion, so the
 * SILHOUETTE is the product. Everything below is a real Mesh with real
 * geometry (one merged mesh, one draw call) — no sprites, no billboards.
 *
 * Everything is in MILLIMETRES: `group` is added to `bike.frameGroup`, which
 * carries the 0.001 scale. +X forward, +Y up, +Z drive side.
 *
 * The pose is solved, not authored. The three contact points come straight off
 * the bike (saddle, hoods, pedals); the body is scaled from `geo.saddleHeight`;
 * and the joints fall out of a two-bone IK solve. Change the frame geometry and
 * the rider re-poses itself.
 */

// ---------------------------------------------------------------------------
// Anthropometrics. Fractions of stature H (Drillis & Contini, the standard
// segment table). Lengths are joint-centre to joint-centre.
// ---------------------------------------------------------------------------
const SEG = {
  thigh: 0.245,        // hip → knee
  shank: 0.246,        // knee → ankle
  foot: 0.152,         // heel → toe (whole foot)
  upperArm: 0.186,     // shoulder → elbow
  forearm: 0.146,      // elbow → wrist
  // Hip joint → GLENOHUMERAL joint. Not the 0.288 trochanter-to-acromion height
  // from the standing table: the shoulder joint sits ~50 mm below the acromion,
  // and using the acromion figure put the head visibly too high.
  trunk: 0.260,
  neck: 0.048,
  headHalfLong: 0.062, // crown-to-chin half height
  headHalfDeep: 0.049, // face-to-back half depth
  headHalfWide: 0.041,
  hipHalfZ: 0.050,     // half the distance between the femoral heads
  shoulderHalfZ: 0.098,// half biacromial, pulled in to the joint centres
};

// Girths — RADII, as fractions of H. Limbs are bodies of revolution; the torso
// and the feet are ellipses, so they carry a separate lateral factor.
const GIRTH = {
  pelvis: 0.046,
  waist: 0.038, chest: 0.050, torsoWide: 1.60,
  thighTop: 0.047, thighBot: 0.030,
  shinTop: 0.033, shinBot: 0.019,
  ankle: 0.021, shoe: 0.027,
  upperArmTop: 0.029, upperArmBot: 0.020,
  forearmTop: 0.023, forearmBot: 0.014,
  hand: 0.022,
  neck: 0.028,
  shoulderYoke: 0.040,
};
// Joints are filled with a ball slightly UNDER the segment radius. Over it and
// the figure reads as a doll with visible ball joints, which is exactly what
// the first pass looked like.
const JOINT_BALL = 0.92;

// A cyclist's saddle height is ~0.883 × inseam (LeMond), and inseam is ~0.45 ×
// stature. Rough on both hops, but it is the only link between the frame and
// the body, so the entire figure hangs off it — a taller frame gets a taller
// rider and the hands still land on the hoods.
const SADDLE_HEIGHT_PER_INSEAM = 0.883;
const INSEAM_PER_STATURE = 0.47;   // crotch height / stature, Drillis & Contini

// The elbow a gravel rider actually holds on the hoods: nearly straight, not
// locked. The torso angle is NOT chosen — it is whatever falls out of the IK
// once the elbow bend is fixed and the hands are pinned to the hoods.
const ELBOW_ANGLE = deg(155);
const TORSO_ANGLE_OK = [deg(33), deg(52)];   // sanity band, warn outside it

// --- constants that mirror expressions inside bike.js -----------------------
// bike.js does not publish these, so they are re-stated here with their source.
// If any of them drifts, the rider drifts with it — see the report note asking
// for `bike.hoods` / `bike.pedals` alongside the existing `bike.rails`.
const SADDLE_SETBACK = 14;    // bike.js: saddleGrp.position.x = saddlePos.x - 14
const SADDLE_TOP_OFF = 30;    // bike.js: saddleTopY = saddlePos.y + 30
const SADDLE_SHELL = 9;       // extrude depth 5 + bevel 8, mesh dropped 4
const CRANK_ANGLE = deg(-12); // bike.js: crankDir = v3(cos(deg(-12)), sin(deg(-12)))
const CRANK_Z = 62;           // crank arm plane
const PEDAL_Z_OFF = 52;       // pedal body outboard of the arm
const HOOD_RISE = 13;         // bike.js's hood capsule runs (34,12)→(92,14) with
                              // r 15.5, so 13 IS its axis. Putting the grip at
                              // +20 sat the hand on top of the hood instead of
                              // around it, which reads as resting on nothing.

// ---------------------------------------------------------------------------
// Two-bone IK. The one piece of maths in this file, used four times: once per
// arm, once per leg, and once for the trunk (where the "elbow" is the shoulder
// and the "hand" is the wrist on the hood).
//
// Given a root, a target and two segment lengths, the joint lies on a circle;
// `hint` picks the point on it — the direction the joint should bulge toward.
// The bones are never stretched: an out-of-reach target is clamped and reported
// so the caller can fix the proportions instead of teleporting a limb.
// ---------------------------------------------------------------------------
function solveTwoBone(root, target, l1, l2, hint) {
  const axis = new THREE.Vector3().subVectors(target, root);
  const dRaw = axis.length();
  const reach = dRaw <= l1 + l2 && dRaw >= Math.abs(l1 - l2);
  const d = THREE.MathUtils.clamp(dRaw, Math.abs(l1 - l2) + 1e-3, (l1 + l2) - 1e-3);
  axis.multiplyScalar(1 / (dRaw || 1));
  // distance from root to the foot of the joint's perpendicular, law of cosines
  const a = (d * d + l1 * l1 - l2 * l2) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  // hint, orthogonalised against the axis: the plane the limb bends in
  const perp = hint.clone().addScaledVector(axis, -hint.dot(axis));
  if (perp.lengthSq() < 1e-6) perp.set(0, 1, 0).addScaledVector(axis, -axis.y);
  perp.normalize();
  const joint = root.clone().addScaledVector(axis, a).addScaledVector(perp, h);
  return { joint, reach, gap: dRaw - (l1 + l2) };
}

/** Chord across a two-bone chain held at a given interior joint angle. */
const chord = (l1, l2, angle) =>
  Math.sqrt(l1 * l1 + l2 * l2 - 2 * l1 * l2 * Math.cos(angle));

/** Interior joint angle of a two-bone chain whose endpoints are `d` apart. */
const jointAngle = (l1, l2, d) =>
  Math.acos(THREE.MathUtils.clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));

export function createRider(bike) {
  const P = bike.points;
  const geo = bike.geo;
  const warnings = [];

  // ---- scale ---------------------------------------------------------------
  const inseam = geo.saddleHeight / SADDLE_HEIGHT_PER_INSEAM;
  const H = inseam / INSEAM_PER_STATURE;
  const L = (k) => SEG[k] * H;
  const R = (k) => GIRTH[k] * H;

  // ---- contact 1: the saddle ----------------------------------------------
  // The shell's top face, then the sit bones on the wide part of it — a rider
  // on the hoods sits ~0.22 of the saddle length behind the shell's centre,
  // not on the widest point (that is the flat-bar/upright position).
  const saddleTopY = P.saddlePos.y + SADDLE_TOP_OFF + SADDLE_SHELL;
  const sitX = P.saddlePos.x - SADDLE_SETBACK - geo.saddleLength * 0.22;
  // Hip height is not a guess either: the pelvis is a capsule lying across the
  // femoral heads, so its underside has to land on the saddle. Height = saddle
  // top + the capsule's own half depth, less a little soft-tissue squash. Pick
  // it any other way and the rider hovers, which is exactly what the first
  // pass did (11 mm of daylight under the seat).
  const PELVIS_SQUASH = 0.9;
  const hipY = saddleTopY + R('pelvis') * PELVIS_SQUASH - 0.005 * H;
  // Femoral head: forward of the sit bones by roughly half a pelvis.
  const hip = v3(sitX + 0.031 * H, hipY, 0);
  const hipFor = (side) => hip.clone().setZ(side * L('hipHalfZ'));

  // ---- contact 2: the hoods ------------------------------------------------
  // barReach is the bar's own forward reach, so the hood grip is one reach
  // ahead of the bar centre; HOOD_RISE lifts it onto the lever body; the
  // lateral position is the bar's half width plus the hook's outward flare.
  const hoodGrip = (side) => v3(
    P.barCenter.x + geo.barReach,
    P.barCenter.y + HOOD_RISE,
    side * (geo.barWidth / 2 + 5)
  );
  // The wrist is behind and above the grip — the hand lies along the hood.
  const wristFor = (side) => hoodGrip(side).add(v3(-0.023 * H, 0.006 * H, 0));

  // ---- contact 3: the pedals ----------------------------------------------
  // The BB is the origin of the frame group, so the pedal is just the crank
  // vector. bike.js holds the cranks at -12°, i.e. drive side just below 3
  // o'clock and non-drive just above 9 — already the asymmetric pose we want,
  // so read it rather than inventing a second one that disagrees with the
  // rendered crank arms.
  const crankAngleFor = (side) => CRANK_ANGLE + (side > 0 ? 0 : Math.PI);
  const pedalFor = (side) => {
    const a = crankAngleFor(side);
    return v3(Math.cos(a) * geo.crankLength, Math.sin(a) * geo.crankLength,
      side * (CRANK_Z + PEDAL_Z_OFF));
  };
  // Shoe frame. The pedal spindle sits under the BALL of the foot, so every
  // other landmark is measured along the sole from there: heel at 0.66 of the
  // foot length back, toe 0.34 forward, ankle joint 0.47 back and standing off
  // the sole. Foot pitch follows the stroke — toes down at the front of the
  // circle, heel down at the back — which is one cosine of the crank angle.
  const footFrame = (side) => {
    const pitch = -deg(10) * Math.cos(crankAngleFor(side));
    const sole = v3(Math.cos(pitch), Math.sin(pitch), 0);
    const up = v3(-Math.sin(pitch), Math.cos(pitch), 0);
    // lift the sole LINE by the flattened shoe's half height so the shoe's
    // underside, not its centreline, is what rests on the pedal
    const ball = pedalFor(side).addScaledVector(up, R('shoe') * 0.8);
    return {
      pitch, sole, up, ball,
      ankle: ball.clone().addScaledVector(sole, -L('foot') * 0.47).addScaledVector(up, 0.033 * H),
      heel: ball.clone().addScaledVector(sole, -L('foot') * 0.66),
      toe: ball.clone().addScaledVector(sole, L('foot') * 0.34),
    };
  };

  // ---- trunk: solved, not chosen ------------------------------------------
  // Hip → shoulder → wrist is a two-bone chain with the shoulder as its joint.
  // Fix the elbow bend, collapse the arm to its chord, and the shoulder (hence
  // the torso angle) is whatever puts the hands on the hoods.
  const armChord = chord(L('upperArm'), L('forearm'), ELBOW_ANGLE);
  const wristMid = wristFor(1).setZ(0);
  const trunkIK = solveTwoBone(hip, wristMid, L('trunk'), armChord, v3(0, 1, 0));
  const shoulderMid = trunkIK.joint;
  const torsoDir = shoulderMid.clone().sub(hip).normalize();
  const torsoAngle = Math.atan2(torsoDir.y, torsoDir.x);
  if (!trunkIK.reach) {
    warnings.push(`trunk+arm cannot span hip→hood (short by ${trunkIK.gap.toFixed(0)}mm)`);
  }
  if (torsoAngle < TORSO_ANGLE_OK[0] || torsoAngle > TORSO_ANGLE_OK[1]) {
    warnings.push(`torso angle ${THREE.MathUtils.radToDeg(torsoAngle).toFixed(1)}° outside 33-52°`);
  }
  const shoulderFor = (side) => shoulderMid.clone().setZ(side * L('shoulderHalfZ'));

  // ---- limbs ---------------------------------------------------------------
  const legs = [], arms = [];
  for (const side of [1, -1]) {
    const hipJ = hipFor(side);
    const foot = footFrame(side);
    const ankle = foot.ankle;
    // The knee tracks forward and very slightly inboard of the pedal — but only
    // slightly: at -0.16 the knee pulled inboard of BOTH the hip and the foot
    // and clipped the top tube by 2 mm. It has to stay between them.
    const legIK = solveTwoBone(hipJ, ankle, L('thigh'), L('shank'), v3(1, 0, -side * 0.06));
    if (!legIK.reach) warnings.push(`${side > 0 ? 'drive' : 'non-drive'} leg short by ${legIK.gap.toFixed(0)}mm`);
    legs.push({
      side, hip: hipJ, knee: legIK.joint, ankle, foot,
      pedal: pedalFor(side),
      knee_deg: THREE.MathUtils.radToDeg(jointAngle(L('thigh'), L('shank'), hipJ.distanceTo(ankle))),
    });

    const sh = shoulderFor(side);
    const wrist = wristFor(side);
    // Elbows drop and flare outboard, which is also what keeps them clear of
    // the bar tops — a hint pointing forward would drive them through the bar.
    const armIK = solveTwoBone(sh, wrist, L('upperArm'), L('forearm'), v3(0, -1, side * 1));
    if (!armIK.reach) warnings.push(`${side > 0 ? 'drive' : 'non-drive'} arm short by ${armIK.gap.toFixed(0)}mm`);
    arms.push({
      side, shoulder: sh, elbow: armIK.joint, wrist, grip: hoodGrip(side),
      elbow_deg: THREE.MathUtils.radToDeg(jointAngle(L('upperArm'), L('forearm'), sh.distanceTo(wrist))),
    });
  }

  // ---- head ---------------------------------------------------------------
  // The neck leaves the shoulders forward and up; the skull is then cranked
  // back toward vertical so the eyes look up the road instead of at the stem.
  const neckBase = shoulderMid.clone().addScaledVector(torsoDir, 0.030 * H);
  const neckDir = v3(Math.cos(deg(38)), Math.sin(deg(38)));
  const headBase = neckBase.clone().addScaledVector(neckDir, L('neck'));
  // 76° rather than vertical: the skull is tipped ~14° forward of upright, which
  // is a rider looking up the road, not one staring at the front hub.
  const headUp = v3(Math.cos(deg(76)), Math.sin(deg(76)));
  const headCenter = headBase.clone().addScaledVector(headUp, L('headHalfLong') * 0.85);

  // ---- build ---------------------------------------------------------------
  const material = new THREE.MeshPhysicalMaterial({
    // `color` FILTERS the transmitted light — three multiplies the refracted
    // sample by it — so a dark base colour renders opaque black no matter how
    // high `transmission` is. That was the first pass's bug. The glass is kept
    // near-white here and the smoke comes from volume attenuation below, which
    // also makes thick parts (torso, thighs) read darker than thin ones.
    color: 0x93a8b8,
    metalness: 0.0,
    roughness: 0.25,
    transmission: 0.85,
    // `thickness` is multiplied by the model scale in-shader, so it is in the
    // group's own millimetres: ~90 mm is a limb's half-diameter.
    thickness: 90,
    ior: 1.34,
    // ...but the attenuation ray it feeds is world-space, so this one is metres.
    attenuationColor: new THREE.Color(0x25353f),
    attenuationDistance: 0.11,
    clearcoat: 0.35,
    clearcoatRoughness: 0.26,
    // Charlie sheen is fresnel-weighted, so it lifts exactly the grazing edge
    // and leaves the middle dark: the silhouette reads against a bright tunnel.
    sheen: 0.85,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0x9cc8ea),
    envMapIntensity: 1.15,
    transparent: true,
    opacity: 1,
    depthWrite: true,
  });

  // Explicit fresnel edge lift on top of the physical shading. `sheen` alone is
  // subtle and `transmission` can be swamped by the composer (GTAO/bloom) or by
  // a background the same value as the body — this guarantees the silhouette is
  // outlined whatever is behind it, which is what makes it read as glass rather
  // than as a grey dummy. The uniform is driven by setOpacity so the rim fades
  // with the body.
  const rimU = { value: 0.9 };
  const rimColorU = { value: new THREE.Color(0xbfe2ff) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = rimU;
    shader.uniforms.uRimColor = rimColorU;
    const before = shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim;\nuniform vec3 uRimColor;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        {
          float rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);
          gl_FragColor.rgb += uRimColor * (rim * uRim);
          gl_FragColor.a = clamp(gl_FragColor.a + rim * uRim * 0.35, 0.0, 1.0);
        }`);
    // a silent no-op here would be worse than a warning: the body would just
    // quietly go back to looking like plastic
    if (shader.fragmentShader === before) console.warn('[ghostRider] rim injection missed its shader chunk');
  };

  const geos = [];
  /** Bake a built mesh into the merge list. `scale` squashes a round part. */
  const bake = (mesh, scale) => {
    if (scale) mesh.scale.copy(scale);
    mesh.updateMatrix();
    mesh.geometry.applyMatrix4(mesh.matrix);
    geos.push(mesh.geometry);
    return mesh.geometry;
  };
  /** Tapered limb segment. Its local +Z stays world +Z whenever a→b lies in
   *  the sagittal plane, which is what lets the torso and feet be flattened. */
  const bone = (a, b, r1, r2, scale) => bake(tubeBetween(a, b, r1, r2, material, 16), scale);
  const ball = (p, r, scale) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), material);
    m.position.copy(p);
    return bake(m, scale);
  };

  // pelvis: one mass across the femoral heads, sitting into the saddle top
  // (this capsule's axis is Z, so its local Z is world −Y: PELVIS_SQUASH is the
  // vertical scale the hip height above was derived from — keep them together)
  bake(capsuleBetween(hipFor(-1), hipFor(1), R('pelvis'), material, 6, 18),
    v3(0.95, 1, PELVIS_SQUASH));
  // Trunk in two tapers through a narrowed waist, elliptical throughout (wider
  // across the bike than deep front-to-back). One straight cone from pelvis to
  // chest is what read as a barrel.
  const waistPt = hip.clone().addScaledVector(torsoDir, L('trunk') * 0.42);
  bone(hip, waistPt, R('pelvis') * 0.96, R('waist'), v3(1, 1, GIRTH.torsoWide * 0.95));
  bone(waistPt, shoulderMid, R('waist'), R('chest'), v3(1, 1, GIRTH.torsoWide));
  // Shoulder yoke, inset by its own radius: a capsule's caps stand proud of its
  // endpoints, so spanning joint-to-joint would put the shoulders a full
  // diameter wider than biacromial.
  const yokeR = R('shoulderYoke');
  const yokeZ = Math.max(1, L('shoulderHalfZ') - yokeR);
  bake(capsuleBetween(v3(shoulderMid.x, shoulderMid.y, -yokeZ), v3(shoulderMid.x, shoulderMid.y, yokeZ),
    yokeR, material, 6, 18), v3(0.9, 1, 1));

  // neck + head
  bone(neckBase, headBase, R('neck') * 1.15, R('neck'));
  {
    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 16), material);
    head.position.copy(headCenter);
    // long axis along headUp, so the skull tips with the gaze
    head.quaternion.setFromUnitVectors(v3(0, 1, 0), headUp);
    bake(head, v3(L('headHalfDeep'), L('headHalfLong'), L('headHalfWide')));
    // Jaw/face mass, forward and below the skull centre. A bare ellipsoid has
    // no front, so nothing tells you which way the rider is looking; this is
    // the cheapest thing that makes the gaze legible in silhouette.
    const faceDir = v3(Math.cos(deg(-8)), Math.sin(deg(-8)));   // forward, slightly down
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), material);
    jaw.position.copy(headCenter).addScaledVector(faceDir, L('headHalfDeep') * 0.34)
      .addScaledVector(headUp, -L('headHalfLong') * 0.36);
    bake(jaw, v3(L('headHalfDeep') * 0.72, L('headHalfLong') * 0.44, L('headHalfWide') * 0.74));
  }

  for (const a of arms) {
    ball(a.shoulder, R('upperArmTop') * JOINT_BALL);
    bone(a.shoulder, a.elbow, R('upperArmTop'), R('upperArmBot'));
    ball(a.elbow, R('upperArmBot') * JOINT_BALL);
    bone(a.elbow, a.wrist, R('forearmTop'), R('forearmBot'));
    // Hand laid ALONG the hood and stopping at its nose. bike.js's hood body
    // runs from barCenter + 34 to + 92 and rises slightly; overshooting it left
    // the hand as a blunt stump hanging in front of the lever, holding nothing.
    const handEnd = a.grip.clone().addScaledVector(v3(1, 0.035, 0).normalize(), 0.013 * H);
    bake(capsuleBetween(a.wrist, handEnd, R('hand'), material, 5, 14), v3(0.85, 1, 1.1));
  }

  for (const l of legs) {
    ball(l.hip, R('thighTop') * JOINT_BALL);
    bone(l.hip, l.knee, R('thighTop'), R('thighBot'));
    ball(l.knee, R('thighBot') * JOINT_BALL);
    bone(l.knee, l.ankle, R('shinTop'), R('shinBot'));
    ball(l.ankle, R('ankle') * JOINT_BALL);
    // shoe: heel to toe along the sole line, flattened vertically. Both ends
    // come off the ball, so the shoe is always parallel to its own sole and
    // sits on the pedal instead of pitching through it.
    bake(capsuleBetween(l.foot.heel, l.foot.toe, R('shoe'), material, 5, 14),
      v3(0.62, 1, 0.95));
  }

  // One merged mesh: the whole body is a single draw call, and the drag pass
  // gets one object to swap a material onto.
  const merged = mergeGeometries(geos, false);
  let body;
  if (merged) {
    for (const g of geos) g.dispose();
    merged.computeBoundingSphere();
    body = new THREE.Mesh(merged, material);
  } else {
    // mergeGeometries returns null if attribute sets ever diverge; still ship a
    // real mesh per part rather than nothing.
    warnings.push('mergeGeometries failed — falling back to one mesh per part');
    body = new THREE.Group();
    for (const g of geos) body.add(new THREE.Mesh(g, material));
  }
  body.name = 'ghostRiderBody';
  // Glass casting a hard opaque shadow reads as a bug, and in the tunnel the
  // rider is a measurement subject, not a lighting subject.
  body.castShadow = false;
  body.receiveShadow = false;

  const group = new THREE.Group();
  group.name = 'ghostRider';       // measure.js looks this up by name
  group.add(body);

  // Scale is the thing most likely to be argued about, so publish it in terms
  // anyone can check against the bike instead of against an opinion. All
  // heights are above the ground the tyres stand on.
  const groundY = P.rearAxle.y - (P.tireR + geo.tireWidth / 2);
  const crown = headCenter.clone().addScaledVector(headUp, L('headHalfLong'));
  const above = (y) => +(y - groundY).toFixed(0);
  const scaleCheck = {
    ground_to_saddle: above(saddleTopY),
    ground_to_bar: above(P.barCenter.y),
    ground_to_hip: above(hip.y),
    ground_to_shoulder: above(shoulderMid.y),
    ground_to_crown: above(crown.y),
    crown_over_saddle_ratio: +((crown.y - groundY) / (saddleTopY - groundY)).toFixed(2),
    thigh_dia_mm: +(2 * R('thighTop')).toFixed(0),
    shoulder_width_mm: +(2 * L('shoulderHalfZ')).toFixed(0),
    bar_width_mm: geo.barWidth,
  };

  const pose = {
    stature_mm: +H.toFixed(0),
    inseam_mm: +inseam.toFixed(0),
    torso_deg: +THREE.MathUtils.radToDeg(torsoAngle).toFixed(1),
    scaleCheck,
    hip: hip.toArray().map((n) => +n.toFixed(1)),
    shoulder: shoulderMid.toArray().map((n) => +n.toFixed(1)),
    head: headCenter.toArray().map((n) => +n.toFixed(1)),
    arms: arms.map((a) => ({
      side: a.side, elbow_deg: +a.elbow_deg.toFixed(1),
      elbow: a.elbow.toArray().map((n) => +n.toFixed(1)),
      wrist: a.wrist.toArray().map((n) => +n.toFixed(1)),
    })),
    legs: legs.map((l) => ({
      side: l.side, knee_deg: +l.knee_deg.toFixed(1),
      knee: l.knee.toArray().map((n) => +n.toFixed(1)),
      ankle: l.ankle.toArray().map((n) => +n.toFixed(1)),
      pedal: l.pedal.toArray().map((n) => +n.toFixed(1)),
      // shoe landmarks, so a contact check can be analytic: a capsule is a
      // lathe with no vertices along its straight section, and probing the
      // sole by nearest-vertex reports a 42 mm gap that is not there
      heel: l.foot.heel.toArray().map((n) => +n.toFixed(1)),
      ball: l.foot.ball.toArray().map((n) => +n.toFixed(1)),
      toe: l.foot.toe.toArray().map((n) => +n.toFixed(1)),
      soleHalfThickness: +(GIRTH.shoe * H * 0.62).toFixed(1),
    })),
    warnings,
  };
  for (const w of warnings) console.warn('[ghostRider]', w);

  return {
    group,
    pose,                          // extra: proportions + solved joints, for tools
    /**
     * 0..1 fade for the tunnel transition.
     *
     * A transmissive material composites the refracted background into its own
     * colour before the alpha blend, so fading `opacity` alone leaves a glass
     * shell that is still visibly bending the scene at a = 0.05. Ramping
     * `transmission` (and the rim sheen) with the fade takes the whole surface
     * out together. `transmission` starts non-zero so the shader is already
     * compiled with the transmission branch — driving it is a uniform write,
     * not a recompile.
     */
    setOpacity(a) {
      const v = THREE.MathUtils.clamp(a, 0, 1);
      material.opacity = v;
      material.transmission = 0.85 * v;
      material.sheen = 0.85 * v;
      rimU.value = 0.9 * v;
      // A mesh faded towards alpha 0 still writes depth, and GTAO reads
      // depth/normals through an override material that ignores opacity — so a
      // body you can no longer see goes on smearing an AO ghost across the
      // scene. That is the trap CONTRACT.md records against the old terrain, and
      // it is reproducible here: leave depthWrite on and the ghost is visible in
      // a render at a = 0. Clearing it once the body is essentially gone is the
      // whole reason these two lines exist.
      //
      // `depthWrite === false` is a statement about TRANSLUCENCY, nothing more.
      // Do not add logic that keys off it as a classification, and do not
      // contort this guard to keep it out of some other module's heuristic.
      //
      // measure.js does have to force this group visible for its pass: three
      // skips invisible objects, so a traversal run while the tunnel is still
      // fading in would measure no rider at all and every bag behind it would be
      // charged for air the rider is actually shielding.
      group.visible = v > 0.002;
      material.depthWrite = v > 0.02;
    },
    dispose() {
      disposeObject(group);
      group.parent?.remove(group);
    },
  };
}
