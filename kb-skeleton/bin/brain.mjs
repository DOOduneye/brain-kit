#!/usr/bin/env node

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, basename, extname } from "node:path";
import { execSync } from "node:child_process";
import { existsSync, appendFileSync, mkdirSync, readFileSync } from "node:fs";

const KB_ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const RAW_DIR = join(KB_ROOT, "raw");
const LIBRARY_DIR = join(KB_ROOT, "library");
const OUTPUT_DIR = join(KB_ROOT, "output");

// Team folders live at the vault root. A directory is a "team" if it has an
// `issues/` subdir. Reserved root dirs are excluded so we don't accidentally
// treat library/, raw/, etc. as teams.
const RESERVED_ROOT_DIRS = new Set([
  "library", "raw", "output", "sessions", "journal", "scripts",
  "bin", "docs", "archive", "personal", "Excalidraw", "node_modules",
]);

async function getTeamDirs() {
  const entries = await readdir(KB_ROOT, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !RESERVED_ROOT_DIRS.has(e.name))
    .filter((e) => existsSync(join(KB_ROOT, e.name, "issues")))
    .map((e) => e.name);
}

async function walkTeams() {
  const teams = await getTeamDirs();
  const out = [];
  for (const t of teams) out.push(...(await walk(join(KB_ROOT, t))));
  return out;
}
const SESSIONS_DIR = join(KB_ROOT, "sessions");
const JOURNAL_DIR = join(KB_ROOT, "journal");
const QUERY_LOG = join(KB_ROOT, "output", ".query-log.jsonl");
const WIP_FILE = join(KB_ROOT, "output", ".wip.json");
const SCRIPTS_DIR = join(KB_ROOT, "scripts");
const STALE_ARTICLE_DAYS = 30;

// Vault name drives the obsidian:// URI scheme. Read it from package.json at
// the vault root so a renamed vault folder still produces working links.
function loadVaultName() {
  try {
    const pkg = JSON.parse(readFileSync(join(KB_ROOT, "package.json"), "utf8"));
    if (pkg.name && typeof pkg.name === "string") return pkg.name;
  } catch {}
  return basename(KB_ROOT);
}
const VAULT_NAME = loadVaultName();

// Default project slug — used by commands that take an optional project arg.
// Set in package.json under brainKit.defaultProject, fallback to first project dir found.
function loadDefaultProject() {
  try {
    const pkg = JSON.parse(readFileSync(join(KB_ROOT, "package.json"), "utf8"));
    if (pkg.brainKit?.defaultProject) return pkg.brainKit.defaultProject;
  } catch {}
  return null;
}
const DEFAULT_PROJECT = loadDefaultProject();

// Issue ID prefix per project. Defaults to two-letter initials of the hyphenated
// project name (customer-intelligence → CI, platform → PL, data-warehouse → DW),
// overridable via package.json `brainKit.projectPrefixes`.
function loadProjectPrefixes() {
  try {
    const pkg = JSON.parse(readFileSync(join(KB_ROOT, "package.json"), "utf8"));
    return pkg.brainKit?.projectPrefixes || {};
  } catch { return {}; }
}
const PROJECT_PREFIXES = loadProjectPrefixes();
function projectPrefix(project) {
  if (PROJECT_PREFIXES[project]) return PROJECT_PREFIXES[project];
  const parts = project.split("-").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return project.toUpperCase().slice(0, 2);
}

// OSC 8 terminal hyperlinks — clickable in iTerm2, Warp, WezTerm, etc.
function osc8(url, text) {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}
function obsidianLink(vaultPath, label) {
  const uri = `obsidian://open?vault=${VAULT_NAME}&file=${encodeURIComponent(vaultPath)}`;
  return osc8(uri, label || vaultPath);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function walk(dir, pattern = /\.md$/) {
  const entries = [];
  try {
    const items = await readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const full = join(dir, item.name);
      if (item.isDirectory()) {
        entries.push(...(await walk(full, pattern)));
      } else if (pattern.test(item.name)) {
        entries.push(full);
      }
    }
  } catch {
    // directory doesn't exist
  }
  return entries;
}

function rel(path) {
  return relative(KB_ROOT, path);
}

async function getFrontmatter(filepath) {
  const content = await readFile(filepath, "utf-8");
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":");
    if (key && rest.length) {
      fm[key.trim()] = rest.join(":").trim();
    }
  }
  return fm;
}

// ─── Commands ───────────────────────────────────────────────────────────────

async function status() {
  const rawFiles = await walk(RAW_DIR);
  const libraryFiles = (await walk(LIBRARY_DIR)).filter(
    (f) => !f.endsWith("index.md")
  );
  const projectFiles = (await walkTeams()).filter(
    (f) => !f.endsWith("index.md")
  );
  const outputFiles = await walk(OUTPUT_DIR);

  // Count by raw subdirectory
  const rawCounts = {};
  for (const f of rawFiles) {
    const subdir = relative(RAW_DIR, f).split("/")[0];
    rawCounts[subdir] = (rawCounts[subdir] || 0) + 1;
  }

  // Count by library subdirectory
  const libCounts = {};
  for (const f of libraryFiles) {
    const subdir = relative(LIBRARY_DIR, f).split("/")[0];
    libCounts[subdir] = (libCounts[subdir] || 0) + 1;
  }

  // Find articles without sources frontmatter (potentially uncompiled)
  const articlesWithSources = [];
  const articlesWithoutSources = [];
  for (const f of libraryFiles) {
    const fm = await getFrontmatter(f);
    if (fm.sources) {
      articlesWithSources.push(f);
    } else {
      articlesWithoutSources.push(f);
    }
  }

  console.log(`\n  ╭─────────────────────────────────────╮`);
  console.log(`  │  b r a i n  ·  knowledge base       │`);
  console.log(`  ╰─────────────────────────────────────╯\n`);

  console.log(`  RAW SOURCES  ${rawFiles.length} files`);
  for (const [dir, count] of Object.entries(rawCounts).sort()) {
    console.log(`    ${dir.padEnd(20)} ${count}`);
  }

  console.log(`\n  LIBRARY  ${libraryFiles.length} articles`);
  for (const [dir, count] of Object.entries(libCounts).sort()) {
    console.log(`    ${dir.padEnd(20)} ${count}`);
  }

  console.log(`\n  PROJECTS  ${projectFiles.length} articles`);
  console.log(`  OUTPUT    ${outputFiles.length} files`);

  // Word count
  let totalWords = 0;
  for (const f of libraryFiles) {
    const content = await readFile(f, "utf-8");
    totalWords += content.split(/\s+/).length;
  }
  console.log(`\n  TOTAL WORDS  ~${Math.round(totalWords / 1000)}k`);

  // qmd status
  try {
    const qmdOut = execSync("qmd status 2>/dev/null", { encoding: "utf-8" });
    const docsMatch = qmdOut.match(/Total:\s+(\d+) files/);
    const vecMatch = qmdOut.match(/Vectors:\s+(\d+) embedded/);
    if (docsMatch) {
      console.log(
        `\n  QMD  ${docsMatch[1]} indexed, ${vecMatch ? vecMatch[1] + " vectors" : "no vectors"}`
      );
    }
  } catch {
    console.log(`\n  QMD  not configured for this vault`);
  }

  console.log("");
}

async function ingestBookmarks(htmlFile) {
  if (!htmlFile) {
    console.error("Usage: brain ingest-bookmarks <file.html>");
    process.exit(1);
  }
  const script = join(SCRIPTS_DIR, "parse-bookmarks.py");
  if (!existsSync(script)) {
    console.error(`Script not found: ${script}`);
    process.exit(1);
  }
  const outDir = join(RAW_DIR, "bookmarks");
  console.log(`Parsing ${htmlFile} → ${rel(outDir)}/`);
  execSync(`python3 "${script}" "${htmlFile}" "${outDir}"`, {
    stdio: "inherit",
  });
}

async function ingestPdfs(inputDir) {
  if (!inputDir) {
    console.error("Usage: brain ingest-pdfs <directory>");
    process.exit(1);
  }
  const script = join(SCRIPTS_DIR, "convert-pdfs.py");
  if (!existsSync(script)) {
    console.error(`Script not found: ${script}`);
    process.exit(1);
  }
  const outDir = join(RAW_DIR, "articles", "engineering-blogs");
  console.log(`Converting PDFs from ${inputDir} → ${rel(outDir)}/`);
  execSync(`python3 "${script}" "${inputDir}" "${outDir}"`, {
    stdio: "inherit",
  });
}

async function ingestTweets() {
  const script = join(SCRIPTS_DIR, "export-field-theory.py");
  if (!existsSync(script)) {
    console.error(`Script not found: ${script}`);
    process.exit(1);
  }
  const outDir = join(RAW_DIR, "tweets");
  console.log(`Exporting Field Theory bookmarks → ${rel(outDir)}/`);
  execSync(`python3 "${script}" "${outDir}"`, { stdio: "inherit" });
}

