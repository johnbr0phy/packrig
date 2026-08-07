# Packrig — next run

What the interrupted agent run was doing, what actually landed, and what is left.

Written 2026-08-07. Companion to `HANDOVER.md` (which is still accurate on
traps and data-pipeline detail — read both).

---

## 1. What was running when the machine died

Session `7cd723c7`, 12:39–13:29 on 7 Aug — about fifty minutes. **25 agents**,
in one wave, on `claude-opus-5`. They wrote **311 MB** of agent logs between
them; the Rockgeist reviewer alone logged 56 MB.

The brief you gave it, in your words:

> comprehensive review of every single 3d model of each bag … against each of
> the different product photos available on the web … if it has zips / straps /
> pockets they need to be in place on the 3d model … understand how to attach it
> in the right direction on the bike without it digging into the frame or the
> wheel … use the unfurled dimensions, the minimum height … while we are doing
> this I want a different group of agents to think about the UI layer on top …
> rethink the UI graphics as if you are a lead Apple / Spotify / Stripe designer

Three kinds of agent were in flight at once:

| Kind | Count | What each was doing |
|---|---|---|
| Brand model reviewers | 19 | Reading maker photos and writing `data/models/<brand>.json` |
| Geometry owners | 3 | Rewriting per-slot builders, each driving headless Chrome via `bagshot.mjs` |
| UI / design | 2 | Design research, then implementing `DESIGN-SYSTEM.md` |
| Infrastructure | 1 | Splitting `src/bags.js` |

**Why it fell over.** Nineteen of those agents were doing image-heavy vision
work — dozens of product photos each, held in context — while three more were
each launching a headless Chrome to render the whole catalogue. That is the
combination to avoid, not the agent count on its own. See §6.

---

## 2. What landed (verified on disk, committed)

- **`src/bags.js` split** — 3,020 lines → a one-line re-export. 13 per-slot
  builders in `src/bags/builders/` over 9 shared modules. This is done and the
  app runs clean on it.
- **`DESIGN-SYSTEM.md`** — 55 KB, v1.0. Tokens, type ramp, motion curves,
  component specs, a deletion list (§10) and a build order (§12). This is a
  specification only: **none of it is implemented.**
- **`data/models/MODEL-SPEC.md`** and **`src/bags/BUILDER-BRIEF.md`** — the
  schema and the geometry brief. Both good; reuse them verbatim.
- **9 of 50 brands reviewed — 380 of 702 products:**

  | Brand | Records | | Brand | Records |
  |---|---|---|---|---|
  | Apidura | 70 | | Tailfin | 39 |
  | Revelate Designs | 62 | | Topeak | 36 |
  | Rockgeist | 48 | | Brooks England | 23 |
  | Ortlieb | 40 | | Oveja Negra | 23 |
  | Restrap | 39 | | | |

- **`render.hgt_cm`** — the mid-flight spec correction separating the published
  dimension from the drawn one. Carried by **110 of 380** records.

---

## 3. What did not land

Checked by reading each agent's log for file writes, not by assuming.

**10 brand agents were spawned and wrote nothing.** They were still reading
photos when the session died — 12 brands, 160 products:

Wizard Works (27) · Miss Grape (22) · Road Runner Bags (19) · Outer Shell (17) ·
Blackburn (16) · Swift Industries (15) · Two Wheel Gear (8) · Venture Handmade (8) ·
Gramm Tourpacking (8) · Andrew The Maker (7) · Nuke Sunrise (7) · Vincita (6)

**29 further brands were never assigned an agent at all** — 162 products.

**`ui-foundation` wrote zero files.** 32 events, all reading. Its scope was
steps 1–2 of `DESIGN-SYSTEM.md` §12: the token block, self-hosted Inter, the
`--scrim-k` scrim-well readback, and the single sheet component with the camera
reframe. Confirmed not started: `src/ui/` does not exist, `assets/fonts/` does
not exist, and `.picker-veil` — which §10 says to delete outright — is still in
both `ui.css` and `ui.js`.

**Three downstream UI agents were never spawned.** `ui-foundation`'s brief
promises an API that "three other agents depend on": the product detail sheet,
the catalogue sheet, and the 3D selection/camera pass. Those are §12 steps 3–5.

**All three geometry agents wrote zero files** — `geo-seatpack`, `geo-framebag`,
`geo-forkstem`. Worth noting *why*: they were started at 13:18–13:21, when only
a handful of `data/models/*.json` existed, and their brief tells them to work
from those records. They were started before their own inputs existed. Sequence
this properly next time (§6).

So every builder in `src/bags/builders/` is **the mechanical output of the split,
not reviewed geometry.** It renders without errors; it has not been checked
against a photo.

---

## 4. Defects measured today

These are real numbers from `tools/bagshot.mjs`, not estimates.

One thing is already fixed: the seat pack **rail straps** now read as webbing
under tension rather than struts in free air. The pack's placement is unchanged
and no clearance moved. Its **silhouette is still wrong** though —
`HANDOVER.md` item 3, a real seat pack is a hard wedge with a squared shoulder
and ours renders as a fat tube; `tailWid` (0.34–0.46) is far too weak.

