# Packrig — the menu redesign

**The single plan of record for the UI.** If another document disagrees with
this one about menus, sheets or accounts, this one wins. For the map of the
repo, read `STATUS.md`. `MENUS.md` was folded in here and deleted;
`DESIGN-SYSTEM.md` §6, §10 and §12 moved here; `notes/archive/NEXT-RUN.md`
§5 Track C now points here.

**Status: plan, not built.**

What stays elsewhere, and why: `DESIGN-SYSTEM.md` §2–5, §7–9 and §11 keep the
*values* — type ramp, colour, the scrim well, spacing, motion curves, icons,
imagery rules, accessibility, and the token block. Those are a stylesheet, and
copying a stylesheet into a plan is how the two start disagreeing. Everything
about **what to build and in what order** is here. `src/MOBILE.md` keeps the
device contract (breakpoints, safe areas, the puppeteer assertions);
`FIREBASE.md` keeps backend setup.

---

## 0. The desktop review of 12 Aug, and what it changed

A walk through the built app on desktop, and the notes off it. Recorded here
because four of them change decisions §1–§16 had already taken.

| The note | What was done |
|---|---|
| "you should keep the fade menu throughout the builder — the background doesn't need to do what it just did" | The ramp is the SHELL's, not the menu's: `.app-veil` in `ui/v2/builder.css`, painted permanently, and the panel, the sheet and the top bar are transparent surfaces on it. Crossing between menu and builder now changes only what is written in the column. |
| "top right-hand corner should be a login button … a normal login window with email password and Google" | `src/ui/account.js` — the one modal in the app, opened from the menu's header and from the top bar. `rigsui.js` is deleted; it held the form, the rig list, the gallery and the publish flow in one sheet. |
| "from build a rig I go straight into by bag type or by brand" | `onBuild` opens the mount picker. The empty column with a paragraph explaining that the bike is empty is gone. |
| "handlebar roll should be the same size as build a rig … the bags listed at that size with the image a little bigger" | One size for a destination in the column at every level: `.pr-item-name`'s 550 19px/1.25, with menu.css's own two breakpoint steps. Product plates 52 → 72px. |
| "as soon as you put bags on a bike, save this rig should appear — bottom right" | §6's control moved out of the top bar into `.save-dock`. It says `Save this rig`, `Save changes` on a rig that already exists, then `Saved ✓`. |
| "if I've got a saved rig it should say my rigs, and there's a build a rig button on that page" | The start screen's first row swaps on `rigs.knownCount`, and `rigs` is a fourth menu view — `browse.js` with your own bikes as its source. |
| "the rigs view shouldn't be on the same page as add a bag — that's only when you click new rig" | `rignav.js` lost its list level. The builder column is only ever the rig you have open. |
| "the menu button should just be the same as clicking packrig, so you don't need it — and the spinning logo looks super weird" | `home-up` deleted; the wordmark is the way up at every width (so it comes BACK on a phone, where sheet.css had hidden it in the Menu button's favour). `orbit` redrawn — it was an arc with a right-angle mark floating outside the circle. |
| "clicking john brophy dot net loading my rigs — my rigs should only be in the side nav" | The top-bar button opens the account and nothing else. Load, update, share, publish and delete are all on the rigs view. |

Two later notes off the same session:

- **"Let's remove the gallery section for now — it adds too much complexity to
  the pages."** Done: the third row on the start screen, the `gallery` menu
  view, `browse.js`'s remote source and its show-your-own-rigs fallback, the
  publish flow and its display-name prompt are all out. **§8 below is on hold**,
  and so is goal 4 in §1. `rigstore.js` keeps `gallery()` and `setPublished()`
  and says in as many words that nothing calls them: the documents already
  carry `published`, and FIREBASE.md already has the rules and the index, so
  bringing it back is a UI job rather than a data one.
- **"When I select a bag, load it onto the bike but leave the menu as it is so I
  can go back and select my next bag."** Fitting a bag no longer closes the
  sheet. The row takes the fitted mark, a toast offers Undo — which puts the
  PREVIOUS bag back when it was a swap — and the back arrow returns to the
  mount list with the occupancy updated. Adding four bags was four walks down
  the same tree; it is now one.

Three things were found while making those changes, none of them asked for:
`.bag-list` had no `min-height: 0`, so on a phone it pushed `Add a bag` and the
swatches off the bottom of the sheet; `aero-open` was set on `body` while every
rule that reads it is scoped under `#ui-root`, so the rig column never stood
down for the wind tunnel; and `builder.css` had taken the twelve colour
swatches back to 20px on touch after `ui.css` had raised them to 44.
`tools/scratch/_mobile.mjs` was still clicking `.home-btn.is-primary`, a v1 selector, so
every check in it had been running against the menu rather than the builder.

---

## 1. The goals

1. **Setting up a bike is easy.** §4, §5, §9
2. **A clear save CTA is always visible when there is something to save, and
   making an account is simple.** §6
3. **Getting your own rig back is easy.** §7
4. ~~**The gallery is worth scrolling.** §8~~ — on hold, see §0 and §8
5. **It feels extremely functional and very premium — because it says less.** §1.1

### 1.1 Voice — functional, premium, quiet

Premium tools are terse. This one explains itself constantly: nearly every panel
carries a subtitle telling you what the title already said, and the empty states
give instructions for things a button would make obvious. That is what makes an
otherwise well-built app read as amateur.

**The test: does this sentence carry information the screen does not?** If not,
cut it. Six rules:

1. **A title needs no subtitle** unless the subtitle carries data.
2. **Never label a control that already says what it does.**
3. **No instructions where an affordance will do.** Pulsing mount rings beat
   "Where on the bike does this bag go?".
4. **Empty states get one line**, not two sentences.
5. **Detail lives in `aria-label` and a 400ms tooltip**, not permanently on screen.
6. **Numbers, not adjectives.** `57.8 L`, never "a big load".

The cuts, concretely:

| Today | Becomes |
|---|---|
| `Bikepacking configurator`, under the wordmark | — (§14.3) |
| `Drag to orbit · scroll to zoom · add a bag from the panel` | first-session coach, gone on first drag (§14.5) |
| `My rigs` + `ON YOUR ACCOUNT` | `My rigs` |
| `See what other people are riding` + `Browse the gallery` | `Gallery` |
| `Rigs people have published. Load any one and make it yours.` | — (the grid says it) |
| `Anyone can browse this` | — |
| `No saved rigs yet. Build a bike, name it, and hit save.` | `No saved rigs yet` |
| `Nothing published yet. Save a bike, then hit Publish — yours would be the first.` | `Nothing published yet` |
| `Nothing mounted yet.` + `Add a bag to start building your rig.` | `Start with a seat pack` (§4) |
| `Where on the bike does this bag go?` | — (§9) |
| `FRAME` · `BIDONS` · `SCENE` | — (§10) |
| `Name this build — "Highland overnighter"` | `Name this rig` |
| `Frame · bidons · scene` (Appearance sub) | — |

**What stays, and why — the rule is cut what describes, keep what persuades or
warns:**

- The *why* before a signup ask — "so your rigs follow you between devices" (§6).
  This is the one place a sentence earns its space.
- Error sentences. The `HUMAN` maps in `auth.js` and `rigstore.js` are correct: a
  failure is exactly when someone needs a full sentence.
- `Too long for this frame — 42 cm needs 38 cm`. That is data, not chatter.
- The wind tunnel's explanations. They defend a number people will not otherwise
  believe.

**This is not a phase.** Every phase below carries its own cuts; §14 collects the
structural ones. The check at review time: *no panel has both a title and a
subtitle unless the subtitle carries data.*

---

## 2. Decisions already taken

Recorded so nobody relitigates them mid-build.

| Decision | Choice | Consequence |
|---|---|---|
| Rig thumbnails | Captured at publish, uploaded to **Cloud Storage** | New bucket, new rules file, `storageBucket` back in `config.js` |
| Profile photos | **Real upload**, resized client-side | Size cap, type check, EXIF stripping, and a report path are now obligations, not nice-to-haves |
| Clubs | **Freeform text** | No admin burden; accept that typos fragment the list |
| Bag-picking menus | **In scope** | The largest phase, but it is fully specified in §9 |
| Mobile | **First-class, same pass** | Every sheet designed at 393×852 first, not retrofitted |

---

## 3. The one structural problem

There are **two unrelated overlay systems** in the app, plus a third that is
half-built:

- `ui.js` → `openOverlay()` / `closeOverlay()`, ~400 lines, drives bag picking.
- `rigsui.js` → its own veil and `pk` element, 491 lines, drives accounts, saved
  rigs and the gallery. It knows nothing about the first one.
- `src/ui/sheet.js` → the `openSheet()` shell. Wired into `main.js`, tokens and
  CSS loaded, and both systems above ignore it.

Every symptom in this document traces back to this. Two sheets can open at once.
Mobile rules get written twice. The save button lives in one world and the bike
lives in another.

**Phase 1 is therefore plumbing, not design: everything goes through
`openSheet()`.** The success criterion is *no content redesign* — the bodies of
the pickers move across untouched, and only the shell around them changes. That
shell change is not cosmetic: it deletes `.picker-veil` (§14.1), so every
surface stops dimming the 3D scene. Do phase 1 first or every later phase gets
built twice.

### 3.1 One shell, three widths

There is exactly one surface concept in the app. A **right-anchored side sheet**,
never a modal, never a veil over the 3D scene.

| Width | Use |
|---|---|
| `clamp(420px, 34vw, 560px)` → 480 @ 1440 | Bag sheet (§5), rig sheet, account sheet |
| `clamp(560px, 50vw, 760px)` → 720 @ 1440 | Catalogue (§9) |
| 56 | Rail — the rig panel collapsed while a sheet is open |

`right: 24, top: 24, bottom: 24`, E3 + scrim well, radius 20, `overflow: hidden`,
flex column. Under 900px every one of them becomes a bottom sheet with detents
(§10).

**The scene is never dimmed.** A configurator that hides the model to show you a
picture of the model has inverted itself. The camera reframes instead (§3.2).

### 3.2 Camera reframing

When a sheet opens the free area shrinks, and the camera must respond or "the
bike is never crowded" is a slogan.

```
freeArea     = viewport minus (rail 56 + 24) left and (sheetW + 24) right
targetCentre = centre of freeArea, in NDC
```

Animate the orbit target's screen-space anchor so the bike's projected bounding
box centres on `targetCentre`; dolly out only if the bbox would exceed
`freeArea − 40px`. `--d-camera` / `--ease-camera`, starting on the same frame as
the sheet. **Never rotate on a sheet open** — only pan and dolly. Rotation while
reading a spec sheet is nauseating.

On close, reverse — but if the user has orbited manually since opening, respect
their camera and only undo the pan offset.

---

## 4. The rig panel

Today it is a scrolling wall of two-line text, the 22×22 hover-reveal action
buttons are half the hit-target floor and undiscoverable, and it holds 320px
permanently whether or not anything else is open.

```
 ┌─ 280 ────────────────────────────────────┐   left: 24  top: 88
 │  THE RIG                          57.8 L │   20/16/12 pad; --t-label ink-3
 │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░          │   capacity bar, 3px, r2
 ├──────────────────────────────────────────┤
 │ ┌────┐                                   │
 │ │ 📷 │  APIDURA                      9 L │   row 64h, 8px gutter, r10
 │ │48×48│ Expedition Saddle Pack           │   brand --t-micro ink-3 caps
 │ └────┘                                   │   name  --t-title3 ink-1, 1-line
 │  …                                       │   max-height 62vh, fade-bottom 32
 ├──────────────────────────────────────────┤
 │  ┌──────────────────────────────────────┐│
 │  │           +  Add a bag               ││   44h, --fill-2, r10
 │  └──────────────────────────────────────┘│
 └──────────────────────────────────────────┘   E2 + scrim well, r20
```

- Width **280** (was 320). Thumbnail 48×48, `object-fit: cover`.
- **The whole row is one hit target and opens the bag sheet** (§5). Remove, swap
  and buy live in the sheet, not as 22px hover buttons. `min-height: 64px`.
- Capacity bar: track `--ink-4`, fill `--ink-1` at 0.85. Not Ember — a total is
  not an action.
- A bag that will not fit: full opacity, a left 2px `--bad` edge, and a second
  line `Too long for this frame — 42 cm needs 38 cm` in `--t-micro` / `--warn`.
  Do not grey it out; greyed text is the least legible thing over a bright scene.
- Overflow `⋯` in the header holds `Clear bike`, `Share kit`, `Copy link`.
  Destructive actions do not live at the top level.
- **Rail state** when any sheet is open: width 56, the 40×40 thumbnails stacked
  with 8px gaps plus a `+`. Clicking a thumb swaps the sheet's contents;
  clicking the rail expands it and closes the sheet.
- Empty state: `--t-display` "Start with a seat pack", one line of `--t-body`
  ink-2, and the Add button. No bulleted instructions.

---

## 5. The bag sheet — one surface, two states

**Tapping a bag opens it. From the rig panel, or on the bike itself.**

Today, tapping a bag on the model selects it, rings it and zooms the camera
(`focus.js` → `ui.setSelected()`) — and then nothing. That dead end is the
cheapest high-value thing in this plan to fix, because everything behind it
already works.

| State | Reached by | Actions |
|---|---|---|
| **Fitted** | tapping a bag on the bike, or its row in the rig panel | Replace it · Remove it · Buy it |
| **Catalogue** | browsing for something new | Add to bike · Buy it |

```
 ┌─ 480 ──────────────────────────────────────────────┐
 │ ┌──┐                                          ┌──┐ │  header 56h, pad 16
 │ │ ←│  Handlebar bag                           │ ×│ │  ← only from catalogue
 │ └──┘  --t-micro ink-3                         └──┘ │  buttons 36×36 r10
 ├────────────────────────────────────────────────────┤
 │  ┌──────────────────────────────────────────────┐  │
 │  │            product photograph                │  │  HERO 432×288 (3:2)
 │  └──────────────────────────────────────────────┘  │  plate #FFF, r12
 │              ●  ○  ○  ○                            │  dots 5px, ≤6 images
 │  SWIFT INDUSTRIES · ZEITGEIST                      │  --t-label ink-3
 │  Zeitgeist Pack                                    │  --t-title1 ink-1
 │  12 L · Handlebar bag · Seattle, USA               │  --t-caption ink-2
 │  SIZE                                              │
 │  ┌──────┐ ┌━━━━━━┐ ┌──────┐                        │  chips 36h, r8
 │  │  9 L │ │ 12 L │ │ 16 L │                        │  active --fill-3
 │  └──────┘ └━━━━━━┘ └──────┘                        │
 │  COLOURWAY                        Coyote           │  §5.2
 │  ● ● ● ●                                           │  28px dots, ring active
 │  SPECIFICATIONS                                    │
 │  Capacity                              12 L        │  rows 40h, hairline
 │  Dimensions                    42 × 16 × 15 cm     │  --t-data-s tnum, right
 │  Weight                                410 g       │
 │  Dimensions verified            Maker ✓            │  ✓ in --ok
 │  FEATURES                                          │
 │  Reflective side panels                            │  --t-body ink-2, 22px
 ├────────────────────────────────────────────────────┤  hairline + 24px fade
 │              [ footer — §5.1 ]                     │  sticky, never scrolls
 └────────────────────────────────────────────────────┘
```

**The bag stays ringed in 3D while its sheet is open.** You look at the real
thing and the photo of it at the same time. That is the argument for this app
existing.

Size and colourway change the model **instantly**, no confirm step, with the
hero cross-fading to that colourway's image where one exists (`--d-control`,
opacity only).

