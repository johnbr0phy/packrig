# Product-fidelity model spec

One file per brand: `data/models/<brand-slug>.json`. You own that file and only
that file. Never edit `data/brands.json`, `src/*`, or another brand's file.

Your job: make the 3D model of every product in your brand **look like the real
product**. That means (a) correcting the dimensions, and (b) describing the
visible hardware — zips, straps, pockets, panels — in a vocabulary the geometry
builders can act on, and (c) stating how the bag physically hangs on the bike.

Everything you assert must be traceable to a photo you actually looked at or a
page you actually read. `evidence` is required on every product.

---

## THE DIMENSION RULE (changed — read even if you have done this before)

Previous passes recorded the *packed / rolled-down* figure. That is now wrong.

**Use the UNFURLED dimensions for length and width. Use the MINIMUM of the
range for height.**

- A roll-top bar pack specced `36w x 23d x 13-48h cm` → `wid: 36, len: 23, hgt: 13`
  — full unfurled plan size, minimum height.
- A seat pack specced `MIN 36 / MAX 42 cm length` → `len: 42` (unfurled), and if
  the height is also a range take its low end.
- Where only one figure is published, use it and say so.

Rationale: the plan dimensions are the real extent of the fabric, but the
roll-down axis must be at its shortest so the bag never digs into the tyre or
the frame. Put the full range verbatim in `dims_raw` and explain your pick in
`dims_note`.

### The `render` block — what the bag is actually DRAWN at

`dims_cm` is the honest record of what the maker publishes. It is not always
what should be drawn: Tailfin publish only a 42cm *unrolled* height for the
CargoPack, but in every on-bike photo the roll is turned down three times and
the bag stands 22–26cm. Drawing 42cm would be absurd.

So every roll-top or otherwise variable-height product also carries:

```json
"render": {
  "hgt_cm": 24,
  "rolls": 3,
  "basis": "three turn-downs; measured against the rack deck in the on-bike photos"
}
```

- If the maker publishes a **range**, `render.hgt_cm` is the **minimum** of it.
- If the maker publishes only the **unfurled** figure, estimate the rolled-down
  height **from an on-bike photo** and say so in `basis`. That is an observation,
  not a fabrication — but it must be traceable to an image you looked at.
- If the height is fixed (a zipped, non-rolling bag), omit `render` entirely.

#### `render` is not only about height

