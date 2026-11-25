import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { makeGit } from "../git.mjs";
import changes from "../scripts/changes.mjs";
import findCommit from "../scripts/find-commit.mjs";
import lineHistory from "../scripts/line-history.mjs";
import state from "../scripts/state.mjs";

// The caller works in a folder that is not a repository; the question names the repository.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "watch-git-"));
const repo = path.join(tmp, "ankh");
try {
  fs.mkdirSync(repo);
  const run = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  run("init", "-b", "main");
  run("config", "user.name", "Sam Vimes");
  run("config", "user.email", "vimes@example.com");
  fs.writeFileSync(path.join(repo, "watch.txt"), "lanterns\n");
  run("add", ".");
  run("commit", "-m", "Light the lanterns");
  run("tag", "v0.1.0");
  fs.writeFileSync(path.join(repo, "watch.txt"), "lanterns\nrattle\n");
  run("commit", "-am", "Add the rattle");
  const git = makeGit({ cwd: tmp });
  const ctx = { git };

  const c = await changes(ctx, { repo, from: "v0.1.0" });
  assert.equal(c.commitCount, 1);
  assert.equal(c.commits[0].subject, "Add the rattle");

  const f = await findCommit(ctx, { repo, text: "rattle" });
  assert.equal(f.commits[0].subject, "Add the rattle");

  const l = await lineHistory(ctx, { repo, file: "watch.txt", line: 1 });
  assert.equal(l.commits[0].subject, "Light the lanterns");

  const s = await state(ctx, { path: repo });
  assert.equal(s.latestTag, "v0.1.0");
  assert.equal(s.commitsSinceTag, 1);

  // Without `repo` the caller's folder is used, and it is not a repository.
  await assert.rejects(() => findCommit(ctx, { text: "rattle" }));
  console.log("ok: changes, find-commit and line-history take repo; state reports the latest tag");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