If a product has no `dims_verified`, still show the `Dimensions` row with an
`est.` tag in `--t-micro` / `--warn`. Honest data beats tidy data.

### 5.1 The footers

Catalogue state — two buttons, 76h:

```
 ┌─────────────────────┐ ┌──────────────────────┐
 │    Add to bike      │ │  Buy at Swift  ↗     │   48h, gap 12
 └─────────────────────┘ └──────────────────────┘   Ember pill | --fill-2 r10
```

Fitted state — **three actions, two rows, 132h**:

```
 ┌────────────────────────┐ ┌─────────────────┐
 │      Replace it        │ │    Remove it    │   48h, gap 12
 └────────────────────────┘ └─────────────────┘   Ember pill | --fill-2, --bad label
 ┌──────────────────────────────────────────────┐
 │           Buy at Apidura   ↗                 │   48h, full width, --fill-2
 └──────────────────────────────────────────────┘
```

- **Replace it** is the Ember, because it is the action that keeps you in the
  app. It opens the catalogue pre-filtered to that mount slot —
  `openBrandPicker(uiSlot)` already does precisely this and only needs to be
  reachable from here. Coming back swaps in place, keeping the colourway index
  where the new product has one.
- **Remove it** does not get an Ember. Destructive actions do not get the loud
  fill. `app.bags.remove(uiSlot)` exists; add **undo** — removal is one tap with
  no confirm, and a `Removed — Undo` line in the rig panel for ~6s costs nothing.
