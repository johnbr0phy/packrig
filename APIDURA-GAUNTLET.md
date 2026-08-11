# Making the Apidura bags look right

A plan, in plain language, plus the running log of how each version went.

**The goal:** you look at the 3D bag and the maker's photo side by side and
can't easily tell which is which. Seventy Apidura bags. Nothing else until
these are right.

---

## 1. Why we've been spinning

We've already done eight versions. They're in `evals/runs/`. Almost none of
them made the bags look better, and here's the honest reason:

**Seven of the eight versions changed the measuring equipment, not the bags.**
We built a scoring harness, a photo tracer, an outline comparator, a mesh
exporter. Only one version — `v3-transcript` — actually changed the shape of a
bag, and it did it from a single conversation with you.

Three numbers that show the problem:

| What we saw | What it means |
|---|---|
| You voted **17 ties out of 28** blind comparisons | The changes between versions were too small for you to see. We were polishing below the level anyone can perceive. |
| The outline score said the 9L saddle pack was **0.81 out of 1** — you scored the same bag **1 and 2 out of 5** | Our automatic score and your eye disagree completely. We've been chasing a number that doesn't track whether the bag looks right. |
| We hold **1–3 photos** per bag. Apidura publishes about **nine**. | We've been grading against a thin, cropped view of the truth. |

And the fourth problem, which is the real one:

**Nothing has ever looked at one bag next to its own photo and said what's
wrong with it.** Every score so far has been a measurement — is the box the
right size, is the outline close. Not one agent has ever done the actual job:
put the render beside the photograph and name the single biggest difference.

That is exactly what a gauntlet loop is, and we haven't been running one.

---

## 2. What a gauntlet loop actually is

Four rules. They're simple and we've been breaking three of them.

1. **Give it a real bar, not an adjective.** Not "make it look good" — the
   actual photograph, in the actual frame, to be beaten.
2. **Split it into the smallest pieces that can be judged separately.**
   One bag, one photo, one verdict.
3. **The builder never grades its own work.** A separate agent with fresh
   context judges it — one that has no idea why the shape ended up that way,
   so it can't talk itself into "that's reasonable."
4. **The critic names the single biggest gap and sends it back.** Not a list
   of twelve things. The one that matters most. Then round again.

You stop when the improvements stop being worth the money — not after a fixed
number of rounds.

---

## 3. Step zero: get everything from Apidura — **done**

This was the first thing to fix, and it turned out to be worse than I thought
and better than I hoped.

We were holding **134 images across all 70 bags** — 1 to 3 each, all studio
shots on white — because the old scraper was capped at four per product.

We now hold **989**, from all 45 product pages, with every one of the 70 bags
covered. That's a **7× increase**, and it's the wrong-shaped comparison
anyway: what we gained isn't more of the same picture, it's *kinds* of picture
we had none of.

`tools/harvest-apidura.mjs` files every image by what it *is*:

| Kind | Count | What it shows | Why it matters |
|---|---|---|---|
| **studio** | 254 | the product on white, several angles | shape and proportion |
| **feature** | 237 | close-ups of buckles, pull tabs, straps, padding | the hardware we keep drawing wrong — **we had none of these** |
| **lifestyle** | 194 | loaded, in use, outdoors | how it sags and bulges when full |
| **on-bike** | 188 | the bag fitted to a real bike | the only evidence of which way round it goes and what it straps to. Every one of the 45 pages has at least one |
| **dimensions** | 91 | vector line drawing with measurements | see below — this is the big one |
| **clearance** | 25 | how much room it needs on the bike | stops bags clipping tyres and frames |

**The dimension diagrams are the unexpected prize, and they're better than I
first realised.** They aren't a photo with arrows on it. Each one is a proper
**two-view engineering drawing** — the bag from above and from the side, drawn
flat with no perspective, every measurement labelled, the roll-out extension
shown as a dashed line. The saddle pack's is built from 182 drawn paths.

That is the single best thing we could possibly have. It's a technical
drawing of the object, which is exactly what our 3D model is trying to be.
Every outline score up to now was traced off a lit photograph at an unknown
angle; this is the real thing, and it's in vector form so we can measure it
exactly. I've confirmed we can turn them into images we can measure.

