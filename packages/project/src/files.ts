// The names of a project's files, one rule for every host that holds a project in the cloud: the
// playground, the cloud Worker and the command line (`cloud-projects`, "The document").

/** Extensions of the files the code pane edits, which a cloud project keeps as text. */
export const CLOUD_TEXT_EXTENSIONS = ["meltemi", "json", "md", "txt", "svg", "css"] as const;

/** Extensions of the pictures a project can use. */
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg"] as const;

const hasExtension = (path: string, extensions: readonly string[]): boolean => {
  const dot = path.lastIndexOf(".");
  return dot !== -1 && extensions.includes(path.slice(dot + 1).toLowerCase());
};

/** Whether a project path names a text file, which the code pane edits. */
export function isTextPath(path: string): boolean {
  return hasExtension(path, CLOUD_TEXT_EXTENSIONS);
}

/** Whether a project path names a picture the project can use. */
export function isImagePath(path: string): boolean {
  return hasExtension(path, IMAGE_EXTENSIONS);
}

/** The most segments a path may have. */
export const PATH_SEGMENTS = 12;

/** The most characters a segment of a path may have. */
export const PATH_SEGMENT_LENGTH = 100;

const SEGMENT = /^[\w .()+@-]{1,100}$/;

/**
 * A project path checked for use as a file name, written the one way it is kept: relative,
 * `/`-separated, nothing hidden. Backslashes become slashes and empty and `.` segments go, so
 * what comes out is canonical; a path with an empty or `..` segment, a segment that starts with
 * `.`, more than 100 characters in a segment, more than 12 segments, a `:` or a control
 * character is `undefined`. Use `isCleanPath` to ask whether a path is already in that form.
 */
export function cleanPath(path: string): string | undefined {
  const parts = path
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => p !== "" && p !== ".");
  if (parts.length === 0 || parts.length > PATH_SEGMENTS) return undefined;
  if (parts.some((p) => p === ".." || p.startsWith(".") || !SEGMENT.test(p))) return undefined;
  return parts.join("/");
}

/**
 * Whether a path is valid as it stands: `cleanPath` accepts it and changes nothing. This is the
 * rule the cloud enforces on every path it keeps (`a\b`, `a//b` and `./a` are refused there,
 * though `cleanPath` would turn them into a path).
 */
export function isCleanPath(path: string): boolean {
  return cleanPath(path) === path;
}
