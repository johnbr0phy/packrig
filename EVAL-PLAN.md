# Evaluating the bag models

**Read this first, then build from §5.** It is written to be actionable by a
Claude session with no other context, and to be understandable by a person who
has never built an eval before — because the second half of the point is to be
able to explain how this works.

The problem: thirteen builders draw 702 bags and "they aren't good enough" is
the only measurement we have. That sentence cannot be acted on, cannot be
compared to last week, and cannot tell you whether a change helped. Everything
below exists to replace it with a number that means something.

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

### 1.2 Why sampling matters

A set of "the first 50 products" measures Apidura and Ortlieb. This catalogue is
14 slots ranging from 103 products to 1, and 50 brands from a 70-product giant
to one-person workshops. Sample **stratified**: guarantee every slot appears,
guarantee small brands appear, and deliberately include known-hard cases.

An eval that only contains easy cases goes to 100% and stops being useful.

### 1.3 The hold-out, and why you will want to skip it

Split the set: **~70% working, ~30% hold-out.** You may look at the working
set as much as you like. You may not look at the hold-out while you are
fixing things — you score it, and you do not open the images.

Without this you will, entirely honestly, tune the builders until they satisfy
the specific cases you have been staring at. The working score goes up, the
real quality does not, and you have no way to tell. When the two scores move
together, your improvement is real. When the working set climbs and the hold-out
does not, you have overfitted, and that is a finding worth knowing.

### 1.4 Rubrics have to be anchored

"Rate the silhouette 1–5" produces different numbers from the same person on
different days. An anchored rubric writes down what each number *is*:

> **3 — Recognisable family, wrong specifics.** You could pick the right
> category from a line-up but not the right product. e.g. reads as "a seat
> pack" but the taper, the shoulder or the closure is not this one's.

Anchoring is what turns a rating into data. Write the anchors before you score
anything, and do not edit them mid-run — if you must, re-baseline and say so.

### 1.5 Three kinds of grader, and the trade

| | Cost | Breadth | Trust |
|---|---|---|---|
| **Programmatic** | free | narrow | total — it is a measurement |
| **Model-graded** | cheap | broad | *unknown until you measure it* |
| **Human** | expensive | broad | the definition of correct |

Programmatic graders answer questions with a right answer: does the bag
intersect the frame, is it 40% bigger than its spec, did the resolver drop it.
Use them for everything that can be reduced to a number, because they are free
and they never drift.

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

### 1.7 Humans disagree with themselves

Re-show a grader 10% of the items they already scored, unlabelled, a day later.
The difference between their two scores is your **noise floor**. If the same
person varies by ±0.4 on the same image, then a run that moves the mean by 0.2
has told you nothing.

This single number is what stops an eval becoming a way to feel productive.

### 1.8 Baseline before you touch anything

Score first. It is dull, it feels like a delay, and without it every later
claim is a feeling. The baseline is also the most valuable artefact for a blog
post: "we went from 2.4 to 3.9 on this frozen set, and here is the set" is a
claim someone can check.

### 1.9 Look at deltas, not just the mean

A mean can rise while a fifth of the items get worse. Always report:
**improved / unchanged / regressed** counts, and list the regressions by name.
A change that lifts the average by fixing seat packs while breaking every
pannier is not an improvement, and the mean will not tell you.

### 1.10 Goodhart's law is not optional

Any metric you optimise hard enough stops measuring what it stood for. Score
"has compression straps" and a builder will bolt straps onto everything. The
defences are: keep a human in the loop, keep the hold-out closed, and treat a
sudden jump as a bug until proven otherwise.

---

## 2. What we are actually measuring

**The claim under test: "this render looks like that product, and hangs on the
bike the way that product hangs."**

Split into five scored dimensions plus a set of pass/fail gates. Scored
dimensions are 1–5, anchored. Gates are binary and are *not* averaged in —
a bag that fails a gate is broken, not low-scoring.

### 2.1 Gates (pass/fail, programmatic, free)

| Gate | Rule | Source |
|---|---|---|
| `placed` | the resolver did not drop it | `report.json` `dropped` |
| `no_clash` | not inside anything it does not mount to, and ≤8 mm into what it does | `clearance[]` |
| `tyre` | ≥15 mm from either tyre | `clearance[]` |
| `attached` | touches or nearly touches what it mounts to — a fork bag 39 mm clear of the fork is floating | `clearance[]` + `mount.attachesTo` |
| `size_sane` | rendered bbox within +25% / −10% of spec on each axis | `bbox_mm` vs `dims` |
| `deterministic` | two renders produce identical numbers | run twice |

