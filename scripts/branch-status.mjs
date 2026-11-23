export const meta = {
  purpose:
    "Whether a branch is merged and pushed. Compares it with its upstream (commits not pushed, commits not pulled) and with a base branch: merged by a merge commit or fast-forward, merged by squash or rebase (its patches are in the base under other shas), or not merged, with the commits still only on it. Fetches first unless told not to.",
  params: {
    path: "another repository or worktree, optional (default: the caller's)",
    branch: "the branch, optional (default: the current one)",
    base: "the branch to compare with, optional (default: the remote's default branch, else main or master)",
    fetch: "fetch from the remote first, default true",
  },
  returns: "{branch, sha, upstream, pushed, unpushed:[commit], unpulled, base, merged: 'yes' | 'squashed-or-rebased' | 'no', ahead, behind, only:[commit], fetched}",
  example: 'await scripts.run("branch-status", { branch: "fix/nested-repo-binding" })',
};

export default async function status({ git }, { path, branch, base, fetch = true } = {}) {
  if (path) git = git.at(path);
  const this_ = (p) => status({ git }, p);
  let fetched = null;
  if (fetch) {
    const r = await git.run("fetch", "--prune", "--quiet");
    fetched = r.code === 0 ? true : `fetch failed: ${(r.err || r.out).trim().slice(0, 200)}`;
  }
  const name = branch ?? (await git.status()).branch;
  if (!name) throw new Error("HEAD is detached: name a branch");
  if ((await git.run("rev-parse", "--verify", "--quiet", `${name}^{commit}`)).code !== 0) {
    // Not here under that name: a branch that exists only on the remote, or one already deleted after its merge.
    if ((await git.run("rev-parse", "--verify", "--quiet", `origin/${name}^{commit}`)).code === 0) return { branch: name, local: false, note: `no local branch ${name}; origin/${name} exists`, ...(await this_({ branch: `origin/${name}`, base, fetch: false })) };
    const merges = await git.log({ all: true, grep: `Merge (branch|pull request).*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, max: 5 });
    return { branch: name, exists: false, fetched, note: merges.length ? `no branch ${name} here or on origin any more; these merge commits name it` : `no branch ${name} here or on origin, and no merge commit names it`, mergeCommits: await Promise.all(merges.map(async (c) => ({ short: c.short, date: c.date, subject: c.subject, on: (await git.contains(c.sha)).branches.slice(0, 6) }))) };
  }
  const sha = await git.text("rev-parse", "--short", "--verify", `${name}^{commit}`);
  if (!base) {
    const head = await git.run("symbolic-ref", "--short", "refs/remotes/origin/HEAD");
    if (head.code === 0) base = head.out.trim();
    else for (const b of ["origin/main", "origin/master", "main", "master"]) if ((await git.run("rev-parse", "--verify", "--quiet", b)).code === 0) { base = b; break; }
  }
  const brief = (c) => ({ short: c.short, date: c.date, subject: c.subject });
  const row = (await git.branches()).find((b) => b.name === name);
  const upstream = row?.upstream ?? null;
  const out = { branch: name, sha, upstream, fetched };
  if (upstream && !row.gone) {
    out.unpushed = (await git.log({ range: `${upstream}..${name}`, max: 50 })).map(brief);
    out.unpulled = (await git.log({ range: `${name}..${upstream}`, max: 50 })).length;
    out.pushed = out.unpushed.length === 0;
  } else {
    const on = await git.contains(name);
    out.pushed = on.remoteBranches.length > 0;
    out.note = row?.gone ? `its upstream ${upstream} no longer exists on the remote` : "it has no upstream";
    if (on.remoteBranches.length) out.onRemote = on.remoteBranches;
  }
  if (base && base !== name) {
    out.base = base;
    const only = await git.log({ range: `${base}..${name}`, max: 100 });
    out.ahead = only.length;
    out.behind = (await git.log({ range: `${name}..${base}`, max: 500 })).length;
    if (!only.length) out.merged = "yes";
    else {
      // `git cherry` marks with "-" each commit whose patch is already in the base.
      const marks = (await git.text("cherry", base, name)).split("\n").filter(Boolean);
      const missing = marks.filter((l) => l.startsWith("+")).map((l) => l.slice(2, 14));
      // A squash merge puts the whole branch in one commit: compare the branch's combined change with the base.
      let squashed = false;
      if (missing.length) {
        const mergeBase = (await git.text("merge-base", base, name)).trim();
        const tree = await git.run("merge-tree", "--write-tree", base, name);
        const baseTree = await git.text("rev-parse", `${base}^{tree}`);
        squashed = tree.code === 0 && tree.out.trim().split("\n")[0] === baseTree && mergeBase !== sha;
      }
      out.merged = !missing.length || squashed ? "squashed-or-rebased" : "no";
      out.only = only.filter((c) => out.merged === "no" ? missing.some((m) => c.sha.startsWith(m)) : true).map(brief).slice(0, 30);
      if (out.merged !== "no") out.note = [out.note, `every change on ${name} is already in ${base}, under other commits`].filter(Boolean).join("; ");
    }
  }
  return out;
}
