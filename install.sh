#!/usr/bin/env bash
# brain-kit installer
#
# Scaffolds a knowledge-base vault from kb-skeleton/, npm-links the brain CLI,
# and installs the brain-dev / compile / wrap skills for one or more agent
# harnesses (Claude Code, Codex, Cursor, AGENTS.md).
#
# Usage:
#   ./install.sh [options]
#
# Options:
#   --vault PATH           Vault directory to create (default: ~/Documents/brain)
#   --name NAME            Vault name (default: basename of --vault)
#   --project SLUG         First project slug to scaffold (default: prompt)
#   --target LIST          Comma-separated agent targets to install skills for.
#                          Choices: claude-code | codex | cursor | agents-md | none
#                          Default: claude-code
#   --agents-md-repos LIST Comma-separated repo paths to also receive AGENTS.md
#                          (only used when --target includes agents-md)
#   --cursor-repos LIST    Comma-separated repo paths to receive .cursor/rules/*.mdc
#                          (only used when --target includes cursor)
#   --skills-dir DIR       Claude Code skills dir (default: ~/.claude/skills)
#   --commands-dir DIR     Claude Code commands dir (default: ~/.claude/commands)
#   --codex-dir DIR        Codex skills dir (default: ~/.codex/skills)
#   --no-skills            Skip installing skills entirely (equiv. --target none)
#   --no-commands          Skip installing Claude Code slash commands
#   --no-npm-link          Skip `npm link` (brain CLI won't be globally available)
#   --link                 Symlink instead of copying where supported (live updates)
#   --force                Overwrite existing files without prompting
#   --yes / -y             Accept all prompts (non-interactive)
#   --help / -h            Show this help
#
# Examples:
#   ./install.sh
#   ./install.sh --target claude-code,cursor --cursor-repos ~/code/my-app
#   ./install.sh --target agents-md --agents-md-repos ~/code/app1,~/code/app2
#   ./install.sh --target none --vault ~/kb --yes              # CLI + vault only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# -------- defaults --------
VAULT=""
VAULT_NAME=""
PROJECT_SLUG=""
TARGETS="claude-code"
AGENTS_MD_REPOS=""
CURSOR_REPOS=""
SKILLS_DIR="$HOME/.claude/skills"
COMMANDS_DIR="$HOME/.claude/commands"
CODEX_DIR="$HOME/.codex/skills"
INSTALL_SKILLS=1
INSTALL_COMMANDS=1
NPM_LINK=1
LINK_FILES=0
FORCE=0
NON_INTERACTIVE=0

# -------- arg parsing --------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --vault) VAULT="$2"; shift 2 ;;
    --name) VAULT_NAME="$2"; shift 2 ;;
    --project) PROJECT_SLUG="$2"; shift 2 ;;
    --target) TARGETS="$2"; shift 2 ;;
    --agents-md-repos) AGENTS_MD_REPOS="$2"; shift 2 ;;
    --cursor-repos) CURSOR_REPOS="$2"; shift 2 ;;
    --skills-dir) SKILLS_DIR="$2"; shift 2 ;;
    --commands-dir) COMMANDS_DIR="$2"; shift 2 ;;
    --codex-dir) CODEX_DIR="$2"; shift 2 ;;
    --no-skills) INSTALL_SKILLS=0; TARGETS="none"; shift ;;
    --no-commands) INSTALL_COMMANDS=0; shift ;;
    --no-npm-link) NPM_LINK=0; shift ;;
    --link) LINK_FILES=1; shift ;;
    --force) FORCE=1; shift ;;
    --yes|-y) NON_INTERACTIVE=1; shift ;;
    --help|-h)
      sed -n '/^# Usage:/,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# -------- helpers --------
prompt() {
  local var="$1" question="$2" default="$3"
  if [[ $NON_INTERACTIVE -eq 1 ]]; then
    printf -v "$var" '%s' "$default"
    return
  fi
  local current="${!var:-}"
  if [[ -n "$current" ]]; then return; fi
  local answer
  read -r -p "$question [$default]: " answer
  printf -v "$var" '%s' "${answer:-$default}"
}

confirm_overwrite() {
  local path="$1"
  [[ ! -e "$path" ]] && return 0
  [[ $FORCE -eq 1 ]] && return 0
  if [[ $NON_INTERACTIVE -eq 1 ]]; then
    echo "Refusing to overwrite $path (use --force)" >&2
    exit 1
  fi
  local answer
  read -r -p "$path exists. Overwrite? [y/N]: " answer
  [[ "$answer" =~ ^[yY] ]]
}

