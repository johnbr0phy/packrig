# Packrig Wind Tunnel — module contract

Every module in `src/aero/` is built against this file. If you need to change an
interface here, say so in your report — do NOT change it unilaterally, five other
modules are being written against it in parallel.

## Rule zero: own your own files

Create only the files assigned to you. Do **not** edit `src/main.js`, `src/ui.js`,
`src/bike.js`, `src/bags/**`, `index.html`, or any other existing file — integration
is done by the lead afterwards. If you need something from an existing module that
isn't exposed, note it in your report rather than patching it.

## Coordinate facts (verified, do not re-derive)

- `bike.group` is the root. `bike.frameGroup` is its child with `scale = 0.001`.
  **Everything inside `frameGroup` is in millimetres**; everything outside is metres.
- `bike.group.position.y` is set by `main.js` so the tyres rest on `y = 0`.
- **+X is forward** (direction of travel). `points.frontAxle.x > points.rearAxle.x`.
  Wind therefore blows in the **−X** direction, hitting the front of the bike first.
- **+Y is up. +Z is the drive side** (the default side camera sits at +Z).
- Yaw angle sweeps rotate the *apparent wind* about the Y axis.
- `bike.points` (mm, from `computePoints`): `rearAxle, frontAxle, headTop, headBottom,
  seatTop, saddlePos, steererTop, barCenter, hd, sd, tireR`. `hd`/`sd` are unit
  direction vectors down the steerer and up the seat tube.
- `bike.geo` is the geometry chart: `chainstay, wheelbase, bbDrop, reach, stack,
  headAngle, seatAngle, headTube, seatTube, saddleHeight, stemLength, spacers,
  barWidth, barReach, barDrop, saddleLength, tireWidth, rimBSD`.
- Bags live at `app.bags.equipped[uiSlot] = { brand, product, mesh, proxy, ... }`.
  `mesh` is parented to `bike.anchors[...]`, i.e. inside `frameGroup` (mm space).
  `proxy` is an array of `THREE.Box3` in the mesh's own local space.

## Units

All aero output is **SI**: areas in m², speeds internally in m/s, power in watts.
Speeds are presented in km/h. Convert at the boundary, never in the middle.

## Module interfaces

### `aero/measure.js` — the measurement engine

```js
export function createAeroMeter({ renderer, scene, bike, bags }) → AeroMeter

AeroMeter = {
  measure(opts?) → AeroResult,   // synchronous, safe to call on kit change
  dispose(),
}

opts = { yaws?: number[], resolution?: number, includeRider?: boolean }

AeroResult = {
  cdaHeadOn:   number,           // m², yaw 0
  cdaWeighted: number,           // m², yaw-probability weighted
  cdaBaseline: number,           // m², the same rig with the luggage off
  byYaw:       [{ deg: number, cda: number }],
  parts:       [{ key, label, cd, cda, cdaWeighted, frontalArea, wakeArea, mergeArea }],
  // key is a uiSlot ('seatpack', 'barroll', …) or one of the reserved keys
  // 'bike' | 'rider' | 'wheels' | 'racks' | 'bottles'. Sum to cdaHeadOn EXACTLY.
  //
  // **`bottles` CAN BE NEGATIVE** and is the only part that can be. A full frame
  // bag stows the bidons out of the wind, and that is a real saving measured
  // against the bare-fixture baseline. Anything summing, sorting or bar-charting
  // parts must expect a negative value — a `cda > 0` filter will silently drop
  // it, which has already happened once in a debug printer.
  //
  // `mergeArea` is the bag-over-frame OVERLAP the merge credit is priced on
  // (occlusion, not contact). Published so the one term that REDUCES a total can
  // be audited rather than trusted.
  // `racks` is CHARGED, not baselined: updateFixtures() raises the rear rack
  // only because a pannier or trunk was fitted, so it is part of the cost of
  // choosing that luggage, not part of the bike you started with. It names no
  // uiSlot — do not ask focus.js to highlight it.
}
```

