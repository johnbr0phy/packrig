# Screens: the shot list

Every surface in the app, numbered like a film's shot list. Each is shot on
**phone (393 x 852, DPR 2, touch)** and **desktop (1440 x 900)**, empty and
full where the distinction exists, by

    node tools/screens.mjs [--only S08,S09] [--device phone] [--out shots/after] [--twice]

into `<out>/<id>-<device>-<state>.png`, with `report.json` beside them. The
tool fails on any page error, on horizontal page scroll, and with `--twice`
if the same input gives different pixels. Each shot also records an audit
(see "What every shot measures" below).

How each screen is reached lives in one file, `tools/lib/screen-helpers.js`,
so a UI change moves the helpers, not forty setups. The task scripts
(`tools/firsttimer.mjs`, `tools/tasks.mjs`) reach the same screens by real
taps instead.

"Packed" means the owner's Megafuck trip (67 items, 8 bags) imported into
this browser's kit.

| # | Screen | Reached by | Empty | Full | Done when |
|---|---|---|---|---|---|
| S01 | Start | landing | | yes | Headline and four ways in; the bike is lit and uncovered |
| S02 | Set up a rig | Start, Build a rig | | yes | Name, size, two colours, one button |
| S03 | Gallery (Examples) | Start, Examples | | yes | The example rigs on the bike, with their numbers |
| S04 | Builder, empty | Build a rig | yes | | The bike, pulsing rings on its mounts, one line: "Tap where a bag goes" |
| S05 | Mount picker | Add a bag | yes | | Rings on the bike; the list is a fallback for keyboards and screen readers |
| S06 | Catalogue | a ring, or Replace it | | yes | Big rows with image, maker, name, litres, weight, price if known, fit badge; chips; fit first |
| S07 | Product sheet | tap a fitted bag (no kit) | | yes | Whole bag and its surroundings in view; image never blank; Replace / Remove / Buy |
| S08 | Rig | the builder with bags | bags only | packed | Bags listed with fill and contents; numbers never wrap; watts chip; one Save |
| S09 | See inside | tap a bag | empty bag | packed seat pack | Contents first, then the product; Add gear; warnings on their rows |
| S10 | Won't fit | tent poles in a top tube bag | | yes | The sentence on the row, in cm, with the move |
| S11 | My kit | Add gear | catalogue | kit + search | Search, category chips, one-tap add that packs it |
| S12 | Your own item | My kit, Add your own | | form | Name, weight, kind |
| S13 | Quick pick | Pack my kit | nothing ticked | four ticked | Tiles are the items' renders; the button never covers a tile |
| S14 | Item | tap an item | | the owner's sleeping bag | Every place is one tap; weight editable; source shown |
| S15 | Trips | trip name | | Megafuck + Cuba | Switch, rename, copy, delete with undo, compare, spreadsheet in and out |
| S16 | Compare | Trips, Compare | | Megafuck vs Cuba | Totals with deltas, what moved |
| S17 | Import | Trips, Paste a spreadsheet | blank | owner's sheet pasted | Reads the matrix, reconciles totals, says what it matched |
| S18 | Someone else's rig | See a packed bike, or a shared link | | yes | Whose it is, what isn't yours, Copy to my kit |
| S19 | Share | Share | | packed | A sheet: the link, Copy, what is included |
| S20 | Account | Log in | | sign-in | A sheet beside the bike; the scene is never dimmed |
| S21 | Wind tunnel | the watts chip | | yes | Named, reachable from the rig; numbers defended |
| S22 | Settings | header, More; More > Bike | | menu; bike sheet | Size, frame and bidon colour, view tools, all labelled |
| S23 | Units | kg / lb | | lb | Every number flips together |
| S24 | Suggest a layout | Pack the N at home | | yes | Heavy low and central; nothing overflows; Undo |

Phone specifics: every surface is the one bottom sheet with three heights
(peek, half, full) and one close control. The camera frames the bike into
whatever the sheet leaves. There is no drag and drop on a phone; an item's
sheet is the tap-to-move path, and it is also the keyboard path on desktop.

## What every shot measures

`report.json` carries, per shot:

- `bike.frac`: vertical extent of the bike's visible silhouette divided by the
  viewport height, clipped to the space above any bottom sheet. Targets on
  the phone: 0.45 with no sheet open (peek), 0.35 with a sheet at half.
- `fonts`: every computed font size that carries visible text, with counts.
  Target: nothing under 11px, body not under 13px, no half pixels.
- `small`: visible touch targets under 44 x 44 (the phone numbers are the
  ones that count).
- `unlabelled`: buttons with no text and no `aria-label`. Target: none.

Contrast over every environment is checked separately by
`tools/contrast.mjs`.
