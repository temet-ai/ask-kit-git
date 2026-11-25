export const meta = {
  purpose:
    "What changed between two points: the commits and the files, with line counts, grouped by top folder. The points are two refs (from, to), or a time window (since, until) on a branch. With neither, the uncommitted work: staged and unstaged.",
  params: {
    from: "older ref (a sha, tag or branch), optional",
    to: "newer ref, default HEAD",
    since: "a time instead of from: '3 days ago', '2026-11-18', optional",
    until: "end of the window, optional",
    path: "narrow to a file or folder, optional",
    repo: "another repository or worktree to look at, optional (default: the caller's)",
    branchOnly: "true: only what `to` added since it left `from` (a branch's own changes), default false",
  },
  returns: "{range, commits:[{short, author, date, subject}], files:[{path, added, deleted, change}], byFolder:{folder:{files, added, deleted}}, added, deleted}",
  example: 'await scripts.run("changes", { from: "v0.3.0", to: "HEAD" })',
};

export default async function ({ git }, { from, to = "HEAD", since, until, path, repo, branchOnly = false } = {}) {
  if (repo) git = git.at(repo);
  const fold = (files) => {
    const by = {};
    for (const f of files) {
      const k = f.path.includes("/") ? f.path.split("/")[0] + "/" : "(top)";
      by[k] ??= { files: 0, added: 0, deleted: 0 };
      by[k].files++;
      by[k].added += f.added ?? 0;
      by[k].deleted += f.deleted ?? 0;
    }
    return by;
  };
  const brief = (c) => ({ short: c.short, author: c.author, date: c.date, subject: c.subject });
  if (!from && !since) {
    const staged = await git.diff({ staged: true, path });
    const unstaged = await git.diff({ path });
    const s = await git.status();
    return { range: "uncommitted work", staged: staged.files, unstaged: unstaged.files, untracked: s.untracked.slice(0, 100), byFolder: fold([...staged.files, ...unstaged.files]), added: staged.added + unstaged.added, deleted: staged.deleted + unstaged.deleted };
  }
  let commits;
  if (from) commits = await git.log({ range: `${from}..${to}`, path, max: 200 });
  else {
    commits = await git.log({ range: to, since, until, path, max: 200 });
    if (!commits.length) return { range: `${to} since ${since}${until ? ` until ${until}` : ""}`, commits: [], files: [], note: "no commits in that window" };
    from = `${commits[commits.length - 1].sha}^`;
    if (until) to = commits[0].sha;
    // The first commit of a repository has no parent.
    if ((await git.run("rev-parse", "--verify", "--quiet", from)).code !== 0) from = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"; // git's empty tree
  }
  const d = await git.diff({ from, to, mergeBase: branchOnly, path });
  return { range: `${from}${branchOnly ? "..." : ".."}${to}`, commits: commits.map(brief), commitCount: commits.length, files: d.files.slice(0, 200), fileCount: d.files.length, byFolder: fold(d.files), added: d.added, deleted: d.deleted };
}
