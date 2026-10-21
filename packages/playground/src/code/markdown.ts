import { h } from "../ui.js";

/** Inline Markdown: code spans, bold and emphasis; links keep their text only. */
function inline(text: string): (Node | string)[] {
  const parts: (Node | string)[] = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_|\[([^\]]+)\]\([^)]*\)/g;
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > at) parts.push(text.slice(at, match.index));
    if (match[1] !== undefined) parts.push(h("code", {}, match[1]));
    else if (match[2] !== undefined) parts.push(h("strong", {}, match[2]));
    else if (match[3] !== undefined || match[4] !== undefined)
      parts.push(h("em", {}, (match[3] ?? match[4])!));
    else parts.push(match[5]!);
    at = match.index + match[0].length;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

/**
 * The small Markdown of hovers and help as DOM nodes: paragraphs, fenced code, lists and
 * inline code, bold and emphasis. Text is never parsed as HTML.
 */
export function markdown(source: string): HTMLElement {
  const root = h("div", { class: "markdown" });
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: HTMLUListElement | undefined;
  const flush = () => {
    if (paragraph.length > 0) root.append(h("p", {}, ...inline(paragraph.join(" "))));
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("```")) {
      flush();
      list = undefined;
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i]!.startsWith("```"); i++) code.push(lines[i]!);
      root.append(h("pre", {}, h("code", {}, code.join("\n"))));
      continue;
    }
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (item) {
      flush();
      if (!list) {
        list = h("ul");
        root.append(list);
      }
      list.append(h("li", {}, ...inline(item[1]!)));
      continue;
    }
    if (line.trim() === "" || /^-{3,}$/.test(line.trim())) {
      flush();
      list = undefined;
      continue;
    }
    list = undefined;
    paragraph.push(line.replace(/^#+\s*/, ""));
  }
  flush();
  return root;
}
