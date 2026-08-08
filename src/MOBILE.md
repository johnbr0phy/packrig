# Packrig on mobile — shared brief

Three agents are working on this at once. This file is the contract between
them. If you need to change a decision here, say so in your report — do not
change it unilaterally.

## Rule zero: own your own files

- `ui-mobile` owns `src/ui.css`, `src/ui.js`
- `aero-mobile` owns `src/aero/aero.css`, `src/aero/panel.js`, `src/aero/tunnel.js`
- `perf-mobile` owns `src/mobile.js` (new), `src/focus.js`
- The lead owns `src/main.js`, `index.html`, `tools/build-pages.mjs`, integration

Do not edit another agent's files. Nothing else in `src/` changes.

## What is broken today (measured at 393×852, DPR 2)

- The kit panel is a fixed 320px with a 30px gutter — it eats the screen.
- The bottom bar runs off the right edge; only a sliver is visible.
- The header title is overlapped by the top-right view tools.
- `main.js` calls `camera.setViewOffset(..., -165, 0, ...)` to shift the bike
  right of the desktop panel. In portrait that pushes it off-frame, and the
  camera distance is never adjusted for a tall aspect — the bike renders
  cropped to a rear wheel.
- In tunnel mode the HUD panel lands ON TOP of the kit panel. Measured overlap.
- Focus is hover-driven. There is no hover on touch.

## Breakpoints — use these exact values

```
phone      max-width: 560px          one column, sheets, no hover
tablet     561px – 900px             narrower panels, still side-by-side
desktop    901px and up              unchanged from today
```

Also treat `(pointer: coarse)` as touch regardless of width — a small laptop
window is not a phone, and a tablet in landscape is not a desktop.

## Layout decisions (already made — build to these)

1. **Panels become bottom sheets on phone.** Full width minus a 12px gutter,
   rounded top corners only, `max-height: 55vh`, internally scrollable, sitting
   above the bottom bar. The 3D view keeps the upper half of the screen.
2. **Only ONE sheet is open at a time.** Entering the wind tunnel must collapse
   the kit panel rather than stacking on it. Coordinate through the lead if you
   need a hook for this — do not have two modules both trying to hide things.
3. **Safe-area insets.** Use `env(safe-area-inset-bottom)` / `-top` / `-left` /
   `-right` on anything touching an edge. Notches and home indicators are real.
4. **Touch targets ≥ 44px.** Colourway swatches and tool buttons are currently
   well under that.
5. **No hover-only affordances on touch.** Anything reachable only by hover
   needs a tap equivalent.
6. **Never let the page scroll or rubber-band.** The canvas owns the gestures.

## Performance budget

A phone GPU is not an M1. Today the app runs GTAO + bloom + SMAA at DPR 2, and
a wind-tunnel measurement is ~90ms across 15 GPU readbacks. Assume all of that
is far worse on a phone.

`src/mobile.js` is the single place device capability is decided. Everything
else asks it rather than sniffing the UA itself.

## Verifying

Screenshot at **393×852 DPR 2 (iPhone 14 Pro)** and **360×780 DPR 2** with
`isMobile: true, hasTouch: true` in puppeteer, and READ THE IMAGES yourself.
Also check **852×393 landscape**, which is where a bottom sheet has almost no
room and is the case most likely to be forgotten.

Assert, do not eyeball: `document.documentElement.scrollWidth <=
clientWidth` (no horizontal overflow), and that no two panels' bounding rects
intersect. Both of those caught real bugs in the desktop build.

Two traps already paid for in this codebase:
- `page.evaluate(() => somePromise)` hangs forever if the promise never
  settles — poll a boolean flag.
- Canvas pixel readback returns all black unless `preserveDrawingBuffer`, which
  is only set under `?shot=1`.
