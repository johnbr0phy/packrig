# The UI and UX pass: what changed and why

26 Sep 2026. Branch `claude/packrig-ui-ux-redesign-w4dq7s`. The screens are
in `SCREENS.md`, the calls in `DECISIONS.md` section 9, the dead ends in
`LOG.md` 17 to 31, the values in `DESIGN-SYSTEM.md`, and what each screen
is now in `REDESIGN.md`.

## The short version

Packrig worked, but it made you work. On a phone the bike was a quarter of
the screen, every sheet had two ways to close it, the header was four
unlabelled icons, and adding a bag meant reading a list of mount names. I
made the bike the interface: rings on the bike where bags go, one sheet
that the camera frames around, one rig panel with the numbers on top, and
a stylesheet you can actually reason about.

## What changed

- **The bike stays big.** `src/ui/framing.js` fits the bike's projected
  silhouette into whatever space the chrome leaves, on every surface, and
  starts the phone camera from the front quarter. Side-on, a phone bike
  was 25% of the height at best.
- **Adding a bag is tapping the bike.** Pulsing rings sit on every place a
  bag can go. A ring opens the catalogue at half height, filtered to that
  spot, fit first, with a fit badge on each row. Tap a bag and it is on;
  the catalogue moves on to the next place a first build fills. The list of
  mounts stays as the keyboard and screen reader path.
- **One sheet.** On a phone, the panel and every sheet are one bottom sheet
  with three heights and one close. On a desktop they are one left column.
  The scene is never dimmed; the camera reframes instead.
- **One rig panel.** Bags and kit are one list (the Bags | Gear tabs went).
  Numbers first, in fixed columns that never wrap, with a watts chip that
  runs the wind tunnel's own meter in the background and agrees with it.
  Each bag row carries its fill, what is in it and its worst warning.
- **Warnings where the thing is.** "55 cm won't fit this 23 cm bag. Move to
  the half frame bag?" sits on the tent poles' row, with Move.
- **A pasted spreadsheet on a bare bike** used to strand 55 of 67 things.
  It now leads with "Fit the 8 bags your list uses".
- **The top bar says what it does**: wordmark, Log in, More. Every More item
  is a labelled row. Log in is a sheet beside the bike, not a veiled modal.
- **One token file.** `src/ui/tokens.css` is the only place a colour or
  size is defined; each surface has one stylesheet on top of it.

## Numbers

| | Before | After |
|---|---|---|
| First timer (pick a bike, 3 bags, 4 things, share), phone taps | did not finish (13, a button covered) | 12, finished |
| First timer, desktop taps | 19 | 12 |
| Build a rig from nothing (4 bags, rename it; the Enter that saves the name counts), taps | 17 | 10 |
| Import the owner's sheet and find the heaviest bag, taps | did not finish (7) | 5 |
| Open a shared link signed out and copy the kit, taps | 2 | 1 |
| Stylesheets | 8 files, 6305 lines | 8 files, 1276 lines |
| Distinct hex colours | 64 | 10 |
| Distinct font sizes declared in CSS (px) | 35, 7 half-pixel | 9, none half-pixel |
| Text under its contrast floor, 5 environments x 2 devices x 4 scenes | not measured | 0 (worst 4.92:1) |
| Bike height on a phone, no sheet or at peek (min over screens) | 25% | 50% (goal 45%) |
| Bike height on a phone, sheet at half | 25% | 42% (goal 35%) |
| Bike height with a bag open (the camera frames the bag on purpose) | 26% | 31% |
| Phone touch targets under 44px (summed over screens) | 116 | 0 |
| Buttons with no name | 19 | 0 |
| Font sizes carrying text | 28, 4 under 11px | 9, none under 11px |

Performance, phone profile, CPU throttled 4x, 67 things in 10 open bags: the
UI costs 0.11 ms a frame idle, 0.23 ms while orbiting, 0.16 ms scrolling the
panel, and 1.43 ms (8 layouts) on the frame a bag opens. The frame budget is
spent in WebGL, not the DOM.

Engine checks green throughout: `pack-test`, `pack-e2e` (spreadsheet round
trip, share links, v1 links), `firsttimer`, `screens --twice`,
`_probe ?kit=full`. Every old share link and saved rig still opens; signed
out, everything but Save works, as before.

## What did not work

- **A fixed sheet lift for the camera.** The old code raised the view by
  22% of the height; right for one sheet height, wrong for every other.
  Fitting the silhouette is the only thing that held.
- **Raising panel opacity to kill the brown glass.** It turned the panel
  into a grey slab. The fix was taking saturation out of the blur.
- **Keying the desktop layout on a fine pointer.** Headless Chrome has none,
  so none of the desktop shots were real. Width it is.
- **Keeping the old theme file.** It redefined the core tokens as a light
  theme that another file re-darkened. I stripped each legacy rule as its
  class was replaced, then deleted the files.
- **Two of my own mistakes**: I saved a token file while the before shoot
  ran (the dev server serves live; one shot re-taken), and the em dash
  sweep rewrote its own regexes. Both are in `LOG.md`.

## Next

1. **The first timer still scrolls.** All three of the phone's hesitations
   are scrolling the rig panel to reach the mat, stove and jacket tiles
   under the bags. On a short trip the tiles should come before the bags,
   or the panel should open far enough to show a row of them.
2. **Drag and drop on a phone.** The item sheet is the tap path; a long
   press to drag onto the bike would be faster for moving many things.
3. **Real photos for every bag.** 3D thumbnails fill the gaps and read
   well, but a maker photo still sells better.
4. **Test with five strangers.** The task scripts measure taps, not
   confusion.