- **Buy** goes last, on its own row, because it leaves the app. Href from
  `product.src`, `target="_blank" rel="noopener noreferrer"`. When `src` is
  missing the button is replaced by a `--t-micro` ink-3 line "No maker link on
  file" — **never a dead button**.
- `Add to bike` and `Replace it` are the only Ember fills in the sheet.
- The footer is sticky and never scrolls away. Above it, a 24px
  `linear-gradient(transparent, var(--e3-bg))` so content dissolves rather than
  being guillotined.

### 5.2 Colour

**The model layer is already finished.** `bags.setColorway(uiSlot, i)`,
`BagSystem.colorwayCount(product)` and `colorwayFor(brand, product, i)` all
exist, and `captureRig()` already persists `cw` per bag — so a colourway
survives save, share link and reload *today*. This is purely a missing control.

Wire the COLOURWAY row to `setColorway`: 28px dots, 10px gap, ring on the active
one, instant. The data carries `{name, hex}`, so show the name to the right of
the label.

When a product has one colourway, show the row with the name and no picker
rather than hiding it — a row that vanishes on some bags and not others reads as
a bug.

### 5.3 The bigger image

Hero is the product photograph. **501 of 702 products have one**; the other 201
do not. The fallback is better than a placeholder: render the bag's own mesh to
a hero-sized target. The geometry is parametric and the renderer is right there.
Same offscreen target as the gallery thumbnails (§11), so it is one piece of work.

