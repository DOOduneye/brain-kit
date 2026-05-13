#!/usr/bin/env bash
# brain-kit installer
#
# Scaffolds a knowledge-base vault from kb-skeleton/, npm-links the brain CLI,
# and installs the brain-dev / compile / wrap skills into Claude Code.
#
# Usage:
#   ./install.sh [options]
#
# Options:
#   --vault PATH           Vault directory to create (default: ~/Documents/<name>)
#   --name NAME            Vault name (default: basename of --vault)
#   --project SLUG         First project slug to scaffold (default: prompt)
#   --skills-dir DIR       Claude Code skills dir (default: ~/.claude/skills)
#   --commands-dir DIR     Claude Code commands dir (default: ~/.claude/commands)
#   --no-skills            Skip installing skills
#   --no-commands          Skip installing slash commands
#   --no-npm-link          Skip `npm link` (brain CLI won't be globally available)
#   --link                 Symlink skills instead of copying (live updates)
#   --force                Overwrite existing files without prompting
#   --yes / -y             Accept all prompts (non-interactive)
#   --help / -h            Show this help
#
# Examples:
#   ./install.sh                                          # interactive, sensible defaults
#   ./install.sh --vault ~/kb --name kb --project work    # explicit
#   ./install.sh --link --yes                             # CI-friendly, symlink skills

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# -------- defaults --------
VAULT=""
VAULT_NAME=""
PROJECT_SLUG=""
SKILLS_DIR="$HOME/.claude/skills"
COMMANDS_DIR="$HOME/.claude/commands"
INSTALL_SKILLS=1
INSTALL_COMMANDS=1
NPM_LINK=1
LINK_SKILLS=0
FORCE=0
NON_INTERACTIVE=0

# -------- arg parsing --------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --vault) VAULT="$2"; shift 2 ;;
    --name) VAULT_NAME="$2"; shift 2 ;;
    --project) PROJECT_SLUG="$2"; shift 2 ;;
    --skills-dir) SKILLS_DIR="$2"; shift 2 ;;
    --commands-dir) COMMANDS_DIR="$2"; shift 2 ;;
    --no-skills) INSTALL_SKILLS=0; shift ;;
    --no-commands) INSTALL_COMMANDS=0; shift ;;
    --no-npm-link) NPM_LINK=0; shift ;;
    --link) LINK_SKILLS=1; shift ;;
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
echo "  Vault path     : $VAULT"
echo "  Vault name     : $VAULT_NAME"
echo "  First project  : $PROJECT_SLUG"
echo "  Skills dir     : $SKILLS_DIR     (install: $([[ $INSTALL_SKILLS -eq 1 ]] && echo yes || echo no))"
echo "  Commands dir   : $COMMANDS_DIR   (install: $([[ $INSTALL_COMMANDS -eq 1 ]] && echo yes || echo no))"
echo "  npm link brain : $([[ $NPM_LINK -eq 1 ]] && echo yes || echo no)"
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

# Copy kb-skeleton contents (preserves hidden files, .gitkeep, etc.)
cp -R "$SCRIPT_DIR/kb-skeleton/." "$VAULT/"

# Project label = Title Case version of slug
PROJECT_LABEL=$(echo "$PROJECT_SLUG" | tr '-' ' ' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)} 1')

# Rename PROJECT_TEMPLATE -> $PROJECT_SLUG
mv "$VAULT/PROJECT_TEMPLATE" "$VAULT/$PROJECT_SLUG"

# Substitute placeholders
# package.json
sed -i.bak \
  -e "s|__VAULT_NAME__|$VAULT_NAME|g" \
  -e "s|__DEFAULT_PROJECT__|$PROJECT_SLUG|g" \
  "$VAULT/package.json"
rm "$VAULT/package.json.bak"

# kanban.base
sed -i.bak \
  -e "s|__PROJECT_SLUG__|$PROJECT_SLUG|g" \
  -e "s|__PROJECT_LABEL__|$PROJECT_LABEL|g" \
  "$VAULT/$PROJECT_SLUG/kanban.base"
rm "$VAULT/$PROJECT_SLUG/kanban.base.bak"

# project index.md
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

# -------- step 3: skills --------
install_skill() {
  local src="$1" dest_dir="$2"
  local name
  name=$(basename "$src")
  local dest="$dest_dir/$name"
  if [[ -e "$dest" ]]; then
    if ! confirm_overwrite "$dest"; then
      echo "    skipped: $name"; return
    fi
    rm -rf "$dest"
  fi
  if [[ $LINK_SKILLS -eq 1 ]]; then
    ln -s "$src" "$dest"
    echo "    linked: $name -> $src"
  else
    cp -R "$src" "$dest"
    echo "    copied: $name"
  fi
}

if [[ $INSTALL_SKILLS -eq 1 ]]; then
  echo
  echo "==> Installing skills to $SKILLS_DIR"
  mkdir -p "$SKILLS_DIR"
  for skill in "$SCRIPT_DIR/skills"/*/; do
    install_skill "${skill%/}" "$SKILLS_DIR"
  done
fi

if [[ $INSTALL_COMMANDS -eq 1 ]]; then
  echo
  echo "==> Installing slash commands to $COMMANDS_DIR"
  mkdir -p "$COMMANDS_DIR"
  for cmd in "$SCRIPT_DIR/commands"/*.md; do
    name=$(basename "$cmd")
    dest="$COMMANDS_DIR/$name"
    if [[ -e "$dest" ]] && ! confirm_overwrite "$dest"; then
      echo "    skipped: $name"; continue
    fi
    if [[ $LINK_SKILLS -eq 1 ]]; then
      ln -sf "$cmd" "$dest"
      echo "    linked: $name"
    else
      cp "$cmd" "$dest"
      echo "    copied: $name"
    fi
  done
fi

# -------- step 4: smoke test --------
echo
echo "==> Smoke test"
if command -v brain >/dev/null 2>&1; then
  brain root 2>/dev/null && echo "    brain root works"
  brain projects 2>/dev/null | head -5 || true
else
  node "$VAULT/bin/brain.mjs" projects 2>/dev/null | head -5 || true
fi

echo
echo "==> Done."
echo
echo "Next steps:"
echo "  1. Open the vault in Obsidian: $VAULT"
echo "  2. Try: brain brief"
echo "  3. Create your first issue: brain issue-create $PROJECT_SLUG \"Test issue\""
echo "  4. Open Claude Code in any project and try /brain-dev or /wrap"
echo
