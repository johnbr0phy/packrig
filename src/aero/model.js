// Drag coefficients and the power maths behind the wind tunnel.
//
// Pure data and arithmetic — no Three.js, no DOM, every function pure. The
// measurement engine supplies real frontal areas measured off the actual
// geometry; this module supplies the coefficients those areas get multiplied
// by, and turns the resulting CdA into watts, km/h and minutes.
//
// Every coefficient in here is sourced and argued in ./CD-TABLE.md. If you
// change a number, change the reasoning next to it too — the credibility of
// the whole feature rests on that document being true.

// ---- physical constants --------------------------------------------------

const G = 9.80665;          // m/s², standard gravity
const KPH = 3.6;            // m/s -> km/h
const R_AIR = 287.058;      // J/(kg·K), specific gas constant for dry air
const P_SEA = 101325;       // Pa, ISA sea-level pressure
const T_SEA = 288.15;       // K, ISA sea-level temperature
const LAPSE = 0.0065;       // K/m, ISA tropospheric lapse rate
const BARO_EXP = 5.25588;   // g·M/(R·L), the ISA pressure exponent

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const num = (x, fallback) => (Number.isFinite(x) ? x : fallback);

/** @type {{speedKph:number, riderKg:number, bikeKg:number, loadKg:number, crr:number, rhoKgM3:number, driveEff:number, gradePct:number}} */
export const RIDE_DEFAULTS = {
  speedKph: 28, riderKg: 78, bikeKg: 11, loadKg: 6,
  crr: 0.006, rhoKgM3: 1.225, driveEff: 0.976, gradePct: 0,
};

// ---- air density ---------------------------------------------------------

/**
 * Air density from temperature and altitude. A mountain pass genuinely changes
 * the answer: 1.225 kg/m³ at sea level falls to ~0.95 at 2500 m, which is a
 * 22% cut in aero drag and a real reason a loaded bike feels different up high.
 *
 * Pressure comes from the ISA barometric formula (which assumes the standard
 * lapse rate above the launch point — good to a percent or so for real days),
 * density then from the ideal gas law at the *actual* temperature, so a cold
 * morning at sea level and a hot afternoon at altitude are both handled.
 */
export function airDensity({ tempC = 15, altitudeM = 0 } = {}) {
  const h = clamp(num(altitudeM, 0), -500, 11000);
  const p = P_SEA * Math.pow(1 - (LAPSE * h) / T_SEA, BARO_EXP);
  const tK = Math.max(200, num(tempC, 15) + 273.15);
  return p / (R_AIR * tK);
}

/**
 * Fill in a ride object's `rhoKgM3` from `tempC` / `altitudeM`. Sugar for the
 * UI's weather controls, so the temperature slider is a one-liner:
 *   ride = rideAt({ ...ride, tempC: 4, altitudeM: 1800 })
 */
export function rideAt(ride = {}) {
  return { ...RIDE_DEFAULTS, ...ride, rhoKgM3: airDensity(ride) };
}

/**
 * Merge caller options over the defaults and settle on a density.
 * Precedence is deliberately boring: an explicit `rhoKgM3` always wins, and
 * only if it is absent do `tempC`/`altitudeM` get used. No hidden magic — a
 * caller that spreads RIDE_DEFAULTS keeps 1.225 unless it says otherwise.
 */
function resolveRide(opts = {}) {
  const r = { ...RIDE_DEFAULTS, ...opts };
  if (!Number.isFinite(opts.rhoKgM3) &&
      (Number.isFinite(opts.tempC) || Number.isFinite(opts.altitudeM))) {
    r.rhoKgM3 = airDensity(opts);
  }
  r.rhoKgM3 = Math.max(0.05, num(r.rhoKgM3, RIDE_DEFAULTS.rhoKgM3));
  r.driveEff = clamp(num(r.driveEff, RIDE_DEFAULTS.driveEff), 0.5, 1);
  r.crr = Math.max(0, num(r.crr, RIDE_DEFAULTS.crr));
  return r;
}

const massOf = (r) => Math.max(1, num(r.riderKg, 0) + num(r.bikeKg, 0) + num(r.loadKg, 0));

// ---- the Cd table --------------------------------------------------------
//
// These are pure coefficients. They are multiplied by GPU-measured frontal
// areas, so nothing in here may assume a size. Two things they DO fold in,
// both documented in CD-TABLE.md:
//
//   1. Shape class — a tapered wedge is not a flat slab.
//   2. Where on the bike the thing sits. The base table is keyed on slot, and
//      the slot IS a position: a fork bag stands in clean air while a seat
//      pack lives in the rider's wake at maybe half the dynamic pressure. The
//      area measurement cannot know that; the coefficient can.
//
// They are referenced to the part's MARGINAL frontal area — the silhouette it
// adds that was not already blocked by the bike or rider — because that is
// what makes `parts` sum to the whole-bike CdA. See CD-TABLE.md § Reference
// area, and the note in the report to the lead.

/**
 * Reserved keys: the bike itself, its wheels, and the rider.
 *
 * Calibrated against the areas `measure.js` actually reports for this model,
 * not against assumed ones: bare frame 0.0675 m², wheels 0.0354 m² head-on.
 * Those two land the bare bike on 0.0909 m², against the ~0.09 m² anchor.
 */
export const BODY_CD = {
  // Frame, fork, bars and cranks are a bundle of round tubes. A lone smooth
  // cylinder at these Reynolds numbers sits near Cd 1.1, but the counted
  // silhouette includes a great deal of tube that is standing in another
  // tube's wake — the down tube behind the front wheel, the seat tube behind
  // the down tube, the whole rear triangle behind all of it. A body in a wake
  // does not pay full price, so the effective coefficient on the counted area
  // is below the textbook cylinder value.
  bike: 0.90,
  // Slightly below the frame, which is the opposite of what you might guess.
  // Head-on a wheel is mostly tyre band — genuinely bluff — but the silhouette
  // also counts 32 spokes and a hub that block far less than their pixels
  // suggest, and the rear wheel sits in the front wheel's wake. Rotational
  // drag, which no silhouette can see, is folded back in here.
  wheels: 0.85,
  // A rider on the hoods. Human bluff-body Cd runs ~0.9 upright and ~0.7 in a
  // deep tuck; the hoods sit between.
  rider: 0.82,
  // Racks. DELIBERATELY equal to `bike` rather than absent: same round alloy
  // tubing, same family, and a distinct number would be judgement with nothing
  // behind it. Two effects roughly cancel — a rack's 10 mm tube sits at a lower
  // Reynolds number than a frame tube, where a smooth cylinder's Cd is if
  // anything higher, while an open rack lattice shields itself less than a
  // frame does.
  //
  // Written out rather than left to fall through, for two reasons. It survives
  // someone later changing `bike` for a bike-specific reason. And without the
  // entry `cdOf(_, _, 'racks')` returns 0.58 — the unknown-slot fallback to a
  // TOP TUBE BAG's coefficient — which is silently wrong for a piece of frame
  // hardware and is exactly the sort of thing that never gets noticed.
  racks: 0.90,
};