There are also **short videos** on some pages showing straps being fastened.
Not using those yet, but they're noted.

### It worked immediately — here's the proof

Our notes carried an unresolved argument about the Expedition Saddle Pack.
The written record said the bag is fattest where it meets the saddle and
tapers to a narrow tail. Your spoken review said the exact opposite. Nobody
could settle it, and it decides the shape of **78 bags** across the catalogue.

The dimension drawing settles it in one glance, with numbers on it:

> The bag is **5 cm wide at the seatpost end** and swells rearward to
> **15 cm wide and 16 cm tall** at a blunt, rounded, rolled tail.
> 36 cm long rolled down, 42 cm rolled out.

**You were right and the written record was backwards.** What made it
confusing is the flat stiffened tongue at the seatpost — it's broad when you
look at the bike from the side, so in a studio photo the mounting end *looks*
like the fat end. It isn't; it's a thin plate on a narrow nose. That's a
mistake you'd make from photographs and would never make from the drawing.

That is the whole argument for this step. Twenty minutes of scraping settled
a question that eight rounds of scoring couldn't, and it was worth 78 bags.

### The scrape was fiddlier than it looks, and that's worth knowing

Three separate naming quirks each silently cost us a whole page's images, and
none of them announced themselves — the tool just reported a cheerful zero:

- the e-bike charger pack is filed under `e-bike`, we asked for `ebike`
- the Canyon collabs are `apidura-canyon-…`, the page is `apidura-x-canyon-…`
- the Expedition handlebar pack's diagrams are filed under a different product
  name entirely (`expedition2-handlebar-system`), and the front rack pack's
  are named `…-20l-cm.svg` with no mention of "dimension" at all

The lesson for the write-up: **a scraper that finds nothing looks exactly like
a page that has nothing.** Coverage has to be asserted — "does every page have
an on-bike shot, does every page have a diagram" — or you quietly grade 70
bags against a fraction of the evidence and never find out.

### Still to do in step zero

**Deep research on mounting.** For each of the eleven bag types, a short
written brief on how it actually attaches — Apidura's fitting guides, reviews
with on-bike photos, forum threads. Our notes list three things we currently
have *no way to express*: the accessory pack clips onto **another bag**, not
the bike; rear top-tube packs sit somewhere we have no concept for; aero packs
need aero bars our bike doesn't have. Research settles those before we build.

**Plus deep research where the page isn't enough.** For each of the eleven bag
types, find out how it actually mounts — Apidura's own fitting guides, reviews
with on-bike shots, forum photos. One short written brief per bag type: what
it straps to, in which direction, how many straps, what it rests against. Our
notes already list three mounting problems we can't currently express at all
(the accessory pack clips onto *another bag*; rear top-tube packs sit
somewhere we have no concept for; aero packs need aero bars that don't exist
on our bike). Research answers those before we build anything.

---

## 4. The loop, one round at a time

Each round takes a few hours. Rendering all 70 bags takes about 12 minutes,
so the time goes on thinking, not waiting.

**1 — Render.** All 70 bags, four angles each. Automatic.

**2 — Critique, one agent per bag.** Each critic sees one bag: our render,
*every* photo of it, its dimension diagram, and the mounting brief for its
type. It has never seen the code. It answers three questions:

