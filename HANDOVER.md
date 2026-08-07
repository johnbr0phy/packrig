# Packrig — Handover

Run: `node tools/serve.mjs` → http://localhost:8735 (no build step; refresh picks up `src/`).

## READ THIS FIRST: how reliable is this session's work?

A lot was fixed, but a meaningful share of the errors found were introduced by
THIS session, not inherited. Counted honestly:

- **4 self-inflicted regressions** — `buildToptube` given `anchorName` in the
  `side` slot (crashed "Surprise me" whenever it rolled a top tube bag); a TDZ
  crash in ui.js; the seat-pack tyre clamp that measured at the nose only; the
  roll-range rule specified wrongly in the first place.
- **3 silent data losses in `apply-verified.mjs`** — alphabetical file order let
  later passes overwrite corrections; the backup clobbered itself on re-run;
  slot-only records were dropped because `dims_cm` was required.
- **2 identical axis fumbles by me** (Carradice SQR, AGU pannier): swapped two
  of three axes and left the third, producing `wid == len`. Caught on readback
  both times, which was luck. **Always rewrite a dims triple whole, never as
  two swaps.**
- **My validator thresholds caused more "failures" than the data did** — 21 of
  33 in one chunk, 30 of 37 in another.

Fixes verified individually by render are solid. Changes touching SHARED
contracts (builder signatures, merge rules, thresholds) are where to look first
if something seems off.

## TOP PRIORITY: audit axis mapping in all 13 builders

`p.mm.len` / `wid` / `hgt` do NOT mean the same world axis in every slot, and
three builders mapped them wrongly — each producing a completely different
visual symptom, each found only because the user spotted it:

| Builder | Wrong assumption | Symptom |
|---|---|---|
| `buildForkbag` | `len` is the long axis | negative capsule length → rendered a **sphere** |
| `buildBarbag` | flap params pre-swapped AND rotated 90° | lid jutting forward as a **shelf** |
| `buildSaddlebag` | `len` is fore-aft | **suitcase** projecting backward; should be wide across the bike |

Two more of the same class were found in the DATA by review agents (Chrome
Holman Pannier lying on its side; Giant Transporter reading 40cm as depth).

**Five confirmed instances. Assume the other ten builders are not clean.**
For each builder, write down which catalogue axis maps to which world axis and
check it against a maker photo in `assets/products/`. This is a couple of hours
of work that would end the whack-a-mole.

Related and nearly as common: geometry positioned by a hard-coded offset, or
rotated onto the wrong axis, instead of derived from the bike — see below.

## The pattern behind most visual bugs

Six-plus bugs this session were **one mistake**: geometry placed by a hard-coded
offset, or rotated onto the wrong axis, instead of derived from the bike. They
present as unrelated glitches and are all the same fix. Each was found by the
user spotting it, not by any test.

