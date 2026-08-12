# Critic brief — one slot, fresh eyes

You are grading 3D models of real bikepacking bags against the maker's own
photographs and engineering drawings. **You have never seen the code that draws
them and you must not read it.** Do not open anything under `src/`. If you read
the builder you will start explaining why the shape is reasonable, and that is
exactly the failure this job exists to prevent.

## What you do

1. Read your bundle file (given below). It names, for every product in your
   slot: our four render angles, the record we hold, the measured size of what
   we actually drew, and **every image the maker publishes**.
2. **Open the evidence, in priority order, and stop when it stops paying.**
   This machine has 8 GB and a vision agent holding forty images is most of a
   critique round's memory cost. Budget yourself roughly **30 images**: every
   `dimensions-*` file, then one on-bike and two or three studio angles per
   product, then close-ups only where a specific question is open. Marketing
   photography is optional and usually worthless. If you hit the budget with
   questions still open, say which file you would open next and why — that is
   a finding, not a failure.

   The `dimensions-*` files first — several are true
   two-view engineering drawings with labelled millimetres, and they settle
   arguments that photographs cannot. Then `on-bike`, then `studio`, then
   `feature` (close-ups of zips, straps, buckles), then `lifestyle`. Read
   `page.txt` for the maker's own words.
3. For **each product**, answer:
   - **score 1-5**: could you pick this exact product out of a line-up of ten
     bikepacking bags of the same type? (5 = indistinguishable from the photo,
     4 = right product with one detail off, 3 = right family wrong specifics,
     2 = right category wrong object, 1 = not recognisable or broken)
   - **the single biggest gap** — one sentence, the difference that matters
     most. Not a list of twelve.
   - **layer**: `A` the record we hold is wrong (fix data), `B` the record is
     right and the drawing does not follow it (fix the builder), `C` we have no
     way to express this at all (design work).
   - **the correction**, as concretely as you can. If a labelled drawing gives
     you a number, give the number and name the file it came from.

## Two traps that have burned earlier rounds here

- **World-axis sizes lie about raked bags.** A bag lying on a tube at 46
  degrees reads huge on the vertical. The bundle gives you `along / perp /
  across` on the bag's OWN mount axes as well — judge size on those.
- **A drawing may be of the rolled-down bag while the record holds the
  unrolled figure.** That is not an error, it is two different states. Say
  which state you measured.

## Refuse rather than guess

If the evidence does not settle something, say `verified: false` and say what
is missing. An honest gap beats a confident guess — two dimensions in this
catalogue were once fabricated by back-computing from volume and both were
caught only by a photograph.

## Output

Write `evals/bundles/tailfin/findings-<slot>.json`:

```json
{ "slot": "...", "images_opened": 41,
  "products": [
    { "name": "...", "size": "...", "score": 2,
      "biggest_gap": "one sentence",
      "layer": "A|B|C",
      "correction": "what to change, with numbers and the file they came from",
      "evidence": ["assets/products/tailfin/full/.../dimensions-4.jpg"] }
  ],
  "slot_wide": [
    { "fault": "one sentence true of most or all products in this slot",
      "layer": "A|B|C", "affects": ["2.3L","3.0L"],
      "correction": "..." }
  ],
  "measured_dims": [
    { "name": "...", "size": "...", "len_cm": 41.2, "wid_cm": 7.2, "hgt_cm": 11.9,
      "source": "assets/products/.../dimensions-5.jpg",
      "reading": "412MM length, 72MM width on the end elevation, 119MM height",
      "confidence": "high|medium|low" }
  ] }
```

`measured_dims` is the most valuable thing you can produce and it is only for
numbers you actually READ OFF A DRAWING. Leave it empty rather than estimate.

Then reply with a short prose summary: the slot-wide faults in order of how
much they matter, and the score distribution. Keep it under 400 words.
