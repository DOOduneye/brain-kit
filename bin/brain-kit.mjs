#!/usr/bin/env node
// brain-kit CLI
//
//   brain-kit init      Scaffold a vault, npm-link brain, install skills
//   brain-kit install   Reinstall skills into selected agent targets
//   brain-kit help

import { execSync, spawnSync } from "node:child_process";
import {
  cpSync, existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync,
  rmSync, statSync, renameSync, symlinkSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const HOME = process.env.HOME || process.env.USERPROFILE;

const VALID_TARGETS = new Set(["claude-code", "codex", "pi", "none"]);

// ---------- arg parsing ----------

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const key = eq === -1 ? a.slice(2) : a.slice(2, eq);
      const val = eq === -1
        ? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true)
        : a.slice(eq + 1);
      args.flags[key] = val;
    } else if (a === "-y") {
      args.flags.yes = true;
    } else {
      args._.push(a);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "help";

// ---------- io helpers ----------

const rl = (q) => {
  const r = createInterface({ input: stdin, output: stdout });
  return r.question(q).finally(() => r.close());
};

async function ask(question, fallback) {
  if (args.flags.yes) return fallback;
  const a = (await rl(`${question} [${fallback}]: `)).trim();
  return a || fallback;
}

async function confirm(question, defaultYes = true) {
  if (args.flags.yes) return true;
  const a = (await rl(`${question} [${defaultYes ? "Y/n" : "y/N"}]: `)).trim().toLowerCase();
  if (!a) return defaultYes;
  return a.startsWith("y");
}

const log = (...x) => console.log(...x);
const die = (msg) => { console.error(`error: ${msg}`); process.exit(1); };

// ---------- core ops ----------

function stripFrontmatter(md) {
  if (!md.startsWith("---")) return md;
  const end = md.indexOf("\n---", 4);
  if (end === -1) return md;
  return md.slice(end + 4).replace(/^\n+/, "");
}

function extractFrontmatter(md) {
  if (!md.startsWith("---")) return {};
  const end = md.indexOf("\n---", 4);
  if (end === -1) return {};
  const yaml = md.slice(4, end);
  const out = {};
  for (const line of yaml.split("\n")) {
    const m = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function copyDir(src, dest) {
  cpSync(src, dest, { recursive: true });
}

function replaceInFile(path, replacements) {
  let body = readFileSync(path, "utf8");
  for (const [from, to] of replacements) body = body.replaceAll(from, to);
  writeFileSync(path, body);
}

function npmLink(cwd) {
  try {
    execSync("npm link", { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ---------- skeleton scaffold ----------

function scaffoldVault({ vault, vaultName }) {
  if (existsSync(vault) && readdirSync(vault).length > 0) {
    throw new Error(`${vault} is not empty. Pick a different path or empty it first.`);
  }
  mkdirSync(vault, { recursive: true });
  copyDir(join(ROOT, "kb-skeleton"), vault);
  replaceInFile(join(vault, "package.json"), [["__VAULT_NAME__", vaultName]]);
}

// ---------- target installers ----------

function installClaudeCode({ skillsDir, commandsDir, force, linkFiles }) {
  mkdirSync(skillsDir, { recursive: true });
  for (const name of readdirSync(join(ROOT, "skills"))) {
    const src = join(ROOT, "skills", name);
    const dest = join(skillsDir, name);
    if (existsSync(dest)) {
      if (!force) { log(`  skip ${name} (exists)`); continue; }
      rmSync(dest, { recursive: true, force: true });
    }
    if (linkFiles) symlinkSync(src, dest);
    else copyDir(src, dest);
    log(`  ${linkFiles ? "linked" : "wrote"} ${dest}`);
  }
  mkdirSync(commandsDir, { recursive: true });
  for (const name of readdirSync(join(ROOT, "commands"))) {
    const src = join(ROOT, "commands", name);
    const dest = join(commandsDir, name);
    if (existsSync(dest) && !force) { log(`  skip ${name} (exists)`); continue; }
    if (existsSync(dest)) rmSync(dest, { force: true });
    if (linkFiles) symlinkSync(src, dest);
    else cpSync(src, dest);
    log(`  ${linkFiles ? "linked" : "wrote"} ${dest}`);
  }
}

function installPi({ piDir, force, linkFiles }) {
  // Pi uses the same SKILL.md format as Claude Code — just a different directory.
  mkdirSync(piDir, { recursive: true });
  for (const name of readdirSync(join(ROOT, "skills"))) {
    const src = join(ROOT, "skills", name);
    const dest = join(piDir, name);
    if (existsSync(dest)) {
      if (!force) { log(`  skip ${name} (exists)`); continue; }
      rmSync(dest, { recursive: true, force: true });
    }
    if (linkFiles) symlinkSync(src, dest);
    else copyDir(src, dest);
    log(`  ${linkFiles ? "linked" : "wrote"} ${dest}`);
  }
}

function spliceSkillsIntoAgentsMd(target) {
  let body = existsSync(target)
    ? readFileSync(target, "utf8")
    : readFileSync(join(ROOT, "adapters", "agents-md", "header.md"), "utf8");

  // Strip any prior brain-kit block
  body = body.replace(
    /<!-- brain-kit:start -->[\s\S]*?<!-- brain-kit:end -->\n?/,
    ""
  );

  // Build fresh block
  const parts = ["<!-- brain-kit:start -->",
    "<!-- managed by brain-kit — content between markers is regenerated -->"];
  for (const name of readdirSync(join(ROOT, "skills"))) {
    const skillPath = join(ROOT, "skills", name, "SKILL.md");
    if (!existsSync(skillPath)) continue;
    parts.push(`\n## ${name}\n`);
    parts.push(stripFrontmatter(readFileSync(skillPath, "utf8")));
    const refDir = join(ROOT, "skills", name, "references");
    if (existsSync(refDir)) {
      for (const ref of readdirSync(refDir)) {
        if (!ref.endsWith(".md")) continue;
        parts.push(`\n### ${name} — ${basename(ref, ".md")}\n`);
        parts.push(readFileSync(join(refDir, ref), "utf8"));
      }
    }
  }
  parts.push("\n<!-- brain-kit:end -->\n");

  body = body.replace(/\n*$/, "\n\n") + parts.join("\n");
  writeFileSync(target, body);
}

// Codex has no skills system. It reads AGENTS.md at the project root and
// ~/.codex/instructions.md globally. The right "install" is making sure
// AGENTS.md exists where Codex will find it.
function installCodex({ vault, codexInstructions, force }) {
  spliceSkillsIntoAgentsMd(join(vault, "AGENTS.md"));
  log(`  spliced into ${join(vault, "AGENTS.md")}`);
  if (codexInstructions) {
    mkdirSync(dirname(codexInstructions), { recursive: true });
    if (existsSync(codexInstructions) && !force) {
      log(`  skip ${codexInstructions} (exists, use --force)`);
    } else {
      spliceSkillsIntoAgentsMd(codexInstructions);
      log(`  spliced into ${codexInstructions}`);
    }
  }
}

function installTargets({ targets, vault, force, linkFiles, opts }) {
  for (const t of targets) {
    if (!VALID_TARGETS.has(t)) die(`unknown target: ${t}`);
  }
  for (const t of targets) {
    log(`\n${t}`);
    switch (t) {
      case "claude-code":
        installClaudeCode({
          skillsDir: opts.skillsDir || join(HOME, ".claude/skills"),
          commandsDir: opts.commandsDir || join(HOME, ".claude/commands"),
          force, linkFiles,
        });
        break;
      case "pi":
        installPi({
          piDir: opts.piDir || join(HOME, ".pi/agent/skills"),
          force, linkFiles,
        });
        break;
      case "codex":
        installCodex({
          vault,
          codexInstructions: opts.codexInstructions ?? join(HOME, ".codex/AGENTS.md"),
          force,
        });
        break;
      case "none":
        log("  no skills installed");
        break;
    }
  }
  // Vault AGENTS.md always gets the splice — it's the cross-tool source.
  if (!targets.includes("codex")) {
    spliceSkillsIntoAgentsMd(join(vault, "AGENTS.md"));
    log(`\nvault AGENTS.md spliced: ${join(vault, "AGENTS.md")}`);
  }
}

// ---------- subcommands ----------

async function cmdInit() {
  const vault = resolveHome(
    args.flags.vault ||
    await ask("Vault path", join(HOME, "Documents/brain"))
  );
  const vaultName = args.flags.name || await ask("Vault name", basename(vault));
  const targets = (args.flags.target || await ask(
    "Targets (comma-separated: claude-code, codex, pi, none)",
    "claude-code"
  )).split(",").map(s => s.trim());
  const force = !!args.flags.force;
  const linkFiles = !!args.flags.link;

  log(`\nvault   ${vault}`);
  log(`name    ${vaultName}`);
  log(`targets ${targets.join(", ")}\n`);
  if (!(await confirm("Proceed?", true))) { log("aborted"); return; }

  scaffoldVault({ vault, vaultName });
  log(`scaffolded ${vault}`);

  if (!args.flags["no-npm-link"]) {
    if (npmLink(vault)) log(`brain CLI linked (${execSync("which brain", { encoding: "utf8" }).trim()})`);
    else log(`npm link failed — run \`cd ${vault} && npm link\` manually`);
  }

  installTargets({
    targets, vault, force, linkFiles,
    opts: {
      skillsDir: args.flags["skills-dir"],
      commandsDir: args.flags["commands-dir"],
      piDir: args.flags["pi-dir"],
      codexInstructions: args.flags["codex-agents-md"],
    },
  });

  log(`\ndone. try: brain work`);
}

async function cmdInstall() {
  const vault = resolveHome(args.flags.vault || die("--vault required (or run from a vault)"));
  if (!existsSync(join(vault, "package.json"))) die(`${vault} doesn't look like a brain-kit vault`);
  const targets = (args.flags.target || "claude-code")
    .split(",").map(s => s.trim());
  const force = !!args.flags.force;
  const linkFiles = !!args.flags.link;
  installTargets({
    targets, vault, force, linkFiles,
    opts: {
      skillsDir: args.flags["skills-dir"],
      commandsDir: args.flags["commands-dir"],
      piDir: args.flags["pi-dir"],
      codexInstructions: args.flags["codex-agents-md"],
    },
  });
}

function cmdHelp() {
  log(`brain-kit — KB dev workflow for agent CLIs

Usage:
  brain-kit init [options]      scaffold a vault, link the brain CLI, install skills
  brain-kit install [options]   reinstall skills into an existing vault
  brain-kit help

Options for init/install:
  --vault PATH                  vault location (init: where to create; install: which to use)
  --name NAME                   vault name (init only; defaults to basename)
  --project SLUG                first project slug (init only; defaults to "work")
  --target LIST                 comma-separated: claude-code, codex, pi, none
                                default: claude-code
  --skills-dir PATH             override Claude Code skills dir
  --commands-dir PATH           override Claude Code commands dir
  --pi-dir PATH                 override Pi skills dir (default: ~/.pi/agent/skills)
  --codex-agents-md PATH        also splice into a global Codex AGENTS.md
                                (default: ~/.codex/AGENTS.md)
  --link                        symlink files instead of copying
  --force                       overwrite existing files
  --no-npm-link                 skip \`npm link\` (init only)
  --yes, -y                     accept all prompts
`);
}

function resolveHome(p) {
  return p.startsWith("~/") ? join(HOME, p.slice(2)) : resolve(p);
}

// ---------- dispatch ----------

const dispatch = { init: cmdInit, install: cmdInstall, help: cmdHelp };
const fn = dispatch[cmd] || cmdHelp;
Promise.resolve(fn()).catch(e => { console.error(e.message || e); process.exit(1); });