/**
 * Base Cd by slot, then by shape class. `default` is what an unclassifiable
 * or missing `features.shape` gets, and is deliberately a little pessimistic —
 * unknown bags should not grade better than known ones.
 */
export const BASE_CD = {
  // NOTE seatpack, toptube_rear and downtube were re-based UPWARD when
  // `wakeDiscount` landed. They used to carry a wake discount inside the Cd —
  // a seat pack read 0.34 where a saddlebag of the same wedge shape read 0.42,
  // and that 0.08 gap WAS the rider's wake. Now that the engine measures
  // shadowed area and prices it explicitly, these must be clean freestream
  // shape coefficients or the wake gets counted twice. See CD-TABLE.md § 9.
  seatpack:      { wedge: 0.42, round: 0.52, box: 0.62, harness: 0.60, default: 0.46 },
  saddlebag:     { wedge: 0.42, round: 0.48, box: 0.56, default: 0.50 },
  barroll:       { wedge: 0.42, round: 0.45, box: 0.58, harness: 0.55, default: 0.46 },
  barbag:        { wedge: 0.52, round: 0.50, box: 0.62, default: 0.58 },
  randobag:      { wedge: 0.60, round: 0.62, box: 0.74, default: 0.70 },
  framebag_full: { frame: 0.26, default: 0.26 },
  framebag_half: { frame: 0.30, default: 0.30 },
  toptube:       { wedge: 0.50, round: 0.52, box: 0.62, default: 0.58 },
  toptube_rear:  { wedge: 0.50, round: 0.52, box: 0.62, default: 0.58 },  // re-based; was shadowed in-Cd
  stem:          { wedge: 0.55, round: 0.56, box: 0.64, default: 0.60 },
  fork:          { wedge: 0.56, round: 0.58, box: 0.70, default: 0.62 },
  downtube:      { wedge: 0.44, round: 0.48, box: 0.56, default: 0.50 },  // re-based; was shadowed in-Cd
  pannier:       { wedge: 0.86, round: 0.80, box: 1.05, default: 1.00 },
  trunk:         { wedge: 0.52, round: 0.56, box: 0.66, default: 0.62 },
};

/**
 * Slot name -> Cd-table key. Accepts both spellings a caller might hold: the
 * ui-slot from `SLOTS` ('stemL', 'pannierR') and the catalogue slot a product
 * record carries ('stembag', 'forkbag'). They differ, and silently missing one
 * would drop a whole slot onto the wrong row of the table.
 */
const SLOT_ALIAS = {
  stemL: 'stem', stemR: 'stem', stembag: 'stem',
  forkL: 'fork', forkR: 'fork', forkbag: 'fork',
  pannierL: 'pannier', pannierR: 'pannier',
  // Racks are one coefficient however the caller spells them.
  rack: 'racks', rearRack: 'racks', frontRack: 'racks',
};
export function cdSlotKey(slot) {
  const s = String(slot || '');
  return SLOT_ALIAS[s] || s;
}

/**
 * Fabric surface modifier, keyed on `brand.fabricKey` (catalog.js derives that
 * from the brand's published fabric string). Small on purpose: on a body whose
 * drag is separation-dominated, surface finish is a second-order effect. What
 * actually differs between these fabrics is how tautly the panel sits between
 * its mounting points — a welded laminate holds its shape, waxed canvas sags
 * and flaps. That is what these few percent really represent.
 */
export const FABRIC_MOD = {
  tpu: 0.97,      // welded TPU laminate: no exposed stitching, holds its form
  xpac: 0.98,     // X-Pac / EcoPak sailcloth laminate: smooth, stiff face
  cordura: 1.00,  // 500–1000D textured nylon — the reference
  waxed: 1.02,    // waxed canvas / cotton duck: heavy weave, sags between mounts
};

/**
 * Feature penalties, additive on Cd. Every one of these is a real drag source
 * — flapping webbing and open cavities genuinely cost watts — but each is kept
 * modest, and the total is capped, so a heavily featured bag cannot run away
 * from its own shape. Argued individually in CD-TABLE.md.
 */
export const FEATURE_PENALTY = {
  daisyChain: 0.030,    // rows of raised webbing loops, each a small bluff step
  bungee: 0.040,        // criss-cross cord standing proud, shedding vortices
  pocketOpen: 0.030,    // external mesh / stretch / open pocket: porous + cavity
  pocketProud: 0.010,   // external zip / slip pocket: a modest applied step
  closureRoll: 0.020,   // a roll-top standing proud as a blunt squared cap
  closureFlap: 0.030,   // flap-and-buckle, with loose strap tails
  closureHarness: 0.045, // exposed cradle, plates and wide bands in the flow
  closureCinch: 0.015,  // drawcord gather: a puckered, untidy end
  strapTail: 0.006,     // per compression strap, for the tail that flaps
};
const PENALTY_CAP = 0.12;   // no bag is more appendage than shape
const POCKET_OPEN_CAP = 0.06;
const POCKET_PROUD_CAP = 0.02;
const STRAP_CAP = 0.020;
const CD_MIN = 0.15, CD_MAX = 1.40;

/**
 * Classify a catalogue `features.shape` string. The strings are free text
 * written by whoever researched the product, so this matches loosely and
 * returns null rather than guessing — an unmatched shape falls back to the
 * slot's own default, which is the safe answer.
 */
export function shapeClassOf(shape) {
  const s = String(shape || '').toLowerCase();
  if (!s) return null;
  // frame first: "half frame, tapered" and "wedge / half frame" are frame bags
  if (/frame|triangl/.test(s)) return 'frame';
  if (/harness|holster/.test(s)) return 'harness';
  if (/wedge|taper|trapezoid|angled/.test(s)) return 'wedge';
  if (/cylind|barrel|oval|round|roll/.test(s)) return 'round';
  if (/box|stake|slab|flat/.test(s)) return 'box';
  return null;
}

const EXTERNAL_POCKET = (face) => {
  const f = String(face || 'side').toLowerCase();
  return !(f === 'internal' || f === 'inside' || f === 'main compartment');
};

