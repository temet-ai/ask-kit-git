# Recipe: git kit

## What it answers

The state and history of a local git repository: what is uncommitted, whether a branch is merged
or pushed, what changed between two points, who changed a line and why, which worktrees, branches
and stashes exist, where lost commits went. It changes things when asked: stage, commit, push,
pull, merge, rebase, stash, branch, tag, worktree.

## What it needs

- `git` on PATH. Every call runs with the user's rights and the user's git credentials.
- Nothing else: no keys, no build step.

## What it reads and runs

- Runs `git` (no shell) through `git.mjs`, in the folder the calling agent works in, or in a
  folder the question names (`git.at(path)`).
- Refuses a call that changes the repository or a remote unless the ask may act; refuses what
  prints credentials and what waits for a person; masks URL passwords in output.

## Rebuild it from an empty folder

Write `ask-kit.toml` with one `module` source named `git`, a `GIT_ROOT` setting detected by
`git rev-parse --show-toplevel`, `state_key = "${GIT_ROOT}"`, and `acts` written as prose (the
host cannot tell `git stash list` from `git stash`, so the module does the holding back). The
module exports `make({settings, push, cwd, act})` returning a client with `run(...args)` and
`text(...args)` (every call classified as reading or changing; changing throws without `act`),
`at(dir)`, `repo()`, `status()` (porcelain v2 parsed, plus the operation in progress), `log(o)`,
`show(rev, o)`, `diff(o)`, `blame(file, o)`, `branches(o)`, `worktrees()`, `stashes()`,
`contains(rev)` and `reflog(ref)`. Run git with `GIT_EDITOR=true`, `GIT_TERMINAL_PROMPT=0` and no
pager. Describe it exactly in `api.d.ts`.

Scripts: `state`, `branch-status` (upstream ahead and behind; merged by ancestry, or by patch with
`git cherry` and `git merge-tree` for squash merges), `line-history` (blame for lines, `-S` for
text, each commit with its message), `changes` (two refs, a time window, or the uncommitted work,
grouped by top folder), `find-commit` (all refs; with `lost`, the reflog and `fsck --unreachable`),
`cleanup` (lists only).

Skills in `skills/`: commit, conflicts, recover, rewrite-history, worktrees. Roles in `roles/`:
committer, archaeologist. `instructions.md`: start from a script, fetch before answering about
the remote, answer in the folder the question names, act only as wide as the request, never guess
a sha.

## Bench

`bench/questions.json`: five questions of the kinds agents answer by hand with git, put to the repository
that `bench/make-fixture.sh` builds, and one script run.
