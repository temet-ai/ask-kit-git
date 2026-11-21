interface GitResult { code: number; out: string; err: string; timedOut?: boolean }
interface Commit { sha: string; short: string; author: string; email: string; date: string; committed: string; parents: string[]; refs: string | null; subject: string; files?: { path: string; added: number | null; deleted: number | null }[] }
interface FileChange { path: string; added: number | null; deleted: number | null; change: string; from?: string } // change: A added, M modified, D deleted, R renamed

declare const git: {
  cwd: string;  // the folder git runs in: the repository the calling agent works in
  act: boolean; // true when this ask may change things

  // Any git subcommand, no shell: pass each argument separately. git.run("log", "--oneline", "-5"),
  // git.run("merge-tree", "--write-tree", "main", "feature") (would a merge conflict, without touching the work tree),
  // git.run("fetch", "--prune") (allowed in every ask: it only updates remote-tracking refs).
  // Never throws on a non-zero exit. It throws for:
  //  - a command that changes the repository or a remote (commit, push, checkout, stash push, branch -d, worktree add ...) when git.act is false;
  //  - what waits for a person: -i/--interactive, -p/--patch, mergetool, gui. An editor never opens (GIT_EDITOR=true): pass -m, or --no-edit;
  //  - what prints credentials: `config --list`, a credential or token config key, `credential`. URL passwords in any output are masked.
  run(...args: string[]): Promise<GitResult>;
  // As run, but returns stdout (trailing newlines removed) and throws git's own error on a non-zero exit.
  text(...args: string[]): Promise<string>;

  // The same client for another repository or worktree. A question that names another repository or path is answered there:
  // const other = git.at("../my-app"); await other.status()
  at(dir: string): typeof git;

  // root is the top folder; for a linked worktree, mainCheckout is the repository it belongs to. remotes: {origin: url}.
  repo(): Promise<{ root: string; gitDir: string; linkedWorktree: boolean; mainCheckout: string; remotes: Record<string, string>; head: string | null }>;

  // Where the work tree stands. change letters: M modified, A added, D deleted, R renamed. operation: "rebase" | "merge" | "cherry-pick" | "revert" | "bisect" | null.
  // ahead/behind compare with the upstream as last fetched: run git.run("fetch") first when the answer depends on the remote.
  status(): Promise<{ branch: string | null; detached: boolean; head: string; upstream: string | null; ahead: number; behind: number;
    staged: { file: string; change: string }[]; changed: { file: string; change: string }[]; untracked: string[]; conflicted: string[];
    operation: string | null; stashes: number; clean: boolean }>;

  // Commits, newest first. range: "main..HEAD", a branch, a sha. path: a file or folder (follow: true tracks one file across renames).
  // grep: regex on the message. added: commits that add or remove this exact text (-S). matching: commits whose diff matches this regex (-G).
  // since/until: "3 days ago", "2026-11-18". all: every ref, not only HEAD. stat: adds files with line counts. max: default 30.
  log(o?: { range?: string; path?: string | string[]; follow?: boolean; author?: string; since?: string; until?: string; grep?: string;
    added?: string; matching?: string; merges?: boolean; all?: boolean; stat?: boolean; max?: number }): Promise<Commit[]>;

  // One commit with its full message and files. patch: true adds the diff (cut at max characters, default 20000; path narrows it).
  show(rev?: string, o?: { patch?: boolean; path?: string | string[]; max?: number }): Promise<Commit & { message: string; files: FileChange[]; patch?: string }>;

  // What differs. Neither from nor to: the work tree against the index (unstaged). staged: the index against HEAD.
  // from alone: that ref against the work tree. from and to: between them; mergeBase: true gives what `to` added since it left `from` (a branch's own changes).
  diff(o?: { from?: string; to?: string; staged?: boolean; mergeBase?: boolean; path?: string | string[]; patch?: boolean; max?: number }):
    Promise<{ files: FileChange[]; added: number; deleted: number; patch?: string }>;

  // Who last changed each line. from/to: line numbers. rev: as of a commit ("abc123^" looks past a commit). uncommitted: true for a line not yet committed.
  blame(file: string, o?: { from?: number; to?: number; rev?: string; ignoreWhitespace?: boolean }):
    Promise<{ line: number; sha: string; author: string; date: string; summary: string; text: string; uncommitted?: true }[]>;

  // Branches, most recently committed first. gone: its upstream was deleted (usually merged and removed on the remote). worktree: the checkout holding it.
  // remote: true lists remote-tracking branches. merged/unmerged: only those merged or not into that ref. contains: only those holding that commit.
  branches(o?: { remote?: boolean; merged?: string; unmerged?: string; contains?: string }):
    Promise<{ name: string; sha: string; date: string; subject: string; upstream: string | null; ahead: number; behind: number; gone: boolean; current: boolean; worktree: string | null }[]>;

  // Every checkout of the repository. exists: false means the folder is gone (moved or deleted); prunable gives git's reason.
  worktrees(): Promise<{ path: string; branch: string | null; sha: string; detached: boolean; locked: string | true | null; prunable: string | true | null; main: boolean; exists: boolean }[]>;

  stashes(): Promise<{ ref: string; date: string; subject: string; branch: string | null; files?: number }[]>;

  // Which branches and tags hold a commit. remoteBranches empty means it was never pushed (as of the last fetch).
  contains(rev: string): Promise<{ sha: string; branches: string[]; remoteBranches: string[]; tags: string[] }>;

  // Past positions of HEAD or a branch, newest first: where a reset, rebase or checkout left a commit behind.
  reflog(ref?: string, o?: { max?: number }): Promise<{ ref: string; sha: string; date: string; action: string }[]>;
};
