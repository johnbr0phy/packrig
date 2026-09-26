# Packrig: the product, as built

**What is on each screen, and why.** Updated for the UI and UX pass of
26 Sep 2026; it describes the app as it is, not a plan. The values it is built
from (type, colour, space, motion, icons, imagery, accessibility) are in
`DESIGN-SYSTEM.md`; the list of screens and how each is checked is
`SCREENS.md`; the calls and their reasons are `DECISIONS.md` section 9;
`src/MOBILE.md` keeps the device contract; `FIREBASE.md` the backend.

---

## 1. The goals

1. **Someone who has never seen Packrig can, on a phone, pick a bike, put
   three bags on it, add a tent, a mat, a stove and a jacket, see where each
   went and whether it fits, and share it, in 12 taps.** (Measured:
   `tools/firsttimer.mjs`, 12 on a phone and on a desktop.)
2. **The bike stays big.** At least 45% of a phone's height with the sheet at
   its peek, 35% with a sheet at half.
3. **One control per job, and every control says what it does.**
4. **It says less.** (1.1)

### 1.1 Voice: functional, premium, quiet

**The test: does this sentence carry information the screen does not?** If
not, cut it.

1. A title needs no subtitle unless the subtitle carries data.
2. Never label a control that already says what it does.
3. No instructions where an affordance will do: pulsing rings on the bike beat
   "Where on the bike does this bag go?".
4. Empty states get one line and the obvious next action.
5. Detail lives in `aria-label` and a tooltip, not permanently on screen.
6. Numbers, not adjectives: `57.8 L`, never "a big load".
7. Errors are full sentences that say what to do next.

What stays because it persuades or warns: the reason before a sign-up ask
("so your rigs follow you between devices"); fit verdicts with their numbers
("Too long: 42 cm needs 38 cm"); the wind tunnel's explanations, which defend
a number people would not otherwise believe.

---

## 2. The model, named once

| Word | Means | Where you meet it |
|---|---|---|
| **Rig** | a bike with bags | the panel's title (its name), Save, Share, My rigs |
| **Kit** | what you own and carry | My kit, Copy to my kit |
| **Trip** | one packing list for one ride: which of your kit comes, and where it goes | the Trip chip, Trips, Compare |
| **Examples** | rigs already built, to look at and try on | the start screen |

The data still says `loadout` (share links, the spreadsheet round trip and
Firestore use it); a person never reads it.

---

## 3. The structure

```
 start screen ──► builder ◄── a shared link lands here directly
   Build a rig        top bar: wordmark (home) · Log in · More
   Pack my kit        rig panel: name · Save · Share
   See a packed bike             numbers (all-up, split, kg|lb, watts chip)
   Examples                      bags, each with fill and contents
                                 kit not in a bag
                      the sheet: one at a time, replacing the panel
                      rings on the bike: where a bag can go
```

**One surface at a time.** On a desktop the panel is a 400px column on the
left and a sheet takes its place (440px, 600px for a catalogue); the camera
fits the bike into the rest. On a phone the panel and every sheet are the
same bottom sheet, with three heights: peek (the numbers), half, full. Drag
the header or tap the handle; one Close. The scene is never dimmed; the
camera reframes instead (`src/ui/framing.js`).

---

## 4. The top bar

Wordmark (back to the start; asks to save an unsaved rig in a sheet, not a
dialog), **Log in** (or your name), and **More**: Frame the bike, Turn the
bike, Bike: size and colours, Wind tunnel, Share this rig, Units, Clear the
bike. Every item is a labelled row. There are no icon-only buttons in the
bar.

---

## 5. The rig panel

- **Head**: the rig's name (tap to rename in place), **Save** (Save, Save
  changes, Saved), **Share**.
- **Numbers**: `ALL-UP` with kg | lb at the right; the all-up weight at 32px;
  Bike, Bags, Kit, Food in four fixed columns underneath. It never wraps. The
  **watts chip** beside the all-up weight: "+11 W at 28 km/h", measured by
  the wind tunnel's meter in the background; it opens the tunnel. On a phone
  this block is the sheet's peek.
- **Trip chip**: the trip's name; opens Trips.
- **Bags**, front to back. Each row: the bag's picture (maker photo, or its
  model), where it is and its litres, the bag's name, a fill meter with % and
  weight, a strip of what is inside, and the most serious warning in one
  line ("Tent poles won't fit", "Bulges; may rub your knees"). Tap a row to
  open the bag. Hover a row on a desktop and the bag lights on the bike, and
  the other way round.
- **Add a bag**, **Add gear**.
- **What are you bringing?** Twelve tiles (tent, sleeping bag, mat, stove and
  gas...) while the trip is short. A tap adds the thing to your kit and packs
  it where an experienced rider would; the tile says where. First on an
  empty trip, under the bags after that.
- **Balance**: front and rear.
- **Not packed**, **On the frame**, **On you**: kit that is not in a bag, with
  "Pack these N".
- **A list that names bags the bike does not have** (a pasted spreadsheet)
  leads with "Fit the 8 bags your list uses".
- **Someone else's rig**: whose it is, how many of its things you do not own,
  **Copy to my kit**.