async function ingestClip(url) {
  if (!url) {
    console.error("Usage: brain ingest-clip <url>");
    process.exit(1);
  }
  // Simple web clip: fetch URL, save as markdown with frontmatter
  const slug = url
    .replace(/https?:\/\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()
    .slice(0, 80);
  const outFile = join(RAW_DIR, "clips", `${slug}.md`);
  const today = new Date().toISOString().split("T")[0];
  const domain = new URL(url).hostname;

  const content = `---
source_url: ${url}
source_type: clip
ingested: ${today}
origin: brain-cli
domain: ${domain}
tags_from_source: []
---

# ${url}

*Clipped ${today} — content to be fetched and summarized during compilation.*
`;

  await writeFile(outFile, content);
  console.log(`Clipped → ${rel(outFile)}`);
  console.log(`Note: Run compilation to fetch and summarize the content.`);
}

// ─── Issues ─────────────────────────────────────────────────────────────────

async function getIssues(projectFilter, includeArchived = false) {
  const issueFiles = [];
  const teams = await getTeamDirs();
  for (const team of teams) {
    const pd = { name: team };

    // Skip archived areas unless explicitly requested
    if (!includeArchived && !projectFilter) {
      const indexPath = join(KB_ROOT, pd.name, "index.md");
      try {
        const indexFm = await getFrontmatter(indexPath);
        if (indexFm.status === "archived") continue;
      } catch {
        // no index.md, include by default
      }
    }

    const issuesDir = join(KB_ROOT, pd.name, "issues");
    // Archived issues live under `<team>/issues/archive/` and shouldn't surface
    // in briefs, kanbans, or counts unless the caller explicitly asks for them.
    const files = (await walk(issuesDir)).filter((f) => !f.includes("/archive/"));
    for (const f of files) {
      const content = await readFile(f, "utf-8");
      const fm = await getFrontmatter(f);
      // Parse tags from frontmatter (handle [tag1, tag2] format)
      const tagsRaw = fm.tags || "";
      const tags = tagsRaw.replace(/^\[|\]$/g, "").split(",").map(t => t.trim()).filter(Boolean);

      // Nested-project membership: `project: <slug>` in frontmatter attaches this
      // issue to a sub-project under `<area>/projects/<slug>/`. The flat `issues/`
      // layout stays — project membership is metadata, not a directory move.
      const projectSlug = fm.project || "";

      // projectFilter matches either the area (pd.name, the top-level folder)
      // OR the nested project slug, so `brain issues <slug>` works transparently.
      if (projectFilter && pd.name !== projectFilter && projectSlug !== projectFilter) continue;

      issueFiles.push({
        path: f,
        relPath: rel(f),
        project: pd.name,        // top-level area (e.g. "customer-intelligence") — legacy field name
        projectSlug,             // nested project slug from frontmatter (new)
        id: fm.id || basename(f, ".md"),
        title: fm.title || basename(f, ".md"),
        status: fm.status || "backlog",
        priority: fm.priority || "medium",
        area: fm.area || "",
        assignee: fm.assignee === "null" ? null : fm.assignee || null,
        reported: fm.reported || "",
        branch: fm.branch === "null" ? "" : fm.branch || "",
        tags,
        content,
      });
    }
  }
  return issueFiles;
}

// ─── Projects ──────────────────────────────────────────────────────────────

const PROJECT_GLYPH = {
  "in-progress": ">>",
  "pending-design": "..",
  pending: "..",
  backlog: "~~",
  shipping: "==",
  blocked: "xx",
  done: "==",
  archived: "  ",
};

async function getProjects() {
  const projects = [];
  const teams = await getTeamDirs();
  for (const team of teams) {
    const ad = { name: team };
    const projectsSubdir = join(KB_ROOT, ad.name, "projects");
    let subs;
    try {
      subs = await readdir(projectsSubdir, { withFileTypes: true });
    } catch {
      continue; // area has no nested projects folder
    }
    for (const sp of subs) {
      if (!sp.isDirectory()) continue;
      const dir = join(projectsSubdir, sp.name);
      const indexPath = join(dir, "index.md");
      if (!existsSync(indexPath)) continue;
      const fm = await getFrontmatter(indexPath);
      if (fm.type !== "project") continue;

      const todosPath = join(dir, "todos.md");
      let todosOpen = 0, todosDone = 0;
      try {
        const todosContent = await readFile(todosPath, "utf-8");
        todosOpen = (todosContent.match(/^- \[ \]/gm) || []).length;
        todosDone = (todosContent.match(/^- \[x\]/gmi) || []).length;
      } catch {}

      // Most-recent mtime across dir's markdown files — reflects real activity
      // better than just the index's mtime.
      let lastActivityMs = 0;
      for (const f of await walk(dir)) {
        const s = await stat(f);
        if (s.mtimeMs > lastActivityMs) lastActivityMs = s.mtimeMs;
      }

      projects.push({
        slug: fm.slug || sp.name,
        area: ad.name,
        path: indexPath,
        dir,
        todosPath,
        title: fm.title || sp.name,
        status: fm.status || "backlog",
        owner: fm.owner || "",
        tags: (fm.tags || "").replace(/^\[|\]$/g, "").split(",").map(t => t.trim()).filter(Boolean),
        lastActivityMs,
        todosOpen,
        todosDone,
      });
    }
  }
  return projects;
}

async function getProjectIssues(slug) {
  const all = await getIssues(null, true);
  return all.filter(i => i.projectSlug === slug);
}

// ─── Presentation helpers ──────────────────────────────────────────────────

// Renders `─── name ────── count ──` — section header with optional count.
// Width arg keeps the right rule short; content width dictates the natural cap.
function sectionRule(name, count, width = 42) {
  const left = `─── ${name} `;
  const tail = count == null ? "──" : ` ${count} ──`;
  const fillLen = Math.max(3, width - left.length - tail.length);
  return `  ${left}${"─".repeat(fillLen)}${tail}`;
}

// Compact relative time (`1h`, `5h`, `2d`) — shorter than timeSince's "… ago".
function compactTime(ms) {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

// ─── brain projects / brain project <slug> ────────────────────────────────

async function projectsList() {
  const list = await getProjects();
  if (!list.length) {
    console.log("\n  No projects found. Create one at projects/<area>/projects/<slug>/index.md with `type: project` frontmatter.\n");
    return;
  }
  list.sort((a, b) => b.lastActivityMs - a.lastActivityMs);

  const today = todayStr();
  console.log(`\n  ──── brain · projects ────────── ${today} ──\n`);

  for (const p of list) {
    const glyph = PROJECT_GLYPH[p.status] || "  ";
    const issues = await getProjectIssues(p.slug);
    const active = issues.filter(i => i.status === "in-progress").length;
    const total = issues.length;
    const parts = [];
    if (active || total) parts.push(`${active || total}${active ? "i" : "i"}`);
    if (p.todosOpen) parts.push(`todos ${p.todosOpen}`);
    const age = compactTime(p.lastActivityMs).padStart(3);
    const meta = parts.length ? parts.join(" · ") : p.status;
    console.log(`   ${glyph}  ${p.slug.padEnd(28)} ${meta.padEnd(24)} ${age}`);
  }
  console.log("");
}

async function projectShow(slug) {
  if (!slug) {
    console.error("Usage: brain project <slug>");
    process.exit(1);
  }
  const list = await getProjects();
  const project = list.find(p => p.slug === slug);
  if (!project) {
    console.error(`\n  No project matching "${slug}". Available:\n`);
    for (const p of list) console.error(`    ${p.slug}`);
    console.error("");
    process.exit(1);
  }

  const issues = await getProjectIssues(slug);
  const glyph = PROJECT_GLYPH[project.status] || "  ";

  const headerRule = "─".repeat(Math.max(3, 42 - project.slug.length - 12));
  console.log(`\n  ──── brain · ${project.slug} ${headerRule} ──\n`);
  console.log(`  ${glyph}  ${project.title}`);
  console.log(`      status ${project.status} · owner ${project.owner || "—"} · last activity ${compactTime(project.lastActivityMs)}`);
  console.log("");

  // Issues
  if (issues.length) {
    console.log(sectionRule("issues", issues.length));
    const byStatus = { "in-progress": [], backlog: [], blocked: [], done: [], "wont-fix": [] };
    for (const i of issues) (byStatus[i.status] || byStatus.backlog).push(i);
    for (const s of ["in-progress", "backlog", "blocked", "done", "wont-fix"]) {
      for (const i of byStatus[s] || []) {
        const pri = PRIORITY_ICON[i.priority] || "   ";
        const link = obsidianLink(i.relPath, i.id);
        const tail = i.branch ? `  [${i.branch}]` : "";
        console.log(`   ${pri}  ${link}  ${i.title}${tail}`);
      }
    }
    console.log("");
  }

  // Todos
  try {
    const todosContent = await readFile(project.todosPath, "utf-8");
    const lines = todosContent.split("\n").filter(l => /^- \[[ x]\]/i.test(l));
    if (lines.length) {
      console.log(sectionRule("todos", project.todosOpen));
      for (const l of lines) {
        const done = /^- \[x\]/i.test(l);
        const body = l.replace(/^- \[[ x]\]\s*/i, "").replace(/#project\/\S+/g, "").trim();
        console.log(`   ${done ? "✓" : " "}  ${body}`);
      }
      console.log("");
    }
  } catch {}

  // Decisions
  const decisionsDir = join(project.dir, "decisions");
  try {
    const decisionFiles = (await readdir(decisionsDir))
      .filter(f => f.endsWith(".md"))
      .sort()
      .reverse();
    if (decisionFiles.length) {
      console.log(sectionRule("decisions", decisionFiles.length));
      for (const f of decisionFiles) {
        const [, date, ...rest] = f.replace(/\.md$/, "").match(/^(\d{4}-\d{2}-\d{2})-(.+)$/) || [];
        if (date) console.log(`   ${date}  ${rest.join("-").replace(/-/g, " ")}`);
        else console.log(`   ${f}`);
      }
      console.log("");
    }
  } catch {}

  // Recent files in this project
  const projectFiles = await walk(project.dir);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recents = [];
  for (const f of projectFiles) {
    const s = await stat(f);
    if (s.mtimeMs > cutoff) recents.push({ path: f, mtime: s.mtimeMs });
  }
  recents.sort((a, b) => b.mtime - a.mtime);
  if (recents.length) {
    console.log(sectionRule("recent", recents.length));
    for (const { path: p, mtime } of recents.slice(0, 8)) {
      console.log(`   ${compactTime(mtime).padStart(3)}  ${obsidianLink(rel(p), rel(p).replace(project.dir.replace(KB_ROOT + "/", "") + "/", ""))}`);
    }
    console.log("");
  }
}

const STATUS_ORDER = ["in-progress", "backlog", "blocked", "done"];
const PRIORITY_ICON = { critical: "!!!", high: " !!", medium: "  !", low: "   " };
const STATUS_ICON = { "in-progress": "\x1b[33m●\x1b[0m", backlog: "\x1b[36m○\x1b[0m", blocked: "\x1b[31m■\x1b[0m", done: "\x1b[32m✓\x1b[0m" };

async function issues(projectFilter, includeArchived = false) {
  const allIssues = await getIssues(projectFilter, includeArchived);

  if (!allIssues.length) {
    console.log("\n  No issues found.\n");
    return;
  }

  console.log(`\n  ╭─────────────────────────────────────╮`);
  console.log(`  │  b r a i n  ·  issues                │`);
  console.log(`  ╰─────────────────────────────────────╯\n`);

  // Group by status
  const byStatus = {};
  for (const s of STATUS_ORDER) byStatus[s] = [];
  for (const issue of allIssues) {
    const s = issue.status;
    if (!byStatus[s]) byStatus[s] = [];
    byStatus[s].push(issue);
  }

  for (const status of STATUS_ORDER) {
    const group = byStatus[status];
    if (!group || !group.length) continue;
    const icon = STATUS_ICON[status] || "?";
    console.log(`  ${icon} ${status.toUpperCase()} (${group.length})`);
    for (const issue of group) {
      const pri = PRIORITY_ICON[issue.priority] || "   ";
      const assignee = issue.assignee ? ` → ${issue.assignee}` : "";
      const area = issue.area ? `[${issue.area}]` : "";
      const idLink = obsidianLink(rel(issue.path), issue.id);
      console.log(`    ${pri} ${idLink}  ${issue.title}  ${area}${assignee}`);
    }
    console.log("");
  }
}

async function kanban(projectFilter) {
  const allIssues = await getIssues(projectFilter);

  if (!allIssues.length) {
    console.log("\n  No issues found.\n");
    return;
  }

  // Generate kanban markdown
  const today = new Date().toISOString().split("T")[0];
  const byStatus = {};
  for (const s of STATUS_ORDER) byStatus[s] = [];
  for (const issue of allIssues) {
    const s = issue.status;
    if (!byStatus[s]) byStatus[s] = [];
    byStatus[s].push(issue);
  }

  const project = projectFilter || "all";
  let md = `---\ntype: kanban\nupdated: ${today}\n---\n\n# Kanban: ${project}\n\n*Auto-generated by \`brain kanban\`. Do not edit — edit individual issue files instead.*\n\n`;

  for (const status of STATUS_ORDER) {
    const group = byStatus[status];
    const icon = { "in-progress": "🔶", backlog: "📋", blocked: "🔴", done: "✅" }[status] || "❓";
    md += `## ${icon} ${status.charAt(0).toUpperCase() + status.slice(1)} (${group.length})\n\n`;
    if (!group.length) {
      md += `*No issues*\n\n`;
      continue;
    }
    for (const issue of group) {
      const pri = { critical: "🔴", high: "🟠", medium: "🟡", low: "🟢" }[issue.priority] || "⚪";
      const assignee = issue.assignee ? ` → **${issue.assignee}**` : "";
      md += `- ${pri} **[[issues/${basename(issue.path, ".md")}|${issue.id}]]**: ${issue.title}${assignee}\n`;
    }
    md += `\n`;
  }

  md += `---\n\n## Issue Counts\n\n`;
  md += `| Status | Count |\n|--------|-------|\n`;
  for (const status of STATUS_ORDER) {
    md += `| ${status} | ${(byStatus[status] || []).length} |\n`;
  }
  md += `| **Total** | **${allIssues.length}** |\n`;

  // Write to team directory
  const outPath = projectFilter
    ? join(KB_ROOT, projectFilter, "kanban.md")
    : join(KB_ROOT, "kanban.md");

  await writeFile(outPath, md);
  console.log(`  Kanban written → ${rel(outPath)}`);
  console.log(`  ${allIssues.length} issues across ${STATUS_ORDER.filter(s => (byStatus[s] || []).length).length} columns\n`);
}

// Resolve the next available issue ID for a team (e.g. "CI-060" for
// customer-intelligence). Same prefix logic as issueCreate. Defaults to the
// only team if there's exactly one, otherwise requires the team arg.
async function nextId(project) {
  if (!project) {
    const teams = await getTeamDirs();
    if (teams.length === 1) {
      project = teams[0];
    } else {
      console.error("Usage: brain next-id <team>");
      console.error("  Available teams: " + teams.join(", "));
      process.exit(1);
    }
  }
  const issuesDir = join(KB_ROOT, project, "issues");
  if (!existsSync(issuesDir)) {
    console.error(`No issues dir for team: ${project}`);
    process.exit(1);
  }
  const prefix = projectPrefix(project);
  let maxNum = 0;
  for (const f of await walk(issuesDir)) {
    const fm = await getFrontmatter(f);
    const m = (fm.id || "").match(new RegExp(`${prefix}-(\\d+)`));
    if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
  }
  const next = `${prefix}-${String(maxNum + 1).padStart(3, "0")}`;
  console.log(next);
}

async function issueCreate(project, title) {
  if (!project || !title) {
    console.error("Usage: brain issue-create <project> <title>");
    process.exit(1);
  }

  const issuesDir = join(KB_ROOT, project, "issues");
  const existing = await walk(issuesDir);

  // Find next ID
  const prefix = projectPrefix(project);
  let maxNum = 0;
  for (const f of existing) {
    const fm = await getFrontmatter(f);
    const id = fm.id || "";
    const match = id.match(new RegExp(`${prefix}-(\\d+)`));
    if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
  }
  const nextNum = maxNum + 1;
  const id = `${prefix}-${String(nextNum).padStart(3, "0")}`;

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60).replace(/-$/, "");
  const filename = `${id.toLowerCase()}-${slug}.md`;
  const filepath = join(issuesDir, filename);
  const today = new Date().toISOString().split("T")[0];

  const content = renderIssueTemplate(project, { id, title, today, slug });

  await writeFile(filepath, content);
  console.log(`  Created → ${rel(filepath)}`);
}

// Per-project template lookup with fallback to built-in default.
// Substitutes {{id}}, {{title}}, {{today}}, {{slug}} placeholders.
function renderIssueTemplate(project, vars) {
  const projectTemplate = join(KB_ROOT, project, "issue-template.md");
  let raw;
  if (existsSync(projectTemplate)) {
    raw = readFileSync(projectTemplate, "utf8");
  } else {
    raw = DEFAULT_ISSUE_TEMPLATE;
  }
  return raw.replace(/\{\{(id|title|today|slug)\}\}/g, (_, k) => vars[k] ?? "");
}

const DEFAULT_ISSUE_TEMPLATE = `---
id: {{id}}
title: {{title}}
status: backlog
priority: medium
area:
reported: {{today}}
assignee: null
tags: []
slack:
branch:
---

# {{id}}: {{title}}

## Problem

*(What's broken or missing, and why it matters.)*

## Solution

*(Data model changes, behavior per state, UI if relevant, v1 scope. Be specific enough that an agent can implement this without asking questions.)*

## Files

*(Paths with line refs and patterns to follow. Code pointers over prose.)*

## Boundaries

*(What's out of scope. What to ask before starting.)*

## Acceptance Criteria

- [ ] *(Concrete, testable checkboxes)*

## Related

*(Wiki links to project articles, library patterns, other issues)*
`;

async function updateIndex() {
  try {
    execSync("qmd update && qmd embed", { stdio: "inherit" });
    console.log("qmd index updated.");
  } catch {
    console.log(
      "qmd not configured for this vault. Run qmd collection add to set up."
    );
  }
}

async function lint() {
  const libraryFiles = (await walk(LIBRARY_DIR)).filter(
    (f) => !f.endsWith("index.md")
  );

  console.log(`\n  Linting ${libraryFiles.length} library articles...\n`);

  // Check 1: Articles without frontmatter
  const noFrontmatter = [];
  const noSources = [];
  const noRelated = [];
  const noUpdated = [];
  const allArticles = new Map();

  for (const f of libraryFiles) {
    const content = await readFile(f, "utf-8");
    const fm = await getFrontmatter(f);
    const relPath = rel(f);
    allArticles.set(relPath, { fm, content });

    if (!content.startsWith("---")) noFrontmatter.push(relPath);
    if (!fm.sources) noSources.push(relPath);
    if (!fm.related) noRelated.push(relPath);
    if (!fm.updated) noUpdated.push(relPath);
  }

  // Check 2: Broken wiki links
  const brokenLinks = [];
  const articleSlugs = new Set(
    libraryFiles.map((f) =>
      relative(LIBRARY_DIR, f).replace(/\.md$/, "")
    )
  );

  for (const f of libraryFiles) {
    const content = await readFile(f, "utf-8");
    const links = content.matchAll(/\[\[([^\]]+)\]\]/g);
    for (const match of links) {
      const target = match[1].replace(/\|.*$/, ""); // handle [[path|display]]
      if (!articleSlugs.has(target)) {
        brokenLinks.push({ from: rel(f), to: target });
      }
    }
  }

  // Check 3: Orphan articles (no incoming links)
  const linkedTo = new Set();
  for (const f of libraryFiles) {
    const content = await readFile(f, "utf-8");
    const links = content.matchAll(/\[\[([^\]]+)\]\]/g);
    for (const match of links) {
      linkedTo.add(match[1].replace(/\|.*$/, ""));
    }
  }
  const orphans = libraryFiles
    .map((f) => relative(LIBRARY_DIR, f).replace(/\.md$/, ""))
    .filter((slug) => !linkedTo.has(slug))
    .filter((slug) => !slug.startsWith("guides/")); // guides are entry points, not orphans

  // Report
  if (noFrontmatter.length) {
    console.log(`  ⚠ Missing frontmatter (${noFrontmatter.length}):`);
    noFrontmatter.forEach((f) => console.log(`    ${f}`));
    console.log("");
  }

  if (noSources.length) {
    console.log(`  ⚠ Missing sources field (${noSources.length}):`);
    noSources.forEach((f) => console.log(`    ${f}`));
    console.log("");
  }

  if (brokenLinks.length) {
    console.log(`  ✗ Broken wiki links (${brokenLinks.length}):`);
    brokenLinks.forEach((l) => console.log(`    ${l.from} → [[${l.to}]]`));
    console.log("");
  }

  if (orphans.length) {
    console.log(`  ○ Orphan articles — no incoming links (${orphans.length}):`);
    orphans.forEach((f) => console.log(`    ${f}`));
    console.log("");
  }

  // Check 4: Duplicate issue IDs across all teams.
  const idToFiles = new Map();
  for (const team of await getTeamDirs()) {
    const issuesDir = join(KB_ROOT, team, "issues");
    for (const f of await walk(issuesDir)) {
      const fm = await getFrontmatter(f);
      if (!fm.id) continue;
      const list = idToFiles.get(fm.id) || [];
      list.push(rel(f));
      idToFiles.set(fm.id, list);
    }
  }
  const duplicateIds = [...idToFiles.entries()].filter(([, files]) => files.length > 1);
  if (duplicateIds.length) {
    console.log(`  ✗ Duplicate issue IDs (${duplicateIds.length}):`);
    for (const [id, files] of duplicateIds) {
      console.log(`    ${id}:`);
      files.forEach((f) => console.log(`      ${f}`));
    }
    console.log("");
  }

  if (
    !noFrontmatter.length &&
    !brokenLinks.length &&
    !orphans.length &&
    !noSources.length &&
    !duplicateIds.length
  ) {
    console.log("  ✓ All checks passed.\n");
  }
}

