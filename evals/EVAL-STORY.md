# EVAL-STORY.md

The full internal account of the Apidura eval work, in the order it happened,
written for an engineer picking this up cold.

Companion documents:

- [`EVAL-PLAN.md`](EVAL-PLAN.md) is the framework: what an eval is, the three
  layers, the gates, the build order. Read §0 to §2 before you change anything.
- [`APIDURA-GAUNTLET.md`](../notes/gauntlet/APIDURA-GAUNTLET.md) is the plan and the running
  version log, in plain language, with the per-version verdicts.
- [`evals/FACTS.md`](evals/FACTS.md) is the only place figures come from. Every
  number below is from there. If you need a number that is not in FACTS, measure
  it and add it; do not infer it.
- [`evals/findings-01-apidura.md`](evals/findings-01-apidura.md) is the owner's
  spoken review of v1, in his words, tagged by layer.

Dates: everything labelled `baseline` through `v8-glb` happened on 9 Aug 2026.
The harvest, the drawings, and both critic rounds happened on 10 Aug 2026.

---

## 0. The one thing to understand first

The 3D bags are not generated meshes. They are drawn by deterministic code:

> **bag = builder(slot) x record(product)**

Thirteen parametric builders in `src/bags/builders/` draw all **702 products
across 50 brands**. `seatpack.js` draws all 78 seat packs. There is no
per-product mesh to regenerate and no per-bag fix to make.

Two consequences that shape everything downstream:

1. **The unit of improvement is the builder, not the bag.** One edit moves 78
   products. Report by builder first, product second.
2. **Every fix has blast radius.** Editing a builder changes products you never
   looked at, in brands you were not working on. Regressions have to be counted
   by name, not averaged away.

The other generated artefact is the **record** (`data/models/<brand>.json`),
written by review agents reading maker photos against `data/models/MODEL-SPEC.md`.
That *is* regenerable from a prompt you control, which is where the classic
generate-score-regenerate loop belongs.

Hence the three layers, which every grader in this system must emit:

| Layer | What is wrong | Where the fix goes |
|---|---|---|
| **A** | the record is wrong; the builder faithfully drew a lie | `data/models/*.json`, or regenerate the record |
| **B** | the record is right, the builder drew something else | `src/bags/builders/*.js` |
| **C** | there is no way to *say* what this bag is | `MODEL-SPEC.md` / `BUILDER-BRIEF.md`, then re-run the reviewer |

A per-product score of 2 tells you to look. A layer tag tells you which file to
open. Attribution is the deliverable.

---

## 1. Era one: eight versions of measuring equipment (9 Aug)

Eight versions ran before any of the work described here: `baseline`,
`panels-v2`, `v3-transcript`, `v4-frames`, `v5-silhouette`, `v6-measured`,
`v7-iou`, `v8-glb`. They are all in `evals/runs/` and they are all still there,
which is the point of a frozen set.

**The bags were not visibly better at the end of them.** Three pieces of
evidence say why, and all three are on disk.

| Evidence | What it showed |
|---|---|
| 17 of 28 blind A/B votes were **ties** (`evals/labels/pairwise-john.jsonl`) | the changes between versions were below the threshold of human perception |
| the outline score rated the 9L saddle pack **0.814**; the human scored the same bag **1 and 2 out of 5** (`evals/labels/human-john.jsonl`) | the automated metric did not track the human at all |
| **seven of the eight versions changed the harness, not the geometry** | we were building measuring equipment, not fixing bags |

Only `v3-transcript` changed the shape of a bag, and it did so from a single
spoken conversation with the owner rather than from any metric.

**The root cause under all three: no critic had ever compared one render to one
photograph and named the biggest difference.** Every score to that point was a
measurement of size or outline. Not one was a measurement of likeness. A large
amount of apparatus had been built around a question nobody had asked.

### What era one is still worth

Do not delete it. The frozen 70-item set, the render profile, the blind A/B
tool (`tools/eval-review.mjs`), the programmatic gates (`tools/eval-auto.mjs`)
and the mesh export all survive and are all load-bearing now. The mistake was
not building them. The mistake was mistaking building them for progress, for
seven versions running.

