# Evaluating the bag models

**Read §1–§3, then build from §7.** Written to be actionable by a Claude session
with no other context, and understandable by a person who has never built an
eval before — because half the point is being able to explain how this works.

The problem: thirteen builders draw 702 bags and "they aren't good enough" is
the only measurement we have. That sentence cannot be acted on, cannot be
compared to last week, and cannot tell you whether a change helped. Everything
below exists to replace it with a number that means something — and, more
importantly, with a number that **points at a file**.

*Revision 3. Merges the generic eval framework (frozen sets, rubrics, judge
calibration, thresholds, feedback loop) with the specific shape of this
codebase. §2 is the part that is not in any generic framework and is the reason
this plan is not the generic one. §0 is the scope decision that makes it
affordable.*

---

## 0. Scope: Apidura first, everything else second

**The whole of v1 is one brand: Apidura. All 70 products, no sampling.**

The reason is not convenience. Sampling exists to make 702 products reviewable;
70 does not need it, and a census beats a sample on every axis — no sampling
noise, no stratification argument, no per-slot floor to worry about. More
importantly, this brand is the only place in the catalogue where **the ground
truth is physical**: the owner has a load of these bags on a shelf and can check
a render against the object rather than against a photograph of it.

What one brand buys you, checked on disk:

| | |
|---|---|
| Products | **70**, every one with a local photo — 116 distinct image files, none missing, **zero CDN dependency** |
| Slots exercised | **11 of 14** — everything except `pannier`, `trunk`, `toptube_rear` |
| Builders exercised | **11 of 13** |
| `geometry.form` values | **10 distinct** — `tapered_wedge`, `trapezoid_panel`, `triangle_panel`, `slab`, `truncated_cylinder`, `barrel`, `bucket`, `cylinder`, `basket_box`, `rounded_box` |
| Records | 70, **66 verified**, 62 high confidence, 33 carrying a `render` block |
| Photos reviewed when the record was written | 116 local + 71 page references |

Eleven of thirteen builders and ten of the form vocabulary's values, from one
file. That is why this is the right first brand and not merely the convenient
one.

### 0.1 What is actually being refined

The deliverable of the Apidura pass is **not a good Apidura**. It is the
transferable machinery:

- the **record-writing prompt** (`MODEL-SPEC.md` + the brand-review brief),
- the **builder brief** (`BUILDER-BRIEF.md`) and the builders themselves,
- the **rubric** and the **judge prompt**.

Apidura is where those get calibrated against someone who knows the answer.
Then they go loose on the other 49 brands. §2.5 explains why this ordering is
not just pragmatic — one brand is a poor teacher about layer A and an excellent
one about layers B and C, and B and C are exactly what transfers.

### 0.2 Products with no photograph are out

201 of 702 catalogue products have no reference image. They cannot be graded on
fidelity by anyone, so they are excluded from every eval set, permanently, and
counted in the run summary so the exclusion stays visible. Apidura has none of
them, so this does not arise until the set widens.

---

## 1. What an eval actually is

An eval is **three things**. Miss any one and you have a demo, not an eval.

1. **A frozen set of cases.** The same inputs, every run, forever.
2. **A grader.** Something that turns one case into a score, by a written rule.
3. **A comparison.** Today's score against a baseline you took before you
   started changing things.

That is the whole idea. The rest is craft about making each of the three
honest.

### 1.1 Why the set must be frozen

If the set changes between runs, the score changes for two reasons at once —
your work, and the sampling — and you cannot separate them. So the set gets a
version, is written to disk, and is never edited. Want different cases? Make
`v2`, keep `v1`, and report both until you are confident.

The most common self-deception in this field is quietly dropping the cases
you're failing.

### 1.2 Sample stratified — or better, don't sample

A set of "the first 50 products" measures Apidura and Ortlieb. This catalogue is
14 slots ranging from 103 products to 1, and 50 brands from a 70-product giant
to one-person workshops. Any sample drawn from it must be **stratified**:
guarantee every slot appears, guarantee small brands appear, deliberately
include known-hard cases.

**A census beats all of that.** v1 is all 70 Apidura products (§0), so the
stratification argument does not arise and no sampling noise enters the
baseline. Stratification is still required for the cross-brand hold-out (§1.3)
and for whatever widening comes after — and an eval that only contains easy
cases goes to 100% and stops being useful, census or not.

### 1.3 The hold-out is the other 49 brands

In most systems you split a set 70/30 and refuse to look at the 30. Here there
is a better hold-out available, and it tests the thing that actually matters.

**Working set: all 70 Apidura products. Hold-out: a frozen cross-brand sample
you never open while working.** Roughly 60 products drawn from the other 49
brands, stratified by slot so every builder you might touch is represented,
photos required.

Why this beats splitting Apidura:

- **It tests the real risk.** The danger is not memorising individual bags; it is
  tuning `seatpack.js` to Apidura's hard-edged welded wedge until it draws a
  Carradice flapped saddlebag badly. Splitting Apidura in half cannot detect
  that — both halves are Apidura. A cross-brand hold-out detects exactly it.
- **It answers the question you're going to ask anyway.** "Does this generalise
  to the other brands" *is* "can we set it loose elsewhere". The hold-out score
  is the go/no-go on widening.
- **Thin slots survive it.** Apidura has one saddlebag, two fork bags, two rando
  bags. A 30% split of 70 would leave several builders with zero hold-out items.