### 5.4 Selection and hover in the 3D scene

| State | Scene | UI echo |
|---|---|---|
| Hover a bag | Other bags exposure ×0.75, saturation ×0.6 over 140ms. Hovered bag gains a 1.5px screen-space Ember outline at 0.7. Label chip (E1, 28h, `Swift · Zeitgeist 12 L`) 10px above its projected bbox, clamped on screen | Rig row `--fill-2` |
| Selected | Outline solid, 1.5px Ember + 1px black inner. Chip persists. **Other bags return to full exposure** — selection is a pin, not a spotlight | Rig row `--fill-3` + 2px Ember left edge; **bag sheet opens** |
| Empty mount, add-mode | 24px ring, `--ink-1` at 0.35, pulsing 1.0→1.12 over 1600ms | Rig panel: "Pick a mount point on the bike" |
| Empty mount, hovered | Ring → 36px, Ember, no pulse, chip `Handlebar · 73 bags` | — |
| Won't fit here | Ring `--warn` at 0.5, cursor `not-allowed`, chip explains | — |

- Screen-space outline pass (mesh IDs to a mask, then a Sobel edge at 1.5 device
  px). **Do not** use a scaled duplicate mesh — bag geometry is thin and it
  produces artefacts at the straps.
- Click empty space or `Esc`: deselect, close sheet, ring fades over `--d-sheet-out`.
- Cursor: `grab` idle, `grabbing` orbiting, `pointer` over a bag or mount ring.
- The dim-on-hover already in the build is right; the change is that it stops at
  hover and does **not** persist into selection.

