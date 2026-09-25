# Write-up: bags that look right, and what's in them

Short version: Packrig now knows what you carry, not just what you hang. You
can paste your spreadsheet, see every item inside the bag it lives in, move
things around, compare loadouts and share the lot in one link. Alongside
that I went back through the bag builders slot by slot, starting with the seat
pack, because the owner's list of what looked wrong was right.

## What I built

**Packing (new, `src/pack/`)**
- A gear catalogue, `data/gear.json`, ~330 items. Each has weight (g, oz
  derived), packed size, volume, how much it squashes, an archetype for the
  3D model, where people usually put it and why, and a source. About half
  are sourced from maker specs; the rest are labelled `owner` (from the
  spreadsheet) or `recall` (my best knowledge, flagged as such in the data
  and the UI).
- A 3D kit of 29 parametric archetypes (stuff sack, compressed sleeping bag,
  rolled and folded mats, tent and pole bundles, canister, stove, pot, bottle,
  folded and rolled clothing, tube, pump, phone, power bank, action camera,
  headlamp, cable coil, pouch, box and more), with bespoke detail on the gas
  canister, stove, titanium pot, phone, GoPro, frame pump, spork, headlamp and
  rolled mat. Deterministic, merged per material, cached. Thumbnails in the
  locker are rendered from the same models.
- A solver that measures the real cavity of each bag from its mesh and packs
  heavy, rigid things first against the mount, soft things into what's left.
  Soft bags bulge a little before they refuse; rigid ones don't. When
  something won't fit it says so and suggests where it would.
- The UI: gear locker (search, groups, one-tap add, your own items), tap a
  bag to open it (shell goes translucent, contents inside), drag onto a bag
  on desktop, tap and pick on a phone. Places: in a bag, lashed outside,
  dangling, on the frame, worn, staying home. Numbers split into gear, bags,
  bike, worn, food and water, all-up, in g/oz or kg/lb. Balance front/rear,
  left/right, high/low with a centre-of-mass marker. Loadouts can be copied,
  renamed and compared (what moved, what it did to the weight). "Suggest a
  layout" packs whatever's at home into sensible places.
- Spreadsheet in and out, in the owner's exact format. His sheet ships as the
  "Megafuck" example loadout. Round trip verified: 67/67 items, gear 302.1 oz,
  bike 398, bags 304, all-up 1004.1 (his sheet says 1004; the 0.1 is his
  rounding). Export re-imports identically.
- Rig format v2 adds gear and placements. Every v1 link and saved rig still
  opens. The share link is compact and self-contained (catalogue items by id,
  custom ones inline, deflated): the full Megafuck setup is 1.8 k characters
  and opens signed out in a fresh browser. Other people's rigs open read-only
  with their packing list; "copy to my locker" flags what you don't own.
- Firestore: one new rule, `lockers/{uid}` readable and writable by its
  owner. Everything works signed out (localStorage).

**Bags**
- Lighting: black bags used to render as holes. An albedo floor, a softer
  environment on fabric and a camera-relative kicker light fix that without
  washing out the colours (all three tunable by URL for A/B).
- Weights for all 635 bags: 108 sourced, the rest estimated from the same
  maker's family and marked "est." in the app.
- The Rapha product whose name carried a dev note is fixed.
- Straps: one module, `straps.js`, draws webbing as thin flat bands with
  buckles. No more tori, so no more "vertebrae".
- Seat pack rebuilt from scratch: a tapered wedge with a squared shoulder
  under the rails, kicking up to a roll-top tail sized from the bag's own
  depth; the Arkel Rollpacker is a transverse roll, not a box.
- Every other slot was rebuilt the same way (axis header checked against the
  records, shape from the data, straps from `straps.js`, zero clashes on a
  full sweep). What changed, in the owner's terms:

| Slot | Was | Now | Sweep |
|---|---|---|---|
| Seat pack | sausage / gravy boat; Arkel a microwave | tapered wedge, squared shoulder under the rails, roll-top tail; big packs drawn cinched when this frame is too small; Arkel a transverse roll | 78/78 |
| Bar roll | domed keg ends | ends pinched flat and rolled into a strapped bundle; spacers, cradles, harnesses; >= 18 mm from the tyre (was 0.9) | 55/55 |
| Bar bag / pocket | lids as shelves; capsules | box bags on flat straps; 19 cylinders drawn as rolls; pocket a slim lozenge on the roll's face | 69/70 (1 tight), 3/3 |
| Full frame | ring-strap "vertebrae", gap at the seat tube | thin panel filling the triangle, meeting all four tubes, flat velcro | 50/50 |
| Half frame | hid bottles | hugs the top tube; 0 bottles hidden (was 23) | 78/78 |
| Top tube | hard toolboxes | soft slumped wedge, nose at the stem, zip on the crown | 90/90 (+10 rear) |
| Stem | lunchboxes | soft cylinders, drawcord and toggle, mesh pockets | 38/38 |
| Fork | torus coils | cage bolted to the leg, dry sack with a roll-top, clear of spokes and rotor | 29/29 |
| Downtube | tyre clashes | slim wedge anchored at the front, thin straps | 12/12 |
| Pannier | flat suitcases | tall roll-tops hooked on a visible rack, heel clearance | 60/60 |
| Trunk | overhung both ends | on the deck, overhang to the rear only | 15/15 |
| Rando bag | inside the rack tubes | on the rack, just ahead of the bar; rack deck raised off the tyre | 4/4 |
| Saddle bag | long behind the saddle | Carradice/Brooks wide across the bike, flap, leather straps, end pockets | 42/43 (SQR Slim can't fit this frame) |

  Before/after contact sheets for each are in `shots/slots/<slot>/`.

**Tools**
- `silscore.mjs`: orientation-free silhouette score against traced outlines.
- `screens.mjs`: shoots every numbered screen, desktop and phone, fails on
  page errors or horizontal scroll, and with `--twice` checks same input gives
  same pixels.
- `pack-test.mjs` / `pack-e2e.mjs`: the round trip, in node and in the browser.
- `slot-sheet.py`, `kit-sheet.mjs`: contact sheets.
- Headless Chrome now works on Linux (the tools assumed a Mac).

## How I know it works

- **Your sheet, round trip, in a real browser** (`tools/pack-e2e.mjs`): 67/67
  items land where the sheet says, every weight exact, totals gear 302.1 oz,
  bike 398, bags 304, all-up 1004.1. Export re-imports identically. The v2
  share link (1,821 characters) opens signed out in a fresh browser with the
  same list and the same bags; "copy to my locker" flags all 67 as not owned.
  Old `?r=` v1 and `?kit=` links still open. No page errors.
- **First-timer, by real taps** (`tools/firsttimer.mjs`): a fresh signed-out
  visitor packs a tent, a mat, a stove and a rain jacket in **6 taps** on both
  phone and desktop. Every item lands in a bag (tent and jacket in the bar
  roll, mat, stove and lighter in the half frame bag, gas in the seat pack),
  none left at home, no won't-fit.
- **Every screen, desktop and phone** (`tools/screens.mjs --twice`): 17
  screens, 42 shots, no page errors, no sideways scroll, and the same input
  gives the same pixels: at most 50 of ~1.3 million differ between runs
  (thin spoke edges in software GL; the tool allows 100 and reports the count).
  Getting there meant seeding the ground and fabric noise, holding the idle
  orbit under `?still`, and waiting for the camera and lazy thumbnails.
- **Bags**: a clearance sweep of every product in every slot, zero clashes
  (table above). Before/after contact sheets per slot.
- **Against the reference photo** (`shots/reference-compare.png`): with the
  bags closed, the loaded Megafuck reads like the loaded Trek in `reference/`:
  slim half frame bag under the top tube, top tube bag at the stem, bar roll
  with its pocket, cargo on the fork, bottles free. Two differences I'd fix
  next: the photo's mug clips to the seat pack's side, ours hangs under the
  tail; and with every bag open the shells were too faint to read (now
  frosted pale while open, which helps; the side-on frame bag is still faint).

## What didn't work, honestly

- Maker websites and photo CDNs are blocked from this environment, and the
  web search budget ran out partway through sourcing. So the photo comparison
  step used the traced outlines and records already in the repo, not fresh
  photos, and a chunk of gear weights are "recall" rather than sourced. Both
  are labelled in the data; neither is dressed up as more than it is.
- The silhouette score flatters the old builders, because they were swept
  from the very traces the score compares against. Eyes on contact sheets
  were the real test.
- Software GL is slow (a minute a product with shots), which capped how many
  products per slot I could render.
- I got the dangling-item fix wrong twice (a reversed ray, then a wrong
  theory about bounding spheres) before the numbers showed the real cause.
  LOG.md #12 and #16 say so.
- Seat packs deeper than this frame allows fought me longest: more tilt made
  the deep shoulder worse, and shortening the roll didn't help. The answer
  was searching tilt both ways and drawing the pack cinched flatter.

## What I'd do next

- Re-source the `recall` gear and `family-estimate` bag weights when search
  and maker sites are reachable; the fields are there to flip.
- Put maker photos next to renders in the slot sheets.
- Hang dangling things off the seat pack's side straps, as riders do.
- Merge the records' straps / mounts / zips into the catalogue in
  `tools/apply-models.mjs`; four builders carry their own tables for now.
- A tighter bottle check in `system.js` so deep half frame bags can go deeper,
  and a head-tube collider sized per slice so top tube bags reach the steerer.
- Fix the suspect records the builders flagged (DECISIONS.md, LOG.md).
- A "trip" layer: food and water per day that scales with days out.
- Let loadouts share across devices when signed in (lockers sync already;
  loadouts ride along, but conflict handling is last-write-wins).