- **Empty bike**: one line, "Tap where a bag goes", with Choose from a list
  and Start from an example; the rings do the rest.

---

## 6. Adding a bag

1. **Rings on the bike.** An empty bike shows a pulsing ring at every place a
   bag can go; so does Add a bag. Places that share a spot share a ring (the
   bars take a roll, a bag or a rando bag).
2. **The catalogue**, opened by a ring: chips for the kinds of bag that share
   that spot; search (a chip on a phone); Brand, Capacity and Fabric filters
   with live counts; Fits my frame on by default; best fit first. Rows: the
   picture, maker, name, litres, weight and a fit badge (Fits, Tight, Won't
   fit, with the reason as a tooltip and in the row's label).
3. **Tap a bag and it is on the bike.** The catalogue stays. If that place was
   empty, it moves on to the next place a first build fills (seat pack,
   handlebar, frame, top tube...), and the toast says so with Undo. Replacing
   a bag stays put. Close reads **Done** while adding.
4. On a phone the catalogue opens at half height so the bike and the rings
   stay in view.

The list of places (**Choose from a list**) is the same choice for keyboards
and screen readers; the rings are buttons too.

---

## 7. A bag's sheet

Inside first: the fill (% and litres and weight), then every thing in it, each
a row you can tap. A thing that will not go in says so on its own row, in a
sentence with the numbers, and offers the place it would fit ("55 cm won't
fit this 23 cm bag. Move to the half frame bag?" with Move). Warnings about
the whole bag (over its rating, bulging, packed tight) sit under the meter.
**Add gear**. Then the product: its picture (the model when there is no
photo), maker and name, colourways (instant), specifications with where each
number came from, features. The footer: **Replace it** (Ember), **Remove it**
(with Undo), **Buy at maker**. The camera frames the whole bag with the bike
around it.

---

## 8. Packing sheets

- **My kit**: search, category chips, your things first, then the catalogue;
  one tap adds a thing and packs it (toast: where, Undo, Move). Add your own.
- **An item**: its model, weight and packed size; **Where it goes**, every
  place as a chip; your weight for it; where the numbers came from.
- **Trips**: switch, rename, copy, delete with Undo, Compare, paste a
  spreadsheet, copy as a spreadsheet, download .tsv.
- **Compare**: two trips side by side with the difference, and what moved.
- **Paste a spreadsheet**: the owner's matrix form or a flat list; what it
  matched, and its totals reconciled.
- **Drag and drop on a desktop**: drag a row onto a bag on the bike or its
  row; every bag shows a labelled drop chip while you drag.

---

## 9. Accounts, saving, sharing

- **Log in is a sheet** beside the live bike: Continue with Google, or email.
- **Save needs an account** (the owner's call). Signed out, Save opens the
  sheet with the reason and saves once you are in. Everything else, including
  share links, works signed out.
- **Share opens a sheet**: the link, Copy link (and Share to... on a phone),
  and what the link carries.

---

## 10. The start screen and Examples

The headline stays: **Load the bike before you buy the bags.** Four ways in:
Build a rig (straight to the bare bike), Pack my kit (tiles; a bare bike gets
the starter bags), See a packed bike (the owner's 67-item Megafuck trip),
Examples (rigs already built, with their measured watts; Build this rig;
Surprise me). A desktop shows a column of type over a ramp that is gone before
the bike; a phone a glass slab under it.

---

## 11. The wind tunnel

Reached from the watts chip or More. Its panel takes the rig panel's place:
the grade, CdA, watts at a speed you set, the cost of the bags, where the
watts go, crosswind, and the assumptions. On a phone it opens at a peek of
the cost and the worst offender.

---

## 12. What went, and why

- The **Bags | Gear** tabs: bags and kit are one list now.
- Every **chevron-plus-Close** pair on phone sheets: one Close, and the sheet
  is dragged or its handle tapped.
- The **four unlabelled header icons**: More, with labels.
- **The mount list as the way to add a bag**: rings on the bike (the list
  stays as a fallback).
- **The Log in modal and its veil**: a sheet.
- **The floating Save above the tabs**: Save is in the rig's head.
- **The set-up form before the first bag**: name, size and colours moved
  into place and into More > Bike.
- **Warnings stacked above a bag's contents**: on their rows.
- **Brown glass**, **half-pixel type**, **64 hex colours in 8 re-skin
  layers**: one token file and one stylesheet per surface.
- **The "browse by brand" tree**: Brand is a filter in the catalogue.

---

## 13. How we know it works

- `tools/tasks.mjs` (and `firsttimer.mjs`): four tasks by real taps, before
  and after, with hesitations.
- `tools/screens.mjs --twice`: every screen, phone and desktop, no page
  errors, no sideways scroll, same input same pixels, plus the per-shot
  audit (bike size, font sizes, small targets, unlabelled buttons).
- `tools/contrast.mjs`: text over all five environments.
- `tools/perf.mjs`: 67 things and 10 open bags, CPU throttled 4x.
- `tools/pack-test.mjs`, `tools/pack-e2e.mjs`, `tools/_probe.mjs "?kit=full"`:
  the engine, the spreadsheet round trip, share links old and new.
