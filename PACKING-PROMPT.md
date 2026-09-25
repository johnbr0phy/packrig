I want you to independently do an end-to-end pass on the next version of Packrig. It's the app where you hang real bikepacking bags on a real bike in 3D, and right now it has two problems I care about more than anything else. The bags are the wrong shape, and you can't see what anyone packs inside them. You are going to fix the first and build the second, start to finish. There's no spec for the packing side yet. There's no gear catalogue, no item models, no packing screens. You're going to make all of it, and I'm not going to be here to answer questions, so make reasonable assumptions, write them down in a DECISIONS.md as you go, and keep moving.

First, who this is for, because it changes everything. This isn't only for gear obsessives who already keep a spreadsheet, although I'm one of them and it has to work for me. It's for the person planning their first overnighter. They have a bike, a sleeping bag, a vague sense of dread, and no idea whether a stove fits in a frame bag or where on earth a tent goes. It's also for the rider who has done ten trips and wants to show their mates exactly how they packed for the last one. If someone needs to know what litres, CdA or a harness system are to use this, it has failed. A first-timer should be able to say "I'm bringing a tent, a mat, a stove and a jacket" and within a minute see, on a real bike, where it all goes and what it weighs. The stretch goal is that people send their rig link to a friend with the words "this is what's in my bags."

Before you touch anything, read the history, because this repo has scar tissue and almost every trap in it has already been stepped in once. HANDOVER.md and NEXT-RUN.md tell you what's true, what broke, and how many of the bugs were self-inflicted. src/bags/BUILDER-BRIEF.md has the two rules that caused nearly every visual bug in this project: never hard-code a position or rotation, always derive it from the bike, and write down which catalogue axis maps to which world axis before you draw anything. It also has the clearance contract and what "done" means for a builder. data/models/MODEL-SPEC.md defines the dimension rule. REDESIGN.md and DESIGN-SYSTEM.md are the plan of record for the UI, and everything new has to live inside that system, not beside it. The machine has limited memory. Always render through tools/bagshot-q.mjs, never bagshot.mjs directly, and never run a crowd of image-heavy agents alongside headless Chrome. That exact mix is what killed the 7 August run.

Now the bags. I did a review pass before writing this, and the problem is worse than a missing zip here and there. Many of the bags are the wrong silhouette, the kind of wrong you see from across a room. On the full kit the Apidura seat pack reads as a gravy boat, a hollow hull sitting flat behind the saddle, when the real thing is a tapered wedge with a squared shoulder under the rails that kicks gently upward to a roll-top tail. Other seat packs come out as a flat board, a segmented sausage, or in the Arkel Rollpacker's case a cube the size of a microwave. Bar rolls end in domed caps that make them look like kegs or pumpkins, when a real dry bag ends in a flattened roll of fabric cinched by straps. Stem bags come out as upright boxes with lids, like lunchboxes, when they should be soft cylinders with a drawcord top and mesh pockets. They also collide with the top tube bag and with each other. Top tube bags look like hard plastic toolboxes. The Ortlieb panniers are flat black suitcases with no roll-top at all. Frame bag straps are drawn as thick rings around the tubes, so every loaded frame looks like it has vertebrae. On the full kit the frame bag stops short of the seat tube, and a ladder of straps bridges the gap as if the bag were floating. On top of all that, the lighting turns every black bag into a black blob, so even a good shape can't be read. NEXT-RUN.md says only the seat pack and stem bag builders ever got a proper pass. Assume all thirteen builders in src/bags/builders are guilty until proven innocent, including those two.

You need to know what each bag should look like at a glance, and I want you to check every one of these against real photos rather than trusting me. A seat pack is a hard wedge strapped to the post and rails, tapering to a blade. A saddle bag in the Carradice or Brooks tradition is wide across the bike, not long behind it. A bar roll is a cylinder under the bar, about bar width, with roll closures at both ends and spacers behind it, clear of the tyre and the cables, and harness systems carry it in a cradle. An accessory pocket sits on the front of the roll like a lozenge, never jutting forward like a shelf. A full frame bag is a thin flat panel, five to eight centimetres wide, that fills the main triangle exactly and follows the tubes. A half frame bag hugs the top tube and leaves the bottles free. A top tube bag is a soft tapered wedge nesting over the tube with its nose against the stem, and a Jerrycan-style bag does the same at the seat post end. A fork bag is a cage bolted to the leg holding a dry sack, clear of spokes and rotor. A downtube bag is a slim wedge under the tube. Panniers are tall roll-top bags hanging off a visible rack with heel clearance. A trunk bag is a box sitting on top of the rack.

