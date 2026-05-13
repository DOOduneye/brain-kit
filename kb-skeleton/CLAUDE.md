# Knowledge Base

This is a brain-kit knowledge base. It is shared memory across Claude Code sessions.

## Structure

- `library/` — durable dev knowledge (concepts, patterns, guides, systems, tools)
- `<project>/` — work-specific projects, each with `issues/`, `projects/`, `decisions/`
- `journal/` — personal journal entries (the user's, not the agent's)
- `sessions/` — agent session logs (`brain log`) and handoff docs
- `raw/` — raw sources clipped from the web, used as input to `/compile`
- `output/` — extraction reports and temporary query results
- `bin/brain.mjs` — the CLI

## When invoked from a project repo

The agent should use the `brain-dev` skill (loaded automatically by Claude Code when this vault is referenced).

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
