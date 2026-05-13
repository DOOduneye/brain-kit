---
name: wrap
description: Session handoff — tidies project/issue state, sweeps PR links, writes a structured handoff doc to sessions/handoffs/ for the next session to resume from. Use when the user says wrap up, save context, hand off, or hits context pressure.
---

# /wrap — Session Handoff

Wrap the current session. Runs `brain handoff`, which tidies project/issue state, sweeps PR links, detects log-duplicates and decision candidates, then writes a structured handoff doc to `sessions/handoffs/<id>.md` for the next session to resume from.

## What it does

1. **Tidy pass** (before capturing context):
   - `brain tidy prs` — sweep active issues/projects for `gh pr list` matches, inject PR references into issue frontmatter.
   - `brain tidy project <slug>` for each discovered project — derive status from linked issues, update `last_touched`.
   - `brain tidy logs` — flag duplicate entries in today's session log.

2. **Capture session context** — log entries, recent branches, PR states, active subagents, WIP issues, touched projects, files edited in last 24h.

3. **Write handoff doc** — `sessions/handoffs/h-YYYYMMDD-HHMM-<topic>.md` with structured sections: where-we-are, next-action (placeholder), projects-touched, recently-shipped, active-PRs, active-WIP, files-touched.

4. **Emit resume command** — next session runs `brain resume <id>` or `brain resume` (defaults to latest).

## Usage

```bash
# Default — tidy + wrap, uses most-recently-touched project as topic
brain handoff

# With an explicit topic (becomes the handoff slug + title)
brain handoff "kb layout + brain commands"

# Preview without writing
brain handoff --dry-run

# Structured JSON output
brain handoff --json

# Skip the tidy pass (handoff-only)
brain handoff --no-tidy
```

## When to call

- **Manual**: user says "wrap up," "save context," or hits context pressure.
- **Agent-initiated**: if the context indicator shows >75% used and current work isn't concluded, proactively suggest wrapping.
- **Before spawning a subagent**: handoff first so the subagent prompt references a durable doc rather than cold-reading the conversation.
- **End-of-day**: encouraged before shutting down a long session.

## After wrapping

The command prints a one-line resume invocation:

```
resume with:  brain resume h-20260417-1630-<topic>
```

Next session starts with:

```bash
brain resume                 # loads latest handoff
brain resume <id>            # loads a specific one
```

`brain resume` prints the handoff doc + runs `brain brief` for fresh state — ~2k structured tokens replacing cold-read of conversation history.

## Filling in "Next action"

The handoff doc has a `## Next action` section with a `TODO` placeholder. Before wrap completes, review and edit it manually (or pass the intent via the topic argument and edit after). A concrete next action matters more than any other section — it's what the next session acts on first.

## Related

- `brain tidy <verb>` — individual cleanup passes, invokable mid-session.
- `brain project <slug>` — project dossier, useful for orienting before wrap.
