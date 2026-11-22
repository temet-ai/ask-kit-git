export const meta = {
  purpose:
    "What can be tidied, without removing anything: branches already merged into the base, branches whose upstream was deleted on the remote, worktrees whose folder is gone or that hold a merged branch with nothing uncommitted, and stashes older than a number of days. Each entry says why it is safe or what would be lost.",
  params: { base: "the branch things were merged into, optional (default: the remote's default branch, else main or master)", stashDays: "stashes older than this are listed, default 30", fetch: "fetch and prune first, default true" },
  returns: "{base, mergedBranches:[{name, date, worktree}], goneBranches:[{name, unmergedCommits}], worktrees:[{path, branch, reason}], oldStashes:[{ref, date, subject}], keep:[{name, why}]}",
  example: 'await scripts.run("cleanup")',
};

export default async function ({ git }, { base, stashDays = 30, fetch = true } = {}) {
  if (fetch) await git.run("fetch", "--prune", "--quiet");
  if (!base) {
    const head = await git.run("symbolic-ref", "--short", "refs/remotes/origin/HEAD");
    if (head.code === 0) base = head.out.trim();
    else for (const b of ["origin/main", "origin/master", "main", "master"]) if ((await git.run("rev-parse", "--verify", "--quiet", b)).code === 0) { base = b; break; }
  }
  if (!base) throw new Error("no base branch found: pass base");
  const baseName = base.replace(/^origin\//, "");
  const [all, mergedList, trees, stashes] = await Promise.all([git.branches(), git.branches({ merged: base }), git.worktrees(), git.stashes()]);
  const merged = new Set(mergedList.map((b) => b.name));
  const out = { base, mergedBranches: [], goneBranches: [], worktrees: [], oldStashes: [], keep: [] };
  for (const b of all) {
    if (b.name === baseName) continue;
    if (b.current) { out.keep.push({ name: b.name, why: "checked out here" }); continue; }
    if (merged.has(b.name)) out.mergedBranches.push({ name: b.name, date: b.date, worktree: b.worktree });
    else if (b.gone) {
      const marks = (await git.text("cherry", base, b.name)).split("\n").filter((l) => l.startsWith("+"));
      out.goneBranches.push({ name: b.name, date: b.date, worktree: b.worktree, unmergedCommits: marks.length, note: marks.length ? "its remote branch is gone but these commits are not in the base by patch: check for a squash merge with branch-status before deleting" : "its remote branch is gone and every patch is in the base" });
    } else if (!b.upstream) out.keep.push({ name: b.name, why: "never pushed and not merged" });
  }
  const dirtyCounts = await Promise.all(trees.map(async (w) => (w.main || !w.exists ? 0 : (await git.at(w.path).run("status", "--porcelain")).out.split("\n").filter(Boolean).length)));
  for (const [i, w] of trees.entries()) {
    if (w.main) continue;
    if (!w.exists) { out.worktrees.push({ path: w.path, branch: w.branch, reason: "its folder is gone: `git worktree prune` removes the record", locked: w.locked }); continue; }
    const dirty = dirtyCounts[i];
    if (w.locked) out.keep.push({ name: w.path, why: `locked worktree${typeof w.locked === "string" ? `: ${w.locked}` : ""}` });
    else if (dirty) out.keep.push({ name: w.path, why: `${dirty} uncommitted file(s)` });
    else if (w.branch && merged.has(w.branch)) out.worktrees.push({ path: w.path, branch: w.branch, reason: `clean, and ${w.branch} is merged into ${base}` });
    else if (w.detached && (await git.run("merge-base", "--is-ancestor", w.sha, base)).code === 0) out.worktrees.push({ path: w.path, branch: null, reason: `clean, detached at ${w.sha}, which is in ${base}` });
  }
  const cutoff = Date.now() - stashDays * 86400_000;
  out.oldStashes = stashes.filter((s) => new Date(s.date).getTime() < cutoff).map((s) => ({ ref: s.ref, date: s.date, subject: s.subject, files: s.files }));
  return out;
}
