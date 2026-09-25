I want you to independently do an end-to-end pass on the next big version of Packrig. Two things, done properly, start to finish: the bags need to look like the real bags, and people need to be able to see what goes inside them. There's no spec for the second part yet. There's no gear catalogue, no item models, no packing UI. You're going to make all of it, and I'm not going to be here to answer questions, so make reasonable assumptions, write them down in a DECISIONS.md as you go, and keep moving.

First, who this is for, because it changes everything. Packrig is not for gear nerds who already have a spreadsheet. Well, it is, I'm one of them, but mostly it's for the person planning their first overnighter who has a bike, a sleeping bag, a vague sense of dread and no idea whether a stove fits in a frame bag. And it's for the person who has done ten trips and wants to show their friends exactly how they packed for the last one. If someone needs to understand litres, CdA, or what a "harness system" is to use this, we've failed. A first-timer should be able to say "I'm bringing a tent, a mat, a stove and a jacket" and see, in 3D, on a real bike, in under a minute, where it all goes and what it weighs.

## Read before you touch anything

This repo has history and scar tissue. Read these first, in this order, and take them seriously, because most of the traps in this project have already been stepped in once:

- `HANDOVER.md` and `NEXT-RUN.md`: what's true, what broke, and how many of the bugs were self-inflicted.
- `src/bags/BUILDER-BRIEF.md`: the two rules (never hard-code a position or rotation, write down the axis mapping and check it against a photo), the clearance contract, and the definition of done for a builder. It still applies to every line of geometry you write.
- `data/models/MODEL-SPEC.md`: the dimension rule and axis convention for `dims_cm`.
- `REDESIGN.md` and `DESIGN-SYSTEM.md`: the UI's voice, the sheet/dock/mobile structure, the tokens. New UI goes in this system, not beside it.
- `src/bags/slots.js`, `src/rig.js`, `src/rigstore.js`: the slot table, the rig capture format (`v: 1`), share-link encoding and Firestore storage.
- `reference/club-trek-loaded.png`, `reference/club-klunker-framebag.png`, and the product photos in `assets/products/` and `assets/portraits/`. This is the bar.

The machine has 8 GB of RAM. Always render through `tools/bagshot-q.mjs`, never `bagshot.mjs` directly, and don't run a wave of image-heavy agents alongside headless Chrome. That's what killed the 7 Aug run. Sequence the work so it fits.

## Part 1: the bags are the wrong shape. Fix that first.

Many of the bags are simply the wrong shape. Not wrong colour, not missing a zip: wrong silhouette, the kind of wrong you see from across a room. NEXT-RUN.md says only seatpack and stembag have had a proper builder pass; the other eleven builders in `src/bags/builders/` haven't. Assume every one of them is guilty until proven innocent, including the two that were "done".

Here is what each slot should read as at a glance, and I want you to verify every one of these against real photos rather than trusting me:

- **Seat pack**: a hard, tapered wedge. Squared shoulder tight under the saddle rails, strapped to the seatpost, tapering to a roll-top blade tail that kicks slightly upward. Compression straps across the top. Not a fat tube, not a sausage, not a suitcase.
- **Saddle bag** (Carradice, Brooks): wide across the bike, not long fore-aft. Hangs from saddle loops, sits behind the post.
- **Bar roll / handlebar pack**: a cylinder dry bag with roll closures at both ends, strapped under the bar with two or three straps, spacer blocks behind it, clear of the tyre and the cables. Harness systems (Revelate, Salsa, Apidura Expedition) have a cradle. Roughly bar width.
- **Bar bag / front accessory pocket**: a box or lozenge that sits on the front of the roll or bar, not a shelf jutting forward.
- **Rando / basket bag**: an upright box on a small front rack or decaleur.
- **Full frame bag**: a thin, flat panel, 5 to 8 cm wide, that fills the main triangle precisely and follows the tubes. Not a pillow.
- **Half frame bag**: a trapezoid hugging the top tube, leaving room for bottles below.
- **Top tube bag** (gas tank, "TT sack", Jerrycan): a tapered wedge that nests over the top tube, bolted or strapped, nose against the stem (or tail against the seat post for Jerrycan-style).
- **Stem / feed bag**: an upright cylinder beside the stem with a drawcord top and mesh side pockets, strapped to bar and fork steerer.
- **Fork bags**: a cage bolted to the fork leg carrying a cylindrical dry sack, strapped in with two straps, clear of the spokes and the rotor.
- **Downtube bag**: a slim wedge under the downtube, clear of the front tyre.
- **Panniers**: tall rectangular roll-top bags hanging on a visible rack, hooks on the rail, lower tab on the rack strut, heel clearance at the front.
- **Rack trunk**: a box sitting on top of the rear rack.

