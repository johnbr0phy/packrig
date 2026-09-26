# Packrig v2 run, the log

What broke, why, and what stops it happening again. Newest last. Anything
here that is a trap for the next agent is also in `src/bags/BUILDER-BRIEF.md`
(geometry) or `DECISIONS.md` (everything else).

| # | What broke | Why | Fix / rule |
|---|---|---|---|
| 1 | Every tool that renders was dead on this machine | 44 tools hard-coded the macOS Chrome path | `tools/lib/chrome.mjs` resolves per machine; Linux wrapper adds SwiftShader |
| 2 | App never reached `__READY` headless | HDRIs are gitignored; polyhaven blocked | copy the deploy's downsampled HDRIs from `docs/assets/hdri/` |
| 3 | 1,423 of 1,430 maker photos refused | environment egress policy blocks maker CDNs | compare against the 108 traced outlines + records; say so in DECISIONS §0 |
| 4 | Six research agents stopped at ~20–40 searches each | the WebSearch cap is **200 per session, shared by every agent** | budget searches before fanning out; recall-labelled data for the rest |
| 5 | Sheet importer matched "Go Pro 7" to the GoPro 6 | stripped the trailing number before trying an exact match | exact first, then "Water Bottle 2" → "water bottle" |
| 6 | "Lid" (a pot lid, Kitchen) matched a bike helmet | "lid" is helmet slang in the catalogue's aliases | the sheet's category constrains which catalogue categories may match |
| 7 | `build-loadouts.mjs` refused to build | the 635-bag cut removed the Sugarloaf and Aero Frame Module two curated rigs used | replaced; the tool's loud failure was right |
| 8 | Packing class names picked up picker padding | `pk-` was already the picker's prefix in ui.css/builder.css | packing uses `pkg-`; grep the stylesheets before choosing a prefix |
| 9 | **Self-inflicted:** every `applyRig` threw `fitted is not defined` | wrapped the equip loop in `try` and moved the `let` inside it | declarations before the `try`; caught by the first headless flow, not by review |
| 10 | The e2e run hung opening the v1 link | three live WebGL pages rendering in software GL starved the fourth past its READY timeout | close each page when its step is done; one live page at a time headless |
| 11 | The owner's real kit list produced 15 "won't fit"s | rigid items laid end to end; soft bags treated as rigid boxes; a two-sided frame bag split into two halves; a centre-mounted bar roll couldn't take anything longer than half its width | shelves from the floor, bulge tolerance by stiffness, side pocket + main, centre-out lanes (DECISIONS §8.2). A real list that fits in real life must fit here |
| 12 | A dangling pot floated ~20 cm under the new seat pack | placement used the bag's bounding box; a tilted wedge's lowest point is its shoulder, not its tail | raycast the body at the item's x; hang it on a short cord. Still reads loose on a phone because the open shell is faint and the tail sits at the top edge: frame the open bag above the sheet next |
| 13 | Screen shots differed run to run and phone rows looked broken | item thumbnails draw a few per frame in software GL; empty slots were hidden | visible placeholder; `screens.mjs` waits for `thumbsPending() == 0` |
| 14 | Debug probes starved for an hour | the render lock is a poll, not a queue; four agents' batches kept winning it | every Chrome-starting tool takes the same lock (`tools/lib/renderlock.mjs`); run probes in the background and batch renders with `--slugs` |
| 15 | Full frame bags drew 10–80 % larger than their catalogue size | "fills the triangle exactly" and "published size" disagree on a frame the bag wasn't made for | the owner's words win; capacity stays on rated litres (DECISIONS §8.2) |
| 16 | **Self-inflicted:** the dangle fix in #12 didn't work, and my second guess (stale bounding spheres) was wrong too | the surface ray was cast away from the bag, missed, and fell back to the box | cast toward the bag; confirmed by numbers (cord at the underside, y 648; shoes on the top surface). Lesson: a probe that hand-writes the "same" maths proves nothing about the code under test |

## The UI and UX pass (26 Sep 2026)

One entry per area: what changed, what was tried and did not work. Numbers
are from `tools/screens.mjs`, `tools/tasks.mjs`, `tools/contrast.mjs` and
`tools/css-stats.mjs`; before and after contact sheets per area are in
`shots/compare/`.

| # | Area | What changed | Tried and dropped |
|---|---|---|---|
| 17 | Shot list | `SCREENS.md` covers all 24 surfaces (was packing only); `screens.mjs` shoots them with `--out`/`--device` and records an audit per shot | |
| 18 | **Self-inflicted:** a before shot taken on new tokens | I saved the new `tokens.css` while the before shoot was running; the dev server serves files live | reverted within seconds, re-shot S04; rule since: no edits to loaded files while a shoot runs, drafts go in the scratchpad |
| 19 | Camera framing | one module (`framing.js`) fits the bike's projected silhouette into the free area left by whatever chrome is up; phone camera starts from the front quarter | a fixed sheet lift (the old 0.22): wrong for every sheet height but one. Side-on phone framing: 26% of the height at best |
| 20 | The fit clipped the bike by 25px | the ground contact shadow is a flat decal wider than the wheel; and my first filter for it (`depthWrite === false`) also dropped the frosted open-bag shell, so a bag in focus was fitted by its straps | skip decals only: basic material with no depth write |
| 21 | My own audit read a stale camera | the quick in-page silhouette check projected with `matrixWorldInverse` from the last frame | update the camera's matrices before projecting, in every audit |
| 22 | Glass read brown | the blur sampled the desert through `saturate(150%)` | neutral glass: `saturate(45 to 60%) brightness(0.48 to 0.6)`; raising panel alpha instead turned it into a grey slab |
| 23 | Stylesheet consolidation | new sheets per surface loaded after the legacy ones; each legacy rule for a replaced class stripped by `tools/css-strip.mjs`; `ui.css`, `theme.css`, `sheet.css`, `builder.css` deleted once empty of live rules | keeping `theme.css`: it redefined the core tokens as a LIGHT theme which `builder.css` then re-darkened; there was no way to reason about any colour |
| 24 | Desktop layout keyed on `pointer: fine` | headless Chrome reports no pointer, so the desktop rules never applied in shots | key on width, as the old CSS did |
| 25 | Phone sheet footers off screen | a generic `flex: 1` rule later in the file overrode the phone sheet's cut height | order the generic rule first |
| 26 | Bag thumbnails small and off centre | builders carry hidden collision proxies; `Box3.setFromObject` counts them | fit on visible meshes only |
| 27 | First-timer: a tap landed on a detached tile | the watts chip repainted the whole panel when its measurement landed | the chip swaps in place |
| 28 | Import on a bare bike stranded 55 of 67 things | the list names bags the bike does not have; nothing offered to fit them | "Fit the 8 bags your list uses" |
| 29 | Catalogue at half height showed no bags | search, four filter chips and a count line filled the visible half | search folds into a chip, filters scroll sideways, Done moved into the header (it was a second Close) |
| 30 | **Self-inflicted:** the em dash sweep rewrote itself | `tools/no-emdash.mjs` walked `tools/` and edited its own regexes mid-run | the other 146 files were right; the tool now builds the dash from its code point |
| 31 | Top-bar labels at 1.7:1 over a bright sky | "Log in" and "More" were bare text on the scene | an E1 glass chip under each, as DESIGN-SYSTEM says for text on the canvas |
| 32 | The final shoot failed on its own noise | a random rig name per load, the rings' pulse caught mid-loop, and single pixels flipping on spoke edges in software GL | the shot tool seeds `Math.random`, freezes CSS animations, and counts only clumped differing pixels (a 13-character label still fails it; spoke noise does not) |
