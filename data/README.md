# Data

The app reads `brands.json`. Everything else is how that file gets
better.

| File / folder | Role |
|---|---|
| `brands.json` | The catalogue. `src/catalog.js` fetches this. |
| `models/` | Per-brand fidelity records. Schema: `models/MODEL-SPEC.md`. Merged by `tools/apply-models.mjs`. |
| `verified/` | Dimension correction passes. Schema: `verified/SCHEMA.md`. Merged by `tools/apply-verified.mjs`. Later files overwrite earlier ones. |
| `loadouts.json` | Curated example rigs for the start menu. Built by `tools/build-loadouts.mjs`. |
| `profiles.json` | Silhouettes traced from product photos. |
| `diagram-profiles.json` | Outlines traced from maker engineering drawings. Preferred over photos. |
| `portraits.json` | Rendered stand-ins for products that have no photograph. |
| `geometry-journeyer57.json` | A sourced geometry chart. The bike itself uses Checkpoint-class numbers in `src/bike.js`. |
| `newbrands/` | Incoming brand research, merged by `tools/add-brands.mjs`. |
| `media/` | Harvested maker media indexes. |
| `archive/` | Old batches and validator dumps. Nothing reads them. |

`brands.backup.json` and `brands.beforemodels.json` are snapshots the
merge tools write before they touch `brands.json`.
