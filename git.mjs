// A client for a local git repository through the `git` command: state, history, blame, branches,
// worktrees, stashes, and any other git subcommand. It reads and, when the caller asked for a
// change, acts (stage, commit, push, merge, rebase, stash, branch, worktree): whatever git can do
// for the user.
//
// Three checks. A call that changes the repository or a remote needs `act` (the caller asked for a
// change); answers go to a cloud model, so output never carries a credential (URL passwords are
// masked, credential helpers and secret config keys are refused); and commands that wait for a
// person (an editor, a prompt, a GUI) are refused, because they never end here.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const deny = (why) => {
  throw new Error(`not allowed: ${why}`);
};
const notInThisAsk = (what) => {
  throw new Error(`not in this ask: ${what} changes things, and the caller did not ask for a change (act: true), so nothing was done. Answer what you can, and say that this needs \`ask\` with act: true. Do not look for another way to do it.`);
};

// Subcommands that only read. `fetch` is here: it updates remote-tracking refs only, and "is it
// pushed" is wrong without it. `merge-tree` computes a merge without touching the work tree.
const READS = new Set([
  "status", "log", "show", "diff", "blame", "annotate", "rev-parse", "rev-list", "ls-files", "ls-tree", "ls-remote", "cat-file", "describe", "shortlog",
  "merge-base", "name-rev", "for-each-ref", "show-ref", "show-branch", "grep", "whatchanged", "range-diff", "cherry", "count-objects", "fsck", "check-ignore",
  "check-attr", "diff-tree", "diff-index", "diff-files", "var", "version", "help", "verify-commit", "verify-tag", "fetch", "merge-tree", "patch-id", "check-ref-format",
]);
const WAITS = new Set(["gui", "citool", "gitk", "instaweb", "difftool", "mergetool", "daemon", "credential", "credential-cache", "credential-store", "send-email", "web--browse"]);
const SECRET_KEY = /credential|token|passw|secret|\.key$|extraheader|proxy/i;
// Options that take their value as the next argument, before the subcommand.
const GLOBAL_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env", "--super-prefix"]);

const flag = (rest, ...names) => rest.some((x) => names.some((n) => x === n || x.startsWith(n + "=")));
const positional = (rest) => rest.filter((x) => !x.startsWith("-"));

/** Does `git <sub> <rest>` change the repository or a remote? */
function changes(sub, rest) {
  if (READS.has(sub)) return false;
  const pos = positional(rest);
  switch (sub) {
    case "branch":
      if (flag(rest, "-d", "-D", "--delete", "-m", "-M", "--move", "-c", "-C", "--copy", "-u", "--set-upstream-to", "--unset-upstream", "--edit-description", "-f", "--force")) return true;
      return pos.length > 0 && !flag(rest, "-l", "--list", "--contains", "--no-contains", "--merged", "--no-merged", "--points-at", "--show-current");
    case "tag":
      if (flag(rest, "-d", "--delete", "-a", "-s", "-m", "-F", "-f", "--force", "-u")) return true;
      return pos.length > 0 && !flag(rest, "-l", "--list", "-n", "--contains", "--no-contains", "--merged", "--no-merged", "--points-at", "-v", "--verify");
    case "stash":
      return !["list", "show"].includes(pos[0]);
    case "worktree":
      return pos[0] !== "list";
    case "remote":
      return pos.length > 0 && !["show", "get-url"].includes(pos[0]);
    case "config":
      if (flag(rest, "--unset", "--unset-all", "--add", "--replace-all", "--rename-section", "--remove-section", "-e", "--edit")) return true;
      if (["set", "unset", "rename-section", "remove-section", "edit"].includes(pos[0])) return true;
      if (["get", "list", "get-all", "get-regexp"].includes(pos[0]) || flag(rest, "--get", "--get-all", "--get-regexp", "-l", "--list", "--get-urlmatch")) return false;
      return pos.length > 1;
    case "reflog":
      return ["expire", "delete", "drop"].includes(pos[0]);
    case "notes":
      return pos.length > 0 && !["list", "show"].includes(pos[0]);
    case "symbolic-ref":
      return pos.length > 1 || flag(rest, "-d", "--delete");
    case "submodule":
      return pos.length > 0 && !["status", "summary"].includes(pos[0]);
    case "sparse-checkout":
      return pos[0] !== "list";
    case "bisect":
      return !["log", "view"].includes(pos[0]);
    case "lfs":
      return !["ls-files", "status", "env", "version", "track"].includes(pos[0]) || (pos[0] === "track" && pos.length > 1);
    case "maintenance":
      return true;
    default:
      return true;
  }
}

