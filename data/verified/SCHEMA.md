# Per-brand verification output

One file per agent: `data/verified/<slug>.json`, an array of product records.

```json
{
  "brand": "Apidura",
  "line": "Expedition",
  "name": "Saddle Pack",
  "size": "9L",
  "src": "https://…",            // page you actually read
  "verified": true,               // false if the page could not be fetched
  "dims_cm": { "len": 52, "hgt": 22, "wid": 15 },   // USE-THESE numbers, packed state
  "dims_note": "page gives 15→5cm tapered width; wid is the max",
  "dims_state": "packed",        // packed | unrolled | unknown
  "dims_raw": "52 x 22 x 15-5 cm",   // verbatim from the page
  "capacity_l": 9,
  "colorways": [                  // every colour the page offers
    { "name": "Black", "hex": "#1c1c1e" },
    { "name": "Moss Green", "hex": "#6d7466" }
  ],
  "images": ["https://…/product.jpg"],   // direct image URLs on the maker's CDN
  "features": { "closure": "rolltop", "compressionStraps": 2 }
}
```

## Rules that matter

**Rolled vs unrolled.** Roll-top bags are often specced fully unrolled, which is NOT
how they look mounted. If the page gives a range (e.g. Wizard Works Alakazam
`36w x 23d x 13-48h cm`, `9-38L when fully unrolled`), record `dims_raw` verbatim,
set `dims_state: "unrolled"`, and put the **CLOSED (smallest) end of the range**
in `dims_cm` — NOT a blend. A bag is drawn as it sits rolled down, so Alakazam
Wald 137 (`13-48h`) is `hgt: 13`, and Road Runner's Middle Earth Jammer
(`8"-19"`) is `hgt: 20.3` (8in). Never put the unrolled maximum in `dims_cm`.

(An earlier version of this rule used `min + 0.3*(max-min)`; that was wrong and
records written under it are being corrected.)

**Tapered dimensions.** Where a page quotes a taper (`15 - 5 cm`), put the larger
value in `dims_cm` and describe the taper in `dims_note`.

**Do not invent.** If a page is unreachable (several makers 403 bots), set
`verified: false`, leave `dims_cm` as-is from the input, and say so in `dims_note`.
A wrong number asserted confidently is worse than an honest gap.

**Colour hexes** are your eyeball estimate of the swatch; that is fine and expected.

**Pair vs single.** Pannier volumes are frequently quoted for the PAIR. Arkel Orca 2 45
is 45L across two bags (22.5L each); Buckhorn quotes 9-13L PER bag. Put the SINGLE-bag
figure in `capacity_l` and keep the page's own phrasing in `dims_raw` (e.g. "45L (pair)").
