# Packrig v2 — decisions

Plan of record for the "bags + packing" run (started 25 Sep 2026). Written
BEFORE the code, then kept current as the run makes calls. Each entry says what
was decided and why, so the next person can disagree with a reason instead of
with a hunch. Companion files: `SCREENS.md` (the shot list), `LOG.md` (what
broke and why), `WRITEUP.md` (the short version).

The owner was not available for questions. Where a call was a guess it says so.

---

## 0. Environment facts that shaped everything

- **The box is Linux with no GPU.** Every tool hard-coded the macOS Chrome
  path. `tools/lib/chrome.mjs` now resolves Chrome per machine, and on Linux it
  points at `tools/lib/chrome-linux.sh`, which adds `--no-sandbox`, SwiftShader
  WebGL and disables Chromium's canvas-noise feature (it perturbs readback, and
  "same input, same pixels" is a requirement). 44 tools were rewritten to use it.
- **Software GL is slow.** One bagshot product with four angles is ~75 s;
  numbers-only is ~13 s. A full-catalogue shot sweep is ~13 hours, so sweeps run
  `--no-shots` and shots are taken for the largest / smallest / most
  distinctive products per slot, exactly as the brief asks.
- **Maker photography is unreachable from this environment.** The egress policy
  blocks every maker and retailer CDN (`cdn.shopify.com`, `medias.apidura.com`,
  `media.tailfin.cc`, `rockgeist.com`, … — 1,423 of 1,430 image fetches were
  refused; 7 Revelate photos on S3 got through). `WebFetch` is blocked for the
  same hosts; only `WebSearch` (result snippets) works. Consequences:
  - Photo-vs-render comparison uses what the repo already holds from the
    previous runs that *did* see the photos: the **108 outlines traced off
    maker photos and maker dimension drawings** (`data/profiles.json`,
    `data/diagram-profiles.json`), the per-product reviewer records in
    `data/models/*.json` (written with the photo open), `reference/*.png`
    (real loaded bikes), and the 7 photos that downloaded. The silhouette score
    is computed against the traced outlines, which is a stricter test than
    eyeballing a JPEG anyway: it is orthographic and dimensioned.
  - Weights and gear specs are sourced from search-result snippets (maker
    pages, retailers, reviews, bikepacking.com, forums), with the URL recorded.
  - `tools/fetch-images.mjs` gained `--no-rewrite` so restoring the photo cache
    on a machine that can reach the CDNs never repoints `brands.json` at local
    files the live site cannot serve.
- **HDRIs** are gitignored and polyhaven is blocked; the downsampled HDRIs the
  deploy ships in `docs/assets/hdri/` are copied into `assets/hdri/` so the app
  boots. Lighting work is judged on these.

## 1. Order of work

1. Plumbing (tools on Linux, this file, SCREENS.md, LOG.md).
2. Research in the background (web only, no Chrome, no images):
   gear catalogue ×3 agents, bag weights ×3 agents. They write one file each
   and never touch `src/`.
3. Data model + v2 rig format + spreadsheet import/export + solver, with unit
   checks in node (no Chrome needed). This is the spine everything else hangs on,
   so it goes first and is proven by the round trip before any UI exists.