`cdaBaseline` is measured, not inferred — the engine renders the bodies alone in
the same set of passes. Total is always baseline + bags, and a kit can never
subtract drag; both are permanent assertions in `tools/aero-check.mjs`.

`wakeArea` is how much of that part's silhouette sits in the rig's shadow (0 for
bodies). **For a bag, `cda` is NOT `frontalArea * cd`** — the wake fraction is
discounted by `model.wakeDiscount`. It still is for bodies. That is precisely why
`wakeArea` is published rather than left to be inferred.

### `aero/model.js` — drag coefficients and power

```js
export const RIDE_DEFAULTS = {
  speedKph: 28, riderKg: 78, bikeKg: 11, loadKg: 6,
  crr: 0.006, rhoKgM3: 1.225, driveEff: 0.976, gradePct: 0,
};

export function cdOf(product, brand, slotKey) → number   // the Cd table
export function power({ cda, speedKph, ...ride }) → { aeroW, rollW, gradeW, totalW }
export function speedAtPower({ cda, watts, ...ride }) → number   // km/h
export function compare(baselineCda, loadedCda, ride) → {
  addedW, kphLost, minutesPer100km, pctSlower,
}
export function grade(addedW) → { letter, name, blurb }
export const ASSUMPTIONS = [{ label, value, note }]   // drives the "how this
                                                      // is calculated" block
```

### `aero/flow.js` — the flow field

```js
export function buildFlowField(bike, bags, { yawDeg = 0 } = {}) → FlowField

FlowField = {
  sample(pos: Vector3, out: Vector3) → Vector3,   // metres, world space
  turbulenceAt(pos: Vector3) → number,            // 0..1
  boxes: Box3[],                                  // world-space, metres
  bounds: Box3,
}
```

### `aero/smoke.js` — streaklines

```js
export function createSmoke({ flow, bounds }) → Smoke
Smoke = { group: Object3D, tick(dt), rebuild(flow), setEnabled(b), dispose() }
```

### `aero/rider.js` — the ghost rider

```js
export function createRider(bike) → Rider
Rider = { group: Object3D, setOpacity(a: number), dispose() }
```
`group` is added to `bike.frameGroup`, so build it in **millimetres**.

### `aero/tunnel.js` — mode enter/exit

```js
export function createTunnel(app, { smoke, rider, meter, camera, controls,
                                    composer, passes }) → Tunnel
Tunnel = { enter(), exit(), tick(dt), get active(): boolean }
```
`passes` is `{ gtao, bloom }` from main.js's post chain — the tunnel drops the
GTAO radius and lifts bloom, and must restore both on exit. Omitting it is safe:
those adjustments no-op and everything else still works.

**A trap this module already hit, worth knowing before you write another:** a
mesh faded to fully transparent still writes DEPTH unless you also clear
`depthWrite`. The old terrain's noisy procedural height field kept corrupting
GTAO's depth/normal read after it had visually vanished, baking a blotchy AO
pattern into the flat tunnel floor. Any fade-based module here will hit this.

### `aero/panel.js` — the HUD

```js
export function createAeroPanel({ onSpeedChange, onYawChange, onExit, onHoverPart }) → Panel
Panel = {
  el: HTMLElement,               // caller appends to #ui-root
  update(result: AeroResult, ride, comparison),
  setHighlight(key: string|null),
  dispose(),
}
```

## Shared conventions

- Design tokens live in `src/ui.css` (`--ink`, `--ink-dim`, `--accent` `#e8a848`,
  `--glass-bg`, `--glass-brd`, `--radius`, `--panel-w`). Use them; do not invent
  new colours. New CSS goes in `src/aero/aero.css`.
- three r0.185. Import as `three` and `three/addons/…` (import map, no build step).
- Dispose everything you create — `disposeObject` from `../lib.js` walks a tree.
- Never place geometry by a hard-coded offset. Derive from `bike.points` /
  `bike.geo`. This project's bug history is almost entirely hard-coded offsets and
  swapped axes; see `HANDOVER.md`.