// ─── Read / Write / Navigate ────────────────────────────────────────────────

async function readArticle(pathArg) {
  if (!pathArg) {
    console.error("Usage: brain read <path>");
    console.error("  e.g. brain read library/systems/temporal.md");
    console.error("       brain read customer-intelligence/issues/ci-001-foo.md");
    process.exit(1);
  }
  const full = join(KB_ROOT, pathArg);
  try {
    const content = await readFile(full, "utf-8");
    console.log(content);
  } catch {
    console.error(`Not found: ${pathArg}`);
    console.error(`KB root: ${KB_ROOT}`);
    process.exit(1);
  }
}

async function appendArticle(pathArg, content) {
  if (!pathArg || !content) {
    console.error("Usage: brain append <path> <content>");
    console.error('  e.g. brain append library/systems/temporal.md "## New Section\\nContent here"');
    process.exit(1);
  }
  const full = join(KB_ROOT, pathArg);
  try {
    const existing = await readFile(full, "utf-8");
    // Unescape \n and \t in content string
    const parsed = content.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
    const newContent = existing.endsWith("\n")
      ? existing + "\n" + parsed + "\n"
      : existing + "\n\n" + parsed + "\n";
    await writeFile(full, newContent);
    console.log(`  Appended to ${pathArg}`);
  } catch {
    console.error(`Not found: ${pathArg}`);
    process.exit(1);
  }
}

async function writeArticle(pathArg, content) {
  if (!pathArg || !content) {
    console.error("Usage: brain write <path> <content>");
    process.exit(1);
  }
  const full = join(KB_ROOT, pathArg);
  const parsed = content.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  await writeFile(full, parsed.endsWith("\n") ? parsed : parsed + "\n");
  console.log(`  Wrote ${pathArg}`);
}

function root() {
  console.log(KB_ROOT);
}

async function issueRead(idArg) {
  if (!idArg) {
    console.error("Usage: brain issue <id>");
    console.error("  e.g. brain issue CI-042");
    process.exit(1);
  }
  const needle = idArg.toUpperCase();
  const allIssues = await getIssues(null, true);
  const match = allIssues.find(i => i.id.toUpperCase() === needle);
  if (!match) {
    console.error(`Issue not found: ${idArg}`);
    const close = allIssues
      .filter(i => i.id.toUpperCase().startsWith(needle.split("-")[0]))
      .slice(0, 5);
    if (close.length) {
      console.error("  Did you mean:");
      close.forEach(i => console.error(`    ${i.id}  ${i.title}`));
    }
    process.exit(1);
  }
  console.log(match.content);
}

async function recent(n = 10) {
  const limit = parseInt(n) || 10;
  const allFiles = [
    ...(await walk(LIBRARY_DIR)),
    ...(await walkTeams()),
    ...(await walk(OUTPUT_DIR)),
  ];
  const withMtime = await Promise.all(
    allFiles.map(async (f) => {
      const s = await stat(f);
      return { path: f, mtime: s.mtimeMs };
    })
  );
  withMtime.sort((a, b) => b.mtime - a.mtime);

  console.log(`\n  Recently modified (top ${limit}):\n`);
  for (const { path: p, mtime } of withMtime.slice(0, limit)) {
    const ago = timeSince(mtime);
    const fm = await getFrontmatter(p);
    const title = fm.title || fm.id || "";
    const label = title ? `  ${title}` : "";
    console.log(`  ${ago.padEnd(12)} ${rel(p)}${label}`);
  }
  console.log("");
}

