# Archive

Historical catalogue batches and validator dumps. Nothing in the app
reads these.

| Files | What they were |
|---|---|
| `brands-1.json` … `brands-5.json` | Early researched batches, long since merged into `../brands.json`. |
| `dim-issues*.json` | Output of `validate-dims.mjs` from earlier calibrations. |
| `slot-issues.json` | Output of `audit-slots.mjs` from the first pass. |

Live outputs that tools still write stay next to the catalogue:

- `../brands.backup.json` — snapshot from `apply-verified.mjs`
- `../brands.beforemodels.json` — snapshot from `apply-models.mjs`
- `../image-failures.json` — from `fetch-images.mjs`
- `../generated.json` — from `gen3d.mjs`