4. Archetype kit (procedural 3D items) + contact sheet at true scale.
5. Lighting (one change, helps every slot's review).
6. Bag builders, slot by slot (order below).
7. Packing UI: locker, bag open / see inside, loadouts, compare, numbers.
8. Social: carry packing lists through share links and the gallery; copy a setup.
9. Round trip, first-timer pass, reference-photo pass, redo, WRITEUP.

### 1.1 Slot order for the builders, and why

Ordered by how visible the error is on a loaded bike, then by how many
products it affects:

| # | Slot | Products | Why this position |
|---|---|---:|---|
| 1 | seatpack | 78 | Biggest visual mass, "gravy boat", owner's first complaint |
| 2 | barroll | 55 | Keg/pumpkin caps; the second-biggest mass, front and centre |
| 3 | framebag_full | 50 | Vertebrae straps, short of the seat tube on the full kit |
| 4 | framebag_half | 78 | Same builder family, same strap fix |
| 5 | toptube | 90 | Toolbox look; most products in the catalogue |
| 6 | stembag | 38 | Lunchboxes, collisions with top tube bag and each other |
| 7 | forkbag | 29 | Cage + dry sack, rotor/spoke clearance |
| 8 | pannier | 60 | Ortlieb suitcases with no roll-top |
| 9 | saddlebag | 43 | Wide across the bike, Carradice/Brooks |
| 10 | barbag | 70 | Box-on-the-bar family |
| 11 | barpocket | 3 | Lozenge on the roll, never a shelf |
| 12 | toptube_rear | 10 | Jerrycan / TT sack |
| 13 | downtube | 12 | Slim wedge under the tube |
| 14 | trunk | 15 | Box on the rack |
| 15 | randobag | 4 | Box on a front rack |

(15 rows, 13 builder files: `barpocket` shares `barbag.js`, `toptube_rear`
shares `toptube.js`.)

## 2. Bags: the method and the score

- Axis mapping comment at the top of each builder, checked against
  `mount.axes` in `data/models/<brand>.json`.
- **Silhouette score** (`tools/silscore.mjs`, new): renders the bag alone,
  side-on and orthographic, at published dimensions, segments the bag's own
  pixels (object-ID pass, not colour), and compares its outline against the
  traced maker outline for that product as an IoU of the two normalised
  profiles plus a length/height error. 1.0 is a perfect match. Products with no
  traced outline are scored against their slot's canonical outline (built from
  the traced products of the same `geometry.form`) and flagged as such.
- Clearance contract unchanged: zero CLASH, touches what it mounts to, ≥15 mm to
  either tyre, rendered size within tolerance of spec.

## 3. Gear catalogue schema — `data/gear.json`

One array of items. Research lands per category in `data/gear/src/*.json`
(same shape) and `tools/build-gear.mjs` validates and merges them.

```jsonc
{
  "id": "quilt-3s",            // stable, ≤16 chars, [a-z0-9-]. NEVER renamed:
                               //   share links refer to items by id
  "name": "3-season quilt",    // what a person calls it
  "cat": "sleep",              // sleep|shelter|kitchen|water|clothing|repair|
                               //   electronics|hygiene|firstaid|food|misc
  "sub": "quilt",              // free text within the category
  "generic": true,             // generic default vs a real product
  "brand": null, "model": null,
  "weight_g": 650,             // ounces are DERIVED, never stored
  "packed_cm": [30, 18, 18],   // l ≥ w ≥ h, packed as carried
  "packed_l": 7.5,             // volume as carried (stuff sack / box)
  "compress": 0.55,            // 0 rigid … 1 squashes to nothing. The fraction
                               //   of packed_l it can give up in a tight bag
  "archetype": "sleeping_bag", // §4
  "color": "#3b4a5c",
  "rigid": false,              // shorthand: compress < 0.1
  "fragile": false,
  "access": "camp",            // ride | day | camp  — how often you reach for it
  "worn": false,               // usually worn rather than packed
  "places": [                  // where experienced riders put it, best first
    { "at": "seatpack", "why": "light and bulky; fills the pack and keeps weight off the bars" }
  ],
  "sources": [ { "url": "https://…", "what": "weight, packed size" } ],
  "note": "",
  "aliases": ["sleeping bag", "down bag"]   // for sheet import matching
}
```

`places[].at` vocabulary: the bag slots (`seatpack`, `saddlebag`, `barroll`,
`barbag`, `barpocket`, `framebag_full`, `framebag_half`, `toptube`,
`toptube_rear`, `stem`, `fork`, `downtube`, `pannier`, `trunk`) plus
`outside` (lashed), `frame` (bolted to the bike), `body` (worn), `pocket`
(jersey/hip pack).

