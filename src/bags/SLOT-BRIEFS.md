# Slot briefs — September run

Read `src/bags/BUILDER-BRIEF.md` first (all of it, including §9). This file
adds, per slot, what the owner said the bag should look like, what he said is
wrong with ours, and what "done" means. Where his words and a record or a
traced outline disagree, **his words win** and you say so in your header.

## The method, per slot (the owner's, verbatim in spirit)

1. **Before.** Render the largest, the smallest and the five most distinctive
   products of your slot with shots, into `shots/slots/<slot>/before/`:
   `node tools/bagshot-q.mjs --brand "<B>" --name "<N>" --size "<S>" --angles side,tq --out shots/slots/<slot>/before/`
   and score the traced ones: `node tools/silscore.mjs --slot <slot> --out shots/sil/before-<slot>`.
   Contact sheet: `python3 tools/slot-sheet.py shots/slots/<slot>/before shots/slots/<slot>/before.png`.
2. **Axis mapping.** Write it as a comment at the top of the builder, checked
   against `mount.axes` in `data/models/<brand>.json` for your slot's records.
3. **Silhouette from the data.** Rebuild the body from `p.mm` (published
   dimensions), `geomOf(p)` (form, crossSection, shoulder, taperRatio) and
   `stiffnessOf(p)`, falling back to narrow `vr.range()` only where the record is
   silent. Variation from the data and `variantOf()`, never `Math.random()`.
4. **Hardware.** Straps from `src/bags/straps.js` only — thin, flat, visibly
   wrapping what they hold. Zips where the record has them (`zipperRun` in
   features.js). Pockets that change the outline. Flag every non-body mesh
   `userData.noCollide = true` (the packing layer measures the body).