---

## 6. Goal 2 — an always-visible save CTA, and easy accounts

Saving is buried behind `☰ My rigs` in the bottom bar. Nothing on screen says
the bike is unsaved, or savable.

**The principle: save first, account second.** Never block a save behind a
signup form. `rigstore.js` already has a full local branch, and `migrateLocal()`
pushes local rigs up on first sign-in. Lean on it.

A persistent control in the dock:

| State | Shows | Does |
|---|---|---|
| Empty bike | nothing | — |
| Bags on, signed out | **Save this rig** | Saves to this browser *immediately*, then offers an account to keep it |
| Bags on, signed in | **Save** | Saves to the account |
| Saved, unchanged | `Saved ✓` | Quiet; flips back to **Save** the moment anything changes |

The last row needs dirty-tracking against the last saved rig — compare the
`captureRig()` output, which is already a plain serialisable object.

**Account creation** simplifies in the same pass: Google as one large button,
email and password demoted behind "or use email". The copy answers *why* before
asking for anything — "so your rigs follow you between devices". The `HUMAN`
error mapping in `auth.js` is good and stays.

---

## 7. Goal 3 — getting your rig back

Today: a text list. Name, bag count, litres, date.

- **Thumbnails on every card** — same capture as the gallery (§11), taken at
  save, not only at publish.
- **Current-rig marker.** If what is on screen is a saved rig, say so on that
  card, and show whether it has drifted since.
- **Inline rename**, not a prompt.
- Reachable from the same persistent control as Save, not a separate menu item.

---

## 8. Goal 4 — a gallery worth scrolling

> **ON HOLD — pulled from the build on 12 Aug.** "It adds too much complexity to
> the pages." Everything below is the plan for whenever it returns; none of it
> is on screen today, and §0 records what came out.

Today: text cards, and the query silently returns nothing because its composite
index does not exist (§12).

- **Card grid with thumbnails.** Two columns on phone, three or four on desktop.
- **Paginate 12 at a time**, appending on scroll. Not 60 in one query.
- **Filter chips:** club, bag count, brand, with counts on each.
- **A rig detail sheet** on tap: big render, the bags listed, the author's
  profile, and one loud `Try this bike`.

### 8.1 Profiles and clubs

New Firestore collection, `profiles/{uid}`:

```
display_name  string, ≤ 40
avatar_url    string, Cloud Storage URL
bio           string, ≤ 280 — words about their bikes
links         [{label ≤ 24, url}], max 3
club          string, ≤ 40, freeform
```

Rules: **anyone reads, only the owner writes.** Same shape as the rig rules in
`FIREBASE.md`.

**Denormalise for the gallery.** At publish time, copy `display_name`,
`avatar_url` and `club` onto the rig document — otherwise every gallery page
costs 12 extra profile reads. The copies go stale when someone edits their
profile; accept that, and refresh them on their next publish.

`rigs/{id}` gains `thumb_url`, `author_name`, `author_avatar`, `club`.

---

## 9. Goal 1 — the catalogue

**The information architecture, in one sentence: the mount point is the primary
facet, and it is free, because you always add a bag *to somewhere*.** That single
facet reduces 702 products to between 1 and 103 before the user has done
anything. Nobody ever sees 702 items.

Today it is mount picker → brand index → brand catalogue → model cards: four
taps before a bag is visible, and the first two ask questions a newcomer cannot
answer yet.

**Entry is always one of:**

- Click an empty mount on the 3D bike → catalogue opens pre-filtered to that slot.
- Click `+ Add a bag` → the bike enters mount-picking mode (§5.4): empty mounts
  get pulsing rings, **no list appears**. Pick one on the bike.