/** Penalty from external pockets. `features.pockets` is an array or free text. */
function pocketPenalty(raw) {
  let open = 0, proud = 0;
  if (Array.isArray(raw)) {
    for (const pk of raw) {
      if (!pk || !EXTERNAL_POCKET(pk.face)) continue;
      const type = String(pk.type || 'zip').toLowerCase();
      if (/mesh|stretch|open/.test(type)) open++; else proud++;
    }
  } else if (typeof raw === 'string') {
    // ~45% of records describe pockets in prose instead of the structured
    // array. Only count what the prose says is on the OUTSIDE.
    const s = raw.toLowerCase();
    const outside = /external|outer|side pocket|cargo|exterior/.test(s);
    if (outside) { if (/mesh|stretch|open/.test(s)) open++; else proud++; }
  }
  return Math.min(open * FEATURE_PENALTY.pocketOpen, POCKET_OPEN_CAP) +
         Math.min(proud * FEATURE_PENALTY.pocketProud, POCKET_PROUD_CAP);
}

/**
 * Closure penalty and the label for it. The catalogue's `closure` strings are
 * free prose — "flap with front bungee cord for volume adjustment" — so match
 * loosely but return a fixed label, or the UI ends up printing a sentence
 * where it wants two words.
 */
function closurePenalty(closure) {
  const s = String(closure || '').toLowerCase();
  if (!s) return null;
  if (/harness|holster|cradle/.test(s)) return { label: 'exposed harness', delta: FEATURE_PENALTY.closureHarness };
  if (/flap|buckle/.test(s)) return { label: 'flap and buckle tails', delta: FEATURE_PENALTY.closureFlap };
  if (/roll/.test(s)) return { label: 'roll-top standing proud', delta: FEATURE_PENALTY.closureRoll };
  if (/cinch|drawcord|drawstring/.test(s)) return { label: 'drawcord gather', delta: FEATURE_PENALTY.closureCinch };
  return null;   // zips, magnets and lids sit flush; nothing to charge for
}

/**
 * Full working for one bag's Cd, for the panel's "why" disclosure.
 * `cdOf` is this function's `cd` field and nothing more.
 */
export function cdBreakdown(product, brand, slotKey) {
  const key = cdSlotKey(slotKey);

  if (BODY_CD[key] != null) {
    return { cd: BODY_CD[key], base: BODY_CD[key], slotKey: key, shapeClass: null,
             fabricKey: null, fabricMod: 1, penalties: [], penaltyTotal: 0 };
  }

  const table = BASE_CD[key] || BASE_CD.toptube;   // an unknown slot is a small box
  const f = (product && product.features) || {};
  const cls = shapeClassOf(f.shape);
  const base = (cls && table[cls] != null) ? table[cls] : table.default;

  const penalties = [];
  const add = (label, delta) => { if (delta > 0) penalties.push({ label, delta }); };
  if (f.daisyChains) add('daisy-chain webbing', FEATURE_PENALTY.daisyChain);
  if (f.cord) add('bungee lattice', FEATURE_PENALTY.bungee);
  add('external pockets', pocketPenalty(f.pockets));
  const cl = closurePenalty(f.closure);
  if (cl) add(cl.label, cl.delta);
  const straps = Number.isFinite(f.compressionStraps) ? clamp(f.compressionStraps, 0, 6) : 0;
  add('compression strap tails', Math.min(straps * FEATURE_PENALTY.strapTail, STRAP_CAP));

  const rawTotal = penalties.reduce((s, p) => s + p.delta, 0);
  const penaltyTotal = Math.min(rawTotal, PENALTY_CAP);
  // Scale proportionally when the cap bites, so the breakdown the UI shows
  // still adds up to the number the UI prints.
  if (rawTotal > penaltyTotal && rawTotal > 0) {
    const k = penaltyTotal / rawTotal;
    for (const p of penalties) p.delta *= k;
  }

  const fabricKey = (brand && brand.fabricKey) || 'cordura';
  const fabricMod = FABRIC_MOD[fabricKey] != null ? FABRIC_MOD[fabricKey] : 1;

  // Fabric multiplies the whole surface, appendages included, so it goes last.
  const cd = clamp((base + penaltyTotal) * fabricMod, CD_MIN, CD_MAX);
  return { cd, base, slotKey: key, shapeClass: cls, fabricKey, fabricMod, penalties, penaltyTotal };
}

/** Drag coefficient for a bag in a slot, or for 'bike' | 'wheels' | 'rider'. */
export function cdOf(product, brand, slotKey) {
  return cdBreakdown(product, brand, slotKey).cd;
}

// ---- the frame-bag fairing credit ----------------------------------------
//
// The one genuinely interesting result in bikepacking aero. An empty main
// triangle is not "clean" — it is a hole bounded by round tubes, with air
// spilling through it and two shear layers flapping off the down tube and seat
// tube. A full frame bag caps that hole with an attached, smooth surface, and
// the flow leaves the bike more tidily than it did without it.
//
// The credit is a reduction in the FRAME's drag, not a property of the bag, so
// it cannot live in the bag's Cd — that would be charging one body for another
// body's behaviour, and it would fight the measured area (a low Cd × a real
// area can never go negative). It is returned here as an absolute ΔCdA in m²
// for the caller to apply once, to the reserved `bike` part.
//
// ---- BOTH VALUES ARE ZERO, AND THAT IS THE RESULT, NOT A GAP ----
//
// The credit started at -0.006 as an estimate. It is now zero because the
// experiment was run on the real geometry (Apidura Full Frame Pack, head-on):
//
//     baseline (bags hidden)      0.10433 m²
//     loaded, before any credit   0.10639 m²
//     delta                      +0.00207 m²
//     frame bag's own cost        +0.00235 m²
//     bike part shrink            +0.00028 m²   <- essentially nil
//
// +0.00207 m² is about +0.8 W at 28 km/h. THAT is the "a frame bag is very
// nearly free" result, and it now falls out of measured geometry instead of out
// of a constant chosen to produce it. Applying the -0.002 would have landed the
// net on 0.00007 — suspiciously perfect. The original -0.006 would have made it
// net negative, i.e. the tool claiming a frame bag makes you faster, which is
// exactly the fabricated headline this whole exercise existed to avoid.
//
// Two things worth keeping straight:
//
//   The AREA SWAP barely happens. It was expected to: a frame bag occluding the
//   down tube should move pixels from the `bike` part to the bag. Measured, the
//   bike part gives up 0.00028 m² — nothing. Head-on there is almost no frame
//   behind the bag to swap, because the bag sits in the narrow slot BETWEEN the
//   tubes that form the silhouette rather than in front of them. It is tucked
//   inside the frame, not covering it. (The pipeline is definitely
//   occlusion-aware — the occluded-plate test reads 0.000000 — so this is
//   geometry, not a measurement failure.)
//
//   The FLOW-QUALITY effect is real physics and is deliberately NOT modelled.
//   Capping the triangle does stop air spilling through it and does stop the
//   down tube and seat tube shear layers interacting. But it is below what this
//   rig can resolve: it is smaller than the +0.00207 the measurement already
//   carries, and inventing a number for it would be asserting precision the
//   apparatus does not have. Left unmodelled on purpose, not forgotten.
//
// `fairingCredit()` and its plumbing stay. A zero return is a no-op, and the
// mechanism is here for a future measurement that earns it.
export const FAIRING_CREDIT_M2 = {
  framebag_full: 0,
  framebag_half: 0,
};
/** Floor on how much of the bare frame's drag the credit may remove. */
export const FAIRING_CREDIT_FLOOR = 0.6;