**One edit to `seatpack.js` moves 78 products catalogue-wide**, and you will
have looked at eleven of them. Blast radius is the defining property of this
codebase (§2.3) and the hold-out is the instrument that measures it. When both
scores move together, your improvement is real. When Apidura climbs and the
hold-out does not, you have tuned to one brand's aesthetic — which is a finding,
and a common one.

### 1.4 Rubrics have to be anchored

"Rate the silhouette 1–5" produces different numbers from the same person on
different days. An anchored rubric writes down what each number *is*:

> **3 — Recognisable family, wrong specifics.** You could pick the right
> category from a line-up but not the right product. e.g. reads as "a seat
> pack" but the taper, the shoulder or the closure is not this one's.

Anchoring is what turns a rating into data. Write the anchors before you score
anything, and do not edit them mid-run — if you must, re-baseline and say so.

**1–5, not 0–100.** A 0–100 scale invites a judge to emit 82 when it means
"pretty good", and invites you to celebrate 82 → 85, which is noise. Five
anchored points is the most resolution any grader — human or model — can
actually sustain on this question. Likewise **no single composite score**: an
overall number is exactly the thing that hides which of the five dimensions
broke, and which of the three layers in §2 you should be editing.

### 1.5 Three kinds of grader, and the trade

| | Cost | Breadth | Trust |
|---|---|---|---|
| **Programmatic** | free | narrow | total — it is a measurement |
| **Model-graded** | cheap | broad | *unknown until you measure it* |
| **Human** | expensive | broad | the definition of correct |

Programmatic graders answer questions with a right answer: does the bag
intersect the frame, is it 40% bigger than its spec, does its volume match its
stated litres, did the resolver drop it, did it draw the two compression straps
the record says it has. Use them for everything that can be reduced to a
number, because they are free and they never drift.

Human grading is the ground truth for "does this look like the product".
Nothing else *defines* the answer. It is also slow, and you will not do it for
702 products every time you change a taper constant.

Model grading is the bridge: a vision model looks at the render and the maker's
photo and applies the same rubric. It is cheap enough to run on everything.

### 1.6 The move most people miss: grade the grader

**A model grader is a proxy, and a proxy is worthless until you know how well
it tracks the thing it stands in for.**

So: have the human score a sample. Have the model score the *same* sample. Then
measure the agreement — how often they land within one point, and whether they
rank items in the same order. If they agree, you may trust the model's score on
the other 650 products. If they don't, the model's number is noise, and
optimising against it is worse than doing nothing because it feels like
progress.

Report that agreement number every time you report a score. It is the licence
the automated score runs on.

There is a second thing to check agreement on, and it is more valuable than the
first: **does the judge attribute failures to the same layer the human does?**
See §5.3.

### 1.7 Humans disagree with themselves

Re-show a grader 10% of the items they already scored, unlabelled, a day later.
The difference between their two scores is your **noise floor**. If the same
person varies by ±0.4 on the same image, then a run that moves the mean by 0.2
has told you nothing.

This single number is what stops an eval becoming a way to feel productive.

### 1.8 Baseline before you touch anything

Score first. It is dull, it feels like a delay, and without it every later
claim is a feeling. The baseline is also the most valuable artefact for a
write-up: "we went from 2.4 to 3.9 on this frozen set, and here is the set" is
a claim someone can check.

### 1.9 Look at deltas, not just the mean

A mean can rise while a fifth of the items get worse. Always report:
**improved / unchanged / regressed** counts, and list the regressions by name.
A change that lifts the average by fixing seat packs while breaking every
pannier is not an improvement, and the mean will not tell you.

### 1.10 Thresholds are measured, not invented

Every number in this document that looks like a threshold — ±25% on bbox, 15 mm
tyre clearance, a volume ratio band — is a **placeholder until phase 0 prints
the actual distribution.** Set the gate at the tail of what you observe, not at
a number that sounded reasonable. A gate that 60% of the catalogue fails is not
a gate, it is a description of the catalogue.

### 1.11 Goodhart's law is not optional

Any metric you optimise hard enough stops measuring what it stood for. Score
"has compression straps" and a builder will bolt straps onto everything. The
defences are: keep a human in the loop, keep the hold-out closed, and treat a
sudden jump as a bug until proven otherwise.

---

## 2. The shape of this project, and why it changes the eval

Every generic eval framework for "AI-generated 3D models" assumes the same loop:
a model generates one object per product, you score it, you feed the score back,
it regenerates that object. Applied literally to this codebase that is wrong,
because the mesh is not generated — it is drawn by deterministic code:

> **bag = builder(slot) × record(product)**

Thirteen hand-written parametric builders in `src/bags/builders/` serve 702
products across 14 slots. `seatpack.js` draws all 78 seat packs. There is no
per-product mesh to regenerate.

**But there is a generated artefact, and it is the record.** `data/models/*.json`
was written by AI agents reading maker photos against the brief in
`MODEL-SPEC.md` — 19 of them in one wave on 7 Aug. So the generator in this
system is:

> **product page + photographs → [review agent + MODEL-SPEC prompt] → record**

and the record is regenerable per product, at low cost, from a prompt you
control. That is where the generic feedback loop belongs. "Refine the prompt for
Apidura's bags, then set it loose elsewhere" is precisely the right frame — the
prompt under refinement is `MODEL-SPEC.md`, the generator's output is the
record, and re-running the reviewer on the same 70 products with a revised spec
is a real, measurable regeneration. §7 phase 4 makes that the loop.

So the finding "the rear of the Apidura Expedition Saddle Pack is 12% too deep"
still has no destination until you decide **which of three layers is wrong** —
but one of those layers is now something you can regenerate rather than
hand-patch.

