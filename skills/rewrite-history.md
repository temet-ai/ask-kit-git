Tidy commits before a merge request: squash, reword, reorder, drop, or rebase onto a newer base

Interactive rebase does not work here (nothing can open an editor). Use these instead.

Before anything: `const before = await git.text("rev-parse", "HEAD")` and put that sha in the
answer; `git.run("reset", "--hard", before)` returns to it. Check `git.status()` is clean, and
check who else has the commits: `await scripts.run("branch-status")`. Rewriting commits that are
on the remote needs the request to say so, and the push afterwards is `--force-with-lease`.

- Squash the whole branch into one commit:
  `git.run("reset", "--soft", await git.text("merge-base", base, "HEAD"))`, then one commit
  (skill `commit`).
- Squash the last N commits: `git.run("reset", "--soft", "HEAD~N")`, then commit.
- Reword the last commit: `git.run("commit", "--amend", "-m", subject, "-m", body)`.
- Fold a fix into an earlier commit: `git.run("commit", "--fixup", sha)` then
  `git.run("rebase", "--autosquash", sha + "^")` (the sequence editor is `true`, so the generated
  plan is accepted as it is).
- Drop one commit: `git.run("rebase", "--onto", sha + "^", sha)`.
- Move the branch onto a newer base: `git.run("fetch")`, then `git.run("rebase", base)`. If it
  stops on conflicts, follow skill `conflicts`.

After: `git.diff({ from: before, to: "HEAD" })` must show no file changes for a pure tidy-up
(squash, reword, reorder). If it shows any, say so before pushing.