**Four slots audited in full** (190 products). Nothing is dropped anywhere, so
the resolver is placing everything — these are fidelity problems, not fitment:

| Slot | Products | Dropped | Clash into a non-mount part | Under 15 mm to a tyre | Floating |
|---|---:|---:|---:|---:|---:|
| seatpack | 79 | 0 | 20 | 9 | 0 |
| saddlebag | 44 | 0 | 1 | 1 | 0 |
| stembag | 38 | 0 | 4 | 0 | 1 |
| forkbag | 29 | 0 | 0 | **29** | 5 |

"Floating" means the bag is more than 15 mm from everything it is supposed to
strap to — `BUILDER-BRIEF.md` §3 calls that as wrong as being buried in it.

**The fork bag slot has one bug, not twenty-nine.** Every fork bag is too close
to the front tyre, and **22 of the 29 read *exactly* 9.0 mm** — a bag's size
makes no difference to its clearance. `src/bags/builders/forkbag.js:24` is why:

```js
grp.position.z = side * Math.max(r + 64 - anchorZ, 8);
```

The `r` cancels, so the bag's inner face always lands at the same lateral
offset — `64 - anchorZ` — whatever the product's radius. `64` is a magic number
derived from neither the tyre width (45 mm) nor the fork blade. This is exactly
Rule 1 in `BUILDER-BRIEF.md`, and fixing that one line should move the whole
slot at once. The 5 floating fork bags are the same expression clamping at its
`, 8)` floor.

Worst individual offenders elsewhere: Randi Jo Bartender Plus (stem bag, −8.5 mm
into the top tube), Revelate Terrapin 14L (seat pack, −4.3 mm into the top
tube), Road Runner Drafter (saddle bag, −5.1 mm into the seat tube).

**Not yet audited:** `framebag_full`, `framebag_half`, `toptube`, `downtube`,
`barbag`, `barroll`, `randobag`, `pannier`, `trunk` — 511 products. Budget about
90 minutes to sweep them with `--no-shots`.

**Data quality:** `tools/validate-dims.mjs` flags **25**, `tools/audit-slots.mjs`
flags **15**. Both down a long way from where they were, but not zero.

**Still open from `HANDOVER.md`** (I have not re-verified these):
downtube bag hits the front wheel · drop bars intersect the bar roll · frame
pack taper direction unconfirmed · fork styling never started · 7 bags need a
front basket modelled rather than the bare rack.

---

## 5. The work, in dependency order

**Before spinning up any agents**, two things are worth doing by hand in ten
minutes, because both are one-line changes with slot-wide effects and both will
otherwise be re-discovered independently by several agents:

1. `forkbag.js:24` — the constant lateral offset above. Fixes 29 tyre violations
   and 5 floating bags in one edit.
2. Run the remaining nine slot audits so the geometry agents start with numbers
   instead of spending their first hour generating them.

### Track A — finish the catalogue (blocks Track B)

41 brands, 322 products, no model records. The 12 brands that already had an
agent assigned are the natural first batch since the largest are among them.

Per brand, the agent reads `data/models/MODEL-SPEC.md` and writes exactly one
file, `data/models/<brand-slug>.json`. That isolation is what made this safe to
parallelise — keep it.

Two things the earlier run learned the hard way, both already in the spec:
- **`dims_cm` is the published record; `render.hgt_cm` is what gets drawn.**
  Only 110 of 380 existing records carry it — a backfill pass over the 9 done
  brands is worth one agent on its own.
- Every assertion needs `evidence`. An early automated pass **fabricated** two
  dimensions by back-computing from volume, and both survived until a photo
  caught them.

### Track B — per-slot geometry (needs Track A records for its slot)

`src/bags/BUILDER-BRIEF.md` is the brief and needs no changes. 13 builders; the
earlier run grouped them into 3 agents by slot family, which is the right shape:

| Agent | Files |
|---|---|
| `geo-seatpack` | `seatpack.js`, `saddlebag.js` |
| `geo-framebag` | `framefull.js`, `framehalf.js` |
| `geo-forkstem` | `forkbag.js`, `stembag.js` |
| *(add)* `geo-bar` | `barbag.js`, `barroll.js`, `randobag.js` |
| *(add)* `geo-rear` | `pannier.js`, `trunk.js` |
| *(add)* `geo-tube` | `toptube.js`, `downtube.js` |

Definition of done is already written into the brief: zero CLASH, zero dropped,
eyes on the renders for the largest/smallest/most distinctive products, and the
axis mapping stated in a comment at the top of each builder.

**Which slots can actually start now.** Model-record coverage is uneven, because
the 9 finished brands are not spread evenly across slots. A geometry agent
working a slot at 34% coverage is mostly guessing:

| Slot | Records | Catalogue | Covered |
|---|---:|---:|---:|
| downtube | 10 | 12 | 83% |
| framebag_full | 55 | 77 | 71% |
| toptube | 60 | 100 | 60% |
| barroll | 33 | 56 | 59% |
| trunk | 10 | 17 | 59% |
| framebag_half | 59 | 103 | 57% |
| pannier | 33 | 62 | 53% |
| saddlebag | 23 | 44 | 52% |
| forkbag | 14 | 29 | 48% |
| seatpack | 37 | 79 | 47% |
| randobag | 5 | 11 | 45% |
| barbag | 28 | 73 | 38% |
| stembag | 13 | 38 | 34% |
| toptube_rear | 0 | 1 | 0% |

This is the strongest argument for finishing Track A first.

### Track C — the UI rework (independent of A and B; can run alongside)

Follow `DESIGN-SYSTEM.md` §12 exactly. It is strictly ordered:

1. **Tokens + Inter + the `--scrim-k` scrim well.** Nothing else works without
   §3.3. One agent, and everything waits on it.
2. **The sheet shell** — one component, three widths, rail collapse, dock
   reposition, camera reframe, all on one tick. No veil, ever.
3. **The product detail sheet** (§6.2) — this is the centrepiece of your brief:
   big product image, spec, buy link, size and colourway pickers.
4. **The catalogue sheet + facets** (§6.3).
5. **3D selection/hover + camera reframing** (§6.6, §6.7).
6. **The 14 deletions in §10** — last, but do all of them.

Steps 1 and 2 are one agent and must finish before 3–5 fan out, because 3–5
build against the `openSheet()` contract it defines.

### Track D — the adversarial critic pass (after B)

This is the step that actually found things last time. Session `264b8cd3` ran
one critic per slot family against rendered images — "Critic: seatpack renders",
"Critic: frame bag renders", and so on — and its findings are what became the
`HANDOVER.md` bug list. `shots/critics-r1.json` is the earlier round's output
and shows the format: ranked findings, each with the shot it came from, the
problem, and a concrete fix.

Repeat it once geometry settles, and give each critic a distinct lens rather
than running the same prompt five times.

---

## 6. How to run it on Sunday without killing the machine

The failure was the *mix*, not the number.

- **Never run image-vision agents and Chrome-driving agents at the same time.**
  Brand reviewers hold dozens of photos in context; geometry agents each spawn a
  headless Chrome that renders the full catalogue. Run Track A to completion,
  then Track B.
- **Cap each wave at 5–6 agents.** 19 brand reviewers at once is what produced
  311 MB of logs in fifty minutes.
- **Track C can run in parallel with A** — it touches `src/ui*` and nothing
  else, and it does no rendering.
- **Start the dev server once** (`node tools/serve.mjs`, port 8735) and tell
  every agent it is already running. Several agents each starting their own is a
  known way to get port collisions and orphaned Chromes.
- `bagshot.mjs` is slow: a full-catalogue `--no-shots` pass is roughly **2.5
  hours** for 702 products. Scope it per slot (`--slot seatpack`), and use
  `--brand` while iterating.

A workable Sunday sequence:

```
Wave 1   6 brand reviewers (largest first)          } repeat until
Wave 2   6 brand reviewers                          } 50/50 brands done
Wave 3   1 render.hgt_cm backfill over the 9 done brands
Wave 4   ui-foundation  (steps 1-2, alone)          — can overlap waves 1-3
Wave 5   3 UI agents (detail / catalogue / 3D)      — after wave 4
Wave 6   6 geometry agents, one per slot family
Wave 7   critics, one lens each, against wave 6's renders
```

---

## 7. Commands

```bash
node tools/serve.mjs                       # dev server, port 8735 — start ONCE

node tools/bagshot.mjs --slot seatpack     # renders + mm clearance for a slot
node tools/bagshot.mjs --slot seatpack --no-shots     # numbers only, faster
node tools/bagshot.mjs --brand "Apidura" --name "Saddle Pack" --size 9L

node tools/validate-dims.mjs               # implausible dimensions
node tools/audit-slots.mjs                 # slot misclassification
node tools/audit-fit.mjs                   # what the resolver drops
node tools/_rand.mjs                       # 25x "Surprise me", reports page errors

node tools/apply-verified.mjs && node tools/export-csv.mjs   # after a data pass

node tools/build-pages.mjs                 # -> docs/, then commit+push for Pages
node tools/build-artifact.mjs              # -> build/packrig.html (self-contained)
```

Live site: <https://johnbr0phy.github.io/packrig/> — served from `main` `/docs`,
rebuilt by pushing.

---

## 8. Carried-forward traps

From `HANDOVER.md`, still true:

- `apply-verified.mjs` reads `data/verified/*.json` **alphabetically and later
  files overwrite earlier ones.** Any new correction pass must be forced to load
  last, as `dimfix-*.json` now is.
- **Treat any dimension with no traceable source as suspect.** Two were
  fabricated by back-computing from volume; both were caught only by a photo.
- **Rewrite a dims triple whole, never as two swaps.** Two separate
  axis-transposition bugs came from swapping two of three values.
- **Never hard-code a position or rotation in a builder.** Six-plus visual bugs
  were all this one mistake. Derive from `bike.points` / `anchors` / `geo`.
- Calibrate any new validator threshold against published figures first — the
  old thresholds produced more false failures than the data did (21 of 33 in one
  chunk, 30 of 37 in another).