### 2.1 The three layers

| Layer | File | Failure looks like | Fix |
|---|---|---|---|
| **A — the record** | `data/models/<brand>.json` | Wrong dims, wrong slot, a strap the product doesn't have, a mount block describing the wrong attitude. *The builder faithfully drew a lie.* | Patch the field, or **regenerate the record** from a better prompt |
| **B — the builder** | `src/bags/builders/<slot>.js` | The record says `taper: {nose: 1, tail: 0.33}` and the drawn tail is 0.6. Or the field is read and ignored. *The builder was told the truth and drew something else.* | Edit the builder — blast radius, see §2.3 |
| **C — the vocabulary** | `MODEL-SPEC.md`, `BUILDER-BRIEF.md` | The record has no way to say what this bag is. `geometry.form` has no term for a Carradice-style flapped box; the reviewer picked the nearest wrong word and the builder drew the nearest wrong shape. *Nobody lied; the language is too small.* | Add the word to the spec, teach the builder to draw it, **re-run the reviewer** |

**Attribution is the deliverable.** A per-product score of 2 tells you to look;
a layer tag tells you which file to open. Every grader in this plan — the
programmatic checks, the judge, the human UI — must emit a layer, not just a
number.

### 2.2 How to tell the layers apart

There is a cheap, almost mechanical signal, and §5.2 automates it:

- **Conformance** — does the render match what the *record* says? Programmatic
  for hardware (§4.3) and dims; vision for shape.
- **Fidelity** — does the render match the *photograph*?

|  | Conformance high | Conformance low |
|---|---|---|
| **Fidelity high** | fine | record is wrong but the builder overrode it, or luck — investigate, rare |
| **Fidelity low** | **Layer A** — record is wrong | **Layer B** — builder ignored the record |

Layer C is the one that does not show up per item. It shows up as a **cluster**:
many products of one slot failing the same way with the same complaint. A
single-product complaint is almost always layer A. A complaint that repeats
across a slot is layer B or C, and the question separating them is "could the
record even have expressed this?"

### 2.3 The unit of improvement is the builder, not the bag

Two consequences, and they shape the whole reporting design:

1. **Report by builder first, product second.** "seatpack.js: mean D1 2.8 over
   its 11 Apidura items, worst 4 named" is an actionable line. A ranked list of
   70 products is not — you would fix them one at a time and, above layer A,
   there is no mechanism to fix one at a time.
2. **Every fix has blast radius.** Editing `seatpack.js` moves 78 products.
   The eval must re-score *all sampled items of that slot*, not just the ones
   you were working on, and must report regressions by name. This is also why
   §1.3's hold-out is not optional ceremony here.

The one exception is layer A: a record fix is genuinely per-product and has no
blast radius. That makes record fixes cheap and safe, and it means the eval
should be biased towards finding them first.

### 2.4 There is no accept / reject

Nothing is gated on a score — every product renders in the app whatever it
scores. So the generic "90–100 auto-accept, below 75 regenerate" ladder does
not apply. Thresholds here are **work queues**, not acceptance gates:

| Bucket | Action |
|---|---|
| any gate failure (§4.1) | a bug. Fix regardless of score. Never offset by a good score. |
| D1 or D2 ≤ 2 | broken. Attribute the layer, fix. |
| D-anything = 3 | the long tail. Batch by builder, fix in slot sweeps. |
| ≥ 4 | leave alone. |

### 2.5 What one brand can and cannot teach you

Scoping v1 to Apidura is not neutral across the three layers, and knowing which
way it leans is what keeps the conclusions honest.

- **Layer A — poor teacher.** Apidura's record errors are Apidura's. Fixing 70
  records tells you nothing about Rockgeist's. What *does* transfer is the
  **pattern** of error: if the reviewer systematically mistook rolled length for
  unfurled length, that is a prompt bug and it is in all 50 files.
- **Layer B — good teacher.** 11 of 13 builders and 10 form values are exercised.
  A builder that draws Apidura's `tapered_wedge` correctly is closer to drawing
  everyone's. The risk is over-fitting to one aesthetic — hard edges, welded
  seams, matte black, Hypalon — which is exactly what §1.3's cross-brand hold-out
  is there to catch.
- **Layer C — best teacher, and the reason to do this at all.** Vocabulary gaps
  are found by someone who knows the object well enough to say "there is no field
  for the thing that makes this bag *this* bag". That is what owning the bags
  buys. Every layer-C finding transfers to all 702 products at once.

**So read the Apidura pass primarily as a layer-C exercise.** The scores are the
instrument; the changes to `MODEL-SPEC.md` and `BUILDER-BRIEF.md` are the
product.

### 2.6 The dimension rule is an untested assumption

*Proposed and declined — see §7 phase 0.5. Kept because the assumption it
describes is still live and still unvalidated.*

The owner has these bags physically, which would upgrade the ground truth in a
way no eval machinery can, and makes one experiment available.

`MODEL-SPEC.md` carries a **dimension rule** that shapes all 702 products:

> Use the UNFURLED dimensions for length and width. Use the MINIMUM of the range
> for height.

…softened by a `render` block carrying the figure actually drawn (33 of the 70
Apidura records have one). **Nobody has ever checked that rule against a real
bag.** It is a reasoned guess that silently determines the size of the entire
catalogue.

So, before any scoring: **measure the owned bags.** Loaded, on the bike, as they
are actually ridden — the three axes and the roll count. Compare against
`dims_cm`, against `render.*_cm`, and against the rendered `bbox_mm`. Three
possible outcomes and all of them are worth having:

