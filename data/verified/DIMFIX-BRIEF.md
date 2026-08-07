# Fixing a flagged product

You are given products whose dimensions FAILED an automated plausibility check.
Each issue record has: brand, name, size, slot, dims (current), liters, src,
dims_state, dims_source, kind, detail.

## What each `kind` means

- **volume-too-big** — the bounding box is >4x the stated litres. Almost always a
  fully-unrolled, flat-laid or extended figure sitting in a packed field.
- **volume-too-small** — the box is smaller than the stated capacity, which is
  impossible for a rigid reading. Either a dimension is too small, or the litres
  are the maximum-roll figure. Say which.
- **too-cubic** — a slot that must be elongated (a top tube bag, a frame bag) has
  near-equal axes. Usually two axes were transposed or one was duplicated.
- **near-cube** — all three axes within 15%. Renders as a ball. Always wrong.
- **too-big-for-frame** — physically cannot mount on a 56cm gravel frame.

## Method, per product

1. **Look at the product photo.** Local copies are in `assets/products/<brand-slug>/`
   and the paths are on the product in data/brands.json (`images`). Read the image.
   A photo settles shape arguments instantly: is it a long thin tube or a squat box?
   Does the proportion match the numbers? This is the single most useful check and
   you must actually do it where an image exists.
2. **Fetch the `src` page** and re-read the dimensions verbatim. Note the axis
   labels the maker uses — several label W x H x D but order them inconsistently
   across their own range (Carradice does this).
3. **Reconcile against volume.** A soft bag's box should be roughly 1.0-2.5x its
   stated litres. Use that to decide which axis is wrong when the page is ambiguous.
4. **Decide and record.** Correct `dims_cm` to the PACKED, AS-MOUNTED size.

## Output record (one per product, in a JSON array)

```json
{
  "brand": "...", "line": "...", "name": "...", "size": "...",
  "verified": true,
  "dims_cm": { "len": 0, "hgt": 0, "wid": 0 },
  "dims_state": "packed",
  "dims_raw": "verbatim from the page",
  "dims_note": "what was wrong, what you changed, and what evidence settled it — cite the photo if it did",
  "slot_should_be": "pannier",       // ONLY if the current slot is wrong
  "capacity_l": 0,                   // only if the litres were also wrong
  "confidence": "high|medium|low"
}
```

`brand`/`line`/`name`/`size` MUST match data/brands.json exactly — they are the join key.

## Rules

- If after all that you cannot establish a real number, set `"verified": false`,
  leave dims_cm as-is and explain. A flagged-but-unresolved product is a fine
  outcome; a confidently wrong number is not.
- Never average two sources into a number neither of them states.
- If the automated flag is a FALSE POSITIVE (the dims are right and the check was
  too strict), say so explicitly with `"verified": true` and unchanged dims, and
  explain why in dims_note. That is a valuable result.