function timeSince(ms) {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

async function find(pattern) {
  if (!pattern) {
    console.error("Usage: brain find <pattern>");
    console.error("  e.g. brain find temporal");
    console.error("       brain find slack*.md");
    process.exit(1);
  }
  const EXCLUDED = new Set(["personal", "_agent", "bin", "node_modules", "raw", "Excalidraw"]);
  const allFiles = (await walk(KB_ROOT, /\.(md|base)$/)).filter(
    (f) => !EXCLUDED.has(relative(KB_ROOT, f).split("/")[0])
  );
  // If pattern has glob chars, use minimatch-style; otherwise substring match
  const isGlob = /[*?]/.test(pattern);
  const lowerPattern = pattern.toLowerCase();
  const matches = allFiles.filter((f) => {
    const r = rel(f).toLowerCase();
    if (isGlob) {
      // Simple glob: * = any chars, ? = single char
      const re = new RegExp(
        "^" + lowerPattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
      );
      return re.test(r) || re.test(basename(f).toLowerCase());
    }
    return r.includes(lowerPattern);
  });

  if (!matches.length) {
    console.log(`  No files matching "${pattern}"`);
    return;
  }
  console.log(`\n  ${matches.length} match${matches.length === 1 ? "" : "es"}:\n`);
  for (const f of matches) {
    console.log(`  ${rel(f)}`);
  }
  console.log("");
}

async function openInObsidian(pathArg) {
  if (!pathArg) {
    console.error("Usage: brain open <path|issue-id>");
    process.exit(1);
  }
  // Try resolving as issue ID first (e.g. CI-005)
  if (/^[A-Za-z]+-\d+$/.test(pathArg)) {
    const allIssues = await getIssues(null, true);
    const match = allIssues.find(i => i.id.toUpperCase() === pathArg.toUpperCase());
    if (match) {
      obsidianCmd("open", [`path=${rel(match.path)}`]);
      return;
    }
  }
  obsidianCmd("open", [`path=${pathArg}`]);
}

async function diff(hoursArg) {
  const hours = parseInt(hoursArg) || 24;
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const allFiles = [
    ...(await walk(LIBRARY_DIR)),
    ...(await walkTeams()),
    ...(await walk(OUTPUT_DIR)),
  ];
  const changed = [];
  for (const f of allFiles) {
    const s = await stat(f);
    if (s.mtimeMs > cutoff) {
      changed.push({ path: f, mtime: s.mtimeMs });
    }
  }
  changed.sort((a, b) => b.mtime - a.mtime);

  if (!changed.length) {
    console.log(`\n  No changes in the last ${hours}h.\n`);
    return;
  }

  console.log(`\n  Changed in the last ${hours}h (${changed.length} file${changed.length === 1 ? "" : "s"}):\n`);
  for (const { path: p, mtime } of changed) {
    const ago = timeSince(mtime);
    console.log(`  ${ago.padEnd(12)} ${rel(p)}`);
  }
  console.log("");
}

function tree(folder) {
  const target = folder ? join(KB_ROOT, folder) : KB_ROOT;
  try {
    execSync(`tree -I 'node_modules|.git|raw|Excalidraw|personal|archive|bin' --dirsfirst -L 3 "${target}"`, {
      stdio: "inherit",
    });
  } catch {
    console.error("tree not found — install with: brew install tree");
    process.exit(1);
  }
}

function edit(pathArg) {
  if (!pathArg) {
    console.error("Usage: brain edit <path>");
    process.exit(1);
  }
  const full = join(KB_ROOT, pathArg);
  const editor = process.env.EDITOR || "vim";
  try {
    execSync(`${editor} "${full}"`, { stdio: "inherit" });
  } catch {
    console.error(`Failed to open ${pathArg} in ${editor}`);
    process.exit(1);
  }
}

// ─── Brief & Check ──────────────────────────────────────────────────────────

const STALE_DAYS = 5;

async function brief(argv = []) {
  const jsonOut = argv.includes("--json");

  const allIssues = await getIssues(null, false);
  const projects = await getProjects();
  const projectSlugs = new Set(projects.map(p => p.slug));

  // Active = in-progress. Split: those attached to a project go under PROJECTS,
  // the rest fall into LOOSE ISSUES. Backlog always goes to NEXT UP regardless.
  const inProgress = allIssues.filter(i => i.status === "in-progress");
  const backlog = allIssues.filter(i => i.status === "backlog");

  const looseActive = inProgress.filter(i => !i.projectSlug || !projectSlugs.has(i.projectSlug));
  const looseBacklog = backlog.filter(i => !i.projectSlug || !projectSlugs.has(i.projectSlug));

  if (jsonOut) {
    // Build a canonical structured representation that mirrors the text output.
    // An agent consuming --json gets the same information without needing to
    // parse terminal formatting.
    const projectData = [];
    for (const p of projects) {
      const issues = await getProjectIssues(p.slug);
      projectData.push({
        slug: p.slug,
        status: p.status,
        owner: p.owner,
        lastActivityMs: p.lastActivityMs,
        todosOpen: p.todosOpen,
        issues: issues.map(i => ({ id: i.id, title: i.title, status: i.status, priority: i.priority, branch: i.branch || null })),
      });
    }
    const gitLines = await collectGit();
    const payload = {
      date: todayStr(),
      projects: projectData,
      looseIssues: {
        active: looseActive.map(i => ({ id: i.id, title: i.title, priority: i.priority, area: i.area })),
        backlog: looseBacklog.map(i => ({ id: i.id, title: i.title, priority: i.priority, area: i.area })),
      },
      git: gitLines,
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`\n  ──── brain · brief ──────────── ${todayStr()} ──\n`);

  // PROJECTS — each with a mini child-issue list
  if (projects.length) {
    projects.sort((a, b) => b.lastActivityMs - a.lastActivityMs);
    console.log(sectionRule("projects", projects.length));
    for (const p of projects) {
      const glyph = PROJECT_GLYPH[p.status] || "  ";
      const issues = await getProjectIssues(p.slug);
      const activeCount = issues.filter(i => i.status === "in-progress").length;
      const total = issues.length;
      const age = compactTime(p.lastActivityMs).padStart(3);

      const metaParts = [];
      if (total) metaParts.push(`${total}i`);
      if (activeCount && activeCount !== total) metaParts.push(`${activeCount} active`);
      if (p.todosOpen) metaParts.push(`todos ${p.todosOpen}`);
      if (!metaParts.length) metaParts.push(p.status);
      const meta = metaParts.join(" · ");

      console.log(`   ${glyph}  ${p.slug.padEnd(28)} ${meta.padEnd(22)} ${age}`);

      // Children — only show in-progress + backlog, not done
      const visible = issues.filter(i => i.status !== "done" && i.status !== "wont-fix");
      for (let i = 0; i < visible.length; i++) {
        const issue = visible[i];
        const last = i === visible.length - 1;
        const branch = last ? "└─" : "├─";
        const link = obsidianLink(rel(issue.path), issue.id);
        console.log(`       ${branch} ${link}  ${issue.title}`);
      }
      console.log("");
    }
  }

  // LOOSE ISSUES — in-progress issues not attached to a discovered project
  if (looseActive.length) {
    console.log(sectionRule("loose issues", looseActive.length));
    for (const issue of looseActive) {
      const pri = PRIORITY_ICON[issue.priority] || "   ";
      const tag = issue.area ? `  ${issue.area}` : "";
      const link = obsidianLink(rel(issue.path), issue.id);
      console.log(`   ${pri}  ${link}  ${issue.title}${tag}`);
    }
    console.log("");
  }

  // NEXT UP — backlog (loose-only; project backlog shows under projects)
  if (looseBacklog.length) {
    const priOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const sorted = [...looseBacklog].sort((a, b) => (priOrder[a.priority] ?? 9) - (priOrder[b.priority] ?? 9));
    const show = sorted.slice(0, 5);
    console.log(sectionRule("next up", looseBacklog.length));
    for (const issue of show) {
      const pri = PRIORITY_ICON[issue.priority] || "   ";
      const tag = issue.area ? `  ${issue.area}` : "";
      const link = obsidianLink(rel(issue.path), issue.id);
      console.log(`   ${pri}  ${link}  ${issue.title}${tag}`);
    }
    if (looseBacklog.length > show.length) console.log(`       … and ${looseBacklog.length - show.length} more`);
    console.log("");
  }

  // GIT — recent branches + PR state
  const gitLines = await collectGit();
  if (gitLines.length) {
    console.log(sectionRule("git", gitLines.length));
    for (const line of gitLines) console.log(`   ${line}`);
    console.log("");
  }

  // RECENT files
  const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
  const allFiles = [
    ...(await walk(LIBRARY_DIR)),
    ...(await walkTeams()),
    ...(await walk(OUTPUT_DIR)),
  ];
  const recentFiles = [];
  for (const f of allFiles) {
    const s = await stat(f);
    if (s.mtimeMs > cutoff24h) recentFiles.push({ path: f, mtime: s.mtimeMs });
  }
  recentFiles.sort((a, b) => b.mtime - a.mtime);

  if (recentFiles.length) {
    const show = recentFiles.slice(0, 8);
    console.log(sectionRule("recent", recentFiles.length));
    for (const { path: p, mtime } of show) {
      const relPath = rel(p);
      const link = obsidianLink(relPath, relPath);
      console.log(`   ${compactTime(mtime).padStart(3)}  ${link}`);
    }
    if (recentFiles.length > 8) console.log(`       … and ${recentFiles.length - 8} more`);
    console.log("");
  }

  // SESSIONS (agent-facing log)
  const todayLog = join(SESSIONS_DIR, `${todayStr()}.md`);
  const yesterdayLog = join(SESSIONS_DIR, `${new Date(Date.now() - 86400000).toISOString().split("T")[0]}.md`);
  let sessionLines = [];
  for (const logFile of [todayLog, yesterdayLog]) {
    try {
      const raw = await readFile(logFile, "utf-8");
      const entries = raw.split("\n").filter(l => l.startsWith("**"));
      const label = logFile === todayLog ? "" : " (yesterday)";
      sessionLines.push(...entries.map(l => l + label));
    } catch {}
  }
  if (sessionLines.length) {
    const show = sessionLines.slice(-5);
    console.log(sectionRule("sessions", null));
    for (const line of show) console.log(`   ${line}`);
    console.log("");
  }

  // JOURNAL (user's private notes)
  const todayJournal = join(JOURNAL_DIR, `${todayStr()}.md`);
  const yesterdayJournal = join(JOURNAL_DIR, `${new Date(Date.now() - 86400000).toISOString().split("T")[0]}.md`);
  let journalLines = [];
  for (const logFile of [todayJournal, yesterdayJournal]) {
    try {
      const raw = await readFile(logFile, "utf-8");
      const entries = raw.split("\n").filter(l => l.startsWith("**"));
      const label = logFile === todayJournal ? "" : " (yesterday)";
      journalLines.push(...entries.map(l => l + label));
    } catch {}
  }
  if (journalLines.length) {
    const show = journalLines.slice(-5);
    console.log(sectionRule("journal", null));
    for (const line of show) console.log(`   ${line}`);
    console.log("");
  }

  // DRIFT
  const warnings = await getDriftWarnings(allIssues, allFiles);
  if (warnings.length) {
    console.log(sectionRule("drift", warnings.length));
    for (const w of warnings) console.log(`   ${w}`);
    console.log("");
  }
}

// Resolve the git repo to inspect for the GIT section. Precedence:
//   1. $BRAIN_REPO env var (explicit override)
//   2. Current working directory, if it's inside a git repo
//   3. brainKit.defaultRepo in package.json (relative to $HOME, e.g. "work/main-repo")
function resolveGitRepo() {
  const tryRepo = (dir) => {
    try {
      const r = execSync(`git -C "${dir}" rev-parse --show-toplevel 2>/dev/null`, { encoding: "utf-8" }).trim();
      return r || null;
    } catch { return null; }
  };
  if (process.env.BRAIN_REPO) {
    const r = tryRepo(process.env.BRAIN_REPO);
    if (r) return r;
  }
  const cwd = tryRepo(process.cwd());
  if (cwd) return cwd;
  try {
    const pkg = JSON.parse(readFileSync(join(KB_ROOT, "package.json"), "utf8"));
    if (pkg.brainKit?.defaultRepo) {
      const p = pkg.brainKit.defaultRepo.startsWith("/")
        ? pkg.brainKit.defaultRepo
        : join(process.env.HOME || "", pkg.brainKit.defaultRepo);
      return tryRepo(p);
    }
  } catch {}
  return null;
}

// Collect recent git branches + PR state from `gh` for the brief's GIT section.
// Returns an array of preformatted lines so brief() can just print them.
async function collectGit() {
  const repo = resolveGitRepo();
  if (!repo) return [];
  const lines = [];
  let branches = [];
  try {
    const raw = execSync(
      `git -C "${repo}" for-each-ref --sort=-committerdate refs/heads/ --format='%(refname:short)|%(committerdate:unix)' --count=10 2>/dev/null`,
      { encoding: "utf-8" }
    );
    // Filter to branches actually touched recently (48h window, matches the section label).
    const cutoff = Math.floor(Date.now() / 1000) - 48 * 60 * 60;
    branches = raw.trim().split("\n").filter(Boolean).map(l => {
      const [name, ts] = l.split("|");
      return { name, ts: parseInt(ts, 10) };
    }).filter(b => b.ts >= cutoff);
  } catch {
    return [];
  }
  if (!branches.length) return [];

  let head = "";
  try {
    head = execSync(`git -C "${repo}" rev-parse --abbrev-ref HEAD 2>/dev/null`, { encoding: "utf-8" }).trim();
  } catch {}

  // PR state per branch via a single `gh` call — fastest path. Authored-by-me
  // is a reasonable default; override-by-flag can come later.
  let prs = new Map();
  try {
    const raw = execSync(
      `gh pr list --author @me --state all --limit 30 --json number,state,headRefName,updatedAt 2>/dev/null`,
      { encoding: "utf-8", cwd: repo }
    );
    const data = JSON.parse(raw);
    for (const pr of data) prs.set(pr.headRefName, pr);
  } catch {}

  for (const { name, ts } of branches) {
    const pr = prs.get(name);
    let glyph;
    if (name === head) glyph = ">>";
    else if (pr && pr.state === "MERGED") glyph = "==";
    else if (pr && pr.state === "OPEN") glyph = "  ";
    else glyph = " .";

    let tail;
    if (pr && pr.state === "MERGED") {
      tail = compactTime(new Date(pr.updatedAt).getTime());
    } else {
      let ahead = "";
      try {
        const n = execSync(`git -C "${repo}" rev-list --count main..${name} 2>/dev/null`, { encoding: "utf-8" }).trim();
        if (n && n !== "0") ahead = `${n}↑`;
      } catch {}
      tail = ahead || compactTime(ts * 1000);
    }
    const prLabel = pr ? `#${pr.number}` : "";
    const displayName = name.length > 44 ? name.slice(0, 41) + "…" : name;
    lines.push(`${glyph}  ${displayName.padEnd(44)}${tail.padStart(5)}   ${prLabel}`);
  }
  return lines;
}

async function getDriftWarnings(allIssues, allFiles) {
  const warnings = [];
  const staleCutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;

  // 1. Stale in-progress issues — no activity in STALE_DAYS. Prefer the
  // `last_touched:` frontmatter field (set by `brain tidy issue`) over file
  // mtime, since editing frontmatter touches mtime without reflecting work.
  const inProgress = (allIssues || await getIssues(null, false)).filter(i => i.status === "in-progress");
  for (const issue of inProgress) {
    const fm = await getFrontmatter(issue.path);
    let activityMs;
    if (fm.last_touched) {
      const t = Date.parse(fm.last_touched);
      activityMs = Number.isNaN(t) ? null : t;
    }
    if (activityMs == null) {
      const s = await stat(issue.path);
      activityMs = s.mtimeMs;
    }
    if (activityMs < staleCutoff) {
      warnings.push(`\x1b[33m!\x1b[0m ${issue.id} in-progress but untouched for ${timeSince(activityMs)}`);
    }
  }

  // 2. In-progress with no branch set
  for (const issue of inProgress) {
    const fm = await getFrontmatter(issue.path);
    if (!fm.branch || fm.branch === "null") {
      warnings.push(`\x1b[33m!\x1b[0m ${issue.id} in-progress but no branch set`);
    }
  }

  // 3. Un-promoted extractions — output/*-extraction.md with no matching library
  // article. An extraction can declare its target explicitly with
  // `compiled_into: library/<path>.md` in frontmatter; that suppresses the
  // warning when the slug doesn't match by convention.
  const outputFiles = allFiles
    ? allFiles.filter(f => f.startsWith(OUTPUT_DIR))
    : await walk(OUTPUT_DIR);
  const libraryFiles = allFiles
    ? allFiles.filter(f => f.startsWith(LIBRARY_DIR))
    : await walk(LIBRARY_DIR);
  const libSlugs = new Set(libraryFiles.map(f => basename(f, ".md")));

  for (const f of outputFiles) {
    const name = basename(f, ".md");
    if (!name.endsWith("-extraction")) continue;
    const fm = await getFrontmatter(f);
    if (fm.compiled_into) {
      const target = join(KB_ROOT, fm.compiled_into);
      if (!existsSync(target)) {
        warnings.push(`\x1b[33m!\x1b[0m output/${name}.md compiled_into points to missing file: ${fm.compiled_into}`);
      }
      continue;
    }
    const topicSlug = name.replace(/-extraction$/, "");
    if (!libSlugs.has(topicSlug)) {
      warnings.push(`\x1b[36m○\x1b[0m output/${name}.md has no matching library article`);
    }
  }

  // 3b. Duplicate issue IDs across teams.
  {
    const idToFiles = new Map();
    for (const issue of allIssues || await getIssues(null, true)) {
      if (!issue.id) continue;
      const list = idToFiles.get(issue.id) || [];
      list.push(issue.relPath);
      idToFiles.set(issue.id, list);
    }
    for (const [id, files] of idToFiles) {
      if (files.length > 1) {
        warnings.push(`\x1b[31m✗\x1b[0m duplicate issue id ${id} across ${files.length} files (run brain lint)`);
      }
    }
  }

  // 4. Broken wiki links (quick check — count only)
  let brokenCount = 0;
  const articleSlugs = new Set(
    libraryFiles
      .filter(f => f.startsWith(LIBRARY_DIR))
      .map(f => relative(LIBRARY_DIR, f).replace(/\.md$/, ""))
  );
  for (const f of libraryFiles.filter(f => f.startsWith(LIBRARY_DIR))) {
    const content = await readFile(f, "utf-8");
    const links = content.matchAll(/\[\[([^\]]+)\]\]/g);
    for (const match of links) {
      const target = match[1].replace(/\|.*$/, "");
      if (!articleSlugs.has(target)) brokenCount++;
    }
  }
  if (brokenCount) {
    warnings.push(`\x1b[31m✗\x1b[0m ${brokenCount} broken wiki link${brokenCount === 1 ? "" : "s"} (run brain lint for details)`);
  }

  // 5. Stale library articles (not updated in STALE_ARTICLE_DAYS). Prefer the
  // `updated:` frontmatter date — it's a deliberate signal of content recency,
  // unlike mtime which moves on incidental edits and bulk filesystem ops.
  const staleCutoffArticle = Date.now() - STALE_ARTICLE_DAYS * 24 * 60 * 60 * 1000;
  const staleCategories = ["systems", "tools"]; // most likely to rot
  let staleCount = 0;
  for (const f of libraryFiles.filter(f => f.startsWith(LIBRARY_DIR))) {
    const relPath = relative(LIBRARY_DIR, f);
    const category = relPath.split("/")[0];
    if (!staleCategories.includes(category)) continue;
    const fm = await getFrontmatter(f);
    let recencyMs;
    if (fm.updated) {
      const t = Date.parse(fm.updated);
      recencyMs = Number.isNaN(t) ? null : t;
    }
    if (recencyMs == null) {
      const s = await stat(f);
      recencyMs = s.mtimeMs;
    }
    if (recencyMs < staleCutoffArticle) staleCount++;
  }
  if (staleCount) {
    warnings.push(`\x1b[36m○\x1b[0m ${staleCount} systems/tools article${staleCount === 1 ? "" : "s"} not updated in ${STALE_ARTICLE_DAYS}+ days`);
  }

  // 6. Active WIP sessions
  const wipEntries = await getWipEntries();
  for (const e of wipEntries) {
    const alive = e.pid ? isProcessAlive(e.pid) : null;
    if (alive) {
      warnings.push(`\x1b[33m●\x1b[0m ${e.id} is being worked in another session (pid:${e.pid})`);
    } else if (alive === false) {
      warnings.push(`\x1b[31m!\x1b[0m ${e.id} has a stale WIP marker (pid:${e.pid} dead) — run brain wip done ${e.id}`);
    }
  }

  return warnings;
}

async function check(idArg) {
  if (!idArg) {
    // No id — check all in-progress issues
    const allIssues = await getIssues(null, false);
    const inProgress = allIssues.filter(i => i.status === "in-progress");

    if (!inProgress.length) {
      console.log("\n  No in-progress issues to check.\n");
      return;
    }

    console.log(`\n  ╭─────────────────────────────────────╮`);
    console.log(`  │  b r a i n  ·  check                 │`);
    console.log(`  ╰─────────────────────────────────────╯\n`);

    for (const issue of inProgress) {
      await checkOne(issue);
      console.log("");
    }
    return;
  }

  // Specific issue
  const needle = idArg.toUpperCase();
  const allIssues = await getIssues(null, true);
  const issue = allIssues.find(i => i.id.toUpperCase() === needle);
  if (!issue) {
    console.error(`Issue not found: ${idArg}`);
    process.exit(1);
  }

  console.log(`\n  ╭─────────────────────────────────────╮`);
  console.log(`  │  b r a i n  ·  check                 │`);
  console.log(`  ╰─────────────────────────────────────╯\n`);

  await checkOne(issue);
  console.log("");
}

async function checkOne(issue) {
  const fm = await getFrontmatter(issue.path);
  const s = await stat(issue.path);
  const content = await readFile(issue.path, "utf-8");

  const statusIcon = STATUS_ICON[issue.status] || "?";
  console.log(`  ${statusIcon} ${issue.id}: ${issue.title}`);
  console.log(`    status:     ${issue.status}`);
  console.log(`    priority:   ${issue.priority}`);
  console.log(`    area:       ${fm.area || "\x1b[33m(empty)\x1b[0m"}`);
  console.log(`    branch:     ${fm.branch && fm.branch !== "null" ? fm.branch : "\x1b[33m(not set)\x1b[0m"}`);
  console.log(`    tags:       ${issue.tags.length ? issue.tags.join(", ") : "\x1b[33m(none)\x1b[0m"}`);
  console.log(`    reported:   ${fm.reported || "\x1b[33m(missing)\x1b[0m"}`);
  console.log(`    modified:   ${timeSince(s.mtimeMs)}`);

  // Check for shipped section
  const hasShipped = /^## Shipped/m.test(content);
  if (issue.status === "done" && !hasShipped) {
    console.log(`    shipped:    \x1b[33mmissing shipped summary\x1b[0m`);
  } else if (hasShipped) {
    console.log(`    shipped:    yes`);
  }

  // Check for empty template sections (still has placeholder text)
  const placeholders = [];
  if (content.includes("*(What's broken or missing")) placeholders.push("Problem");
  if (content.includes("*(Data model changes")) placeholders.push("Solution");
  if (content.includes("*(Paths with line refs")) placeholders.push("Files");
  if (content.includes("*(Concrete, testable")) placeholders.push("Acceptance Criteria");
  if (placeholders.length) {
    console.log(`    unfilled:   \x1b[33m${placeholders.join(", ")}\x1b[0m`);
  }

  // Check for investigation/learnings sections added
  const hasInvestigation = /^## Investigation/m.test(content);
  const hasLearnings = /^## Learnings/m.test(content);
  const hasShippedSection = /^## Shipped/m.test(content);
  if (issue.status === "in-progress" && !hasInvestigation) {
    console.log(`    learnings:  \x1b[33mno investigation notes filed yet\x1b[0m`);
  }

  // Completeness score
  const checks = [
    fm.area && fm.area !== "",
    fm.branch && fm.branch !== "null" && fm.branch !== "",
    issue.tags.length > 0,
    !content.includes("*(What's broken or missing"),
    !content.includes("*(Data model changes"),
    !content.includes("*(Concrete, testable"),
  ];
  const filled = checks.filter(Boolean).length;
  const bar = "█".repeat(filled) + "░".repeat(checks.length - filled);
  console.log(`    complete:   [${bar}] ${filled}/${checks.length}`);

  // Debrief prompt when checking before marking done
  if (issue.status === "in-progress" && !hasInvestigation && !hasLearnings) {
    console.log(`\n    \x1b[36m→ Before marking done: what did you learn that isn't obvious from the diff?`);
    console.log(`      File it: brain append ${rel(issue.path)} "## Investigation\\n<findings>"\x1b[0m`);
  }
}

// ─── Session Log ────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function nowTime() {
  return new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
}

