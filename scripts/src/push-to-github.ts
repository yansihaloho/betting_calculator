/**
 * Push local changes to GitHub via REST API.
 * Run with: pnpm --filter @workspace/scripts run push-github
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
if (!token) throw new Error("GITHUB_PERSONAL_ACCESS_TOKEN not set");

const owner  = "yansihaloho";
const repo   = "betting_calculator";
const branch = "main";
const ROOT   = path.resolve(__dirname, "../..");

const H = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "Content-Type": "application/json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "replit-push-script",
};

async function api(method: string, endpoint: string, body?: unknown): Promise<any> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}${endpoint}`, {
    method,
    headers: H as Record<string, string>,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json() as any;
  if (!res.ok) throw new Error(`${method} ${endpoint} → ${res.status}: ${JSON.stringify(json).slice(0,200)}`);
  return json;
}

function git(cmd: string): string {
  return execSync(cmd, { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
}

async function main() {
  console.log(`\n→ Pushing to github.com/${owner}/${repo} (${branch})\n`);

  // 1. Get current GitHub HEAD
  let baseSHA     = "";
  let baseTreeSHA = "";
  try {
    const ref    = await api("GET", `/git/refs/heads/${branch}`);
    baseSHA      = ref.object.sha;
    const commit = await api("GET", `/git/commits/${baseSHA}`);
    baseTreeSHA  = commit.tree.sha;
    console.log(`GitHub HEAD: ${baseSHA.slice(0,7)} (tree ${baseTreeSHA.slice(0,7)})`);
  } catch {
    console.log("No main branch on GitHub yet — full initial push.");
  }

  // 2. Collect files to upload
  let filePaths: string[];
  if (!baseSHA) {
    // First push → everything tracked by git + unstaged changes
    filePaths = git("git ls-files").split("\n").filter(Boolean);
    // Plus modified/untracked
    const untracked = git("git ls-files --others --exclude-standard").split("\n").filter(Boolean);
    filePaths = [...new Set([...filePaths, ...untracked])];
    console.log(`Initial push: ${filePaths.length} files`);
  } else {
    // Incremental: get files changed vs GitHub HEAD (by comparing local HEAD + unstaged)
    let changed: string[] = [];
    try { changed.push(...git(`git diff --name-only ${baseSHA}`).split("\n").filter(Boolean)); } catch {}
    try { changed.push(...git("git ls-files --others --exclude-standard").split("\n").filter(Boolean)); } catch {}
    // Always include the key files we just edited
    const keyFiles = [
      "artifacts/betting-calculator/src/pages/SmartPredictionV2.tsx",
      "artifacts/api-server/src/app.ts",
      "lib/api-spec/openapi.yaml",
      "replit.md",
    ];
    filePaths = [...new Set([...changed, ...keyFiles])].filter(f => fs.existsSync(path.join(ROOT, f)));
    console.log(`Incremental push: ${filePaths.length} files`);
    filePaths.forEach(f => console.log("  •", f));
  }

  // 3. Create blobs
  console.log("\nCreating blobs...");
  const treeItems: { path: string; mode: string; type: string; sha: string }[] = [];
  for (const filePath of filePaths) {
    const absPath = path.join(ROOT, filePath);
    if (!fs.existsSync(absPath)) { console.log(`  skip (missing): ${filePath}`); continue; }
    const stat = fs.statSync(absPath);
    if (stat.size > 5_000_000) { console.log(`  skip (too large): ${filePath}`); continue; }
    const content = fs.readFileSync(absPath);
    const blob = await api("POST", "/git/blobs", {
      content: content.toString("base64"),
      encoding: "base64",
    });
    treeItems.push({ path: filePath, mode: "100644", type: "blob", sha: blob.sha });
    console.log(`  ✓ ${filePath}`);
  }

  if (treeItems.length === 0) { console.log("Nothing to push."); return; }

  // 4. Create tree
  console.log("\nCreating tree...");
  const treePayload: any = { tree: treeItems };
  if (baseTreeSHA) treePayload.base_tree = baseTreeSHA;
  const tree = await api("POST", "/git/trees", treePayload);
  console.log(`Tree: ${tree.sha.slice(0,7)}`);

  // 5. Create commit
  const message =
    "chore: Smart AI V2 audit — remove unused imports, API hardening, full OpenAPI spec, docs\n\n" +
    "- SmartPredictionV2: remove unused imports (Target replaced with Activity)\n" +
    "- app.ts: global error handler, production CORS whitelist, 2 MB body limit\n" +
    "- openapi.yaml: complete API spec (GET /results/toto-macau, GET/PUT /user/data)\n" +
    "- replit.md: full project documentation";
  const commitPayload: any = {
    message,
    tree: tree.sha,
    author: { name: "Replit Agent", email: "agent@replit.com", date: new Date().toISOString() },
  };
  if (baseSHA) commitPayload.parents = [baseSHA];
  const commit = await api("POST", "/git/commits", commitPayload);
  console.log(`Commit: ${commit.sha.slice(0,7)}`);

  // 6. Update (or create) branch ref
  if (baseSHA) {
    await api("PATCH", `/git/refs/heads/${branch}`, { sha: commit.sha, force: true });
  } else {
    await api("POST", "/git/refs", { ref: `refs/heads/${branch}`, sha: commit.sha });
  }

  console.log(`\n✓ Done! https://github.com/${owner}/${repo}/tree/${branch}`);
  console.log(`  ${commit.sha.slice(0,7)} — ${message.split("\n")[0]}`);
}

main().catch(err => { console.error("\n✗ FAILED:", err.message); process.exit(1); });
