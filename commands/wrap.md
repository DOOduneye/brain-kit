# /wrap — Session Handoff

Wrap the current session. Runs `brain handoff`, which tidies project/issue state, sweeps PR links, detects log-duplicates and decision candidates, then writes a structured handoff doc to `sessions/handoffs/<id>.md` for the next session to resume from.

## Usage

```bash
brain handoff                          # default — uses most-recently-touched project as topic
brain handoff "<topic>"                # explicit topic (becomes handoff slug + title)
brain handoff --dry-run                # preview without writing
brain handoff --json                   # structured output
brain handoff --no-tidy                # skip tidy pass
```

After wrapping, the next session starts with:

```bash
brain resume                           # loads latest handoff
brain resume <id>                      # loads a specific one
```

See `skills/wrap/SKILL.md` for the full lifecycle.