async function journalRead(dateStr) {
  const logFile = join(SESSIONS_DIR, `${dateStr}.md`);
  try {
    const content = await readFile(logFile, "utf-8");
    console.log(content);
  } catch {
    console.log(`  No journal entries for ${dateStr}.`);
  }
}

async function journalAppend(prefix, text) {
  mkdirSync(SESSIONS_DIR, { recursive: true });
  const logFile = join(SESSIONS_DIR, `${todayStr()}.md`);
  const parsed = text.replace(/\\n/g, "\n");
  const line = prefix
    ? `**${nowTime()}** ${prefix} ${parsed}`
    : `**${nowTime()}** — ${parsed}`;
  let existing = "";
  try { existing = await readFile(logFile, "utf-8"); } catch {}

  if (!existing) {
    await writeFile(logFile, `# ${todayStr()}\n\n${line}\n`);
  } else {
    await writeFile(logFile, existing + `${line}\n`);
  }
  return logFile;
}

async function log(textParts) {
  const text = textParts.join(" ");
  if (!text || text === "yesterday") {
    const dateStr = text === "yesterday"
      ? new Date(Date.now() - 86400000).toISOString().split("T")[0]
      : todayStr();
    return journalRead(dateStr);
  }
  await journalAppend("·", text);
  console.log(`  Logged to ${todayStr()}.md`);
}

async function note(textParts) {
  const text = textParts.join(" ");
  if (!text || text === "yesterday") {
    const dateStr = text === "yesterday"
      ? new Date(Date.now() - 86400000).toISOString().split("T")[0]
      : todayStr();
    const logFile = join(JOURNAL_DIR, `${dateStr}.md`);
    try {
      const content = await readFile(logFile, "utf-8");
      console.log(content);
    } catch {
      console.log(`  No journal entries for ${dateStr}.`);
    }
    return;
  }
  mkdirSync(JOURNAL_DIR, { recursive: true });
  const logFile = join(JOURNAL_DIR, `${todayStr()}.md`);
  const parsed = text.replace(/\\n/g, "\n");
  let existing = "";
  try { existing = await readFile(logFile, "utf-8"); } catch {}

  if (!existing) {
    await writeFile(logFile, `# ${todayStr()}\n\n**${nowTime()}** — ${parsed}\n`);
  } else {
    await writeFile(logFile, existing + `**${nowTime()}** — ${parsed}\n`);
  }
  console.log(`  ✓ ${todayStr()}.md`);
}

// ─── Query Logging ──────────────────────────────────────────────────────────

function logQuery(cmd, queryText) {
  try {
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      cmd,
      query: queryText,
    });
    appendFileSync(QUERY_LOG, entry + "\n");
  } catch {
    // non-fatal — don't break the query if logging fails
  }
}