## 4. Archetype kit

Every item = archetype + dimensions + colour, built procedurally in mm, same
material language as the bags (`fabricMaterial`, `webbing`, `hardware`),
deterministic from the item id. Bespoke detail on the nine icons.

| Archetype | Used for | Bespoke? |
|---|---|---|
| `stuffsack` | clothes bag, food bag, generic dry bag | |
| `sleeping_bag` | bags and quilts in compression sacks | |
| `mat_rolled` | inflatable mats rolled | ✓ valve, rolled edge |
| `mat_folded` | closed-cell accordion mats | |
| `tent_bundle` | tent body in its sack | |
| `pole_bundle` | poles, pegs bundle, chair legs | |
| `canister` | gas canister | ✓ domed top, valve, colour band |
| `stove` | canister stoves | ✓ pot supports, burner, valve key |
| `pot` | pot with lid, handle | ✓ titanium, folding handles |
| `mug` | mug/cup | |
| `bottle` | bidons, soft flasks | |
| `bladder` | hydration bladder | |
| `utensil` | spork | ✓ |
| `lighter` | lighter, matches | |
| `clothing_folded` | jackets, shirts | |
| `clothing_rolled` | socks, shorts, buff | |
| `shoes` | camp shoes | |
| `inner_tube` | tubes | |
| `pump` | frame/mini pump | ✓ |
| `phone` | phone | ✓ camera bump, screen |
| `power_bank` | power banks | |
| `action_camera` | GoPro etc | ✓ lens, mount fingers |
| `headlamp` | headlamp | ✓ strap, lens |
| `cable_coil` | cables, cable lock, paracord | |
| `pouch` | first aid, wash kit, wallet, repair kit | |
| `box` | generic rigid box (chargers, glasses case) | |
| `multitool` | bike tool, Leatherman | |
| `tube_bottle` | sunscreen, bug spray, toothpaste | |
| `chair` | folding chair in its bag | |

The gen3d pipeline was considered for the icons and not used: it cannot run
on a phone, is not deterministic, and at the sizes items appear inside a bag
(~40–300 px) a procedural icon with the right silhouette reads better than a
scanned mesh at 2k triangles.

## 5. The packing model

**Items belong to a person; placements belong to a loadout.** That is the
owner's spreadsheet: rows are things owned once, each tab is an arrangement.

- **Locker** — `{ items: [Item] }`. An item is either a catalogue reference
  (`ref: "quilt-3s"`, with optional overrides of name / weight / colour) or a
  custom item (all fields inline). Each has a locker-local `uid`.
- **Loadout** = a rig (bike + bags) + `bike_g` + placements. It is the same
  object the app already saves and shares, extended. A saved rig *is* a loadout.
- **Placement** — one per item in the loadout, one of:

  | `loc` | Meaning | Sheet spelling |
  |---|---|---|
  | `bag` | inside a bag slot; optional `side: L|R` for two-sided frame bags | `X`, `X (Left)` |
  | `lashed` | strapped to the outside of a bag slot | `X (on top)` |
  | `dangle` | hanging off a bag slot | `X (dangle)` |
  | `frame` | bolted to the bike: `mount: bottle|bar|stem|frame` | `On frame` |
  | `body` | worn; or in a body container: `in: hip|pocket|pack` | `On me`, `Hip sack` |
  | `home` | owned, not coming | `not packed` |

  An item missing from a loadout's placements is `home`.

### 5.1 The owner's columns → slots

