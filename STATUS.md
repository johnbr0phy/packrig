# Packrig — what is true now

Written 12 Aug 2026, after a crash and a tidy. If another document
disagrees with this one about *where a file lives* or *which plan is
current*, this one wins. The documents it points at still win on their
own subjects.

---

## The product

A 3D bikepacking bag configurator. Real brands, a millimetre-accurate
gravel bike, five environments, a wind tunnel. Run it:

```bash
npm start          # http://localhost:8735
```

No build step for development. `docs/` is the GitHub Pages artefact —
never edit it by hand, regenerate with `npm run build`.

Live site: <https://johnbr0phy.github.io/packrig/>

---

## What changed after the crash

Compared with the 11 Aug working tree:

- Five more commits landed on `wind-tunnel` (now 14 ahead of origin):
  Tailfin frame / bar / rear-top-tube measurement, a second top-tube
  profile family, and a warning that `deploy-pages` ships the working
  tree, not your commits.
- `BRAND-GAUNTLET.md` was written and committed — the Apidura loop
  generalised, calibrated on Tailfin.
- `REDESIGN.md` gained a 12 Aug desktop-review section. Several of
  those notes are already built.
- `src/rigsui.js` and `src/rigs.css` were deleted. Accounts now live
  in `src/ui/account.js`. The old overlay is gone.
- Two more scratch scripts appeared (`_bagcheck.mjs`, `_dom2.mjs`).
  Nothing looks half-written or lock-corrupted.

Firebase is the backend that is actually wired (`src/config.js`).
`SUPABASE.md` was never used.

---

## Where to look

| If you want… | Read |
|---|---|
| How to run it | `README.md` |
| Tokens, type, colour, motion | `DESIGN-SYSTEM.md` |
| UI / menu / accounts plan | `REDESIGN.md` |
| Geometry traps, axis mapping | `HANDOVER.md` |
| How a bag record is written | `data/models/MODEL-SPEC.md` |
| How a builder is written | `src/bags/BUILDER-BRIEF.md` |
| One brand until it looks right | `notes/gauntlet/APIDURA-GAUNTLET.md` |
| The same loop on every other brand | `notes/gauntlet/BRAND-GAUNTLET.md` |
| Firebase setup | `FIREBASE.md` |
| Wind-tunnel module contract | `src/aero/CONTRACT.md` |
| Phone breakpoints | `src/MOBILE.md` |
| Eval framework (historical) | `evals/EVAL-PLAN.md` |

Archived, not current: `notes/archive/`.

---

## The tree

```
src/            the app
data/           the catalogue the app reads
  models/       per-brand fidelity records
  verified/     dimension correction passes
  archive/      old batches and validator dumps
tools/          named scripts you actually run
  scratch/      one-off _*.mjs from agent sessions
docs/           generated Pages deploy — do not edit
evals/          gauntlet sets, labels, findings
notes/          process docs that are not the product
assets/         fonts, HDRIs, product photos, portraits
```

`docs/` is a build of `src/` plus a slim copy of `data/`. Building from
the wrong tree has already shipped a stale site. See
`notes/archive/NEXT-RUN.md` §9 before you deploy.

---

## Still true, still open

From `HANDOVER.md`, not re-litigated:

- Audit axis mapping in all 13 builders. Five confirmed swaps.
- Derive placement from the bike, never from a hard-coded offset.
- Downtube bag hits the front wheel if it is centred on the anchor.
- Drop bars intersect the bar roll.
- Seat pack silhouette is still closer to a tube than a wedge.
- Seven bags need a front basket, not the bare rack.
- Publish rider contact points from `bike.js` — `aero/rider.js` has
  already drifted once.

The catalogue is 50 brands / 702 products. Remaining clashes are
builder bugs, not missing brand reviews.

---

## Rules that keep the machine alive

This box has 8 GB. Three agents is the cap. Every render goes through
`tools/bagshot-q.mjs`, never `tools/bagshot.mjs` directly. Do not
overlap a vision pass with a headless Chrome pass.