async function analytics() {
  let lines;
  try {
    const raw = await readFile(QUERY_LOG, "utf-8");
    lines = raw.trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
  } catch {
    console.log("\n  No query log yet. Run some brain query/search commands first.\n");
    return;
  }

  console.log(`\n  ╭─────────────────────────────────────╮`);
  console.log(`  │  b r a i n  ·  analytics             │`);
  console.log(`  ╰─────────────────────────────────────╯\n`);

  console.log(`  Total queries: ${lines.length}`);

  // Queries by day
  const byDay = {};
  for (const l of lines) {
    const day = l.ts.split("T")[0];
    byDay[day] = (byDay[day] || 0) + 1;
  }
  const days = Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
  if (days.length) {
    console.log(`\n  By day (last 7):`);
    for (const [day, count] of days) {
      console.log(`    ${day}  ${count}`);
    }
  }

  // Most common queries
  const queryCounts = {};
  for (const l of lines) {
    const q = l.query?.toLowerCase().trim();
    if (q) queryCounts[q] = (queryCounts[q] || 0) + 1;
  }
  const top = Object.entries(queryCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (top.length) {
    console.log(`\n  Top queries:`);
    for (const [q, count] of top) {
      console.log(`    ${String(count).padStart(3)}x  ${q.length > 60 ? q.slice(0, 57) + "..." : q}`);
    }
  }

  // Command split
  const byCmdType = {};
  for (const l of lines) {
    byCmdType[l.cmd] = (byCmdType[l.cmd] || 0) + 1;
  }
  console.log(`\n  By type: ${Object.entries(byCmdType).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
  console.log("");
}

// ─── WIP (Cross-Session Awareness) ─────────────────────────────────────────

async function getWipEntries() {
  try {
    const raw = await readFile(WIP_FILE, "utf-8");
    const entries = JSON.parse(raw);
    // Prune entries older than 24h
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return entries.filter(e => new Date(e.started).getTime() > cutoff);
  } catch {
    return [];
  }
}

async function saveWipEntries(entries) {
  await writeFile(WIP_FILE, JSON.stringify(entries, null, 2) + "\n");
}

async function wip(subcmd, idArg) {
  if (!subcmd || subcmd === "list") {
    const entries = await getWipEntries();
    if (!entries.length) {
      console.log("\n  No active work-in-progress sessions.\n");
      return;
    }
    console.log(`\n  Active sessions:\n`);
    for (const e of entries) {
      const ago = timeSince(new Date(e.started).getTime());
      const pidAlive = e.pid ? isProcessAlive(e.pid) : null;
      const status = pidAlive === false ? " \x1b[31m(stale)\x1b[0m" : "";
      console.log(`  ${e.id.padEnd(10)} started ${ago}  pid:${e.pid || "?"}${status}`);
    }
    console.log("");
    return;
  }

  if (subcmd === "start") {
    if (!idArg) {
      console.error("Usage: brain wip start <issue-id|description>");
      process.exit(1);
    }
    const entries = await getWipEntries();
    // Don't duplicate
    if (entries.find(e => e.id === idArg)) {
      console.log(`  ${idArg} already registered as WIP.`);
      return;
    }
    entries.push({
      id: idArg,
      started: new Date().toISOString(),
      pid: process.ppid || process.pid,
    });
    await saveWipEntries(entries);
    console.log(`  Registered: ${idArg}`);
    return;
  }

  if (subcmd === "done") {
    if (!idArg) {
      console.error("Usage: brain wip done <issue-id|description>");
      process.exit(1);
    }
    const entries = await getWipEntries();
    const filtered = entries.filter(e => e.id !== idArg);
    if (filtered.length === entries.length) {
      console.log(`  ${idArg} not found in WIP.`);
      return;
    }
    await saveWipEntries(filtered);
    console.log(`  Cleared: ${idArg}`);
    return;
  }

  console.error("Usage: brain wip [list|start|done] [id]");
  process.exit(1);
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}


// ─── Obsidian CLI passthrough ───────────────────────────────────────────────

function obsidianCmd(subcmd, args) {
  const cmdArgs = args.length ? " " + args.join(" ") : "";
  try {
    execSync(`obsidian ${subcmd}${cmdArgs}`, { stdio: ["inherit", "inherit", "ignore"] });
  } catch (e) {
    // obsidian CLI already prints errors
  }
}

// ─── Frontmatter round-trip ────────────────────────────────────────────────

// Update specific fields in a file's YAML frontmatter without touching the body
// or other fields. Preserves order: existing fields keep their position; new
// fields are appended in the order passed. Arrays are emitted inline
// ([a, b, c]). Value of `null` removes the field.
async function updateFrontmatter(filepath, updates) {
  const raw = await readFile(filepath, "utf-8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    // Prepend frontmatter block with the updates
    const fmText = Object.entries(updates)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}: ${serializeFmValue(v)}`)
      .join("\n");
    await writeFile(filepath, `---\n${fmText}\n---\n\n${raw}`);
    return;
  }
  const block = match[1];
  const lines = block.split("\n");
  const touched = new Set();
  const newLines = lines.map(line => {
    const keyMatch = line.match(/^(\w+):\s*(.*)$/);
    if (!keyMatch) return line;
    const [, key] = keyMatch;
    if (!(key in updates)) return line;
    touched.add(key);
    const v = updates[key];
    if (v == null) return null; // drop
    return `${key}: ${serializeFmValue(v)}`;
  }).filter(l => l !== null);
  // Append untouched new fields
  for (const [k, v] of Object.entries(updates)) {
    if (!touched.has(k) && v != null) newLines.push(`${k}: ${serializeFmValue(v)}`);
  }
  const newBlock = newLines.join("\n");
  const newRaw = raw.replace(match[0], `---\n${newBlock}\n---\n`);
  await writeFile(filepath, newRaw);
}

