# Tools

Named scripts in this folder are the ones you run on purpose.
Session fossils live in `scratch/`.

## Everyday

| Script | What |
|---|---|
| `serve.mjs` | Dev server, port 8735. `npm start`. |
| `build-pages.mjs` | Rebuild `docs/` for GitHub Pages. `npm run build`. |
| `build-vendor.mjs` | Bundle Firebase into `vendor/` for the no-build entry. |
| `bagshot-q.mjs` | Serialised bag render + mm clearance. **Always this, never `bagshot.mjs` directly.** |
| `apply-models.mjs` | Merge `data/models/*.json` into `data/brands.json`. |
| `apply-verified.mjs` | Merge `data/verified/*.json` into `data/brands.json`. |

## Catalogue

`add-brands.mjs` · `validate-dims.mjs` · `audit-fit.mjs` · `audit-slots.mjs` ·
`audit-exclusions.mjs` · `export-csv.mjs` · `fetch-images.mjs` ·
`shrink-images.mjs` · `fix-roll-ranges.mjs`

## Shape

`silhouette.mjs` · `diagram-outline.mjs` · `raster-diagrams.mjs` ·
`bag-portraits.mjs` · `harvest-brand.mjs` · `harvest-apidura.mjs`

## Eval / shoot

`eval-set.mjs` · `eval-render.mjs` · `eval-review.mjs` · `eval-auto.mjs` ·
`eval-critics.mjs` · `eval-bundle.mjs` · `eval-silhouette.mjs` ·
`critic-bundle.mjs` · `shoot.mjs` · `shoot-products.mjs`

## Other

`aero-check.mjs` (`npm test`) · `build-loadouts.mjs` · `measure-loadouts.mjs` ·
`build-artifact.mjs` · `hdr-codec.mjs` · `gen3d.mjs` ·
`deploy-pages.sh` · `save-to-main.sh`

`scratch/` is one-off puppeteer probes from agent sessions. Keep them; do
not add new named tools that start with `_`.