1. The rule holds → it is now evidence rather than an assumption, and it is the
   most checkable claim in any write-up.
2. The rule is biased in one direction → a signed correction applicable to every
   roll-top in the catalogue.
3. The rule is wrong per-axis → `MODEL-SPEC.md` changes and every record gets
   regenerated, which is a layer-C finding of the largest possible size.

Record the measurements in `evals/measured.json` with a note on how each was
taken. They are ground truth of a kind nothing else in this project has.

---

## 3. What we are actually measuring

**The claim under test: "this render looks like that product, and hangs on the
bike the way that product hangs."**

Five scored dimensions plus a set of pass/fail gates. Scored dimensions are
1–5, anchored. Gates are binary and are *not* averaged in — a bag that fails a
gate is broken, not low-scoring.

- **D1 Silhouette** — does the overall shape read as this product?
- **D2 Proportion** — do the parts relate to each other and to the bike correctly?
- **D3 Mounting** — right place, right attitude, attached the way the real one attaches?
- **D4 Hardware** — straps, buckles, zips, pockets: present, right count, right place?
- **D5 Surface** — fabric family, panels, seams, colourway.

Anchors go in `evals/rubric.md` and must be written before the first score.
Draft anchors for D1, to be matched for the rest:

```
5  Indistinguishable in silhouette from the reference photo at a glance.
4  Right product; a specific detail of the outline is off (tail too blunt,
   shoulder too soft) but you would not pick a different bag from a line-up.
3  Right family, wrong specifics — reads as "a seat pack", not as THIS seat pack.
2  Wrong family — reads as a different kind of bag entirely.
1  Not recognisable as luggage, or grossly malformed.
```

**Who grades what.** This is a deliberate division, not an accident:

| | Programmatic | Vision judge | Human |
|---|---|---|---|
| Gates | ✅ owns it | — | — |
| D1 Silhouette | — | ✅ | ✅ calibration sample |
| D2 Proportion | partial (bbox ratios) | ✅ | ✅ calibration sample |
| D3 Mounting | partial (clearances) | ✅ | ✅ calibration sample |
| D4 Hardware | ✅ **owns conformance** (§4.3) | ❌ do not ask it | ✅ fidelity, small sample |
| D5 Surface | — | ✅ | ✅ calibration sample |

**D4 is not a vision question here.** The records enumerate every strap, zip and
pocket for 687–701 of 702 products. Counting straps in a 512 px render is
exactly the task a vision model will hallucinate; counting them in the scene
graph is exact and free. Ask the judge for D4 and you have converted a solved
problem into a noisy one. The judge is told to skip it.

The one thing the feature diff cannot tell you is whether the *record* is right
about the hardware — that is layer A and needs eyes on a photo. Sample it, do
not automate it.

---

## 4. The programmatic layer

### 4.1 Gates (pass/fail, free)

| Gate | Rule | Source |
|---|---|---|
| `placed` | the resolver did not drop it | `report.json` `dropped` |
| `no_clash` | not inside anything it does not mount to, and ≤8 mm into what it does | `clearance[]` |
| `tyre` | ≥15 mm from either tyre | `clearance[]` |
| `attached` | touches or nearly touches what it mounts to — a fork bag 39 mm clear of the fork is floating | `clearance[]` + `mount.attachesTo` |
| `size_sane` | rendered bbox within +25% / −10% of spec on each axis, **mapped through `mount.axes`**, and only on axis-aligned axes | `bbox_mm` vs `dims`/`render` |
| `volume_sane` | mesh volume vs `capacity_l` inside a band **measured in phase 0** | new — see below |
| `deterministic` | two renders produce identical numbers | run twice |

Most of these already exist in `tools/bagshot-q.mjs`, which writes `dims`,
`bbox_mm`, `groundClearance_mm`, a sorted `clearance[]` per part and a `dropped`
flag. Phase 0 is mostly wiring them into a scored report rather than writing new
measurement.

**`size_sane` has two hard constraints, both found the first time it was run.**

1. **Map spec axes through `mount.axes` per product, not per slot.** A bar
   roll's length runs across the bike (`len: "z"`), a seat pack's runs fore-aft
   (`len: "-x"`), and one Apidura bar bag disagrees with the other four in its
   own slot. Comparing `bbox.x` to `len` for all of them reports every bar pack
   as ~55% short and ~200% too wide, which is the measurement talking.
2. **`along_toptube` / `along_downtube` / `along_forkleg` cannot be measured by
   an axis-aligned box at all.** They are diagonals; the length leaks into two
   box axes at once. **42 of the 70 Apidura items** carry at least one such
   axis — every frame bag, top tube pack and down tube pack. Report those axes
   as unmeasured rather than inventing a percentage. Measuring them properly
   needs an oriented bounding box along the tube direction, which is a later
   piece of work, not a gate.

**`volume_sane` is new and worth the small effort.** A 9 L bag whose mesh
implies 3 L is broken in a way no bbox check catches, because a bbox is right
while the body inside it is hollow, over-tapered or collapsed. Compute mesh
volume (or convex-hull volume — cheaper and sufficient), divide by `capacity_l`.
Expect a ratio above 1: stated capacity is usable interior, the mesh is
exterior. **Do not invent the band.** Print the distribution across the whole
catalogue in phase 0 and set the gate at its tails (§1.10).

### 4.2 Signed error, not just absolute

