import type { TextEdit } from "@meltemi/diagrams-language";

interface Member {
  readonly key: string;
  readonly valueStart: number;
  readonly valueEnd: number;
}

interface TopObject {
  readonly open: number;
  readonly close: number;
  readonly members: readonly Member[];
}

/** Skips whitespace from `i`. */
function skip(text: string, i: number): number {
  while (i < text.length && /\s/.test(text[i]!)) i++;
  return i;
}

/** The end of the JSON value starting at `i`: a string, a number, a literal, an object or an array. */
function valueEnd(text: string, i: number): number {
  const c = text[i];
  if (c === '"') {
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === "\\") j++;
      else if (text[j] === '"') return j + 1;
    }
    throw new Error("unterminated string");
  }
  if (c === "{" || c === "[") {
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      const d = text[j];
      if (d === '"') {
        j = valueEnd(text, j) - 1;
      } else if (d === "{" || d === "[") depth++;
      else if (d === "}" || d === "]") {
        depth--;
        if (depth === 0) return j + 1;
      }
    }
    throw new Error("unclosed object");
  }
  let j = i;
  while (j < text.length && !/[\s,}\]]/.test(text[j]!)) j++;
  return j;
}

/** The top-level object of a JSON text and the spans of its members. */
function topObject(text: string): TopObject {
  JSON.parse(text);
  const open = skip(text, 0);
  if (text[open] !== "{") throw new Error("not an object");
  const members: Member[] = [];
  let i = skip(text, open + 1);
  while (text[i] !== "}") {
    const keyEnd = valueEnd(text, i);
    const key = JSON.parse(text.slice(i, keyEnd)) as string;
    i = skip(text, keyEnd);
    i = skip(text, i + 1); // the colon
    const end = valueEnd(text, i);
    members.push({ key, valueStart: i, valueEnd: end });
    i = skip(text, end);
    if (text[i] === ",") i = skip(text, i + 1);
  }
  return { open, close: i, members };
}

/** The indentation of the line that holds offset `at`. */
function indentAt(text: string, at: number): string {
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart))![0];
}

/**
 * Sets a top-level string field of a JSON object, such as `"theme"` in `project.json`: replaces its
 * value when the field exists, else adds it after the last field, in the file's own indentation and
 * line endings. Everything else of the text is kept. Throws when the text is not a JSON object.
 */
export function setJsonField(text: string, key: string, value: string): TextEdit[] {
  return setJsonValue(text, key, JSON.stringify(value));
}

/**
 * Sets a top-level field of a JSON object to an object of strings, such as `"cloud"` in
 * `project.json`, written on one line (`{ "host": "…", "project": "…" }`, or `{}` when it has no
 * members): replaces the value when the field exists, else adds it after the last field, in the
 * file's own indentation and line endings. Everything else of the text is kept byte for byte, and
 * a value that is written already gives no edit. Throws when the text is not a JSON object.
 */
export function setJsonObjectField(
  text: string,
  key: string,
  value: Readonly<Record<string, string>>,
): TextEdit[] {
  const members = Object.entries(value).map(
    ([name, member]) => `${JSON.stringify(name)}: ${JSON.stringify(member)}`,
  );
  return setJsonValue(text, key, members.length === 0 ? "{}" : `{ ${members.join(", ")} }`);
}

/** The edit that makes the top-level field `key` hold `written`, a JSON value already serialised. */
function setJsonValue(text: string, key: string, written: string): TextEdit[] {
  const object = topObject(text);
  const existing = object.members.find((m) => m.key === key);
  if (existing) {
    if (text.slice(existing.valueStart, existing.valueEnd) === written) return [];
    return [{ start: existing.valueStart, end: existing.valueEnd, newText: written }];
  }
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const last = object.members[object.members.length - 1];
  if (!last) {
    // `{}` or `{ }`: the field on its own line.
    return [
      {
        start: object.open + 1,
        end: object.close,
        newText: `${eol}  ${JSON.stringify(key)}: ${written}${eol}`,
      },
    ];
  }
  const oneLine = !text.slice(object.open, object.close).includes("\n");
  if (oneLine) {
    return [
      { start: last.valueEnd, end: last.valueEnd, newText: `, ${JSON.stringify(key)}: ${written}` },
    ];
  }
  const keyStart = text.lastIndexOf(JSON.stringify(last.key), last.valueStart);
  const indent = indentAt(text, keyStart);
  return [
    {
      start: last.valueEnd,
      end: last.valueEnd,
      newText: `,${eol}${indent}${JSON.stringify(key)}: ${written}`,
    },
  ];
}
