# Making the other 49 brands look right

`APIDURA-GAUNTLET.md` is the record of getting one brand from "not
recognisable" to "right product, one detail off". This is the same loop
generalised to every other brand, written down while running it on Tailfin
first. Read the Apidura doc for the reasoning; this one is the procedure.

**Why Tailfin first.** John looked at the app and named it: "lots of bags from
other brands don't really look much like the company's bags, e.g. Tailfin."
Tailfin is also the second-best-documented brand in the catalogue — it
publishes labelled two-view engineering drawings for most lines — so like
Apidura it is a place where the method can be calibrated before it goes
somewhere the evidence is thin.

---

## Step 0 — harvest, and assert coverage

`tools/harvest-brand.mjs --brand <Name>`

The Apidura harvester matches media **filenames** against the product slug.
That works on Apidura because Apidura names its media after the product. It
does not generalise: Tailfin's half frame bag page calls its files
`HFP-FEATURED-IMAGE.jpg`, `SIZES-HFP.jpg`, `hfp-Explore-Hero-Retina-copy.jpg`.
A slug matcher keeps none of them.

So the generic harvester scopes by **cross-page frequency** instead of by name.
Site furniture — mega-menu tiles, warranty badges, the related-products rail —
is exactly the media that appears on many product pages. A photograph of one
product appears on one or two. On a 16-page brand the cut is "on more than 6
pages ⇒ furniture", and it needs no per-brand knowledge.

**What it bought on Tailfin: 37 distinct images → 485.** The catalogue held 156
files of which 119 were duplicates of three generic marketing shots. Every one
of the 16 product pages now has at least one dimension drawing, which the brand
record had asserted did not exist.

Then rasterise: `sips -s format png --resampleWidth 1800 <f>.pdf --out <f>.png`.
The print-at-home sizing templates are PDFs and a vision model cannot open a
PDF the way it opens a JPEG. **A file that is present and never opened is the
worst failure mode available** — this project has now hit it four times (SVG
diagrams, mis-slugged pages, a stale frozen set, a dropped record key).

### The coverage assertion, which is not optional

A scraper that finds nothing looks exactly like a page that has nothing. After
every harvest, print per page: how many dimension files, how many on-bike, how
many studio. Three Tailfin pages came back with 5–13 keeps against a median of
35 — that is not a thin page, that is a gallery this harvester did not see.

So the assertion is wired in rather than left to whoever reads the log. Any
page under 15 keeps is topped up from `/wp-json/wp/v2/media?search=`, which is
the WordPress media library itself and the same endpoint on every WordPress
site. It has two advantages over the page HTML: it returns what a WooCommerce
variable product loads from JS and never puts in the markup, and it returns a
human-written **title** per image, so classification can read "Front View of
Tailfin Handlebar Bag on Gravel Bike" instead of the filename `front-view`.

**The Bar Bag System page went from 8 images to 110** — and it is the exact
product John named. Eight of its original ten keeps were of the accessory
mount rather than the bag; the top-up brought in the spec drawings, the size
lineup and about thirty photographs of the bag on a bike.

The trade is precision for recall: a keyword search also drags in spare bolts
and the neighbouring product's photography. That is the right trade at this
stage — a critic can skip an irrelevant photo, but it cannot open one that was
never fetched.

---

### Downscale before anyone opens them

A harvest pulls originals, and makers publish at 3840 px. Resample to 1400 px,
and dimension drawings to 2200 px so the labelled millimetres stay readable.
Tailfin's 214 MB came down to 158 MB with nothing lost that a critic could
have used. Do this **before** the critique round, not after: the cost that
matters is not disk, it is a vision agent holding forty 4K images in context.

---

## The memory budget, which is a hard constraint and not advice

**This machine has 8 GB.** John's own browser holds ~3 GB, and there may be a
second Claude session running its own headless Chrome. That leaves very little.
The 7 Aug crash was 19 vision agents plus 3 headless Chromes; on 11 Aug I
repeated it in miniature with 6 critics plus a whole-brand render, and the
machine ran out of application memory again. The lesson did not need relearning
and the rules below are what it costs to stop relearning it:

1. **Never call `tools/bagshot.mjs` directly. Call `tools/bagshot-q.mjs`.**
   It holds a global lock and refuses to start below 1200 MB free, so it
   serialises against the other session as well as against itself. Calling
   bagshot directly is what bypassed both.
2. **One critic agent at a time**, and give it a slot, not a brand. A slot is
   2–9 products and 30–50 images; that is already a lot to hold.
3. **Render in slot-sized chunks**, never `--brand <Name>` in one go. 39
   products × 4 angles is one Chrome held open for ten minutes.
4. **Use `--no-shots` when only the numbers are wanted** — clearances, bounding
   boxes on mount axes, clash detection. Most gate checks need no pixels.

---

## Step 1 — render the brand as it stands

`node tools/bagshot-q.mjs --slot <slot> --brand <Name> --out shots/<brand>-v0/`,
one slot at a time.

This is the baseline to beat and it also produces free numbers: bounding boxes
on the bag's own mount axes, and clearances to every part of the bike with
penetrations called out. Those catch the faults the eye-based critics
systematically miss — on Apidura, size was the dominant fault for two rounds
and no critic mentioned it in either.

---

## Step 2 — bundle, so that no evidence is silently skipped

`node tools/critic-bundle.mjs --brand <Name> --shots shots/<brand>-v0`

One markdown file per slot naming, for every product: our four render angles,
the record we hold, the measured size of what we drew, and every maker image —
dimension drawings first. **If the bundle does not name the file, no critic
opens it.**

---

## Step 3 — critique, one agent per slot, fresh context

