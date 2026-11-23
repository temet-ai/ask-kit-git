import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { makeGit } from "../git.mjs";
import status from "../scripts/branch-status.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "watch-git-"));
const repo = path.join(tmp, "watch");
try {
  fs.mkdirSync(repo);
  const run = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  run("init", "-b", "main");
  run("config", "user.name", "Sam Vimes");
  run("config", "user.email", "vimes@example.com");
  run("commit", "--allow-empty", "-m", "Start the watch");
  run("branch", "watch/lanterns");
  const git = makeGit({ cwd: tmp });
  const result = await status({ git }, { path: repo, branch: "watch/lanterns", base: "main", fetch: false });
  assert.equal(result.branch, "watch/lanterns");
  assert.equal(result.merged, "yes");
  assert.equal(result.sha, run("rev-parse", "--short", "watch/lanterns").trim());
  assert.equal(git.cwd, tmp);
  const fallback = await status({ git: git.at(repo) }, { branch: "watch/lanterns", base: "main", fetch: false });
  assert.deepEqual(result, fallback);
  const missing = await status({ git }, { path: repo, branch: "watch/missing", fetch: false });
  assert.equal(missing.exists, false);
  console.log("ok: branch-status selects the requested repository and preserves its caller");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
