#!/usr/bin/env node
//
// brain — knowledge base CLI
//
// Two containers: docs/ for what stays true, work/ for what is in flight.
// There are no issue IDs, no projects, no kanban and no status fields.
// AGENTS.md has the routing rule.

import { readdir, readFile, writeFile, rename, stat } from "node:fs/promises";
import { join, relative, basename } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { existsSync, appendFileSync, mkdirSync, readFileSync } from "node:fs";

const KB_ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const DOCS_DIR = join(KB_ROOT, "docs");
const WORK_DIR = join(KB_ROOT, "work");
const TODO_FILE = join(WORK_DIR, "todo.md");
const ARCHIVE_DIR = join(KB_ROOT, "archive");
const RAW_DIR = join(KB_ROOT, "raw");
const OUTPUT_DIR = join(KB_ROOT, "output");
const SESSIONS_DIR = join(KB_ROOT, "sessions");
const HANDOFF_DIR = join(SESSIONS_DIR, "handoffs");
const JOURNAL_DIR = join(KB_ROOT, "journal");
const SCRIPTS_DIR = join(KB_ROOT, "scripts");

// A work file untouched for this long is probably dead. This is the only
// lifecycle in the system, and the filesystem maintains it rather than you.
const STALE_WORK_DAYS = 30;

// The vault name drives obsidian:// URIs, so read it from package.json —
// a renamed vault folder still produces working links.
function loadVaultName() {
  try {
    const pkg = JSON.parse(readFileSync(join(KB_ROOT, "package.json"), "utf8"));
    if (typeof pkg.name === "string" && pkg.name) return pkg.name;
  } catch {}
  return basename(KB_ROOT);
}
const VAULT_NAME = loadVaultName();

// ─── Helpers ────────────────────────────────────────────────────────────────

// OSC 8 terminal hyperlinks — clickable in iTerm2, Ghostty, WezTerm, Warp.
const osc8 = (url, text) => `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
const obsidianLink = (vaultPath, label) =>
  osc8(
    `obsidian://open?vault=${VAULT_NAME}&file=${encodeURIComponent(vaultPath)}`,
    label || vaultPath,
  );

const rel = (path) => relative(KB_ROOT, path);
const todayStr = () => new Date().toISOString().split("T")[0];
const nowTime = () =>
  new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

async function walk(dir, pattern = /\.md$/) {
  const out = [];
  try {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, item.name);
      if (item.isDirectory()) out.push(...(await walk(full, pattern)));
      else if (pattern.test(item.name)) out.push(full);
    }
  } catch {} // directory does not exist
  return out;
}

