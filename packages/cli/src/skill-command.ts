import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { argumentsError, messages } from "./messages/index.js";

/** What the skill command needs from the CLI. */
export interface SkillContext {
  readonly name: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly cwd: string;
  /** A path as printed: relative to the working folder. */
  readonly display: (path: string) => string;
  /** The person's home folder, where `--user` installs; the system's by default. */
  readonly home?: string;
}

/**
 * The agents the skill installs for, with the folder under the project (or the home folder) each
 * reads skills from, as the vendors' pages name them (decision 0063): Claude Code reads
 * `.claude/skills`; Codex, Cursor, GitHub Copilot, Gemini CLI and Devin Desktop (once Windsurf)
 * read the cross-agent `.agents/skills`, which `agents` names for any other agent that reads it.
 */
export const SKILL_AGENTS = {
  claude: ".claude/skills",
  codex: ".agents/skills",
  cursor: ".agents/skills",
  copilot: ".agents/skills",
  gemini: ".agents/skills",
  windsurf: ".agents/skills",
  devin: ".agents/skills",
  agents: ".agents/skills",
} as const;
export type SkillAgent = keyof typeof SKILL_AGENTS;

/** The agents' names and `all`, as the help and the refusal list them. */
const AGENT_NAMES = [...Object.keys(SKILL_AGENTS), "all"];

/** The skill the package ships. */
export const SKILL_NAME = "meltemi-diagrams";

/** The folder of the shipped skills: `skills/` beside `src/` and `dist/`. */
const SKILL_ROOT = fileURLToPath(new URL("../skills/", import.meta.url));

/** The agent setup prompt the package ships, which `skill prompt` prints and the site serves. */
const PROMPT = fileURLToPath(new URL("../agent-setup/prompt.md", import.meta.url));

const EXIT_OK = 0;
const EXIT_USAGE = 2;

/**
 * The skill's text as an installed project reads it: the repository's `pnpm mdg <command>` becomes
 * the installed command's `mdg <command>`, the repository's preview server the command's own, and
 * the repository root the project's folder.
 */
export function installedText(text: string): string {
  return text
    .replaceAll(
      "`pnpm preview` serves the repository at `http://localhost:4173`",
      "`mdg preview` serves the folder at `http://localhost:4173`",
    )
    .replaceAll("`pnpm preview`", "`mdg preview`")
    .replaceAll("(from the repository root)", "(from the project's folder)")
    .replaceAll("pnpm mdg ", "mdg ");
}

/**
 * Copies the shipped skill to `destination`, rewriting its text for an installed project: the
 * Markdown and the commands the examples' comments name.
 */
function writeSkill(destination: string): void {
  const source = join(SKILL_ROOT, SKILL_NAME);
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { recursive: true });
  const rewrite = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) rewrite(path);
      else if (entry.name.endsWith(".md") || entry.name.endsWith(".meltemi")) {
        writeFileSync(path, installedText(readFileSync(path, "utf8")));
      }
    }
  };
  rewrite(destination);
}

/**
 * The skill folders the named agents read, each once, in the table's order; `all` names every
 * folder. The first name that is empty or unknown otherwise.
 */
export function skillFolders(
  names: readonly string[],
): { folders: string[] } | { unknown: string } {
  const wanted = new Set<string>();
  for (const name of names) {
    if (name === "all") Object.values(SKILL_AGENTS).forEach((folder) => wanted.add(folder));
    else if (Object.hasOwn(SKILL_AGENTS, name)) wanted.add(SKILL_AGENTS[name as SkillAgent]);
    else return { unknown: name };
  }
  return { folders: [...new Set(Object.values(SKILL_AGENTS))].filter((f) => wanted.has(f)) };
}

/** `meltemi-diagrams skill install` and `meltemi-diagrams skill prompt`. */
export function skillCommand(args: readonly string[], context: SkillContext): number {
  const fail = (message: string) => {
    context.stderr(`${context.name} skill: ${message}\n`);
    return EXIT_USAGE;
  };
  let options: { agent?: string[]; user: boolean; force: boolean; help: boolean };
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: [...args],
      options: {
        agent: { type: "string", multiple: true },
        user: { type: "boolean", default: false },
        force: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: true,
      strict: true,
    });
    options = parsed.values as typeof options;
    positionals = parsed.positionals;
  } catch (error) {
    return fail(argumentsError(error));
  }
  const t = messages().skill;
  if (options.help) {
    context.stdout(messages().help.skill);
    return EXIT_OK;
  }
  const [subcommand, folder, ...extra] = positionals;
  if (subcommand === "prompt") {
    const given = options.agent !== undefined || options.user || options.force;
    if (folder !== undefined || given) return fail(t.promptArguments);
    // Byte for byte: the text is written for the installed command and is never rewritten.
    context.stdout(readFileSync(PROMPT, "utf8"));
    return EXIT_OK;
  }
  if (subcommand !== "install") return fail(t.subcommand(subcommand ?? ""));
  if (extra.length > 0) return fail(t.tooMany);
  if (options.user && folder !== undefined) return fail(t.userWithFolder);
  const names = (options.agent ?? ["all"]).flatMap((value) =>
    value.split(",").map((name) => name.trim()),
  );
  const chosen = skillFolders(names);
  if ("unknown" in chosen) return fail(t.unknownAgent(chosen.unknown, AGENT_NAMES));
  const base = options.user ? (context.home ?? homedir()) : resolve(context.cwd, folder ?? ".");
  const destinations = chosen.folders.map((agentFolder) => join(base, agentFolder, SKILL_NAME));
  // Nothing is written when any destination holds a copy, unless asked to replace it.
  if (!options.force) {
    const existing = destinations.find((path) => existsSync(path));
    if (existing) return fail(t.exists(context.display(existing)));
  }
  for (const destination of destinations) {
    // Only the skill's own folder is replaced; the folders beside it stay.
    if (options.force) rmSync(destination, { recursive: true, force: true });
    writeSkill(destination);
    context.stdout(`${t.wrote(context.display(destination))}\n`);
  }
  return EXIT_OK;
}