| Sheet column | Packrig | Why |
|---|---|---|
| Seat post bag | `seatpack` | |
| Handle bar pack | `barroll` | |
| Front Pocket | `barpocket` | clips to the roll's face |
| Half Frame bag | `framebag_half` (`(Left)` → `side: L`) | |
| Frame bag | `framebag_full` | |
| Top Tube Bag | `toptube` | |
| **TT sack** | `toptube_rear` | The catalogue's only "TT Sack" is Andrew The Maker's *Rear* TT Sack, and the owner's sheet carries a separate "Top Tube Bag" column, so this is the second, seat-post-end top tube bag. His contents (tubes, levers, patch kit, tool) are exactly what riders keep there |
| **Jerry Can** | `toptube_rear` | Revelate's Jerrycan is the archetypal rear top tube bag. If one tab has both, the second column lands in the same bag and the import says so |
| Fork left / Fork right | `forkL` / `forkR` | |
| Stem bag(s) | `stemL` / `stemR` | |
| Panniers | `pannierL` / `pannierR` | |
| Downtube | `downtube` | |
| On frame | `frame` | bottles → cage, phone → bar, pump → frame, GoPro → bar (by archetype) |
| On me | `body` | |
| Hip sack | `body` + `in: hip` | a real "on body" container, with its own subtotal |
| not packed | `home` | |

### 5.2 Totals

Split the way the sheet splits them: **gear** (everything coming, incl. worn),
**bags** (catalogue bag weights, or the sheet's override), **bike**,
**worn** (the subset of gear on the body), **food & water**, **all-up**.
Units g/kg or oz/lb, toggle, persisted.

**The owner's gear total includes the item marked "not packed"** (302.1 oz is
the sum of every row, the 2.0 oz water filter included; 302.1 + 398 + 304 =
1004.1). Packrig reproduces that number exactly in the sheet-format export
(its totals row is the same SUM), and the import report reconciles it in one
line. In the app, all-up counts only what is coming — leaving the filter at
home is the point of "not packed" — so the app reads 1,002.1 oz and says why.

### 5.3 Solver

- Interior of a bag = its own body mesh, sliced along its long axis into
  ~12 stations, each station's inner cross-section extent measured off the
  mesh and inset by fabric thickness. So a tapered seat pack's tail really is
  smaller than its shoulder. Volume ceiling = the bag's rated litres × 0.9.
- Order: rigid + heavy first, placed at the **mount end** (seat pack: against
  the post; fork cage: against the leg; bar roll: centre), then by density,
  then soft items fill, compressing up to `compress` of their volume.
- Fill = used / rated litres, computed from the SAME numbers the 3D uses, so
  the meter and the picture cannot disagree.
- Won't fit → the item is not silently placed. It is listed as "doesn't fit",
  with the best alternative bag (has room, allowed by the item's `places`, heavy
  items prefer low and central) as a one-tap suggestion.
- Warnings: an item longer than the bag's longest interior dimension (tent
  poles in a stem bag); load over the mount's rating (fork cage 1.5 kg / 3 kg
  HD, seat pack ~5 kg, bar ~5 kg, top tube ~1 kg); a two-sided frame bag loaded
  much more on one side; the phone buried where you can't reach it.

### 5.4 Balance

Every placed item has a world position (its solved spot in its bag, or a
fixed spot for frame/body). CoM of bike + bags + gear (worn excluded — the
rider is not part of the bike) is marked on the bike. Front/rear is the lever
split between the axles; left/right and high/low are shown as offsets.

## 6. Rig format v2

```jsonc
{
  "v": 2, "name": "", "env": "", "paint": "", "size": "M",
  "bags": [ /* exactly v1 */ ],
  "pack": {
    "bike_g": 11283,             // optional
    "bags_g": 8618,              // optional override (sheet import)
    "items": [                   // the gear on THIS loadout, self-contained
      { "ref": "quilt-3s" },                       // catalogue item as-is
      { "ref": "pot-ti-750", "g": 213 },           // with an override
      { "n": "Chair", "g": 510, "c": "Camp", "a": "chair", "d": [35,12,12] } // custom
    ],
    "at": [ "seatpack", "forkR", "barroll:lashed", "framebag_half:L", "body:hip", "home", … ]
                                  // parallel to items
  }
}
```

