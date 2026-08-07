// Seat pack builder (mm-local, parented to the seatpack anchor).

import * as THREE from 'three';
import { v3, deg } from '../../lib.js';
import { addPockets, bungeeArc, daisyChain, drawcordEnd, flapArc, orientArc, reflectiveArc, valveDisc, zipperRun } from '../features.js';
import { rollTop, seamCurve, strapAssembly, taperAndFlatten, widAt, wrapStrap } from '../hardware.js';
import { featuresOf, variantOf } from '../identity.js';
import { hardware, patch, shadowify, soft, webbing } from '../materials.js';

export function buildSeatpack(p, brand, main, accent, ctx) {
  const grp = new THREE.Group();
  const vr = variantOf(brand, p);
  const feats = featuresOf(p);
  // trust the catalogue: caps here are sanity guards, not size levellers
  const len = Math.min(p.mm.len, 720);
  const tailR = Math.min(p.mm.hgt, 260) / 2;
  const noseR = Math.max(tailR * vr.range(0.42, 0.58), 34);
  const widScale = Math.min(Math.min(p.mm.wid, 260) / Math.min(p.mm.hgt, 260), 1.3);
  const shape = feats.shape || 'tapered';
  // real packs are fullest just behind the saddle and shrink from there, and
  // narrow in plan as well (Apidura Expedition quotes 15cm → 5cm nose to tail)
  const belly = vr.range(0.2, 0.3);
  const shoulder = vr.range(0.78, 0.86);    // where the tail starts closing
  const tailWid = vr.range(0.34, 0.46);
  const profileR = (t) => {
    if (shape === 'cylindrical') {
      return t < 0.06 ? tailR * Math.sqrt(t / 0.06) * 0.96 + 2
        : t < shoulder ? tailR
        : tailR * Math.sqrt(Math.max(0, 1 - ((t - shoulder) / (1 - shoulder)) ** 2));
    }
    if (shape === 'wedge') {
      // straight ramp from a slim nose to a square-ish tail
      const r = noseR + (tailR - noseR) * Math.min(t / shoulder, 1);
      return t > shoulder ? r * Math.sqrt(Math.max(0, 1 - ((t - shoulder) / (1 - shoulder)) ** 2)) : Math.max(r, 2);
    }
    if (shape === 'teardrop') {
      // fattest early, drawn out to a fine tail
      const r = t < 0.3 ? noseR + (tailR - noseR) * (t / 0.3) ** 0.6 : tailR * (1 - 0.55 * ((t - 0.3) / 0.7) ** 1.6);
      return Math.max(r, 2);
    }
    if (t < 0.05) return noseR * Math.sqrt(t / 0.05) * 0.96 + 2;
    if (t < belly) return noseR + (tailR - noseR) * ((t - 0.05) / (belly - 0.05)) ** vr.range(0.8, 1.05);
    if (t < shoulder) return tailR;
    return tailR * Math.sqrt(Math.max(0.0, 1 - ((t - shoulder) / (1 - shoulder)) ** 2));
  };
  // A roll closure is not a taper to a point: the body stops where the mouth is
  // and the folds take over. Running the lathe all the way to t=1 buried every
  // fold inside a cone of shell.
  const closure = feats.closure || 'rolltop';
  const bodyEnd = closure === 'rolltop' ? 0.9 : 1;
  const pts = [new THREE.Vector2(0.5, 0)];
  const N = 34;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * bodyEnd;
    pts.push(new THREE.Vector2(Math.max(profileR(t), 0.5), t * len));
  }
  pts.push(new THREE.Vector2(0.5, bodyEnd * len));
  // lathe axis is local +y; the group rotates it to −x, so local +x is world "up"
  const bodyAmp = vr.range(3.2, 4.6);
  const lift = bodyAmp + 1.5; // trim must clear the stuffing, or the shell pokes through
  const lathe = soft(taperAndFlatten(new THREE.LatheGeometry(pts, 44), { len, shoulder, tailWid }), main, {
    amp: bodyAmp, freq: vr.range(0.02, 0.03), seed: vr.seed % 997,
    aoDir: new THREE.Vector3(-1, 0, 0), aoK: 0.8, aoSpan: 0.5,
  });
  lathe.rotation.z = Math.PI / 2; // axis −X: tail behind saddle
  const body = new THREE.Group();
  body.add(lathe);
  // longitudinal panel seams down each side, following the taper
  for (const s of [1, -1]) {
    const sp = [];
    for (let i = 1; i <= 14; i++) {
      const t = (i / 15) * bodyEnd;   // stop with the shell, not past its cut end
      sp.push(v3(-t * len, 0, s * (profileR(t) * widAt(t, tailWid) + 0.6)));
    }
    body.add(seamCurve(main, sp, 1.3));
  }
  body.scale.z = widScale;
  grp.add(body);
  const wm = webbing();
  const hwm = hardware();
  // compression straps: honour the stated count, spread over the body. The
  // buckle rides on the flank, not slung under the belly — a row of buckles
  // dangling below the silhouette is what made these read as barrel hoops.
  const nStraps = feats.compressionStraps ?? 2;
  for (let i = 0; i < nStraps; i++) {
    const t = nStraps === 1 ? 0.55 : 0.34 + (0.42 * i) / Math.max(nStraps - 1, 1) + vr.j(0.02);
    const rr = profileR(t);
    const st = strapAssembly(wm, hwm, {
      r: rr, width: 22, ellipse: widScale * widAt(t, tailWid), angle: deg(-24), tail: i === 0,
    });
    st.rotation.y = Math.PI / 2;
    st.position.x = -t * len;
    grp.add(st);
  }
  // tail closure
  if (closure === 'drawcord') {
    const dc = drawcordEnd(main, hwm, { r: profileR(shoulder) * 0.9, depth: 12 });
    dc.rotation.y = -Math.PI / 2;
    dc.position.x = -len * 0.97;
    dc.scale.x = widScale;
    grp.add(dc);
  } else if (closure === 'zip') {
    grp.add(zipperRun(v3(-len * 0.2, tailR * 0.78, 0), v3(-len * 0.9, tailR * 0.72, 0), hwm, { accentMat: accent }));
  } else if (closure === 'flap') {
    const t = 0.72;
    const fl = flapArc(accent, wm, hwm, { R: profileR(t) + lift, len: len * 0.4, arc: deg(165) });
    orientArc(fl, v3(-1, 0, 0), v3(0, 1, 0));
    fl.position.x = -t * len;
    body.add(fl);
  } else {
    // taperAndFlatten has pinched the tail into a lip; stack the folds off the
    // very end of it, or they sit buried inside the shell and the pack reads as
    // a blunt rounded tube with no closure at all
    const t = bodyEnd;
    // flattening a round mouth makes the lip WIDER than the tube, so size it
    // from the body's own half-width here rather than from the tapered radius
    const cap = rollTop(main, hwm, {
      r: profileR(t), depth: 16, widthScale: widScale * widAt(t, tailWid) * 1.4,
    });
    cap.rotation.y = -Math.PI / 2;  // local +z (fold stack) → world −x, local +x → world +z
    cap.position.x = -t * len;
    body.add(cap);
  }
  if (feats.daisyChains) {
    // sit on the shell at its own station, not at the body's widest radius —
    // referencing tailR left the ladder hovering above a tapering back, and a
    // long span overhung the flattened tail entirely
    const dc = daisyChain(wm, { len: len * 0.3, rows: 2, band: Math.min(tailR * 0.34, 17) });
    dc.position.set(-len * 0.5, profileR(0.5) + lift - 1, 0);
    dc.rotation.z = deg(4);
    grp.add(dc);
  } else {
    const daisy = new THREE.Mesh(new THREE.BoxGeometry(len * 0.28, 3, 20), wm);
    daisy.position.set(-len * 0.5, profileR(0.5) + lift - 2, 0);
    daisy.rotation.z = deg(4);
    grp.add(daisy);
  }
  if (feats.cord) {
    const t = 0.5;
    const lat = bungeeArc(hwm, { R: profileR(t) + lift, arc: deg(84), len: len * 0.4, n: 4 });
    orientArc(lat, v3(-1, 0, 0), v3(0, 1, 0));
    lat.position.x = -t * len;
    body.add(lat);
  }
  if (feats.valve) {
    const vd = valveDisc(hwm);
    vd.position.set(-len * 0.34, tailR * 0.3, tailR * widScale + 1);
    grp.add(vd);
  }
  if (feats.reflective) {
    // on the rear-facing tail panel, which is the surface traffic actually
    // sees — at mid-flank it landed straight across the brand patch
    for (const s of [1, -1]) {
      const t = 0.76;
      const rs = reflectiveArc({ R: profileR(t) * widAt(t, tailWid) + lift, arc: deg(74), width: 16 });
      orientArc(rs, v3(-1, 0, 0), v3(0, -0.2, s));
      rs.position.x = -t * len;
      body.add(rs);
    }
  }
  addPockets(grp, feats, main, hwm, {
    side: (make, i) => {
      const s = i % 2 === 0 ? 1 : -1;
      const t = 0.52 + 0.1 * Math.floor(i / 2);
      const g = make.arc(profileR(t) + lift, Math.min(len * 0.28, 150), deg(74));
      orientArc(g, v3(-1, 0, 0), v3(0, 0.1, s));
      g.position.x = -t * len;
      body.add(g);
    },
    top: (make) => {
      const t = 0.5;
      const g = make.arc(profileR(t) + lift, Math.min(len * 0.26, 140), deg(58));
      orientArc(g, v3(-1, 0, 0), v3(0, 1, 0));
      g.position.x = -t * len;
      body.add(g);
    },
  });
  // Tail UP: a rail-and-post pack is clamped low on the post at the nose and
  // rises toward the rear. (+z rotation drops the tail, so this must be
  // negative — the old comment claimed 'kicks up' while doing the opposite.)
  grp.rotation.z = deg(-11);

  // ---- mounting ----------------------------------------------------------
  // Everything above is built in grp-local mm. The bike's seatpost and saddle
  // rails live in frame coords, so derive the placement from them instead of
  // guessing offsets — a fixed nose X is what left the pack hanging in clear
  // air between the post and the rails.
  const postR = (ctx.geo.seatpostDia || 27.2) / 2;
  const sd = ctx.points.sd;
  const anchorPos = ctx.anchors.seatpack.position;
  // where the seatpost crosses a given frame height
  const postXAt = (yFrame) => ctx.points.seatTop.x + sd.x * ((yFrame - ctx.points.seatTop.y) / sd.y);
  // Hang the pack UNDER the rails. Sitting it on the anchor put the crown of a
  // 300mm-tall pack above the saddle, which no rail-mounted pack does.
  const railY = ctx.rails
    ? (ctx.rails.right[0].y + ctx.rails.right[1].y) / 2
    : anchorPos.y + 46;
  // Hang below the rails, but never so low that the pack fouls the rear tyre —
  // the collision resolver DELETES a bag it cannot place, so an over-eager drop
  // makes the product vanish from the scene rather than merely sit wrong.
  // Clamp lower on the seatpost, not tucked right under the rails — the nose
  // of these packs sits well down the post with the body rising behind it.
  const railTarget = railY - anchorPos.y - profileR(belly) - 62;
  // points.tireR is the tyre's CENTRELINE radius, so the casing reaches a
  // further tireWidth/2 beyond it — using tireR alone under-clears by ~22mm and
  // the pack still fouls the wheel (and gets deleted by the resolver).
  const tyreOuter = ctx.points.tireR + ctx.geo.tireWidth / 2;
  // The pack is tilted tail-down by grp.rotation.z, so its underside keeps
  // falling as it runs back over the wheel. Clearing the tyre at the NOSE is not
  // enough — measure at the station above the rear axle, where the tyre is
  // highest and the droop has already accumulated.
  const tilt = grp.rotation.z;
  const postXHere = postXAt(anchorPos.y);
  const runToAxle = Math.max(0, Math.min(len, postXHere - ctx.points.rearAxle.x));
  const droopAtAxle = runToAxle * Math.tan(tilt);
  const tyreFloor = ctx.points.rearAxle.y + tyreOuter + 18 + profileR(belly)
    + droopAtAxle - anchorPos.y;
  const dropY = Math.min(Math.max(railTarget, tyreFloor), -2);
  grp.position.set(postXAt(anchorPos.y + dropY) - anchorPos.x - postR - 2, dropY, 0);
  grp.userData.noseX = grp.position.x + 30;

  const toLocal = (pFrame) => pFrame.clone().sub(anchorPos).sub(grp.position)
    .applyAxisAngle(v3(0, 0, 1), -grp.rotation.z);
  const postDir = v3(sd.x, sd.y, 0).normalize().applyAxisAngle(v3(0, 0, 1), -grp.rotation.z);
  const postAtLocalY = (ly) => {
    const yFrame = ly + grp.position.y + anchorPos.y;
    return toLocal(v3(postXAt(yFrame), yFrame, 0));
  };
  // Two Hypalon collars clamp the nose to the post. Always drawn: the nose now
  // seats against the post, so these are the join, not a gap-filler.
  for (const dy of [14, -18]) {
    const post = postAtLocalY(dy);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(postR + 4.5, 4.2, 6, 24), wm);
    collar.quaternion.setFromUnitVectors(v3(0, 0, 1), postDir);
    collar.position.set(post.x, dy, 0);
    grp.add(collar);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(9, 13, 15), hwm);
    buckle.position.set(post.x - postR - 4, dy, 0);
    grp.add(buckle);
    // webbing from the collar back onto the pack's nose panel
    const noseX = noseR * 0.25;
    const gap = post.x - postR - noseX;
    if (gap > 2) {
      const web = new THREE.Mesh(new THREE.BoxGeometry(gap + 4, 15, 3.2), wm);
      web.position.set(noseX + gap / 2, dy, 0);
      grp.add(web);
    }
  }
  // Rail straps: exactly two (one per side), each terminating in a loop that
  // closes around the real rail rather than stopping in mid-air.
  //
  // The pack deliberately hangs below the rails (see railTarget), so something
  // has to bridge that gap. On the real packs it is a Hypalon cradle the rail
  // webbing is sewn into, pulled tight — not two bare straps standing in
  // daylight, which is what this drew before and what read as slack:
  //   - the webbing started at 0.72 of the profile radius, i.e. buried inside
  //     the shell, so what showed was only the part in free air;
  //   - `from` and `to` sat at different z, but wrapStrap only rotates its
  //     riser about z, so the strap was drawn on a plane that met neither the
  //     bag nor the rail — a thin stick between the two.
  // Running both ends at the rail's own z puts each strap in a single vertical
  // plane, so it leaves the pack's shoulder and reaches the rail square on.
  const rails = ctx.rails;
  if (rails) {
    const nRail = feats.railStraps ?? 2;
    const perSide = Math.max(1, Math.round(nRail / 2));
    for (const side of [1, -1]) {
      const bar = side > 0 ? rails.right : rails.left;
      for (let i = 0; i < perSide; i++) {
        const f = nRail <= 2 ? 0.45 : 0.3 + 0.35 * i;
        const railPt = toLocal(bar[0].clone().lerp(bar[1], f));
        const tBody = 0.16 + 0.1 * i;
        // Anchor ON the shell, not 28% inside it: the webbing has to visibly
        // bite the bag, or the run reads as a strut that happens to end nearby.
        const from = v3(-tBody * len, profileR(tBody) + lift * 0.3, side * rails.z);
        const to = v3(railPt.x, railPt.y, side * rails.z);
        grp.add(wrapStrap(wm, hwm, { from, to, tubeR: rails.r, width: 20 }));
      }
    }
  }
  const patchT = 0.62;
  const patchZ = profileR(patchT) * widScale * widAt(patchT, tailWid) + lift + 1.5;
  patch(grp, brand, -len * patchT, -tailR * 0.1, patchZ, 74, 0);
  patch(grp, brand, -len * patchT, -tailR * 0.1, -patchZ, 74, Math.PI);
  return shadowify(grp);
}
