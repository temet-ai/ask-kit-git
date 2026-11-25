export const meta = {
  purpose:
    "Who changed a line or a piece of text, in which commit and why. Give a file with a line (or a range) for the commits that last touched those lines, or `text` for every commit that added or removed that exact text anywhere (or in `file`). Each commit comes with its full message.",
  params: {
    repo: "another repository or worktree to look at, optional (default: the caller's)",
    file: "path of the file, optional when text is given",
    line: "line number, optional",
    to: "last line of a range, optional",
    text: "exact text whose adding and removing commits you want, optional",
    past: "a sha to look behind: blame as of the commit before it, to get past a formatting or move commit, optional",
    max: "how many commits for a text search, default 15",
  },
  returns: "{lines?:[{line, sha, author, date, summary, text}], commits:[{short, author, date, subject, message, files}]}",
  example: 'await scripts.run("line-history", { file: "src/router.mjs", line: 120, to: 128 })',
};

export default async function ({ git }, { repo, file, line, to, text, past, max = 15 } = {}) {
  if (repo) git = git.at(repo);
  if (!file && !text) throw new Error("give a file (with a line) or text");
  const out = {};
  let shas = [];
  if (file && line) {
    out.lines = await git.blame(file, { from: line, to: to ?? line, rev: past ? `${past}^` : undefined, ignoreWhitespace: true });
    shas = [...new Set(out.lines.filter((l) => !l.uncommitted).map((l) => l.sha))];
    if (out.lines.some((l) => l.uncommitted)) out.note = "some of these lines are changed in the work tree and not committed yet";
  } else if (text) {
    shas = (await git.log({ added: text, path: file, max, all: !file })).map((c) => c.short);
    if (!shas.length) out.note = `no commit adds or removes ${JSON.stringify(text)}${file ? ` in ${file}` : ""}; it may only have moved within a line (try git.log({ matching: ... })) or never been committed`;
  } else {
    shas = (await git.log({ path: file, follow: true, max })).map((c) => c.short);
  }
  out.commits = [];
  for (const sha of shas.slice(0, max)) {
    const c = await git.show(sha);
    out.commits.push({ short: c.short, author: c.author, date: c.date, subject: c.subject, message: c.message.slice(0, 1500), files: c.files.slice(0, 15).map((f) => f.path), fileCount: c.files.length });
  }
  return out;
}
