# brain-kit

A markdown knowledge base, a CLI to manage it, and skills that teach agent CLIs
how to use it.

Every agent session forgets. The vault is where each session writes findings
back so the next one starts where this one ended.

## Two containers

```
docs/     durable. How something works. True in six months.
work/     one file per thing in flight, plus todo.md for one-liners.
```

One question decides where anything goes:

> **Will this still be true in six months regardless of what ships?**
> Yes → `docs/`. No → `work/`.

There are no issue IDs, no projects, no kanban, and no status fields. A work
item is a file that stops mattering, not a record that must be closed —
finishing is `brain done <name>`, which moves it to `archive/`.

Priority is the order of lines in `work/todo.md`. You reorder by editing a file
you already have open, and unlike a board it cannot drift out of sync with
reality, because it *is* the reality.

## Install

```bash
npm i -g github:DOOduneye/brain-kit
brain-kit init
```

`init` asks where to put the vault and what to call it, copies the skeleton,
`npm link`s the `brain` CLI so it runs from anywhere, and installs the skills
into whichever agent CLI you use.

## Layout

```
~/Documents/dev/            # the vault
├── bin/brain.mjs           # the CLI (run as `brain`)
├── AGENTS.md               # entry point for any agent CLI
├── docs/                   # durable knowledge
├── work/                   # in flight, plus todo.md
├── archive/                # finished work
├── journal/                # your notes
├── sessions/               # agent logs and handoffs
└── raw/                    # clippings, input to /compile
```

## Using `brain`

```bash
brain work                     # what's in flight — start here
brain done <name>              # archive a finished work file

brain read <path>              # print an article
brain write <path> <text>      # write or overwrite
brain find <pattern>           # find by filename
brain recent [n]               # most recently modified

brain search <query>           # full-text (qmd BM25)
brain query <query>            # hybrid — BM25 + vectors + rerank

brain log "<finding>"          # agent findings
brain note "<thought>"         # your journal

brain handoff [topic]          # end of session
brain pickup [id]              # start of the next one
```

Full surface: `brain --help`.

## Agent CLI support

| Tool | What gets installed | Where |
|---|---|---|
| Claude Code | `SKILL.md` files + `/wrap` and `/pickup` | `~/.claude/skills/`, `~/.claude/commands/` |
| Pi | `SKILL.md` files (same format) | `~/.pi/agent/skills/` |
| Codex | skill content spliced into AGENTS.md | vault root, optionally `~/.codex/AGENTS.md` |
| `none` | nothing — wire up your own agent context | — |

Pick one or several: `brain-kit init --target claude-code,codex,pi`.

The vault always gets an `AGENTS.md` at its root regardless of target. That is
the cross-tool entry point — Claude Code, Codex, Cursor, Continue and others
read it.

## The skills

- **brain-dev** — the workflow. Where things go, how to think in mechanisms,
  and how *not* to let the vault leak into how you talk.
- **compile** — turn raw sources into articles. Two-step: extract, then write.
  Never single-pass.
- **wrap** — end-of-session handoff, picked up by `/pickup`.

## Configuration

`package.json` at the vault root, which only carries the vault name — it drives
the `obsidian://` URIs so a renamed folder still produces working links.

```json
{ "name": "dev" }
```

## Updating

Pull new skill versions into an existing vault:

```bash
brain-kit install --vault ~/Documents/dev --target claude-code --force
```

Update the `brain` CLI itself:

```bash
cp $(npm root -g)/brain-kit/kb-skeleton/bin/brain.mjs ~/Documents/dev/bin/brain.mjs
```

## The split

Three layers on purpose:

- **brain CLI** — pure Node, knows nothing about any agent
- **skills** — teach an agent the workflow, know nothing about the CLI's internals
- **vault** — plain markdown, readable and editable without either

Any one of them can be replaced without touching the other two. The vault
outlives the tooling.
