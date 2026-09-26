# Packrig Design System

**Version 2.0: the system as built (26 Sep 2026).** Every value here is in
`src/ui/tokens.css`, and every stylesheet reads the tokens rather than
writing a value down. Where this file and the code disagree, the code is
wrong or this file is stale; fix one of them the same day.

Packrig's character: **outdoor, technical, calm, premium.** The bike is the
hero. The UI is instrumentation around it, not a website on top of it.

`REDESIGN.md` describes the product built on this system (what is on each
screen and why). `SCREENS.md` is the list of every screen and how each is
checked.

---

## 0. Where this came from

| Source | What we took |
|---|---|
| Apple HIG, Materials | Chrome supports content, never competes. One material ladder. 44pt hit targets. Concentric radii. Semantic tokens instead of raw hex at call sites. |
| Apple Watch Studio | The product stays full size while options change beside it. Change is instant and animated in place. |
| Stripe | One typeface, hierarchy from weight. Tabular figures wherever numbers matter. A short token list, ruthlessly reused. |
| Spotify Encore | Dark-first surfaces where elevation is lighter. The detail pattern: picture, title, metadata, one loud action, dense list below. |
| Faceted search research | Counts on every facet, one-tap removal, never an unfiltered long tail. |
| Bike and car configurators | The model is never covered by a modal; the camera reframes to make room. Hotspots live on the object. |

---

## 1. Principles

Each is testable, and `tools/screens.mjs`, `tools/tasks.mjs` and
`tools/contrast.mjs` test them.

1. **The bike is never crowded.** The camera fits the bike's projected
   silhouette into whatever the chrome leaves (`src/ui/framing.js`). On a
   393 x 852 phone the bike is at least 45% of the screen's height with the
   sheet at its peek and 35% with a sheet at half.
2. **One glass, one polarity, no tint.** Every surface is dark neutral glass
   with white ink. The glass samples the scene desaturated and darkened, so a
   desert does not turn it brown and a forest does not turn it green.
3. **One accent, two jobs.** Ember is the fill of the one primary action on a
   surface and the selection ring. Nothing else is filled with a hue; meaning
   colours (ok, warn, bad) are text and thin marks, never fills.
4. **One surface at a time.** One sheet at most. No modal, no veil over the
   scene, ever.
5. **Numbers are typeset.** Tabular figures, the unit one ink level down.
6. **Motion explains geometry.** Sheets come from the edge they belong to;
   sheets, panels and the camera share one curve family.
7. **If it can be pointed at, it is pointed at.** Where a bag goes is chosen
   on the bike (mount rings). The list is the fallback for keyboards and
   screen readers.

---

## 2. Typeface

**Inter Variable**, self-hosted and subset (`assets/fonts/InterVariable.woff2`,
37 KB). Tabular figures are on wherever a number is read (`.num`). The
slashed zero is not used: in Inter it reads as a code font next to prose.

### 2.1 Type ramp

Eight sizes, integer pixels only. Nothing is smaller than 11px; body text is
never smaller than 13px.

| Token | Size | Weight | Used for |
|---|---|---|---|
| `--fs-hero` | 56 (40 on a phone) | 650 | The start screen headline, nothing else |
| `--fs-display` | 32 | 650 | The all-up weight, CdA and watts, an example rig's name |
| `--fs-title1` | 24 | 650 | A product or item name in its sheet |
| `--fs-title2` | 20 | 650 | Sheet titles, the rig name, start-screen entries |
| `--fs-title3` | 16 | 600 | Row names (a bag, a catalogue row) |
| `--fs-body` | 15 | 400 to 600 | Body copy, buttons, item names |
| `--fs-caption` | 13 | 400 to 600 | Metadata, secondary rows, in-row numbers |
| `--fs-label` | 11 | 650, caps, +0.08em | Section labels, badges |

Tracking is negative only at 20px and above (`--tr-display`, `--tr-title`)
and positive only on labels.

---

## 3. Colour

### 3.1 Ink

White at an alpha, one polarity for every scene.

| Token | Value | For |
|---|---|---|
| `--ink-1` | white 0.96 | titles, values |
| `--ink-2` | white 0.74 | body, secondary values |
| `--ink-3` | white 0.60 | labels, units, metadata (text at 11px and up) |
| `--ink-4` | white 0.28 | dividers, handles; never text |
| `--ink-on-accent` | `#24120A` | text on Ember |
| `--ink-on-plate` | `#16181C` | text on a white chip or plate |

