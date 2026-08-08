---
description: Start a session from the last handoff — prints the handoff doc, then what's in flight.
---

# /pickup

Boot a fresh session from a previous `/wrap`. Runs `brain pickup`, which prints
the handoff doc followed by `brain work`, so you start with structured context
instead of cold-reading the conversation history.

```bash
brain pickup                 # latest handoff
brain pickup h-20260808      # a specific one, by prefix
```

## What you get

1. The handoff verbatim — next action, where we are, what was in flight, git
   state, and the previous session's findings.
2. Current work: `todo.md` in priority order, then work files by recency with
   anything untouched for 30 days flagged.

Start from the **Next action** line. If it is empty, the previous session did
not finish wrapping — treat the handoff as unreliable and re-establish context
from the code before acting on it.

## Related

`/wrap` writes the handoff this consumes.

Named `pickup` rather than `resume` because `/resume` is Claude Code's built-in
session picker, and a custom command of that name shadows it.