- **v1 rigs and links are untouched.** A rig without `pack` is a v1 rig and is
  applied exactly as before; `captureRig` only writes `v: 2` when there is
  packing to carry.
- **Share links** keep `?r=`. v1 links are base64url JSON starting `[1,`.
  v2 links are `?r=2.<base64url(deflate-raw(JSON))>`. The packed array form
  refers to catalogue items by id and only spells out custom ones; 60 items is
  ~0.9 KB before compression, ~450 characters after.
- **Firestore**: the rig document's `rig` field carries `pack`, so published
  gallery rigs carry their packing list with no rule change. The locker adds
  one collection: `lockers/{uid}`, owner read/write only (3 lines).
- **Signed out**: locker in `localStorage`, loadouts are local rigs; nothing
  needs an account.

## 7. Spreadsheet import / export

- Import accepts (a) the owner's matrix form — header row, then item |
  category | oz | one column per bag with `X`, `X (on top)`, `X (dangle)`,
  `X (Left)` — and (b) the flat form (item | category | oz | where), and total
  rows (`gear`, `bike`, `bags`, `all up`/`total`) anywhere. Tab or comma
  separated, as Google Sheets puts on the clipboard.
- Items are matched to the catalogue by alias; unmatched rows become custom
  items with the sheet's weight (the sheet's weight always wins — it is the
  owner's scale).
- Export writes the matrix form back, same column names, same X spellings,
  same totals rows, oz with lb beside them.
- Seed: the owner's "Bike Gear (Megafuck)" tab ships as the example loadout
  (`data/seed/megafuck.tsv`).

## 8. Running log of calls made mid-run

(appended as the run goes)

### 8.1 Research budget (25 Sep)

The session's WebSearch cap is **200 calls, shared by every agent**, and six
parallel researchers spent it in about ten minutes. What that bought, and what
the rest is:

- **Gear catalogue, 327 items.** 151 sourced from search results with the URL
  kept, 30 the owner's own figures (`basis: owner`), 146 recalled maker specs
  (`basis: recall`, source = maker site root, note says "verify"). The item
  sheet in the app says which: "Maker or retailer page", "The owner's own
  scale", or "Maker spec, not re-checked".
- **Bag weights, all 635.** 108 sourced (maker 40, retailer 44, review 19,
  size-interpolated 5; Apidura, Revelate and Ortlieb), 1 recall, 526
  family-estimates (named anchor or sibling size in `weight_note`). The bag
  sheet and the Gear totals mark estimates `est.`.
- I did not spin up fresh sessions to get more search budget: the cap looks
  deliberate, and routing around a spending limit is the user's call.
  `tools/apply-weights.mjs` re-merges the moment better numbers land in
  `data/weights/`.

### 8.2 Calls made while building

- **"Not packed" still counts in the sheet's gear total** (§5.2). The export
  reproduces his SUM exactly; the app's all-up leaves home items at home.
  His "1004" is 1004.1 shown to the whole ounce.
- **"Worn" includes the hip pack.** Anything on the body (worn, pockets, hip
  pack) is what the rider carries, not the bike: 16.1 oz worn + 6.9 oz hip
  pack = 23.0 oz off the bike on his list.
- **The rated litres are the capacity.** A roll-top can be stuffed to its
  rating, so the fill meter runs to 100% of the maker's litres. Past 95% it
  says "packed tight"; it only refuses when the volume genuinely isn't there.
- **Soft bags stretch, hard ones don't.** A rigid item may exceed a bag's
  drawn section by 50% (soft), 25% (semi) or 5% (rigid shell, from
  `stiffnessOf`). Fitting only by stretching is allowed and reported as a
  bulge — on a frame, top tube or stem bag that means knee rub. Length never
  stretches: poles longer than the bag are refused, in centimetres.
