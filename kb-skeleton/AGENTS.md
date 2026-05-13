# Knowledge Base

This is a brain-kit knowledge base. It is shared memory across agent sessions, read by any agent CLI that follows the `AGENTS.md` convention (Claude Code, Codex, Cursor, Continue, Cline, Aider, and others).

## Structure

- `library/` — durable dev knowledge (concepts, patterns, guides, systems, tools)
- `<project>/` — work-specific projects, each with `issues/`, `projects/`, `decisions/`
- `journal/` — personal journal entries (the user's, not the agent's)
- `sessions/` — agent session logs (`brain log`) and handoff docs
- `raw/` — raw sources clipped from the web, used as input to `/compile`
- `output/` — extraction reports and temporary query results
- `bin/brain.mjs` — the CLI

## Working in this vault

The full workflow lives in the `brain-dev` skill (or, if your agent doesn't load skills, see the `## brain-dev` section below if `install.sh --target agents-md` was used — it inlines the workflow here).

Briefly: three modes — do it, draft it, work an issue. Always run `brain brief` first. Log non-obvious findings with `brain log`. Wrap sessions with `brain handoff`.

## Useful commands

```bash
brain brief                        # situational awareness
brain projects                     # list projects
brain issues <project>             # active issues
brain query "<topic>"              # semantic search
brain log "<note>"                 # append to today's session log
brain handoff [topic]              # wrap session, write handoff doc
brain resume [id]                  # resume from latest or specific handoff
```

Full help: `brain --help`.