Store the **signed** dimension error per axis, per product:
`err = (rendered − spec) / spec`. Absolute error tells you a bag is wrong.
Signed error aggregated by builder tells you *how* it is wrong — and if every
seat pack is +14% on the height axis, that is one constant, one edit, 78
products fixed. This is the highest-leverage read in the entire report and it
costs nothing but keeping the sign.

Aggregate signed error by: builder, slot, brand, and `geometry.form`.

### 4.3 The free win: diff what the builder drew against the record

`data/models/*.json` already describes, per product, what hardware is on it:
**701 records carry `straps`, 701 carry `zips`, 687 carry `pockets`** — with
role, count, location, hardware type and what each strap wraps around. That is a
written specification of D4 that nobody is checking.

So: make each builder **declare what it drew** —
`mesh.userData.feature = 'strap:compression:girth'`, `'zip:horseshoe'`,
`'pocket:mesh:side'` — and have a grader walk the built scene and diff the
declared features against the record. No vision model, no human, no ambiguity:
it either drew two compression straps at the girth or it did not.

This converts a large slice of a subjective question into an exact one, is the
cheapest high-value thing in this whole plan, and is the **conformance axis of
§2.2** — the thing that separates layer A from layer B.

---

## 5. The rendering and judging layer

### 5.1 The render set is part of the measurement

If the camera moves between runs, the score moves for free. Pin and version:
camera positions, FOV, lighting rig, background, exposure, output resolution,
and the mm-per-pixel scale. Record the profile hash in every run's `meta.json`;
changing it invalidates comparison exactly as changing the rubric does.

Current output is four on-bike angles (`side`, `tq`, `rear`, `front`). Add two:

- **Bag alone, orthographic side, neutral ground.** Silhouette is the
  highest-weight dimension and the bike is visual noise in front of it. An
  orthographic side view also makes taper and shoulder directly measurable
  rather than perspective-distorted.
- **Bag alone, orthographic top.** The width taper is invisible from the side
  and is wrong on a lot of these.

The on-bike three-quarter stays and is what D3 is judged on. The judge gets both
kinds; they answer different questions.

### 5.2 Two judge passes, because the second one routes the failure

`tools/eval-judge.mjs` runs the vision model **twice per item, in two modes**,
and the pair of results is what makes it useful:

- **Fidelity pass** — renders + the maker's photographs + the rubric. No record,
  no numbers. "Does this look like that?"
- **Conformance pass** — renders + the record's own prose (`geometry.notes`,
  `closure`, `mount.notes`) + the rubric. No photograph. "Does this match its
  written specification?"

Cross them per §2.2 and the judge stops being a scorer and becomes a router.
Two calls instead of one, on a 70-item set, is not a cost worth optimising.

**Keep the numeric dims away from the judge in both passes.** Give a model the
specified dimensions and it will reason about arithmetic instead of looking —
and it will re-derive, badly, a check §4.1 already performs exactly. Independent
channels are the point: when the programmatic size check passes and the judge
says the proportions are wrong, that disagreement is information.

Tell it explicitly to ignore lighting, background, photographic styling and
perspective. **Do not tell it to ignore colour** — colourway is D5, it is in the
record, and the app does model it.

Output is structured, one object per item, and includes a one-line
justification per dimension, a confidence, and a **proposed correction expressed
in the record's own vocabulary**:

```json
{
  "item": "apidura-expedition-saddle-pack-9l",
  "pass": "fidelity",
  "scores": { "d1": 3, "d2": 2, "d3": 4, "d5": 4 },
  "why": {
    "d1": "Tail is blunt; the photo shows it blading to a narrow rolled point.",
    "d2": "Body is deepest at mid-length; the photo is deepest at the nose."
  },
  "confidence": 0.7,
  "proposal": { "geometry.taper.tail": 0.33, "geometry.shoulder": "squared" },
  "layer_guess": "B"
}
```

The `proposal` field is the difference between a dashboard and a control system
— but only because it is written in fields that exist. A free-text "reduce rear
depth by approximately 12%" has nowhere to go in a codebase with no per-product
generator. A key path into `data/models/*.json` or a named builder parameter
does. **If the judge cannot express the fix as a field, that is itself the
signal for layer C** — the vocabulary is missing a word.

Store the justifications. They are how you debug a disagreement, and they are
the most interesting thing to publish.

### 5.3 Two agreements to measure, not one

- **Score agreement** — % within 1 point per dimension, plus rank correlation.
  The classic. Licences the automated score.
- **Attribution agreement** — when the human tags a failure layer A/B/C, does
  the judge's `layer_guess` (or the §2.2 cross) match? This is the number that
  licences the *routing*, and routing is what actually saves you time. A judge
  that scores well but routes badly sends you to the wrong file, which is worse
  than no judge.

---

## 6. What already exists

- **`tools/bagshot-q.mjs`** — serialising wrapper around `bagshot.mjs`; renders
  every bag alone on the bike from four angles into
  `shots/bag/<slug>/{side,tq,rear,front}.png` and writes `shots/bag/report.json`
  with dims, bbox, ground clearance, per-part clearances and a dropped flag.
  Global lock, one headless Chrome at a time, refuses to start below 1.2 GB free.
- **`data/models/*.json`** — 702 per-product fidelity records: geometry, closure,
  zips, straps, pockets, details, mount, evidence. Written from the maker's own
  photos. `MODEL-SPEC.md` defines the vocabulary.
- **`src/bags/`** — 13 builders over 9 shared modules; `features.js` and
  `hardware.js` already centralise zips, pockets, straps and buckles, which is
  where the `userData.feature` tagging of §4.3 belongs.