- Click a fitted bag, then `Replace it` (§5.1) → pre-filtered to that slot.
- **Starter kits** — three or four named loadouts (overnighter, race setup, full
  tour), one tap from the empty state. `Surprise me` proves the machinery works;
  this is the same thing with intent instead of randomness.

```
 ┌─ 720 ────────────────────────────────────────────────────────────────┐
 │ ┌──┐  Handlebar bag                                             ┌──┐ │ 56h
 │ └──┘                                                            └──┘ │
 │ │ ⌕  Search 73 handlebar bags                                      │ │ 40h r10, ⌘K
 │ ┌────────┐┌───────────┐┌─────────┐┌──────────┐  ┌──────────────┐     │ facets 34h
 │ │Brand ▾ ││Capacity ▾ ││Fabric ▾ ││ Fits ✓   │  │ Sort: Fit  ▾ │     │ chips r8
 │  73 bags · 21 brands                          Clear all              │ --t-micro
 ├──────────────────────────────────────────────────────────────────────┤
 │ ┌────────────┐ ┌────────────┐ ┌────────────┐                         │ minmax(200,1fr)
 │ │ ▢ photo3:2 │ │ ▢ photo3:2 │ │ ▢ photo3:2 │                         │ → 3 cols @720
 │ │ SWIFT      │ │ APIDURA    │ │ RESTRAP    │                         │ --t-label ink-3
 │ │ Zeitgeist  │ │ Expedition │ │ Bar Bag    │                         │ --t-title3, 2ln
 │ │ 12 L  ●●●  │ │ 9 L   ●●   │ │ 14 L  ●●●● │                         │ data + colourways
 │ └────────────┘ └────────────┘ └────────────┘                         │
 │  … infinite scroll, 24 per page …                                    │
 └──────────────────────────────────────────────────────────────────────┘
```

**Four facets, no more.** Facet overload causes drop-off, and four is what this
data supports.

| Facet | Type | Values |
|---|---|---|
| Brand | multi-select popover (E4), live counts, A–Z | derived from the filtered set; search box once > 12 brands |
| Capacity | single-select range chips | `<1 L` · `1–3` · `3–8` · `8–15` · `15 L+`, rebanded per slot (a stem bag gets `<0.5 / 0.5–1 / 1–2 / 2 L+`) |
| Fabric | multi-select | `X-Pac` · `Cordura` · `Welded TPU` · `Waxed canvas` — already computed by `FABRIC_KEY` in `catalog.js` |
| Fits my frame | toggle, **on by default** | off reveals non-fitting bags, greyed with the reason |

Every facet shows a live count; every applied one becomes a removable pill;
`Clear all` is present whenever ≥1 is on; facet state persists per slot for the
session.

**Sort.** `Fit` (default — best dimensional match, then capacity descending),
`Capacity ↑`, `Capacity ↓`, `Brand A–Z`.

**Search.** Matches `brand.name + product.line + product.name + size`, debounce
120ms. The empty state names what to relax: "No X-Pac handlebar bags under 3 L.
**Clear fabric** or **widen capacity**" — both are buttons.

**Brand index**, for people who shop by maker: a `Slot | Brand` segmented control
swaps the body to a grid of 50 brand cards (164×108 — name, origin, five 9px
palette swatches, `18 bags`). Selecting one applies it as a Brand facet and
returns to the slot view. **The two routes converge; they are not separate trees.**

**Performance** — 103 cards is not free:

- `loading="lazy" decoding="async"` on every thumbnail.
- `content-visibility: auto; contain-intrinsic-size: 200px 236px;` on grid items.
- 24 cards, then 24 more per `IntersectionObserver` hit 400px from the bottom.
- Serve a 400×267 derivative for cards; the 900×600 original is only for the
  §5 hero. Needs a `shrink-images.mjs` pass emitting `-sm.jpg` alongside each file.

---

## 10. The dock, and mobile

```
 bottom: 24, centred in the free area, height 56, radius 28, E2 + scrim well

 ┌──────────────────────────────────────────────────────────────────────┐
 │  ┌──────────────┐ │ ●●●●●● │ ●●●●●● │ ▭▭▭▭▭ │  ┌────┐┌────┐          │
 │  │ ⚡ Surprise me│ │ frame  │ bidon  │ scene │  │ ⟲  ││ ⌂  │          │
 │  └──────────────┘ │  28px  │  20px  │ 36×26 │  └────┘└────┘          │
 └──────────────────────────────────────────────────────────────────────┘
```

- **The `FRAME` / `BIDONS` / `SCENE` micro-labels are deleted.** Three 9px
  all-caps labels in one 56px bar is noise and unreadable over a bright scene.
  Groups are distinguished by **shape**, which parses faster than a label: frame
  paint = 28px circles with a metallic radial gradient, bidon = 20px flat
  circles, scene = 36×26 rounded rects showing a real HDRI crop. Meaning comes
  from `aria-label` and a 400ms-delay tooltip.
