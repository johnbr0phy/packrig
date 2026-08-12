# Bag builder brief

You own **one** file in `src/bags/builders/`. Nobody else edits it; you edit
nothing else except, by explicit agreement, shared helpers in
`src/bags/hardware.js` / `features.js` (see "Shared code" below).

Your job: make the bags this builder draws **look like the real products**, and
**hang on the bike the way the real products hang**.

---

## 1. Read the evidence before you write a line of geometry

1. `data/models/<brand>.json` — per-product fidelity records written by the brand
   review agents. These are the specification for what you draw: silhouette,
   closure, every zip, every strap, every pocket, and a `mount` block giving the
   axis mapping and required clearances. Read every record whose `slot` is yours.
   The vocabulary is defined in `data/models/MODEL-SPEC.md` — read that too.
2. **The product photos**, in `assets/products/<brand-slug>/`. Open them. You are
   trying to reproduce a specific object; look at the object.
3. `reference/club-trek-loaded.png` and `reference/club-klunker-framebag.png` —
   real bikes, loaded, from the owner's club. This is the standard for how a
   loaded bike should read at a glance.

If the model records for your slot are thin or missing, say so in your report
rather than inventing details.

### The records now reach your builder — read them from `p`, not from disk

As of 8 Aug `tools/apply-models.mjs` merges the machine-readable half of every
`geometry` block into `data/brands.json`, so it arrives on the product object.
Two helpers in `identity.js` normalise it, and both are safe to call on a
product whose record says nothing:

```js
import { featuresOf, geomOf, stiffnessOf, variantOf } from '../identity.js';

const geom = geomOf(p);
//  { form, crossSection, shoulder, profile, taperRatio }
//  every field is null where the record is silent; taperRatio is the measured
//  tail-to-nose fraction along the tapering axis (Apidura Expedition 0.33,
//  Alpkit Koala 0.55, Altura Vortex 0.75)

const stiff = stiffnessOf(p);   // 'soft' | 'semi' | 'rigid'
soft(geo, main, { amp, freq, seed, stiffness: stiff, ... });
```

699 of 702 products carry a form and a cross-section; 386 carry a taper; 93 are
classified `semi` or `rigid`. `soft()` already honours `stiffness`: `semi`
takes 40% of the noise and bulge, `rigid` skips the displacement pass entirely
so a moulded shell keeps its creases. Every builder passes it today — do not
remove that.

**Two things to get right when you use this.**

1. **Replace your `vr.range()` guesses with the measured value, and keep the
   `vr.range()` as the fallback where the record is silent.** That is what
   `seatpack.js` now does for `tailWid`. The point of §4 is variation driven by
   the data; a builder that ignores `geomOf(p)` and invents its own taper
   constant is the thing this brief exists to stop.
2. **A `bulge` that positions the bag is not a bulge.** `toptube.js` used to
   hollow its underside through the `bulge` callback so the top tube nested
   into it. That channel is placement, and a rigid bag skips the whole deform
   pass — five structured top tube bags would have sat on the tube instead of
   over it. Carve anything structural into the geometry itself; keep `bulge`
   for padding.

---

## 2. The two rules that have caused nearly every bug in this project

### Rule 1 — never hard-code a position or a rotation

Six-plus separate visual bugs here were the same mistake: geometry placed by a
literal offset, or spun onto an axis by a stray `rotation.z = Math.PI/2`,
instead of derived from the bike. They present as unrelated glitches. Examples
already found and fixed: a saddlebag skewered by the seatpost (`grp.position.x = 30`),
bottles inside the tubes, a cage rail drawn as a cross, a bar roll floating off
the bar.

Everything you position must come from `bike.points`, `bike.anchors`,
`bike.framePoly` / `frameEdgeR`, or `bike.geo`. If you need a number the bike
does not expose, derive it — do not measure it off a screenshot and paste it in.

### Rule 2 — write down the axis mapping, then check it against a photo

`p.mm.len` / `wid` / `hgt` do **not** mean the same world axis in every slot.
Three builders had this wrong, each with a completely different symptom:

| Builder | Wrong assumption | Symptom |
|---|---|---|
| `buildForkbag` | `len` is the long axis | negative capsule length → rendered a **sphere** |
| `buildBarbag` | flap params pre-swapped and rotated 90° | lid jutting forward as a **shelf** |
| `buildSaddlebag` | `len` is fore-aft | **suitcase** projecting backward |

Before you change anything, put a comment at the top of your builder stating
which catalogue axis maps to which world axis for this slot, and verify it
against `mount.axes` in the model records and against a photo. Then keep it true.

**When you edit a dims triple, rewrite all three values together.** Two separate
axis-transposition bugs in this project came from swapping two of three axes and
forgetting the third.

---

## 3. The clearance contract

Run this constantly — it is your test suite:

```
node tools/bagshot-q.mjs --slot <yourslot>                 # every product in your slot
node tools/bagshot-q.mjs --brand "Ortlieb" --slot pannier  # one brand
node tools/bagshot-q.mjs --slot seatpack --no-shots        # numbers only, fast
```