- **Reference photos** — 1,505 images across 34 of 50 brand folders.
- **`tools/scratch/_hittest.mjs`, `tools/scratch/_rand.mjs`** — the pattern for a headless check
  that fails loudly. Follow it.

### Photo coverage

Catalogue-wide, **501 of 702 products have a photograph** (127 stored locally,
374 hot-linked); 201 have none and are excluded per §0.2.

**Apidura is the clean case and this is why it is first.** All 70 products carry
photographic evidence, and the evidence is **local**: 116 distinct files under
`assets/products/apidura/`, every one present on disk, plus 71 page references.
Nothing in the v1 set depends on a CDN staying up. Note that the richer photo
set lives in each record's `evidence[]` array, not in `brands.json`'s single
`image` field — pull refs from the record.

The cross-brand hold-out (§1.3) does not get this for free: it must be drawn
from photographed products and its images copied locally at freeze time.

---

## 7. Build order

Each phase ends with something that works and prints a number. Do not start a
phase before the one above it prints.

### Phase 0 — the frozen set, the render profile, and the baseline gates

1. `tools/eval-set.mjs` → writes `evals/sets/apidura-v1.json`.
   - **All 70 Apidura products.** A census, not a sample — no stratification, no
     seeded shuffle, no sampling argument to defend.
   - Refs come from each record's `evidence[]`, copied into
     `evals/refs/<slug>/` and hashed at freeze time (§9).
   - Freeze it: never edit it again.
2. `tools/eval-set.mjs --holdout` → writes `evals/sets/holdout-v1.json`: ~60
   products from the other 49 brands, photographed, stratified by slot so every
   builder that Apidura exercises is also represented elsewhere. Copy its refs
   locally too — this is the set that depends on hot-linked images.
   **Then do not open it.**
3. Pin the render profile (§5.1) and add the two orthographic bag-alone views.
4. `tools/eval-render.mjs` → renders every item via `bagshot-q.mjs` (serial, the
   lock is not optional) into `evals/runs/<stamp>/shots/`. **Time it and record
   the throughput** — how long a full run takes decides how often you can afford
   one, and everything downstream is planned around that number.
5. `tools/eval-auto.mjs` → applies §4.1 gates and §4.2 signed errors, writes
   `evals/runs/<stamp>/auto.json`. First job: print the volume-ratio and
   bbox-error **distributions** and set the two calibrated gates from them.
   Calibrate on the whole catalogue, not on Apidura — 70 products of one brand
   is too narrow a base for a threshold that will be applied to 702.
6. `tools/eval-report.mjs` → prints gate pass rates per gate, **per builder**,
   per slot, and the worst offenders, plus signed-error means per builder.

**Done when:** `node tools/eval-report.mjs` prints a gate pass-rate table for the
70 frozen items grouped by builder, and running it twice gives identical output.

### Phase 0.5 — *not done: no physical measurement*

§2.6 proposed tape-measuring the owned bags. **Declined — everything comes from
photographs and product-spec pages.** That is a legitimate call, and this note
exists so the consequence is stated once rather than discovered later:

- **The maker's published figures are the dimensional ceiling.** `size_sane` and
  the signed-error aggregates check the render against `dims_cm` / `render.*_cm`,
  which are transcriptions of marketing copy. Where a maker is wrong or vague,
  the eval inherits it and cannot see it.
- **The dimension rule in `MODEL-SPEC.md` — unfurled len/wid, minimum height —
  stays an assumption.** It sizes all 702 products and no evidence in this system
  can confirm or refute it. A reviewer *can* still catch it indirectly: if a bag
  in an on-bike photo plainly does not extend as far as the render does, that is
  a layer-C finding about the rule, and it should be tagged `C` and noted.

Photographs do carry scale when the bag is on a bike — a 622 mm wheel and a
~40 mm tyre are in most product shots. If dimensional accuracy later turns out to
be the dominant failure, photo-derived scale is the cheap next step, not a tape.

### Phase 1 — the human loop

This is the ground truth. Build it early, not last.

1. `tools/eval-review.mjs` serves a local page:
   - **left**: the renders (on-bike + the two ortho views);
   - **right**: the maker's photographs from `evals/refs/`;
   - **under both**: the record's own claims in plain language — dims, form,
     taper, closure, the strap list, the mount notes — because half of what you
     will find is the record being wrong, and you cannot see that unless it is
     on screen;
   - 1–5 buttons per dimension with the anchors visible;
   - **and one keystroke for the layer tag: A record / B builder / C vocabulary.**
     If you only ever collect one thing from a human, collect this.
2. Keyboard-driven: `1`–`5` to score, `a`/`b`/`c` to attribute, `→` next, `←`
   back, a free-text note field. Fast enough that 70 items is a coffee, not an
   afternoon.
3. Mark the products the owner physically owns. For those, the review is done
   **with the bag in hand**, and the note field carries what the photograph could
   not have told you — that is the layer-C mine.
4. Append every judgement to `evals/labels/human-<who>.jsonl` — append-only, one
   JSON object per line, with a timestamp and the set version.
5. **Re-present 8 already-scored items** at the end of a session, unlabelled.
   That is §1.7's noise floor and it is computed automatically.

**Done when:** you have scored the 70, and the report prints a mean per
dimension, per builder, per slot, a layer-tag histogram, and your own
intra-rater agreement.

### Phase 2 — the feature diff

1. Add `userData.feature` tags in the builders (§4.3). Tag at the source in
   `features.js` / `hardware.js` where the geometry is actually made, so it
   applies to every builder at once rather than thirteen times.
