# Findings 01 — Apidura, spoken review

Source: John reviewing the live model in `tools/eval-review.mjs`, 9 Aug 2026,
one pass over the 70-item `apidura-v1` set. He owns many of these bags.

Layers per EVAL-PLAN.md §2.1 — **A** the record is wrong, **B** the builder is
wrong, **C** the vocabulary cannot express it.

Status: ✅ done in `v3-transcript` · ◻︎ outstanding.

---

## Seat packs — `seatpack.js` (11 here, 78 catalogue)

| | Finding | Layer | |
|---|---|---|---|
| ✅ | **Drawn backwards.** The narrow end is the one that clamps the seatpost; the bag grows rearward into the volume you stuff, and closes blunt. It was drawn deepest at the nose. | B | |
| ✅ | **The narrow end is not a spike.** "You're not going to get a really skinny end like that." Nose floor raised to 0.42 of full depth, tail mouth left blunt at 0.62. | B | |
| ✅ | **Three straps, not six.** One around the seatpost, one through the saddle rails, one at the back running top-to-bottom that clips and rolls the bag up. Girth hoops removed; seatpost collars 2 → 1. | B | |
| ✅ | **Logo in the wrong place** — belongs low, near the seatpost, on the stiffened nose panel. | B | |
| ◻︎ | **"Split in two" from directly behind.** The rounded-rect section plus per-panel stuffing reads as two stacked lobes at the rear. Needs a softer corner radius or less amplitude. | B | |
| ◻︎ | 13 L and 16 L are the same shape scaled — confirmed correct, no work. | — | |

**Record contradiction, unresolved.** `data/models/apidura.json` says the
Expedition Saddle Pack "is deepest and widest [at the nose] and blades down to a
narrow rolled tail", and publishes a 15 → 5 cm taper nose-to-tail. The review
says the opposite. The builder now follows the review. **This is a layer-A
question that should be settled against the physical bag**, because it decides
the shape of 78 products and it is currently decided by one sentence.

## Down tube packs — `downtube.js` (3 here, 12 catalogue)

| | Finding | Layer |
|---|---|---|
| ✅ | One connection point on the bag, not two. Strap count and tube wrap both reduced to one. | B |
| ◻︎ | "Looks a bit broken and see-through and weird" — needs a proper look at the loft caps and the strap band intersecting the body. | B |

## Fork bags / cargo cage packs — `forkbag.js` (2 here, 29 catalogue)

| | Finding | Layer |
|---|---|---|
| ✅ | Two straps, not three. The third sat on the crown and read as a bungee. | B |
| ◻︎ | Otherwise "looks pretty good". | — |

## Top tube packs — `toptube.js` (14 here, 100 catalogue)

| | Finding | Layer |
|---|---|---|
| ✅ | Two connections on the bottom, not three, plus the one at the front. | B |
| ◻︎ | **Dimensions and shape wrong.** It does not simply taper up: it rises a little at the back and is slightly triangular at the front. | B |
| ◻︎ | **Bolt-on variants should have no straps at all** — they bolt to frame mounts. `feats` needs to carry that, which may be a record gap. | A/C |

## Stem bags — `stembag.js` (4 here, 38 catalogue)

| | Finding | Layer |
|---|---|---|
| ◻︎ | Way too big, and round. It is a squarer case, not a cylinder. | B |
| ◻︎ | Needs a lid, with a yellow catch on the front to lift it. | B |
| ◻︎ | Two connections at the top to the handlebar, one at the bottom to the frame. | B |

## Frame packs, half — `framehalf.js` (16 here, 103 catalogue)

| | Finding | Layer |
|---|---|---|
| ◻︎ | **Geometry wrong, and it is the same wrong on all of them.** A long rectangle, but toward the front a triangular face steps down and back up. | B |
| ◻︎ | Three connections along the top tube — drawn — **plus one to the down tube**, which is missing. | B |
| ◻︎ | Must sit snugly up into the frame corner, against the front tube and under the top tube. Never hanging off the top tube alone. | B |
| ◻︎ | The small ones ("mini packs") are drawn skinny and thin; they should be **wide**. Looks like an axis swap on the small sizes. | B |

## Frame packs, full — `framefull.js` (7 here, 77 catalogue)

| | Finding | Layer |
|---|---|---|
| ◻︎ | Shape is right — "the 10 litre actually looks pretty good". | — |
| ◻︎ | Add two zips at the same angle as the top edge, running across, with yellow pulls on the drive side. | B |

## Bar rolls — `barroll.js` (5 here, 56 catalogue)

| | Finding | Layer |
|---|---|---|
| ◻︎ | Shape and front netting fine. **Colourway wrong**: grey outer ends with a black centre section. | A |

## Front rack pack

| | Finding | Layer |
|---|---|---|
| ◻︎ | Weird metal bits sticking out of the front. | B |
| ◻︎ | Two connection points to the rack. | B |
| ◻︎ | Has netting and a fold-over top panel — model it properly. | B |

---

## Slot and mounting problems — these need new vocabulary, not new geometry

These are the layer-C findings and they are the most valuable ones here,
because a missing slot is wrong for every brand at once, not just Apidura.

1. **Front Accessory Pack does not mount to the handlebar.** It clips onto the
   *front of the handlebar pack*. There is no concept of a bag mounted to
   another bag. Affects every maker's accessory pocket.
2. **Rear top tube packs need their own slot.** They sit under the saddle on the
   top tube, with the triangular end pointing away from the saddle — currently
   placed where a front top tube pack goes, i.e. somewhere you would sit on it.
   Several makers produce these.
3. **Aero bar packs need aero bars.** The pack should sit under the extensions,
   and selecting one should add aero bars to the bike. Currently drawn in the
   opposite orientation on a bike with no aero bars.

## Harness bug — found and fixed

4. ✅ **Handlebar pack photographs were blank.** Their references are **SVG
   dimension diagrams saved with a `.jpg` extension**, served as `image/jpeg`,
   which no browser will decode. `eval-review.mjs` now sniffs the bytes.

   The deeper problem stands: those products have a *diagram*, not a
   photograph, so they cannot be judged on fidelity by eye. Three of the eight
   Apidura handlebar packs are in this position. They are photo-less in
   everything but the file extension, and `eval-set.mjs` should say so when it
   freezes a set.