---

## 2. Era two: get the evidence first (10 Aug)

### 2.1 The harvest

`tools/harvest-apidura.mjs`. Manifest lands in `data/apidura-media.json`.

| | Before | After |
|---|---|---|
| images held | **134** | **989** |
| per product | 1 to 3 | 3 to 44, median 21 |
| product pages scraped | | **45**, covering all 70 SKUs |
| download failures | | **0** |

By kind: 254 studio, 237 hardware close-ups, 194 lifestyle, 188 on-bike, 91
dimension diagrams, 25 clearance diagrams. Every one of the 45 pages has at
least one on-bike shot.

The number that matters is not 7x. It is that **before the harvest we held zero
hardware close-ups and zero usable dimension diagrams.** Straps and buckles were
being graded against nothing.

### 2.2 The drawings

Apidura publish, for nearly every product, a **two-view orthographic
engineering drawing as SVG**: the bag from above and from the side, dimensioned,
no perspective, no lighting, the roll-out extension as a dashed line. The
Expedition Saddle Pack's is built from **182 drawn paths**.

`tools/raster-diagrams.mjs` converts them to PNG (vision models cannot open
SVG). `tools/diagram-outline.mjs` measures the true outline off them, into
`data/diagram-profiles.json`.

- **47 of 70 products** have an outline measured from the maker's drawing.
- **11 refused**, each with a stated reason.
- Most sit at **90 to 99% agreement** with the published dimensions.
- The tool **refuses rather than guesses** when a view disagrees with the
  published numbers by more than 25%.

That last property is not politeness. A measurement that will not admit defeat
silently poisons everything downstream of it.

### 2.3 The argument the drawing settled

The record for the Expedition Saddle Pack said the bag is fattest at the saddle
end and tapers to a narrow tail (`geometry.taper` = `nose: 1, tail: 0.33`). The
owner's spoken review said the exact opposite. It decides the shape of **78
catalogue products** and had been unresolved for eight versions.

The drawing settles it with numbers on it: **5 cm wide at the seatpost**,
swelling to **15 cm wide and 16 cm tall** at a blunt rolled tail, **36 cm rolled
down, 42 cm rolled out**.

**The owner was right; the written record was backwards.** The confusion is the
flat stiffened tongue at the seatpost, which is broad in side view, so in a
studio photo the mounting end *looks* like the fat end.

Reached twice independently: once by reading the drawing, and again later by a
critic agent that had never seen that analysis.

Two lessons, both general:

- **Before building an elaborate way to infer something, check whether the
  manufacturer published the answer.** Eight rounds of scoring could not settle
  what twenty minutes of scraping settled outright.
- **The wrong record survived eight rounds because it was plausible.** The flat
  mounting tongue really does look like the fat end in a photo. Wrong answers
  that survive are the ones with a good story behind them.

---

## 3. Round 1: the first real critic round

12 critic agents, fresh context, **forbidden from reading `src/`**. Each saw one
builder's bags: our four renders, then the drawing, the on-bike shots, the
hardware close-ups, and the record's own claims. Each named **one** biggest gap
per bag, scored it against the anchored 1 to 5 rubric, and assigned a layer.

Bundles are assembled by `tools/eval-bundle.mjs`; verdicts aggregated by
`tools/eval-critics.mjs`, which deliberately prints **no single overall score**.

**Not one bag scored above 3 out of 5.**

| Score | Meaning | Count |
|---|---|---|
| 5 | indistinguishable | 0 |
| 4 | right product, one detail off | 0 |
| 3 | recognisable family, wrong specifics | 4 |
| 2 | right category, wrong object | 51 |
| 1 | not recognisable, or broken | 15 |

Every builder had a median of 1 or 2. **Layer split: 19 A, 41 B, 10 C.**

The valuable output is not the scores, it is that the faults clustered by
builder. Each line below is one sentence that moves a whole builder:

