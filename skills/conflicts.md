Resolve a merge, rebase or cherry-pick that stopped on conflicts

1. `await git.status()` names the operation and the files in `conflicted`.
2. For each file, see the three sides without the markers:
   - `git.text("show", ":1:" + file)` the common ancestor,
   - `git.text("show", ":2:" + file)` ours (in a rebase, the branch being rebased onto),
   - `git.text("show", ":3:" + file)` theirs (in a rebase, the commit being replayed).
   `git.text("diff", "--merge", "--", file)` shows the conflict with both sides' changes.
3. Find out what each side meant: `git.log({ range: "MERGE_HEAD...HEAD", path: file })` for a merge,
   or `git.show("REBASE_HEAD")` for the commit being replayed.
4. Take one side whole only when the other side's change is already contained in it:
   `git.run("checkout", "--ours", "--", file)` or `--theirs`. Otherwise the file needs both
   changes combined by hand; you have no editor here, so say exactly which hunks conflict and what
   each side intended, and let the caller combine them.
5. After the caller (or you) fixed a file: `git.run("add", "--", file)`.
6. Continue: `git.run("rebase", "--continue")`, `git.run("merge", "--continue")` or
   `git.run("cherry-pick", "--continue")`. An editor never opens; the prepared message is used.
7. To give up and return to the state before: `git.run("rebase", "--abort")` (or `merge --abort`,
   `cherry-pick --abort`). Only when the request asks for it.

To know before merging whether it will conflict, without touching the work tree:
`await git.run("merge-tree", "--write-tree", "--name-only", base, branch)`; exit code 1 lists the
files that would conflict.
