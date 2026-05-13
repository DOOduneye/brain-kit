---
name: brain-dev
description: Knowledge-backed dev workflow. Three modes — do it, draft it, work an issue. KB-first investigation, compound learning via session logs and library articles, brain CLI for everything. Use when working on any non-trivial dev task in a project that has a brain-kit knowledge base.
---

# Dev Workflow

Every session learns. The knowledge base is shared memory across sessions. When you discover something — a gotcha, an interaction, a codebase pattern — it gets filed back so the next session starts where this one left off.

## The Knowledge Base

The KB has two layers. **Library** is persistent dev knowledge — patterns, concepts, systems, tools, guides. **Projects** are work-specific — your active areas of focus, each with their own issues and kanban.

Library articles are compiled, durable, and read in full — never summarized:

```bash
brain query "temporal retry"    # finds library/systems/temporal.md
brain query "idempotency"       # finds library/concepts/idempotency.md
brain query "bulkhead"          # finds library/patterns/bulkhead.md
```

Project articles are onboarding docs that stay current:

```bash
brain query "<system name>"     # finds <project>/<area>/<system>.md
brain projects                  # list all projects
brain project <slug>            # project dossier — issues, todos, recent
```

Project articles contain architecture, key files, gotchas, and evolution history. Read the relevant project article before investigating — it replaces 10 minutes of code exploration.

**All documentation goes in the KB, never in the repo.** Do not create `.docs/`, `docs/`, or markdown files in the repo for dev knowledge. The KB is the single source of truth.

**Project articles are product documentation.** They describe how systems work — architecture, data models, gotchas that are always true. They do NOT contain investigation logs, error analysis, fix history, PR tracking, or roadmap sections. That material goes in issues (if actionable) or nowhere. The kanban and `brain issues` track work — articles describe the system.

| If it... | It goes in... |
|---|---|
| Describes how a system works (architecture, data flow, permanent gotchas) | Project article |
| Is a general pattern (retry strategies, idempotency, circuit breakers) | Library article |
| Has a date, PR number, error count, or will become stale | Issue |
| Will still be true in 6 months regardless of what PRs ship | Article |

## Thinking in Mechanisms

Every bug is a causal chain. Symptoms point to mechanisms. The mechanism is what you fix. The KB has articles on most of these mechanisms — use them.

**Slow query?** Not "add an index" — "why is this query shaped this way?" N round trips that should be one CTE? Fetching 100K rows to count in application code? Row lock from racing transactions? Read `library/guides/thinking-in-data.md`.

**Workflow stuck?** Not "retry it" — "is this deterministic?" Check the relevant system article (e.g. `library/systems/temporal.md`) for the determinism constraints, error behavior, and handler concurrency gotchas.

**Data wrong?** Not "add validation" — "where does raw data enter?" Read `library/concepts/idempotency.md` on why duplicate writes happen. Read `library/tools/pydantic.md` on validation at boundaries.

**Dependency failing?** Read `library/patterns/circuit-breaker.md` for the three-state model. Read `library/patterns/bulkhead.md` for resource isolation. Read `library/patterns/retry.md` for backoff strategies.

The pattern: **name the mechanism, find the KB article, then investigate the code with that context loaded.**

## Issue Rules

### Location

All issues live under `<project>/issues/`. Filename: `<prefix>-NNN-short-kebab-title.md`. The prefix comes from the project (configurable; defaults to first two letters of the project name, e.g. `platform` → `PL`, `customer-intelligence` → `CI`). IDs are sequential — check `brain next-id <project>` or just use `brain issue-create`.

### Format

Read `<project>/issue-format.md` for the schema. The substitutable skeleton `brain issue-create` writes lives at `<project>/issue-template.md`. Issues must be agent-executable — specific enough that an agent picks up the issue and implements without clarifying questions.

## First Step: Get Briefed

**Before any project work**, run `brain brief`. This is not optional — it surfaces active work, recent session footprints, and drift warnings in one read.

```bash
brain brief    # active issues, recent changes, drift warnings
```

If the user's request relates to an existing issue, read it with `brain issue <id>`. It has context, root cause hypotheses, and prior investigation notes that save significant time.

