import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// The kit's top-level `patterns` claim a question with no router model. Parse them from the
// manifest (the host does the same) and check what they claim and what they leave alone.
const toml = fs.readFileSync(fileURLToPath(new URL("../ask-kit.toml", import.meta.url)), "utf8");
const block = toml.match(/^patterns = \[([\s\S]*?)^\]/m)[1];
const patterns = [...block.matchAll(/^\s*"((?:[^"\\]|\\.)*)",?$/gm)].map((m) => new RegExp(JSON.parse(`"${m[1]}"`), "i"));
assert.ok(patterns.length >= 4);
const claims = (q) => patterns.some((re) => re.test(q));

for (const q of [
  "which commit changed the retry timeout, and why?",
  "Which commit last changed the members line of Cargo.toml?",
  "which commit removed the TOLL_DENIED list?",
  "In bench/fixtures/discworld, was the branch fix/library-index merged, and by which commit?",
  "Which worktrees does the repository have, and is any of them locked?",
  "what changed between v0.1.0 and v0.2.0?",
  "is anything uncommitted or unpushed?",
]) assert.ok(claims(q), `git should claim: ${q}`);

for (const q of [
  "In bench/fixtures/ankh the TOLL_DENIED list is gone from the code. Which commit removed it, and which docs still name it?",
  "In this project, take the most recently merged merge request. Which commit merged it, and who merged it?",
  "which commit merged pull request 42?",
  "which commit fixed the failing CI run?",
  "which commit did the last session make?",
  "which commit",
  "where is the router defined?",
]) assert.ok(!claims(q), `git should leave: ${q}`);

console.log("ok: git patterns claim plain git questions and leave docs, merge request, CI and session ones");