Any axis can be the variable one, and the same rule applies to each:
`render.len_cm`, `render.wid_cm`, `render.hgt_cm`. A bar bag whose side-rolls
open along the bar (Fairweather's Road Bar Bag publishes 21-66cm across) and a
seat pack that rolls along its length both have exactly the height problem on a
different axis.

**`dims_cm` always stays the honest published figure.** Before these fields
existed, reviewers meeting a ranged length axis had to overwrite `dims_cm` to
stop the bag being drawn six times too big, which destroyed the record they were
supposed to be keeping. Put the published figure in `dims_cm`, the drawn figure
in `render.<axis>_cm`, and the reasoning in `dims_note`.

#### When the minimum-of-range rule gives an absurd result

Sometimes it does. Apidura publish 10–40cm for the Expedition Front Rack Pack;
10cm on a 20-litre bag renders a pizza box, and the on-bike photos put the packed
height nearer 18cm. `tools/apply-models.mjs` feeds `render.hgt_cm` straight to
the geometry, so a wrong value here is drawn verbatim.

Do **not** silently deviate, and do **not** bury the objection in prose — earlier
records flagged exactly this conflict inside `basis`, where no tool could see it.
Record it in fields:

```json
"render": {
  "hgt_cm": 18,
  "published_min_cm": 10,
  "conflict": "10cm is the published minimum but renders a 20L bag as a slab; 18cm measured off the on-bike photo against the known 30.5cm width",
  "rolls": 3,
  "basis": "…"
}
```

`hgt_cm` is always **what should be drawn**. When you override the rule,
`published_min_cm` keeps the rule's answer and `conflict` says why you departed
from it, so the decision is auditable instead of invisible.

Never edit `dims_cm` to make the render come out right. The two fields exist so
that honest data and correct drawing do not have to fight each other.

**Tapered axes:** put the LARGER value in `dims_cm` and describe the taper in
the `geometry.taper` block, which is what actually shapes the mesh — literally,
since 8 Aug: `nose` and `tail` are read as a ratio and drive the builder's taper
directly, replacing a `vr.range()` guess. Both must be in `(0, 1]` with `tail`
no larger than `nose`, or `apply-models.mjs` drops the block and says so.

**Pair vs single:** pannier and fork-bag volumes are often quoted for the pair.
`capacity_l` is always the SINGLE bag. Keep the page's phrasing in `dims_raw`.

**Do not invent.** If you cannot establish a number, set `verified: false`,
leave `dims_cm` unchanged and say why. An honest gap beats a confident guess.
Two dimensions in this catalogue were previously fabricated by back-computing
from volume; both were caught only by a photo. Never do that.

**Write a dims triple whole, never as two swaps.** Axis-transposition mistakes
have happened repeatedly by editing `len` and `wid` and forgetting `hgt`.

---

## Axis convention (`dims_cm`)

These are the bag's OWN axes, as the bag sits mounted:

| key | meaning |
|---|---|
| `len` | the bag's longest horizontal run **along its own body** |
| `wid` | across the body |
| `hgt` | top to bottom |

Because "along its own body" differs per slot, ALSO fill `mount.axes` (below),
which states unambiguously which bag axis points where on the bike. That block
is what stops a seat pack rendering as a suitcase sticking out sideways.

---

## Record shape

```json
{
  "brand": "Apidura",
  "slug": "apidura",
  "reviewed_photos": 41,
  "products": [
    {
      "line": "Expedition",
      "name": "Saddle Pack",
      "size": "9L",
      "slot": "seatpack",
      "slot_should_be": null,

      "verified": true,
      "confidence": "high",
      "evidence": [
        "assets/products/apidura/expedition-saddle-pack-9l-1.jpg",
        "https://www.apidura.com/shop/expedition-saddle-pack/"
      ],

      "dims_cm": { "len": 42, "wid": 15, "hgt": 16 },
      "dims_state": "unfurled_min_height",
      "dims_raw": "MIN 36 / MAX 42 cm length; 16 cm height; tapered width 15 - 5 cm",
      "dims_note": "len is the MAX (unfurled) figure per the new rule; width tapers 15cm at the saddle to 5cm at the tail",
      "capacity_l": 9,

      "geometry": {
        "form": "tapered_wedge",
        "crossSection": "rounded_rect",
        "taper": { "nose": 1.0, "tail": 0.33, "profile": "linear" },
        "shoulder": "squared",
        "notes": "hard wedge silhouette, flat top, squared shoulder at the saddle, tail rolls to a narrow blade"
      },

      "closure": {
        "type": "rolltop",
        "location": "tail",
        "rolls": 3,
        "hardware": "side-release buckle on a Hypalon cradle"
      },

      "zips": [],

      "straps": [
        { "role": "attachment", "count": 2, "location": "nose_top",  "hardware": "buckle", "material": "hypalon", "wrapsAround": "saddle_rails" },
        { "role": "stability",  "count": 1, "location": "nose_front","hardware": "buckle", "material": "hypalon", "wrapsAround": "seatpost" },
        { "role": "compression","count": 1, "location": "tail_wrap", "hardware": "buckle", "material": "hypalon" }
      ],

      "pockets": [
        { "type": "mesh", "count": 2, "location": "side", "sizeFrac": 0.4 }
      ],

      "details": {
        "daisyChains": true,
        "reflective": "vertical strip each side",
        "valve": "SoftVent air valve, tail underside",
        "lightMount": "3-prong rear light mount at the tail",
        "logo": { "type": "screen_print", "location": "side_rear" },
        "seams": "welded",
        "fabric": "laminated ripstop, matte"
      },

      "mount": {
        "axes": { "len": "-x", "wid": "z", "hgt": "y" },
        "attachesTo": ["saddle_rails", "seatpost"],
        "contactFaces": ["nose_top", "nose_front"],
        "sag_deg": 3,
        "clearance": { "tyre_mm": 60, "frame_mm": 0 },
        "notes": "nose is clamped hard at the saddle; the tail droops slightly. Must not sweep below the saddle rails by more than its own height."
      },

      "colorways": [ { "name": "Black", "hex": "#1c1c1e" } ],
      "images": ["https://…"]
    }
  ]
}
```

Fields you have nothing to say about: **omit them**, do not write nulls or
guesses. An empty `zips: []` means "I looked and there are none"; a missing
`zips` key means "I could not tell".

---

## Controlled vocabulary

Stick to these. A builder can only render what it recognises. If nothing fits,
use the closest term and explain in `geometry.notes`.

**`details.structure_class`** — `soft` · `semi` · `rigid`. **Write this.** It is
the one field the builders read directly to decide whether a bag deforms, and
until 8 Aug it did not exist, so 131 records described rigidity only in prose,
spread across `details.stiffener`, `details.rigid_structure`, `geometry.notes`
and `mount.notes`. `tools/lib/stiffness.mjs` now bootstraps a value out of that
prose, and where you set `structure_class` it uses yours verbatim instead.

Judge the **bag body**, not the mounting hardware. This is the distinction the
classifier most often has to make and the one reviewers most often blur: Thule's
Shield pannier bolts to a rigid moulded rail and is itself a limp welded
tarpaulin sack — `soft`. Use `semi` for a bag that holds a shape but still gives
(foam-backed panels, an HDPE frame sheet, a welded self-supporting shell), and
`rigid` only for a body that does not deform at all.

**`geometry.form`** — `tapered_wedge` · `horseshoe` · `cylinder` ·
`truncated_cylinder` · `box` · `rounded_box` · `halfmoon` · `teardrop` ·
`trapezoid_panel` · `triangle_panel` · `slab` · `holster` · `cage_pack` ·
`barrel` · `saddlebag_flap` · `basket_box` · `bucket`

**`geometry.crossSection`** — `round` · `oval` · `rounded_rect` · `d_shape`
(flat on one side) · `flat_bottom` · `flat_back` · `teardrop`

**`closure.type`** — `rolltop` · `zip_horseshoe` · `zip_straight` ·
`zip_dual_slider` · `zip_two_way` · `flap_buckle` · `flap_strap` · `drawcord` ·
`magnetic` · `velcro` · `hook_and_loop_flap` · `clamshell`

**`zips[].run`** — `top_centre` · `top_side` · `horseshoe_top` · `side_full` ·
`rear_panel` · `front_panel` · `perimeter` · `pocket`
**`zips[].finish`** — `matched` · `contrast` · `waterproof_welded` · `storm_flap`

**`straps[].role`** — `attachment` (holds the bag to the bike) · `compression` ·
`stability` · `daisy` (lash points) · `lid` · `shoulder`
**`straps[].location`** — `nose_top` · `nose_front` · `tail_wrap` · `top` ·
`side` · `front_face` · `underside` · `end_cap` · `girth`
**`straps[].hardware`** — `buckle` · `cam` · `g_hook` · `velcro` · `daisy_loop` ·
`hook` · `boa` · `leather_billet` · `ladderlock`

**`pockets[].type`** — `mesh` · `zip` · `slip` · `stretch` · `map` · `bottle`
**`pockets[].location`** — `side` · `front` · `rear` · `top` · `lid` ·
`underside` · `internal`

**`mount.axes`** — each of `len`/`wid`/`hgt` maps to a bike-frame direction:
`+x` = toward the FRONT wheel, `-x` = toward the REAR wheel, `+y` = up,
`-y` = down, `+z` / `-z` = out to the drive / non-drive side.
Use `along_downtube`, `along_toptube`, `along_seattube`, `along_forkleg`,
`along_bar` where the axis follows a tube rather than a world direction.

---

## Method, per product

1. **Look at the photos.** Local copies: `assets/products/<brand-slug>/`.
   The product's `images` array in `data/brands.json` lists what was downloaded.
   Read the image files — actually open them. If your brand has no local folder,
   fetch the maker's product page and read the images from it.
   Prefer an **on-bike** photo for `mount`, a **studio 3/4** photo for `geometry`.
2. **Read the maker's spec page** (`src` on the product) for dimensions verbatim.
3. **Reconcile against volume.** A soft bag's box is roughly 1.0–2.5× its litres.
   Use that to decide which axis is wrong when the page is ambiguous.
4. **Count the hardware.** How many compression straps? Where exactly? Is the zip
   a horseshoe or a straight run? Which side is the pull on? These are the details
   that make the model read as the real product.
5. **Work out how it hangs.** Which face touches the bike? Which way does the
   opening point? Does it clear the tyre? Fill `mount`.

## Fitment

If a product cannot mount on a 56cm drop-bar gravel bike at all (proprietary
carrier, Brompton block, needs a basket we do not model), set
`"fits": "basket" | "brompton" | "rack_only" | "none"` and explain. Do not
silently leave it in the universal pool.

## Quality bar

A reviewer should be able to hold your record next to the product photo and
agree with every line of it. Where you are unsure, say so in `confidence` and in
the note — `"medium"` and `"low"` are respectable answers and far more useful
than false precision.