has_target() {
  [[ ",$TARGETS," == *",$1,"* ]]
}

# Strip a YAML frontmatter block from stdin if present, emit the rest.
strip_frontmatter() {
  awk 'BEGIN{in_fm=0; done=0}
    NR==1 && /^---[[:space:]]*$/ { in_fm=1; next }
    in_fm && /^---[[:space:]]*$/ { in_fm=0; done=1; next }
    !in_fm { print }'
}

# Extract the description: line from a SKILL.md frontmatter.
extract_description() {
  awk '/^description:/{ sub(/^description:[[:space:]]*/, ""); gsub(/^"|"$/, ""); print; exit }' "$1"
}

# -------- collect inputs --------
echo
echo "==> brain-kit installer"
echo

if [[ -z "$VAULT" ]]; then
  prompt VAULT "Where should the vault live?" "$HOME/Documents/brain"
fi
VAULT="${VAULT/#\~/$HOME}"

if [[ -z "$VAULT_NAME" ]]; then
  default_name=$(basename "$VAULT")
  prompt VAULT_NAME "Vault name (used for obsidian:// links)" "$default_name"
fi

if [[ -z "$PROJECT_SLUG" ]]; then
  prompt PROJECT_SLUG "First project slug (kebab-case)" "work"
fi

echo
echo "  Vault path        : $VAULT"
echo "  Vault name        : $VAULT_NAME"
echo "  First project     : $PROJECT_SLUG"
echo "  Targets           : $TARGETS"
[[ -n "$AGENTS_MD_REPOS" ]] && echo "  AGENTS.md repos   : $AGENTS_MD_REPOS"
[[ -n "$CURSOR_REPOS" ]]    && echo "  Cursor repos      : $CURSOR_REPOS"
echo "  npm link brain    : $([[ $NPM_LINK -eq 1 ]] && echo yes || echo no)"
echo

if [[ $NON_INTERACTIVE -eq 0 ]]; then
  read -r -p "Proceed? [Y/n]: " answer
  if [[ "$answer" =~ ^[nN] ]]; then echo "Aborted."; exit 0; fi
fi

# -------- step 1: create vault --------
echo
echo "==> Creating vault at $VAULT"
if [[ -e "$VAULT" ]] && [[ -n "$(ls -A "$VAULT" 2>/dev/null)" ]]; then
  if ! confirm_overwrite "$VAULT"; then
    echo "Aborted." >&2; exit 1
  fi
fi

mkdir -p "$VAULT"
cp -R "$SCRIPT_DIR/kb-skeleton/." "$VAULT/"

PROJECT_LABEL=$(echo "$PROJECT_SLUG" | tr '-' ' ' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)} 1')
mv "$VAULT/PROJECT_TEMPLATE" "$VAULT/$PROJECT_SLUG"

sed -i.bak \
  -e "s|__VAULT_NAME__|$VAULT_NAME|g" \
  -e "s|__DEFAULT_PROJECT__|$PROJECT_SLUG|g" \
  "$VAULT/package.json"
rm "$VAULT/package.json.bak"

sed -i.bak \
  -e "s|__PROJECT_SLUG__|$PROJECT_SLUG|g" \
  -e "s|__PROJECT_LABEL__|$PROJECT_LABEL|g" \
  "$VAULT/$PROJECT_SLUG/kanban.base"
rm "$VAULT/$PROJECT_SLUG/kanban.base.bak"

sed -i.bak \
  -e "s|__PROJECT_LABEL__|$PROJECT_LABEL|g" \
  "$VAULT/$PROJECT_SLUG/index.md"
rm "$VAULT/$PROJECT_SLUG/index.md.bak"

echo "    vault ready: $VAULT"

# -------- step 2: npm link --------
if [[ $NPM_LINK -eq 1 ]]; then
  echo
  echo "==> npm link brain CLI"
  if ! command -v npm >/dev/null 2>&1; then
    echo "    npm not found — skipping. Run \`cd $VAULT && npm link\` later." >&2
  else
    ( cd "$VAULT" && npm link >/dev/null 2>&1 ) || {
      echo "    npm link failed (may need sudo or different prefix)." >&2
      echo "    You can still run: node $VAULT/bin/brain.mjs" >&2
    }
    if command -v brain >/dev/null 2>&1; then
      echo "    brain CLI: $(command -v brain)"
    fi
  fi