Examples fixed: bottles inside the tubes (`perpOffset` ignored the cage depth);
saddlebag skewered by the seatpost (`grp.position.x = 30`); bar roll floating
(resolver treated the bar as an obstacle); Many Things Sack a sphere
(`CapsuleGeometry` got a negative length because `len` wasn't the long axis);
cage rail drawn as a cross (two stray 90° rotations); cage on the wrong side of
the bottle (`flip = -1` inverts which local axis faces the tube).

**The highest-value next task is a placement + orientation audit across all 13
builders** — check each against the bike geometry it should derive from.

## Open bugs, most actionable first

1. **Downtube bag hits the front wheel.** Measured: down tube is 621mm; anchor at
   310mm along it leaves only **55mm** to the tyre, but downtube bags run to
   400mm. No anchor position works while the bag is *centred* on the anchor —
   `buildDowntube` must anchor the bag's FRONT edge and extend it backward
   toward the BB. Clearances: 250mm→86mm, 310mm→55mm, 360mm→34mm.
2. **Drop bars intersect the bar roll** now that it sits correctly at the bar.
   Clamp bag length against usable bar span, or move the mount forward of the hooks.
3. **Seat pack silhouette** — `assets/products/apidura/expedition-saddle-pack-16l-1.jpg`
   shows a hard wedge; ours renders as a fat tube. `tailWid` (0.34–0.46) is far
   too weak and the nose needs a squared shoulder.
4. **Frame pack taper direction** unverified — the maker photo will settle it.
5. **Front fork styling** — user asked for it to "feel cleaner". Not started.

## Fitment: the catalogue has no model of what a bag mounts to

Products carry a `slot` string and nothing else, which caused: the Brompton bag
being offered (now `fits: "brompton"`, filtered in `catalog.js`), the Rear TT
Sack having no matching mount (now `toptube_rear`), and the Many Things Sack
slotted `forkbag` when it sells only as a pair.

**Many Things Sack — RESOLVED (7 Aug).** It is a fork bag; `slot: forkbag` is
correct. The photo shows an upright tapered sack with a fold-down triangular
flap, one vertical buckle strap and side webbing loops for cage retention — no
rack hooks, no rail clips, no flat back panel. It slides over a King Many Things
Cage on a single fork leg. "Sold as a pair" is a purchase quantity (one per fork
leg), not a two-compartment product, and the 3.4L capacity is **per bag**. Its
long axis is `hgt` 25.4cm — treating `len` as the long axis is what previously
collapsed it to a sphere. Closure is a flap-and-buckle, not the roll-top the
source data claimed.

**Still undecided:** 7 bags need a front BASKET (Wald 137/139, Manivelle), not
just the rack we draw — Swift Sugarloaf, Outer Shell 137 + Rack Bag, Wizard
Works Alakazam ×2, Rockgeist Meanwhile ×2. Either mark them `fits: "basket"`
or model a basket on the front rack.

## Data pipeline

| Tool | Purpose |
|---|---|
| `tools/validate-dims.mjs` | Flags implausible dims. **53 of 702 currently flagged.** |
| `tools/apply-verified.mjs` | Merges `data/verified/*.json` into `brands.json`. Idempotent, `--dry`. |
| `tools/export-csv.mjs` | → `data/packrig-products.csv`, provenance per row |
| `tools/fetch-images.mjs` | Downloads maker photos → `assets/products/` |
| `tools/shrink-images.mjs` | Caps longest side (900px). **Cannot process .webp.** |
| `tools/add-brands.mjs` | Merges `data/newbrands/*.json`. `--only <file>` to gate. |
| `tools/audit-fit.mjs` | Equips every product, reports which the resolver drops |
| `tools/audit-slots.mjs` | Slot misclassification: line-outlier + name-mismatch. **15 flagged, all now explained** |
| `tools/fix-roll-ranges.mjs` | Rewrites roll dims to the CLOSED end. 30 records still need `dims_raw` ranges |
| `tools/_rand.mjs` | Stress harness: 25x "Surprise me", reports page errors + panel/bike mismatch |
| `tools/_focus.mjs` | Drives hover/click focus headlessly and asserts panel sync |

**Two traps already hit — don't repeat them:**
- `apply-verified` reads files alphabetically and later files OVERWRITE earlier.
  `dimfix-*.json` are now forced to load last. Any new correction pass must too.
- An early automated pass **fabricated** a dimension (SILCA Grinta `len`,
  back-computed from an assumed volume) and it survived until a photo caught it.
  Treat derived numbers as suspect.

### Error classes found in maker data
unrolled maxima · fully-extended maxima · pair volumes quoted as single ·
flat-laid panel figures · transposed/duplicated axes · **flat-folded**
measurements (Lezyne) · specs published only inside images (Outer Shell,
Apidura SVGs with numerals as outlines — render them to read them).

## State

50 brands / 702 products · 520 verified records · 43 dimension flags (from 138)
· 15 slot flags (all explained as false positives or fixed)

Camera focus (`src/focus.js`): hover half-selects a bag, click selects it and
centres the zoom on it, and the "On your bike" panel mirrors both ways. Product
photos now appear in the kit list.

Older counts below:
50 brands / 702 products · 495 verified records · 1,457 local images (~198MB) ·
2,333 colourways live in the UI · all 13 slots covered.

UI has brand-first *and* type-first browsing, real product photos, colourway
pickers, bidon colour, and a "Doesn't fit this frame" state instead of silently
deleting unplaceable bags.

## In flight

`dimfix-4` is the only agent still out (chunks 1-3 merged). It is working chunk 4
against the local product photos. Chunks 1 and 2 are merged. When they report:
`node tools/apply-verified.mjs && node tools/export-csv.mjs`.

**Calibration note — the validator was the main source of noise.** In chunk 1,
21 of 33 "failures" were my thresholds; in chunk 3 it was 30 of 37. Now
recalibrated against maker-confirmed evidence: the `framebag_full`,
`framebag_half`, `toptube` and `downtube` elongation rules are REMOVED (a main
triangle tops out ~1.45; front-corner triangles are legitimately ~1.0; the whole
Revelate wedge family sits 1.25-1.95). Only `seatpack` 1.6 and `barroll` 1.5
remain. If you add a threshold, calibrate it against published figures first.

**Three fabricated dimensions found so far** (SILCA Grinta `len`, WOHO XTouring
UL Pannier, and Randi Jo Jeff 'n Joan's `wid`) — all back-computed from volume by
an early automated pass and all caught only by comparing against the maker.
Treat any dimension with no traceable source as suspect.

**`dims_verified: "maker"` does not mean what it says.** The Jeff 'n Joan's
`wid` of 7.6cm was back-calculated from volume *and carried
`dims_verified: "maker"`* — the maker publishes 5.5 in / 14.0 cm directly, an
84% error on that axis. **444 of 702 products carry that flag**, so it cannot be
used as evidence that a figure was checked. Only a per-product `evidence` entry
naming a photo or a page means anything.

**Still unresolved by design:** Revelate Rifter depth (3.8cm cannot reconcile
with the rated capacity; no maker or retailer publishes it — ask Revelate).
