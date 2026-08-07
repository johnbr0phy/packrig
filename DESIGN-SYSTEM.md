# Packrig Design System

**Version 1.0 — implementation specification**
Everything here is meant to be built from directly. Where a number is given, use that number.

Packrig's character: **outdoor, technical, calm, premium.** The bike is the hero.
The UI is instrumentation around it, not a website on top of it.

---

## 0. Where this came from

Researched, then translated — no assets, wordmarks or typefaces are borrowed.

| Source | What we took |
|---|---|
| Apple HIG — Materials & Vibrancy | Chrome *supports* content, never competes. One material ladder (ultraThin→thick), vibrancy tuned per material so ink stays legible over anything. 44pt hit targets. Concentric radii. Semantic colour tokens instead of raw hex at call sites. |
| Apple Watch Studio / iPhone buy flow | The product stays full-size and centred while options change *beside* it. Options are shown as the thing itself (a real swatch, a real band), never as a dropdown of words. Change is instant and animated in place — no "apply" step. |
| Stripe | Depth from background tint, not heavy shadow. One typeface, hierarchy from weight + tracking. Tight negative tracking on display sizes (−0.02em at 48px). Tabular figures wherever numbers matter. Short token list, ruthlessly reused. `cubic-bezier(.25,1,.5,1)` at 300ms as the house curve. |
| Spotify Encore | Dark-first surface ladder (#121212 / #181818 / #1f1f1f) where elevation = *lighter*, and shadows must be heavy (0.3–0.5 alpha) to register at all. The detail-view pattern: **big artwork → title → metadata rows → one loud primary action → dense list below.** Compact type (10–24px) with tight leading. |
| Faceted-search research (NN/g and successors) | Filters cut task time 25–50%, but too many facets causes drop-off. Show result counts on every facet. One-click removal. Never present an unfiltered long tail. |
| Car / high-end bike configurators | The model is never occluded by a modal; the camera *reframes* to make room for the panel. Hotspots live on the object. The active choice is echoed simultaneously on the object and in the panel. |

---

## 1. Principles

Seven constraints. Each is testable.

1. **The bike is never crowded.** Chrome occupies ≤ 24% of viewport width at rest, ≤ 38% with the product sheet open, ≤ 52% in the catalogue. In every state the camera reframes (§6.7) so the bike's projected silhouette sits entirely inside the free area with ≥ 40px clearance.
2. **One glass, one polarity.** Every surface is *dark* glass. Ink is never re-coloured per scene. Legibility over a bright desert is bought with a scrim behind the panel (§3.3), never by pushing panel alpha past `0.66` — past that it stops being glass and becomes a grey rectangle.
3. **One accent, two jobs.** Ember (`#FF7A45`) appears only as (a) the primary action fill and (b) the selection ring. Nothing else in the product is filled with a hue. Everything else is ink on glass.
4. **One surface at a time.** At most one sheet is open. Opening a sheet collapses the rig panel to a rail. **No full-screen modal, no veil over the scene, ever** — a dimmed 3D scene is a broken 3D app.
5. **Numbers are typeset.** Every litre, millimetre and gram is set in tabular figures with its unit one ink-level down. The spec table is the product's argument; treat it like a chart, not like body copy.
6. **Motion explains geometry.** Things enter from the edge they belong to. Nothing fades in from nowhere. Panel and camera move on the *same* curve and duration so they read as one gesture.
7. **If it can be pointed at, it is pointed at.** Mount points are chosen on the bike, not in a list. A control that duplicates something visible in the 3D scene gets deleted.

---

## 2. Typeface

**Inter Variable**, self-hosted, single variable `woff2`.

Justification: SIL OFL (redistributable), one file covers 100–900 so weight becomes a free hierarchy axis, purpose-built for UI at 11–15px, and — decisive here — it ships genuine **tabular figures** (`tnum`) and a slashed zero, which a catalogue of capacities and millimetre dimensions needs. System stack is the fallback, not the plan; `-apple-system` gives SF on macOS and Segoe on Windows, which are two different rhythms, and Packrig's whole point is a controlled one.

```css
@font-face {
  font-family: 'Inter';
  src: url('./assets/fonts/InterVariable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-display: swap;   /* fallback metrics are close; no visible jump */
}

:root {
  --font: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-num: var(--font);
}
body { font-family: var(--font); font-feature-settings: 'cv05' 1, 'ss03' 1; }
.num, td.num, .capacity, .dim { font-variant-numeric: tabular-nums slashed-zero; }
```

Subset to Latin + `·×–—→↗°` and the punctuation actually used. Target ≤ 48 KB. No network requests at runtime.

### 2.1 Type ramp

| Role | Token | Size | Weight | Tracking | Line-height | Used for |
|---|---|---|---|---|---|---|
| Display | `--t-display` | 34px | 600 | −0.022em | 1.08 | Empty-state headline only |
| Title 1 | `--t-title1` | 26px | 600 | −0.018em | 1.14 | Product sheet product name |
| Title 2 | `--t-title2` | 19px | 600 | −0.012em | 1.22 | Catalogue sheet header, brand page |
| Title 3 | `--t-title3` | 15px | 600 | −0.006em | 1.30 | Card names, rig-panel rows |
| Body | `--t-body` | 14px | 400 | 0 | 1.55 | Descriptions, feature bullets |
| Body strong | `--t-body-s` | 14px | 550 | 0 | 1.45 | Spec values, button labels |
| Caption | `--t-caption` | 12.5px | 400 | 0 | 1.45 | Metadata, secondary rows |
| Micro | `--t-micro` | 11px | 500 | 0.01em | 1.35 | Counts, helper text |
| Label | `--t-label` | 10.5px | 650 | **0.13em** | 1 | Section labels (`SPECIFICATIONS`), uppercase |
| Data | `--t-data` | 15px | 550 | −0.004em | 1.2 | Capacities, dimensions — always `tnum` |
| Data small | `--t-data-s` | 12.5px | 550 | 0 | 1.2 | In-row numbers — always `tnum` |

Rules:
- **Two tracked-caps elements must never be adjacent.** Today the wordmark and its subtitle are both tracked caps; one goes (§10).
- Tracking is negative above 18px and positive only in the Label role. Never letter-space body text.
- Maximum three type roles in any one component.
- Line length ≤ 62ch for Body. In a 480px sheet at 14px that's already satisfied.

---

## 3. Colour

### 3.1 Ink

Ink is always white at an alpha. There is no light-mode ink. This is what makes the system survive five wildly different HDRIs.

```css
--ink-1: rgba(255,255,255,0.96);  /* titles, primary values          */
--ink-2: rgba(255,255,255,0.70);  /* body, secondary values          */
--ink-3: rgba(255,255,255,0.48);  /* labels, units, metadata         */
--ink-4: rgba(255,255,255,0.28);  /* dividers, disabled, decorative  */
--ink-on-accent: #24120A;         /* text on Ember fill              */
```

`--ink-4` is **never** used for text. `--ink-3` is permitted for text at ≥ 12px only.

### 3.2 The glass ladder

Five levels. Elevation reads as *more blur and a lighter border*, following Encore's "up is lighter" — but the base tint stays dark so ink polarity never flips.

```css
/* E0 — the canvas. no surface. */

/* E1 — inline chip: 3D labels, tooltips, the hint pill */
--e1-bg:   rgba(16,18,21,0.52);
--e1-blur: blur(16px) saturate(140%);
--e1-brd:  rgba(255,255,255,0.10);
--e1-shd:  0 2px 8px rgba(0,0,0,0.28);

/* E2 — the dock, the rig panel, view tools */
--e2-bg:   rgba(16,18,21,0.60);
--e2-blur: blur(28px) saturate(150%);
--e2-brd:  rgba(255,255,255,0.13);
--e2-shd:  0 6px 24px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.07);

/* E3 — sheets (product detail, catalogue) */
--e3-bg:   rgba(14,16,19,0.66);      /* the ceiling. never higher. */
--e3-blur: blur(40px) saturate(160%);
--e3-brd:  rgba(255,255,255,0.16);
--e3-shd:  0 16px 56px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.09);

/* E4 — transient over a sheet: popovers, size dropdowns, confirms */
--e4-bg:   rgba(22,25,29,0.86);      /* over glass, not over scene → can be opaque */
--e4-blur: blur(24px) saturate(150%);
--e4-brd:  rgba(255,255,255,0.18);
--e4-shd:  0 20px 48px rgba(0,0,0,0.55);

/* fills used INSIDE a glass surface — these are not elevation, they are texture */
--fill-1: rgba(255,255,255,0.05);   /* card rest        */
--fill-2: rgba(255,255,255,0.09);   /* card hover, quiet button */
--fill-3: rgba(255,255,255,0.15);   /* pressed, active segment  */
--hairline: rgba(255,255,255,0.09); /* row dividers     */
```

### 3.3 Making it work over a desert *and* a night sky — the scrim well

Alpha alone cannot solve this. At `0.60` over a night HDRI the panel vanishes; over a noon desert the same panel reads as a grey smear (visible in the current build). The fix is to darken **the scene behind the panel**, not the panel itself.

Every E2/E3 surface carries a **scrim well**: a non-interactive child element behind the surface's own background, holding a **blurred copy of the panel's own shape**. Blur still does its job — the glass stays glass — but the substrate it samples is now bounded.

```css
.scrim-well {
  position: absolute; inset: 0; pointer-events: none; z-index: -1;
  border-radius: inherit;                       /* follows the panel exactly */
  background: rgba(0, 0, 0, calc(0.30 * var(--scrim-k)));
  filter: blur(26px);
  transform: scale(1.03);                       /* halo reaches ~26px past the edge */
}
```

**Use the blurred-shape form, not a radial gradient.** A radial gradient sized to a tall narrow element (the rail, the dock) paints a visible dark *oval* that does not follow the panel — the same grey-smudge failure as the current `.top-scrim`. A blurred copy of the shape hugs whatever the panel is, at any aspect ratio, for the same cost.

`--scrim-k` is **one number, set on `:root`, driven by scene luminance.**

- On environment change, and on a 500 ms throttle while the camera moves, read back a 32×32 downsample of the framebuffer restricted to the union of the panel rects (a `WebGLRenderTarget` at 1/32 scale is enough; do not `readPixels` the full canvas).
- Compute mean relative luminance `L` (Rec. 709).
- `--scrim-k = clamp(0.80 + 1.15 * L, 0.80, 1.85)`, eased toward the new value over 400 ms so it never visibly pumps.

Reference values: night sky `L≈0.06 → k≈0.87`; forest `L≈0.22 → k≈1.05`; mountain dawn `L≈0.44 → k≈1.31`; desert noon `L≈0.71 → k≈1.62`; snow `L≈0.88 → k≈1.81`.

**The guarantee this buys:** composite luminance behind any text never exceeds `0.045` relative luminance (≈ L\*22). All ink contrast ratios in §9 are computed against that ceiling, so they hold in every scene. Verify by screenshotting `?env=desert` and `?env=snow` and sampling — do not assume.

Text that floats on the canvas with no panel (wordmark, 3D labels) uses the same mechanism at `--scrim-k * 0.6` with a 140px radius.

### 3.4 Accent and semantics

```css
--accent:      #FF7A45;   /* Ember */
--accent-hi:   #FF8F62;   /* hover */
--accent-lo:   #E9622F;   /* pressed */
--accent-soft: rgba(255,122,69,0.14);
--accent-ring: rgba(255,122,69,0.85);

--ok:   #4FCB8B;   /* fits the frame          */
--warn: #F2B23C;   /* fits, but tight         */
--bad:  #FF5C4D;   /* will not fit / remove   */
```

Why Ember replaces the current amber `#e8a848`: amber sits inside the desert HDRI's own hue family and loses separation exactly when the UI is hardest to read; at that chroma it also reads as a caution colour. Ember has enough chroma to be unmistakably a *signal* and enough red to separate from every scene ground in the set.

Ember over a warm scene still needs help. **Any Ember ring is always drawn with a black outer ring**, which guarantees separation on any ground:

```css
--ring-selected:
  0 0 0 1.5px var(--accent-ring),
  0 0 0 3.5px rgba(0,0,0,0.55),
  0 0 14px rgba(255,122,69,0.30);
```

Ember is forbidden as: a card background, a text colour for anything longer than three words, a border on more than one element at a time in the same view.

### 3.5 Product-photo plate

```css
--plate:      #FFFFFF;                  /* matches maker studio ground exactly */
--plate-edge: inset 0 0 0 1px rgba(0,0,0,0.10);
--plate-veil: linear-gradient(180deg, rgba(0,0,0,0) 62%, rgba(0,0,0,0.055) 100%);
```

See §8 for why the plate is pure white and not an off-white.

---

## 4. Spacing, radius, elevation

### 4.1 Spacing — 4px base

| Token | px | Use |
|---|---|---|
| `--s-1` | 4 | icon↔label, chip inner |
| `--s-2` | 8 | between sibling controls |
| `--s-3` | 12 | grid gap, list row gap |
| `--s-4` | 16 | card padding, sheet inner rhythm |
| `--s-5` | 20 | panel padding |
| `--s-6` | 24 | **the gutter** — every panel is 24px from the viewport edge |
| `--s-7` | 32 | between sections in a sheet |
| `--s-8` | 40 | above a section label after content |
| `--s-9` | 56 | sheet header → hero |
| `--s-10` | 72 | empty-state breathing room |

The current 30px gutter goes to 24 — it puts the panels on the same 4px lattice as their contents.

### 4.2 Radius — concentric

```css
--r-panel:   20px;  /* sheets, rig panel      */
--r-dock:    28px;  /* the dock (pill-ish)    */
--r-card:    14px;  /* catalogue cards        */
--r-control: 10px;  /* buttons, inputs, rows  */
--r-chip:     8px;  /* size chips, facets     */
--r-swatch:   6px;  /* square swatches        */
--r-pill:   999px;  /* primary CTA, tags      */
```

**Concentric rule (Apple):** an inner radius equals its parent's radius minus the padding between them. A 14px card with 8px padding around a photo → photo radius 6px. Do not eyeball this; it is the difference between "designed" and "assembled".

### 4.3 Elevation ladder

| Level | Surface | Shadow | Blur | When |
|---|---|---|---|---|
| E0 | — | — | — | The canvas |
| E1 | `--e1-bg` | `--e1-shd` | 16px | 3D labels, tooltips, hint |
| E2 | `--e2-bg` | `--e2-shd` | 28px | Dock, rig panel, view tools |
| E3 | `--e3-bg` | `--e3-shd` | 40px | Sheets |
| E4 | `--e4-bg` | `--e4-shd` | 24px | Popovers over a sheet |

Only E2 and E3 get a scrim well. E1 gets the reduced well. E4 sits on glass and needs none.

---

## 5. Motion

```css
--ease-out:    cubic-bezier(0.22, 1.00, 0.36, 1.00);  /* house curve: entry, expand */
--ease-in:     cubic-bezier(0.64, 0.00, 0.78, 0.00);  /* exit only */
--ease-inout:  cubic-bezier(0.65, 0.00, 0.35, 1.00);  /* reversible state swaps */
--ease-camera: cubic-bezier(0.32, 0.00, 0.16, 1.00);  /* long, damped, no overshoot */
--ease-pop:    cubic-bezier(0.34, 1.28, 0.64, 1.00);  /* selection only, 1 overshoot */

--d-micro:  120ms;  /* hover tint, swatch scale, focus ring   */
--d-press:   90ms;  /* active/pressed                          */
--d-control:180ms;  /* chip select, facet toggle, tab swap     */
--d-sheet:  320ms;  /* sheet in                                */
--d-sheet-out:240ms;/* sheet out — exits are ~75% of entries    */
--d-camera: 700ms;  /* camera reframe / preset move            */
--d-scene:  600ms;  /* HDRI cross-fade                         */
```

| Interaction | Property | Duration | Easing |
|---|---|---|---|
| Button / row hover | `background`, `border-color` | 120 | `--ease-out` |
| Button press | `transform: scale(.975)` | 90 | `--ease-out` |
| Swatch hover | `transform: scale(1.12)` | 120 | `--ease-out` |
| Size chip / facet select | `background`, `color` | 180 | `--ease-inout` |
| Sheet in | `translateX(24px)→0`, `opacity 0→1` | 320 | `--ease-out` |
| Sheet out | reverse | 240 | `--ease-in` |
| Rig panel → rail | `width`, contents `opacity` | 320 | `--ease-out` (same tick as sheet) |
| Dock reposition | `left`, `right` | 320 | `--ease-out` (same tick as sheet) |
| Camera reframe | target + position | 700 | `--ease-camera` |
| Camera preset (home / side) | | 700 | `--ease-camera` |
| Scene cross-fade | HDRI + fog + ground | 600 | `linear` |
| 3D selection ring appear | `scale .82→1`, `opacity` | 260 | `--ease-pop` |
| Non-selected bags dim | material exposure + saturation | 140 | `--ease-out` |
| Bag added to bike | `scale .90→1` + 8mm drop | 380 | `--ease-pop` |
| List stagger | per item delay | +18ms, capped at 8 items | — |

**Same-tick rule:** sheet, rig-panel collapse, dock reposition and camera reframe all start on the same frame with `--d-sheet`/`--d-camera`. They are one gesture; if they stagger, the layout looks like it is arguing with itself.

Never animate `blur()` or `backdrop-filter` — animate opacity of a pre-blurred layer instead. Never animate `width`/`height` on the sheet; animate `transform` and let layout be static.

---

## 6. Components

### 6.1 The rig panel (left) — rethought

Current problems: it is a scrolling wall of two-line text, the 22×22 hover-reveal action buttons are below the hit-target floor and undiscoverable, and the panel occupies 320px permanently regardless of whether anything else is open.

```
 ┌─ 280 ────────────────────────────────────┐   left: 24  top: 88
 │  THE RIG                          57.8 L │   20/16/12 pad; label --t-label ink-3
 │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░          │   capacity bar, 3px, r2
 ├──────────────────────────────────────────┤   hairline
 │ ┌────┐                                   │
 │ │ 📷 │  APIDURA                      9 L │   row 64h, 8px gutter, r10
 │ │48×48│ Expedition Saddle Pack           │   brand --t-micro ink-3 (caps, .09em)
 │ └────┘                                   │   name  --t-title3 ink-1, 1-line clamp
 │ ┌────┐                                   │   value --t-data-s ink-2, tnum
 │ │ 📷 │  APIDURA                      9 L │
 │ └────┘ Expedition Handlebar Pack         │
 │  …                                       │   max-height 62vh, scroll, fade-bottom 32px
 ├──────────────────────────────────────────┤
 │  ┌──────────────────────────────────────┐│
 │  │           +  Add a bag               ││   44h, --fill-2, r10, --t-body-s
 │  └──────────────────────────────────────┘│
 └──────────────────────────────────────────┘   E2 + scrim well, r20
```

- Width **280** (was 320). Thumbnail 48×48 at `--r-control`, `object-fit: cover`, square crop.
- **The whole row is one hit target** and opens the product sheet. Remove / swap / buy live in the sheet, not as 22px hover buttons. Row has `min-height: 64px` — well over the 44px floor.
- Capacity bar: track `--ink-4`, fill `--ink-1` at 0.85. Not Ember — total capacity is not an action.
- A bag that will not fit the frame: row keeps full opacity but gains a left 2px `--bad` edge and a second line `Too long for this frame — 42 cm needs 38 cm` in `--t-micro`, colour `--warn`. Do not grey it out; greyed-out text is the least legible thing over a bright scene.
- Overflow `⋯` in the header holds `Clear bike`, `Share kit`, `Copy link`. Destructive actions do not live at the top level.
- **Rail state** (when any sheet is open): width 56, radius 20, shows the 40×40 thumbnails stacked with 8px gaps plus a `+` button. Clicking a thumb swaps the sheet's contents. Clicking the rail expands it and closes the sheet.
- Empty state: `--t-display` "Start with a seat pack", one line of `--t-body` ink-2, and the Add button. No bulleted instructions.

### 6.2 The product sheet — the centrepiece

**Decision: a right-anchored side sheet, not a modal and not a bottom sheet.**

Reasoning, in order:
- A modal with a veil (what the app does today) dims the 3D scene. The entire product is the 3D scene. A configurator that hides the model to show you a picture of the model has inverted itself.
- A bottom sheet on desktop wastes the axis the bike does not use. The bike's silhouette is *wide and short*; the viewport's free vertical space above and below it is small, while horizontal space at the sides is plentiful. A bottom sheet tall enough to hold a hero photo plus specs would cover the wheels — the part people look at.
- A right side sheet takes width the bike does not need once the camera nudges it left, gives a natural top-to-bottom reading order (photo → identity → options → specs → buy) that matches how people evaluate gear, and pins the primary action at the bottom edge where the thumb and cursor already are.
- It also gives us **one shell for three widths** (detail 480, catalogue 720, rail 56), so there is exactly one surface concept in the whole app.

The scene is *not* dimmed. The camera reframes (§6.7) and, critically, **the bag being viewed stays selected and ringed in the 3D scene** — you are looking at the real thing and the photo of it at the same time. That is the argument for this app existing.

```
 width: clamp(420px, 34vw, 560px)      → 480 @ 1440    right: 24  top: 24  bottom: 24
 E3 + scrim well, radius 20, overflow hidden, display:flex column

 ┌─ 480 ──────────────────────────────────────────────┐
 │ ┌──┐                                          ┌──┐ │  header 56h, pad 16
 │ │ ←│  Handlebar bag                           │ ×│ │  ← only if arrived from catalogue
 │ └──┘  --t-micro ink-3                         └──┘ │  buttons 36×36 r10 --fill-1
 ├────────────────────────────────────────────────────┤
 │                                                    │  scroll region begins
 │  ┌──────────────────────────────────────────────┐  │
 │  │                                              │  │  HERO 432 × 288  (3:2)
 │  │            product photograph                │  │  pad 24 each side
 │  │                                              │  │  plate #FFF, r12, --plate-veil
 │  └──────────────────────────────────────────────┘  │
 │              ●  ○  ○  ○                            │  dots: 5px, 6px gap, ≤6 images
 │                                                    │  20px below hero
 │  SWIFT INDUSTRIES · ZEITGEIST                      │  --t-label ink-3
 │  Zeitgeist Pack                                    │  --t-title1 ink-1
 │  12 L · Handlebar bag · Seattle, USA               │  --t-caption ink-2
 │                                                    │  32
 │  SIZE                                              │  --t-label ink-3, 12 below
 │  ┌──────┐ ┌──────┐ ┌──────┐                        │  chips 36h, pad 0 14, r8
 │  │  9 L │ │ 12 L │ │ 16 L │                        │  rest: --fill-1 + 1px ink-4
 │  └──────┘ └━━━━━━┘ └──────┘                        │  active: --fill-3 + 1px ink-1@.7
 │                                                    │  24
 │  COLOURWAY                        Coyote           │  label left, value right, ink-2
 │  ● ● ● ●                                           │  28px dots, 10px gap, ring on active
 │                                                    │  32
 │  SPECIFICATIONS                                    │  --t-label ink-3
 │  Capacity                              12 L        │  rows 40h, hairline between
 │  Dimensions                    42 × 16 × 15 cm     │  key ink-3 --t-caption
 │  Weight                                410 g       │  val ink-1 --t-data-s tnum, right
 │  Fabric                          X-Pac VX21        │
 │  Closure               Roll-top, quick release     │
 │  Mounts                 Handlebar, 4-point         │
 │  Dimensions verified            Maker ✓            │  ✓ in --ok
 │                                                    │  32
 │  FEATURES                                          │
 │  Reflective side panels                            │  --t-body ink-2, 22px rows
 │  Two mesh cargo pockets                            │  bullet = 3px ink-4 dot, 10px in
 │  Daisy chain lash points                           │
 │                                                    │  40 bottom pad (footer clears it)
 ├────────────────────────────────────────────────────┤  hairline + 24px upward fade
 │  ┌─────────────────────┐ ┌──────────────────────┐  │  footer 76h, pad 16 20 20
 │  │    Add to bike      │ │  Buy at Swift  ↗     │  │  48h each, gap 12
 │  └─────────────────────┘ └──────────────────────┘  │  primary pill | secondary r10
 └────────────────────────────────────────────────────┘
```

Details that matter:

- **Footer is sticky and always visible.** It never scrolls away. Above it, a 24px `linear-gradient(transparent, var(--e3-bg))` so content dissolves rather than being guillotined.
- **`Add to bike` is the only Ember fill in the sheet.** If the bag is already on the bike the button becomes `Remove` — `--fill-2` background, `--bad` label, no fill. Not a second Ember.
- **`Buy at <brand>`** is `--fill-2`, `--ink-1`, with a 12px `↗` in `--ink-3`. `target="_blank" rel="noopener noreferrer"`. Label uses the brand short name; falls back to `Buy` if the name pushes past one line. Href from `product.src`. If `src` is missing, the button is replaced by a `--t-micro` ink-3 line "No maker link on file" — never a dead button.
- **Size and colourway change the 3D model instantly**, no confirm step, with the hero photo cross-fading to that colourway's image if one exists (`--d-control`, opacity only).
- **Optional but recommended:** hovering the `Dimensions` row draws the bag's bounding box in the 3D scene as a 1px Ember wireframe for as long as the hover lasts. This is the one interaction that only this app can offer.
- If the product has no `dims_verified` value, show `Dimensions` with an `est.` tag in `--t-micro` `--warn` rather than hiding the row. Honest data beats tidy data.

**Under 900px — bottom sheet with detents.**

```
 ┌────────────────── 100vw − 16 ──────────────────┐
 │                  ▂▂▂▂▂▂                        │  grab handle 36×4, r2, ink-4, 10px pad
 │  Zeitgeist Pack                     12 L       │  peek row: title + capacity, 56h
 ├────────────────────────────────────────────────┤
 │  [ hero 3:2, full bleed to 16px gutters ]      │
 │  … identity / size / colourway / specs …       │
 ├────────────────────────────────────────────────┤
 │  [  Add to bike  ]  [ Buy ↗ ]                  │  footer pinned, 76h
 └────────────────────────────────────────────────┘
   detents: peek = 132px (handle+title+footer) · half = 52vh · full = 92vh
   radius 20 top corners only; bottom corners square to the viewport edge
```

- The camera lifts the bike into the region above the sheet at whichever detent is active, on `--ease-camera`.
- Drag the handle to move between detents; velocity > 0.5 px/ms snaps to the next detent in the drag direction.
- At `full`, the hero photo scrolls with the content — do not pin it; a pinned hero on a short viewport leaves ~200px for the spec table.
- Rig panel becomes a bottom-left FAB (56×56, E2) when a sheet is open.

### 6.3 The catalogue — 50 brands, 702 products

The scale problem, stated honestly: 702 products, 14 mount slots, largest slot `framebag_half` at 103, smallest `toptube_rear` at 1. A flat list is unusable; a brand-first tree buries the 32 brands with only two or three bags for a given slot.

**The information architecture, in one sentence: the mount point is the primary facet, and it is free, because you always add a bag *to somewhere*.**

Entry is always one of:
- Click an empty mount point on the 3D bike → catalogue opens pre-filtered to that slot.
- Click `+ Add a bag` → the 3D bike enters *mount-picking mode* (§6.6): empty mounts get pulsing rings, no list appears. Pick one on the bike.
- Click a bag already on the bike, then `Swap` in the sheet → pre-filtered to that slot.

That single facet reduces 702 → between 1 and 103 before the user has done anything. Nobody ever sees 702 items.

```
 width: clamp(560px, 50vw, 760px)      → 720 @ 1440    right: 24  top: 24  bottom: 24
 E3 + scrim well, radius 20

 ┌─ 720 ────────────────────────────────────────────────────────────────┐
 │ ┌──┐                                                            ┌──┐ │ 56h
 │ │ ←│  Handlebar bag                                             │ ×│ │ --t-title2
 │ └──┘                                                            └──┘ │
 │ ┌──────────────────────────────────────────────────────────────────┐ │ search 40h r10
 │ │ ⌕  Search 73 handlebar bags                                      │ │ --fill-1, ⌘K
 │ └──────────────────────────────────────────────────────────────────┘ │
 │ ┌────────┐┌───────────┐┌─────────┐┌──────────┐  ┌──────────────┐     │ facet row 34h
 │ │Brand ▾ ││Capacity ▾ ││Fabric ▾ ││ Fits ✓   │  │ Sort: Fit  ▾ │     │ chips r8, gap 8
 │ └────────┘└───────────┘└─────────┘└──────────┘  └──────────────┘     │ horiz-scroll
 │  73 bags · 21 brands                          Clear all              │ --t-micro ink-3
 ├──────────────────────────────────────────────────────────────────────┤
 │ ┌────────────┐ ┌────────────┐ ┌────────────┐                         │ grid, gap 12
 │ │ ▢ photo3:2 │ │ ▢ photo3:2 │ │ ▢ photo3:2 │                         │ minmax(200,1fr)
 │ │            │ │            │ │            │                         │ → 3 cols @720
 │ ├────────────┤ ├────────────┤ ├────────────┤                         │
 │ │ SWIFT      │ │ APIDURA    │ │ RESTRAP    │                         │ --t-label ink-3
 │ │ Zeitgeist  │ │ Expedition │ │ Bar Bag    │                         │ --t-title3, 2ln
 │ │ Pack       │ │ Handlebar  │ │            │                         │
 │ │ 12 L  ●●●  │ │ 9 L   ●●   │ │ 14 L  ●●●● │                         │ data + colourways
 │ └────────────┘ └────────────┘ └────────────┘                         │
 │  … infinite scroll, 24 per page …                                    │
 └──────────────────────────────────────────────────────────────────────┘
```

**Facets.** Four, no more — research is consistent that facet overload causes drop-off, and four is what this data actually supports.

| Facet | Type | Values | Notes |
|---|---|---|---|
| Brand | multi-select popover (E4) | derived from the filtered set, A–Z, each with a live count | Search box at the top of the popover once > 12 brands |
| Capacity | single-select range chips | `Under 1 L` · `1–3 L` · `3–8 L` · `8–15 L` · `15 L+` | Bands are chosen per-slot: a stem-bag slot gets `<0.5 / 0.5–1 / 1–2 / 2 L+` |
| Fabric | multi-select | `X-Pac` · `Cordura` · `Welded TPU` · `Waxed canvas` | Already computed by `FABRIC_KEY` in `catalog.js` |
| Fits my frame | toggle, **on by default** | — | Off reveals non-fitting bags, greyed with the reason |

Every facet shows a live result count. Every applied facet appears as a removable pill in the row. `Clear all` is always present when ≥1 facet is on. Facet state persists per slot for the session.

**Sort.** `Fit` (default — best dimensional match to this frame's slot, then capacity descending), `Capacity ↑`, `Capacity ↓`, `Brand A–Z`.

**Search.** Matches `brand.name + product.line + product.name + size`. Debounce 120ms. Empty result state names what to relax: "No X-Pac handlebar bags under 3 L. **Clear fabric** or **widen capacity**." — both are buttons.

**Brand index (secondary tab).** For people who shop by maker. A `Slot | Brand` segmented control in the header swaps the body to a 4-column grid of 50 brand cards, each 164×108: brand name `--t-title3`, origin `--t-micro` ink-3, five 9px palette swatches from `brand.palette`, and `18 bags` ink-3. Selecting a brand applies it as a Brand facet and returns to the slot view — the two routes converge, they are not separate trees.

**Performance.** 103 cards × a 900×600 JPEG is not free. Required:
- `loading="lazy" decoding="async"` on every thumbnail.
- Grid items get `content-visibility: auto; contain-intrinsic-size: 200px 236px;`.
- Render 24 cards, then 24 more per `IntersectionObserver` hit 400px from the bottom.
- Serve a 400×267 derivative for cards; the 900×600 original is only for the sheet hero. Add a `shrink-images.mjs` pass that emits `-sm.jpg` alongside each file.

### 6.4 The dock

```
 bottom: 24, horizontally centred within the free area
 height 56, radius 28, padding 0 8, E2 + scrim well

 ┌──────────────────────────────────────────────────────────────────────┐
 │  ┌────────────────┐ │ ●●●●●● │ ●●●●●● │ ▭▭▭▭▭ │  ┌────┐┌────┐        │
 │  │  ⚡ Surprise me │ │ frame  │ bidon  │ scene │  │ ⟲  ││ ⌂  │        │
 │  └────────────────┘ │        │        │       │  └────┘└────┘        │
 └──────────────────────────────────────────────────────────────────────┘
    quiet pill 40h       28px      20px    36×26     40×40 tool buttons
    --fill-2             circles   circles rounded
                                           rects
    dividers: 1px × 24, --ink-4, 16px margin each side
```

- **The three tracked micro-labels (`FRAME` / `BIDONS` / `SCENE`) are deleted.** Three 9px all-caps labels in one 56px bar is noise, and it is unreadable over a bright scene anyway. The groups are distinguished by **shape**, which is faster to parse than a label: frame paint = 28px circles with a metallic radial gradient (they look like paint), bidon = 20px flat circles, scene = 36×26 rounded rectangles showing an actual crop of that HDRI. Meaning is delivered by `aria-label` and a 400ms-delay tooltip (E1, `--t-micro`).
- Selected swatch: `box-shadow: 0 0 0 2px rgba(0,0,0,.6), 0 0 0 4px var(--ink-1)`. A white ring, not Ember — these are appearance choices, not the app's primary action.
- **Camera tools move from the top-right into the dock.** One floating cluster is better than two; the top-right corner then belongs entirely to the scene.
- `Surprise me` stays `--fill-2` quiet. It is a novelty; it does not get the one Ember fill. (`ui.css` already half-does this via `.btn.quiet` — finish the job and delete the `.btn.primary` amber rule.)
- `Clear bike` leaves the dock entirely → rig panel overflow menu.
- The dock's `left` is `calc(var(--rail-w) + 48px)` and its `right` is `calc(var(--sheet-w) + 48px)`, both animated on the same tick as the sheet, with `margin-inline: auto; width: max-content`. Below 900px it becomes a horizontally scrollable strip pinned to `bottom: calc(var(--sheet-peek) + 12px)`.

**The dock has two forms, and it must.** Expanded it is ~1000px wide. With the 480px detail sheet open at a 1440 viewport the free strip is 760px — the expanded dock does not fit, and letting it slide under the sheet is not an option.

| Form | When | Contents |
|---|---|---|
| Expanded | free strip ≥ 1000px (no sheet open at ≥1240px) | `Surprise me` │ frame │ bidon │ scene │ camera tools |
| Collapsed | free strip < 1000px (any sheet open, or a narrow viewport) | `Surprise me` │ **`Appearance`** │ camera tools |

`Appearance` is a quiet pill carrying a 3-swatch overlapped stack (16px circles, −5px overlap, each with a 1.5px dark ring) showing the current frame / bidon / scene choices, so the state is still readable without the full strip. Clicking it opens an E4 popover, 280px wide, anchored above the pill, holding the three labelled swatch groups stacked. Crossfade between the two forms on `--d-sheet` / `--ease-out`, measuring the free strip — never guessing from a breakpoint alone.

### 6.5 Buttons

| Variant | Height | Padding | Radius | Background | Border | Text |
|---|---|---|---|---|---|---|
| Primary | 48 | 0 24 | `--r-pill` | `--accent` | none | `--ink-on-accent`, `--t-body-s` |
| Secondary | 48 | 0 20 | `--r-control` | `--fill-2` | 1px `--ink-4` | `--ink-1` |
| Quiet | 40 | 0 16 | `--r-pill` | `--fill-2` | 1px `rgba(255,255,255,.10)` | `--ink-1` |
| Ghost | 36 | 0 12 | `--r-control` | transparent | none | `--ink-2` → `--ink-1` on hover |
| Danger | 48 | 0 20 | `--r-control` | `rgba(255,92,77,.14)` | 1px `rgba(255,92,77,.38)` | `#FFB4AC` |
| Icon | 36×36 (44×44 touch) | — | `--r-control` | `--fill-1` | none | `--ink-2` |

Hover: `--accent-hi` / next fill level, 120ms. Press: `scale(.975)` + `--accent-lo`, 90ms. Disabled: 40% opacity, `pointer-events: none`, and always accompanied by text saying why.

**There is exactly one Primary button visible at a time in the entire app.**

### 6.6 Selection and hover in the 3D scene

| State | Scene treatment | UI echo |
|---|---|---|
| Idle | nothing | — |
| Hover a bag | Other bags: exposure ×0.75, saturation ×0.6, over 140ms `--ease-out`. Hovered bag unchanged plus a **1.5px screen-space Ember outline at 0.7 alpha**. A label chip (E1, 28h, r8, `Swift · Zeitgeist 12 L`, `--t-micro`) floats 10px above the bag's projected bbox top, clamped to stay on screen. | Rig row gets `--fill-2` |
| Selected | Outline solid: `--ring-selected` translated to a screen-space outline pass — 1.5px Ember, 1px black inner. Label chip persists. Other bags return to full exposure (selection is not a spotlight, it is a pin). | Rig row `--fill-3` + 2px Ember left edge; product sheet opens |
| Empty mount, add-mode only | 24px screen-space ring, `--ink-1` at 0.35, 1.5px, pulsing scale 1.0→1.12 over 1600ms `--ease-inout` infinite | Rig panel shows "Pick a mount point on the bike" |
| Empty mount, hovered | Ring → 36px, Ember, no pulse, plus label chip `Handlebar · 73 bags` | — |
| Won't fit here | Ring in `--warn` at 0.5, cursor `not-allowed`, chip explains | — |

- Outline is a screen-space pass (render selected mesh IDs to a mask, then a Sobel edge at 1.5 device px). Do **not** use a scaled duplicate mesh — bag geometry is thin and it produces artefacts at the straps.
- Click empty space: deselect, close sheet, ring fades over `--d-sheet-out`.
- `Esc`: same.
- Canvas cursor: `grab` idle, `grabbing` while orbiting, `pointer` over a bag or mount ring.
- The dim-on-hover already in the build is right; the change is that it now stops at hover and does **not** persist into selection.

### 6.7 Camera reframing

When a sheet opens, the free area shrinks. The camera must respond or the principle in §1.1 is a slogan.

```
freeArea = viewport minus (rail 56 + 24) on the left and (sheetW + 24) on the right
targetCentre = centre of freeArea, in NDC
```
Animate the orbit target's screen-space anchor so the bike's projected bounding box centres on `targetCentre`, and dolly out only if the bbox would exceed `freeArea − 40px` padding. Duration `--d-camera`, `--ease-camera`, starting on the same frame as the sheet. Never rotate the camera on a sheet open — only pan and dolly. Rotation while reading a spec sheet is nauseating.

On sheet close, reverse. If the user has orbited manually since opening, do not restore the old framing — respect their camera, only undo the pan offset.

---

## 7. Icons

- **16 icons, one inline SVG sprite**, 20×20 viewBox, 1.5px stroke, round cap, round join, `currentColor`, no fills.
- Set: `close`, `back`, `plus`, `search`, `chevron-down`, `check`, `external`, `trash`, `swap`, `more`, `camera-home`, `orbit`, `share`, `link`, `shuffle`, `info`.
- **All emoji and text glyphs are deleted** — `⟳ ⌂ ⚡ ⧉ ↗ ×` currently do icon work. They render differently on every platform, they cannot be stroke-matched, and they are the single loudest "unfinished" signal in the current UI. (`↗` may survive *inside* a text label as a typographic mark; it may not survive as a standalone button.)
- Icon colour is `--ink-2`, `--ink-1` on hover. Icons are never Ember.
- Optical alignment: 20px icon in a 36px button, centred; nudge `back`/`plus` right by 0.5px if the glyph is visually left-heavy.

---

## 8. Imagery

The data: **702 products, 501 with image URLs, 1,457 local files across 31 brand directories, source shots consistently 900×600 (3:2).** Roughly 200 products have no photo at all. All three of those facts drive the rules.

### 8.1 Aspect ratio

**3:2 everywhere** — sheet hero (432×230, `contain`), catalogue card (`aspect-ratio: 3/2`), rig-panel thumbnail (48×48) and rail thumbnail (40×40). This is the source aspect, so no maker photograph is ever cropped.

The small thumbnails use `object-fit: **contain**` on the white plate, not `cover`. A square centre-crop of a studio 3:2 shot reliably slices the ends off long bags — seat packs and bar rolls are the two most common shapes in the catalogue and both become unrecognisable slivers. Letterboxing wastes a little tile; cropping destroys the recognition the thumbnail exists to provide.

### 8.2 Two treatments, chosen automatically

Maker photography splits into studio-on-white and lifestyle. Decide at load, do not hand-tag 702 products:

```js
// draw to a 8×8 offscreen canvas, sample the four corner pixels
const studio = corners.every(p => luma(p) > 246 && saturation(p) < 0.06);
```

| Treatment | When | Rendering |
|---|---|---|
| **Studio** | corners are white | `object-fit: contain` on a `#FFFFFF` plate, `--plate-edge` inset hairline, `--plate-veil` gradient on top |
| **Lifestyle** | anything else | `object-fit: cover`, `object-position: center`, no plate, same hairline and veil |

**Why the plate is pure white and not a softer off-white:** the photographs' own ground *is* pure white and fills the frame. An off-white plate would show as a visible seam in the letterbox bars. The glare problem that an off-white was trying to solve is instead fixed by `--plate-veil` — a barely-there darkening of the bottom 38% — which grounds the tile against the dark panel without introducing a second white.

### 8.3 Fallback — required, not optional

~200 products have no photo. A broken `<img>`, an empty box, or the word "no image" are all unacceptable in a premium product. The fallback is a **generated silhouette plate**:

```
 ┌────────────────────────┐   3:2, --r-card − padding
 │                        │   background: linear-gradient(155deg,
 │        ╭──────╮        │     colour-mix(in srgb, brandPalette[0] 16%, #14161A),
 │        │ slot │        │     #14161A)
 │        ╰──────╯        │   slot glyph: 48px, --ink-3, 1.5px stroke,
 │                        │     one per mount type (14 glyphs)
 │       SWIFT IND.       │   brand short name, --t-label, --ink-4, 12px from bottom
 └────────────────────────┘
```

Same rule at every size. It reads as a deliberate placeholder, carries the brand's own colour, and still tells you what kind of bag it is.

### 8.4 Loading

Never a layout shift. Every image slot has its aspect reserved by `aspect-ratio`. Before load: the plate at `--fill-1` with a 1200ms `--ease-inout` shimmer (a 20%-wide `rgba(255,255,255,.05)` band). On load: fade in over 240ms `--ease-out`, no scale. On error: swap to the §8.3 fallback silently.

---

## 9. Accessibility

### 9.1 Contrast

Because §3.3 caps composite luminance behind text at `0.045` relative luminance, these ratios hold in **every** scene including snow and desert noon:

| Token | Contrast vs. capped substrate | Permitted for |
|---|---|---|
| `--ink-1` (0.96) | ≈ 17.6 : 1 | anything |
| `--ink-2` (0.70) | ≈ 9.8 : 1 | anything |
| `--ink-3` (0.48) | ≈ 5.1 : 1 | text ≥ 12px ✓ AA, ≥ 14px ✓ AAA-large |
| `--ink-4` (0.28) | ≈ 2.3 : 1 | **non-text only** — dividers, disabled fills |
| `--accent` on `--fill-2` | ≈ 6.2 : 1 | icons, ring |
| `--ink-on-accent` on `--accent` | ≈ 8.4 : 1 | primary button label |
| `--warn` `#F2B23C` | ≈ 9.1 : 1 | fit warnings |
| `--bad` `#FF5C4D` | ≈ 5.4 : 1 | destructive labels ≥ 14px |

**Verification is a required build step, not a hope.** Screenshot at `?env=desert` and `?env=snow`, with the product sheet open, and sample the composite behind the spec table. If it exceeds `0.045`, raise the `--scrim-k` ceiling, not the panel alpha.

### 9.2 Focus

```css
:focus-visible {
  outline: 2px solid #FFFFFF;
  outline-offset: 2px;
  box-shadow: 0 0 0 5px rgba(0,0,0,0.55);   /* halo — survives any ground */
  border-radius: inherit;
}
```

White ring plus a black halo works on the desert, the night sky and the glass alike. **`outline: none` without a replacement is a bug.** The 3D canvas is focusable (`tabindex="0"`) and gets the same ring inset 4px; arrow keys orbit, `+`/`−` zoom, `Home` resets.

### 9.3 Targets and keyboard

- Pointer-only dense controls: 32×32 minimum with ≥ 8px separation.
- Anything touchable, or anything within 24px of a viewport edge: **44×44 minimum**. Swatches that are visually 20–28px get a transparent `::before` expanding the hit box to 44×44.
- Sheet: focus moves to the close button on open, is trapped inside, `Esc` closes, and focus returns to the element that opened it. `role="dialog" aria-modal="false"` — it is deliberately non-modal; the scene stays live and reachable.
- Facet popovers: `Esc` closes to the trigger. Arrow keys move within. `Enter`/`Space` toggle.
- Catalogue grid: arrow keys move between cards in two dimensions, not just tab order.
- Every swatch has an `aria-label` with its real name ("Frame colour: Slate green"). Colour is never the only carrier of meaning — selected swatches carry a ring *and* `aria-pressed`.
- Live region (`aria-live="polite"`) announces kit changes: "Added Zeitgeist Pack, 12 litres. Kit total 57.8 litres."

### 9.4 Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
}
```

Plus, in JS: auto-rotate defaults **off**; camera moves become instant cuts; scene cross-fade drops to 120ms opacity; the mount-ring pulse becomes a static ring at its mid value; sheet entry is opacity-only, no translate; the image shimmer becomes a flat `--fill-1`.

---

## 10. What to delete

Opinionated. Each of these makes the product worse today.

1. **`.top-scrim`** — the 400×190 radial black blob behind the wordmark. It is visibly a grey smudge on bright scenes (look at the current screenshot). Replace with the §3.3 scrim well at reduced strength, or put the wordmark on a real E1 chip.
2. **"BIKEPACKING CONFIGURATOR"** — a tracked-caps subtitle under a tracked-caps wordmark. Two competing tracked elements, and it tells the user nothing the screen does not already say. Delete.
3. **The wordmark's `0.34em` tracking** → `0.10em`, weight 700 not 800, size 18px. Extreme tracking is the loudest dated signal in the current UI.
4. **The persistent hint pill** ("Drag to orbit · scroll to zoom · add a bag from the panel"). Replace with a first-session-only coach that dismisses on the first drag and never returns (`localStorage`).
5. **`.picker-veil`** — a full-screen `rgba(5,7,10,.58)` + blur over the 3D scene. This is the single biggest contradiction in the app. Delete entirely; the side sheet replaces every use.
6. **The three dock micro-labels** (`FRAME` / `BIDONS` / `SCENE`, 9px, `0.16em`, `--ink-faint`). Unreadable over a bright scene; replaced by shape differentiation + tooltips (§6.4).
7. **`.btn.primary` amber fill on `Surprise me`.** The loudest element in the product is a novelty. Ember belongs on `Add to bike` / `Buy`.
8. **`Clear bike` at top level** — destructive, rarely wanted, permanently present. Into the rig-panel overflow.
9. **`.bag-act` hover-reveal micro buttons** (22×22, `opacity: 0` until hover). Half the hit-target floor and undiscoverable. The row opens the sheet; actions live there.
10. **The labelled `.env-chip` photo-card variant** — dead code, superseded by `.envs.compact`. Also dead: the `.peak` clip-path mountain hack, once scene swatches show real HDRI crops.
11. **All emoji/text-glyph icons** — `⟳ ⌂ ⚡ ⧉ ×` → the SVG sprite in §7.
12. **The duplicate rule blocks at the bottom of `ui.css`.** `.bottom-bar`, `.dock`, `.group-label`, `.divider`, `.paint-group` are each declared twice, the second overriding the first. Collapse them; a stylesheet that argues with itself is how the next agent introduces a bug.
13. **`--radius: 16px` as a single global radius.** Replaced by the ladder in §4.2 — one radius for a 480px sheet and a 22px button is why the current UI reads soft rather than crisp.
14. **`.card.est` italic** — italic in a UI at 11px is illegible. Use `--t-micro` in `--warn` with the word `est.`

---

## 11. Token block — paste this at the top of the stylesheet

```css
:root {
  /* ink */
  --ink-1: rgba(255,255,255,0.96);
  --ink-2: rgba(255,255,255,0.70);
  --ink-3: rgba(255,255,255,0.48);
  --ink-4: rgba(255,255,255,0.28);
  --ink-on-accent: #24120A;

  /* accent + semantic */
  --accent: #FF7A45;  --accent-hi: #FF8F62;  --accent-lo: #E9622F;
  --accent-soft: rgba(255,122,69,0.14);
  --accent-ring: rgba(255,122,69,0.85);
  --ok: #4FCB8B;  --warn: #F2B23C;  --bad: #FF5C4D;

  /* glass */
  --e1-bg: rgba(16,18,21,0.52);  --e1-blur: blur(16px) saturate(140%);
  --e1-brd: rgba(255,255,255,0.10);
  --e1-shd: 0 2px 8px rgba(0,0,0,0.28);
  --e2-bg: rgba(16,18,21,0.60);  --e2-blur: blur(28px) saturate(150%);
  --e2-brd: rgba(255,255,255,0.13);
  --e2-shd: 0 6px 24px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.07);
  --e3-bg: rgba(14,16,19,0.66);  --e3-blur: blur(40px) saturate(160%);
  --e3-brd: rgba(255,255,255,0.16);
  --e3-shd: 0 16px 56px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.09);
  --e4-bg: rgba(22,25,29,0.86);  --e4-blur: blur(24px) saturate(150%);
  --e4-brd: rgba(255,255,255,0.18);
  --e4-shd: 0 20px 48px rgba(0,0,0,0.55);

  /* fills + hairline */
  --fill-1: rgba(255,255,255,0.05);
  --fill-2: rgba(255,255,255,0.09);
  --fill-3: rgba(255,255,255,0.15);
  --hairline: rgba(255,255,255,0.09);

  /* scrim — JS writes --scrim-k, nothing else */
  --scrim-k: 1.30;

  /* plate */
  --plate: #FFFFFF;
  --plate-edge: inset 0 0 0 1px rgba(0,0,0,0.10);
  --plate-veil: linear-gradient(180deg, rgba(0,0,0,0) 62%, rgba(0,0,0,0.055) 100%);

  /* spacing */
  --s-1:4px; --s-2:8px; --s-3:12px; --s-4:16px; --s-5:20px;
  --s-6:24px; --s-7:32px; --s-8:40px; --s-9:56px; --s-10:72px;

  /* radius */
  --r-panel:20px; --r-dock:28px; --r-card:14px;
  --r-control:10px; --r-chip:8px; --r-swatch:6px; --r-pill:999px;

  /* layout */
  --gutter: var(--s-6);
  --rig-w: 280px;
  --rail-w: 56px;
  --sheet-detail-w: clamp(420px, 34vw, 560px);
  --sheet-catalog-w: clamp(560px, 50vw, 760px);
  --sheet-w: 0px;           /* JS sets this to the active sheet width, or 0 */

  /* motion */
  --ease-out: cubic-bezier(0.22,1,0.36,1);
  --ease-in: cubic-bezier(0.64,0,0.78,0);
  --ease-inout: cubic-bezier(0.65,0,0.35,1);
  --ease-camera: cubic-bezier(0.32,0,0.16,1);
  --ease-pop: cubic-bezier(0.34,1.28,0.64,1);
  --d-micro:120ms; --d-press:90ms; --d-control:180ms;
  --d-sheet:320ms; --d-sheet-out:240ms; --d-camera:700ms; --d-scene:600ms;

  /* type */
  --font: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
```

---

## 12. Build order for implementers

1. Tokens + font + the scrim-well mechanism (`--scrim-k` readback). Nothing else works without §3.3.
2. The sheet shell — one component, three widths, plus the rig-panel rail collapse and the dock reposition, all on the same tick.
3. The product detail sheet (§6.2). This is the brief's centrepiece; build it before the catalogue.
4. The catalogue sheet + facets (§6.3), including the image derivative pass.
5. 3D selection/hover pass + camera reframing (§6.6, §6.7).
6. The deletions in §10 — do these last so nothing breaks mid-flight, but do all of them.
