# Verified facts — the Apidura eval work

Every number here was produced by a tool in this repo and checked. **Nothing in
this file is an estimate.** If you are writing about this work, take figures
from here and nowhere else; where you need something that is not here, say so
rather than inferring it.

Written 10 Aug 2026.

---

## 1. The problem we started with

- The catalogue is **702 products across 50 brands**, drawn by **13 builder
  programs** in `src/bags/builders/`. One edit to `seatpack.js` changes 78
  products, so the builder — not the bag — is the unit of improvement.
- **Apidura is 70 of those products**, chosen because every one has a photo and
  because the owner physically owns many of the bags.
- Eight versions had already been run (`evals/runs/`, labelled `baseline`
  through `v8-glb`, all on 9 Aug). The bags were not visibly better.

**Why they were not better — the diagnosis, with evidence:**

| Evidence | What it showed |
|---|---|
| 17 of 28 blind A/B votes were **ties** (`evals/labels/pairwise-john.jsonl`) | the changes between versions were too small to perceive |
| the outline score rated the 9L saddle pack **0.814**; the human scored the same bag **1 and 2 out of 5** (`evals/labels/human-john.jsonl`) | the automated metric did not track the human at all |
| seven of the eight versions changed the harness, not the geometry | we were building measuring equipment, not fixing bags |

The deeper fault: **no critic had ever compared one render to one photograph
and named the biggest difference.** Every score to that point was a
measurement of size or outline, never of likeness.

---

## 2. The image harvest

`tools/harvest-apidura.mjs`. Run 10 Aug.

| | Before | After |
|---|---|---|
| images held | **134** | **989** |
| per product | 1–3 | 3–44, median 21 |
| product pages scraped | — | **45**, covering all 70 SKUs |
| download failures | — | **0** |

By kind: 254 studio · 237 hardware close-ups · 194 lifestyle · 188 on-bike ·
91 dimension diagrams · 25 clearance diagrams.

Before the harvest we had **zero** hardware close-ups and **zero** usable
dimension diagrams. Every one of the 45 pages has at least one on-bike shot.

**Three naming quirks each silently cost a whole page's images**, and each
reported a cheerful zero rather than an error:
- the e-bike charger pack is filed under `e-bike`, we asked for `ebike`
- the Canyon collabs are `apidura-canyon-…`, the page is `apidura-x-canyon-…`
- the Expedition handlebar pack's diagrams are filed under a different product
  name entirely (`expedition2-handlebar-system`), and the front rack pack's are
  named `…-20l-cm.svg` with no mention of "dimension"

Lesson worth stating: **a scraper that finds nothing looks exactly like a page
that has nothing.** Coverage has to be asserted, not assumed.

---

## 3. The dimension diagrams — the find that mattered

Apidura publish, for nearly every product, a **two-view orthographic
engineering drawing as SVG**: the bag from above and from the side, dimensioned,
no perspective, no lighting. The Expedition Saddle Pack's is built from **182
drawn paths**.

`tools/diagram-outline.mjs` measures the true outline off these.

- **47 of 70 products** now have an outline measured from the maker's drawing
  (`data/diagram-profiles.json`); **11 refused**, each with a stated reason.
- Most sit at **90–99% agreement** with the published dimensions. The tool
  **refuses rather than guesses** when a view matches nothing by more than 25%.

Two measurement traps found and handled, both recorded per-bag in the output:

1. **Roll-top bags are drawn rolled down.** The saddle pack's solid outline is
   36 cm; its published length is the 42 cm rolled-*out* figure. Comparing them
   naively reads as a 15% error that is not an error. Detecting the state took
   that bag from **85% to 99%** agreement.
2. **Side view and top view can be indistinguishable by proportion.** A saddle
   pack is 15 cm wide and 16 cm tall, so the two views differ by ~6%. Resolved
   by symmetry: a top view is mirror-symmetric about its long axis, a side view
   has a flat base and domed top, so its centreline wanders. Applied only where
   the proportion test admitted defeat. It resolved 4 cases (3 confirmed, 1
   swapped).

The layers inside the SVGs are named `cls-1`…`cls-6` **differently in every
file**, so they are selected by behaviour, not name: thin solid strokes are the
bag, 2px strokes are dimension arrows, dashed is the roll-out extension, filled
is the "15 cm" text. Verified by rendering each layer alone.

---

## 4. The finding that settled a 78-product argument

The record for the Expedition Saddle Pack said the bag is fattest at the saddle
end, tapering to a narrow tail (`geometry.taper` = `nose: 1, tail: 0.33`). The
owner's spoken review said the exact opposite. It decides the shape of **78
catalogue products** and was unresolved.

**The drawing settles it, with numbers on it:** 5 cm wide at the seatpost,
swelling to 15 cm wide and 16 cm tall at a blunt rolled tail; 36 cm rolled
down, 42 cm rolled out.

