# brain-kit

A markdown knowledge base + a CLI to manage it + skills that teach agent CLIs how to use it.

I built it because every agent session forgets. The KB is where each session writes findings back so the next one starts where this one ended.

## Install

```bash
npm i -g github:DOOduneye/brain-kit
brain-kit init
```

Or without installing globally:

```bash
npx github:DOOduneye/brain-kit init
```

`init` will:

- ask where to put the vault, what to call it, and what your first project is called
- copy the skeleton (`library/`, `<project>/`, `sessions/`, `raw/`, etc.)
- `npm link` the `brain` CLI inside the vault so you can run it from anywhere
- install the skills into whichever agent CLI you use

Flags: `brain-kit help`.

## What it sets up

```
~/Documents/brain/             # the vault
├── bin/brain.mjs               # the CLI (run as `brain`)
├── package.json                # vault config (name, default project, prefixes)
├── AGENTS.md                   # entry point for any agent CLI
├── library/                    # durable knowledge: concepts, patterns, guides
├── <your-project>/             # issues, sub-projects, decisions
├── journal/                    # your notes
├── sessions/                   # agent logs + handoff docs
└── raw/                        # web clippings, used as input to /compile
```

## Agent CLI support

| Tool | What gets installed | Where |
|---|---|---|
| Claude Code | `SKILL.md` files + `/wrap` slash command | `~/.claude/skills/`, `~/.claude/commands/` |
| Pi | `SKILL.md` files (same format Pi uses) | `~/.pi/agent/skills/` |
| Codex | The skill content gets spliced into AGENTS.md | Vault root, and optionally `~/.codex/AGENTS.md` |
| `none` | nothing — you wire up your own agent context | — |

Pick one or several: `brain-kit init --target claude-code,codex,pi`.

The vault always gets an `AGENTS.md` at its root regardless of target. That's the cross-tool entry point — recent Claude Code, Codex, Pi, Continue, and others all read it.

The skill content is the same across targets. Source of truth lives in `skills/<name>/SKILL.md`. For Codex (no skills system) it's spliced into `AGENTS.md` between `<!-- brain-kit:start -->` markers so re-runs replace the block instead of duplicating it.

## What the skills are

Three of them:

- **brain-dev** — the workflow. Three modes: do something, draft an issue, work an existing issue. KB-first investigation, session logs, learning loop.
- **compile** — turn raw sources into library articles. Two-step: extract → write. Never single-pass.
- **wrap** — end-of-session handoff. Tidies state, writes a structured doc the next session loads with `brain resume`.

## Using `brain`

```bash
brain brief                    # what's active, what changed recently, drift warnings
brain projects                 # list projects
brain issues <project>         # active issues
brain query "<topic>"          # semantic search across the KB
brain log "<note>"             # append to today's session log
brain handoff [topic]          # write a handoff doc
brain resume [id]              # next session: load the latest handoff
```

Full surface: `brain --help`.

## Configuration

`package.json` at the vault root:

```json
{
  "name": "my-vault",
  "brainKit": {
    "defaultProject": "platform",
    "projectPrefixes": { "platform": "PL", "data-warehouse": "DW" },
    "defaultRepo": "code/my-app",
    "internsDir": ".claude-state/interns",
    "memoryPath": null
  }
}
```

Env vars override: `BRAIN_VAULT`, `BRAIN_REPO`, `BRAIN_INTERNS_DIR`, `BRAIN_MEMORY_PATH`.

## Updating

To pull new skill versions into an existing vault:

```bash
brain-kit install --vault ~/Documents/brain --target claude-code --force
```

To update the `brain` CLI itself:

```bash
cp $(npm root -g)/brain-kit/kb-skeleton/bin/brain.mjs ~/Documents/brain/bin/brain.mjs
```

## The split

There are three layers on purpose:

- **brain CLI** — pure Node, knows nothing about any agent
- **vault** — markdown, works in Obsidian or any editor
- **skills** — agent-facing instructions; one source, many targets

You can use any layer without the others. The CLI works without skills. The vault works without the CLI (it's just markdown). The skills work without the CLI if you don't want it — they describe the workflow, not the tooling.

## License

MIT.
