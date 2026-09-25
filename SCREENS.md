# Screens — the shot list

Every screen and state of the packing work, numbered like a film's shot list.
Each is shot on **desktop (1440×900)** and **phone (393×852, DPR 2, touch)**,
**empty** and **full** where the distinction exists, by
`node tools/screens.mjs` into `shots/screens/<id>-<device>-<state>.png`.
The tool fails on any page error, on horizontal page scroll, and if the
same input twice gives different pixels (it shoots every screen twice and
compares).

"Full" means the owner's Megafuck loadout (67 items, 8 bags) unless noted.

| # | Screen | Reached by | Empty state | Full state | Done when |
|---|---|---|---|---|---|
| S01 | Start | landing | — | "Pack for a trip" row present | A first-timer sees a way in that isn't about bags |
| S02 | Quick pack — "What are you bringing?" | S01, or S03 empty | nothing ticked; button says "Pick what you're bringing" | 4 ticked; "Pack these 4" | Tiles are the items' own renders; 44px+ targets; one button |
| S03 | Gear view (left column) | Bags ⇄ Gear | "Nothing packed yet" + 3 doors | owner's list grouped by bag with meters | All-up leads; split = gear/bags/bike/worn/food; balance bar; groups front-to-back; no subtitle without data |
| S04 | Bag open (bag sheet + translucent bag) | tap a bag (scene or list) | "Empty." + Put something in | Seat pack with sleeping bag etc. | Shell translucent; items inside at true scale; meter = litres used / rated |
| S05 | Won't fit | put tent poles in a stem bag | — | kind sentence + "Move it" | Says why in cm or litres; offers the place it would fit |
| S06 | Item | tap an item | — | Owner's sleeping bag | Every placement one tap; weight editable; source shown |
| S07 | Locker (gear sheet) | Add gear | catalogue by category | "Yours" + catalogue | Search, category chips, one-tap + that packs it; "Add your own"; paste |
| S08 | Custom item | Locker → Add your own | form | — | name + weight + kind; guessed size |
| S09 | Loadouts | loadout name ▾ | one loadout | Megafuck + copy + Cuba | switch, rename inline, copy, delete with undo, compare, paste, copy as sheet, download |
| S10 | Compare | Loadouts → Compare | needs 2 (toast) | Megafuck vs Cuba | totals side by side with deltas; "What moved" list |
| S11 | Paste a spreadsheet | Loadouts / empty Gear | blank | owner's sheet pasted, preview with reconciliation | reads matrix + flat forms, totals rows, says what it matched |
| S12 | Someone else's rig | a v2 link / gallery rig | rig without a pack | owner's shared link | banner, "not yours" flags, Copy to my locker |
| S13 | Suggest a layout | Gear → Suggest | — | toast with Undo | packs heavy low and central; nothing overflows |
| S14 | Warnings | Gear | — | fork cage over rating | a sentence, never an alarm colour on the whole panel |
| S15 | Units | kg ⇄ lb | — | lb | every number in the app flips together |
| S16 | Drag to bag (desktop) | drag a row onto a bag | — | ghost "→ Seat pack" | bag lights; drop opens it; won't-fit toast offers the fix |
| S17 | Loadouts gallery card | Start → Loadouts | — | Megafuck card | the packed example is one of the curated rigs |

Phone specifics: the left column is the bottom slab (tuck with the chevron to
see the bike); every sheet is a bottom sheet; there is no drag — S06's
"Where it goes" is the path, and it is also the keyboard path on desktop.
