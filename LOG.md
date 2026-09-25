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