- Score 1–5: could you pick this exact product out of a line-up?
- What is the **single biggest** difference from the photos?
- Whose fault: **the notes** (we wrote the wrong description), **the drawing
  code** (the description is right, the shape isn't), or **the vocabulary**
  (we have no way to express this at all)?

That third question is the one that makes this efficient — it aims the fix at
the right place instead of guessing.

**3 — Fix, one agent per drawing program.** There are 13 programs drawing all
702 bags in the catalogue. A fixer takes all the gaps reported against its
program and fixes them. One fix to the seat pack program moves 78 bags at
once — that leverage is why we fix programs, not individual bags.

**4 — Re-render and check the named gap specifically.** This is the bit we've
never done. The critic said "the nose is too pointed." After the fix, we ask:
*is the nose still too pointed — yes or no?* That's the real progress number:

> **gaps closed / gaps found**

Not an average score. An average over 70 bags drifts by a tenth of a point and
tells you nothing. "We found 43 problems and closed 31 of them" tells you
everything.

**5 — You gate the version, about 20 minutes.** Two things:

- **Blind A/B** on the ~15 bags that changed most. Old version and new,
  unlabelled, spinnable. Which is better. If you can't tell, the round didn't
  earn its version number.
- **Calibration:** you score 10 bags 1–5 that the AI also scored. We publish
  how often you and it agree. If it stops agreeing with you, its score is
  noise and we fix the judge before trusting another round.

**Anti-rule, learned from the 17 ties:** we don't cut a version until the
changes are big enough to see. Small fixes accumulate inside a round.

---

## 4b. The order of work, revised 10 Aug

John spotted that other brands had started inheriting Apidura's features — an
Ortlieb handlebar pack wearing Apidura Backcountry strap stubs and a bungee
lattice. He is right, and the decision is: **finish Apidura first anyway.**

The reasoning, which is worth writing down because it is not obvious:

**Apidura is the best-equipped brand in the catalogue and that is why it is
first.** They publish a dimensioned two-view engineering drawing for nearly
every product. Almost nobody else does. So the method that is working here —
measure the outline off the drawing, refuse when it disagrees with the
published numbers — **does not transfer as-is.** For the other 49 brands the
ground truth will be photographs plus spec text, which is weaker evidence, and
`tools/silhouette.mjs` (photo-traced, and forced to refuse most images) is the
tool that will have to carry it. Expect lower ceilings and more human
adjudication there.

That is an argument for finishing Apidura, not for stopping: this is where the
evidence is strongest, so this is where the builders, the rubric and the judge
get calibrated. Whatever survives here is what goes loose on the rest.

**But one rule changes immediately, because the leak is real:**

> **A number measured off an Apidura drawing goes in the RECORD, never in the
> builder.** 702 records already carry `geometry`, `straps` and `closure`.
> A strap spacing belongs in `p.straps[].spacing`, not in a module constant
> like `STRAP_SPACING = 130` that silently applies to all 56 handlebar rolls.
> Branching on an Apidura LINE NAME (`/backcountry/i`) inside a shared builder
> is the same bug wearing a different hat.

This costs a fixer almost nothing and prevents the damage compounding while we
finish. Cleaning up what has already leaked is scheduled below, not now.

### The order

1. **Now — Apidura to 4+.** Keep looping. Every new constant goes in a record.
2. **Then — the cross-brand hold-out.** A frozen stratified sample of the other
   49 brands, per §1.3. It has never been built, which is exactly why the leak
   went unnoticed. It is the go/no-go on widening.
3. **Then — undo the leak**, using the hold-out to measure it rather than
   guessing at it.
4. **Then — the other 49 brands**, with a method rebuilt around photographs and
   spec text rather than drawings.

---

## 5. When we stop

We stop when any of these is true:

- You stop preferring the new version in blind A/B — we've hit your ceiling.
- Gap closure flattens — the critics keep naming the same things and the
  fixes stop landing.
- The remaining gaps are all "vocabulary" — meaning we've run out of things
  the current system can express, and the next move is a design decision, not
  another round.

The target: **most Apidura bags at 4+ out of 5**, and you preferring the final
version over today's on nearly every bag.

---

## 6. What I need from you

About **20 minutes per version.** One blind A/B session plus ten scores. That
gate is the whole reason this works — you own many of these bags, so your eye
is the only ground truth in the building. Everything else is a stand-in for it
and has to keep proving it still agrees with you.

---

## 7. Progress log

Filled in as we go. One row per version, in your words not mine.

### Round 0 — everything before this plan (8 versions, 9 Aug)

The equipment-building era. Frozen set of 70 bags, automatic size checks,
photo tracer, outline scorer, blind comparison tool, mesh export. Useful
machinery, almost no visible improvement to the bags. 17 of your 28 votes were
ties. **Kept as the baseline to beat.**

| Version | What changed | Gaps found | Gaps closed | Your verdict |
|---|---|---|---|---|
| v0 (rounds 1–8) | measuring equipment | — | — | "hasn't really made much progress" |
| v1 | harvest 134 → 989 images; outlines from drawings; **first real critic round** | **70** | — (baseline) | |
| v2 | drawing-derived outlines wired in; 10 builder fixers in parallel | 70 | **57** | |
| v3 | size pass, plus two systemic harness bugs found | 70 | size 28, shape −11 | blind A/B pending |
| v4 | seat pack profile restored; shape gate built; camera fixed | 70 | seat packs 11/11 on shape | not yet judged |

### v4 — flat on the gates, but the instruments got fixed

Gates against v3: **improved 1, regressed 3, unchanged 66.** Essentially flat.
The value of the round was in the apparatus, not the bags.

- **Seat packs pass the shape gate 11/11** — the first slot ever to do so, and
  the fault that has flip-flopped for three rounds is closed and now *guarded*.
- Down tube packs no longer clash (67% → 100%), though they remain 2.4× too
  tall, which is now four rounds unfixed.
- Bar rolls finally attach (100%) but two of five now clash — the mounts reach
  the bar and overshoot into it.

**The shape gate is not yet trustworthy everywhere, and must not drive work
until it is.** It reads seat packs 0.86, top tube 0.77, down tube 0.73 — all
plausible — but frame packs 0.53, while the critics gave eight frame packs a 4
out of 5 and John preferred the new frame packs on 15 of 16 in blind A/B. When
a metric disagrees with both the model judge and the human, the metric is wrong.
The profile descriptor (principal axis, perpendicular half-extent) suits an
elongated bag with one obvious mounting end and does not describe a triangular
frame bag. Validate it against the human labels before optimising against it —
which is exactly the mistake the 0.81 outline score caused in the first place,
and it would be embarrassing to repeat it with a better-looking metric.

**Two instrument bugs fixed this round, both of which had been corrupting every
previous round:**

1. `axisOf()` accepted only `x`/`y`/`z`, so the tube-relative axis labels that
   MODEL-SPEC.md documents and 42 of the 70 records use were resolved to null
   and **never size-checked**. The `—` in the length column was not "no error",
   it was "never measured". With it fixed, down tube packs show −44% length and
   fork bags +53%, neither of which had ever appeared.
2. The four camera angles were one camera (see v3).

### v3 — the first 4s, and a shape regression the gates could not see

| | v1 | v2 | v3 |
|---|---|---|---|
| scored 1 | 15 | 7 | **5** |
| scored 2 | 51 | 33 | 29 |
| scored 3 | 4 | 30 | 28 |
| **scored 4** | 0 | 0 | **8** |
| the right size | — | 30/70 | **58/70** |

**The first bags to reach 4 out of 5** — eight of them, all frame packs, and
zips are now drawn on 23 of 23. Half and full frame packs are the two slots
that have never been broken by a later round.

**John's blind A/B on v2** (88 votes, all 70 bags): v2 beat v1 **73 to 15,
with zero ties**. In v1 he had tied 17 of 28. The changes are now big enough
for a human to see, which was the anti-tie rule's whole purpose.

But 8 of his 15 losses were seat packs — the slot the critics had scored
11/11 fixed. **The human and the model judge disagreed, and the human was
right.** That is the calibration number the plan has been asking for since
§1.6, and it says: do not trust the critics unsupervised yet.

**Two systemic bugs found, both worth more than any bag fix:**

1. **The four camera angles were one camera.** `applyCam()` set the view, then
   the `?focus=` block overwrote `camera.position` unconditionally — and the
   shot tool always passes `focus`, so `cam` was silently discarded. Side, tq,
   rear and front differed by 5% of pixels, and that 5% was the bag changing
   between runs. **Three rounds of critics believed they were judging four
   views of each bag and were judging one.** Fixed by orbiting the focus
   position, with `tq` preserved exactly so old runs stay comparable.
2. **v3 reversed the seat pack taper back to wrong.** `seatpack.js` stopped
   calling `measuredProfile` altogether; the fixer replaced the drawing-derived
   sweep with a hand-written curve running the other way. The gates reported
   *zero* regressions because they measure size, clash and attachment — not
   shape. That file has taken 769 insertions across three rounds of agents
   undoing each other, and the churn is the bug.

**The lesson v3 paid for:** a fix round optimises what is measured and quietly
breaks what is not. v2's gates could not see shape; v3's could not either.
`eval-silhouette.mjs` already computes outline-vs-drawing agreement and simply
is not wired into the pass/fail gates. Until it is, every round can trade shape
for size without anyone noticing.

### v1 critic round — the baseline, and it is bleak

12 critics, all 70 bags, each judged against the maker's engineering drawing
and on-bike photos. **Not one bag scored above 3.**

| Score | Meaning | Count |
|---|---|---|
| 5 | indistinguishable | **0** |
| 4 | right product, one detail off | **0** |
| 3 | recognisable family, wrong specifics | 4 |
| 2 | right category, wrong object | 51 |
| 1 | not recognisable, or broken | 15 |

Every single builder has a median of 1 or 2. That is the honest number we
never had, and it is the thing the old 0.81-out-of-1 outline score was hiding.

**Where the work actually is:**

| Layer | Count | What it means |
|---|---|---|
| A | 19 | our written record is wrong — fix data, not code |
| B | 41 | the record is right, the drawing code doesn't follow it |
| C | 10 | we have no way to express this at all — design work |

**The common faults — this is the valuable part.** Each is one sentence that
moves a whole builder, and several move the entire catalogue:

1. **Seat packs (11):** all drawn back-to-front. The records say taper
   `nose:1 / tail:0.33`; every drawing says the opposite. *Confirmed
   independently — this is the same fault the drawing revealed earlier.*
2. **Top tube packs (14):** drawn as a wedge tapering to a knife edge, when
   the real ones hold constant depth and chamfer only the rear corner. Plus
   **every bolt-on SKU has straps drawn on it** though it bolts to frame mounts
   and its own record says `straps: []`.
3. **Half frame packs (16):** drawn as slabs deepest at the seat tube. Every
   drawing shows a rounded triangle, shallow at *both* ends with its belly
   two-thirds forward and its lower edge lying along the **down tube** — which
   is why the down-tube strap we do draw is a loop floating in mid-air.
4. **Full frame packs (7):** **not one has a zip drawn on it.** Zips are the
   whole face of these bags.
5. **Bar rolls (5):** the bag is impaled on the handlebar — centred on the bar
   axis instead of hanging below it, so the bar passes through the bag and out
   the front face.
6. **Down tube packs (3):** never touch the tube (daylight along the seam) and
   the tail runs through the bottom bracket into the cranks.
7. **Stem bags (4):** round revolves ~70% too deep; the flat-backed chamfered
   case with its drawcord collar is entirely undrawn.
8. **Fork/tool packs (3):** lathe-turned solids of revolution — "the cargo cage
   packs read as water bottles and the tool pack as a traffic cone".
9. **Front rack packs (2):** sealed hard boxes; no roll-top, no mesh fold-over.
10. **Bar bags (5):** all the same parallel-sided box; no flaps, no taper.

**The layer-C ten** (no concept exists): bags that mount to *other bags* (the
front accessory pack), aero modules needing aero bars the bike doesn't have,
bolt-on baseplates as a mounting type, and the rear top-tube position.

### v2 — 57 of 70 gaps closed, and one honest failure

Ten fixers, one per builder, working only on their own file. Then the same 70
bags re-rendered (9m36s) and re-judged by six critics who were told what round
1 had claimed and asked to *verify it rather than trust it*.

| | v1 | v2 |
|---|---|---|
| scored 1 (broken/unrecognisable) | 15 | **7** |
| scored 2 | 51 | 33 |
| scored 3 | 4 | **30** |
| scored 4 or 5 | 0 | 0 |
| record wrong (layer A) | 19 | **4** |

**Gaps closed, per builder:**

| Builder | Round-1 fault | Closed |
|---|---|---|
| seat packs | reversed taper | **11 / 11** |
| half frame packs | flat bottom, floating strap | **16 / 16** |
| top tube packs | full-length wedge | **14 / 14** |
| top tube packs | straps on bolt-on SKUs | **5 / 5** |
| full frame packs | no zips | **7 / 7** |
| stem/downtube/fork/tool | various | 8 / 10 |
| front rack packs | no roll-top, phantom straps | **0 / 2** |
| bar rolls | impaled on the handlebar | see below |

**The one that matters most is the failure.** The bar rolls are no longer
impaled on the handlebar — that fault is closed 5 out of 5. But they now
**float 26–29 mm below it**, attached to nothing. The automated geometry check
caught it first; the critic then confirmed it independently and, correctly,
refused to score the fault as closed. Trading impalement for levitation is not
a fix, and the loop said so without being told what answer to give.

The same shape appeared on the e-bike charger pack, in the opposite direction:
its gap to the down tube closed by the bag being driven **into** the tube
(−9.5 mm, interpenetrating). Both are the classic failure of fixing what a
critic described rather than what was wrong.

**Size is now the dominant fault, and no critic mentioned it in either round.**
Only 30 of 70 bags are dimensionally sane; heights run 26–56% over on frame and
top tube packs. The eye-based critics were judging shape against drawings, not
size against numbers — a structural blind spot, and exactly why the free
programmatic gates run alongside. Two graders, two blind spots, and they do not
overlap.

**For v3:** re-attach the bar rolls without re-impaling them, back the sizes
down to published dimensions, and the newly-surfaced faults now that shape no
longer dominates — no zips on half frame packs, everything reading as glossy
moulded plastic rather than matte coated fabric, and the two-tone colourways
that tell the ranges apart.

**v1, so far — two of four pieces done.**

1. ✅ **The harvest.** `tools/harvest-apidura.mjs` — 45 pages, 989 images,
   0 failures, all 70 bags, manifest at `data/apidura-media.json`. Already
   overturned one wrong record affecting 78 bags.
2. ✅ **Ground-truth outlines from the drawings.**
   `tools/diagram-outline.mjs` — **47 bags now have an outline measured off
   the maker's own engineering drawing** instead of traced off a photograph,
   in `data/diagram-profiles.json`.
3. ◻︎ Mounting research briefs, one per bag type.
4. ◻︎ Wire the new images into the review tool so critics and you see all of it.

**On piece 2, and why it's trustworthy.** The drawings are generated files
where the layers are named `cls-1`…`cls-6` *differently in every file*, so
they're selected by what they do, not what they're called: thin solid strokes
are the bag, the 2px strokes are dimension arrows, the dashed ones are the
roll-out extension, the filled ones are the "15 cm" text. I verified that by
rendering each layer alone.

The measurement then checks itself: each view's shape is compared against the
published numbers, and anything that disagrees by more than 25% is **refused
rather than guessed**. 47 measured, 11 refused, and the refusals name their
reason. Most land at 90–99% agreement.

Two honest caveats, both recorded per-bag in the output rather than hidden:

- **Roll-top bags are drawn rolled down.** The saddle pack's solid outline is
  36 cm; its published length is the 42 cm rolled-out figure. Comparing them
  naively reads as a 15% error that isn't one. The tool now detects the state
  — that alone took the saddle pack from 85% to **99%** agreement.
- **Side view vs top view can be a coin toss.** When a bag is about as wide as
  it is tall (saddle pack: 15 cm wide, 16 cm tall) the two views have almost
  the same proportions and can't be told apart by proportion alone. 12 bags
  are flagged `AMBIG`. Fixing it properly is the next job: a top view is
  symmetric about its centreline and a side view isn't, so symmetry can
  separate them.

### Notes worth keeping for the write-up

- The moment the numbers and your eye disagreed (0.81 vs 1/5) is the story.
  A good-looking metric that doesn't track the human is worse than no metric,
  because it feels like progress.
- Seven versions of measuring equipment before one version of actual bags is a
  very easy trap to fall into and worth being honest about.
- We spent eight rounds arguing about the shape of a bag whose manufacturer
  publishes a dimensioned technical drawing of it. Nobody thought to look.
  Before building an elaborate way to infer something, check whether the
  answer is published.
- The wrong record survived eight rounds because it was *plausible* — the flat
  mounting tongue really does look like the fat end in a studio photo. Wrong
  answers that survive are the ones with a good story behind them.
