/** `/`-separated path helpers that work the same on every host. */

export function toSlashes(path: string): string {
  return path.replace(/\\/g, "/");
}

export function isAbsolutePath(path: string): boolean {
  const p = toSlashes(path);
  return p.startsWith("/") || /^[A-Za-z]:\//.test(p) || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(p);
}

/** Removes `.` and `..` segments; a leading `..` that cannot be resolved is kept. */
export function normalizePath(path: string): string {
  const p = toSlashes(path);
  const drive = /^[A-Za-z]:/.exec(p)?.[0] ?? "";
  const rest = p.slice(drive.length);
  const absolute = rest.startsWith("/");
  const out: string[] = [];
  for (const part of rest.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else if (!absolute) out.push("..");
      continue;
    }
    out.push(part);
  }
  const joined = out.join("/");
  return drive + (absolute ? "/" : "") + (joined === "" && !absolute ? "." : joined);
}

export function dirname(path: string): string {
  const p = toSlashes(path);
  const i = p.lastIndexOf("/");
  if (i < 0) return ".";
  if (i === 0) return "/";
  return p.slice(0, i);
}

export function joinPath(dir: string, path: string): string {
  if (isAbsolutePath(path)) return normalizePath(path);
  return normalizePath(dir === "." ? path : `${dir}/${path}`);
}

/** True when `path` is `root` or inside it. Both must be normalised. */
export function isInside(path: string, root: string): boolean {
  if (root === ".") return !path.startsWith("../") && path !== ".." && !isAbsolutePath(path);
  const r = root.endsWith("/") ? root : `${root}/`;
  const a = path.toLowerCase();
  return a === root.toLowerCase() || a.startsWith(r.toLowerCase());
}

export function basename(path: string): string {
  const p = toSlashes(path);
  return p.slice(p.lastIndexOf("/") + 1);
}
