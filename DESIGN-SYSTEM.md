# Packrig Design System

**Version 1.1 — the foundations reference**
Everything here is meant to be built from directly. Where a number is given, use that number.

> **The plan lives in `REDESIGN.md`.** The current map of the repo is
> `STATUS.md`. This file is now the *foundations*: type,
> colour, spacing, motion, icons, imagery, accessibility, and the token block.
> The components and the build order moved out — see §6, §10 and §12.

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

## 6. Components — moved

The component specifications (rig panel, bag sheet, catalogue, dock, 3D
selection, camera reframing) now live in **`REDESIGN.md`** §4, §5, §9 and §10,
where they sit next to the plan that builds them. They were amended in the move:
the bag sheet's fitted footer carries three actions, not two.

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

## 10. What to delete — moved

**`REDESIGN.md`** §14, as the last phase of the build order.

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

## 12. Build order — superseded

Superseded by **`REDESIGN.md`** §13, which orders this work together with the
accounts, gallery and profile work it has to interleave with.
