# Evals

How we tell whether a bag looks like the bag.

The loop that actually works is in `../notes/gauntlet/` — one bag, one
photo, one critic, one biggest gap. The files here are the frozen sets,
human labels, and the earlier scoring harness.

| File | What |
|---|---|
| `EVAL-PLAN.md` | The framework: frozen set, grader, comparison. |
| `EVAL-STORY.md` | Narrative of the first eight Apidura versions. |
| `FACTS.md` | Numbers only, from tools, checked. |
| `sets/` | Frozen cases. Do not edit a set; cut a v2. |
| `labels/` | Human votes. |
| `bundles/` | Per-brand critique packs (Tailfin first). |
| `runs/` | Rendered versions. Gitignored; local only. |

`tools/eval-*.mjs` and `tools/critic-bundle.mjs` are the harness.
