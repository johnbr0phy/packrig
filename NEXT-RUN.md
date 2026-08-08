# Packrig — next run

What the interrupted agent run was doing, what actually landed, and what is left.

Written 2026-08-07. Companion to `HANDOVER.md` (which is still accurate on
traps and data-pipeline detail — read both).

> **STATUS, 8 Aug (later) — the catalogue track is DONE and now WIRED.** All 50
> brands are reviewed and **702 of 702** products merge cleanly; the last two
> were Bags by Bird's duplicate "Better Half Framebag" entries and they are
> fixed. Sections 1-4 below describe the state on the night of the crash and are
> kept as the record of what happened; **for what is actually true now, read
> §10, §12 and §13.**
>
> §13 is the new part: the records' `geometry` and rigidity now reach the
> builders, and **every slot has been swept**. Start there — it has the numbers.
>
> Still untouched: the **UI rework** (§5 Track C — `DESIGN-SYSTEM.md` is written
> and none of it is implemented) and **11 of 13 geometry builders** (§5 Track B —
> only seatpack and stembag have been done).

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

| Slot | Products | Dropped | Clashing products | Under 15 mm to a tyre |
|---|---:|---:|---:|---:|
| seatpack | 79 | 0 | **0** (was 13) | **0** (was 9) |
| saddlebag | 44 | 0 | 0 | 1 |
| stembag | 38 | 0 | **0** (was 3) | 0 |
| forkbag | 29 | 0 | 0 | 0 |

**seatpack and stembag are now done** — see §10. saddlebag, forkbag and the nine
unaudited slots are not.

(Counted as distinct *products*. An earlier version of this table counted
clearance *entries*, which double-counts a bag that fouls both the seat tube and
the top tube — seatpack was reported as 20 on that basis, and is 13 bags.)

**These numbers are post-merge**, i.e. after `tools/apply-models.mjs` pushed 113
corrected dimensions into the catalogue. That merge fixed exactly one clash —
the Road Runner Drafter, which went from 5.1 mm *inside* the seat tube to 20.6 mm
clear once its dimensions were corrected — and moved many bags without changing
any other verdict.

**That is the useful result: the remaining seat pack clashes are not data
problems.** Corrected dimensions did not shift them, so they are builder bugs and
belong to Track B, not to another round of catalogue review.

Worst individual offenders now: Randi Jo Bartender Plus (stem bag, −8.5 mm into
the top tube) and Revelate Terrapin 14L (seat pack, −4.3 mm into the top tube).
The 13 seat pack clashes sit in a tight band of −1.7 to −4.3 mm and span
Revelate Spinelock and Terrapin, Rockgeist Mr Fusion, Topeak Backloader, WOHO
XTouring, Zéfal Z Adventure and Altura Vortex — a spread of makers at almost
identical depth, which points at the builder rather than at any one product. The
9 tyre cases bottom out at 9.1 mm (Bags by Bird Goldback).

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
node tools/audit-fit.mjs                   # what the resolver drops (slow: ~10 min)
node tools/audit-exclusions.mjs            # no two excluded slots mounted at once
node tools/_rand.mjs                       # 25x "Surprise me", reports page errors