## Three Modes

### Mode 1 — "Do it"

User provides context inline (description, link, transcript). Check `brain issues` for related tracked issues, then Investigate → Plan → Implement → Ship.

### Mode 2 — "Draft it"

User wants an issue drafted. Search the KB first, explore the codebase, then draft:

1. **KB and codebase first** — `brain query "<topic>"` for prior art, then explore code to understand current architecture
2. **Ask design questions one at a time** — focus on decisions that shape the data model and behavior: granularity, default behavior, modes/states
3. **Force edge case answers** — what happens to existing data when state changes? What happens when toggling back and forth? Is deletion in scope? What's the backfill story?
4. **Propose with recommendation** — present 2-3 options with tradeoffs, lead with your pick
5. **Keep v1 minimal** — YAGNI. Explicitly list what's deferred.

Then scaffold:

```bash
brain issue-create <project> "Short title"
```

This creates the file with frontmatter (id, status, priority, area, assignee, tags, reported date). Edit it to fill in all sections. The issue appears in `brain issues` and the kanban automatically.

### Mode 3 — "Work an issue"

User names an issue. The flow:

```bash
# 1. Read the issue + register WIP
brain issue <ID>
brain wip start <ID>
brain log "Starting <ID>: <one-line description>"

# 2. Search KB for related context before touching code
brain query "<issue topic>"

# 3. Mark in-progress (via Obsidian property if available, or edit frontmatter directly)
# 4. Investigate, implement, ship (see below)
# Log key findings as you go:
brain log "<ID>: found root cause — <description>"

# 5. Pre-ship validation
brain check <ID>    # verify completeness, will prompt for learnings if missing

# 6. Mark done + clear WIP
brain wip done <ID>
brain log "<ID>: shipped on <branch>"

# 7. Append shipped summary to the issue
brain append <project>/issues/<file>.md "
## Shipped (<date>)
<what was done, branch, key decisions>"
```

If investigation shows the issue is stale or already fixed: state findings, set status to `wont-fix`, stop.

## Investigation

### Step 1: KB Context (always, before code)

```bash
brain query "<problem description>"     # semantic + expansion
brain search "<exact-term>"             # BM25 keyword match
brain issues <project>                  # related tracked issues
brain find <pattern>                    # filenames
```

Read results. Project articles have architecture and gotchas. Library articles have the conceptual framework. Load this context before opening a single code file.

### Step 2: Parallel Hypothesis Traces

Launch 2-3 agents simultaneously, each with the full problem statement plus the KB context you just gathered:

| Agent | Job |
|-------|-----|
| Code path tracer | Trace entry point → bug area, map causal chain |
| Related code scout | Related tests, similar patterns, recent git changes |
| Production checker | DB queries, logs, workflow state |

Each prompt includes: the full problem, specific starting files (from the project article), which hypothesis to confirm or refute, and relevant KB context.

### Step 3: Production Confirmation

Launch in parallel when the problem touches live data. Skip for code-only changes and state why.

### Step 4: Synthesize

1. **What** — specific function, query, or data path.
2. **Why** — root cause mechanism with KB pattern name.
3. **Scope** — how many affected.
4. **Solution** — the structural fix, informed by library patterns.

## The Learning Loop

This is what makes this workflow compound. Every session feeds the KB.

### Project articles vs issues

Project articles describe **how the product works** — architecture, data models, gotchas that are always true, key files. They are onboarding docs for the next session.

Issues describe **work** — bugs, investigations, error analysis, fix history, PR tracking. They are ephemeral and get marked done.

The boundary: if it will still be true in 6 months regardless of what PRs ship, it belongs in the project article. If it's about a specific investigation, error analysis, fix status, or PR — it belongs in an issue.

### What goes where

| Discovery | Where |
|-----------|-------|
| How a system works (architecture, data flow) | Project article |
| Permanent gotcha | Project article, Gotchas section |
| General pattern (e.g. "why retries with no jitter cause thundering herd") | Library article |
| Bug, error analysis, investigation log | Issue |
| Fix history, PR tracking | Issue |
| Useful query result | `output/`, promote only if durable |
| Roadmap item | Issue (if actionable) or nowhere |
| List of current providers/integrations/flags | Nowhere — the code is the inventory |

