#!/bin/sh
# Builds the repository the bench questions are about, in bench/fixtures/discworld (ignored by git).
# Dates, names and messages are fixed, so the answers do not change. Run it once before the bench.
set -e
here=$(cd "$(dirname "$0")" && pwd)
repo="$here/fixtures/discworld"
rm -rf "$repo" "$here/fixtures/discworld-night-watch"
mkdir -p "$repo"
cd "$repo"
export GIT_AUTHOR_NAME="Sam Vimes" GIT_AUTHOR_EMAIL="vimes@example.com" GIT_COMMITTER_NAME="Sam Vimes" GIT_COMMITTER_EMAIL="vimes@example.com"
git init -q -b main
git config commit.gpgsign false
c() { GIT_AUTHOR_DATE="$1T12:00:00+00:00" GIT_COMMITTER_DATE="$1T12:00:00+00:00" git commit -q -m "$2"; }
printf 'members = ["watch"]\nname = "city"\n' > Cargo.toml
echo "# City" > README.md
git add -A; c 2026-01-05 "Start the city"
mkdir watch; echo "patrol" > watch/patrol.txt
git add -A; c 2026-01-06 "Add the watch patrol"
git tag v0.1.0
git checkout -q -b fix/library-index
echo "index" > library.txt
git add -A; c 2026-01-08 "Index the library"
git checkout -q main
echo "gate" > watch/gate.txt
git add -A; c 2026-01-09 "Add the Pseudopolis Yard gate"
GIT_AUTHOR_DATE="2026-01-10T12:00:00+00:00" GIT_COMMITTER_DATE="2026-01-10T12:00:00+00:00" git merge -q --no-ff fix/library-index -m "Merge branch 'fix/library-index'"
printf 'members = ["watch", "guilds"]\nname = "city"\n' > Cargo.toml
mkdir guilds; echo "assassins" > guilds/assassins.txt
git add -A; c 2026-01-12 "Add the guilds member"
echo "thieves" > guilds/thieves.txt
git add -A; c 2026-01-13 "Add the Thieves' Guild"
git tag v0.2.0
git branch night-watch
git worktree add -q "$here/fixtures/discworld-night-watch" night-watch
git worktree lock --reason "on the night shift" "$here/fixtures/discworld-night-watch"
