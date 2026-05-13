# Knowledge Base Design

The methodology behind a brain-kit knowledge base.

## Premise

Every Claude Code session forgets. The vault is shared memory: write findings back, the next session starts where this one ended.

## Two layers

### Library (durable)

Compiled, narrative articles about persistent dev knowledge: concepts (idempotency, cap theorem), patterns (circuit breaker, retry), guides (thinking-in-data), systems (Temporal, Kafka), tools (Postgres, FastAPI).

Library articles are:

- **Compiled, not summarized.** Use `/compile` — never single-pass. Two-step pipeline: extract sources → write narrative from extraction.
- **Read in full.** The whole article is the artifact. Don't summarize it for an agent — pass it raw and let the agent extract relevance.
- **Long-form.** 400–1200 lines is normal. Gotchas woven into narrative as callout boxes, not relegated to footnotes.
- **Durable.** Describe patterns, not inventories. No temporal anchors ("recently added", "as of <date>"). Should still be true in 6 months.

### Projects (active work)

Each top-level folder with an `issues/` subdir is a project. Inside:

- `issues/` — flat directory of work units (`<prefix>-NNN-title.md`)
- `projects/<slug>/` — multi-issue initiatives that need their own narrative
- `decisions/` — formal decision records (use sparingly)
- `<area>/<system>.md` — project articles documenting how systems work
- `index.md` — project-level index
- `issue-format.md` — schema for this project's issues
- `issue-template.md` — substitutable skeleton for `brain issue-create`
- `kanban.base` — Obsidian Bases query for the kanban view

## The boundary rule

**Project articles describe how the system works.** Architecture, data flow, key files, permanent gotchas. They're onboarding docs.

**Issues describe work.** Bugs, investigations, fix history, PR tracking. They're ephemeral and get marked done.

If it has a date, a PR number, or will go stale — it's an issue. If it'll still be true in 6 months regardless of what ships — it's an article.

## The session loop

1. **Start** — `brain brief` to orient.
2. **Investigate** — `brain query`/`brain issue` for KB context *before* opening code.
3. **Log** — `brain log` for non-obvious findings as you discover them.
4. **Wrap** — `brain handoff` writes a structured doc for the next session.
5. **Resume** — next session runs `brain resume`.

## What goes where

| Discovery | Where |
|-----------|-------|
| How a system works | Project article |
| Permanent gotcha | Project article, Gotchas section |
| General pattern | Library article |
| Bug, investigation, error analysis | Issue |
| Fix history, PR tracking | Issue |
| Useful query result | `output/`, promote only if durable |
| Roadmap item | Issue (if actionable) or nowhere |
| Inventory of providers/flags/integrations | Nowhere — the code is the inventory |

## Compile quality bar

Single-pass compilation produces surface-level output. Always two-step:

1. **Extract** — agent reads ALL raw sources, produces structured extraction report to `output/<topic>-extraction.md`. Hundreds of lines, exhaustive. Categories: mental model, non-obvious interactions, production gotchas, configuration that matters, *why* behind design decisions, connections, mandatory patterns.

2. **Write** — separate agent reads the extraction + format spec, writes the article. Lead with *why*, then *how*, then *what goes wrong*. Weave gotchas into narrative.

## Composability

The CLI reads `package.json` at the vault root for configuration:

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

The vault location is wherever `package.json` says — the CLI uses its own filesystem location (`bin/brain.mjs`) to find the vault root.