The method, per slot, in this order:

1. Write the axis mapping at the top of the builder (catalogue `len`/`wid`/`hgt` to world axes). Verify it against `mount.axes` in `data/models/<brand>.json` and against a photo. Five axis bugs have already been found in this project and each one looked like a different bug.
2. Pull the largest, smallest, and five most distinctive products in the slot. Put the maker's side-on photo next to our side-on render. `tools/silhouette.mjs` and `tools/eval-silhouette.mjs` exist; use them or improve them to produce a silhouette overlap score (IoU of the outline, photo vs render, normalised to the published dimensions) so "wrong shape" becomes a number you can drive down, not an opinion.
3. Rebuild the silhouette from `geomOf(p)` (form, cross-section, shoulder, profile, taper) and `stiffnessOf(p)`, with `vr.range()` only as a fallback where the record is silent. Variation comes from data and `variantOf()`, never `Math.random()`.
4. Then hardware: straps that visibly wrap what they attach to, zips routed where the photo shows them, pockets that change the outline, contrast panels.
5. Run `bagshot-q` for the whole slot. Zero CLASH, the bag touches what it mounts to, 15 mm or more to either tyre under droop, rendered bounding box within tolerance of spec. Then look at the images. Numbers catch penetration; only your eyes catch a bag that is the wrong shape.

Do not move on from a slot until you'd be happy showing the render next to the maker's photo on their own product page. Keep a before/after contact sheet per slot. Keep a log of what worked and what didn't so you stop repeating mistakes, and add each new trap you find to BUILDER-BRIEF.md so the next agent doesn't step in it.

## Part 2: I want to see what people pack inside their bags

This is the new heart of the app. A loaded bike tells you how someone travels. What's inside the bags tells you how they think. I want to be able to open any bag on any rig and see exactly what's in it, as real 3D objects, and I want to build that list myself for my own bike.

I have a spreadsheet I've kept for years; it's the best example of the job this feature has to do. The canonical sheet ("Bike Gear (Megafuck)") is reproduced in full at the bottom of this prompt. There are ten more tabs in the same format: Ultrafuck, Superfuck, Cuba, Cuba with tent, APPGG, "Race setup (as light as poss)", Japan, Winter bikepacking, Winter backpacking, and "Gear (everything)". Study it closely, because it tells you what the real model is:

- **One gear list, many loadouts.** The same stuff gets packed differently for Cuba, for Japan, for a race. Items are owned once; placements belong to a loadout. That's the core data model.
- **Columns are bags, rows are items, an X is a placement.** Every trip I set up the bags as columns (TT sack, Top Tube Bag, Half Frame bag, Seat post bag 14L, Handle bar pack, Front Pocket, Hip sack, Fork left, Fork right, and on other tabs Gas tank, Jerry Can, Full Frame bag, Feedbag 1, Feedbag 2) and put an X where each thing goes.
- **Not everything goes in a bag.** "On me" means worn (shorts, jersey, watch). "On frame" means mounted to the bike directly (phone, pump, GoPro, bottles). The hip sack is on my body, not the bike. These need first-class states, not hacks.
- **Placement has detail.** "X (on top)" means lashed on the outside of the seat pack. "X (dangle)" means the pot hangs off it. "X (Left)" means the left-hand pocket of a two-sided frame bag. Your model needs position within a bag: inside, outside/lashed, dangling, and which side or pocket.
- **Weight is the point.** The sheet totals gear weight, bike weight (398 oz), bag weight, and total, in ounces and pounds. Weight per bag, weight worn vs carried, and total all-up weight are what people actually argue about.
- **Some items are unassigned.** Water filter has no X; "Gear (everything)" is the master list and each trip tab is a subset. The UI has to handle "I own it, I'm not bringing it."
- **Sheet names are personality.** People name their loadouts. Let them.