1. **Seat packs (11):** all drawn back-to-front.
2. **Top tube packs (14):** drawn as a wedge tapering to a knife edge; the real
   ones hold constant depth and chamfer only the rear corner. Every bolt-on SKU
   had straps drawn on it though its own record says `straps: []`.
3. **Half frame packs (16):** slabs deepest at the seat tube; the drawings show
   a kite, shallow at both ends, belly two-thirds forward, lower edge on the
   down tube. Which is why the down-tube strap was a loop floating in mid-air
   attached to nothing.
4. **Full frame packs (7):** not one had a zip drawn on it.
5. **Bar rolls (5):** the bag was impaled on the handlebar, centred on the bar
   axis instead of hanging below it, so the bar passed through the bag and out
   the front face.
6. **Down tube packs (3):** never touched the tube; the tail ran through the
   bottom bracket into the cranks. Worst slot, median 1.
7. **Fork and tool packs (3):** lathe-turned solids of revolution. "The cargo
   cage packs read as water bottles and the tool pack as a traffic cone."

A single-product complaint is almost always layer A. A complaint that repeats
across a whole slot is B or C, and the question that separates them is "could
the record even have expressed this?"

---

## 4. Round 2: 57 of 70 gaps closed

Ten fixer agents, one per builder, each restricted to its own file plus the
records, and **forbidden to render**. Then one full re-render of all 70 bags in
**9m36s**, then six critics who were told what round 1 had claimed and asked to
**verify rather than trust it**.

| | v1 | v2 |
|---|---|---|
| scored 1 | 15 | **7** |
| scored 2 | 51 | 33 |
| scored 3 | 4 | **30** |
| scored 4 or 5 | 0 | **0** |
| record wrong (layer A) | 19 | **4** |

**Closed, per builder:**

| Builder | Fault | Closed |
|---|---|---|
| seat packs | reversed taper | 11 / 11 |
| half frame packs | flat bottom, floating strap | 16 / 16 |
| top tube packs | full-length wedge | 14 / 14 |
| top tube packs | straps on bolt-on SKUs | 5 / 5 |
| full frame packs | no zips | 7 / 7 |
| stem / downtube / fork / tool | various | 8 / 10 |
| front rack packs | no roll-top, phantom straps | 0 / 2 |
| bar rolls | impaled on the bar | see §5 |

Keep this in proportion. Thirty bags moved to "recognisable family, wrong
specifics". **Nothing scores 4 or 5.** The run is a real step, not a result.

---

## 5. The two failures, which are the most useful results

### 5.1 Bar rolls: impalement traded for levitation

The round 1 fault is closed 5 of 5. The bag no longer intersects the handlebar.
It now **floats 26 to 29 mm below the bar, attached to nothing.**

The **automated geometry gate caught it first.** A critic then confirmed it
independently and correctly refused to score the fault as closed.

### 5.2 The e-bike charger pack: the same failure inverted

Its gap to the down tube closed by the bag being driven **into** the tube,
**9.5 mm interpenetrating**.

### 5.3 The shared cause

Both are the classic trap of **fixing what a critic described rather than what
was wrong.** The critic said "impaled on the bar", so the fixer moved the bag
off the bar and the described fault went away. The real fault, that nothing in
the code understood this bag hangs *from* the bar and touches it, was untouched.

Defence, and the reason this round survived it: the critic that verifies the
next round must be told the previous claim and asked to check it, not to trust
it. A critic asked "was this fixed?" says yes. A critic asked "verify this was
fixed" measures.

---

## 6. The blind spot neither critic round saw

**Only 30 of 70 bags are dimensionally sane. Heights run 26 to 56% over on
frame and top tube packs.** Two full rounds of critics, judging these bags
against the maker's own dimensioned drawings, and not one mentioned size.

They were judging shape against drawings, not size against numbers. The free
programmatic gates (`tools/eval-auto.mjs`) caught all of it.

Gate pass rates at v2:

| Gate | Passing |
|---|---|
| placed | 70 / 70 |
| no tyre contact | 70 / 70 |
| no clash | 69 / 70 |
| attached | 65 / 70 |
| size sane | **30 / 70** |