These already exist in `tools/bagshot-q.mjs`. Phase 0 is mostly wiring them
into a scored report rather than writing new measurement.

### 2.2 Scored dimensions (1–5)

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

### 2.3 The free win: diff what the builder drew against the record

`data/models/*.json` already describes, per product, what hardware is on it:
**701 records carry `straps`, 701 carry `zips`, 687 carry `pockets`.** That is a
written specification of D4 that nobody is checking.

So: make each builder **declare what it drew** —
`mesh.userData.feature = 'strap:compression'`, `'zip:horseshoe'`,
`'pocket:mesh'` — and have a grader walk the built scene and diff the declared
features against the record. No vision model, no human, no ambiguity: it
either drew two compression straps or it did not.

This converts a large slice of a subjective question into an exact one, and it
is the cheapest high-value thing in this whole plan.

---

## 3. What already exists

- **`tools/bagshot-q.mjs`** renders every bag alone on the bike from four
  angles into `shots/bag/<slug>/{side,tq,rear,front}.png` and writes
  `shots/bag/report.json` with dims, bbox, ground clearance, per-part
  clearances and a dropped flag. Global lock, one headless Chrome at a time.
- **`data/models/*.json`** — 702 per-product fidelity records: geometry, closure,
  zips, straps, pockets, details, mount. Written from the maker's own photos.
- **Reference photos** — 1,505 images across 34 of 50 brand folders.
- **`tools/_hittest.mjs`, `tools/_rand.mjs`** — the pattern for a headless check
  that fails loudly. Follow it.

### The constraint that decides the set size

**Only 501 of 702 products have a photograph at all** (127 stored locally, 374
hot-linked). **201 have none.** A product with no reference cannot be graded on
fidelity by anyone, human or model. The eval set is drawn from the 501, and the
201 are a separate finding — they are also the products the app renders as a
blank plate.

---

## 4. Anti-goals

- **Not a leaderboard.** The number exists to direct work, not to be admired.
- **Not per-commit.** Full renders cost real time and an 8 GB machine. Gates on
  every change; the scored dimensions on demand.
- **Not a replacement for looking.** The human loop is the point. If nobody ever
  opens an image again, this has failed.
- **Not for the catalogue.** Brand review is finished. This grades the
  *geometry*, not the data.

---

## 5. Build order

Each phase ends with something that works and prints a number. Do not start a
phase before the one above it prints.

### Phase 0 — the frozen set and the baseline gates

1. `tools/eval-set.mjs` → writes `evals/sets/v1.json`.
   - Draw only from products with a photo.
   - **Stratify**: every slot present; ≥1 product from every brand that has
     photos; cap any one brand at ~8% of the set.
   - Include a `hard` list by name — the products already known to be wrong.
   - Target **120 items**: enough to be stable, small enough to human-review in
     two sittings.
   - Mark ~30% `holdout: true`. Seeded shuffle, so the split is reproducible.
   - Freeze it: never edit `v1.json` again.
2. `tools/eval-render.mjs` → renders every item via `bagshot-q.mjs` (serial, the
   lock is not optional) into `evals/runs/<stamp>/shots/`.
3. `tools/eval-auto.mjs` → applies §2.1 gates to the report, writes
   `evals/runs/<stamp>/auto.json`.
4. `tools/eval-report.mjs` → prints pass rates per gate, per slot, and the
   worst offenders.

**Done when:** `node tools/eval-report.mjs` prints a gate pass-rate table for
120 frozen items, and running it twice gives identical output.

### Phase 1 — the human loop

This is the ground truth. Build it early, not last.

1. `tools/eval-review.mjs` serves a local page: **render on the left, the
   maker's photos on the right**, the fidelity record's own description
   underneath, and 1–5 buttons for each of D1–D5 with the anchors visible.
   Keyboard-driven: `1`–`5` to score, `→` next, `←` back. It must be fast enough
   that 120 items is a coffee, not an afternoon.
2. Append every judgement to `evals/labels/human-<who>.jsonl` — append-only,
   one JSON object per line, with a timestamp and the set version.
3. **Re-present 12 already-scored items** at the end of a session, unlabelled.
   That is §1.7's noise floor and it is computed automatically.

**Done when:** you have scored the 120, and the report prints a mean per
dimension, per slot, plus your own intra-rater agreement.

### Phase 2 — the feature diff

1. Add `userData.feature` tags in the builders (see §2.3). Start with
   `seatpack.js` and `pannier.js`.
2. `tools/eval-features.mjs` walks the built scene per item and diffs declared
   features against the record's `straps` / `zips` / `pockets`.