/** Split a git argument list into its global options, subcommand and the rest. */
function split(a) {
  let i = 0;
  for (; i < a.length; i++) {
    if (GLOBAL_VALUE.has(a[i])) i++;
    else if (!a[i].startsWith("-")) break;
  }
  return { globals: a.slice(0, i), sub: a[i] ?? "", rest: a.slice(i + 1) };
}

function check(args, act) {
  const a = args.map(String);
  const { globals, sub, rest } = split(a);
  if (!sub) deny("no git subcommand");
  if (WAITS.has(sub)) deny(`git ${sub} waits for a person or prints credentials`);
  if (flag(rest, "-i", "--interactive") && ["rebase", "add", "clean", "stash", "checkout", "reset", "restore", "commit"].includes(sub)) deny("interactive mode waits for a person; give the exact paths, commits or message instead");
  if (flag(rest, "-p", "--patch") && ["add", "checkout", "reset", "stash", "restore", "commit"].includes(sub)) deny("--patch waits for a person; stage whole paths, or apply a prepared patch with `git apply --cached`");
  if (sub === "config") {
    if (flag(rest, "-l", "--list", "--get-regexp", "--show-origin") || positional(rest)[0] === "list") deny("listing all config can print credentials; read one key: git.run(\"config\", \"--get\", \"user.email\")");
    if (positional(rest).some((k) => SECRET_KEY.test(k))) deny("that config key can hold a credential");
  }
  if (sub === "var" && rest.some((x) => /ASKPASS|EDITOR/.test(x))) deny("not a repository fact");
  const changing = changes(sub, rest);
  if (!act) {
    if (changing) notInThisAsk(`git ${[sub, ...rest].join(" ").slice(0, 80)}`);
    // Ways a reading command can still run a program or write a file.
    if (globals.includes("-c") || globals.includes("--config-env") || globals.includes("--exec-path")) notInThisAsk("git -c (it can set a command to run)");
    if (flag(rest, "--output", "--ext-diff", "--exec", "--upload-pack", "--receive-pack", "--open-files-in-pager", "-O", "--textconv")) notInThisAsk(`an option of git ${sub} that writes a file or runs a program`);
  }
  return { a, sub, changing };
}

// user:password@ and token@ in a URL, and bearer headers, never reach the model.
const mask = (s) => String(s ?? "").replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi, "$1***@").replace(/(authorization:\s*)(bearer|basic)\s+\S+/gi, "$1$2 ***");

const ENV = {
  GIT_PAGER: "cat", PAGER: "cat", GIT_TERMINAL_PROMPT: "0", GIT_EDITOR: "true", GIT_SEQUENCE_EDITOR: "true", GIT_MERGE_AUTOEDIT: "no",
  GIT_ASKPASS: "true", SSH_ASKPASS: "true", GCM_INTERACTIVE: "never", GIT_OPTIONAL_LOCKS: "0", NO_COLOR: "1", LC_ALL: "C",
};

function exec(args, { cwd, timeoutMs = 120_000, input } = {}) {
  return new Promise((resolve) => {
    const child = execFile("git", ["--no-pager", "-c", "color.ui=false", "-c", "core.quotepath=false", ...args], { cwd, timeout: timeoutMs, maxBuffer: 64 << 20, encoding: "utf8", env: { ...process.env, ...ENV } }, (err, stdout, stderr) => {
      if (err?.code === "ENOENT") resolve({ code: 127, out: "", err: "git is not installed" });
      else resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: mask(stdout), err: mask(stderr).slice(0, 4000), ...(err?.killed ? { timedOut: true } : {}) });
    });
    if (input != null) child.stdin.end(input);
  });
}