Against v1: **17 improved, 11 regressed, 42 unchanged.** Report those three
counts every time. A mean can rise while a fifth of the set gets worse.

**Two graders, two blind spots, and they do not overlap.** That is the whole
argument for running the free gates alongside the expensive ones. Neither is a
backup for the other.

---

## 7. Traps, collected

The most useful section. Every one of these cost real time.

### 7.1 SVG files saved with a `.jpg` extension

The handlebar packs' reference "photographs" were **SVG dimension diagrams saved
with a `.jpg` extension and served as `image/jpeg`**, which no browser will
decode. Those bags were being reviewed against blank frames and nothing
complained. `eval-review.mjs` now sniffs the bytes rather than trusting the
extension.

The deeper problem stands and is not a bug: those products have a *diagram*, not
a photograph, so they cannot be judged on photographic fidelity at all.
`eval-set.mjs` should say so when it freezes a set. Extension is a claim; magic
bytes are evidence.

### 7.2 A scraper that finds nothing looks exactly like a page that has nothing

**Three naming quirks each silently cost a whole page's images, and each
reported a cheerful zero rather than an error:**

- the e-bike charger pack is filed under `e-bike`; we asked for `ebike`
- the Canyon collabs are `apidura-canyon-…`; the page is `apidura-x-canyon-…`
- the Expedition handlebar pack's diagrams are filed under a different product
  name entirely (`expedition2-handlebar-system`), and the front rack pack's are
  named `…-20l-cm.svg` with no mention of "dimension"

**Coverage has to be asserted, not assumed.** Assert "every page yields at least
one on-bike shot" and "every page yields at least one diagram", and fail loudly.
Zero found is a failure state, not a result.

### 7.3 The SVG layer classes are named differently in every file

Layers inside the drawings are `cls-1` through `cls-6`, and the mapping changes
per file. Selecting by name gets you dimension arrows instead of the bag.

Select by **behaviour**: thin solid strokes are the bag, 2px strokes are
dimension arrows, dashed is the roll-out extension, filled is the "15 cm" text.
Verified by rendering each layer alone and looking at it. Do that verification
again if the drawings are ever re-harvested.

### 7.4 Roll-top bags are drawn rolled down

The saddle pack's solid outline is **36 cm**; its published length is the
**42 cm** rolled-*out* figure. Comparing them naively reads as a 15% error that
is not an error, and would have sent a fixer off to shrink a correct bag.

Detecting the state took that bag from **85% to 99%** agreement. The state is
recorded per-bag in `data/diagram-profiles.json` rather than folded into a
single number.

### 7.5 Side view and top view can be indistinguishable by proportion

A saddle pack is 15 cm wide and 16 cm tall, so its two views differ by about
**6%**, well inside the noise. Proportion cannot tell them apart, and getting it
wrong silently swaps width for height on the whole product.

Resolved by **symmetry**: a top view is mirror-symmetric about its long axis; a
side view has a flat base and a domed top, so its centreline wanders. Applied
**only where the proportion test had already admitted defeat**, so it cannot
overrule a confident correct answer. It resolved 4 cases: 3 confirmed, 1
swapped.

### 7.6 Do not let ten agents render at once

Fixers were **forbidden to render**. Ten agents each launching a Chrome instance
to screenshot bags will thrash the machine and nothing finishes.

The working shape: fixers edit only, then **one** batch re-render of all 70 bags
(9m36s), then critics judge the batch. Rendering is a serialised step owned by
the orchestrator, not a capability handed to every worker.

### 7.7 Fixing what the critic described rather than what was wrong

See §5. The failure mode is structural, not a one-off: a critic emits a sentence,
a fixer optimises against the sentence, and the sentence stops being true while
the object stays wrong. Two defences, both cheap:

- programmatic gates that measure the physical relationship the sentence was
  about (contact, clearance, interpenetration)
- verification critics told the previous claim and asked to check it

Both fired here. Neither was aimed at this failure in advance.

