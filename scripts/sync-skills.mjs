#!/usr/bin/env node
// Copies every skill under skills/ into the agent folders (.claude/skills and .codex/skills), so
// Claude Code, Codex and other agents read the same instructions, and into the command line's
// package (packages/cli/skills), which installs them into other projects. The canonical copy is skills/.
// Agent folders also hold skills this repository does not own (the OpenSpec skills), so the script
// records the skills it copies in a manifest and only ever deletes skills it copied before.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const MANIFEST = ".skills-sync.json";

const root = process.cwd();
const source = join(root, "skills");
// The command line ships the skills too, for `meltemi-diagrams skill install` (decision 0056).
const targets = [
  join(root, ".claude", "skills"),
  join(root, ".codex", "skills"),
  join(root, "packages", "cli", "skills"),
];

if (!existsSync(source)) {
  console.error("No skills/ folder found.");
  process.exit(1);
}

const skills = readdirSync(source)
  .filter((name) => statSync(join(source, name)).isDirectory())
  .sort();

/** Skill names this script copied into `target` on its previous run. */
function managedSkills(target) {
  try {
    const manifest = JSON.parse(readFileSync(join(target, MANIFEST), "utf8"));
    return Array.isArray(manifest.skills)
      ? manifest.skills.filter((name) => typeof name === "string")
      : [];
  } catch {
    return [];
  }
}

for (const target of targets) {
  mkdirSync(target, { recursive: true });

  const stale = new Set(managedSkills(target));
  for (const name of skills) stale.delete(name);
  for (const name of stale) {
    // Only plain folder names are removed, whatever the manifest says.
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name === "." || name === "..") continue;
    const path = join(target, name);
    if (!existsSync(path)) continue;
    rmSync(path, { recursive: true, force: true });
    console.log(`removed ${path}`);
  }

  for (const name of skills) {
    const destination = join(target, name);
    rmSync(destination, { recursive: true, force: true });
    cpSync(join(source, name), destination, { recursive: true });
    console.log(`synced ${name} -> ${destination}`);
  }

  writeFileSync(join(target, MANIFEST), `${JSON.stringify({ skills }, null, 2)}\n`);
}

// The assistance package carries the language references too (packages/assist/src/guide.ts).
const { guideSource } = await import("./assist-guide.mjs");
const guide = join(root, "packages", "assist", "src", "guide.ts");
if (existsSync(guide)) {
  writeFileSync(guide, guideSource(root));
  console.log(`synced the language guide -> ${guide}`);
}