**Always `bagshot-q.mjs`, never `bagshot.mjs` directly.** Each render launches a
headless Chrome that peaks near 0.76 GB on a machine with 8 GB total. Other
geometry agents are running at the same time; the `-q` wrapper takes a global
lock so only one render happens at once and the rest queue. Calling `bagshot.mjs`
directly is how the 7 Aug session put the box into swap and died. If it prints
`waiting — pid N has been rendering …`, that is correct behaviour: wait.

It renders each bag alone on the bike from four angles into
`shots/bag/<slug>/`, and reports millimetre clearance to every part of the bike.
**Read the images.** The numbers catch penetration; only your eyes catch a bag
that is the wrong shape.

What it reports:
- **CLASH** — the bag is inside something it does not mount to, or deeper than
  8mm into something it does. Must be zero when you are done.
- **mounts on** — light penetration into the thing the bag straps to. Expected
  and good: a seat pack that touches nothing is floating.
- **tight** — under 10mm from something it does not mount to. Investigate each.
- **ground** — height of the bag's lowest point above the ground.
- **rendered vs spec** — the rendered bounding box next to the catalogue
  dimensions. Straps and hardware legitimately add a little; a bag rendering
  6cm longer or 10cm taller than spec means the builder is inflating it.

Never allowed, for any slot: contact with either tyre. Aim for **≥15mm** to a
tyre under the bag's own droop, and remember a real tyre is not always the one we
draw — leave room.

Also required: a bag must **touch what it mounts to**. A fork bag reading 39mm
clear of the fork leg is as wrong as one buried in it — it is floating in space.

---

## 4. What "looks like the real product" means

The current models are smooth blobs with a logo. The gap is almost entirely
**hardware and surface**:

- **Zips** — a real horseshoe zip wraps three sides of a lid; a straight run
  crosses one face. The track, slider and pull tab all read at normal viewing
  distance. `hardware.js` has `zipperRun`; use it and route it along the path the
  photo shows, not a generic straight line.
- **Straps** — count and place them exactly. A Restrap bag without its wide
  webbing and metal buckle is unrecognisable; a Brooks bag with nylon webbing
  instead of a leather billet through a brass buckle is the wrong product. Straps
  must visibly **wrap the thing they attach to** and be pulled tight against the
  bag, not float beside it.
- **Pockets** — mesh side pockets, a zipped lid pocket, a stretch front panel.
  These change the silhouette, not just the texture.
- **Panels and seams** — where the maker uses a contrasting panel, a reinforced
  base, or a welded seam, show it. Multi-panel makers (Wizard Works, Oveja Negra,
  Rockgeist) lose their whole identity rendered in one flat colour.
- **Silhouette** — the biggest single win. A seat pack is a hard wedge with a
  squared shoulder at the saddle and a blade tail; ours renders as a fat tube.
  A frame bag is a flat panel that fills the triangle, not a pillow.
- **Structure** — some bags are genuinely rigid (Topeak's moulded shells,
  Tailfin's carbon, Ortlieb's stiffened back plate). They should not deform like
  a soft sack. `deform.js` controls this, and `stiffnessOf(p)` tells you which
  bags they are — see §1.

Use the per-product `features`/`geometry`/`straps`/`pockets` blocks so that two
bags in the same slot never look alike. Variation must be driven by the data and
by `variantOf()` (a stable per-product hash), never by `Math.random()` — rendering
has to stay deterministic or every screenshot comparison becomes useless.

---

## 5. Dimensions

`p.mm` is millimetres, derived in `src/catalog.js` from `dims_cm`. The catalogue
is being re-verified under a new rule: **unfurled plan dimensions, minimum
height**. Expect your slot's numbers to change under you — build so the geometry
is a function of `p.mm`, and re-run `bagshot` after `data/brands.json` updates.

Do not clamp or fudge a dimension inside the builder to make something fit. If a
product's dimensions genuinely cannot work on this frame, that is a data or
fitment finding: report it, and let the resolver in `resolve.js` handle placement.

---

## 6. Shared code

`hardware.js`, `features.js`, `materials.js`, `deform.js` and `identity.js` are
shared with every other builder agent. You may **add** a new exported helper.
Do not change the signature or behaviour of an existing one — that is how a fix
in one builder silently breaks four others. If an existing helper is wrong, say
so in your report instead of changing it.

`resolve.js` and `system.js` are off limits.

---

## 7. Definition of done

1. `node tools/bagshot.mjs --slot <yourslot>` reports **zero CLASH** and zero
   dropped products.
2. You have **looked at** the rendered images for at least the largest, smallest
   and three most distinctive products in your slot, next to their real photos,
   and they read as the same object.
3. `node tools/scratch/_rand.mjs` reports no page errors.
4. Rendering is deterministic: run `bagshot` twice on one product and the
   clearance numbers are identical.
5. Your builder opens with a comment stating the axis mapping and where each
   placement value is derived from.

## 8. Report back

- The axis mapping you settled on, and whether it was already correct.
- What you added: which hardware, which silhouette changes, per brand or family.
- Before/after clearance for the worst products in your slot.
- Any product that cannot be made to fit, and why.
- Anything you found wrong in the shared helpers or in the model data.
