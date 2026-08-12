#!/usr/bin/env bash
# Publish the built site and its sources to origin/main, WITHOUT touching this
# working tree or this branch.
#
# Why not just commit and push: this checkout is shared, `wind-tunnel` has
# unrelated work in flight across ~80 files, and GitHub Pages serves
# main:/docs. Committing normally would land somebody else's uncommitted work
# on the branch the live site is built from. This stages an explicit list into
# a throwaway worktree pinned to origin/main, commits there, pushes, and
# removes the worktree — the same approach as tools/save-to-main.sh, extended
# to handle whole directories and deletions.
#
#   tools/deploy-pages.sh "commit message"
set -euo pipefail

# The message comes from stdin when the first argument is "-", which is the
# only safe way to pass one containing backticks: the calling shell expands
# them as command substitution before this script ever sees the string.
if [ "${1:-}" = "-" ]; then
  MSG="$(cat)"
else
  MSG="${1:?usage: deploy-pages.sh <message>|-   (- reads the message from stdin)}"
fi

ROOT="$(git rev-parse --show-toplevel)"
WT="$(mktemp -d)/mainwt"

cleanup() { git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true; }
trap cleanup EXIT

git -C "$ROOT" fetch -q origin
git -C "$ROOT" worktree add -q --detach "$WT" origin/main

# CHECK THE WORKING TREE BEFORE YOU RUN THIS, not the last deploy's diff.
# These paths are copied from the tree as it stands, and docs/ is rebuilt from
# it, so whatever anyone else in this shared checkout has half-finished goes to
# the live site with you. On 12 Aug one deploy came back clean (two files, all
# mine) and the next, twenty minutes later, carried 24 files of another
# session's in-flight menu work — because I verified the previous run's outcome
# instead of the current tree. `git status src/ui index.html` first.
#
# Sources that make up the v2 menu, plus the build that produces the deploy.
FILES=(
  index.html
  src/ui.js
  src/ui.css
  src/ui/theme.css
  src/ui/sheet.css
  src/ui/v2/menu.js
  src/ui/v2/menu.css
  src/ui/v2/builder.css
  src/ui/v2/start.js
  src/ui/v2/browse.js
  src/ui/v2/icons.js
  src/main.js
  src/ui/product.js
  src/aero/index.js
  src/ui/sheet.js
  src/ui/catalogue.js
  src/ui/bagsheet.js
  src/ui/account.js
  src/ui/rignav.js
  src/environments.js
  src/aero/panel.js
  data/loadouts.json
  tools/build-loadouts.mjs
  tools/measure-loadouts.mjs
  tools/build-pages.mjs
)

# A deploy whose bundle cannot be rebuilt from the sources it ships beside is a
# deploy nobody can reproduce. Every file esbuild reaches through src/main.js
# and that this branch has modified must be in the list above; three were not —
# src/main.js, src/ui/product.js and src/aero/index.js — so docs/packrig.js on
# main was built from code that was not on main. The live site was correct and
# the repository could not have produced it.
# Replaced by src/ui/v2/, and their styles moved with them.
GONE=(
  src/ui/home.js
  src/ui/gallery.js
  # Split: the account is src/ui/account.js, the saved rigs are the menu's
  # `rigs` view, and the gallery was already there.
  src/rigsui.js
)

for f in "${FILES[@]}"; do
  [ -f "$ROOT/$f" ] || { echo "missing: $f"; exit 1; }
  mkdir -p "$WT/$(dirname "$f")"
  cp "$ROOT/$f" "$WT/$f"
  git -C "$WT" add "$f"
done

for f in "${GONE[@]}"; do
  git -C "$WT" rm -q --ignore-unmatch "$f" >/dev/null
done

# The deploy itself. Mirrored rather than merged: docs/ is generated output, so
# a file that build-pages.mjs no longer emits must not survive in the deploy.
rm -rf "$WT/docs"
cp -R "$ROOT/docs" "$WT/docs"
git -C "$WT" add -A docs

if git -C "$WT" diff --cached --quiet; then
  echo "nothing to commit"
  exit 0
fi

git -C "$WT" -c user.name="$(git -C "$ROOT" config user.name)" \
             -c user.email="$(git -C "$ROOT" config user.email)" \
             commit -q -m "$MSG"
git -C "$WT" push -q origin HEAD:main
echo "pushed to main: $(git -C "$WT" log --oneline -1)"
