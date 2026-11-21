export const meta = {
  purpose:
    "Find a commit you can only describe: by words in its message, by text it added or removed, by a file it touched, by author or by date, across every branch. With lost: true it also searches commits that no branch holds any more (after a reset, a rebase or a deleted branch) through the reflog and unreachable objects.",
  params: {
    message: "regex on the commit message, optional",
    text: "exact text the commit added or removed, optional",
    path: "a file or folder it touched, optional",
    author: "author name or email, optional",
    since: "optional",
    until: "optional",
    lost: "also search commits no branch holds, default false",
    max: "default 20",
  },
  returns: "{commits:[{short, author, date, subject, branches, pushed}], lost?:[{short, date, subject, from}]}",
  example: 'await scripts.run("find-commit", { message: "nested repo binding", since: "2 weeks ago" })',
};

export default async function ({ git }, { message, text, path, author, since, until, lost = false, max = 20 } = {}) {
  if (!message && !text && !path && !author && !since && !lost) throw new Error("give at least one of message, text, path, author, since, lost");
  const found = await git.log({ all: true, grep: message, added: text, path, author, since, until, max });
  const commits = [];
  for (const c of found) {
    const on = await git.contains(c.sha);
    commits.push({ short: c.short, author: c.author, date: c.date, subject: c.subject, branches: on.branches.slice(0, 8), pushed: on.remoteBranches.length > 0, tags: on.tags.slice(0, 3) });
  }
  const out = { commits };
  if (lost) {
    const seen = new Set(found.map((c) => c.sha));
    const rows = [];
    const re = message ? new RegExp(message, "i") : null;
    const consider = async (sha, from) => {
      if (rows.length >= max) return;
      const full = (await git.run("rev-parse", "--verify", "--quiet", `${sha}^{commit}`)).out.trim();
      if (!full || seen.has(full)) return;
      seen.add(full);
      const on = await git.contains(full);
      if (on.branches.length || on.remoteBranches.length || on.tags.length) return;
      const c = await git.show(full);
      if (re && !re.test(c.message)) return;
      if (path && !c.files.some((f) => f.path.startsWith(path))) return;
      rows.push({ short: c.short, date: c.date, author: c.author, subject: c.subject, from, files: c.files.slice(0, 8).map((f) => f.path) });
    };
    for (const r of await git.reflog("HEAD", { max: 300 })) await consider(r.sha, `reflog ${r.ref}: ${r.action}`.slice(0, 120));
    const fsck = await git.run("fsck", "--no-reflogs", "--unreachable", "--no-progress");
    for (const l of fsck.out.split("\n")) {
      const m = l.match(/^unreachable commit ([0-9a-f]{40})/);
      if (m) await consider(m[1], "unreachable (no branch, no reflog entry)");
    }
    for (const s of await git.stashes()) rows.push({ short: s.ref, date: s.date, subject: s.subject, from: "stash" });
    out.lost = rows;
    out.note = "a lost commit is brought back with `git branch <name> <sha>` (needs act: true)";
  }
  return out;
}