fi

# -------- step 3: install for each target --------

install_claude_code() {
  echo
  echo "==> [claude-code] skills → $SKILLS_DIR"
  mkdir -p "$SKILLS_DIR"
  for skill_dir in "$SCRIPT_DIR/skills"/*/; do
    name=$(basename "${skill_dir%/}")
    dest="$SKILLS_DIR/$name"
    if [[ -e "$dest" ]]; then
      if ! confirm_overwrite "$dest"; then echo "    skipped: $name"; continue; fi
      rm -rf "$dest"
    fi
    if [[ $LINK_FILES -eq 1 ]]; then
      ln -s "${skill_dir%/}" "$dest"; echo "    linked: $name"
    else
      cp -R "${skill_dir%/}" "$dest"; echo "    copied: $name"
    fi
  done
  if [[ $INSTALL_COMMANDS -eq 1 ]]; then
    echo "==> [claude-code] commands → $COMMANDS_DIR"
    mkdir -p "$COMMANDS_DIR"
    for cmd in "$SCRIPT_DIR/commands"/*.md; do
      name=$(basename "$cmd")
      dest="$COMMANDS_DIR/$name"
      if [[ -e "$dest" ]] && ! confirm_overwrite "$dest"; then
        echo "    skipped: $name"; continue
      fi
      if [[ $LINK_FILES -eq 1 ]]; then
        ln -sf "$cmd" "$dest"; echo "    linked: $name"
      else
        cp "$cmd" "$dest"; echo "    copied: $name"
      fi
    done
  fi
}

install_codex() {
  echo
  echo "==> [codex] skills → $CODEX_DIR"
  mkdir -p "$CODEX_DIR"
  for skill_dir in "$SCRIPT_DIR/skills"/*/; do
    name=$(basename "${skill_dir%/}")
    src="${skill_dir}SKILL.md"
    [[ -f "$src" ]] || continue
    dest="$CODEX_DIR/$name.md"
    if [[ -e "$dest" ]] && ! confirm_overwrite "$dest"; then
      echo "    skipped: $name"; continue
    fi
    strip_frontmatter < "$src" > "$dest"
    # Inline references so the single file is self-contained
    if [[ -d "${skill_dir}references" ]]; then
      for ref in "${skill_dir}references"/*.md; do
        [[ -f "$ref" ]] || continue
        printf '\n\n---\n\n# %s\n\n' "$(basename "$ref" .md)" >> "$dest"
        cat "$ref" >> "$dest"
      done
    fi
    echo "    wrote: $name.md"
  done
}

install_cursor_rule_to() {
  local skill_dir="$1" repo="$2"
  local name; name=$(basename "${skill_dir%/}")
  local rules_dir="$repo/.cursor/rules"
  mkdir -p "$rules_dir"
  local dest="$rules_dir/$name.mdc"
  if [[ -e "$dest" ]] && ! confirm_overwrite "$dest"; then
    echo "    skipped: $name @ $repo"; return
  fi
  local desc; desc=$(extract_description "${skill_dir}SKILL.md")
  sed "s|__DESCRIPTION__|$desc|" "$SCRIPT_DIR/adapters/cursor/frontmatter.mdc" > "$dest"
  strip_frontmatter < "${skill_dir}SKILL.md" >> "$dest"
  if [[ -d "${skill_dir}references" ]]; then
    for ref in "${skill_dir}references"/*.md; do
      [[ -f "$ref" ]] || continue
      printf '\n\n---\n\n# %s\n\n' "$(basename "$ref" .md)" >> "$dest"
      cat "$ref" >> "$dest"
    done
  fi
  echo "    wrote: $repo/.cursor/rules/$name.mdc"
}

install_cursor() {
  echo
  if [[ -z "$CURSOR_REPOS" ]]; then
    echo "==> [cursor] no --cursor-repos given"
    echo "    To install Cursor rules into a repo:"
    echo "      ./install.sh --target cursor --cursor-repos /path/to/repo"
    echo "    Or copy adapters/cursor/ + transform manually."
    return
  fi
  echo "==> [cursor] rules → .cursor/rules/ in:"
  IFS=',' read -ra repos <<< "$CURSOR_REPOS"
  for raw in "${repos[@]}"; do
    repo="${raw/#\~/$HOME}"
    if [[ ! -d "$repo" ]]; then
      echo "    skipped (not a dir): $repo"; continue
    fi
    echo "  - $repo"
    for skill_dir in "$SCRIPT_DIR/skills"/*/; do
      install_cursor_rule_to "$skill_dir" "$repo"
    done
  done
}