/**
 * ΔCdA (m², negative) to apply to the `bike` part. Pass the equipped ui-slot
 * keys; the two frame bags are mutually exclusive so the largest single credit
 * wins rather than summing — there is no way to fit both and earn both.
 */
export function fairingCredit(slotKeys = [], bikeCda = Infinity) {
  let credit = 0;
  for (const k of slotKeys) credit = Math.min(credit, FAIRING_CREDIT_M2[k] || 0);
  // Never let the credit eat more than a fixed share of the frame's own drag,
  // so a hypothetical tiny-CdA bike cannot be faired into absurdity.
  return Math.max(credit, -Math.abs(bikeCda) * (1 - FAIRING_CREDIT_FLOOR));
}

// ---- yaw weighting -------------------------------------------------------
//
// Real riding almost never happens at zero yaw, and it very rarely happens at
// 20°. This is the probability mass the yaw sweep gets averaged with. The
// shape follows FLO Cycling's published real-world yaw measurements (most time
// under 10°, a long thin tail); the exact five numbers are my own smoothing of
// that shape onto a 5° grid, not their data — see CD-TABLE.md.
export const YAW_WEIGHTS = [
  { deg: 0,  w: 0.30 },
  { deg: 5,  w: 0.27 },
  { deg: 10, w: 0.20 },
  { deg: 15, w: 0.14 },
  { deg: 20, w: 0.09 },
];

// ---- yaw: from projected area to drag along the road ---------------------
//
// `measure.js` renders an orthographic silhouette normal to the APPARENT WIND,
// so what it reports at yaw y is
//
//     A(y) ≈ A_front·cos(y) + A_side·sin(y)
//
// A bicycle has an enormous side profile — a long thin frame and two full wheel
// discs — so that second term dominates fast. Measured on this model, the frame
// silhouette doubles by 20° of yaw and the WHEELS grow four and a half times.
// The projected area really does grow like that; the drag does not, for two
// separate reasons, and without both of them a bare bike appears to triple its
// drag in a crosswind.
//
// (1) THE RESOLUTION. Drag acts along the apparent wind. What the rider has to
//     overcome is its component along the direction of travel, which is a
//     factor of cos(y). This part is exact and is not a judgement call.
//
// (2) THE NEWLY EXPOSED AREA IS NOT AS DRAGGY AS THE FRONT WAS. The extra
//     silhouette that appears at yaw is lengthwise area — tubes turning
//     broadside, wheel discs seen obliquely — and it does not develop
//     bluff-body drag in proportion to its projected area. For a yawed
//     cylinder the independence principle gives a normal force set by the
//     NORMAL velocity component, so force ∝ sin²Λ while projected area ∝ sinΛ:
//     the coefficient referenced to that growing area falls like sin(Λ). This
//     is the standard reason tubular frames and deep sections hold or even
//     reduce drag at yaw instead of ballooning.
//
// So split the silhouette into the head-on face that is still facing the wind
// and the lengthwise area newly revealed, give the second one a reduced
// coefficient σ, and resolve the total onto the travel axis:
//
//     f_head = min(cos y, r)          fraction of A(0) still facing the wind
//     f_side = max(0, r − cos y)      newly revealed lengthwise area
//     yawFactor = cos(y) · [f_head + σ·f_side] / r        where r = A(y)/A(0)
//
// It behaves at every limit worth checking. At y = 0 it is exactly 1. With
// σ = 1 it is exactly cos(y), so nothing can ever be draggier than a fully
// bluff body resolved onto the road. With σ = 0 it is cos²(y)/r, so a part
// whose extra area does nothing costs strictly less as it yaws. A part that
// SHRINKS at yaw because something moved in front of it (r < cos y) takes
// f_side = 0 and simply keeps its own coefficient, which is why the formula
// never inflates an occluded part. And a part hidden at 0° that swings into
// clear air — a seat pack coming out of the bike's shadow — has r → ∞ and
// tends to cos(y)·σ, exactly the coefficient its newly exposed face deserves.
//
// WHAT THIS DOES NOT MODEL: real side force. A tunnel resolves axial force from
// both drag and side force, and for an aerofoil-like section the side force
// tilts forward and can drive axial force NEGATIVE — the sail effect that makes
// deep rims genuinely faster at yaw. Silhouette area carries no information
// about side force, so all of it is folded into σ, which is why σ is an
// effective coefficient rather than a measured one.

/**
 * How draggy a part's newly-exposed lengthwise area is, relative to its own
 * head-on coefficient. 0 = the extra area costs nothing; 1 = it is exactly as
 * bluff as the face it already presented.
 *
 * The magnitudes are engineering judgement, argued per row in CD-TABLE.md. The
 * ORDERING is not really in doubt: porous spoked wheels < tubular frame <
 * soft round luggage < flat-sided luggage < a pannier's slab.
 */
export const YAW_SIGMA = {
  // Two-thirds of the bare bike's yaw growth is wheels, and a spoked wheel seen
  // obliquely is mostly air. The disc-like area it gains generates side force,
  // not axial drag. Lowest in the table by a distance.
  wheels: 0.10,
  // Tubes turning broadside. The independence-principle value Cd_n·sin(Λ)/Cd_0
  // runs 0.11 at 5° to 0.42 at 20°; 0.25 is roughly its yaw-weighted mean, and
  // is nudged up a little because not all of the frame's new area is ideal
  // streamwise tube.
  bike: 0.25,
  // A torso is bluff from any angle and barely grows in silhouette at yaw.
  rider: 0.65,

  pannier: 0.95,        // a flat slab whose side face is its biggest; genuinely bluff
  trunk: 0.70,          // boxy and high, but shorter than a pannier
  randobag: 0.70,       // big square box out front, side face fully exposed
  barbag: 0.55,
  framebag_full: 0.45,  // a long smooth panel; flow stays largely attached along it
  framebag_half: 0.45,
  fork: 0.55,           // no shielding at all out beside the fork legs
  seatpack: 0.50,       // swings out of the bike's shadow as yaw opens
  saddlebag: 0.50,
  toptube: 0.50,
  toptube_rear: 0.50,
  downtube: 0.45,
  stem: 0.45,
  barroll: 0.40,        // a cylinder across the wind stays a cylinder at yaw
  default: 0.55,
};

