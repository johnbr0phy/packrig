#!/usr/bin/env bash
# Commit specific files to origin/main WITHOUT touching the current working tree.
#
# Why: another Claude session shares this checkout and keeps uncommitted edits in
# flight (and may have a feature branch checked out). Committing normally would
# land work on whatever branch happens to be current, and any stash/checkout/pull
# risks destroying their unsaved work. This stages the named files into a
# throwaway worktree pinned to origin/main, commits there, pushes, and cleans up.
#
#   tools/save-to-main.sh "commit message" data/models/a.json data/models/b.json
set -euo pipefail

# Message comes from stdin when the first arg is "-", which avoids the shell
# expanding backticks in the message. Twice now, `like this` in a commit message
# has been run as a command by the calling shell before the script ever saw it.
if [ "${1:-}" = "-" ]; then
  shift
  MSG="$(cat)"
else
  MSG="${1:?usage: save-to-main.sh <message>|- <file>...   (- reads message from stdin)}"
  shift
fi
[ $# -gt 0 ] || { echo "no files given"; exit 1; }

ROOT="$(git rev-parse --show-toplevel)"
WT="$(mktemp -d)/mainwt"

cleanup() { git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true; }
trap cleanup EXIT

git -C "$ROOT" fetch -q origin
git -C "$ROOT" worktree add -q --detach "$WT" origin/main

for f in "$@"; do
  mkdir -p "$WT/$(dirname "$f")"
  cp "$ROOT/$f" "$WT/$f"
  git -C "$WT" add "$f"
done

if git -C "$WT" diff --cached --quiet; then
  echo "nothing to commit"
  exit 0
fi

git -C "$WT" -c user.name="$(git -C "$ROOT" config user.name)" \
             -c user.email="$(git -C "$ROOT" config user.email)" \
             commit -q -m "$MSG"
git -C "$WT" push -q origin HEAD:main
echo "pushed to main: $(git -C "$WT" log --oneline -1)"
