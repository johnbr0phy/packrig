# Packrig — 3D Bikepacking Bag Configurator

Attach real-brand bikepacking bags to an exactly-proportioned gravel bike,
orbit it in 3D, switch scenery, and open the wind tunnel for the cost in watts.

## Run it

```bash
cd ~/bikes
npm start                 # http://localhost:8735
```

No build step — plain ES modules, refresh picks up `src/`. First time on a
new machine, also run `npm run vendor` so Firebase can load from `vendor/`.

```bash
npm run build             # regenerate docs/ for GitHub Pages
npm test                  # aero measurement sanity checks
```

## What's inside

- **50 brands, 702 products**, researched from maker pages with real names,
  litres and dimensions.
- **16 mount points**: seat pack, saddle bag, bar roll, bar bag, rando/basket,
  full & half frame bags (sized to the actual frame triangle), top tube,
  rear top tube, stem L/R, fork L/R, downtube, panniers L/R, rack trunk,
  and a front pocket that clips to a bar bag rather than the bike.
- **mm-accurate parametric bike** from a real size-56 gravel geometry chart
  (wheelbase 1032, chainstay 435, BB drop 76, HTA 71.7°, STA 73.3°,
  stack 583 / reach 386, 700×45 tan-wall tyres).
- **5 environments**: mountain dawn, mirror lake, pine forest, desert dusk,
  starry night.
- **Wind tunnel**: measured CdA of the loaded bike, yaw-weighted, with and
  without the luggage.

## Where things live

| Path | What |
|---|---|
| `src/` | The app. `main.js` is the entry. Bags in `src/bags/`, UI in `src/ui/`, tunnel in `src/aero/`. |
| `data/brands.json` | The catalogue the app actually reads. |
| `data/models/` | Per-brand fidelity records. Merged in with `tools/apply-models.mjs`. |
| `tools/` | Named scripts. One-off session scripts sit in `tools/scratch/`. |
| `docs/` | Generated Pages deploy. Do not edit; run `npm run build`. |
| `STATUS.md` | What is true now, and which plan wins. Start there. |

## URL params (screenshot harness)

`?env=mountain|lake|forest|desert|night & kit=rand|full & seed=N & cam=hero|side|tq|rear|front
 & paint=Slate|Forest|Oxblood|Midnight|Sand|Violet & shot=1` (`shot` hides the UI)

## Dev tools

```bash
node tools/bagshot-q.mjs --slot seatpack    # one bag, several angles, mm clearance
node tools/apply-models.mjs --dry           # preview model → catalogue merge
node tools/validate-dims.mjs                # implausible dimensions
node tools/shoot.mjs --set NAME             # fixed angles × envs × kits → shots/NAME/
```

Always the `-q` wrapper for renders: it serialises headless Chrome so an
8 GB machine does not swap.

## Geometry reference

`data/geometry-journeyer57.json` is a fully sourced Salsa Journeyer 700c 57 cm
chart. The bike in `src/bike.js` uses Trek Checkpoint-class size-56 numbers,
within a few mm of that chart. Swap via `GEO` if you want the slacker touring
stance.