/**
 * Multiplier on a part's Cd at a given yaw, so the reported CdA is drag along
 * the direction of TRAVEL rather than force on a growing silhouette.
 *
 * @param {number} deg        yaw angle, degrees (sign ignored)
 * @param {string} partKey    ui-slot or 'bike' | 'wheels' | 'rider'
 * @param {number} [areaRatio] A(deg) / A(0) for THIS part, from the engine
 *
 * `areaRatio` is what makes this principled rather than assumed — it lets the
 * factor respond to how much this particular part actually grew. Without it
 * there is no way to tell a pannier's slab from a bar roll's cylinder, so the
 * fallback returns the bare cos(deg) resolution: still a strict improvement on
 * 1, still exact as far as it goes, just missing the shape term.
 */
export function yawFactor(deg, partKey, areaRatio) {
  const y = Math.abs(num(deg, 0)) * Math.PI / 180;
  const c = Math.cos(y);
  const key = cdSlotKey(partKey);
  const sigma = clamp(num(YAW_SIGMA[key], YAW_SIGMA.default), 0, 1);

  // A part with NO area head-on that has some now — a top tube bag completely
  // buried at 0° — has an infinite ratio. Everything it presents is newly
  // exposed lengthwise area, which is the σ limit of the formula below.
  if (areaRatio === Infinity) return c * sigma;
  // No ratio supplied: the caller has not wired it, so fall back to the bare
  // resolution onto the travel axis and skip the shape term.
  if (!Number.isFinite(areaRatio)) return c;

  const r = areaRatio;
  // No area at this yaw either — contributes nothing whatever we return, so
  // just avoid dividing by zero.
  if (!(r > 1e-6)) return c;

  const head = Math.min(c, r);          // still facing the wind
  const side = Math.max(0, r - c);      // newly revealed lengthwise area
  return (c * (head + sigma * side)) / r;
}

// ---- the wake discount ---------------------------------------------------
//
// What a square metre of luggage costs when it sits in the rig's shadow rather
// than in clean air.
//
// The engine measures two areas per bag per yaw — `exposed`, where the bag is
// genuinely the frontmost thing, and `wake`, where a bag pixel is there but
// bike/wheels/rider is in front of it — and charges
//
//     (exposed + wake · wakeDiscount) · Cd · yawFactor
//
// so this function prices exactly one physical thing and does not have to
// reason about which bag is shadowed or by how much. That is all measured.
//
// WHY IT IS NOT ZERO, AND NOT ONE. A body in a wake sees reduced dynamic
// pressure, not zero. Behind a bluff body the mean velocity recovers with
// distance; a seat pack sits close in where recovery is poor, at maybe
// u/U ≈ 0.5–0.7, so q_local/q_∞ ≈ 0.25–0.5. That is the grounded part. Three
// things push the honest number UP from there, and all of them are why these
// values sit at the top of that band rather than the middle:
//
//   - Wake turbulence intensity runs 25–35%, and the mean-square velocity that
//     actually loads the body is above the mean velocity squared.
//   - A body in separated, recirculating flow does not load in proportion to
//     local mean q at all; unsteady vortex impingement does work on it.
//   - The strongest real calibration available is drafting: a cyclist tucked
//     directly behind another still pays 60–75% of solo drag. That is a large
//     body sticking out of the wake core, so a small fully-immersed bag should
//     be cheaper than that — but it bounds how aggressive a discount can be.
//
// The alternative to modelling this is what the tool did before: a seat pack
// behind a rider measured exactly 0.00000 m² and was reported as free. It is
// not free. It is cheap, and it is cheap FOR THIS REASON.
//
// NOT MODELLED, deliberately: a bag can also change the drag of the body
// shielding it, by filling the low-pressure base region behind the rider like a
// boat-tail. That is the same class of effect as the frame-bag fairing credit
// and it could be negative. There is no way to bound it here, and the engine's
// accounting rule (reserved parts are never discounted for being shielded) is
// the right conservative choice. See CD-TABLE.md § 9.

/**
 * Discount at zero yaw, by slot. Two tiers plus a default, because the honest
 * distinction is what is doing the shielding — not which bag it is.
 */
export const WAKE_DISCOUNT = {
  // Tier 1: directly behind the rider's torso, close in, deep in the near wake
  // where the velocity deficit is largest and recovery has barely begun. Set
  // just below the drafting floor rather than at the bottom of the mean-q band
  // — a fully immersed bag should be cheaper than a drafting rider, but not by
  // as much as mean velocity alone suggests, because the three effects above
  // (turbulence, recirculation, unsteady loading) all load it harder than a
  // quiet 0.5·q_∞ would.
  seatpack: 0.65,
  saddlebag: 0.65,
  trunk: 0.68,          // further back and higher, so slightly better recovered
  toptube_rear: 0.68,

  // Tier 2: shadowed only by things that are thin, moving or porous. A frame
  // bag is in the rider's LEG shadow, and the legs are pedalling — it is in
  // clean air for a good fraction of every stroke. A down tube bag hides behind
  // a rotating spoked wheel, which sheds a far weaker wake than a solid body.
  // Bars, arms and fork blades are thin, so their wakes recover fast.
  framebag_full: 0.75,
  framebag_half: 0.75,
  toptube: 0.75,
  stem: 0.75,
  downtube: 0.75,
  fork: 0.75,

  // Outboard and low, at the edge of the rider's wake rather than its core,
  // and partly in the rear wheel's.
  pannier: 0.70,

  // Front bags are rarely shadowed by anything at all; the value only applies
  // to whatever slice of them hides behind bars or a front wheel.
  barroll: 0.80,
  barbag: 0.80,
  randobag: 0.80,

  default: 0.70,
};

/** Yaw at which a shadowed square metre is charged in full. */
export const WAKE_YAW_FULL = 30;