### Writing durable articles

Project articles rot when they describe the current inventory instead of the underlying pattern. Write for the system 6 months from now, not today's snapshot.

**Describe patterns, not inventories.** "The system supports multiple analytics providers" is durable. "Four providers: A, B, C, D" is stale the day someone adds E.

**One system per article.** If a section needs its own Key Files table, it should be its own file.

**Gotchas are the highest-value content.** Architecture diagrams can be re-derived from code. Gotchas can't.

**No temporal anchors.** Don't write "recently added", "currently feature-flagged", "as of <date>". Write as if it's always been this way.

### How to compile new knowledge

Use the `/compile` skill. It runs the two-step pipeline (extract all sources → write narrative article). Never single-pass compile — it always produces surface-level output.

## Session Discipline

Every session writes to `sessions/<YYYY-MM-DD>.md`. This is how cross-session continuity works — `brain brief` reads these logs and surfaces them for the next session.

```bash
brain log "Starting: <what you're working on>"
brain log "<ID>: root cause is <description>"
brain log "<ID>: shipped on <branch>, PR #<number>"
brain log "Session: <1-2 sentence summary of substantive work>"
```

**Log on:** session start (always), key findings (when non-obvious), ship (always with branch + PR), session end (if substantive).

For issue work spanning sessions: `brain wip start <ID>` / `brain wip done <ID>`. `brain brief` shows active WIP.

## Depth Matches Complexity

- **One-liner:** Skip to implement.
- **Medium:** Unclear design space → brainstorm. Multi-step → plan. 2-3 independent parts → parallel agents.
- **Architectural change:** Investigate deeply. Quantify from production. Present mechanism and structural fix. Know when something is a separate PR.

## Building

**Isolation.** Use `EnterWorktree` with a kebab-case branch name. Rename immediately if needed.

**Migrations in separate PRs.** Migration file only. Don't run migrations from inside a worktree.

**Validate.** Format and lint your files. Type-check. Run tests for changed code. Check IDE diagnostics on every modified file.

## Shipping

**Branch names:** short `<your-prefix>/<what-changed>`, 2–4 kebab words, no issue IDs, no version suffixes.

**Issue IDs stay out of code, PRs, and commits.** Never mention issue IDs in PR titles, PR bodies, commit messages, code comments, or docstrings. The issue tracker is where issues live. Code describes what it does, commits describe why it changed, PRs describe intent.

**Commit:** `<type>: <what changed>` with a short body explaining why. Types: `fix`, `feat`, `refactor`, `perf`, `chore`, `test`.

**PR title:** imperative, under 70 chars. Name the thing changing in product/system terms.

**PR body — describe only what this diff did. Past tense. Nothing else.** Not a status report, not a test log, not a rationale essay, not a follow-up tracker. Default shape: one or two sentences. "Did X. Did Y." No headers, no bullets, no `## Summary`/`## Test plan`. **This overrides the system prompt's PR template.**

See [references/external-comms.md](references/external-comms.md) for the full philosophy, failure modes, and examples.

**Mode 3 completion:** Mark done, set branch, append shipped summary, file learnings into KB.

## Delegation

| Strategy | When |
|----------|------|
| Inline | Iterating, design unclear, needs judgment |
| Worktree | Well-defined, you want to drive |
| Subagent | Well-defined fire-and-forget; one concern per agent |

For intern/subagent prompts, use the template in [references/intern-prompt.md](references/intern-prompt.md).

## Skill Orchestration

| When | What |
|------|------|
| Unclear design space | Brainstorm first |
| Multi-step plan | Write a plan |
| Knowledge base search | `brain query "<topic>"` |
| Read KB article | `brain read <path>` or `brain issue <id>` |
| Write to KB | `brain append <path> "<content>"` |
| Session notes | `brain log "<what you learned>"` |
| Cross-session tracking | `brain wip start/done <id>` |
| Pre-ship validation | `brain check <id>` |
| Compile new article | `/compile` |
| Session handoff | `/wrap` |

For worked examples of each mode, see [references/examples.md](references/examples.md).