2. `tools/eval-features.mjs` walks the built scene per item and diffs declared
   features against the record's `straps` / `zips` / `pockets`, matching on
   role + location, not just count.
3. Report missing, extra and misplaced — per product, and aggregated per builder.

**Done when:** the report names, for a given bag, exactly which recorded
hardware is not being drawn — and per builder, which hardware kinds it never
draws at all. That second list is a to-do written by the data.

### Phase 3 — the judge, and its licence to operate

1. `tools/eval-judge.mjs` — two passes per item per §5.2, structured output,
   justifications stored.
2. Run it on the **same items the human scored**.
3. `tools/eval-agreement.mjs` prints both agreements from §5.3. Print them next
   to every model-graded score, always.

**Done when:** you can say "the model agrees with John within one point on X% of
items, and routes to the same layer on Y%". If X is low, the score is not used
for decisions — say so, and keep it as a triage hint. If X is fine but Y is low,
use the scores and ignore the routing.

### Phase 4 — the loop, per layer

Three loops, not one, because the three layers have different costs and
different blast radii. Run them in this order — cheapest and safest first.

**A — patch records.** Per product, no blast radius. Fix, re-render those items,
confirm. Log the *pattern* of each fix, not just the fix: a list of 70 individual
corrections whose common cause is one misread instruction in `MODEL-SPEC.md` is
a layer-C finding wearing a disguise, and that is the single most valuable
output of the Apidura pass.

**B — edit builders.** Blast radius. Re-score every Apidura item of that slot
*and* the hold-out items of that slot. Keep the change only if both move
together; if Apidura climbs and the hold-out drops, you have tuned to one
brand's aesthetic (§2.5) and the correct response is to make the behaviour
conditional on a record field rather than baked into the builder.

**C — refine the prompt, then regenerate.** This is the loop the generic
framework describes, aimed at the layer that is actually generated (§2):

1. Amend `MODEL-SPEC.md` / `BUILDER-BRIEF.md` — add the missing vocabulary,
   sharpen the instruction that was misread.
2. **Re-run the brand reviewer on the same 70 Apidura products** with the revised
   spec, into `data/models/apidura.json` at a new spec version. Same inputs, same
   photos, new prompt — a controlled comparison.
3. Diff old record against new: which fields changed, and did they change towards
   the human labels or away from them?
4. Re-render, re-score. Did the *renders* improve, or only the prose?
5. Then, and only then, run the revised spec across a couple of other brands and
   check the hold-out.

Step 4 is the one people skip. A record that reads better and renders identically
has improved nothing.

`eval-report.mjs` gains `--vs <run>`: improved / unchanged / regressed counts,
every regression named, **grouped by builder**. Hold-out scored and reported
separately, always.

The rule that makes it a control system rather than a dashboard: **a proposed
correction is a hypothesis, not a fix.** Apply it, re-run, and keep it only if
the relevant metric moved and nothing else regressed. Judge proposals that fail
this test are worth logging — a judge whose corrections don't help is a judge you
have measured.

**Done when:** one builder has been improved with the hold-out following, one
spec revision has been round-tripped through a record regeneration and shown to
move the renders, and at least one proposed correction has been rejected by
re-evaluation.

### Phase 5 — failure analysis across the set

The point at which this stops being a scoreboard and starts being a research
instrument. With every run stored, ask:

- Which builders are worst? Which slots?
- Is the signed error systematic — does one builder always overshoot depth?
- Which brands' records are thin enough that layer A dominates?
- Which `geometry.form` values produce the worst silhouettes? A form that always
  scores 2 is a missing word in the vocabulary (layer C).
- Which camera angle changes the judge's mind most? (Cheap to test: re-judge
  with one view withheld.)
- Which dimensions does the judge agree with you on, and which does it not?

### Phase 6 — the artefacts for writing about it

- `evals/rubric.md` — publishable as-is.
- `evals/sets/apidura-v1.json` and `holdout-v1.json` — publishable; they are what
  make the claim checkable.
- `evals/measured.json` — the tape-measured bags. Rare and genuinely interesting:
  almost nobody validating a 3D pipeline has the physical object.
- The before/after diff of `MODEL-SPEC.md` next to what it did to the scores.
- A per-run summary table.
- Before/after image pairs for the items that moved most.
- The list of judge proposals that were rejected on re-evaluation.

---

## 8. File layout and versioning

```
evals/
  rubric.md                 # the anchors. written once, edited never (§1.4)
  render-profile.json       # cameras, lights, background, resolution (§5.1)
  sets/apidura-v1.json      # the 70. frozen
  sets/holdout-v1.json      # ~60 cross-brand. frozen, and not opened (§1.3)
  refs/<slug>/*.jpg         # reference photos copied + hashed at freeze time (§9)
  measured.json             # tape-measured real bags (§2.6)
  labels/human-john.jsonl   # append-only human judgements + layer tags
  runs/<iso>-<label>/
    meta.json               # see below
    shots/<slug>/*.png
    auto.json               # gates + signed errors
    features.json           # phase 2
    judge.json              # phase 3, both passes
    scores.json             # merged
tools/eval-*.mjs
```

`meta.json` matters more than it looks. **A score is only comparable to another
score taken with the same everything.** Record, minimum:

```
git_sha, catalogue_sha (hash of data/brands.json), models_sha (hash of data/models/),
set_version, rubric_version, render_profile_sha,
spec_version (hash of MODEL-SPEC.md + BUILDER-BRIEF.md),
reviewer_model, reviewer_run_id,        # who wrote the records, and when
judge_model, judge_prompt_sha, tool_versions, wall_clock_seconds
```