// The kit's module source: make(ctx) returns the `git` global, for the repository the caller works in.
export function make({ settings, push, cwd, act }) {
  const start = settings?.GIT_ROOT || cwd || process.cwd();
  return makeGit({ cwd: start, push, act: !!act });
}

const SEP = "\x1f";
const REC = "\x1e";
const LOG_FORMAT = ["%H", "%h", "%an", "%ae", "%aI", "%cI", "%P", "%D", "%s"].join(SEP) + REC;

export function makeGit({ cwd, push = () => {}, act = false }) {
  const run = async (...args) => {
    const { a } = check(args, act);
    const started = Date.now();
    const r = await exec(a, { cwd });
    push({ kind: "git", detail: `git ${a.join(" ")}`.slice(0, 200), ms: Date.now() - started, code: r.code, size: r.out.length });
    return r;
  };
  const text = async (...args) => {
    const r = await run(...args);
    if (r.code !== 0) throw new Error(`git ${args.slice(0, 4).join(" ")}: ${(r.err || r.out).trim().slice(0, 500)}`);
    return r.out.replace(/\n+$/, "");
  };
  const tryText = async (...args) => {
    const r = await run(...args);
    return r.code === 0 ? r.out.replace(/\n+$/, "") : null;
  };
  const lines = (s) => (s ? s.split("\n").filter(Boolean) : []);

  const parseLog = (out) =>
    out.split(REC).map((x) => x.replace(/^\n+/, "")).filter(Boolean).map((rec) => {
      const [head, ...tail] = rec.split("\n");
      const [sha, short, author, email, date, committed, parents, refs, subject] = head.split(SEP);
      const row = { sha, short, author, email, date, committed, parents: parents ? parents.split(" ") : [], refs: refs || null, subject };
      const files = tail.filter(Boolean).map((l) => {
        const m = l.match(/^(-|\d+)\t(-|\d+)\t(.+)$/);
        return m ? { path: m[3], added: m[1] === "-" ? null : +m[1], deleted: m[2] === "-" ? null : +m[2] } : null;
      }).filter(Boolean);
      if (files.length) row.files = files;
      return row;
    });

  const api = {
    /** The folder git runs in. */
    cwd,
    /** True when this ask may change things. */
    act,

    /** Any git subcommand (no shell: pass each argument separately). {code, out, err}; never throws on a non-zero exit, only on a refusal. */
    run,
    /** As run, but returns stdout and throws git's own error on a non-zero exit. */
    text,

    /** The same client for another repository or worktree: git.at("../my-app"). A relative path is taken from this one. */
    at(dir) {
      const p = path.resolve(cwd, String(dir).replace(/^~(?=\/|$)/, process.env.HOME ?? "~"));
      if (!fs.existsSync(p)) throw new Error(`no such folder: ${p}`);
      return makeGit({ cwd: p, push, act });
    },

    /** The repository's top folder, its .git folder, the main checkout when this is a linked worktree, and its remotes. */
    async repo() {
      const root = await text("rev-parse", "--show-toplevel");
      const common = path.resolve(cwd, await text("rev-parse", "--git-common-dir"));
      const gitDir = path.resolve(cwd, await text("rev-parse", "--git-dir"));
      const remotes = {};
      for (const l of lines(await text("remote", "-v"))) {
        const m = l.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
        if (m && m[3] === "fetch") remotes[m[1]] = m[2];
      }
      return { root, gitDir, linkedWorktree: gitDir !== common, mainCheckout: gitDir !== common ? path.dirname(common) : root, remotes, head: await tryText("rev-parse", "--short", "HEAD") };
    },

    /**
     * Where the work tree stands: branch, upstream with ahead and behind, the files staged, changed, untracked and in conflict,
     * an operation in progress (rebase, merge, cherry-pick, revert, bisect) and the number of stashes.
     */
    async status() {
      const out = await text("status", "--porcelain=v2", "--branch", "--untracked-files=all");
      const s = { branch: null, head: null, upstream: null, ahead: 0, behind: 0, staged: [], changed: [], untracked: [], conflicted: [] };
      for (const l of out.split("\n")) {
        if (l.startsWith("# branch.oid ")) s.head = l.slice(13, 25);
        else if (l.startsWith("# branch.head ")) s.branch = l.slice(14) === "(detached)" ? null : l.slice(14);
        else if (l.startsWith("# branch.upstream ")) s.upstream = l.slice(18);
        else if (l.startsWith("# branch.ab ")) {
          const m = l.match(/\+(\d+) -(\d+)/);
          if (m) [s.ahead, s.behind] = [+m[1], +m[2]];
        } else if (l.startsWith("1 ") || l.startsWith("2 ")) {
          const f = l.split(" ");
          const xy = f[1];
          const file = l.startsWith("2 ") ? f.slice(9).join(" ").split("\t")[0] : f.slice(8).join(" ");
          if (xy[0] !== ".") s.staged.push({ file, change: xy[0] });
          if (xy[1] !== ".") s.changed.push({ file, change: xy[1] });
        } else if (l.startsWith("u ")) s.conflicted.push(l.split(" ").slice(10).join(" "));
        else if (l.startsWith("? ")) s.untracked.push(l.slice(2));
      }
      s.detached = s.branch == null;
      const gitDir = path.resolve(cwd, await text("rev-parse", "--git-dir"));
      const has = (f) => fs.existsSync(path.join(gitDir, f));
      s.operation = has("rebase-merge") || has("rebase-apply") ? "rebase" : has("MERGE_HEAD") ? "merge" : has("CHERRY_PICK_HEAD") ? "cherry-pick" : has("REVERT_HEAD") ? "revert" : has("BISECT_LOG") ? "bisect" : null;
      s.stashes = lines(await tryText("stash", "list")).length;
      s.clean = !s.staged.length && !s.changed.length && !s.untracked.length && !s.conflicted.length;
      return s;
    },

    /**
     * Commits as rows, newest first. o: range ("main..HEAD", a branch, a sha), path (file or folder; follow: true tracks one file across renames),
     * author, since / until ("3 days ago", "2026-11-18"), grep (regex on the message), added (-S: commits that add or remove this exact text),
     * matching (-G: commits whose diff matches this regex), merges (true only merges, false none), all (every ref), stat (per-file line counts), max (default 30).
     */
    async log(o = {}) {
      const a = ["log", `--format=${LOG_FORMAT}`, `--max-count=${o.max ?? 30}`];
      if (o.all) a.push("--all");
      if (o.author) a.push(`--author=${o.author}`);
      if (o.since) a.push(`--since=${o.since}`);
      if (o.until) a.push(`--until=${o.until}`);
      if (o.grep) a.push(`--grep=${o.grep}`, "-i", "-E");
      if (o.added) a.push(`-S${o.added}`);
      if (o.matching) a.push(`-G${o.matching}`);
      if (o.merges === true) a.push("--merges");
      if (o.merges === false) a.push("--no-merges");
      if (o.stat) a.push("--numstat");
      if (o.follow && o.path) a.push("--follow");
      if (o.range) a.push(o.range);
      if (o.path) a.push("--", ...[].concat(o.path));
      return parseLog(await text(...a));
    },

    /** One commit: its row, the full message, each file with its change (A, M, D, R) and line counts, and, with patch: true, the diff (at most `max` characters, default 20000; path narrows it). */
    async show(rev = "HEAD", o = {}) {
      const [row] = parseLog(await text("show", "--no-patch", `--format=${LOG_FORMAT}`, rev));
      if (!row) throw new Error(`no such commit: ${rev}`);
      row.message = await text("show", "--no-patch", "--format=%B", rev);
      const paths = o.path ? ["--", ...[].concat(o.path)] : [];
      const status = Object.fromEntries(lines(await text("show", "--format=", "--name-status", "-M", rev, ...paths)).map((l) => {
        const f = l.split("\t");
        return [f[f.length - 1], f.length > 2 ? { change: f[0][0], from: f[1] } : { change: f[0][0] }];
      }));
      row.files = lines(await text("show", "--format=", "--numstat", "-M", rev, ...paths)).map((l) => {
        const [added, deleted, ...p] = l.split("\t");
        const file = p.join("\t").replace(/\{.* => (.*)\}/, "$1").replace(/^.* => /, "");
        return { path: file, added: added === "-" ? null : +added, deleted: deleted === "-" ? null : +deleted, ...(status[file] ?? {}) };
      });
      if (o.patch) {
        const patch = await text("show", "--format=", "-M", rev, ...paths);
        const max = o.max ?? 20000;
        row.patch = patch.length > max ? patch.slice(0, max) + `\n[cut: ${patch.length - max} more characters; narrow with path]` : patch;
      }
      return row;
    },

    /**
     * What differs. o: from and to (refs; from alone compares it with the work tree; neither compares the work tree with the index), staged (index against HEAD),
     * mergeBase (true: from...to, what `to` added since it left `from`), path, patch (include the diff text, at most max characters, default 20000).
     * Returns {files:[{path, added, deleted, change}], added, deleted, patch?}.
     */
    async diff(o = {}) {
      const range = o.from && o.to ? [o.mergeBase ? `${o.from}...${o.to}` : `${o.from}..${o.to}`] : o.from ? [o.from] : [];
      const base = ["diff", ...(o.staged ? ["--cached"] : []), "-M", ...range];
      const paths = o.path ? ["--", ...[].concat(o.path)] : [];
      const status = Object.fromEntries(lines(await text(...base, "--name-status", ...paths)).map((l) => {
        const f = l.split("\t");
        return [f[f.length - 1], f[0][0]];
      }));
      const files = lines(await text(...base, "--numstat", ...paths)).map((l) => {
        const [added, deleted, ...p] = l.split("\t");
        const file = p.join("\t").replace(/\{.* => (.*)\}/, "$1").replace(/^.* => /, "");
        return { path: file, added: added === "-" ? null : +added, deleted: deleted === "-" ? null : +deleted, change: status[file] ?? "M" };
      });
      const out = { files, added: files.reduce((n, f) => n + (f.added ?? 0), 0), deleted: files.reduce((n, f) => n + (f.deleted ?? 0), 0) };
      if (o.patch) {
        const patch = await text(...base, ...paths);
        const max = o.max ?? 20000;
        out.patch = patch.length > max ? patch.slice(0, max) + `\n[cut: ${patch.length - max} more characters; narrow with path]` : patch;
      }
      return out;
    },

    /** Who last changed each line of a file: [{line, sha, author, date, summary, text}]. o: from and to (line numbers), rev (blame as of a commit), ignoreWhitespace. */
    async blame(file, o = {}) {
      const a = ["blame", "--line-porcelain", ...(o.ignoreWhitespace ? ["-w"] : []), ...(o.from ? ["-L", `${o.from},${o.to ?? o.from}`] : []), ...(o.rev ? [o.rev] : []), "--", file];
      const rows = [];
      let cur = null;
      for (const l of (await text(...a)).split("\n")) {
        const h = l.match(/^([0-9a-f]{40}) \d+ (\d+)/);
        if (h && !cur) cur = { line: +h[2], sha: h[1].slice(0, 12) };
        else if (!cur) continue;
        else if (l.startsWith("author ")) cur.author = l.slice(7);
        else if (l.startsWith("author-time ")) cur.date = new Date(+l.slice(12) * 1000).toISOString();
        else if (l.startsWith("summary ")) cur.summary = l.slice(8);
        else if (l.startsWith("\t")) {
          cur.text = l.slice(1);
          if (/^0{12}$/.test(cur.sha)) cur.uncommitted = true;
          rows.push(cur);
          cur = null;
        }
      }
      return rows;
    },

    /**
     * Branches as rows: {name, sha, date, subject, upstream, ahead, behind, gone (its upstream was deleted), current, worktree (the checkout that has it)}.
     * o: remote (true: remote-tracking branches instead), merged / unmerged (a ref: only those merged or not merged into it), contains (a commit).
     */
    async branches(o = {}) {
      const f = ["%(refname:short)", "%(objectname:short)", "%(committerdate:iso-strict)", "%(upstream:short)", "%(upstream:track)", "%(HEAD)", "%(worktreepath)", "%(subject)"].join(SEP);
      const a = ["for-each-ref", `--format=${f}`, "--sort=-committerdate", o.remote ? "refs/remotes" : "refs/heads"];
      if (o.merged) a.push(`--merged=${o.merged}`);
      if (o.unmerged) a.push(`--no-merged=${o.unmerged}`);
      if (o.contains) a.push(`--contains=${o.contains}`);
      return lines(await text(...a)).filter((l) => !/\/HEAD\x1f/.test(l)).map((l) => {
        const [name, sha, date, upstream, track, head, worktree, subject] = l.split(SEP);
        return { name, sha, date, subject, upstream: upstream || null, ahead: +(track.match(/ahead (\d+)/)?.[1] ?? 0), behind: +(track.match(/behind (\d+)/)?.[1] ?? 0), gone: /gone/.test(track), current: head === "*", worktree: worktree || null };
      });
    },

    /** Every checkout of this repository: {path, branch, sha, detached, locked (with the reason), prunable, main, exists}. */
    async worktrees() {
      const rows = [];
      let cur = null;
      for (const l of (await text("worktree", "list", "--porcelain")).split("\n")) {
        if (l.startsWith("worktree ")) rows.push((cur = { path: l.slice(9), branch: null, sha: null, detached: false, locked: null, prunable: null, main: rows.length === 0 }));
        else if (!cur) continue;
        else if (l.startsWith("HEAD ")) cur.sha = l.slice(5, 17);
        else if (l.startsWith("branch ")) cur.branch = l.slice(7).replace(/^refs\/heads\//, "");
        else if (l === "detached") cur.detached = true;
        else if (l.startsWith("locked")) cur.locked = l.slice(7) || true;
        else if (l.startsWith("prunable")) cur.prunable = l.slice(9) || true;
      }
      for (const r of rows) r.exists = fs.existsSync(r.path);
      return rows;
    },

    /** Stashes, newest first: {ref, branch, date, subject, files}. */
    async stashes() {
      const out = await tryText("stash", "list", `--format=%gd${SEP}%cI${SEP}%gs`);
      const rows = lines(out).map((l) => {
        const [ref, date, subject] = l.split(SEP);
        return { ref, date, subject, branch: subject.match(/^(?:WIP on|On) ([^:]+):/)?.[1] ?? null };
      });
      for (const r of rows.slice(0, 20)) r.files = lines(await tryText("stash", "show", "--name-only", "--include-untracked", r.ref)).length;
      return rows;
    },

    /** The branches and tags that hold a commit, and whether it is on the remote: {sha, branches, remoteBranches, tags}. */
    async contains(rev) {
      const sha = await text("rev-parse", "--verify", `${rev}^{commit}`);
      const list = async (ns) => lines(await text("for-each-ref", "--format=%(refname:short)", `--contains=${sha}`, ns)).filter((n) => !n.endsWith("/HEAD"));
      return { sha: sha.slice(0, 12), branches: await list("refs/heads"), remoteBranches: await list("refs/remotes"), tags: await list("refs/tags") };
    },

    /** Recent positions of HEAD or a branch, newest first: {ref, sha, date, action}. For work that a reset, rebase or checkout seems to have lost. */
    async reflog(ref = "HEAD", o = {}) {
      return lines(await text("reflog", "show", `--format=%gd${SEP}%h${SEP}%cI${SEP}%gs`, `--max-count=${o.max ?? 40}`, "--date=iso", ref)).map((l) => {
        const [r, sha, date, action] = l.split(SEP);
        return { ref: r, sha, date, action };
      });
    },
  };
  return api;
}