**The owner was right; the written record was backwards.** The confusion is the
flat stiffened tongue at the seatpost, which is broad in side view — so in a
studio photo the mounting end *looks* like the fat end. It is a mistake you
would make from photographs and never from the drawing.

This was reached twice independently: once by reading the drawing, and again by
a critic agent that had not seen that analysis.

---

## 5. Round 1 — the first real critic round

12 critic agents, fresh context, forbidden from reading `src/`. Each saw one
builder's bags: our four renders, then the drawing, on-bike shots, hardware
close-ups and the record's own claims. Each named **one** biggest gap per bag
and assigned a layer.

**Not one bag scored above 3 out of 5.**

| Score | Meaning | Count |
|---|---|---|
| 5 | indistinguishable | 0 |
| 4 | right product, one detail off | 0 |
| 3 | recognisable family, wrong specifics | 4 |
| 2 | right category, wrong object | 51 |
| 1 | not recognisable, or broken | 15 |

Every builder had a median of 1 or 2.

**Layer split:** 19 record wrong (A) · 41 builder wrong (B) · 10 no concept
exists (C).

**The common faults** — each is one sentence that moves a whole builder:

1. **Seat packs (11):** all drawn back-to-front.
2. **Top tube packs (14):** drawn as a wedge tapering to a knife edge; the real
   ones hold constant depth and chamfer only the rear corner. Every bolt-on SKU
   had straps drawn on it though its own record says `straps: []`.
3. **Half frame packs (16):** slabs deepest at the seat tube; the drawings show
   a kite, shallow at both ends, belly two-thirds forward, lower edge on the
   down tube — which is why the down-tube strap was "a loop floating in mid-air
   attached to nothing".
4. **Full frame packs (7):** **not one had a zip drawn on it.**
5. **Bar rolls (5):** the bag was impaled on the handlebar — centred on the bar
   axis instead of hanging below it, so the bar passed through and out the
   front face.
6. **Down tube packs (3):** never touched the tube; tail ran through the bottom
   bracket into the cranks. Worst slot, median 1.
7. **Fork/tool packs (3):** lathe-turned solids of revolution — "the cargo cage
   packs read as water bottles and the tool pack as a traffic cone".

---

## 6. Round 2 — 57 of 70 gaps closed

Ten fixer agents, one per builder, each restricted to its own file plus the
records, and forbidden to render (ten Chrome instances would thrash the
machine). Then a full re-render — **70 bags in 9m36s** — and six critics told
what round 1 had claimed and asked to **verify rather than trust it**.

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
| bar rolls | impaled on the bar | see below |

**The two failures are the most useful results.**

- **Bar rolls:** no longer impaled — that fault is closed 5 of 5 — but they now
  **float 26–29 mm below the bar**, attached to nothing. The automated
  geometry gate caught it; a critic then confirmed it independently and
  correctly refused to score the fault as closed.
- **E-bike charger pack:** the same failure inverted. Its gap to the down tube
  closed by the bag being driven **into** the tube, −9.5 mm interpenetrating.

Both are the classic trap of fixing what a critic *described* rather than what
was wrong.

**The blind spot neither critic round saw:** only **30 of 70** bags are
dimensionally sane; heights run **26–56% over** on frame and top tube packs.
The critics were judging shape against drawings, not size against numbers. The
free programmatic gates caught all of it. Two graders, two blind spots, and
they do not overlap.

Gate pass rates at v2: placed 70/70 · no tyre contact 70/70 · no clash 69/70 ·
attached 65/70 · **size sane 30/70**. Against v1: **17 improved, 11 regressed,
42 unchanged.**

---

## 7. What the tooling is

| File | What it does |
|---|---|
| `tools/harvest-apidura.mjs` | pulls every image from all 45 product pages, classified by kind |
| `tools/raster-diagrams.mjs` | converts the 116 SVG diagrams to PNG — vision models cannot open SVG, so without this the best reference is listed and silently skipped |
| `tools/diagram-outline.mjs` | measures the true outline off the engineering drawings; refuses when it disagrees with published dimensions |
| `tools/eval-bundle.mjs` | assembles, per builder, the evidence pack a critic reads |
| `tools/eval-critics.mjs` | aggregates verdicts — common faults first, then the layer split; deliberately prints **no single overall score** |
| `tools/eval-auto.mjs` | the free programmatic gates: placement, clashes, tyre contact, attachment, size |
| `tools/eval-review.mjs` | blind A/B for the human, in real spinnable 3D |

---

## 8. Things that are NOT true, and must not be written

- We have **not** reached a good result. No bag scores 4 or 5.
- The human has **not** yet re-reviewed v2. The only human labels on disk are
  one scoring session and 28 pairwise votes, all from 9 Aug, all against old
  versions.
- The model-vs-human agreement number that `EVAL-PLAN.md` §1.6 calls the
  licence for trusting an automated score **has not been measured**.
- 23 of 70 products still have **no** drawing-derived outline.
- This covers **one brand of fifty**. Nothing here has been tested against the
  cross-brand hold-out, so the claim "this generalises" is unsupported.
