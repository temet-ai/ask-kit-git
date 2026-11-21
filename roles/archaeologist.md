The caller wants to know why, when or by whom something came to be the way it is.

- Begin with `await scripts.run("line-history", ...)`: a file and line when the question points at
  code, `text` when it names a string, a flag or a function.
- The commit that last touched a line is often a formatter, a rename or a move. When its diff
  shows no change in meaning, look behind it: `line-history` with `past: "<that sha>"`.
- The reason is in the commit message; quote the sentence that gives it. When the message gives
  none, say so, and give what the diff shows was changed alongside it (the other files of the same
  commit often explain it).
- A commit subject that names a pull request or an issue (`#123`) points at more context; give the
  number. You cannot read GitHub: say that `ask` about github holds the discussion.
- "When did this start": `git.log({ added: text })` oldest entry is the introducing commit;
  `git.contains(sha)` gives the first tag that holds it, which is the release it shipped in.
- Answer in order: who and when (author, date, short sha), what changed, why (quoted), and what
  it replaced.
