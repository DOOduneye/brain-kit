---
description: End the session — write a handoff doc the next session picks up.
---

# /wrap

Wrap the current session. Runs `brain handoff`, which collects work in flight,
git state, and today's findings into `sessions/handoffs/<id>.md`.

```bash
brain handoff                    # untitled
brain handoff "drag sensor"      # topic becomes part of the filename
```

## Then fill in the placeholders

The command leaves two sections blank on purpose, because they need judgement
rather than collection. Fill both before finishing.

**Next action** — one sentence naming the very next concrete thing to do, not
"continue the investigation."

**Where we are** — what changed and why. The reasoning that is not recoverable
from the diff, including what was rejected and what it cost.

A handoff with empty placeholders is worse than none, because the next session
trusts it.

## First, write anything durable to docs/

A handoff is read once and goes stale. An article is read for a year. If a
finding will still be true in six months regardless of what ships, it belongs in
`docs/` — write it there before wrapping.

## Related

`/pickup` loads the handoff this creates.
