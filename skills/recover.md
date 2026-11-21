Get back work that seems lost: after a reset, a rebase, a deleted branch, a dropped stash or a bad checkout

Committed work is almost never gone; git keeps it for at least 30 days.

1. `await scripts.run("find-commit", { lost: true, message: "<words from the commit>" })` searches
   the reflog and unreachable commits. Add `path` or `since` to narrow it.
2. A reset or rebase: `await git.reflog("HEAD")` lists where HEAD was; the entry just before
   "reset: moving to" or "rebase (start)" is the old tip. A deleted branch: its last commit is in
   HEAD's reflog as "checkout: moving from <branch>".
3. A dropped stash: `git.run("fsck", "--no-reflogs", "--unreachable")` lists unreachable commits; a
   stash is a merge commit whose subject starts with "WIP on" or "On <branch>:".
   `git.show(sha, { patch: true })` confirms it.
4. Bring it back (needs act):
   - a commit or a branch tip: `git.run("branch", "recovered-<what>", sha)`. A new branch never
     overwrites anything.
   - a stash: `git.run("stash", "apply", sha)`, or a branch as above.
5. Uncommitted changes that were overwritten (`checkout -- file`, `reset --hard`, `clean`) are not
   in git unless they were once staged: `git.run("fsck", "--lost-found")` lists dangling blobs,
   and `git.text("cat-file", "-p", sha)` prints one. Say plainly when nothing was staged: git
   cannot bring those back, and an editor's local history or a backup is the place to look.

Never "recover" by resetting the current branch. Make a new branch at the found commit and let
the caller decide what to do with it.
