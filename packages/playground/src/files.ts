import { isTextPath, type DirectoryEntry, type ProjectHost } from "@meltemi/diagrams-project";

/** The folder of the project in memory; paths of the page are relative to it. */
export const ROOT = "/playground";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

// The path rule is shared with the cloud Worker and the command line: it lives in the project
// package (`cloud-projects`).
export { cleanPath, isCleanPath, isImagePath, isTextPath } from "@meltemi/diagrams-project";

/**
 * Whether a file's content is text the code pane edits: a string, or bytes at a text path (an
 * `.svg` opened from an archive stays bytes in the project but is text in a cloud project).
 */
export function isTextContent(path: string, content: string | Uint8Array): boolean {
  return typeof content === "string" || isTextPath(path);
}

/**
 * The text of a new file: for a `.meltemi` file, a small flow named after the file whose two
 * labels are `words` (in the interface's language, as the person would have typed them); the code
 * around them stays as written. Other files start empty.
 */
export function starterText(path: string, words: { start: string; done: string }): string {
  if (!path.endsWith(".meltemi")) return "";
  const id =
    path
      .slice(path.lastIndexOf("/") + 1)
      .replace(/\.[^.]*$/, "")
      .replace(/[^A-Za-z0-9_]/g, "_")
      .replace(/^(?=\d)/, "d") || "sheet";
  return `diagram ${id}: flow {\n  title "${id}"\n\n  start[${JSON.stringify(words.start)}]\n  done[${JSON.stringify(words.done)}]\n\n  start -> done\n}\n`;
}

/**
 * The files of the page's project, kept in memory: text files as strings and other files as
 * bytes, by path relative to the project folder. It serves them to the project compiler as a
 * `ProjectHost` rooted at `/playground`.
 */
export class MemoryHost implements ProjectHost {
  private readonly files = new Map<string, string | Uint8Array>();

  constructor(files: Iterable<readonly [string, string | Uint8Array]> = []) {
    for (const [path, content] of files) this.write(path, content);
  }

  /** Relative paths of every file, sorted. */
  paths(): string[] {
    return [...this.files.keys()].sort();
  }

  has(path: string): boolean {
    return this.files.has(path);
  }

  get(path: string): string | Uint8Array | undefined {
    return this.files.get(path);
  }

  /** The text of a file; files kept as bytes are decoded as UTF-8. */
  text(path: string): string | undefined {
    const content = this.files.get(path);
    return content === undefined || typeof content === "string" ? content : decoder.decode(content);
  }

  write(path: string, content: string | Uint8Array): void {
    this.files.set(path, content);
  }

  delete(path: string): boolean {
    return this.files.delete(path);
  }

  rename(from: string, to: string): boolean {
    const content = this.files.get(from);
    if (content === undefined || this.files.has(to)) return false;
    this.files.delete(from);
    this.files.set(to, content);
    return true;
  }

  /** The relative path of an absolute one under the root, or undefined outside it. */
  relative(path: string): string | undefined {
    if (!path.startsWith(`${ROOT}/`)) return undefined;
    return path.slice(ROOT.length + 1);
  }

  readFile(path: string): string | undefined {
    const relative = this.relative(path);
    return relative === undefined ? undefined : this.text(relative);
  }

  readBinary(path: string): Uint8Array | undefined {
    const relative = this.relative(path);
    const content = relative === undefined ? undefined : this.files.get(relative);
    return typeof content === "string" ? encoder.encode(content) : content;
  }

  readDirectory(path: string): readonly DirectoryEntry[] | undefined {
    const folder = path.replace(/\/+$/, "");
    if (folder === "") return [{ name: ROOT.slice(1), kind: "directory" }];
    if (folder !== ROOT && !folder.startsWith(`${ROOT}/`)) return undefined;
    const prefix = folder === ROOT ? "" : `${folder.slice(ROOT.length + 1)}/`;
    const entries = new Map<string, "file" | "directory">();
    for (const file of this.files.keys()) {
      if (!file.startsWith(prefix)) continue;
      const rest = file.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash < 0) entries.set(rest, "file");
      else entries.set(rest.slice(0, slash), "directory");
    }
    if (entries.size === 0 && folder !== ROOT) return undefined;
    return [...entries]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, kind]) => ({ name, kind }));
  }
}
