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

**Why it fell over.** The machine has **8 GB of RAM**. Nineteen of those agents
were doing image-heavy vision work — dozens of product photos each, held in
context — while three more were each launching a headless Chrome that peaks
around **0.76 GB**. With the user's own browser holding ~2.9 GB, there was never
3 GB of headroom to spend. It is the mix and the ceiling, not the agent count on
its own. §6 is the sequencing that keeps inside that budget, and renders are now
serialised by a lock rather than by good intentions.

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

| Slot | Products | Dropped | Clash into a non-mount part | Under 15 mm to a tyre |
|---|---:|---:|---:|---:|
| seatpack | 79 | 0 | 20 | 9 |
| saddlebag | 44 | 0 | 1 | 1 |
| stembag | 38 | 0 | 4 | 0 |
| forkbag | 29 | 0 | 0 | 0 |

Worst individual offenders: Randi Jo Bartender Plus (stem bag, −8.5 mm into the
top tube), Revelate Terrapin 14L (seat pack, −4.3 mm into the top tube), Road
Runner Drafter (saddle bag, −5.1 mm into the seat tube). In the seat pack slot
the 20 clashes are concentrated in Revelate Spinelock and Terrapin, Topeak
Backloader and Backloader X, and Outer Shell Seatpack; the 9 tyre cases bottom
out at 9.1 mm (Bags by Bird Goldback).

> **A correction, and a tool fix.** An earlier version of this document reported
> 29 tyre violations in the fork bag slot, all clustered at exactly 9.0 mm, and
> blamed a hard-coded offset in `forkbag.js:24`. That was wrong. `bagshot.mjs`
> was sampling *every* mesh in the bag, including geometry flagged
> `userData.noCollide` — cargo-cage arms, rack hooks, bar standoffs, the straps
> that wrap a tube. That hardware is supposed to reach into the bike; it is how
> the bag attaches, and `src/bags/resolve.js:59` has always excluded it. What the
> tool was measuring was one cage arm reaching for the fork blade, which is why
> 22 readings were identical.
>
> `bagshot.mjs` now honours `noCollide`, matching the resolver. Re-run: **all 29
> fork bags read 38.9 mm to the front tyre — the slot is clean.** The other three
> slots re-measured *identically*, so their numbers above are unaffected and
> real.
>
> Two lessons worth carrying: a constant reading across many products is a
> signature of the measurement, not the thing measured; and "does the bag touch
> what it mounts to" can no longer be answered from these numbers for
> cage-mounted bags, because the part that does the touching is now excluded.

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

**Before spinning up any agents**, run the nine unaudited slots so the geometry
agents start with numbers instead of spending their first hour generating them,
and so any *tool* problems surface before six agents independently trip over
them — as happened with the `noCollide` bug above.

Two things also worth knowing before assigning brand reviewers (§ Track A):

- **16 of the 41 unreviewed brands have no local product photos at all.** They
  need `node tools/fetch-images.mjs` first, or the agent has nothing to review.
- **Wizard Works is the largest unreviewed brand (27 products) but has only 2
  photos**, because its CDN blocks hotlinking. Do not lead with it despite the
  size; it needs its images sourced another way first.

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

### Track C — the UI rework (phases 5–6; does no rendering)

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

## 6. The run order — do not deviate from this

### The budget you are working inside

This is the whole reason the last run died, so it is worth stating as numbers:

| | |
|---|---:|
| Total RAM on this machine | **8 GB** |
| macOS at rest | ~2 GB |
| The user's own Chrome, typically | **~2.9 GB** |
| **Actually available** | **~3 GB** |
| One `bagshot` render (headless Chrome, measured peak) | **0.76 GB** |

Three geometry agents rendering at once is 2.3 GB of the 3 GB you have, before
counting the agents' own context. That is swap, and swap on this box is death.

### The one rule that is now enforced rather than requested

Renders are serialised by a global lock. **Every agent calls
`tools/bagshot-q.mjs`, never `tools/bagshot.mjs`.** The wrapper takes the lock,
runs one render, releases; everyone else queues and prints
`waiting — pid N has been rendering …`. It breaks the lock automatically if a
holder dies, so a killed agent cannot wedge the queue.

