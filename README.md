# brain-kit

A knowledge-base dev workflow for agent CLIs (Claude Code, Codex, Cursor, anything that reads `AGENTS.md`). Three pieces:

1. **`brain` CLI** — operates on a markdown vault (works great with Obsidian, but isn't required)
2. **Skills** — `brain-dev`, `compile`, `wrap` — installable into Claude Code, Codex, Cursor `.cursor/rules`, or as a shared `AGENTS.md`
3. **Vault skeleton** — opinionated folder layout with project conventions, kanban, and a sample library article

Pick one or more agent targets at install time. The CLI and vault are tool-agnostic.

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
│   ├── brain-dev/          # the main dev workflow (source of truth)
│   ├── compile/            # two-step KB article compilation
│   └── wrap/               # session handoff
├── commands/
│   └── wrap.md             # Claude Code slash command shim
└── adapters/               # per-target transformations
    ├── cursor/             # .cursor/rules/*.mdc frontmatter template
    ├── agents-md/          # AGENTS.md header
    └── codex/              # plain markdown (no transformation needed)
```

## Install

```bash
git clone https://github.com/DOOduneye/brain-kit
cd brain-kit
./install.sh
```

It prompts for vault path, vault name (used for `obsidian://` links), and first project slug. Then it scaffolds the vault, runs `npm link` to make `brain` globally available, and installs skills for the selected target(s).

### Targets

| Target | What gets installed | Default location |
|---|---|---|
| `claude-code` (default) | `SKILL.md` + `references/` + `/wrap` slash command | `~/.claude/skills/` and `~/.claude/commands/` |
| `codex` | Frontmatter-stripped markdown, references inlined into one file per skill | `~/.codex/skills/` |
| `cursor` | `.cursor/rules/*.mdc` with Cursor frontmatter | Each repo passed via `--cursor-repos` |
| `agents-md` | Skill bodies spliced into `AGENTS.md` between `<!-- brain-kit:start -->` markers (idempotent — re-runs replace the block, not duplicate it) | Vault root, plus any repos in `--agents-md-repos` |
| `none` | No skills installed — just CLI + vault | — |

### Examples

```bash
./install.sh                                              # Claude Code, interactive

./install.sh --target claude-code,cursor \
             --cursor-repos ~/code/app1,~/code/app2       # Claude Code + Cursor rules in two repos

./install.sh --target agents-md \
             --agents-md-repos ~/code/app                 # AGENTS.md in vault + one repo

./install.sh --target none --vault ~/kb --yes             # Just the CLI and vault

./install.sh --target claude-code --link --yes            # Symlink skills for live edits
```

See `./install.sh --help` for all flags.

### A note on AGENTS.md

The vault skeleton ships with an `AGENTS.md` at the vault root — that's the harness-agnostic equivalent of `CLAUDE.md`. Recent Claude Code reads it natively; Codex, Cursor, Continue, Cline, and Aider read it too. If you only use Claude Code and prefer `CLAUDE.md`, symlink: `ln -s AGENTS.md CLAUDE.md` inside your vault.

### Cross-harness compatibility

The skill content (in `skills/*/SKILL.md`) is mostly tool-agnostic prose. The few harness-specific tool references (e.g. `EnterWorktree`) are written to degrade gracefully — they include the equivalent shell command so any agent can follow along.

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

Three skills, identical content across targets:

- **`brain-dev`** — the dev workflow. Three modes: do it, draft it, work an issue. KB-first investigation, session logs, learning loop.
- **`compile`** — two-step library article compilation. Extract sources, then write narrative. Never single-pass.
- **`wrap`** — session handoff. Tidies state, sweeps PR links, writes a handoff doc to `sessions/handoffs/` for the next session.

Source of truth lives in `skills/<name>/SKILL.md` (Claude Code format). At install time, the chosen adapter transforms each skill for its target — strips/replaces frontmatter, inlines references where one-file-per-skill is required.

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