The method, slot by slot, goes like this. Write the axis mapping as a comment at the top of the builder, then verify it against mount.axes in data/models/<brand>.json and against a photo, because five axis bugs have already been found here and every one of them looked like a different bug. The real product photos live in assets/products, which is gitignored and may be missing on your machine. The images in assets/portraits are our own renders, not photos, so they can't be the reference. Run tools/fetch-images.mjs first to restore the maker photography, and if a maker's site won't serve it, find photos elsewhere and say so in DECISIONS.md. Take the largest, the smallest and the five most distinctive products in the slot, and put the maker's side-on photo next to our side-on render. Turn "wrong shape" into a number. tools/silhouette.mjs and eval-silhouette.mjs exist, so use them or improve them to score how well the outline of the render matches the outline of the photo at published dimensions, and drive that number up. Rebuild the silhouette from geomOf(p) and stiffnessOf(p), falling back to invented ranges only where the record is silent, with variation driven by data and variantOf(), never Math.random(). Then do the hardware: straps that are thin and flat and visibly wrap what they hold, zips where the photo has them, pockets that change the outline. Then run bagshot-q for the whole slot, and get zero clashes. Every bag must touch what it mounts to, sit at least fifteen millimetres off either tyre, and render within tolerance of its spec. Then look at the pictures yourself, because numbers catch penetration and only your eyes catch a bag that's the wrong shape. Don't move on from a slot until you'd be happy to see our render next to the maker's photo on their own product page. Fix the lighting too, so that a black Apidura bag reads as a shape and not a hole.

While you're in there, the data needs care. One Rapha top tube product has a leftover developer note as its name ("4 tapered wide x 10 high; JSON had wid/hgt swapped)"), and it shows up in the catalogue. None of the 635 bags has a weight, and weight is the first thing anyone packing a bike asks about. Research and source a weight for every bag, the same way the dimensions were sourced.

Now the part I care about most. A loaded bike tells you how someone travels. What's inside the bags tells you how they think. I want to be able to open any bag on any rig and see exactly what's in it as real 3D objects, and I want to build that list for my own bike. The best example I have of the job this has to do is my own spreadsheet, which I've kept for years. The main tab is reproduced in full at the bottom of this prompt. There are ten more tabs in the same shape: Ultrafuck, Superfuck, Cuba, Cuba with tent, APPGG, "Race setup (as light as poss)", Japan, winter bikepacking, winter backpacking, and "Gear (everything)". Study it, because it's the real data model, not a toy one. I own each thing once, and every trip is a different arrangement of the same stuff, so items belong to me and placements belong to a loadout. Rows are items, columns are bags, and an X is a placement. Not everything goes in a bag. "On me" means worn. "On frame" means bolted to the bike, like the phone, the pump, the GoPro and the bottles. The hip sack is on my body. Placements have detail. "X (on top)" means lashed to the outside of the seat pack, "X (dangle)" means the pot hangs off it, and "X (Left)" means the left pocket of a two-sided frame bag. Some things I own and am not bringing, like the water filter. Every tab totals gear, bike, bags and all-up weight in ounces and pounds, because that's what people argue about. And people name their loadouts with a lot of personality, so let them. Map my columns onto the slots in src/bags/slots.js, add a real "on body" location, decide what "TT sack" and "Jerry Can" become, and write down why.

Then build the catalogue of everything someone might take bikepacking. Research it properly: bikepacking.com packing lists, ultralight forums, Tour Divide and Highland Trail kit lists, and maker spec pages for weights and packed sizes. I'd expect two to three hundred items, grouped the way people actually think about them:

- sleep: bags and quilts, mats, pillows, bivvies
- shelter: tents, pole shelters, tarps, poles and pegs
- kitchen: stoves, gas, pots, mugs, sporks, lighters
- water: bottles, bladders, filters
- clothing: what you wear on the bike and what you pack for camp and weather
- repair: pump, multitool, tubes, plugs, levers, links, tape
- electronics: phone, GPS, power banks, lights, cameras, cables
- hygiene and first aid
- food and water as carried volume
- everything else: lock, wallet, chair, camp shoes, daypack

Every item needs a weight in grams with ounces derived, packed dimensions, packed volume, and how compressible it is, so a sleeping bag can fill a gap and a gas canister can't. It needs a shape for rendering and the places experienced riders usually put it, with the reason: heavy low and central, things you need often up front, fragile things inside. A generic version is the default, with real brands where they help, and every number gets a source. Seed it with every item in my sheet.

Then model them in 3D. Don't hand-sculpt three hundred meshes, because it won't scale and it won't look like one world. Build a small parametric kit of archetypes in the same material language as the bags. The kit should cover a stuff sack, a compressed sleeping bag, a rolled mat, a tent bundle, a pole bundle, a canister, a stove, a pot with lid, a bottle, folded and rolled clothing, a tube, a pump, a phone, a power bank, an action camera, a headlamp, a cable coil, a pouch and a box. Every item is an archetype plus its dimensions and a colour, deterministic every time. Give the iconic items bespoke detail so they're recognisable from a thumbnail: the gas canister, stove, titanium pot, phone, GoPro, frame pump, spork, headlamp and rolled mat. If the gen3d pipeline beats the procedural version on those, use it for them, but procedural is the default because it's deterministic and it has to run on a phone. Every item's thumbnail should be rendered from its own model, so the list and the 3D view always agree.