function serializeFmValue(v) {
  if (Array.isArray(v)) return `[${v.map(serializeFmValue).join(", ")}]`;
  if (typeof v === "string") {
    // Quote strings with special YAML chars; otherwise leave unquoted.
    if (/^[\w\-.\/#@]+$/.test(v) || /^\d+$/.test(v)) return v;
    return JSON.stringify(v);
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

// ─── Handoff & Resume ──────────────────────────────────────────────────────

const HANDOFFS_DIR = join(SESSIONS_DIR, "handoffs");

// Collect everything useful for a handoff doc in one pass. The handoff composer
// and each individual `tidy` subcommand read from this.
async function collectSession() {
  const todayLog = join(SESSIONS_DIR, `${todayStr()}.md`);
  let logEntries = [];
  try {
    const raw = await readFile(todayLog, "utf-8");
    logEntries = raw.split("\n").filter(l => l.startsWith("**")).map(l => {
      const m = l.match(/^\*\*(\d{2}:\d{2})\*\*\s*·?\s*—?\s*(.*)$/);
      return m ? { time: m[1], text: m[2].trim() } : null;
    }).filter(Boolean);
  } catch {}

  // Git state — branches + current HEAD + PRs
  const repo = resolveGitRepo();
  let branches = [];
  let head = "";
  let prs = [];
  if (repo) {
    try {
      const raw = execSync(
        `git -C "${repo}" for-each-ref --sort=-committerdate refs/heads/ --format='%(refname:short)|%(committerdate:unix)' --count=15 2>/dev/null`,
        { encoding: "utf-8" }
      );
      const cutoff = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
      branches = raw.trim().split("\n").filter(Boolean).map(l => {
        const [name, ts] = l.split("|");
        return { name, ts: parseInt(ts, 10) };
      }).filter(b => b.ts >= cutoff);
    } catch {}
    try {
      head = execSync(`git -C "${repo}" rev-parse --abbrev-ref HEAD 2>/dev/null`, { encoding: "utf-8" }).trim();
    } catch {}
    try {
      const raw = execSync(
        `gh pr list --author @me --state all --limit 30 --json number,state,headRefName,title,url,updatedAt 2>/dev/null`,
        { encoding: "utf-8", cwd: repo }
      );
      prs = JSON.parse(raw);
    } catch {}
  }

  // Interns — optional integration. Set $BRAIN_INTERNS_DIR or brainKit.internsDir
  // in package.json (relative to repo root) to enable.
  let internsDir = process.env.BRAIN_INTERNS_DIR;
  if (!internsDir && repo) {
    try {
      const pkg = JSON.parse(readFileSync(join(KB_ROOT, "package.json"), "utf8"));
      if (pkg.brainKit?.internsDir) internsDir = join(repo, pkg.brainKit.internsDir);
    } catch {}
  }
  let interns = [];
  if (internsDir) {
    try {
      const files = await readdir(internsDir);
      for (const f of files.filter(f => f.endsWith(".json"))) {
        try {
          const data = JSON.parse(await readFile(join(internsDir, f), "utf-8"));
          interns.push(data);
        } catch {}
      }
    } catch {}
  }

  // WIP
  const wipEntries = await getWipEntries();

  // Projects touched (from issues edited today + log mentions)
  const allIssues = await getIssues(null, true);
  const projects = await getProjects();
  const today = Date.now() - 24 * 60 * 60 * 1000;
  const touchedProjectSlugs = new Set();
  for (const issue of allIssues) {
    const s = await stat(issue.path).catch(() => null);
    if (s && s.mtimeMs > today && issue.projectSlug) {
      touchedProjectSlugs.add(issue.projectSlug);
    }
  }
  // Also mention-based detection: project slug appears in any log entry
  for (const p of projects) {
    for (const entry of logEntries) {
      if (entry.text.toLowerCase().includes(p.slug)) touchedProjectSlugs.add(p.slug);
    }
  }
  const touchedProjects = projects.filter(p => touchedProjectSlugs.has(p.slug));

  // Files touched today (projects dir + sessions dir)
  const filesTouched = [];
  for (const f of await walkTeams()) {
    const s = await stat(f);
    if (s.mtimeMs > today) filesTouched.push({ path: rel(f), mtime: s.mtimeMs });
  }
  filesTouched.sort((a, b) => b.mtime - a.mtime);

  return {
    date: todayStr(),
    logEntries,
    repo,
    head,
    branches,
    prs,
    interns,
    wipEntries,
    touchedProjects,
    filesTouched,
  };
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

async function handoff(argv) {
  const dryRun = argv.includes("--dry-run");
  const jsonOut = argv.includes("--json");
  const skipTidy = argv.includes("--no-tidy");
  const topic = argv.filter(a => !a.startsWith("--")).join(" ") || null;

  // Run tidy passes BEFORE collecting session context so the context reflects
  // the cleaned-up state. Skip if user opts out or if we're in dry-run mode
  // (tidy writes to disk and --dry-run implies "show me what handoff would do").
  if (!skipTidy && !dryRun && !jsonOut) {
    console.log("\n  Tidying before wrap…");
    await tidyPRs();
    const projects = await getProjects();
    for (const p of projects) {
      const issues = await getProjectIssues(p.slug);
      // Only re-derive status for projects that have linked issues
      if (issues.length) await tidyProject(p.slug);
    }
    await tidyLogs();
  }

  const ctx = await collectSession();

  // Compose the handoff doc's "where we are" from the most recent log entries +
  // any topic the user passed on the command line.
  const ts = new Date();
  const hhmm = `${String(ts.getHours()).padStart(2, "0")}${String(ts.getMinutes()).padStart(2, "0")}`;
  const primaryProject = ctx.touchedProjects[0]?.slug || "loose";
  const topicSlug = topic ? slugify(topic) : primaryProject;
  const id = `h-${ctx.date.replace(/-/g, "")}-${hhmm}-${topicSlug}`;
  const handoffPath = join(HANDOFFS_DIR, `${id}.md`);

  // Classify PRs: branches seen in ctx, matched to PR state.
  const branchSet = new Set(ctx.branches.map(b => b.name));
  const relevantPRs = ctx.prs.filter(pr => branchSet.has(pr.headRefName));
  const mergedPRs = relevantPRs.filter(pr => pr.state === "MERGED");
  const openPRs = relevantPRs.filter(pr => pr.state === "OPEN");

  const body = [];
  body.push(`---`);
  body.push(`id: ${id}`);
  body.push(`date: ${ctx.date} ${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}`);
  if (ctx.touchedProjects.length) {
    body.push(`projects: [${ctx.touchedProjects.map(p => p.slug).join(", ")}]`);
  }
  body.push(`---`);
  body.push("");
  body.push(`# Handoff: ${topic || (ctx.touchedProjects[0]?.title ?? "session wrap")}`);
  body.push("");

  // Where we are
  body.push(`## Where we are`);
  if (ctx.logEntries.length) {
    const last = ctx.logEntries.slice(-3);
    for (const e of last) body.push(`- ${e.time} · ${e.text}`);
  } else {
    body.push(`- (no log entries today — run \`brain log\` during the next session)`);
  }
  body.push("");

  // Next action — placeholder for the agent to fill in. Put a TODO so it's visible.
  body.push(`## Next action`);
  body.push(`- TODO: fill this in before the next session picks up`);
  body.push("");

  if (ctx.touchedProjects.length) {
    body.push(`## Projects touched`);
    for (const p of ctx.touchedProjects) {
      body.push(`- [[../../${p.area}/projects/${p.slug}/index|${p.slug}]] — ${p.status}${p.todosOpen ? ` · ${p.todosOpen} open todos` : ""}`);
    }
    body.push("");
  }

  if (mergedPRs.length) {
    body.push(`## Recently shipped`);
    for (const pr of mergedPRs) body.push(`- #${pr.number} — ${pr.title}`);
    body.push("");
  }

  if (openPRs.length) {
    body.push(`## Active PRs`);
    for (const pr of openPRs) body.push(`- #${pr.number} — ${pr.title} (\`${pr.headRefName}\`)`);
    body.push("");
  }

  if (ctx.interns.length) {
    body.push(`## Active interns`);
    for (const i of ctx.interns) {
      const title = i.title || i.session_id;
      body.push(`- \`${i.session_id}\` — ${title}`);
    }
    body.push("");
  }

  if (ctx.wipEntries.length) {
    body.push(`## Active WIP`);
    for (const e of ctx.wipEntries) body.push(`- ${e.id} (pid ${e.pid})`);
    body.push("");
  }

  if (ctx.filesTouched.length) {
    body.push(`## Files touched (last 24h)`);
    for (const f of ctx.filesTouched.slice(0, 15)) body.push(`- ${f.path}`);
    if (ctx.filesTouched.length > 15) body.push(`- … and ${ctx.filesTouched.length - 15} more`);
    body.push("");
  }

  const content = body.join("\n");

  if (jsonOut) {
    console.log(JSON.stringify({
      id,
      path: rel(handoffPath),
      date: ctx.date,
      projects: ctx.touchedProjects.map(p => p.slug),
      logEntries: ctx.logEntries,
      mergedPRs: mergedPRs.map(p => ({ number: p.number, title: p.title })),
      openPRs: openPRs.map(p => ({ number: p.number, title: p.title, branch: p.headRefName })),
      interns: ctx.interns,
      wipEntries: ctx.wipEntries,
      filesTouched: ctx.filesTouched.slice(0, 50).map(f => f.path),
    }, null, 2));
    return;
  }

  if (dryRun) {
    console.log(`\n  [DRY RUN] would write ${rel(handoffPath)}:\n`);
    console.log(content);
    console.log("");
    return;
  }

  mkdirSync(HANDOFFS_DIR, { recursive: true });
  await writeFile(handoffPath, content + "\n");

  console.log(`\n  handoff written: ${obsidianLink(rel(handoffPath), rel(handoffPath))}`);
  console.log("");
  console.log(`  resume with:  brain resume ${id}`);
  console.log("");

  // Also drop a session log line so timeline reflects the handoff
  await journalAppend("·", `handoff: ${id}`);
}

// ─── Tidy subcommands ──────────────────────────────────────────────────────
//
// Each tidy subcommand does one narrowly-scoped cleanup pass. They're
// individually invokable (`brain tidy <verb>`) and also composed by
// `brain handoff --tidy` / `brain handoff` when the user wants a full wrap.
//
// Principles:
// - Never rewrite prose. Only add metadata, links, or flag candidates.
// - User-gated for anything that uses an LLM or touches narrative content.
// - Idempotent — running a tidy twice is a no-op if nothing changed.
// - Silent about unchanged items; loud about what got edited.

// Look up PRs mentioning an issue id or a branch that matches the id.
async function findPRsForIssue(issueId) {
  const repo = resolveGitRepo();
  if (!repo) return [];
  try {
    const raw = execSync(
      `gh pr list --search "${issueId}" --state all --limit 10 --json number,state,headRefName,title,url 2>/dev/null`,
      { encoding: "utf-8", cwd: repo }
    );
    return JSON.parse(raw);
  } catch { return []; }
}

// Find local branches that mention the issue id (e.g. `david/ci-025-…`).
function findBranchesForIssue(issueId) {
  const repo = resolveGitRepo();
  if (!repo) return [];
  try {
    const raw = execSync(
      `git -C "${repo}" for-each-ref refs/heads/ --format='%(refname:short)' 2>/dev/null`,
      { encoding: "utf-8" }
    );
    const needle = issueId.toLowerCase();
    return raw.trim().split("\n").filter(b => b.toLowerCase().includes(needle));
  } catch { return []; }
}

async function tidyIssue(idArg) {
  if (!idArg) {
    console.error("Usage: brain tidy issue <id>");
    process.exit(1);
  }
  const allIssues = await getIssues(null, true);
  const issue = allIssues.find(i => i.id.toUpperCase() === idArg.toUpperCase());
  if (!issue) {
    console.error(`No issue matching "${idArg}".`);
    process.exit(1);
  }

  const updates = {};

  // Match PRs that mention the id in title/body/branch
  const prs = await findPRsForIssue(issue.id);
  if (prs.length) {
    // Store as `pr: #19585` for single or list of numbers for multiple
    const openOrMerged = prs.filter(p => p.state !== "CLOSED");
    if (openOrMerged.length === 1) {
      updates.pr = `#${openOrMerged[0].number}`;
    } else if (openOrMerged.length > 1) {
      updates.pr = openOrMerged.map(p => `#${p.number}`);
    }
  }

  // Branch: if there's exactly one matching branch, record it
  const branches = findBranchesForIssue(issue.id);
  if (branches.length === 1 && !issue.branch) {
    updates.branch = branches[0];
  }

  updates.last_touched = todayStr();

  if (!Object.keys(updates).length) {
    console.log(`  ${issue.id}: nothing to update`);
    return;
  }

  await updateFrontmatter(issue.path, updates);
  const summary = Object.entries(updates).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : v}`).join(" ");
  console.log(`  ${issue.id}: ${summary}`);
}

async function tidyPRs() {
  console.log("\n  Sweeping PR links across issues and projects…\n");
  const issues = await getIssues(null, true);
  const inFlight = issues.filter(i => i.status === "in-progress" || i.status === "backlog" || i.status === "blocked");
  let updated = 0;
  for (const issue of inFlight) {
    const before = issue.branch;
    const prs = await findPRsForIssue(issue.id);
    const openOrMerged = prs.filter(p => p.state !== "CLOSED");
    if (!openOrMerged.length) continue;
    const updates = {};
    updates.pr = openOrMerged.length === 1 ? `#${openOrMerged[0].number}` : openOrMerged.map(p => `#${p.number}`);
    if (!before) {
      const branches = findBranchesForIssue(issue.id);
      if (branches.length === 1) updates.branch = branches[0];
    }
    updates.last_touched = todayStr();
    await updateFrontmatter(issue.path, updates);
    updated++;
    console.log(`  ${issue.id}: pr=${Array.isArray(updates.pr) ? updates.pr.join(",") : updates.pr}`);
  }
  console.log(`\n  Updated ${updated} issue${updated === 1 ? "" : "s"}.\n`);
}

async function tidyProject(slug) {
  if (!slug) {
    console.error("Usage: brain tidy project <slug>");
    process.exit(1);
  }
  const list = await getProjects();
  const project = list.find(p => p.slug === slug);
  if (!project) {
    console.error(`No project "${slug}".`);
    process.exit(1);
  }
  const issues = await getProjectIssues(slug);

  // Derive project status from linked issues:
  //   all done     -> done
  //   any in-progress -> in-progress
  //   any backlog  -> backlog
  //   otherwise    -> keep existing
  let derivedStatus = project.status;
  if (issues.length) {
    const hasInProgress = issues.some(i => i.status === "in-progress");
    const allDone = issues.every(i => i.status === "done" || i.status === "wont-fix");
    if (allDone) derivedStatus = "done";
    else if (hasInProgress) derivedStatus = "in-progress";
    else derivedStatus = "backlog";
  }

  const updates = { last_touched: todayStr() };
  if (derivedStatus !== project.status) {
    updates.status = derivedStatus;
    console.log(`  ${slug}: status ${project.status} → ${derivedStatus}`);
  } else {
    console.log(`  ${slug}: status unchanged (${project.status})`);
  }
  await updateFrontmatter(project.path, updates);
}

async function tidyLogs() {
  const logPath = join(SESSIONS_DIR, `${todayStr()}.md`);
  let content;
  try { content = await readFile(logPath, "utf-8"); }
  catch {
    console.log("  No log for today.");
    return;
  }
  const entries = content.split("\n").filter(l => l.startsWith("**"));
  // Dupe detection: same first 40 chars of body after timestamp, case-insensitive
  const seen = new Map();
  const dupes = [];
  for (const line of entries) {
    const body = line.replace(/^\*\*\d{2}:\d{2}\*\*\s*·?\s*/, "").slice(0, 80).toLowerCase().trim();
    if (body.length < 20) continue;
    const key = body.slice(0, 40);
    if (seen.has(key)) dupes.push({ line, original: seen.get(key) });
    else seen.set(key, line);
  }
  if (!dupes.length) {
    console.log(`  ${entries.length} log entries, no duplicates.`);
    return;
  }
  console.log(`\n  ${dupes.length} possible duplicate${dupes.length === 1 ? "" : "s"} in today's log:\n`);
  for (const { line, original } of dupes) {
    console.log(`    original: ${original.slice(0, 100)}...`);
    console.log(`    dup:      ${line.slice(0, 100)}...`);
    console.log("");
  }
  console.log("  (v1 flags only — edit sessions/<today>.md manually to merge)\n");
}

async function tidyMemory() {
  // Memory is auto-managed by the agent system prompt; this command just
  // surfaces what's in MEMORY.md so the wrap workflow can encourage the agent
  // to reflect on whether anything from this session belongs there.
  // Claude Code stores per-project memory under ~/.claude/projects/<encoded-cwd>/memory/MEMORY.md.
  // We try the configured project repo first, falling back to a brainKit.memoryPath override.
  const repo = resolveGitRepo();
  let memoryPath = process.env.BRAIN_MEMORY_PATH;
  if (!memoryPath) {
    try {
      const pkg = JSON.parse(readFileSync(join(KB_ROOT, "package.json"), "utf8"));
      if (pkg.brainKit?.memoryPath) memoryPath = pkg.brainKit.memoryPath;
    } catch {}
  }
  if (!memoryPath && repo) {
    const encoded = "-" + repo.replace(/^\//, "").replace(/\//g, "-");
    memoryPath = join(process.env.HOME || "", ".claude", "projects", encoded, "memory", "MEMORY.md");
  }
  if (!memoryPath) {
    console.log("  No memory path configured. Set brainKit.memoryPath in package.json or $BRAIN_MEMORY_PATH.");
    return;
  }
  try {
    const content = await readFile(memoryPath, "utf-8");
    const lines = content.split("\n");
    console.log(`\n  MEMORY.md (${lines.length} lines):\n`);
    console.log(content);
    console.log("\n  Review the session for any durable user prefs, feedback, or facts that belong here.");
    console.log("  Agent-triggered auto-memory handles most writes; this is a sanity check.\n");
  } catch {
    console.log("  No MEMORY.md found — auto-memory not configured for this project.");
  }
}

async function tidyDecisions() {
  // LLM-gated pass. For v1 we print candidates by scanning today's session log
  // for explicit decision language ("decided to", "direction:", "pivot:", etc.)
  // and show them; user runs `brain decision` to formalize. No auto-write.
  const logPath = join(SESSIONS_DIR, `${todayStr()}.md`);
  let content;
  try { content = await readFile(logPath, "utf-8"); } catch {
    console.log("  No log for today.");
    return;
  }
  const entries = content.split("\n").filter(l => l.startsWith("**"));
  const patterns = [
    /\bdecided to\b/i,
    /\bdirection:/i,
    /\bpivot(ed)?\b/i,
    /\bgoing with\b/i,
    /\bwent with\b/i,
    /\bchose\b/i,
    /\bwe['']?ll go/i,
  ];
  const candidates = entries.filter(e => patterns.some(p => p.test(e)));
  if (!candidates.length) {
    console.log("  No decision candidates detected in today's log.");
    return;
  }
  console.log(`\n  ${candidates.length} possible decision${candidates.length === 1 ? "" : "s"} from today:\n`);
  for (const c of candidates) console.log(`    ${c}`);
  console.log("\n  To formalize: create <project>/decisions/YYYY-MM-DD-<slug>.md manually.");
  console.log("  (LLM-assisted formalization is a future upgrade.)\n");
}

async function tidyDocs() {
  console.log("\n  Doc updates (gotchas, architectural notes) require an LLM pass.");
  console.log("  v1 is a placeholder — see CI-026 acceptance criteria.");
  console.log("  Review today's session log manually for anything that belongs in a project article.\n");
}

// Move terminal-status issues (done, wont-fix) older than `daysArg` (default
// 30) to `<team>/issues/archive/`. Recency comes from the `last_touched:`
// frontmatter when present, falling back to file mtime.
async function tidyIssues(daysArg) {
  const days = parseInt(daysArg) || 30;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const terminal = new Set(["done", "wont-fix"]);
  let movedTotal = 0;

  for (const team of await getTeamDirs()) {
    const issuesDir = join(KB_ROOT, team, "issues");
    const archiveDir = join(issuesDir, "archive");
    const files = (await walk(issuesDir)).filter((f) => !f.includes("/archive/"));
    let moved = 0;
    for (const f of files) {
      const fm = await getFrontmatter(f);
      if (!terminal.has(fm.status)) continue;
      // Recency for terminal issues: prefer `last_touched`, then `reported`,
      // then mtime. mtime is the worst signal — bulk filesystem ops can
      // touch every issue at once and reset it.
      let recencyMs;
      for (const candidate of [fm.last_touched, fm.reported]) {
        if (!candidate) continue;
        const t = Date.parse(candidate);
        if (!Number.isNaN(t)) { recencyMs = t; break; }
      }
      if (recencyMs == null) {
        const s = await stat(f);
        recencyMs = s.mtimeMs;
      }
      if (recencyMs >= cutoff) continue;
      mkdirSync(archiveDir, { recursive: true });
      const { renameSync } = await import("node:fs");
      renameSync(f, join(archiveDir, basename(f)));
      moved++;
    }
    if (moved) {
      console.log(`  ${team}: archived ${moved} done/wont-fix issue${moved === 1 ? "" : "s"} older than ${days}d → ${rel(archiveDir)}`);
      movedTotal += moved;
    }
  }
  if (!movedTotal) console.log(`  No issues to archive (cutoff ${days}d).`);
}

// Move handoffs older than `daysArg` (default 14) to sessions/handoffs/archive/.
// Date is parsed from the filename (`h-YYYYMMDD-...`) — mtime is unreliable
// because bulk filesystem ops touch all files at once.
async function tidyHandoffs(daysArg) {
  const days = parseInt(daysArg) || 14;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const archiveDir = join(HANDOFFS_DIR, "archive");
  mkdirSync(archiveDir, { recursive: true });

  let files;
  try {
    files = (await readdir(HANDOFFS_DIR)).filter(f => f.endsWith(".md"));
  } catch {
    console.log("  No handoffs to tidy.");
    return;
  }

  let moved = 0;
  for (const name of files) {
    const m = name.match(/^h?-?(\d{4})(\d{2})(\d{2})-/);
    if (!m) continue;
    const [, y, mo, d] = m;
    const ts = Date.parse(`${y}-${mo}-${d}`);
    if (Number.isNaN(ts) || ts >= cutoff) continue;
    const { renameSync } = await import("node:fs");
    renameSync(join(HANDOFFS_DIR, name), join(archiveDir, name));
    moved++;
  }

  console.log(`  Archived ${moved} handoff${moved === 1 ? "" : "s"} older than ${days}d → ${rel(archiveDir)}`);
}

// Composite scheduled-maintenance pass. Designed to be the single entry point
// for the auto-reindex plugin (see CI-006) or any cron/launchd job. Runs
// non-interactive sweeps only — skips `decisions`/`docs` which require LLM
// passes, and skips `issue`/`project` which need an explicit target.
async function tidyAll() {
  console.log("\n  ── brain tidy all ──");
  console.log("\n  > prs");
  await tidyPRs();
  console.log("\n  > issues (archive done/wont-fix > 30d)");
  await tidyIssues();
  console.log("\n  > handoffs (archive > 14d)");
  await tidyHandoffs();
  console.log("\n  > logs");
  await tidyLogs();
  console.log("\n  > qmd reindex");
  try {
    execSync("qmd update --collection agency", { stdio: "inherit", cwd: KB_ROOT });
  } catch {
    console.log("  qmd update failed (qmd not on PATH or no agency collection)");
  }
  console.log();
}

async function tidy(subcmd, ...args) {
  switch (subcmd) {
    case "issue":     return tidyIssue(args[0]);
    case "issues":    return tidyIssues(args[0]);
    case "prs":       return tidyPRs();
    case "project":   return tidyProject(args[0]);
    case "logs":      return tidyLogs();
    case "memory":    return tidyMemory();
    case "decisions": return tidyDecisions();
    case "docs":      return tidyDocs();
    case "handoffs":  return tidyHandoffs(args[0]);
    case "all":       return tidyAll();
    default:
      console.error(`Usage: brain tidy <issue|issues|prs|project|logs|memory|decisions|docs|handoffs|all> [args]`);
      process.exit(1);
  }
}

async function resume(idArg) {
  mkdirSync(HANDOFFS_DIR, { recursive: true });
  let files = [];
  try {
    files = (await readdir(HANDOFFS_DIR)).filter(f => f.endsWith(".md")).sort();
  } catch {}

  let handoffPath;
  if (idArg) {
    // Accept either the full id (with or without .md) or a substring
    const match = files.find(f => f.startsWith(idArg) || f === `${idArg}.md`);
    if (match) handoffPath = join(HANDOFFS_DIR, match);
  } else if (files.length) {
    handoffPath = join(HANDOFFS_DIR, files[files.length - 1]);
  }

  if (!handoffPath) {
    console.error(`\n  No handoff found${idArg ? ` for "${idArg}"` : ""}. Available:\n`);
    for (const f of files.slice(-5)) console.error(`    ${f.replace(/\.md$/, "")}`);
    console.error("");
    process.exit(1);
  }

  const content = await readFile(handoffPath, "utf-8");
  console.log(`\n  ──── brain · resume ${"─".repeat(20)} ${rel(handoffPath)} ──`);
  console.log("");
  console.log(content);

  // Append current brief so the agent has fresh state alongside the handoff
  console.log("\n  (current state ↓)");
  await brief();
}

// ─── qmd passthrough ───────────────────────────────────────────────────────

function qmdCmd(args) {
  try {
    execSync(`qmd ${args.join(" ")}`, { stdio: "inherit" });
  } catch (e) {
    // qmd already prints errors
  }
}

function help() {
  console.log(`
  brain — knowledge base CLI

  Orient:
    brain brief                 Situational awareness — work, notes, drift warnings
    brain projects              List projects (one line each)
    brain project <slug>        Project dossier — issues, todos, decisions, recent
    brain check [id]            Validate issue completeness with debrief prompt
    brain wip [start|done] <id> Cross-session work-in-progress tracking
    brain log [text]            Agent session log (no args = read today, text = append)
    brain note [text]           Personal journal entry (no args = read today, text = append)
    brain analytics             Query usage patterns from search/query log

  Session handoff:
    brain handoff [topic]       Tidy + write a handoff doc + resume command (--dry-run, --json, --no-tidy)
    brain resume [id]           Print handoff + brief for continuing work (defaults to latest)
    brain tidy <verb> [args]    Cleanup passes (issue/issues/prs/project/logs/memory/decisions/docs/handoffs/all)


  Read & Write:
    brain read <path>           Read a KB article by vault-relative path
    brain write <path> <text>   Write/overwrite a KB article
    brain append <path> <text>  Append content to an article
    brain edit <path>           Open in $EDITOR
    brain open <path|id>        Open in Obsidian (accepts paths or issue IDs)
    brain root                  Print the vault filesystem path

  Navigate:
    brain find <pattern>        Find KB files by name (substring or glob)
    brain recent [n]            Show n most recently modified articles (default: 10)
    brain tree [folder]         Directory tree of KB structure
    brain diff [hours]           Files changed in last N hours (default: 24)

  Issues:
    brain issues [project]      List active project issues (skips archived projects)
    brain issues --all          Include archived projects
    brain issue <id>            Read an issue by ID (e.g. brain issue CI-042)
    brain kanban [project]      Generate kanban.md from issue files
    brain issue-create <p> <t>  Create a new issue for project <p> with title <t>
    brain next-id [project]     Print the next available issue ID (default: only team)

  Knowledge:
    brain status                Show KB inventory and health
    brain lint                  Check for broken links, orphans, missing frontmatter

  Ingestion:
    brain ingest-bookmarks <f>  Parse Chrome bookmark HTML into raw/bookmarks/
    brain ingest-pdfs <dir>     Convert PDFs to markdown in raw/articles/
    brain ingest-tweets         Export Field Theory bookmarks to raw/tweets/
    brain ingest-clip <url>     Clip a URL into raw/clips/ for later compilation

  Search (qmd):
    brain search <query>        Full-text BM25 search
    brain query <query>         Hybrid search (BM25 + vectors + reranking)
    brain get <path|#docid>     Get a doc from qmd index by path or docid
    brain list [collection]     List files in a qmd collection (default: agency)
    brain qmd <args...>         Pass any command to qmd

  Obsidian (natural shortcuts + full passthrough):
    brain files [folder]        List files in vault folder
    brain outline <path>        Heading structure of a file
    brain backlinks <path>      Incoming links to this file
    brain links <path>          Outgoing links from this file
    brain tags [tag]            List all tags (with counts) or files with a tag
    brain props <path>          List frontmatter properties
    brain obs <args...>         Full obsidian CLI passthrough

    brain help                  Show this help
  `);
}

// ─── Main ───────────────────────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "status":
    await status();
    break;
  case "lint":
    await lint();
    break;
  case "ingest-bookmarks":
    await ingestBookmarks(args[0]);
    break;
  case "ingest-pdfs":
    await ingestPdfs(args[0]);
    break;
  case "ingest-tweets":
    await ingestTweets();
    break;
  case "ingest-clip":
    await ingestClip(args[0]);
    break;
  case "update-index":
    await updateIndex();
    break;
  case "issues": {
    const hasAll = args.includes("--all");
    const project = args.find(a => !a.startsWith("--"));
    await issues(project, hasAll);
    break;
  }
  case "kanban":
    await kanban(args[0]);
    break;
  case "issue-create":
    await issueCreate(args[0], args.slice(1).join(" "));
    break;
  case "next-id":
    await nextId(args[0]);
    break;
  case "projects":
    await projectsList();
    break;
  case "project":
    await projectShow(args[0]);
    break;
  case "handoff":
    await handoff(args);
    break;
  case "resume":
    await resume(args[0]);
    break;
  case "tidy":
    await tidy(args[0], ...args.slice(1));
    break;
  case "brief":
    await brief(args);
    break;
  case "check":
    await check(args[0]);
    break;
  // read / write / navigate
  case "read":
    await readArticle(args[0]);
    break;
  case "append":
    await appendArticle(args[0], args.slice(1).join(" "));
    break;
  case "write":
    await writeArticle(args[0], args.slice(1).join(" "));
    break;
  case "root":
    root();
    break;
  case "issue":
    await issueRead(args[0]);
    break;
  case "recent":
    await recent(args[0]);
    break;
  case "find":
    await find(args.join(" "));
    break;
  case "open":
    await openInObsidian(args[0]);
    break;
  case "diff":
    await diff(args[0]);
    break;
  case "tree":
    tree(args[0]);
    break;
  case "edit":
    edit(args[0]);
    break;
  // journal
  case "log":
    await log(args);
    break;
  case "note":
    await note(args);
    break;
  // wip tracking
  case "wip":
    await wip(args[0], args[1]);
    break;
  // analytics
  case "analytics":
    await analytics();
    break;
  // qmd passthrough (with query logging)
  case "search":
    logQuery("search", args.join(" "));
    qmdCmd(["search", ...args]);
    break;
  case "query":
    logQuery("query", args.join(" "));
    qmdCmd(["query", ...args]);
    break;
  case "get":
    // resolve relative KB paths to qmd:// URIs
    qmdCmd(["get", args[0] && !args[0].startsWith("qmd://") && !args[0].startsWith("#") ? `qmd://agency/${args[0]}` : args[0], ...args.slice(1)]);
    break;
  case "list":
    qmdCmd(["ls", ...(args.length ? args : [VAULT_NAME])]);
    break;
  case "qmd":
    qmdCmd(args);
    break;
  // obsidian shortcuts — natural verbs without knowing obsidian param syntax
  case "files":
    obsidianCmd("files", args[0] ? [`folder=${args[0]}`] : []);
    break;
  case "outline":
    obsidianCmd("outline", args[0] ? [`path=${args[0]}`] : []);
    break;
  case "backlinks":
    obsidianCmd("backlinks", args[0] ? [`path=${args[0]}`] : []);
    break;
  case "links":
    obsidianCmd("links", args[0] ? [`path=${args[0]}`] : []);
    break;
  case "tags":
    if (args[0]) {
      obsidianCmd("tag", [`name=${args[0]}`]);
    } else {
      obsidianCmd("tags", ["all", "counts", "sort=count"]);
    }
    break;
  case "props":
    obsidianCmd("properties", args[0] ? [`path=${args[0]}`] : []);
    break;
  // obsidian passthrough — brain obs <anything> = obsidian <anything>
  case "obs":
    obsidianCmd(args[0] || "help", args.slice(1));
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
