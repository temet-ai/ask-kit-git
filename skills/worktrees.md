Add, move, repair and remove worktrees (several checkouts of one repository)

- List: `await git.worktrees()`; `exists: false` or `prunable` marks a record whose folder is gone.
- Add one for a new branch: `git.run("worktree", "add", "-b", branch, path, base)`; for an
  existing branch: `git.run("worktree", "add", path, branch)`. A branch can be checked out in one
  worktree only; `branches()` shows which in `worktree`.
- A folder was moved by hand (the repository or a worktree): the links are absolute paths and
  break. Run `git.run("worktree", "repair", ...worktreePaths)` from the main checkout, passing the
  new path of every moved worktree. Without the paths, repair fixes only the main checkout's side.
- Move one properly: `git.run("worktree", "move", from, to)`.
- Remove: `git.run("worktree", "remove", path)`. It refuses when the worktree has uncommitted or
  untracked files: report them (`git.at(path).status()`) and stop, unless the request asked to
  discard them. A locked worktree is locked for a reason (`locked` holds it): leave it.
- Records of folders that are gone: `git.run("worktree", "prune")`.
- The branch outlives its worktree. Removing a worktree deletes no commits.
