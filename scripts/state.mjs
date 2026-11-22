export const meta = {
  purpose:
    "Where a repository stands right now: branch and upstream with ahead and behind, files staged, changed, untracked and in conflict, an operation in progress, stashes, the last commits, and every worktree with its branch and how many files are uncommitted in it.",
  params: { path: "another repository or worktree to look at, optional (default: the caller's)", commits: "how many recent commits to list, default 5" },
  returns: "{root, branch, upstream, ahead, behind, operation, staged, changed, untracked, conflicted, stashes, recent:[{short, date, subject}], worktrees:[{path, branch, sha, uncommitted, locked, exists}]}",
  example: 'await scripts.run("state")',
};

export default async function ({ git }, { path, commits = 5 } = {}) {
  const g = path ? git.at(path) : git;
  const [repo, s, recent, trees] = await Promise.all([g.repo(), g.status(), g.log({ max: commits }), g.worktrees()]);
  const worktrees = await Promise.all(trees.map(async (w) => {
    let uncommitted = null;
    if (w.exists) {
      const r = await git.at(w.path).run("status", "--porcelain");
      uncommitted = r.code === 0 ? r.out.split("\n").filter(Boolean).length : null;
    }
    return { path: w.path, branch: w.branch ?? "(detached)", sha: w.sha, uncommitted, locked: w.locked, prunable: w.prunable, exists: w.exists, main: w.main };
  }));
  return {
    root: repo.root,
    remotes: repo.remotes,
    branch: s.branch ?? `(detached at ${s.head})`,
    upstream: s.upstream,
    ahead: s.ahead,
    behind: s.behind,
    operation: s.operation,
    clean: s.clean,
    staged: s.staged,
    changed: s.changed,
    untracked: s.untracked.slice(0, 100),
    untrackedTotal: s.untracked.length,
    conflicted: s.conflicted,
    stashes: s.stashes,
    recent: recent.map((c) => ({ short: c.short, date: c.date, author: c.author, subject: c.subject })),
    worktrees,
  };
}
