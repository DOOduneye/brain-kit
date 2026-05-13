# Adapters

The skills under `skills/` are written in Claude Code's `SKILL.md` format. Adapters transform them for other harnesses.

The transformation is straightforward: strip the Claude Code YAML frontmatter, optionally wrap with a target-specific header, and write to the target's expected location.

| Target | Format | Location | Auto-discovered? |
|---|---|---|---|
| `claude-code` | `SKILL.md` with `name:` + `description:` frontmatter | `~/.claude/skills/<name>/SKILL.md` | Yes |
| `codex` | Plain markdown, no frontmatter required | `~/.codex/skills/<name>.md` | Yes (recent versions) |
| `cursor` | `.mdc` with `description:` + `globs:` + `alwaysApply:` frontmatter | `<repo>/.cursor/rules/<name>.mdc` | Yes (rules system) |
| `agents-md` | Plain markdown concatenated | `<repo>/AGENTS.md` or vault root | Yes (most modern agentic CLIs) |

## What lives here

- `cursor/frontmatter.mdc` — header prepended to each rule
- `agents-md/header.md` — intro section for the concatenated `AGENTS.md`
- `codex/` — empty; Codex reads plain markdown

`install.sh --target <name>[,<name>...]` selects which adapters to run. Default: `claude-code`. Multiple targets are fine; the same source SKILL produces output for each.