// ---- the merge fraction --------------------------------------------------
//
// The wake discount prices a bag standing in something's shadow. This prices
// the OTHER case: a bag skinned onto something, where the two stop being two
// bodies.
//
// The accounting rule that reserved parts are never discounted for being
// shielded is right for the case it was written for — a bar bag in front of a
// rider who is still there, still displacing exactly as much air. It is wrong
// for a frame bag. A frame bag is laced into the main triangle, in contact with
// the down tube and seat tube along their whole length. Those tubes genuinely
// stop being separate bluff bodies: there is no longer a gap for air to
// accelerate through, no separate pair of shear layers, no tube wake. Bag and
// tube are one object. Charging full price for both is double-counting in the
// opposite direction from the bug the rule fixed.
//
// The physical test is CONTACT, not which body is involved:
//
//   - Skinned on (frame bag, top tube bag, down tube bag): the two merge.
//   - Standing off (bar roll on a harness ahead of the bars, a pannier hanging
//     off a rack, a bag in front of a rider's chest): they do not. Air still
//     flows between them, and both bodies still pay.
//
// So this is the fraction of the BIKE-FRAME area a bag occludes that should
// come off the frame's own bill. It never applies to the rider or the wheels:
// nothing is skinned onto a rider, and a bag near a rotating wheel is
// emphatically not merged with it.
//
// Why it matters right now: under the old accounting a full frame bag measured
// 0.0090 m² of marginal area and cost +0.0023 CdA, and the whole-bike
// experiment agreed (+0.00207 net). Under the new accounting it measures its
// full 0.057 m² own silhouette and costs +0.0143 — six times more — because the
// frame it is stretched over is being charged again underneath it. The wake
// discount only claws back a tenth of that, because most of a frame bag is not
// in shadow at all; it IS the frontmost thing. This is the term that closes
// that gap, and without it the tool will report that frame bags are expensive,
// which the measurement says they are not.
export const MERGE_FRACTION = {
  framebag_full: 0.90,   // laced into the triangle, in contact along every tube
  framebag_half: 0.90,
  toptube: 0.80,         // strapped flush along the top tube
  downtube: 0.80,        // strapped flush under the down tube
  fork: 0.30,            // strapped to a blade or a cage, but standing proud
  stem: 0.25,            // touches the bars, mostly stands clear
  seatpack: 0.20,        // hangs off the rails, largely clear of the seatpost
  saddlebag: 0.20,
  trunk: 0.20,
  pannier: 0.15,         // hangs off a rack, clear of the frame
  barroll: 0.10,         // held forward of the bars on a harness
  barbag: 0.10,
  randobag: 0.10,
  default: 0.20,
};

/**
 * Fraction of the BIKE-frame area a bag occludes that should be removed from
 * the frame's own bill, because bag and tube have merged into one body.
 *
 * Intended use, applied only to overlap with the reserved `bike` part:
 *
 *     bikeArea -= overlapWith(bag) * mergeFraction(bag.slotKey)
 *
 * Never apply it to `rider` or `wheels`. That is the whole point of the rule —
 * it is what keeps a bar bag from deleting the rider it sits in front of.
 *
 * The values are engineering judgement, ordered by how flush the mounting is.
 * The two that matter are the frame bags at 0.90, and that one is close to
 * grounded: a full frame bag is in contact with the tubes along their entire
 * length, and the pre-accounting-change measurement of the same bag on the same
 * frame independently produced the answer this restores.
 */
export function mergeFraction(slotKey) {
  const key = cdSlotKey(slotKey);
  return clamp(num(MERGE_FRACTION[key], MERGE_FRACTION.default), 0, 1);
}

/**
 * The merge give-back as an absolute ΔCdA in m², **capped so that a bag can
 * never become a net aerodynamic gain**. Use this rather than applying
 * `mergeFraction` raw.
 *
 * @param {string} slotKey
 * @param {number} overlapAreaM2  measured bag-over-FRAME overlap, m²
 * @param {number} bagCdaM2       what this bag is being charged, m² CdA
 * @param {number} [bikeCd]       coefficient the frame is priced at
 * @returns {number} m² to subtract from the `bike` part (>= 0)
 *
 * The cap is the point. The frame is priced at Cd 0.90 and a frame bag at 0.25,
 * so an uncapped give-back on a large overlap subtracts more than the bag ever
 * cost and the total goes DOWN when you fit luggage. That is the same
 * net-negative failure the fairing credit was zeroed to avoid, arriving through
 * a different door, and it is worse than being slightly too expensive: a tool
 * that says a frame bag makes you faster discredits every other number on the
 * panel. Merging can take a bag's cost to zero. It cannot take it below.
 */
export function mergeCredit(slotKey, overlapAreaM2, bagCdaM2, bikeCd = BODY_CD.bike) {
  const overlap = Math.max(0, num(overlapAreaM2, 0));
  const raw = overlap * mergeFraction(slotKey) * Math.max(0, num(bikeCd, BODY_CD.bike));
  return Math.min(raw, Math.max(0, num(bagCdaM2, 0)));
}

/**
 * Multiplier in 0..1 on the Cd charged to the SHADOWED fraction of a bag.
 * 1.0 means a shadowed square metre costs what an exposed one does.
 *
 * @param {string} slotKey  same spelling `cdOf` receives; aliases apply
 * @param {number} [yawDeg] apparent yaw, degrees
 *
 * The discount weakens as yaw opens. Note this is NOT the geometric effect of a
 * bag swinging clear of the rider — the engine already measures that, because
 * `wake` area shrinks and `exposed` area grows on its own. This is the separate
 * flow effect: at yaw the wake is blown sideways relative to the bike's axis, so
 * a pixel still geometrically behind the rider sits nearer the shear layer than
 * the wake core, and is loaded harder. The ramp to full price by 30° is a smooth
 * interpolation between two defensible endpoints and is my judgement, not a
 * measured curve.
 */
export function wakeDiscount(slotKey, yawDeg = 0) {
  const key = cdSlotKey(slotKey);
  const d0 = clamp(num(WAKE_DISCOUNT[key], WAKE_DISCOUNT.default), 0, 1);
  const t = Math.min(1, Math.abs(num(yawDeg, 0)) / WAKE_YAW_FULL);
  return clamp(d0 + (1 - d0) * t, 0, 1);
}

/**
 * Yaw-weighted CdA from a measured sweep. `byYaw` is `[{deg, cda}]` at
 * whatever angles the engine actually swept; the curve is sampled by linear
 * interpolation on |deg| so the two need not agree on a grid.
 */