node tools/apply-models.mjs --dry          # models/ -> brands.json, preview
node tools/apply-models.mjs                # ...then apply; re-run the clearance audits after
node tools/apply-verified.mjs && node tools/export-csv.mjs   # after a data pass
```

---

## 9. Shipping — pushing source is NOT shipping

The live site serves `docs/`, which is a **build artefact**, not the source. A
`git push` of `src/` changes nothing that anyone can see. This was missed for
ten consecutive commits — the whole model merge, the `fits` fix, both geometry
passes and the slot-exclusion fix all sat in the repo while the live site served
a build from hours earlier. It is easy to miss precisely because pushing feels
like the finish line.

```bash
node tools/build-pages.mjs                 # regenerate docs/
git add docs/ && git commit && git push    # this is what deploys
node tools/build-artifact.mjs              # separate: build/packrig.html, for the Artifact
```

**`main`'s `docs/` is not necessarily a build of `main`'s `src/`.** Learned the
expensive way on 8 Aug. Building from a clean worktree pinned to `origin/main`
looks like the careful thing to do when the shared checkout has an unmerged
feature branch in it — but the shipped `docs/aero.css` was already byte-
identical to the *wind-tunnel* tree's `src/aero/aero.css`, because that work had
been deployed from here on purpose. Rebuilding from `origin/main` deleted 105
lines of `aero.css` and 306 of `ui.css` from the live site. **Before you rebuild,
diff the current `docs/` against a build of the tree you are about to build
from**, and if they differ, find out which source produced what is live.

**Verify by hash, not by the API.** GitHub's Pages build record lags — it
reported the previous commit as "latest built" while the new files were already
being served. The hashes are the ground truth:

```bash
diff <(curl -s https://johnbr0phy.github.io/packrig/packrig.js | shasum -a 256) \
     <(shasum -a 256 < docs/packrig.js) && echo "bundle is live"
```

And a hash only proves bytes moved. For anything behavioural, load the live URL
cache-busted and assert on it — `window.__SLOTS`, the equipped set after a
`randomKit`, the product count — the way `tools/audit-exclusions.mjs` does
locally.

Live site: <https://johnbr0phy.github.io/packrig/> — `main` `/docs`.
Artifact: same app bundled to a single self-contained file, updated separately.

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

---

## 10. Done since this document was written

Recorded so the next run does not redo it.

**Catalogue — 22 of 50 brands, 521 of 702 products.** Added Miss Grape, Road
Runner, Blackburn, Swift, Outer Shell, Venture, Gramm, Nuke Sunrise, Andrew The
Maker, Alpkit, JPaks, Randi Jo and Atelier Velocidade, all by Sonnet reviewers
against local photos. Not all `verified: true` — the small-maker tail genuinely
does not publish dimensions, and those records say so rather than guessing.

**`tools/apply-models.mjs`** — the missing link. Nothing in `src/` read
`data/models/`, so 113 corrected dimensions and 110 `render.hgt_cm` values had
never reached the app. `catalog.js` now draws from `render.hgt_cm` where present.

**Three brand `fabric` strings were wrong** (Blackburn, Swift, Atelier) out of
nine checked. That field substring-selects the rendered material, so one wrong
word renders a whole brand in the wrong stuff. Worth checking for every brand.

**`fits` filtering** hid 37 products where it should have hidden 7 — `rack_only`
is a pannier, and the bike has a rack. `catalog.js` now tests an explicit
`CANNOT_FIT` set.

**`bagshot.mjs` now honours `noCollide`**, matching `resolve.js`. It had been
measuring cargo-cage arms and rack hooks as if they were bag body, which
invented 29 fork-bag tyre violations that did not exist.

**stembag** took no bike reference at all and hung off its anchor with no lateral
offset. Now derives the offset from `frameEdgeR[2]`. 30/38 → 38/38 clean.

**seatpack** silhouette: the code held a constant radius across 55-65% of the
bag — the fat tube. Now a continuous taper, shallow at the post and deepest at
the raised tail (**that direction matters and I had it backwards once**; a
`geometry` block in `data/models/apidura.json` describes it nose-to-tail
reversed, so do not trust those blocks blindly). Needed three new placement
clamps: post lean across the nose face, the tilt swinging the nose forward, and
a frame floor at `framePoly[1]`. 13 clashing → 0, 9 tyre → 0.

**seatpack/trunk exclusion** — `trunk` declared `excludes: []`, so a rack trunk
could sit inside a seat pack. `tools/audit-exclusions.mjs` now guards every pair
in the table and refuses to pass vacuously.

**`tools/bagshot-q.mjs`** serialises renders behind a lock so concurrent
geometry agents cannot put an 8 GB machine into swap.

### Still open
- The seat pack renders ~49 cm against a 42 cm spec — mostly collars and webbing
  reaching to the post, but over the brief's tolerance.
- The trunk builder draws bags that overhang the rack at both ends.
- `geometry.taper` / `form` in the model records is richer than anything the
  builders read. Wiring it through would replace several `vr.range()` guesses
  with measured values — the brief's "variation driven by the data" requirement.
- 16 brands have no photos **and** no image URLs; they need a sourcing pass
  before review is possible at all.


---

## 11. RESOLVED — Carradice axes

Was a hold; settled 8 Aug and merged.

The reviewer went back to the maker's own studio photos plus an independent
BikeRadar review of the Camper ("fairly deep (23cm)", matching Carradice's own
D=22 and not its W=36), which established that Carradice's "W x H x D" means
**W across the bike, D fore-aft**, consistently across the line.

The contradiction was a real bug, and in its own work rather than in the data. It
had been treating `len` as "always the fore-aft axis". MODEL-SPEC defines `len`
as *the bag's longest horizontal run along its own body* — whichever of W/D is
numerically larger — with `mount.axes` separately recording which world direction
that longer axis points.

- **Nelson** (len 44 → `-x`) and **Barley** (29 → `-x`) are genuinely deep
  fore-aft; both were already right.
- **Camper** (36) and **SQR Slim** (29) are genuinely wide across the bike, and
  both were mapping their dominant axis to `-x` — a suitcase sticking out behind
  the saddle, the exact `buildSaddlebag` bug. Corrected to `z`.

I had guessed Nelson was the risk. It was Camper and SQR Slim. Worth remembering
that `len >= wid` holding in a file says nothing about whether `mount.axes` is
right — the two are independent, and only the axes block decides orientation.

> **REOPENED and settled again, 8 Aug.** This section was half right and the
> half it got wrong sat undetected because **nothing read `mount.axes`**, so no
> conclusion it reached could show up on screen either way.
>
> It established the family convention — Carradice publish W × H × D with W
> across the bike — and then exempted the Nelson and Barley from it, calling
> them "genuinely deep fore-aft" and leaving their largest figure on `-x`. The
> moment `saddlebag.js` started reading the block, the Nelson rendered as a
> 44 cm-deep suitcase behind the saddle.
>
> Both evidence photos settle it: a Carradice side **pocket** faces the camera
> when the camera is beside the bike, and that can only happen if the pockets
> sit at the two ends of an axis running **across** the bike. Nelson and Barley
> are now `len: z`, matching the Camper and the SQR Slim. The whole line is
> consistent, which is what the convention implied all along.
>
> The lesson is not about Carradice. **A conclusion about data that no code
> reads cannot be wrong yet** — it has nothing to be wrong against. Expect more
> of these as the remaining builders start reading the blocks they were given.

---

## 12. What the overnight catalogue run learned

**Run `node tools/apply-models.mjs --dry` BEFORE committing a brand, not after.**
Three separate silent drops happened tonight because I committed first: VAUDE
(6 records), Cedaero and EVOC (12 between them), each invisible until the next
merge. The tool now prints unmatched records by name instead of counting them,
but the discipline is the actual fix.

**Fetching, when a brand has no local photos.** In escalating order — plain
`WebFetch`; `curl -A "Mozilla/5.0"`; for Shopify sites, appending `.json` to
`/products/<handle>` returns the full image-URL array directly, which is by far
the cleanest route; and for a Cloudflare JS challenge that 403s everything else,
`mcp__claude-in-chrome` with a 7-12s wait clears it. That last route is the only
reason Wizard Works is complete rather than abandoned at 7 of 27.

**Product identity drifts between the catalogue and the records.** Reviewers
tidy `size`, fill in a blank `line`, and add or strip the brand prefix on `name`
— in both directions. `apply-models.mjs` now joins across five tiers, each used
only where it identifies exactly one product on each side. Past that a looser
join stops being a fix and becomes a guess; fix the record instead.

**`render` covers all three axes now** (`len_cm`, `wid_cm`, `hgt_cm`). Two
reviewers hit the gap independently. Lezyne is the proof it was needed: its site
still publishes flat-folded panel figures for the XL-Caddy and Bar Caddy, and
those now keep the honest published number in `dims_cm` while drawing the packed
estimate from `render.*_cm`.

**The brand `fabric` string is wrong about a third of the time** — Blackburn,
Swift, Atelier Velocidade, Two Wheel Gear, Thule, Vincita, VAUDE, EVOC and
Lezyne all failed or partly failed the check. It substring-selects the rendered
material, so one wrong word renders a whole brand in the wrong stuff. Worth a
dedicated pass, and worth supporting **per-product fabric**: Alpkit, Green Guru,
Giant, Thule and Vincita each sell products the single brand string cannot
describe.

**`len >= wid` says nothing about whether `mount.axes` is right.** They are
independent. Carradice's Camper and SQR Slim both had a sane-looking dims triple
while pointing their dominant axis fore-aft — a suitcase behind the saddle.

### Still open after this run
- ~~**Rigid vs soft** is now recorded for several brands and nothing reads it.~~
  Done — §13.
- Lezyne **Caddy Sack M** has no visible mounting hardware in any photo and no
  attachment system in the maker copy, yet sits in the `downtube` slot.
- VAUDE **Aqua Back Plus** publishes a 31cm depth that the reviewer could not
  confirm against the studio photo — unusually deep for a pannier.

---

## 13. The records reach the builders, and every slot is swept

### The wiring (done)

`tools/apply-models.mjs` used to carry only `dims_cm`, `render` and `fits`. It
now also merges the machine-readable half of each `geometry` block — **699
products, 386 of them with a taper** — validated against MODEL-SPEC's
vocabulary, and a `structure` class. `geometry.notes` is deliberately not
carried: prose for a human, ~180 KB on the wire, and it is the field the Apidura
seat pack record has backwards.

Read it in a builder through `identity.js`:

```js
const geom  = geomOf(p);        // form, crossSection, shoulder, profile, taperRatio
const stiff = stiffnessOf(p);   // 'soft' | 'semi' | 'rigid'
soft(geo, main, { amp, freq, seed, stiffness: stiff });
```

`soft()` honours it: `semi` takes 40% of the noise and bulge, `rigid` skips the
displacement pass entirely. All 13 builders pass it. `seatpack.js` reads
`taper.tail` instead of `vr.range(0.30, 0.42)`.

**Rigidity had no field in the spec**, so 131 records wrote it as prose across
six different keys. `tools/lib/stiffness.mjs` classifies it — 11 rigid, 82 semi
— and `--stiffness` prints the sentence behind every call. It is not a grep for
`/rigid/`: the commonest thing these records say is that the *hardware* is rigid
and the *bag* is not, and a grep gets Thule's limp Shield pannier exactly
backwards. `details.structure_class` is now in MODEL-SPEC as the field a
reviewer should write; where it exists the prose matching is skipped.

Two traps found doing it, both worth carrying:

- **A `bulge` that positions the bag is not a bulge.** `toptube.js` hollowed its
  underside through the `bulge` callback so the tube nested into it. `rigid`
  skips that pass — five structured top tube bags would have sat *on* the tube.
  It is carved into the geometry now. Check any other builder before you make it
  conditional on stiffness.
- **The user-facing summary of the records was looser than the records.** EVOC's
  two BOA packs are described as rigid, but the record itself says "the fabric
  body itself is a soft rolltop tube" and only the BOA bracket is hard. They
  classify `soft`, which is what the record actually says. Same for Cedaero:
  two of the five are rigid, one semi, and the two custom frame packs say
  nothing at all.

### The sweep — all 13 slots, `--no-shots`, post-merge

This is phase 0 of §6, and it is done. **Three builders have real defects and
the other ten are clean.** Numbers, not estimates:

| Slot | Clean | Products | Worst |
|---|---:|---:|---|
| **downtube** | **0** | **12** | **down tube −24.8mm, front tyre −22.0mm** |
| **framebag_full** | **42** | **77** | seatpost −0.8mm (35 products, all −0.2 to −0.8) |
| **framebag_half** | **93** | **103** | down tube −20.3mm |
| trunk | 15 | 17 | — |
| randobag | 10 | 11 | front tyre −1.8mm |
| toptube | 100 | 100 | clean |
| barbag | 74 | 74 | clean |
| barroll | 56 | 56 | clean |
| pannier | 62 | 62 | clean |
| seatpack | 78 | 78 | clean |
| saddlebag | 44 | 44 | clean |
| forkbag | 29 | 29 | clean |
| stembag | 38 | 38 | clean |
| toptube_rear | 1 | 1 | clean |

**Start Track B with `downtube.js`.** Every one of its 12 products is buried
23–25 mm into the down tube and most also cut into the front tyre. That is
`HANDOVER.md`'s long-standing "downtube bag hits the front wheel", and the
uniformity of the depth says it is one placement bug, not twelve.

**`framebag_full` next, but read the numbers first.** 35 products all graze the
seatpost between −0.2 and −0.8 mm. Per this project's own lesson — a constant
reading across many products is a signature of the *measurement*, not the thing
measured — that is one clamp being half a millimetre generous, not 35 bags.
It is cheap to fix and it clears 45% of the slot.

`framebag_half`'s 10 are a genuine spread (−8.3 to −20.3 mm, seat tube and down
tube both), so those are per-product.

`pannier.js` was the suggested starting point and it measures 62/62 clean, so
its work is fidelity — silhouette, hardware, the stiffened back panels the
`structure` field now exposes — not fitment.

### saddlebag.js — reviewed 8 Aug, off the back of one bug report

"The Shrew is a seatpost bag, not a saddle bag." It was rendering as a flat slab
across the bike. Two faults, both slot-wide:

- **`mount.axes` was never merged.** 697 records carry it, Rule 2 calls it the
  block that decides orientation, and `apply-models.mjs` was dropping it, so
  every builder hard-codes one mapping for its whole slot. 25 of the 44
  saddlebags say `len` runs fore-aft; the builder said it runs across. Merged
  now, along with `closure.type`.
- **One shape for two families.** `buildSaddlebag` drew a rounded box with a
  flap for everything, and 24 of the 44 are `tapered_wedge`/`teardrop` rolltops
  — small seat packs. They now build as a lathe, deep under the saddle and
  tapering to a rolled tail, plan-narrowed by the measured taper.

Also fixed a bug in this morning's `geomOf`: `taperRatio` returned
`min(tail / nose, 1)`, which reports "no taper" for the 13 saddlebags and 4 seat
packs whose records put the narrow end at the nose. It returns narrow/wide now,
with `taperNarrowEnd` naming the end.

**The remaining eleven builders should each expect the same two questions:** is
your slot really one shape, and are you reading `axesOf(p)` or assuming? Both
answers are in the records already.

### The batch to run when the machine is free

Track B was held on 8 Aug, deliberately: another session had three agents on the
mobile pass and the box was 5.75 GB into swap on 8 GB. Geometry agents both read
photos and drive a headless Chrome, which is the exact mix §6 says never to
overlap. Nothing is lost by waiting — all of the above is committed and live.

The sweep changes the grouping §5 proposes. Run these three first, in this
order of importance rather than the old slot-family pairing:

| Agent | Files | Why |
|---|---|---|
| `geo-downtube` | `downtube.js` | 0/12. One placement bug. Alone, because it is the only builder where every product fails. |
| `geo-framefull` | `framefull.js` | 42/77, 35 of them a −0.2 to −0.8mm seatpost graze. Look for one over-generous clamp before touching any product. |
| `geo-framehalf` | `framehalf.js` | 93/103, a real −8.3 to −20.3mm spread. Per-product. |

Then the clean-but-unreviewed ten, which are fidelity work and can go in any
order: `pannier.js` (62), `barbag.js` (74), `barroll.js` (56), `toptube.js`
(100), `trunk.js` (17, 15 clean), `randobag.js` (11, 10 clean), `saddlebag.js`
(44), `forkbag.js` (29).

Give each agent `BUILDER-BRIEF.md` — its §1 now tells them to read `geomOf(p)`
and `stiffnessOf(p)` rather than inventing taper constants, which is the whole
reason the wiring went in first.