`--ink-3` was 0.48; it is 0.60 so 11px labels and 13px metadata clear
4.5:1 over every environment (measured, section 9.1).

### 3.2 Glass

| Level | Background | Filter | Border | Used for |
|---|---|---|---|---|
| E1 | `rgba(14,15,17,0.62)` | `blur(16px) saturate(60%) brightness(0.6)` | white 0.10 | chips on the canvas, the coach mark |
| E2 | `rgba(14,15,17,0.64)` | `blur(28px) saturate(50%) brightness(0.5)` | white 0.12 | the rig panel, example chips |
| E3 | `rgba(14,15,17,0.66)` | `blur(36px) saturate(45%) brightness(0.48)` | white 0.14 | sheets, the phone start slab, the tunnel panel |
| E4 | `rgba(24,26,30,0.96)` | none | white 0.16 | popovers, the More menu, the toast |

**Why the filter and not the alpha.** The old glass sampled the scene through
`saturate(150%)`, so every sheet over the desert read brown. Legibility comes
from darkening and desaturating what is sampled, never from colouring the
panel or pushing its alpha towards opaque.

Fills inside glass: `--fill-1` (white 0.05, row rest), `--fill-2` (0.09,
hover, quiet button), `--fill-3` (0.15, pressed, active). `--hairline`
(0.09) separates rows. `--shade` (black 0.55) backs focus rings and swatch
rings so they survive any ground.

### 3.3 The scrim well

Every panel and sheet also has a scrim well: a blurred dark copy of its own
shape in a layer behind all chrome (`src/ui/surfaces.js`), strength
`--scrim-k` from the scene's luminance under the panel (`src/ui/scrim.js`).
It darkens the scene behind the panel, not the panel. The wordmark gets the
same well at 0.6.

### 3.4 Accent and meaning

| Token | Value | For |
|---|---|---|
| `--accent` / `-hi` / `-lo` | `#FF7A45` / `#FF8F62` / `#E9622F` | the primary action fill; the selection ring |
| `--accent-ring` | Ember 0.90 | the selected bag row, catalogue row, example chip |
| `--ok` | `#4FCB8B` | fits, copied, saved |
| `--warn` | `#F2B23C` | tight, over a rating, bulges |
| `--bad` | `#FF6B5C` | won't fit, remove |

Ember is never a card background, never a long text colour, and there is at
most one Ember fill per surface.

### 3.5 The photo plate

`--plate` (`#FFFFFF`) behind a maker's studio photograph, with
`--plate-edge`. A rendered model sits on `--fill-1` instead: a white plate
behind a black 3D bag is a hole.

---

## 4. Space, radius, layout

- **Space**: a 4px lattice, `--s-1` 4 to `--s-10` 72. `--gutter` is 16.
- **Radius**, concentric: panel 20, card 14, control 10, chip 8, thumbnail
  8, pill 999.
- **Touch floor**: `--target` 44px. Every control on a phone is at least 44 x
  44; a swatch that looks 32px carries padding to 44.
- **Layout**: `--topbar-h` 64 (56 on a phone), `--panel-w` 400,
  `--sheet-detail-w` 440, `--sheet-catalog-w` 600. Breakpoints are
  MOBILE.md's: phone up to 560 (or a coarse pointer under 480 tall), desktop
  from 901. Layout keys on width, not on the pointer: headless Chrome has no
  pointer and a touchscreen laptop is still a desktop.

---

## 5. Motion