export function weightedCda(byYaw = []) {
  const pts = byYaw
    .filter((p) => p && Number.isFinite(p.deg) && Number.isFinite(p.cda))
    .map((p) => ({ deg: Math.abs(p.deg), cda: p.cda }))
    .sort((a, b) => a.deg - b.deg);
  if (!pts.length) return 0;
  const at = (deg) => {
    if (deg <= pts[0].deg) return pts[0].cda;
    for (let i = 1; i < pts.length; i++) {
      if (deg <= pts[i].deg) {
        const a = pts[i - 1], b = pts[i];
        const t = b.deg === a.deg ? 0 : (deg - a.deg) / (b.deg - a.deg);
        return a.cda + (b.cda - a.cda) * t;
      }
    }
    return pts[pts.length - 1].cda;
  };
  let sum = 0, wsum = 0;
  for (const { deg, w } of YAW_WEIGHTS) { sum += at(deg) * w; wsum += w; }
  return wsum > 0 ? sum / wsum : 0;
}

// ---- power ---------------------------------------------------------------

/**
 * Pedal power to hold a speed:
 *
 *   P = [ ½·ρ·CdA·v³ + Crr·m·g·v + m·g·v·sin(atan(grade)) ] / driveEff
 *
 * Each term is divided by the drivetrain efficiency separately so the three
 * returned components sum exactly to `totalW` and the UI can stack them.
 *
 * The rolling term uses m·g rather than m·g·cos(θ). On a 10% grade that
 * overstates rolling drag by 0.5%, which is an order of magnitude inside the
 * uncertainty on Crr itself, and it keeps the formula the one printed in the
 * "how this is calculated" block.
 */
export function power(opts = {}) {
  const r = resolveRide(opts);
  const cda = Math.max(0, num(opts.cda, 0));
  const v = Math.max(0, num(r.speedKph, 0)) / KPH;
  const m = massOf(r);
  const theta = Math.atan(num(r.gradePct, 0) / 100);

  const aeroW = (0.5 * r.rhoKgM3 * cda * v * v * v) / r.driveEff;
  const rollW = (r.crr * m * G * v) / r.driveEff;
  const gradeW = (m * G * v * Math.sin(theta)) / r.driveEff;

  return {
    aeroW, rollW, gradeW, totalW: aeroW + rollW + gradeW,
    // context the panel wants without having to re-derive it
    cda, speedKph: r.speedKph, speedMs: v, massKg: m, rhoKgM3: r.rhoKgM3,
  };
}

/**
 * Invert `power` for speed: solve A·v³ + B·v = P·driveEff for v.
 *
 *   A = ½·ρ·CdA          B = Crr·m·g + m·g·sin(atan(grade))
 *
 * Newton–Raphson, seeded from min(aero-only, rolling-only) speed. Both of
 * those ignore one resistance term, so both are strictly ABOVE the true root
 * and f is positive there; f is convex for v > 0 (f'' = 6Av), so Newton from
 * above descends monotonically to the root — typically four or five
 * iterations, and it cannot overshoot into a negative root.
 *
 * On a descent steep enough to make B negative that seed is not available, so
 * the bracket is found by doubling instead; and if Newton somehow fails to
 * converge (a pathological ride object), bisection finishes the job.
 */
export function speedAtPower(opts = {}) {
  const r = resolveRide(opts);
  const cda = Math.max(0, num(opts.cda, 0));
  const watts = num(opts.watts, 0);
  const m = massOf(r);
  const theta = Math.atan(num(r.gradePct, 0) / 100);

  const A = 0.5 * r.rhoKgM3 * cda;
  const B = r.crr * m * G + m * G * Math.sin(theta);
  const P = watts * r.driveEff;   // power that actually reaches the road

  // Nothing to solve: no power and no gravity to fall down.
  if (P <= 0 && B >= 0) return 0;
  // No drag term at all — degenerate, but do not divide by zero.
  if (A <= 0) return B > 0 ? (P / B) * KPH : 0;

  const f = (v) => A * v * v * v + B * v - P;

  let v;
  if (P > 0 && B > 0) {
    v = Math.min(Math.cbrt(P / A), P / B);
  } else {
    v = 1;
    for (let i = 0; i < 200 && f(v) < 0; i++) v *= 2;
  }

  let converged = false;
  for (let i = 0; i < 60; i++) {
    const df = 3 * A * v * v + B;
    if (!(Math.abs(df) > 1e-12)) break;
    const dv = f(v) / df;
    const next = v - dv;
    if (!Number.isFinite(next) || next < 0) break;
    v = next;
    if (Math.abs(dv) < 1e-6) { converged = true; break; }
  }

  if (!converged) {
    // Bisection fallback. Bracket by doubling until f flips sign, then halve.
    let hi = 1;
    for (let i = 0; i < 200 && f(hi) < 0; i++) hi *= 2;
    let lo = 0;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) < 0) lo = mid; else hi = mid;
      if (hi - lo < 1e-9) break;
    }
    v = (lo + hi) / 2;
  }

  return Math.max(0, v) * KPH;
}

/**
 * What the luggage costs. Both sides carry the same mass and ride the same
 * road — only CdA differs — so `addedW` isolates drag from weight.
 *
 * `kphLost` is measured at CONSTANT POWER, not constant speed: a rider does
 * not hold 28 km/h and quietly pay more, they hold their effort and go slower.
 * That is the number the ride actually feels, and every other field follows
 * from the two speeds.
 */
export function compare(baselineCda, loadedCda, ride = {}) {
  const r = resolveRide(ride);
  const base = power({ ...r, cda: baselineCda });
  const loaded = power({ ...r, cda: loadedCda });

  const heldW = base.totalW;                  // the effort the rider keeps holding
  const baselineKph = r.speedKph;
  const loadedKph = speedAtPower({ ...r, cda: loadedCda, watts: heldW });

  const safe = (kph) => Math.max(kph, 1e-6);
  const kphLost = baselineKph - loadedKph;
  const minutesPer100km = (100 / safe(loadedKph) - 100 / safe(baselineKph)) * 60;
  const pctSlower = baselineKph > 0 ? (kphLost / baselineKph) * 100 : 0;

  // Identical CdA on both sides leaves floating-point crumbs, and a residue of
  // -1e-16 formats as "-0.0 min". Snap anything below display resolution to a
  // true zero — `Math.abs` catches negative zero itself too.
  const snap = (x) => (Math.abs(x) < 1e-9 ? 0 : x);

  return {
    addedW: snap(loaded.totalW - base.totalW),
    kphLost: snap(kphLost),
    minutesPer100km: snap(minutesPer100km),
    pctSlower: snap(pctSlower),
    // the working, for the panel
    baselineW: base.totalW, loadedW: loaded.totalW, heldW,
    baselineKph, loadedKph, baselineCda, loadedCda,
  };
}

// ---- grading -------------------------------------------------------------
//
// Bands are set at the reference speed below. Added watts scale with v³, so
// the same rig would grade A at a dawdle and D at a sprint; `grade` therefore
// rescales to the reference speed first, which makes the letter a property of
// the RIG rather than of how hard you happen to be riding. It is still purely
// a function of the watts — the bands are just quoted at a fixed speed.
export const GRADE_REF_KPH = RIDE_DEFAULTS.speedKph;

