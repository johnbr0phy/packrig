# Adding a brand to the catalogue

Write `data/newbrands/<slug>.json` — an array of BRAND objects matching the
existing shape in data/brands.json:

```json
{
  "name": "Ron's Bikes",
  "origin": "Ottawa, Canada",
  "aesthetic": "One-line description of the visual character: colours, fabrics, hardware, how the bags read.",
  "palette": ["#161819", "#3b3d40", "#c9483a"],
  "fabric": "X-Pac VX21 / Cordura",
  "products": [
    {
      "slot": "seatpack",
      "line": "Fabio's Chest",
      "name": "Fabio's Chest",
      "size": "One Size (7L)",
      "liters": 7,
      "dims_cm": { "len": 30, "hgt": 18, "wid": 16 },
      "dims_state": "packed",
      "dims_raw": "verbatim string from the page",
      "dims_note": "how you derived it / what the page actually said",
      "colors": ["#1c1c1e", "#7a2f2a"],
      "src": "https://…",
      "features": {
        "closure": "rolltop", "shape": "cylindrical", "compressionStraps": 2,
        "pockets": [{ "face": "side", "type": "zip" }],
        "reflective": true, "daisyChains": false, "cord": false, "valve": false,
        "colorways": [{ "name": "Black", "hex": "#1c1c1e" }]
      },
      "images": ["https://…direct-image-url.jpg"]
    }
  ]
}
```

## Rules

**slot** must be one of: `seatpack saddlebag barroll barbag randobag framebag_full
framebag_half toptube stembag forkbag downtube pannier trunk`. Pick by where the
bag actually mounts. If a bag genuinely doesn't fit any of these, skip it.

**Dimensions.** Same traps as the main verification pass, all of which we hit for real:
- *Unrolled maxima* — a roll-top quoted `13-48h cm` is 13cm rolled. Store a packed
  estimate `min + 0.3*(max-min)`, set `dims_state: "unrolled"`, keep the raw string.
- *Fully-extended maxima* — same idea for expanding bags.
- *Pair volumes* — pannier litres are often for the PAIR. Store the SINGLE-bag figure
  and note it. Add `"bagsPerListing": 2` under features when a listing ships two.
- *Flat-panel figures* — "28.5in laid flat" is not a mounted size; derive from volume.

**Never invent a number.** If the maker publishes no dimensions, estimate from the
stated litres and say so in `dims_note` with `dims_state: "unknown"`. An honest gap
beats a confident fabrication.

**Images** must be direct image URLs on the maker's own CDN.