| Token | Value |
|---|---|
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)`: entries, the house curve |
| `--ease-in` | `cubic-bezier(0.64, 0, 0.78, 0)`: exits |
| `--ease-inout` | `cubic-bezier(0.65, 0, 0.35, 1)`: chips, toggles |
| `--ease-camera` | `cubic-bezier(0.32, 0, 0.16, 1)`: the camera |
| `--d-micro` / `--d-control` | 120 / 180 ms |
| `--d-sheet` / `--d-sheet-out` | 320 / 240 ms |
| `--d-camera` | 700 ms |

Sheets and the panel move on `--d-sheet`; the camera starts on the same tick
and runs `--d-camera`, so a sheet opening and the bike moving out of its way
read as one gesture. A phone sheet being dragged follows the finger with no
easing and settles on `--d-sheet`. Nothing animates `blur()`,
`backdrop-filter`, `width` or `height`.

Reduced motion: every duration collapses to zero; the camera still reframes,
instantly; the mount rings stop pulsing.

---

## 6. Components

Built once, in `src/ui/base.css`, and used everywhere:

| Class | What |
|---|---|
| `.btn` | quiet button: `--fill-2`, 44px tall, 15px 600. `.primary` Ember, `.ghost` text only, `.bad` a red label, `.sm` 36px (44 on touch), `.wide` |
| `.chip` | filter or toggle, pill, 36px (44 on touch); `.on` is white with dark ink |
| `.seg` | a two-way switch (kg / lb) |
| `.input` | fields, selects, textareas |
| `.meter` | a 4px fill bar; `.tight` warn, `.over` bad |
| `.thumb` | a 48px picture; `.is-photo` on the white plate |
| `.label` | an 11px caps section label |
| `.toast` | one line and one action, E4, above the sheet on a phone |

The shell (`shell.css`): the top bar, the More menu, the panel and the sheet
(one frame, three phone heights), the mount rings, the coach mark and the
account sheet. The rig (`rig.css`): the numbers, bag rows with fill and
contents, item rows, tiles, the inside of a bag, share and bike sheets.

---

## 7. Icons

One set, `src/ui/v2/icons.js`: a 20 x 20 grid, 1.5px stroke, round caps and
joins, `currentColor`, no fills (the brand mark is 2px). No emoji and no text
glyphs do icon work. Every icon-only control has an `aria-label` and a
tooltip, and every control in the top bar and the More menu also has a
visible label.

---

## 8. Imagery

- **Maker photographs** are hot-linked. A studio shot (white corners) sits on
  the white plate, `object-fit: contain`, so a long bag is never cropped.
- **No photo, or a photo that fails, shows the bag's own model**
  (`src/ui/bagthumbs.js`): built by its builder at its size in its colourway,
  drawn once into the shared offscreen renderer that item thumbnails use
  (`src/pack/ui/thumbs.js`), three-quarter view, cached. A 3:2 render in the
  catalogue, 16:9 in a bag's sheet, square in a row. No blank plates, no
  placeholder shapes.
- **Items** are always their own model, the same mesh the bag shows inside.
- Images wait on their plate, never a broken icon (`img:not([src])` is
  hidden until it has one).

---

## 9. Accessibility

### 9.1 Contrast

Measured, not assumed: `tools/contrast.mjs` shoots the start screen, an
empty bike, a packed rig and an open bag in all five environments on both
devices, removes the glyphs, and computes each text element's ratio against
the lightest tenth of the pixels behind it. The floor is 4.5:1 (3:1 at 24px
and up). Results are in `shots/contrast/report.json` and UX-WRITEUP.md.

### 9.2 Focus

A white 2px outline with a dark halo, legible on glass, a desert and a night
sky alike. `outline: none` without a replacement does not exist here.

### 9.3 Keyboard and screen readers

- The 3D view is focusable: arrow keys turn the bike, + and - zoom, Home
  frames it.
- Mount rings are buttons ("Seat pack: 78 bags"); "Choose from a list" is the
  same choice as a list.
- Sheets are `role="dialog" aria-modal="false"` (the scene stays live), take
  focus to Close when a keyboard opened them, close on Escape and hand focus
  back.
- The More menu is a `role="menu"` with arrow keys and Escape.
- Filter popovers take focus on open and close on Escape to their chip.
- Meters carry `role="meter"` with their value; bag rows carry a full label
  ("Seat pack: Apidura Expedition Saddle Pack, 13 L, 6 things, 65% full").
- Desktop drag and drop has a keyboard and touch path: an item's sheet lists
  every place it can go, one tap each.

### 9.4 Reduced motion

Durations collapse to zero, rings stop pulsing, the camera cuts.

---

## 10. The token block

`src/ui/tokens.css` is the token block; it is not copied here, so the two
cannot drift. `node tools/css-stats.mjs` reports the files, lines, distinct
hex values and font sizes across every stylesheet the app loads.