`spec_version` and `reviewer_*` exist because of §7 phase 4C: once records are
regenerated from a revised prompt, "which spec wrote this record" is the primary
independent variable in the whole experiment.

If any of those change, say so next to the number. Changing the judge prompt and
reporting an improvement is the same error as editing the rubric.

---

## 9. Traps specific to this project

- **`assets/products/` is gitignored and 374 of 501 catalogue references are
  hot-linked.** A CDN can 404 and silently change your eval set. Apidura is
  immune — all 116 of its evidence files are on disk — but the cross-brand
  hold-out is not. Copy every set's reference images into `evals/refs/` at freeze
  time and hash them. Keep them local; do not commit maker photography.
- **`brands.json` shows one image per product; the record's `evidence[]` shows
  all of them.** Apidura: 1 vs 116. Build refs from the records.
- **Renders must be deterministic.** They currently are — variation is driven by
  `variantOf()`, never `Math.random()`. If that ever breaks, every score becomes
  noise. Assert it in `eval-render.mjs` (the `deterministic` gate).
- **One Chrome at a time.** Always `bagshot-q.mjs`, never `bagshot.mjs`. 8 GB
  machine, Chrome peaks ~0.76 GB, the browser holds ~3 GB. Three concurrent
  renders is swap, and swap is how the 7 Aug session died. The lock and the
  1.2 GB floor exist for that reason; do not route around them.
- **The records can be confidently wrong.** `data/models/apidura.json` described
  the seat pack nose-to-tail reversed. When a record and a photo disagree, **the
  photo wins** and the record gets a correction — that is a layer A fix and it is
  the cheapest kind.
- **A constant reading across many products is a signature of the measurement,
  not the thing measured.** This has already happened twice here — 29 invented
  fork-bag violations from a tool bug, and 35 frame bags all grazing the seatpost
  by −0.2 mm. Investigate the tool first. Corollary: a suspiciously clean
  cluster in the *scores* deserves the same suspicion.
- **`len ≥ wid` says nothing about whether `mount.axes` is right.** They are
  independent.
- **`dims_cm` is not what is drawn.** Roll-tops carry a `render` block with the
  drawn figure. The `size_sane` gate must compare against `render.<axis>_cm`
  where present and `dims_cm` otherwise, or it will fail every roll-top in the
  catalogue and tell you nothing.
- **Do not ask the judge to count hardware.** §3, and it is the most likely way
  to end up with confident nonsense in the report.

---

## 10. Commands

```bash
node tools/eval-set.mjs      --brand apidura --freeze apidura-v1   # once, then never
node tools/eval-set.mjs      --holdout --freeze holdout-v1        # once, then never
node tools/eval-render.mjs   --set v1           # slow; serial; uses the lock
node tools/eval-auto.mjs     --run <stamp>
node tools/eval-features.mjs --run <stamp>
node tools/eval-review.mjs   --run <stamp>      # opens the human review UI
node tools/eval-judge.mjs    --run <stamp> [--pass fidelity|conformance]
node tools/eval-agreement.mjs --run <stamp>
node tools/eval-report.mjs   --run <stamp> [--vs <stamp>] [--builder seatpack]
```

---

## 11. Anti-goals

- **Not a leaderboard.** The number exists to direct work, not to be admired.
- **Not per-commit.** Full renders cost real time on an 8 GB machine. Gates on
  every change; the scored dimensions on demand.
- **Not a replacement for looking.** The human loop is the point. If nobody ever
  opens an image again, this has failed.
- **Not brand coverage.** All 50 brands are reviewed and all 702 products merge;
  that work is finished and is not reopened. Phase 4C re-runs the *reviewer* on
  products already covered, against a better spec — that is regeneration of a
  record, not discovery of a product. No new brands, no new SKUs.
- **Not a generic eval platform.** A hosted framework would impose per-item
  accept/reject and per-item mesh regeneration, which are the two abstractions
  this codebase does not have. Building it here keeps 3D rendering, the maker
  photos, the physical measurements and the human's layer tag on one screen,
  which is where the value is. Reach for a platform later, if experiment tracking
  across many runs becomes the bottleneck.
- **Not 702 products.** v1 is 70. Widening is a decision made on the hold-out
  number, not on enthusiasm.

---

## 12. If this becomes a blog post

The thing that makes it worth reading is that the claims are checkable. Rules to
keep it honest:

1. **Publish the rubric and the set.** Anyone can then disagree with the
   measurement rather than with the conclusion.
2. **Report the baseline, not just the endpoint.** "3.9" means nothing; "2.4 →
   3.9 on a set frozen before we started" means something.
3. **Report the hold-out separately**, and say what it was for. This is the part
   most write-ups do not have.
4. **Report the noise floor.** If your own re-scores vary by ±0.4, say so, and do
   not claim a 0.2 improvement.
5. **Report where the model grader disagreed with you** — on scores *and* on
   attribution. The failures of the automated judge are the most interesting
   content in the whole exercise, and they are what stop it reading as marketing.
6. **Report the rejected corrections.** The proposals that sounded right and made
   things worse are the honest evidence that the loop is closed.

And one rule for the work itself: **do not edit the rubric or the set to make the
numbers move.** If either has to change, that is a `v2`, the baseline is retaken,
and both are reported. The moment the measuring stick becomes adjustable,
everything measured with it becomes a story rather than a result.