5. **Clearance.** `node tools/bagshot-q.mjs --slot <slot> --no-shots` →
   zero CLASH, zero dropped; touches what it mounts to; ≥15 mm to either tyre;
   body within ~10% of spec on each axis (straps excluded — bagshot now prints
   the body box and the bag's own-axis size).
6. **Look.** Render the same seven again into `shots/slots/<slot>/after/`,
   build `after.png`, rescore into `shots/sil/after-<slot>`, and LOOK at the
   sheets. Numbers catch penetration; only eyes catch the wrong shape. Iterate
   until you would be happy to see the render beside the maker's photo.
7. **Determinism.** Run one product twice: identical numbers.
8. **Don't break the app.** `node tools/_probe.mjs "?kit=full"` → no page errors.

Rules of the road: edit ONLY your builder file(s). You may add helpers inside
your file. Do not change `straps.js`, `hardware.js`, `features.js`,
`materials.js`, `deform.js`, `identity.js`, `resolve.js`, `system.js` — if one
is wrong, say so in your report. Do **not** `git commit` (the lead commits).
Renders go through the lock; if you see "waiting — pid N", wait.

## Per slot

### barroll (`barroll.js`) — and `barpocket` via `barbag.js`
Owner: "A bar roll is a cylinder under the bar, about bar width, with roll
closures at both ends and spacers behind it, clear of the tyre and the cables,
and harness systems carry it in a cradle." Wrong today: "Bar rolls end in domed
caps that make them look like kegs or pumpkins, when a real dry bag ends in a
flattened roll of fabric cinched by straps." The ends are a flat pinched lip
rolled 2–3 times, standing up across the end, with a buckle strap over it — not
a dome, not a disc. Spacers (foam blocks or a stiff back panel) sit between
the roll and the bar/head tube. Harness systems (Revelate Sweetroll, Apidura
Expedition Handlebar with harness, Salsa, Ortlieb harness) show the cradle.
Accessory pocket (`barpocket`): "sits on the front of the roll like a lozenge,
never jutting forward like a shelf" — a slim rounded pouch strapped flat to the
roll's front face, its depth 5–8 cm, following the roll's curve.

### barbag (`barbag.js`)
Handlebar bags that are NOT rolls: Swift Zeitgeist/Kestrel, Fairweather, Rapha,
Ortlieb Handlebar-Bag, Wizard Works Lil' Pickle — drum/box bags on the bar,
often with a lid or drawcord. Avoid the known "lid jutting forward as a shelf"
(BUILDER-BRIEF Rule 2 table). Bar width is the constraint; clear the stem bags.

### framebag_full (`framefull.js`)
Owner: "A full frame bag is a thin flat panel, five to eight centimetres wide,
that fills the main triangle exactly and follows the tubes." Wrong today:
"Frame bag straps are drawn as thick rings around the tubes, so every loaded
frame looks like it has vertebrae. On the full kit the frame bag stops short of
the seat tube, and a ladder of straps bridges the gap as if the bag were
floating." So: the panel edge meets all three tubes (frameEdgeR), thin flat
velcro straps (`tubeWrap`, ~20 mm) at the maker's count, a zip along the top
or drive side as the record says, slight pillow in the middle only.

### framebag_half (`framehalf.js`)
Owner: "A half frame bag hugs the top tube and leaves the bottles free." It
hangs from the top tube (and may touch the seat tube / head tube at its ends);
its bottom edge must not reach the bottle cages. Same strap rule as full.

### toptube (`toptube.js`, also `buildToptubeRear` for `toptube_rear`)
Owner: "A top tube bag is a soft tapered wedge nesting over the tube with its
nose against the stem, and a Jerrycan-style bag does the same at the seat post
end." Wrong today: "Top tube bags look like hard plastic toolboxes." Soft:
rounded, slightly slumped, a zip along the top, straps round the top tube and
the steerer/stem. The rear version nests against the seat post.

### stembag (`stembag.js`)
Wrong today: "Stem bags come out as upright boxes with lids, like lunchboxes,
when they should be soft cylinders with a drawcord top and mesh pockets. They
also collide with the top tube bag and with each other." Soft upright cylinder,
drawcord/cinch top with a toggle, mesh pockets round the outside, strapped to
the bar and the stem/fork crown. Must clear the other stem bag, the top tube
bag and the bar roll with both fitted (check the full kit).

### forkbag (`forkbag.js`)
Owner: "A fork bag is a cage bolted to the leg holding a dry sack, clear of
spokes and rotor." Cage visibly bolted to the leg (a plate with two bolts, a
cradle arm or two), the dry sack held by two thin straps, roll-top at the top,
≥15 mm from spokes and the disc rotor (drive side vs brake side differ).

### downtube (`downtube.js`)
Owner: "A downtube bag is a slim wedge under the tube." Long, slim, tapered,
strapped under the down tube with thin straps, clear of the front tyre by ≥15 mm
(HANDOVER: anchor the FRONT edge and extend toward the BB).

### pannier (`pannier.js`)
Owner: "Panniers are tall roll-top bags hanging off a visible rack with heel
clearance." Wrong today: "The Ortlieb panniers are flat black suitcases with no
roll-top at all." Taller than long, a roll-top closure with its buckle strap
over the top (Ortlieb Back-Roller: roll down over the top, buckled to the
sides), hooks on the rack rail, the lower hook, heel clearance (the pannier's
front-bottom corner kept back from where the heel swings).

### trunk (`trunk.js`)
Owner: "A trunk bag is a box sitting on top of the rack." On the deck, not
overhanging both ends (known open bug), straps or a rail system to the rack.

### randobag (`randobag.js`)
A box on a front rack/basket in front of the bar, lid with straps, below the
bar tops.

### saddlebag (`saddlebag.js`)
Owner: "A saddle bag in the Carradice or Brooks tradition is wide across the
bike, not long behind it." Waxed canvas or leather, flap lid with leather
billets and buckles, side pockets at the two ends of the across-axis, hung from
the saddle loops/bag supports. The small seat-pack-like products in this slot
(taper wedge / teardrop) keep the seat pack look.