Then build the experience of packing, and think like the best product designer you know, then make it quieter. There's a gear locker with everything I own, searchable and grouped, with a one-tap add from the catalogue or a quick custom item. I can paste my Google Sheet in, in exactly its current format, and see my Cuba setup appear on a bike, and I can export back out to the same format. I tap a bag, it opens, and I see what's inside. On desktop I can drag an item onto a bag and watch it go in. On a phone it all works with taps and the bottom sheet. Every item is either in a bag, lashed outside, dangling, on the frame, worn, or staying home. When a bag is open the shell goes translucent and the contents sit inside it, arranged by a simple packing solver: heavy and rigid things first against the mount, soft things filling the gaps, and everything respecting the bag's real volume and shape. A fill meter tells the truth. When something won't fit, it says so kindly and suggests where it might go instead, rather than letting the bag silently overflow. Show the numbers people care about, split the way my sheet splits them: gear, bags, bike, worn, food and water, and all-up weight, in grams or ounces, kilos or pounds. Show balance, meaning front against rear, left against right and high against low, with a centre of mass marked on the bike. Loadouts can be duplicated, renamed and compared side by side, showing what moved and what it did to the weight. The optional "suggest a layout" packs my locker into my bags the way an experienced rider would, and I can override anything. Warnings should be useful ones, like poles longer than the bag or three kilos in a fork cage rated for one and a half.

And the social part, which is the whole reason this matters: every shared rig and every gallery rig can carry its packing list. I can open someone else's bike, open each of their bags, see their stuff, and copy the setup into my own locker, with the things I don't own flagged. The first question one bikepacker asks another is "what's in there?", and this app should answer it.

Be careful with the plumbing. Move the rig format to version two with gear and placements, and make sure every version one link and saved rig still opens exactly as before. Share links have to stay self-contained, so a sixty-item packing list needs a compact encoding that refers to catalogue items by id and only spells out custom ones. Keep the Firestore rules as short and readable as they are now, and keep everything working signed out. Sixty items across ten open bags still has to run smoothly on a phone, so instance and merge geometry, and load items only when a bag opens. Nothing should jump. Opening a bag, adding an item and the solver settling should all move calmly. Touch targets are forty-four pixels, and everything has a keyboard path on desktop.

Be rigorous about planning before you build. The most common failure here is that the pieces don't cohere. A phone comes out the size of a tent, items are drawn at a different scale to bags, the fill meter disagrees with what you can see, or a packing list doesn't survive a share link. So do the thinking first. Write the order you'll fix the slots in, the catalogue schema, the archetype list and the version two rig format into DECISIONS.md before you write code. Make a screen list the way a film has a shot list, where every screen and state gets a number, a phone and desktop version, an empty and a full version, and a definition of done. Then build in batches, and after every batch, look. For bags, run bagshot-q, get the silhouette score and look with your own eyes next to the photo. For items, make a contact sheet of every archetype at true scale next to a one litre bottle and a phone. For the UI, take screenshots of every numbered screen on desktop and phone with the puppeteer tooling in tools/. Make sure there are no page errors, and that the same input always gives the same pixels. Keep a log of what worked and what didn't so you stop repeating mistakes, and add every new trap you find to BUILDER-BRIEF.md so the next agent doesn't step in it. Then do a round trip. Import my sheet, check every item landed in the right place with the right weight, and check the totals match mine: gear 302.1 oz, bike 398 oz, bags 304 oz, all-up 1004 oz. Export it, import it again, share it by link, open the link signed out, and prove nothing was lost.

Then do the honest pass. Open the app cold as a first-timer with a tent, a mat, a stove and a jacket. Could you pack them in under a minute without reading a word? Does bikepacking look possible, or complicated? Put a loaded render next to a photo of a real loaded bike from reference/ and ask whether a rider would believe it. Redo whatever isn't at the bar, then do it again.

You can search the internet for anything you want: maker photos, packed dimensions, gear weights, race kit lists, how people really strap a tent to a fork cage. Use your budget freely. Be economical, but don't be timid. You can run for as long as this takes.

I really want to emphasise that you're far more capable than you think you are. On this job you're an engineer, a 3D modeller, a product designer and a researcher all at once. Have that mindset the whole way through, and make something a rider would be proud to send to a friend.

Deliverables: every bag builder reworked, with before and after contact sheets and silhouette scores per slot, and zero clashes across the catalogue. Sourced weights for every bag. A sourced gear catalogue of two hundred items or more in data/gear.json. The archetype kit, with a thumbnail for every item. The locker, packing, see-inside, loadouts and compare screens, working on desktop and phone inside the existing design system. Version two rigs that still open every version one link. Spreadsheet import and export in my format, with my sheet seeded as an example loadout. DECISIONS.md, the screen list, the log of what broke and why, and a short WRITEUP.md in your own voice about what you built and what you'd do next. Commit as you go with clear messages and push to the working branch. Don't open a pull request unless I ask.

My main tab, "Bike Gear (Megafuck)", verbatim. Each row is item, category, ounces, and where it goes:

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
Water filter | Bathroom | 2.0 | not packed
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

Sheet totals: bike 398 oz (24.9 lb), bags 304 oz (19 lb), gear 302.1 oz, all-up 1004 oz (62.76 lb).