# Write the skill content (no header) between brain-kit markers.
write_skills_block() {
  local out="$1"
  echo "<!-- brain-kit:start -->"     >> "$out"
  echo "<!-- managed by brain-kit installer — content between markers is regenerated -->" >> "$out"
  for skill_dir in "$SCRIPT_DIR/skills"/*/; do
    name=$(basename "${skill_dir%/}")
    src="${skill_dir}SKILL.md"
    [[ -f "$src" ]] || continue
    printf '\n## %s\n\n' "$name" >> "$out"
    strip_frontmatter < "$src" >> "$out"
    if [[ -d "${skill_dir}references" ]]; then
      for ref in "${skill_dir}references"/*.md; do
        [[ -f "$ref" ]] || continue
        printf '\n### %s — %s\n\n' "$name" "$(basename "$ref" .md)" >> "$out"
        cat "$ref" >> "$out"
      done
    fi
  done
  echo ""                              >> "$out"
  echo "<!-- brain-kit:end -->"        >> "$out"
}

# Splice the skills block into an AGENTS.md, replacing any existing block.
splice_skills_into_agents_md() {
  local target="$1"
  if [[ ! -f "$target" ]]; then
    cat "$SCRIPT_DIR/adapters/agents-md/header.md" > "$target"
  fi
  # Drop any prior brain-kit block
  if grep -q "<!-- brain-kit:start -->" "$target"; then
    awk '
      /<!-- brain-kit:start -->/ { skip=1; next }
      /<!-- brain-kit:end -->/   { skip=0; next }
      !skip
    ' "$target" > "$target.tmp" && mv "$target.tmp" "$target"
  fi
  # Append fresh block
  echo ""             >> "$target"
  write_skills_block "$target"
}

install_agents_md() {
  echo
  echo "==> [agents-md] splicing skills into AGENTS.md"
  # Vault root — AGENTS.md exists from the skeleton; splice between markers
  local vault_dest="$VAULT/AGENTS.md"
  splice_skills_into_agents_md "$vault_dest"
  echo "    updated: $vault_dest"
  if [[ -n "$AGENTS_MD_REPOS" ]]; then
    IFS=',' read -ra repos <<< "$AGENTS_MD_REPOS"
    for raw in "${repos[@]}"; do
      repo="${raw/#\~/$HOME}"
      if [[ ! -d "$repo" ]]; then
        echo "    skipped (not a dir): $repo"; continue
      fi
      splice_skills_into_agents_md "$repo/AGENTS.md"
      echo "    updated: $repo/AGENTS.md"
    done
  fi
}

if [[ $INSTALL_SKILLS -eq 1 ]]; then
  IFS=',' read -ra _targets <<< "$TARGETS"
  for t in "${_targets[@]}"; do
    case "$t" in
      claude-code) install_claude_code ;;
      codex)       install_codex ;;
      cursor)      install_cursor ;;
      agents-md)   install_agents_md ;;
      none)        echo; echo "==> [none] skipping skill installation" ;;
      *) echo "Unknown target: $t (choices: claude-code | codex | cursor | agents-md | none)" >&2 ;;
    esac
  done
fi

# -------- step 4: smoke test --------
echo
echo "==> Smoke test"
if command -v brain >/dev/null 2>&1; then
  brain root 2>/dev/null && echo "    brain root works"
else
  node "$VAULT/bin/brain.mjs" root 2>/dev/null || true
fi

echo
echo "==> Done."
echo
echo "Next steps:"
echo "  1. Open the vault: $VAULT"
echo "  2. Try: brain brief"
echo "  3. Create your first issue: brain issue-create $PROJECT_SLUG \"Test issue\""
if has_target claude-code; then
  echo "  4. In Claude Code, try /brain-dev or /wrap"
fi
if has_target agents-md; then
  echo "  4. Your AGENTS.md is at $VAULT/AGENTS.md — point your agent at it"
fi
echo
