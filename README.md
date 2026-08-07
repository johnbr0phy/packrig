# Packrig — 3D Bikepacking Bag Configurator

Attach real-brand bikepacking bags to an exactly-proportioned gravel bike, orbit it in
3D, switch scenery, and hit **⚡ Surprise me** for instant loaded rigs.

## Run it

```bash
cd ~/bikes
node tools/serve.mjs          # serves on http://localhost:8735
open http://localhost:8735
```

No build step — plain ES modules with a local copy of three.js.

## What's inside

- **31 real brands, 181 real products** (researched from the web with real names, litres
  and dimensions): Apidura, Ortlieb, Revelate, Restrap, Tailfin, Salsa EXP, Blackburn,
  Topeak, Brooks, Swift, Road Runner, Outer Shell, Wizard Works, Oveja Negra, Rockgeist,
  Bags by Bird, Rogue Panda, Miss Grape, Arkel, WOHO, EVOC, VAUDE, Fjällräven×Specialized,
  Chrome, Lezyne, Zefal, AGU, Straight Cut, Buckhorn, Cedaero, Rapha.
- **16 mount points**: seat pack, saddle bag, bar roll, bar bag, rando/basket (auto front
  rack), full & half frame bags (sized to the actual frame triangle), top tube, stem L/R,
  fork L/R, downtube, panniers L/R (auto rear rack), rack trunk.
- **mm-accurate parametric bike** built from a real size-56 gravel geometry chart
  (wheelbase 1032, chainstay 435, BB drop 76, HTA 71.7°, STA 73.3°, stack 583 / reach 386,
  700×45 tan-wall tires).
- **5 environments**: mountain dawn, mirror lake, pine forest, desert dusk, starry night.
- **6 paint colors**, auto-rotate, drag to orbit.

## URL params (used by the screenshot harness)

`?env=mountain|lake|forest|desert|night & kit=rand|full & seed=N & cam=hero|side|tq|rear|front
 & paint=Slate|Forest|Oxblood|Midnight|Sand|Violet & shot=1` (shot hides UI)

## Dev tools

- `node tools/shoot.mjs --set NAME` — captures a fixed set of angles × envs × kits into
  `shots/NAME/` with headless Chrome (used by the adversarial review loop).
- `data/brands.json` — merged brand/product catalog (see `data/brands-*.json` batches).
- `reference/` — club photos used as the visual quality bar.

## Geometry reference

`data/geometry-journeyer57.json` — a fully sourced real-bike geometry chart (Salsa
Journeyer 700c, 57cm, plus standard component dimensions down to hub flange offsets and
cassette cog planes), gathered by the research agent. The bike model in `src/bike.js`
uses Trek Checkpoint-class size-56 numbers (wheelbase 1032, HTA 71.7°, BB drop 76,
stack 583 / reach 386), which sit within a few mm/tenths-of-a-degree of the Checkpoint
ALR 56 chart the researcher cross-checked (WB 1048, HTA 72.2°, drop 76, stack 592).
Swap in the Journeyer numbers via `GEO` if you prefer a slacker touring stance.
