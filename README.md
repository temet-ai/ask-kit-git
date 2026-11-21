# ask-kit-git

An [ask-kit](https://github.com/temet-ai/ask-kit) kit that lets your coding agent's `ask` tool
answer questions about the local git repository, and commit, push and tidy when asked. A cheap
model runs `git` outside your agent's context and answers with short shas, branch names and
`path:line`.

Questions from its bench, of the kinds agents had answered by hand with `git`:

- Was the branch fix/library-index merged, and by which commit?
- Which commit last changed line 1 of Cargo.toml, and what did that commit add?
- Which worktrees does this repository have, and is any of them locked? Why?

## Install

You need [ask-kit](https://github.com/temet-ai/ask-kit#set-it-up) and `git`.

Paste this into your agent:

```
Read ~/.config/ask-kit/AGENTS.md, then add this kit: github.com/temet-ai/ask-kit-git
```

Or run it yourself:

```sh
ask-kit kit install temet-ai/ask-kit-git        # shows what it reads, changes and runs
ask-kit kit install temet-ai/ask-kit-git --yes  # installs and enables it
```

Restart your agents so `ask` lists `git`. The kit answers about the repository your agent works
in; a question that names another folder is answered there.

## What it carries

| | |
|---|---|
| Scripts | `state` (where the repository and every worktree stand), `branch-status` (merged? pushed? also by squash or rebase), `line-history` (who changed a line or a text, and why), `changes` (between two refs, in a time window, or uncommitted), `find-commit` (by message, text, path; also commits no branch holds), `cleanup` (merged branches, gone upstreams, stale worktrees, old stashes) |
| Skills | `commit`, `conflicts`, `recover`, `rewrite-history`, `worktrees`: playbooks the investigator loads when the job calls for one |
| Roles | `committer` for requests to stage, commit or push; `archaeologist` for why, when and who |

Each script also runs with no model: `ask-kit run git state`, or `ask(do: "git.state")` from an
agent.

## What it can change

When the request asks for a change, it stages, commits, pushes, pulls, merges, rebases, stashes,
and creates or removes branches, tags and worktrees. A question never changes anything: `git.mjs`
sorts every git call into reading or changing, and a changing call is refused unless the caller
asked for a change (`act`). `fetch` counts as reading, because "is it pushed" is wrong without it.

`git.mjs` also checks each command before it runs:

- What prints credentials is refused: `config --list`, credential and token config keys,
  `git credential`. A password or token inside a remote URL is masked in all output. What the
  investigator reads goes to a model.
- What waits for a person is refused: `-i`, `--patch`, `mergetool`, `gui`. An editor never opens,
  so commits take `-m`.
- In a question (no `act`), options that run a program or write a file are refused: `-c`,
  `--output`, `--ext-diff`, `--exec`.

Its instructions tell it never to force-push, `reset --hard`, `clean`, delete an unmerged branch
or drop a stash unless the request asks for that outcome, and to leave files it was not asked
about unstaged.

## How well it works

`bench/questions.json` holds six questions and one script run (run `bench/make-fixture.sh` first to build the repository they ask about), each with patterns its answer
must hold. It has not been run on a model yet; `ask-kit kit test git` runs it.
