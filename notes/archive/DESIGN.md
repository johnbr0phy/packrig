# Packrig — 3D Bikepacking Bag Configurator

> **Archived 12 Aug 2026.** Original brief. The checklist below is done.
> Current map: `STATUS.md`. Current design values: `DESIGN-SYSTEM.md`.

## Goal
A stunningly beautiful, single-page Three.js app where you attach real-brand bikepacking
bags to an exactly-proportioned gravel bike, orbit around it in 3D, switch scenic
backgrounds, and hit a randomizer for instant loaded rigs.

## The Bar (Gauntlet Loop reference standard)
- Visual quality of a premium product configurator (think high-end bike brand websites):
  soft studio-grade lighting, physically-based materials, gentle shadows, tasteful DOF-free
  clarity, refined typography, calm UI that never covers the bike.
- Bike and bag proportions must match `reference/club-trek-loaded.png` and
  `reference/club-klunker-framebag.png` (NYC ADV club photos): 700c wheels ~712mm OD,
  seat pack ≈ half a wheel-diameter long, bar roll ≈ bar width, frame bag fills the triangle.
- Environments must feel atmospheric, not clip-art: mountain dawn, alpine lake, forest,
  desert, night sky.

## Observations from club photos (NYC ADV bike setups album)
- Bikes: steel/alu drop-bar gravel & rigid MTB, mostly dark frames (grey, black, green,
  red, blue), tan-wall knobby tires very common, disc brakes, single front chainring.
- Bag styles seen: big tapered seat packs (often with a mug/cup strapped on), handlebar
  dry-bag rolls with side straps + accessory pouch, full & half frame bags (zippered,
  black with brand patch), top tube "gas tank" bags, stem feed bags, fork-leg cargo cages
  with dry sacks or bottles (mint/orange straps), Ortlieb roll-top panniers in orange,
  yellow, red, black, front rando bags & baskets, small saddle bags, waxed-canvas rolls.
- Color story: 80% black/olive/tan gear with strong accent pops (orange, red, mint, blue,
  purple straps and drybags).

## Feature checklist
- [x] Exact-proportion parametric gravel bike (real geometry chart, mm-accurate)
- [x] 20+ real brands, each with real product names, colors, fabric looks
- [x] All mount points: seat pack, bar roll, full/half frame bag, top tube bag, stem bags
      (L/R), fork cage bags (L/R), downtube bag, rear panniers (L/R), front panniers?,
      rear rack drybag, rando/basket front bag, small saddle bag
- [x] Start from empty bike; click a mount point (or list) to add/swap/remove bags
- [x] Randomizer button ("Surprise me") loading a coherent random kit
- [x] Environment picker: mountain / lake / forest / desert / night
- [x] Orbit controls with smooth damping, auto-rotate toggle
- [x] Beautiful UI: minimal left panel, brand + product cards, keyboard-free
- [x] URL params for deterministic screenshots: ?env=&kit=&cam= (for critic loop)

## Architecture
- No build step: ES modules + import map → local ./node_modules/three
- `index.html`, `src/main.js` (scene/renderer/loop), `src/bike.js` (parametric bike),
  `src/bags/` (parametric bag builders per type), `src/catalog.js` (brand data),
  `src/environments.js`, `src/ui.js`
- Screenshot harness `tools/shoot.mjs` (puppeteer-core + system Chrome) captures fixed
  angles × environments × kits into `shots/` for critic agents.

## Gauntlet loop protocol
1. Builders implement/refine features.
2. `node tools/shoot.mjs` produces fresh screenshots.
3. Critic agents (fresh context) Read shots + reference photos, compare against The Bar,
   report the LARGEST remaining gap, ranked.
4. Builders fix top gaps. Repeat until morning.