### 7.8 Optimising a proxy nobody had validated

The 0.814-versus-1-out-of-5 disagreement is the headline trap of the whole
project. **A model or heuristic grader is worthless until you have measured how
well it tracks the human it stands in for.** Until then its number is noise, and
optimising against noise is worse than doing nothing, because it feels like
progress.

`evals/EVAL-PLAN.md` §1.6 calls that agreement number the licence an automated score
runs on. **It has still not been measured for the new critics.** See §9.

### 7.9 Seven versions of instruments before one version of bags

Worth naming as a trap in its own right, because it is comfortable, it produces
commits, and nothing about it feels wrong from the inside. The tell was
available the whole time: 17 of 28 blind votes were ties.

---

## 8. The tooling, and what each piece is for

| File | What it does |
|---|---|
| `tools/harvest-apidura.mjs` | pulls every image from all 45 product pages, classified by kind |
| `tools/raster-diagrams.mjs` | converts the 116 SVG diagrams to PNG; without it the best reference in the set is silently skipped, because vision models cannot open SVG |
| `tools/diagram-outline.mjs` | measures the true outline off the engineering drawings; refuses when it disagrees with published dimensions |
| `tools/eval-set.mjs` | freezes the case set |
| `tools/eval-render.mjs` | renders the set, four angles per bag |
| `tools/eval-bundle.mjs` | assembles, per builder, the evidence pack a critic reads |
| `tools/eval-critics.mjs` | aggregates verdicts: common faults first, then the layer split; prints **no single overall score** |
| `tools/eval-auto.mjs` | the free programmatic gates: placement, clashes, tyre contact, attachment, size |
| `tools/eval-review.mjs` | blind A/B for the human, in real spinnable 3D |

Data: `data/apidura-media.json` (the harvest manifest),
`data/diagram-profiles.json` (drawing-derived outlines, with per-bag reasons and
refusals). Runs: `evals/runs/<timestamp>-<label>/`, containing `items.json`,
`shots/`, `bundles/`, `critics/`, `critics-summary.json`, `auto.json`.
Human labels: `evals/labels/`.

---

## 9. What is not true, and must not be claimed

Repeated from `evals/FACTS.md` §8 because it is the part most likely to be lost:

- **We have not reached a good result.** No bag scores 4 or 5.
- **The human has not re-reviewed v2.** The only human labels on disk are one
  scoring session and 28 pairwise votes, all from 9 Aug, all against old
  versions.
- **The model-versus-human agreement number has not been measured.** By our own
  rule, the critics are running without a licence.
- **23 of 70 products still have no drawing-derived outline.**
- **This is one brand of fifty.** Nothing has been tested against the cross-brand
  hold-out, so "this generalises" is unsupported. The specific risk is tuning
  `seatpack.js` to Apidura's hard-edged welded wedge until it draws a Carradice
  flapped saddlebag badly, and only the hold-out can detect that.

---

## 10. If you are picking this up now

The next round is already specified by the failures, in priority order:

1. **Re-attach the bar rolls without re-impaling them.** The fix is a mounting
   relationship, not an offset. Gate on contact, not on gap.
2. **Bring sizes down to published dimensions.** Only 30 of 70 bags pass the
   size gate; heights are 26 to 56% over on frame and top tube packs. This is
   the dominant fault and no critic will ever tell you about it.
3. **Close the front rack packs (0 of 2)** and the remaining 2 of 10 across
   stem, down tube, fork and tool.
4. **Measure the human agreement number** on a sample, before trusting another
   automated round. See `EVAL-PLAN.md` §1.6 and §5.3.
5. **Then the faults that only became visible once shape stopped dominating:**
   no zips on half frame packs, everything reading as glossy moulded plastic
   rather than matte coated fabric, and the two-tone colourways that tell the
   ranges apart.

And the layer-C work, which is a design decision rather than another round: bags
that mount to *other bags* (the front accessory pack), aero modules that need
aero bars the bike does not have, bolt-on baseplates as a mounting type, and the
rear top-tube position.