`evals/bundles/<brand>/CRITIC-BRIEF.md` is the prompt. The rules that make it
adversarial rather than decorative:

1. The critic **must not read `src/`.** A critic that has seen the builder
   starts explaining why the shape is reasonable.
2. Per product: a score 1–5, **the single biggest gap** (one sentence, not a
   list of twelve), and a **layer** — `A` the record is wrong, `B` the record
   is right and the drawing does not follow it, `C` we cannot express this at
   all. The layer is what makes the round efficient: it aims the fix.
3. `measured_dims` is only for numbers **read off a labelled drawing**, with
   the file named. Empty beats estimated.
4. Refuse rather than guess, and name what evidence is missing.

---

## Step 4 — fix by layer

- **A (record)** → the brand's `data/models/<slug>.json`. Cheap, high-yield,
  and on a well-documented brand it is most of the win.
- **B (builder)** → `src/bags/builders/<slot>.js`. One fix moves every product
  in the slot across all 50 brands, which is the leverage — and the risk.
- **C (vocabulary)** → MODEL-SPEC / BUILDER-BRIEF. Design work, not a round.

### The rule that exists because of Apidura

> **A number measured off one brand's drawing goes in the RECORD, never in the
> builder.** Branching on a brand or line name inside a shared builder is the
> same bug wearing a different hat.

This is not hypothetical here. `framehalf.js` is written end-to-end around the
Apidura half frame pack — "a downward-pointing kite, shallow at both ends, with
the deepest belly between 40% and 75% of the length and a straight lower-front
edge lying along the down tube". Tailfin's Half Frame Pack is not that object.
The fix is a `geometry.profile` the record can state, not an `if (Tailfin)`.

---

## Step 5 — re-render and check the NAMED gap

Not an average score. The critic said the nose is too pointed; after the fix,
ask whether the nose is still too pointed, yes or no. The progress number is
**gaps closed / gaps found**.

---

## Step 6 — John gates it

Blind A/B on the bags that changed most, plus ten scores for calibration. If
the model judge stops agreeing with the human, fix the judge before trusting
another round. On Apidura the two disagreed once, on seat packs, and the human
was right.

---

## Order of brands

Best-documented first, so the method is calibrated where the evidence is
strongest, and so the fixes that generalise are found early:

1. **Tailfin** — labelled drawings on most lines. *In progress.*
2. Ortlieb, Restrap, Topeak, Revelate, Rockgeist, Oveja Negra, Brooks — the
   remaining brands that already have review records.
3. The rest, where ground truth is photographs and spec text only. Expect lower
   ceilings and more human adjudication, per APIDURA-GAUNTLET §4b.

---

## Log

### Tailfin — round 0 (11 Aug)

- Harvest: 37 distinct images → **485** across 16 pages; 22 sizing PDFs
  rasterised. Every page now has a dimension file.
- Baseline render: 39 products, 37 clean / 2 clashing (both Downtube Packs
  drive their tail through the front tyre by 22 mm).
- The automated gate alone, before any critic looked: the six Half Frame Packs
  all render 11.5–12.0 cm deep whatever their size, against a published range
  that grows from 11.9 to 20.1 cm; the Rear Top Tube Bags render 2.3× their
  recorded length.
- **The record asserts Tailfin publishes no linear dimensions for the nine
  frame bags and the two rear top tube bags.** The harvest found labelled
  two-view drawings for all of them. That is a layer-A finding worth 11
  products, and it existed only because step 0 had never been run for this
  brand.

**Critics: 3 slots of 8 landed before the machine ran out of memory** (see the
budget above — that is what it cost). Every score was 1, 2 or 3; not one bag in
the three slots reached 4.

**Layer-A fixes applied and verified, 11 products:**

| Product | Was | Drawn | Result |
|---|---|---|---|
| Fork Pack 5L / 10L | 15×15×28 / 19×19×35 | 17×12×38 / 21×15×40 | length error −31% → −4% |
| Cage Pack 1.7L | 9.5×9.5×24 | 7.5×7.5×29 | −21% → −3%, and 27% too fat corrected |
| Cage Pack 3L / 5L | 11.3×11.3×30 / …×35 | 12×12×32 / 13.5×13.5×38 | −11%/−12% → −5% |
| Downtube Pack 1.7L | 38×7.5×6 | 29×7.5×7.5 | **22 mm into the front tyre → 3.4 mm clear** |
| Downtube Pack 3L | 44×9×7.6 | 32×12×12 | still clashes — see below |
| 4 panniers | (right already) | measured taper added | — |
| 3 Bar Cage Bags | rolls 3 | rolls 2 | per the maker's own drawing |

**The 3L Downtube Pack is the honest failure, and it is worth recording as
one.** After the length correction it still renders 22.5 mm inside the front
tyre. The builder solves the pack back down the tube until it clears, floors
that at the bottom-bracket end, and then refuses to fake the remainder. The
cross-check says it is right: the 1.7L at 290 mm clears by 3.4 mm on the same
frame, and 320 − 290 = 30 mm against a 3.4 + 22.5 = 25.9 mm swing. **A 320 mm
V-Mount pack does not fit this frame**, which is why Tailfin ship a fit
template for the line. That went into the record as `fit_constraint`, not into
the builder as a fudge — shortening `dims_cm` to make a render come out clean
is the exact move MODEL-SPEC forbids.

**Still open:** critics for `framebag_half` (9), `toptube`+`toptube_rear` (8)
and `trunk` (4) never wrote their findings. The layer-B and layer-C faults the
three landed critics found — every bar bag strapped around the bar when both
Tailfin families hang off a rigid bracket forward of it; every fork and cage
pack a lathe-turned barrel when all five are flat-backed roll-top slabs; the
pannier builder inflating its record by 20–28% — are untouched.