Map the spreadsheet's bag columns onto the slots in `src/bags/slots.js` (seatpack, barroll, barpocket, framebag_full, framebag_half, toptube, toptube_rear, stemL, stemR, forkL, forkR and the rest) and add a proper "on body" location for hip sacks and worn items. Decide what "TT sack" and "Jerry Can" map to, and record why in DECISIONS.md.

## Part 3: list everything someone might take bikepacking, and model it in 3D

Build a real gear catalogue. Research it: bikepacking.com packing lists, ultralight forums, Tour Divide and Highland Trail race kit lists, brand spec pages for weights and packed dimensions. Target 200 to 300 items that cover what real people actually carry, grouped the way people think about it:

- **Sleep**: sleeping bags and quilts (synthetic and down, summer to winter), inflatable and foam mats, pillows, bivvy bags, liners.
- **Shelter**: 1P and 2P tents, trekking-pole shelters (Ultamid-style), tarps, hammocks, poles, pegs, groundsheets.
- **Kitchen**: stoves (canister, alcohol, solid fuel), gas canisters by size, pots, mugs, lids, sporks, lighters, windscreens, food bags, coffee kit.
- **Water**: bottles by size, bladders, collapsible bottles, filters, purification tablets.
- **Clothing**: worn (bibs, jersey, gloves, shoes, helmet) and packed (rain jacket, puffy, base layers, camp clothes, socks, overshoes, buff, beanie).
- **Bike repair**: pump, multitool, tubes (standard and TPU), plugs, tyre levers, patch kit, chain quick links, lube, spare brake pads, zip ties, tape, spoke key.
- **Electronics**: phone, GPS head unit, power banks by capacity, lights, headlamp, cameras and action cams, cables, chargers, wall plugs, dynamo gear.
- **Hygiene and first aid**: first aid kit, toothbrush, sunscreen, bug spray, wipes, soap, chamois cream, trowel.
- **Food**: a day of food, bars, dehydrated meals, as volume and weight blocks.
- **Misc**: lock, wallet, passport, foldable daypack, chair, camp shoes, bear hang kit, clothes line.