- Selected swatch: `box-shadow: 0 0 0 2px rgba(0,0,0,.6), 0 0 0 4px var(--ink-1)`.
  A white ring, not Ember — appearance is not the app's primary action.
- **Camera tools move from the top-right into the dock.** One floating cluster
  beats two; the top-right corner then belongs entirely to the scene.
- `Surprise me` stays quiet `--fill-2`. It is a novelty and does not get the
  Ember. `Clear bike` leaves the dock entirely → rig-panel overflow.
- **The dock has two forms and it must.** Expanded it is ~1000px; with a 480px
  sheet open at 1440 the free strip is 760px. Collapsed = `Surprise me` │
  `Appearance` │ camera tools, where `Appearance` is a quiet pill carrying a
  3-swatch overlapped stack (16px circles, −5px overlap) that opens an E4
  popover, 280px, anchored above it. Crossfade on `--d-sheet`, **measuring the
  free strip — never guessing from a breakpoint alone.**
- The **save CTA** (§6) lives here too, and is the collision risk on phone: it
  must coexist with the bottom bar, the wind-tunnel HUD and the home indicator.

### 10.1 Under 900px

Per `src/MOBILE.md`, which stays the device contract — breakpoints 560 / 900,
`(pointer: coarse)` treated as touch regardless of width.

Every sheet becomes a bottom sheet with detents:

```
   peek = 132px (handle + title + footer) · half = 52vh · full = 92vh
   radius 20 top corners only; grab handle 36×4
   drag to move between detents; velocity > 0.5 px/ms snaps in the drag direction
```

- The camera lifts the bike into the region above whichever detent is active.
- At `full`, the hero photo **scrolls with the content** — a pinned hero on a
  short viewport leaves ~200px for the spec table.
- **A 132px fitted footer (§5.1) is the entire peek** at 393×852. At peek, show
  Replace and Remove only; Buy appears at half and full.
- Rig panel becomes a bottom-left FAB (56×56, E2) when a sheet is open.
- **One sheet open at a time**, enforced by `openSheet()` now that everything
  routes through it.
- 44px minimum targets. The colourway dots (28px — they need a 44px hit area
  around them), the gallery filter chips and the rig card actions are where this
  will be tempting to shave.
- `env(safe-area-inset-*)` on anything touching an edge.
- Dock becomes a horizontally scrollable strip at
  `bottom: calc(var(--sheet-peek) + 12px)`.

---

## 11. Images — capture, storage, and the obligations that come with them

**Capture.** Render the rig offscreen, `canvas.toBlob('image/jpeg', .7)`, upload.

> **Trap, already paid for once:** canvas readback returns **all black** unless
> `preserveDrawingBuffer` is set, and `main.js:31` only sets it under `?shot=1`.
> Do not flip that flag on globally — it costs frame time everywhere. Render into
> a dedicated target instead. The same target serves the §5.3 hero fallback.

**Storage layout and rules** (new `storage.rules`, alongside the Firestore ones):

```
rigs/{uid}/{rigId}/thumb.jpg    read: public   write: own uid, ≤ 200KB, image/jpeg
avatars/{uid}.jpg               read: public   write: own uid, ≤ 200KB, image/jpeg
```

**Avatar upload** resizes to 256² through a canvas before sending. Re-encoding
through a canvas drops EXIF as a side effect — which is how the GPS coordinates
in a phone photo stop being a problem. Do not skip the resize and upload the
original.

**Moderation.** A public gallery accepting user photos and free text needs an
answer for someone posting something vile. The minimum: a `Report` action on
every gallery card writing to a `reports` collection, and a documented manual
takedown (`published: false`). This is thin. It is honestly thin. But shipping
user-uploaded images to a public page with *no* path at all is worse.

---

## 12. Prerequisites — console work, before any code

1. **The gallery composite index.** `rigs`: `published` Ascending, `published_at`
   Descending. Outstanding since accounts shipped; the gallery is empty without
   it. `FIREBASE.md` step 4.
2. **Enable Cloud Storage**, add `storageBucket` to `config.js`, deploy
   `storage.rules`. Public-by-design, same reasoning as the web API key — but a
   bucket with open read is worth a second look before it goes live.

---

## 13. Build order

| # | Phase | Depends on | Delivers |
|---|---|---|---|
| 0 | Console prereqs (§12) | — | Gallery can return rows; bucket exists |
| 1 | **Sheet unification** — everything onto `openSheet()`; rail + dock reposition + camera reframe on one tick | — | No visual change. Delete `openOverlay()` and the `rigsui.js` veil |
| 2 | **Bag sheet, fitted state** (§5) + rig panel rework (§4) | 1 | Tap a bag → replace, remove, recolour, buy |
| 3 | Save CTA, local-first save, simplified auth sheet (§6) | 1 | Goal 2 |
| 4 | Thumbnail capture + upload (§11) | 0, 1 | Unblocks 5 and 7 |
| 5 | My rigs — thumbnails, dirty state, inline rename (§7) | 4 | Goal 3 |
| 6 | Profiles and clubs (§8.1) | 0, 1 | Author identity |
| 7 | Gallery grid, filters, rig detail sheet (§8) | 4, 6 | Goal 4 |
| 8 | **Catalogue** — facets, search, brand index, image derivatives (§9) + 3D selection pass (§5.4) | 1, 2 | Goal 1. Largest phase; runs parallel to 3–7 |
| 9 | The deletions (§14) | everything | Removes what these replace |