export const GRADES = [
  { letter: 'A+', name: 'Bullet',    maxW: 5,
    blurb: 'The wind cannot tell you are carrying anything. Whether you can is between you and your back.' },
  { letter: 'A',  name: 'Clean',     maxW: 10,
    blurb: 'A real load for almost no money. This is about as well as luggage can be made to behave, so do enjoy it while nobody is asking you to carry a tent.' },
  { letter: 'B',  name: 'Tidy',      maxW: 17,
    blurb: 'Invisible over an afternoon, quietly present by hour six. You will blame the hills, and the hills will accept this, because the hills are used to it.' },
  { letter: 'C',  name: 'Draggy',    maxW: 26,
    blurb: 'You are now paying rent on the volume. Perfectly civil at touring pace; noticeably less funny the moment somebody at the front decides to press on.' },
  { letter: 'D',  name: 'Sail',      maxW: 36,
    blurb: 'Enough drag to rewrite the day’s plan without consulting you. Worth a long look at what is actually catching the wind out there, and a longer one at whether it needs to be.' },
  { letter: 'E',  name: 'Billboard', maxW: 50,
    blurb: 'More of this effort is now spent shoving air out of the way than carrying anything useful. A headwind will feel like a personal remark.' },
  { letter: 'F',  name: 'Barn Door', maxW: Infinity,
    blurb: 'Congratulations: you have built a sail that happens to hold gear. Own it entirely, tell everyone it is for stability, or repack it in the layby like the rest of us.' },
];

/**
 * Letter grade for a drag penalty. `addedW` is the figure `compare` returned
 * at `speedKph`; pass that speed so it can be normalised to the reference.
 */
export function grade(addedW, { speedKph = GRADE_REF_KPH } = {}) {
  const v = Math.max(1, num(speedKph, GRADE_REF_KPH));
  const scaled = Math.max(0, num(addedW, 0)) * Math.pow(GRADE_REF_KPH / v, 3);
  const g = GRADES.find((b) => scaled < b.maxW) || GRADES[GRADES.length - 1];
  return { letter: g.letter, name: g.name, blurb: g.blurb };
}

// ---- what the user cannot see --------------------------------------------
//
// Every input that moves the answer but never appears on screen. The panel's
// "how this is calculated" block renders this array verbatim, so it is the
// user's only route to knowing what they are being told. Keep it complete and
// keep it honest — if a number changes above, change it here.

export const ASSUMPTIONS = [
  {
    label: 'Air density',
    value: `${RIDE_DEFAULTS.rhoKgM3.toFixed(3)} kg/m³`,
    note: '15 °C at sea level. Derived from the ISA barometric pressure formula and the ideal gas law, so the temperature and altitude controls move it for real — 2500 m of altitude cuts aero drag by roughly a fifth.',
  },
  {
    label: 'Rider + bike + load',
    value: `${RIDE_DEFAULTS.riderKg} + ${RIDE_DEFAULTS.bikeKg} + ${RIDE_DEFAULTS.loadKg} kg`,
    note: 'The luggage weight is carried in BOTH the bare and loaded runs, so the watts shown are the cost of the air alone. Carrying the gear costs more on top, and all of that shows up on a climb.',
  },
  {
    label: 'Rolling resistance',
    value: `Crr ${RIDE_DEFAULTS.crr}`,
    note: 'A 40–45 mm gravel tyre at moderate pressure on smooth tarmac. Rough chipseal or a loaded touring tyre is nearer 0.008, and dirt is far worse — but Crr is identical on both sides of the comparison, so it barely touches the drag figure.',
  },
  {
    label: 'Drivetrain efficiency',
    value: `${(RIDE_DEFAULTS.driveEff * 100).toFixed(1)}%`,
    note: 'A clean, well-aligned chain in a middle sprocket. This is the figure used in the standard road-cycling power model; a dirty chain or a heavy cross-chain is worse.',
  },
  {
    label: 'Rider position',
    value: 'On the hoods',
    note: 'Bike and rider together come out near CdA 0.36 m² here. The drops are roughly 0.30, and the rider is by far the largest single object in the picture — every bag on the bike is a small correction to a body.',
  },
  {
    label: 'Yaw weighting',
    value: '0–20°, weighted to the low angles',
    note: 'Crosswind is averaged over a sweep rather than assumed away, weighted 30/27/20/14/9% across 0°, 5°, 10°, 15° and 20°. Real riding spends most of its time under 10° of yaw, and side-heavy loads such as panniers and fork bags cost disproportionately more as that angle opens up.',
  },
  {
    label: 'Crosswind drag',
    value: 'Resolved onto the direction of travel',
    note: 'A bike turned side-on to the wind shows a far bigger silhouette, but it does not gain drag in proportion: the force acts along the wind, not along the road, and the extra area is lengthwise — tubes and spokes seen obliquely — which is much less draggy than the face that was already meeting the air. Both effects are modelled. Flat-sided luggage still gets worse at yaw, which is real; a pannier costs roughly two and a half times as much at 20° as it does head-on.',
  },
  {
    label: 'Frontal areas',
    value: 'Measured off the geometry',
    note: 'Each part’s area is the silhouette it ADDS to the bike — what it blocks that was not already blocked — measured on the GPU from the model you are looking at, not estimated from the catalogue dimensions.',
  },
  {
    label: 'Drag coefficients',
    value: 'A calibrated model, not a measurement',
    note: 'No part of this was measured in a wind tunnel. The coefficients come from standard bluff-body values for the shapes involved, calibrated so that whole-bike results land on published CdA figures for a bare bike, a rider, a bar roll and a set of panniers. Every value and its reasoning is listed in CD-TABLE.md. Treat the ranking of two setups as sound and the absolute watts as an estimate.',
  },
  {
    label: 'Luggage in the rig’s shadow',
    value: 'Charged at 65–80% of clean-air cost',
    note: 'A bag hidden behind you is cheap, not free. A seat pack sits in the rider’s wake where the air is slower and messier, so it is charged a fraction of what the same bag would cost out in clean air — which is exactly why seat packs are the cheapest way to carry volume on a bike. Which pixels are actually shadowed is measured, not assumed, and the discount fades as crosswind blows the wake sideways.',
  },
  {
    label: 'Not modelled',
    value: 'Drafting, gusts, spoke drag detail',
    note: 'Still air, no other riders, and a steady speed. Real wind is unsteady and a gust hits a loaded bike harder than this average suggests.',
  },
];
