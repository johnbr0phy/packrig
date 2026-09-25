# Packrig v2 run — the log

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