Phase 1 is the only hard gate. Phase 2 is deliberately second: cheapest phase
with a visible payoff, it reuses machinery that already works, and it builds the
sheet body phase 8 then reuses wholesale.

---

## 14. What to delete

Opinionated. Each of these makes the product worse today. Do them last so
nothing breaks mid-flight — but do all of them.

1. **`.picker-veil`** — a full-screen `rgba(5,7,10,.58)` + blur over the 3D
   scene. The single biggest contradiction in the app. The side sheet replaces
   every use.
2. **`.top-scrim`** — the 400×190 radial black blob behind the wordmark. It is
   visibly a grey smudge on bright scenes. Use the scrim well at reduced
   strength, or a real E1 chip.
3. **"BIKEPACKING CONFIGURATOR"** — a tracked-caps subtitle under a tracked-caps
   wordmark, telling the user nothing the screen does not already say.
4. **The wordmark's `0.34em` tracking** → `0.10em`, weight 700 not 800, 18px.
   Extreme tracking is the loudest dated signal in the current UI.
5. **The persistent hint pill.** Replace with a first-session-only coach that
   dismisses on the first drag and never returns (`localStorage`).
6. **The three dock micro-labels** (§10).
7. **`.btn.primary` amber fill on `Surprise me`.** The loudest element in the
   product is a novelty. Ember belongs on `Add to bike`, `Replace it`, `Buy`.
8. **`Clear bike` at top level** → rig-panel overflow.
9. **`.bag-act` hover-reveal micro buttons** (22×22, `opacity: 0` until hover).
   Half the hit-target floor and undiscoverable. The row opens the sheet.
10. **The labelled `.env-chip` photo-card variant** — dead, superseded by
    `.envs.compact`. Also dead: the `.peak` clip-path mountain hack.
11. **All emoji/text-glyph icons** — `⟳ ⌂ ⚡ ⧉ ×` → the SVG sprite in
    `DESIGN-SYSTEM.md` §7.
12. **The duplicate rule blocks at the bottom of `ui.css`.** `.bottom-bar`,
    `.dock`, `.group-label`, `.divider`, `.paint-group` are each declared twice,
    the second overriding the first. A stylesheet that argues with itself is how
    the next agent introduces a bug.
13. **`--radius: 16px` as a single global radius** → the ladder in
    `DESIGN-SYSTEM.md` §4.2. One radius for a 480px sheet and a 22px button is
    why the current UI reads soft rather than crisp.
14. **`.card.est` italic** — italic at 11px is illegible. `--t-micro` in
    `--warn` with the word `est.`

---

## 15. How we know it worked

Assert, do not eyeball — both of these caught real bugs already:

- `document.documentElement.scrollWidth <= clientWidth` at every breakpoint.
- No two panel bounding rects intersect.

Screenshot at **393×852 DPR 2** and **852×393 landscape** with
`isMobile: true, hasTouch: true`, and read the images. Landscape is where a
bottom sheet has almost no room and is the case most likely to be forgotten.

**The copy check (§1.1):** no panel has both a title and a subtitle unless the
subtitle carries data.

Then, by hand, on a phone and a desktop:

1. Land on an empty bike; reach a loaded rig in **three taps** via a starter kit.
2. Tap a bag on the bike. The sheet opens, the bag stays ringed, a bigger photo
   is there, and a different colourway changes the model instantly.
3. Replace that bag from inside the sheet; remove another; undo the removal.
4. Signed out, save the rig, close the tab, come back — it is still there.
5. Create an account after that save; the local rig arrives in it.
6. Publish; the rig appears in the gallery with a thumbnail, name and club.
7. Scroll the gallery past 12 cards; more load.
8. Load somebody else's rig, change a bag, save it as your own.

---

## 16. Known risks

- **Denormalised author fields go stale.** Accepted, refreshed on next publish.
- **Moderation is minimal** (§11). Say so out loud rather than discovering it.
- **Phase 8 is enormous.** It is the one most likely to be half-done when
  everything else is finished.
- **A public bucket** is a wider surface than a public API key. Rules and size
  caps are the whole defence; test them the way the Firestore rules were tested.
- **201 products have no photo.** The §5.3 render fallback is not optional
  polish; without it roughly a third of bag sheets open on an empty box.