- **Rigid things pack in shelves from the floor up**, lanes across, outward
  from the mount; if my shelving runs out before the volume does, the item
  goes in loose on top and the bag is marked tight. The first version laid
  items end to end and refused a third of the owner's real frame bag.
- **A two-sided frame bag** = a side pocket (the "(Left)" items, a third to a
  half of the width) plus the main compartment at full width, sharing the
  bag's litres. Not two halves: that refused a gas canister he really carries.
- **The Therm-a-Rest Compressible Pillow** compresses 0.7, not 0.5 — it is
  shredded foam sold on exactly that property. Changed on review with a note.
- **Carriers are luggage**: a rear rack (650 g), front rack (480 g) and a
  fork cage per fork bag that doesn't include one (110 g) are added to "Bags".
- **Default bike weight 11.0 kg** (a steel drop-bar gravel bike of the class
  modelled); editable per loadout, and the sheet's "Bike" row sets it.
- **Load ratings** (warnings only): fork cage 1.5 kg, stem 1 kg, top tube
  1.5 kg, seat pack 5 kg, bar roll 5 kg, frame bag 5 kg, pannier 10 kg, trunk
  8 kg — typical published limits (Salsa Anything cage 3 kg is the HD
  exception; the warning says "most are rated for").
- **A first-timer's bare bike gets "First overnighter"**: Apidura Expedition
  saddle pack 13 L, handlebar pack 14 L, half frame pack 4.3 L, top tube pack.
  Four bags is what nearly every first overnighter uses.
- **Lighting for black bags**: fabric albedo floor at 2.6% linear (real black
  nylon reflects 3–4%; #1c1c1e is 1.2%), fabric env response 0.32 → 0.55, and
  a camera-relative "kicker" light from behind the subject (1.6), no shadows.
  A/B renders in `shots/ui/ab_*.png`; a stronger setting turned black into
  grey plastic and was rejected.
- **Megafuck's bags** are real products that hold what his columns hold:
  Apidura Expedition saddle pack 16 L, handlebar pack 14 L, front accessory
  pack, frame pack 5.7 L (half), top tube pack 1 L; Andrew The Maker Rear TT
  Sack; a Many Things Sack on each fork leg. His sheet's bag weight (304 oz)
  overrides the catalogue sum — it includes his cages and harness.
- **Build-loadouts was already broken** by the 635-bag cut (two curated rigs
  named removed products). Fixed by substitution, noted in LOG.md.
- **Full frame bags fill the triangle, not the catalogue size.** The owner's
  rule ("fills the main triangle exactly") wins over the published length and
  height: 44 of 50 full bags now draw >10% larger than spec on the demo frame
  (a custom bag is made for the frame). Packing capacity still uses the rated
  litres, so the fill meter stays honest.
- **Half frame bags give way to bottles.** Keeping both bottles free cuts 20
  deep half bags by 12 to 53% in drawn height. A finer bottle check in
  `system.js adjustBottles` (it compares whole boxes) would let them go deeper.
- **Top tube nose stops 9 to 15 mm off the steerer** because the resolver's
  head collider is a fixed 28 mm radius for every slice. Left as is: tight
  but clean; noted for a system.js pass.
- **Record straps/pockets/zips are not merged into brands.json** by
  apply-models. Builders that need them (frame bags) carry a generated table.
- **Seat packs too deep for the frame are drawn cinched, not clipped.** Five
  13 to 16.5 L packs list 28 to 30 cm of depth; this frame has less room
  between rails and tyre. The builder searches tilt both ways (tail-up drops
  the shoulder) and then draws the pack up to a third flatter
  (`userData.cinchedTo`). A pack that still can't fit is dropped with a
  notice, as the Carradice SQR Slim is. Fit is shown honestly, not faked.
- **Front rack deck** is sized from the tyre (`max(360, tireR + 45)`), as the
  rear rack already was.
