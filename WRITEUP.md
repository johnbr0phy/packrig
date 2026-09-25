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
- (Other slots: see the per-slot sections below as they land.)

**Tools**
- `silscore.mjs`: orientation-free silhouette score against traced outlines.
- `screens.mjs`: shoots every numbered screen, desktop and phone, fails on
  page errors or horizontal scroll, and with `--twice` checks same input gives
  same pixels.
- `pack-test.mjs` / `pack-e2e.mjs`: the round trip, in node and in the browser.
- `slot-sheet.py`, `kit-sheet.mjs`: contact sheets.
- Headless Chrome now works on Linux (the tools assumed a Mac).

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

## What I'd do next

- Re-source the `recall` gear and `family-estimate` bag weights when search
  and maker sites are reachable; the fields are there to flip.
- Put maker photos next to renders in the slot sheets.
- A "trip" layer: food and water per day that scales with days out.
- Let loadouts share across devices when signed in (lockers sync already;
  loadouts ride along, but conflict handling is last-write-wins).
