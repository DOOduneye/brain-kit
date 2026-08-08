---
name: wrap
description: Session handoff — writes a structured doc to sessions/handoffs/ that the next session loads with `brain pickup`. Use when the user says wrap up, save context, hand off, or when hitting context pressure.
---

# Wrap

Write the doc the next session reads. Run `brain handoff [topic]`, then fill in
the two sections it leaves blank — those are the parts only you can write.

```bash
brain handoff                    # untitled
brain handoff "drag sensor"      # topic becomes part of the filename
```

## What the command collects

- work files currently in flight
- git branch, uncommitted count, last five commits
- today's `brain log` entries

## What you have to write

`brain handoff` deliberately leaves two placeholders, because they need
judgement rather than collection.

**Next action** — one sentence naming the very next concrete thing to do. Not
"continue the investigation." Something like "check whether the retry wrapper
swallows the cancellation error at `worker.ts:210`."

**Where we are** — what changed this session and why. The reasoning that is not
recoverable from the diff. If a decision was made, record what was rejected and
what it cost.

Fill both in before you finish. A handoff with empty placeholders is worse than
none, because the next session trusts it.

## Before wrapping

Anything durable you learned belongs in `docs/`, not in the handoff. A handoff
is read once and goes stale; an article is read for a year. If a finding will
still be true in six months, write it to `docs/` first, then wrap.

## The next session

```bash
brain pickup          # latest handoff, then brain work
brain pickup h-2026   # a specific one, by prefix
```