function timeSince(date) {
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

// Resolve a user-supplied path against the vault. Accepts a vault-relative
// path, a bare work slug, or a bare docs name.
function resolvePath(input) {
  if (!input) return null;
  const direct = join(KB_ROOT, input);
  if (existsSync(direct)) return direct;
  const withMd = direct.endsWith(".md") ? direct : `${direct}.md`;
  if (existsSync(withMd)) return withMd;
  for (const dir of [WORK_DIR, DOCS_DIR, ARCHIVE_DIR]) {
    const candidate = join(dir, input.endsWith(".md") ? input : `${input}.md`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

// ─── work ───────────────────────────────────────────────────────────────────

// The single "what am I on the hook for" view. Priority comes from the order
// of lines in todo.md; recency comes from the filesystem. Nothing to groom.
async function work() {
  console.log("");

  if (existsSync(TODO_FILE)) {
    const lines = readFileSync(TODO_FILE, "utf8")
      .split("\n")
      .filter((l) => /^\s*- \[ \]/.test(l))
      .map((l) => l.replace(/^\s*- \[ \]\s*/, ""));
    if (lines.length) {
      console.log("  todo  \x1b[2m(order is priority)\x1b[0m");
      lines.forEach((l) => console.log(`    · ${l}`));
      console.log("");
    }
  }

  const files = (await walk(WORK_DIR)).filter((f) => basename(f) !== "todo.md");
  if (!files.length) {
    console.log("  \x1b[2mnothing in flight\x1b[0m\n");
    return;
  }

  const stats = await Promise.all(
    files.map(async (f) => ({ file: f, mtime: (await stat(f)).mtime })),
  );
  stats.sort((a, b) => b.mtime - a.mtime);

  console.log("  in flight");
  for (const { file, mtime } of stats) {
    const name = basename(file, ".md");
    const age = Math.floor((Date.now() - mtime.getTime()) / 86400000);
    const stale = age >= STALE_WORK_DAYS ? "  \x1b[33m← stale, archive it?\x1b[0m" : "";
    console.log(
      `    ${obsidianLink(rel(file), name.padEnd(34))} \x1b[2m${timeSince(mtime)}\x1b[0m${stale}`,
    );
  }
  console.log("");
}

// Finishing is one move, not a state transition.
async function done(name) {
  if (!name) die("Usage: brain done <name>");
  const src = resolvePath(name) || join(WORK_DIR, `${name}.md`);
  if (!existsSync(src)) die(`No work file: ${name}`);
  ensureDir(ARCHIVE_DIR);
  const dest = join(ARCHIVE_DIR, basename(src));
  await rename(src, dest);
  console.log(`archived → ${rel(dest)}`);
}

// ─── read and write ─────────────────────────────────────────────────────────

async function readArticle(path) {
  const full = resolvePath(path);
  if (!full) die(`Not found: ${path}`);
  console.log(await readFile(full, "utf8"));
}

async function writeArticle(path, text) {
  if (!path || text === undefined) die("Usage: brain write <path> <text>");
  const full = path.endsWith(".md") ? join(KB_ROOT, path) : `${join(KB_ROOT, path)}.md`;
  ensureDir(join(full, ".."));
  await writeFile(full, text.endsWith("\n") ? text : `${text}\n`);
  console.log(`wrote → ${rel(full)}`);
}

async function appendArticle(path, text) {
  if (!path || text === undefined) die("Usage: brain append <path> <text>");
  const full = resolvePath(path);
  if (!full) die(`Not found: ${path}`);
  appendFileSync(full, `\n${text}\n`);
  console.log(`appended → ${rel(full)}`);
}

async function find(pattern) {
  if (!pattern) die("Usage: brain find <pattern>");
  const needle = pattern.toLowerCase();
  const hits = (await walk(KB_ROOT)).filter((f) => basename(f).toLowerCase().includes(needle));
  if (!hits.length) return console.log("no matches");
  hits.forEach((f) => console.log(`  ${obsidianLink(rel(f))}`));
}

async function recent(n = 10) {
  const files = await walk(KB_ROOT);
  const stats = await Promise.all(
    files.map(async (f) => ({ file: f, mtime: (await stat(f)).mtime })),
  );
  stats.sort((a, b) => b.mtime - a.mtime);
  for (const { file, mtime } of stats.slice(0, Number(n) || 10)) {
    console.log(`  ${obsidianLink(rel(file), rel(file).padEnd(46))} \x1b[2m${timeSince(mtime)}\x1b[0m`);
  }
}

function openInObsidian(path) {
  const full = resolvePath(path);
  if (!full) die(`Not found: ${path}`);
  const uri = `obsidian://open?vault=${VAULT_NAME}&file=${encodeURIComponent(rel(full))}`;
  spawnSync("open", [uri]);
}

function edit(path) {
  const full = resolvePath(path);
  if (!full) die(`Not found: ${path}`);
  spawnSync(process.env.EDITOR || "nvim", [full], { stdio: "inherit" });
}

// ─── capture ────────────────────────────────────────────────────────────────

// Session log: what the agent found. Journal: what the user thinks. Separate
// on purpose — one is generated, the other is not.
function appendDated(dir, text, label) {
  ensureDir(dir);
  const file = join(dir, `${todayStr()}.md`);
  if (!text) {
    if (!existsSync(file)) return console.log(`no ${label} for today`);
    return console.log(readFileSync(file, "utf8"));
  }
  if (!existsSync(file)) writeFileSyncHeader(file);
  appendFileSync(file, `- ${nowTime()} ${text}\n`);
  console.log(`${label} → ${rel(file)}`);
}

function writeFileSyncHeader(file) {
  appendFileSync(file, `# ${todayStr()}\n\n`);
}

const log = (text) => appendDated(SESSIONS_DIR, text, "log");
const note = (text) => appendDated(JOURNAL_DIR, text, "note");

// ─── session handoff ────────────────────────────────────────────────────────

function gitState() {
  try {
    const repo = process.cwd();
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: repo, stdio: ["ignore", "pipe", "ignore"] })
      .toString().trim();
    const dirty = execSync("git status --porcelain", { cwd: repo, stdio: ["ignore", "pipe", "ignore"] })
      .toString().trim().split("\n").filter(Boolean);
    const commits = execSync("git log --oneline -5", { cwd: repo, stdio: ["ignore", "pipe", "ignore"] })
      .toString().trim();
    return { branch, dirty, commits };
  } catch {
    return null;
  }
}

// Writes the doc the next session reads. It collects only what still exists:
// work in flight, today's findings, and git. No projects, PRs, or WIP registry.
async function handoff(topic) {
  ensureDir(HANDOFF_DIR);
  const id = `h-${todayStr().replace(/-/g, "")}-${nowTime().replace(":", "")}${topic ? `-${slugify(topic)}` : ""}`;
  const file = join(HANDOFF_DIR, `${id}.md`);

  const workFiles = (await walk(WORK_DIR)).filter((f) => basename(f) !== "todo.md");
  const todayLog = join(SESSIONS_DIR, `${todayStr()}.md`);
  const git = gitState();

  const lines = [
    "---",
    `id: ${id}`,
    `date: ${todayStr()}`,
    topic ? `topic: ${topic}` : null,
    "---",
    "",
    `# Handoff${topic ? `: ${topic}` : ""}`,
    "",
    "## Next action",
    "",
    "<!-- one sentence: the very next thing to do -->",
    "",
    "## Where we are",
    "",
    "<!-- what changed this session, and why -->",
    "",
    "## In flight",
    "",
    ...(workFiles.length ? workFiles.map((f) => `- ${rel(f)}`) : ["- nothing"]),
    "",
  ];

  if (git) {
    lines.push("## Git", "", `- branch: ${git.branch}`, `- uncommitted: ${git.dirty.length} file(s)`, "", "```", git.commits, "```", "");
  }

  if (existsSync(todayLog)) {
    lines.push("## Today's findings", "", readFileSync(todayLog, "utf8").trim(), "");
  }

  await writeFile(file, lines.filter((l) => l !== null).join("\n"));
  console.log(`handoff → ${rel(file)}`);
  console.log(`\nnext session:  brain pickup`);
}

// Renamed from `resume` — that collides with Claude Code's built-in /resume.
async function pickup(id) {
  const files = (await walk(HANDOFF_DIR)).sort();
  if (!files.length) return console.log("no handoffs yet");
  const target = id ? files.find((f) => basename(f).includes(id)) : files[files.length - 1];
  if (!target) die(`No handoff matching: ${id}`);
  console.log(readFileSync(target, "utf8"));
  console.log("\n" + "─".repeat(60));
  await work();
}

// ─── search ─────────────────────────────────────────────────────────────────

function qmdCmd(args) {
  const r = spawnSync("qmd", args, { stdio: "inherit" });
  if (r.error) die("qmd not found — install it or use `brain find` for filename search");
  process.exit(r.status ?? 0);
}

// ─── ingest ─────────────────────────────────────────────────────────────────

// The three script-backed ingesters call Python you supply in scripts/.
// ingest-clip is self-contained.
function runIngestScript(scriptName, outDir, args, label) {
  const script = join(SCRIPTS_DIR, scriptName);
  if (!existsSync(script)) die(`Script not found: ${rel(script)}\nProvide it in scripts/, or use brain ingest-clip.`);
  console.log(`${label} → ${rel(outDir)}/`);
  execSync(`python3 "${script}" ${args.map((a) => `"${a}"`).join(" ")} "${outDir}"`, { stdio: "inherit" });
}

async function ingestClip(url) {
  if (!url) die("Usage: brain ingest-clip <url>");
  const slug = slugify(url.replace(/https?:\/\//, ""));
  const outFile = join(RAW_DIR, "clips", `${slug}.md`);
  ensureDir(join(outFile, ".."));
  await writeFile(
    outFile,
    `---\nsource_url: ${url}\nsource_type: clip\ningested: ${todayStr()}\ndomain: ${new URL(url).hostname}\n---\n\n# ${url}\n\n*Clipped ${todayStr()} — content fetched during compilation.*\n`,
  );
  console.log(`clipped → ${rel(outFile)}`);
}

// ─── help ───────────────────────────────────────────────────────────────────

function help() {
  console.log(`
  brain — knowledge base CLI

  Two containers. docs/ is what stays true; work/ is what's in flight.
  No issue IDs, no projects, no kanban, no status fields.

  Work:
    brain work                  What's in flight — todo.md, then files by recency
    brain done <name>           Move a work file to archive/

  Read & write:
    brain read <path>           Print an article
    brain write <path> <text>   Write or overwrite
    brain append <path> <text>  Append
    brain find <pattern>        Find by filename
    brain recent [n]            Most recently modified (default 10)
    brain open <path>           Open in Obsidian
    brain edit <path>           Open in $EDITOR
    brain root                  Print the vault path

  Search:
    brain search <query>        Full-text (qmd BM25)
    brain query <query>         Hybrid — BM25 + vectors + rerank
    brain qmd <args...>         Pass anything to qmd

  Capture:
    brain log [text]            Agent findings (no args = read today)
    brain note [text]           Your journal (no args = read today)

  Session:
    brain handoff [topic]       Write the doc the next session reads
    brain pickup [id]           Load the latest handoff, then brain work

  Ingest:
    brain ingest-clip <url>     Clip a URL into raw/clips/
    brain ingest-bookmarks <f>  Chrome bookmark HTML  (needs scripts/)
    brain ingest-pdfs <dir>     PDFs to markdown      (needs scripts/)
    brain ingest-tweets         Bookmark export       (needs scripts/)

  Where does it go?  Still true in six months → docs/. Otherwise → work/.
`);
}

// ─── dispatch ───────────────────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "work": await work(); break;
  case "done": await done(args[0]); break;

  case "read": await readArticle(args[0]); break;
  case "write": await writeArticle(args[0], args.slice(1).join(" ")); break;
  case "append": await appendArticle(args[0], args.slice(1).join(" ")); break;
  case "find": await find(args[0]); break;
  case "recent": await recent(args[0]); break;
  case "open": openInObsidian(args[0]); break;
  case "edit": edit(args[0]); break;
  case "root": console.log(KB_ROOT); break;

  case "search": qmdCmd(["search", ...args]); break;
  case "query": qmdCmd(["query", ...args]); break;
  case "qmd": qmdCmd(args); break;

  case "log": log(args.join(" ")); break;
  case "note": note(args.join(" ")); break;

  case "handoff": await handoff(args.join(" ")); break;
  case "pickup": await pickup(args[0]); break;

  case "ingest-clip": await ingestClip(args[0]); break;
  case "ingest-bookmarks":
    if (!args[0]) die("Usage: brain ingest-bookmarks <file.html>");
    runIngestScript("parse-bookmarks.py", join(RAW_DIR, "bookmarks"), [args[0]], "Parsing bookmarks");
    break;
  case "ingest-pdfs":
    if (!args[0]) die("Usage: brain ingest-pdfs <directory>");
    runIngestScript("convert-pdfs.py", join(RAW_DIR, "articles"), [args[0]], "Converting PDFs");
    break;
  case "ingest-tweets":
    runIngestScript("export-field-theory.py", join(RAW_DIR, "tweets"), [], "Exporting bookmarks");
    break;

  case "help":
  case "--help":
  case "-h":
  case undefined:
    help();
    break;
  default:
    console.error(`Unknown command: ${cmd}`);
    help();
    process.exit(1);
}