3. Report missing, extra and miscounted, per product and aggregated.

**Done when:** the report names, for a given bag, exactly which recorded
hardware is not being drawn.

### Phase 3 — the model grader, and its licence to operate

1. `tools/eval-judge.mjs` sends render + reference photo + the rubric to a
   vision model, one item at a time, and asks for D1–D5 with a one-line
   justification each. Store the justification — it is how you debug a
   disagreement.
2. Run it on the **same items the human scored**.
3. `tools/eval-agreement.mjs` prints, per dimension: % within 1 point, and rank
   correlation. Print it next to every model-graded score, always.

**Done when:** you can say "the model agrees with John within one point on X%
of items". If X is low, the model score is not used for decisions — say so and
keep it as a triage hint only.

### Phase 4 — the loop

`baseline → rank the worst → fix one builder → re-run → compare`.

`eval-report.mjs` gains a `--vs <run>` mode printing improved / unchanged /
regressed counts and naming every regression. Hold-out is scored and reported
**separately**, always.

**Done when:** one builder has been improved and the report shows the working
set and the hold-out moving together.

### Phase 5 — the artefacts for writing about it

- `evals/rubric.md` — publishable as-is.
- `evals/sets/v1.json` — publishable; it is what makes the claim checkable.
- A per-run summary table.
- Before/after image pairs for the items that moved most.

---

## 6. File layout

```
evals/
  rubric.md                 # the anchors. written once, edited never (see §1.4)
  sets/v1.json              # frozen cases + holdout flags
  labels/human-john.jsonl   # append-only human judgements
  runs/<iso>-<label>/
    meta.json               # git sha, catalogue sha, renderer profile, set version
    shots/<slug>/*.png
    auto.json               # gates
    features.json           # phase 2
    judge.json              # phase 3
    scores.json             # merged
tools/eval-*.mjs
```

`meta.json` matters more than it looks: a score is only comparable to another
score taken with the same catalogue and the same renderer. Record the git sha
and a hash of `data/brands.json` in every run.

---

## 7. Traps specific to this project

- **`assets/products/` is gitignored and 374 references are hot-linked.** A CDN
  can 404 and silently change your eval set. Copy the reference images used by
  the set into `evals/refs/` at freeze time. Keep them local; do not commit
  maker photography.
- **Renders must be deterministic.** They currently are — variation is driven by
  `variantOf()`, never `Math.random()`. If that ever breaks, every score becomes
  noise. Assert it in `eval-render.mjs`.
- **One Chrome at a time.** Always `bagshot-q.mjs`, never `bagshot.mjs`. 8 GB
  machine; three concurrent renders is swap.
- **The records can be confidently wrong.** `data/models/apidura.json` describes
  the seat pack nose-to-tail reversed. When a record and a photo disagree, **the
  photo wins** and the record gets a correction.
- **A constant reading across many products is a signature of the measurement,
  not the thing measured.** This has already happened twice here — 29 invented
  fork-bag violations from a tool bug, and 35 frame bags all grazing the
  seatpost by −0.2 mm. Investigate the tool first.
- **`len ≥ wid` says nothing about whether `mount.axes` is right.** They are
  independent.

---

## 8. Commands

```bash
node tools/eval-set.mjs --freeze v1          # once, then never again
node tools/eval-render.mjs --set v1          # slow; serial; uses the lock
node tools/eval-auto.mjs   --run <stamp>
node tools/eval-review.mjs --run <stamp>     # opens the human review UI
node tools/eval-judge.mjs  --run <stamp>
node tools/eval-report.mjs --run <stamp> [--vs <stamp>]
```

---

## 9. If this becomes a blog post

The thing that makes it worth reading is that the claims are checkable. Five
rules to keep it honest:

1. **Publish the rubric and the set.** Anyone can then disagree with the
   measurement rather than with the conclusion.
2. **Report the baseline, not just the endpoint.** "3.9" means nothing; "2.4 →
   3.9 on a set frozen before we started" means something.
3. **Report the hold-out separately**, and say what it was for. This is the
   part most write-ups do not have.
4. **Report the noise floor.** If your own re-scores vary by ±0.4, say so, and
   do not claim a 0.2 improvement.
5. **Report where the model grader disagreed with you.** The failures of the
   automated judge are the most interesting content in the whole exercise, and
   they are what stop it reading as marketing.

And one rule for the work itself: **do not edit the rubric or the set to make
the numbers move.** If either has to change, that is a `v2`, the baseline is
retaken, and both are reported. The moment the measuring stick becomes
adjustable, everything measured with it becomes a story rather than a result.
