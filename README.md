# brain-kit

A knowledge-base dev workflow for Claude Code. Three pieces:

1. **`brain` CLI** — operates on a markdown vault (works great with Obsidian, but isn't required)
2. **Skills** — `/brain-dev`, `/compile`, `/wrap` for Claude Code
3. **Vault skeleton** — opinionated folder layout with project conventions, kanban, and a sample library article

The premise: every Claude Code session forgets. The vault is shared memory. When you discover something — a gotcha, a pattern, a piece of architecture — it gets filed back so the next session starts where this one ended.

## What's in here

```
brain-kit/
├── install.sh              # interactive installer
├── kb-skeleton/            # vault template (copied to your chosen path)
│   ├── bin/brain.mjs       # the CLI
│   ├── package.json        # vault config (name, default project, prefixes)
│   ├── library/            # durable knowledge (concepts, patterns, guides)
│   ├── PROJECT_TEMPLATE/   # renamed to your project slug on install
│   ├── journal/
│   ├── sessions/handoffs/
│   ├── raw/, output/, scripts/
│   ├── docs/specs/         # KB methodology spec
│   └── CLAUDE.md           # vault-level agent instructions
├── skills/
│   ├── brain-dev/          # the main dev workflow
│   ├── compile/            # /compile — two-step KB article compilation
│   └── wrap/               # /wrap — session handoff
└── commands/
    └── wrap.md             # slash command shim
```

## Install

```bash
git clone https://github.com/DOOduneye/brain-kit
cd brain-kit
./install.sh
```

It prompts for:

- vault path (default `~/Documents/brain`)
- vault name (used for `obsidian://` links — default: basename of vault path)
- first project slug (e.g. `work`, `platform`, `customer-intelligence`)

Then:

- copies `kb-skeleton/` to your vault path
- substitutes the placeholders in `package.json`, the kanban view, and the project index
- runs `npm link` to make `brain` globally available
- copies (or symlinks with `--link`) the skills into `~/.claude/skills/`
- copies the `/wrap` slash command into `~/.claude/commands/`

### Non-interactive

```bash
./install.sh \
  --vault ~/kb \
  --name kb \
  --project platform \
  --link \
  --yes
```

See `./install.sh --help` for all flags.

## Composability

Every path is configurable. The CLI reads `package.json` at the vault root:

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

| Setting | What it does | Default |
|---|---|---|
| `name` | Used for `obsidian://` URI scheme | — |
| `defaultProject` | Project used when commands don't specify one | none |
| `projectPrefixes` | Override the 2-letter issue ID prefix | first two letters of slug |
| `defaultRepo` | Git repo to inspect in `brain brief` | $cwd if in a repo |
| `internsDir` | Path to background-agent state (optional integration) | none |
| `memoryPath` | Claude Code project memory file (for `brain tidy memory`) | derived from `defaultRepo` |

Env vars override package.json: `BRAIN_VAULT`, `BRAIN_REPO`, `BRAIN_INTERNS_DIR`, `BRAIN_MEMORY_PATH`.

The CLI finds the vault from its own filesystem location (`bin/brain.mjs`), so it works wherever you put the vault.

## Use

```bash
brain brief                              # situational awareness
brain projects                           # list projects
brain issue-create platform "Fix bug"    # scaffold an issue
brain query "idempotency"                # semantic search
brain log "found root cause: X"          # session log
brain handoff "feature X"                # wrap, write handoff doc
brain resume                             # next session: load latest handoff
```

`brain --help` for the full surface.

## Skills

After install, you get three skills in Claude Code:

- **`/brain-dev`** — the dev workflow. Three modes: do it, draft it, work an issue. KB-first investigation, session logs, learning loop.
- **`/compile`** — two-step library article compilation. Extract sources, then write narrative. Never single-pass.
- **`/wrap`** — session handoff. Tidies state, sweeps PR links, writes a handoff doc to `sessions/handoffs/` for the next session.

## Update

Pull the latest:

```bash
cd brain-kit && git pull
# Reinstall skills (vault is left alone)
./install.sh --no-npm-link --force --yes
```

To update `brain.mjs` itself, copy the new version into your vault:

```bash
cp brain-kit/kb-skeleton/bin/brain.mjs <your-vault>/bin/brain.mjs
```

## Philosophy

The full methodology lives in `kb-skeleton/docs/specs/knowledge-base-design.md`. The short version:

- **Library articles** describe durable engineering knowledge. Compiled, narrative, long-form. Read in full.
- **Project articles** describe how a specific system works. Architecture, key files, gotchas. No dates, no PR numbers, no roadmap sections.
- **Issues** describe work. Ephemeral, get marked done.

If it has a date, PR number, or will become stale — it's an issue. If it'll still be true in 6 months — it's an article.

## License

MIT