Every item needs: name, category, typical weight (grams, with ounces derived), packed dimensions in mm, packed volume in litres, compressibility (rigid, semi, squishy, so a sleeping bag can fill a void and a stove canister can't), a shape archetype for rendering, and typical placements (where experienced riders usually put it, and why: heavy low and central, frequent access up front, fragile inside). Real brand examples where they help, with a "generic" version as the default so users aren't forced to pick a SKU. Every weight and dimension gets a source, the same way the bag catalogue does. Seed it with every item in my sheet.

Now the 3D. Don't hand-model 300 unique meshes; that doesn't scale and it won't look coherent. Build a small parametric kit of **shape archetypes** in three.js, in the same material language as the bags (`materials.js`) so items and bags feel like one world:

- stuff sack (cylinder with drawcord or roll top, soft), compressed sleeping bag, rolled mat, folded mat
- tent bundle, pole bundle, peg bag
- canister, stove, pot with lid, mug, spork
- bottle (by volume), bladder, filter
- folded garment, rolled garment, jacket in its own pocket
- tube (rolled), pump, multitool, tyre levers, small parts pouch
- phone, power bank, action cam, headlamp, cable coil, bike light
- first aid pouch, toiletry bag, food bag, generic box, generic pouch

Each item is an archetype plus its dimensions and a colour, deterministic per item. Give a handful of iconic items bespoke detail so they're instantly recognisable in a thumbnail: gas canister, stove, titanium pot, phone, GoPro, frame pump, spork, headlamp, rolled mat. If `tools/gen3d.mjs` and a mesh provider are available and actually beat the procedural version on those hero items, use them, but procedural is the default, it's deterministic, and it's what ships on a phone. Every item needs a transparent-background thumbnail generated from its own model so the list UI and the 3D view always agree.

## Part 4: build the UI for putting things in bags

This is where it lives or dies. Work inside the existing design system, sheet, dock and mobile patterns. Think like the best product designer you know, then make it quieter.

**The gear locker.** Your owned gear, grouped by category, searchable, with weight. Add from the catalogue in one tap (pick the generic, optionally the exact model), or add a custom item with name, weight and rough size. Import from a spreadsheet or CSV in exactly my format (items as rows, bags as columns, X marks, "On me", "On frame", and the parenthetical modifiers), and export back to it. If I can paste my Google Sheet in and see my Cuba setup on a bike, you've nailed it.

**Packing.** Tap a bag on the bike or in the rig panel, it opens, and you see what's in it. Add items to it from the locker. On desktop, drag an item onto a bag in the 3D view and watch it go in. On a phone, it has to work entirely with taps and the bottom sheet, no drag required. Every item can be: in a bag (with pocket or side where the bag has them), lashed outside, dangling, on frame, worn, or not coming.

**Seeing inside.** When a bag is open, show its contents in 3D: an X-ray or cutaway where the bag shell goes translucent and the items sit inside, packed plausibly by a simple packing solver (heavy and rigid first at the bottom or against the mount, squishy things filling the gaps, respecting the bag's real internal volume and shape). A fill meter in litres, honest about when something doesn't fit, with a clear, friendly "this won't fit, try the seat pack" rather than a silent overflow. Lashed items sit visibly on the outside under the straps. Dangling items hang. Worn items can show on a simple rider silhouette or in a "on you" tray, your call.

**The numbers people care about.** Per bag weight and litres used. Totals split the way my sheet splits them: gear, bags, bike, worn, consumables (food and water), all-up. Grams or ounces and kg or lb, remembered per user. Balance: front vs rear, left vs right, high vs low, and a centre-of-mass marker on the bike. Tie weight into the existing wind tunnel where it genuinely matters (climbing watts), but don't bolt aero onto everything.

**Loadouts.** One locker, many loadouts, each with a name. Duplicate a loadout to start a new trip. See which items are unused in this loadout. Compare two loadouts side by side (what moved, what was added, what it did to weight).

**Seeing what other people pack.** Every shared rig and gallery rig can include its packing list. Opening someone's rig should let you open each bag and see their stuff, then "copy this setup" into your own locker with the items you don't own flagged. This is the social hook: the question every bikepacker asks another bikepacker is "what's in there?"

**Guidance, gently.** An optional "suggest a layout" that places a locker's items into the currently equipped bags using the same rules experienced riders use, which the user can then override. Warnings that are actually useful: tent poles longer than the bag, a stove in the frame bag's side you can't reach, 3 kg in a fork cage rated for 1.5.

## Data and compatibility

Extend the rig format to `v: 2` with gear and placements, and keep every `v: 1` share link and saved rig loading exactly as before. Items are owned by the user, placements by the loadout. Keep share links self-contained (a rig with a 60-item packing list still has to fit in a URL; design a compact encoding that references catalogue items by id and inlines only custom ones). Update Firestore rules in FIREBASE.md for any new collections, with the same "nine readable lines" discipline. Signed out, everything works in localStorage, as today.

## Performance and polish

A full loadout is 60 or more items across 10 bags. Instance repeated geometry, merge where it helps, and keep the phone at a smooth frame rate with every bag open. Items load lazily when a bag opens. Nothing jumps: opening a bag, adding an item, and the packing solver re-settling should all animate calmly. Hit targets 44 px on touch. Every state has a keyboard path on desktop.

## Verify like you mean it

Be rigorous about planning before you build. The failure mode here is pieces that don't cohere: items at a different scale to bags, a phone the size of a tent, a fill meter that disagrees with what you can see, a packing list that doesn't survive a share link. So:

1. Write the plan first: the slot-by-slot bag fix order, the catalogue schema, the archetype list, the rig v2 schema, the screen list for the UI. Put it in DECISIONS.md before you write code.
2. Build a screen list the way a film has a shot list: every screen and state gets a number, what it shows, desktop and phone, empty and full, and what "done" looks like.
3. After every batch, render and look. Bags: `bagshot-q` plus the silhouette score plus your eyes, next to the photo. Items: a contact sheet of every archetype at true scale next to a 1 litre bottle and a phone for reference. UI: screenshot every numbered screen on desktop and a phone viewport with the existing puppeteer tooling in `tools/`. `node tools/_rand.mjs` reports no page errors. Rendering stays deterministic: same input, same pixels, same clearances.
4. Round-trip test: import my spreadsheet, check every item landed in the right bag with the right weight, check the totals match the sheet (gear 302.1 oz, bike 398 oz, bags 304 oz, total 1004 oz for the Megafuck tab), export it, re-import it, share it by link, open the link signed out, and confirm nothing was lost.
5. Then do the honest pass. Open the app cold, as a first-timer with a tent, a mat, a stove and a jacket. Could you pack them in under a minute without reading anything? Does it make bikepacking look possible, or complicated? Redo whatever isn't at the bar. Do it again.

You can search the internet for anything you want: product photos, packed dimensions, gear weights, race kit lists, how people actually strap a tent to a fork cage. Use the budget freely; be economical but don't be timid. You can run for as long as this takes.

You're far more capable than you think you are. You're an engineer, a 3D modeller, a product designer and a researcher all at once here. Have that mindset the whole way through.

## Deliverables

- Every bag builder reworked, with before/after contact sheets per slot and silhouette scores, zero CLASH across the catalogue.
- `data/gear.json`: the sourced gear catalogue, 200+ items.
- The item archetype kit and thumbnails for every item.
- The locker, packing, see-inside, loadouts and compare UI, desktop and phone, in the existing design system.
- Rig format v2 with backward compatibility, share links and Firestore updated.
- Spreadsheet import and export in my format, with my sheet as a seeded example loadout.
- DECISIONS.md, the screen list, a log of what broke and why, and a short WRITEUP.md in your own voice on what you built and what you'd do next.
- Commits on the working branch with clear messages, pushed. No pull request unless I ask.

## Appendix: my canonical sheet ("Bike Gear (Megafuck)"), verbatim

Columns: Item, Category, Weight (oz), then one column per bag: TT sack, Top Tube Bag, Half Frame bag, Seat post bag (14L), Handle bar pack, Front Pocket, Hip sack, Fork left, Fork right. Below, each row is `Item | Category | oz | placement`.

Sleeping Bag | Camp | 24.0 | Seat post bag
Tent - YMG 1P Cirriform | Camp | 20.8 | Fork right
Chair | Camp | 18.0 | Handle bar pack
Battery Pack | Electronics | 16.1 | Half Frame bag
Neoair Xlite | Camp | 16 | Handle bar pack
Therm-a-Rest Compressible Pillow | Camp | 10.1 | Fork right
Camp shoes | Clothing | 8.0 | Seat post bag (on top)
First Aid Kit | Bathroom | 8.0 | Half Frame bag
Mont Bell Anorak | Clothing | 7.6 | Seat post bag
Pot | Kitchen | 7.5 | Seat post bag (dangle)
Waterproof Trousers | Clothing | 7.0 | Fork left
Cycling Shorts | Clothing | 7.0 | On me
Patagonia Capilene Air | Clothing | 6.5 | Handle bar pack
iPhone 14 pro | Electronics | 6.0 | On frame
Waterproof Overshoes | Clothing | 6.0 | Fork left
Hand Pump | Bike | 6.0 | On frame
Casual Shorts | Clothing | 5.0 | Seat post bag
Eye Glasses / Sunglasses / case | Clothing | 5.0 | Top Tube Bag
Mosquito Spray | Bathroom | 5.0 | Half Frame bag
Leatherman skeletool | Kitchen | 5.0 | TT sack
Tubolito 1 (650b) | Bike | 4.7 | TT sack
Tubolito 2 (650b) | Bike | 4.7 | TT sack
Go Pro 7 | Electronics | 4.1 | On frame
Go Pro 6 | Electronics | 4.1 | On me
Headlamp | Electronics | 4.0 | Front Pocket
On-Bike T-shirt | Clothing | 4.0 | On me
Camp T-shirt | Clothing | 4.0 | Fork left
Wallet | Clothing | 4.0 | Hip sack
Hiking Socks | Clothing | 4.0 | Fork left
Water Bottle 1 | Kitchen | 4.0 | On frame
Water Bottle 2 | Kitchen | 4.0 | On frame
Gore Tex Shakedry jacket | Clothing | 3.9 | Fork left
Tent Pegs | Camp | 3.6 | Half Frame bag
Gas canister | Kitchen | 3.5 | Half Frame bag
Tent Poles | Camp | 3 | Half Frame bag
Boxer Shorts 1 | Clothing | 3.0 | Fork left
Sunscreen | Bathroom | 3.0 | Half Frame bag
Paracord - bear line | Camp | 3.0 | Half Frame bag
Pedco ultra pod | Electronics | 2.9 | Hip sack
Wet Wipes | Bathroom | 2.6 | Half Frame bag
Inflatable pillow | Camp | 2.4 | Front Pocket
Foldup Backpack | Camp | 2.4 | Front Pocket
Bike Tool | Bike | 2.0 | TT sack
Tooth brush + tooth paste | Bathroom | 2.0 | Front Pocket
Cycling gloves - fingerless | Clothing | 2.0 | Half Frame bag (Left)
Cycling gloves - full finger | Clothing | 2.0 | Half Frame bag (Left)
Water filter | Bathroom | 2.0 | (not packed)
Zip lock lock | Bike | 1.0 | Half Frame bag (left)
Apple Watch | Electronics | 1.0 | On me
Lighter | Kitchen | 1.0 | Front Pocket
Ti Spork | Kitchen | 1.0 | Front Pocket
Go pro battery 2 | Electronics | 1.0 | Front Pocket
Go pro double battery recharger | Electronics | 1.0 | Half Frame bag
iPhone Cable | Electronics | 1.0 | Half Frame bag
USB Wall Plug | Electronics | 1.0 | Half Frame bag
Lightning USB Cable | Electronics | 1.0 | Half Frame bag
Apple Watch charger | Electronics | 1.0 | Half Frame bag
Micro USB Cable | Electronics | 1.0 | Half Frame bag
Go Pro Cable | Electronics | 1.0 | Half Frame bag
Buff | Clothing | 1.0 | Seat post bag
Plastic tire removal tool *2 | Bike | 1.0 | Half Frame bag (Left)
Electrical Tape | Bike | 1.0 | Half Frame bag (Left)
Bar of soap | Bathroom | 1.0 | Half Frame bag
Stove | Kitchen | 1.0 | Front Pocket
Lid | Kitchen | 0.6 | Half Frame bag
Patch kit | Bike | 0.5 | TT sack
Clothes line | Camp | 0.5 | Front Pocket

Sheet totals: Bike 398 oz (24.9 lb), Bags 304 oz (19 lb), Gear 302.1 oz, Total 1004 oz (62.76 lb).