It also holds off when memory is short: below 1.2 GB free it warns, waits up to
three minutes for pages to come back, then proceeds anyway rather than
deadlocking. If you see that warning repeatedly, you have too much else open —
that is the signal to quit Chrome, not to raise the threshold.

`src/bags/BUILDER-BRIEF.md` §3 now says this too, so geometry agents get it from
their own brief without being told.

### Preflight (2 minutes, before any agent starts)

```bash
# 1. Quit your own Chrome. This is the single biggest win — it frees ~2.9 GB.
# 2. One dev server, started once, left running:
node tools/serve.mjs &
# 3. No stale lock or orphaned renderers from a previous run:
rm -rf .bagshot.lock; pkill -f bagshot.mjs; pkill -f "Chrome for Testing"
# 4. Confirm the headroom you actually have:
vm_stat | awk '/free|inactive|speculative/ {gsub("\\.","",$NF); s+=$NF} END {printf "%.1f GB reclaimable\n", s*4096/1073741824}'
```

### Phases — each one finishes before the next begins

**Do these strictly in order.** The gate after each phase is a command, not a
judgement call: if it does not pass, do not start the next phase.

| # | Phase | Agents at once | Renders? | Gate before moving on |
|---|---|---:|---|---|
| 0 | By hand: fix `forkbag.js:24`; sweep the 9 unaudited slots | 0 | yes, serial | `node tools/_rand.mjs` clean |
| 1 | Brand reviews, batch 1 — the 6 largest unreviewed | **3** | no | 6 new files in `data/models/` |
| 2 | Brand reviews, batch 2 | **3** | no | 6 more files |
| 3 | …repeat batches of 3 until all 50 brands are done | **3** | no | 50 files in `data/models/` |
| 4 | `render.hgt_cm` backfill across the 9 original brands | **1** | no | coverage well above 110/380 |
| 5 | `ui-foundation` — DESIGN-SYSTEM §12 steps 1–2 | **1, alone** | no | `src/ui/tokens.css` + `sheet.js` exist; app still boots |
| 6 | UI detail sheet / catalogue sheet / 3D selection | **3** | no | app boots, no page errors |
| 7 | Geometry, slot family per agent | **3** | **yes** | zero CLASH, zero dropped per slot |
| 8 | Critics, one lens each, against phase 7's renders | **3** | no (reads PNGs) | — |

Three agents is the cap, not a target. If anything feels sluggish, run two.

### Why this order and not another

- **Phase 1–3 before phase 7.** Geometry agents work *from* the model records.
  Last time they were launched at 13:18 when barely any existed, and would have
  been guessing even if the machine had survived.
- **Phase 5 alone, before phase 6.** `ui-foundation` defines the `openSheet()`
  contract that all three phase-6 agents build against. Running them together
  means three agents coding against an API that is still moving.
- **Phase 7 last among the builders.** It is the only phase that renders, so it
  gets the machine to itself.
- **Never overlap a vision phase with a render phase.** Brand reviewers hold
  dozens of product photos in context; that plus a Chrome is the exact mix that
  killed the last run.

**The one overlap that is safe:** phase 5 does no rendering and touches only
`src/ui*`, so it can run alongside phases 1–3 if you want the UI moving in
parallel. That takes you to 4 concurrent agents. If you would rather be certain,
just run it in sequence — the whole point of this section.

### If it starts to struggle

```bash
pkill -f bagshot.mjs; pkill -f "Chrome for Testing"; rm -rf .bagshot.lock
```

Nothing is lost. Brand agents write one file each and can be re-run per brand;
geometry agents own one builder each; the lock is rebuilt on next use.

---

## 7. Commands

```bash
node tools/serve.mjs                       # dev server, port 8735 — start ONCE

# ALWAYS the -q wrapper: global lock, one headless Chrome at a time (see §6)
node tools/bagshot-q.mjs --slot seatpack             # renders + mm clearance
node tools/bagshot-q.mjs --slot seatpack --no-shots  # numbers only, faster
node tools/bagshot-q.mjs --brand "Apidura" --name "Saddle Pack" --size 9L

rm -rf .bagshot.lock                       # only if a run was killed mid-render

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
