import {
  isNode,
  isToken,
  tokensOf,
  type Block,
  type CstNode,
  type SourceFile,
  type Token,
} from "@meltemi/diagrams-language";
import {
  ENTITY_KINDS,
  FRAGMENT_BRANCH_KEYWORDS,
  FRAGMENT_OPERATORS,
  PARTICIPANT_KINDS,
  type Compilation,
  type FlowDiagram,
  type Reference,
} from "@meltemi/diagrams-model";

/** The kind of block the cursor is in, which decides what may be written there. */
export type Scope =
  | "top"
  | "flow"
  | "free"
  | "sequence"
  /** The body of a C4 view. */
  | "c4"
  /** The root of a `model` block. */
  | "model"
  /** The block of an entity of a model. */
  | "entity"
  /** A branch of a sequence fragment, which holds events. */
  | "fragment"
  | "scenario"
  | "group"
  | "element"
  | "relation"
  | "placement"
  | "style"
  | "class"
  | "rule"
  | "animate"
  | "theme"
  /** The root of a `story` block, a scene and a `parallel` block of a scene. */
  | "story"
  | "scene"
  | "parallel"
  /** The block of an `export` profile. */
  | "export"
  | "other";

/** The token that contains `offset`, or ends exactly at it. */
export function tokenAt(root: SourceFile, offset: number): Token | undefined {
  let previous: Token | undefined;
  for (const token of tokensOf(root)) {
    if (token.kind === "EOF" || token.kind === "Newline") {
      if (token.start > offset) break;
      continue;
    }
    if (token.start <= offset && offset < token.end) return token;
    if (token.end === offset) previous = token;
    if (token.start > offset) break;
  }
  return previous;
}

/** Nodes from the root down to the deepest one whose span contains `offset`. */
export function pathAt(root: SourceFile, offset: number): CstNode[] {
  const path: CstNode[] = [root];
  let current: CstNode = root;
  for (;;) {
    const child: CstNode | undefined = current.children.find(
      (c): c is CstNode => isNode(c) && c.start <= offset && offset <= c.end && c.end > c.start,
    );
    if (!child) return path;
    path.push(child);
    current = child;
  }
}

/** The innermost block whose braces enclose `offset`, with the node that owns it. */
export function blockAt(
  root: SourceFile,
  offset: number,
): { block: Block; owner: CstNode } | undefined {
  const path = pathAt(root, offset);
  for (let i = path.length - 1; i > 0; i--) {
    const node = path[i]!;
    if (node.kind !== "Block") continue;
    const close = node.close;
    const closed = isToken(close) ? offset <= close.start : true;
    if (node.open.end <= offset && closed) return { block: node, owner: path[i - 1]! };
  }
  return undefined;
}

const OPERATORS: ReadonlySet<string> = new Set(FRAGMENT_OPERATORS);
const BRANCH_KEYWORDS: ReadonlySet<string> = new Set(Object.values(FRAGMENT_BRANCH_KEYWORDS));

/** The scope of the block that encloses `offset`. */
export function scopeAt(root: SourceFile, offset: number): Scope {
  const found = blockAt(root, offset);
  if (!found) return "top";
  const owner = found.owner;
  switch (owner.kind) {
    case "DiagramBlock": {
      const type = isToken(owner.type) ? owner.type.text : "";
      return type === "flow" || type === "free" || type === "sequence" || type === "c4"
        ? type
        : "other";
    }
    case "ModelBlock":
      return "model";
    case "ThemeBlock":
      return "theme";
    case "StoryBlock":
      return "story";
    case "ExportBlock":
      return "export";
    case "ShorthandDeclaration":
      return "element";
    case "RelationStatement":
      return "relation";
    case "ChainClause":
      return BRANCH_KEYWORDS.has(owner.keyword.text) || OPERATORS.has(owner.keyword.text)
        ? "fragment"
        : "other";
    case "KeywordStatement": {
      const word = owner.keyword.text;
      if (word === "group") return "group";
      // A sequence diagram's `return` is a message: its block holds message properties.
      if (word === "return") return "relation";
      if (OPERATORS.has(word)) return "fragment";
      if (word === "scenario") return "scenario";
      if ((ENTITY_KINDS as readonly string[]).includes(word)) return "entity";
      if (
        ["node", "decision", "data", "note", "tag", "box", "text", "icon", "image"].includes(
          word,
        ) ||
        (PARTICIPANT_KINDS as readonly string[]).includes(word)
      ) {
        return "element";
      }
      if (word === "placement" || word === "style" || word === "class" || word === "rule") {
        return word;
      }
      if (word === "animate") return "animate";
      if (word === "scene") return "scene";
      if (word === "parallel") return "parallel";
      return "other";
    }
    default:
      return "other";
  }
}

/** The diagram whose block contains `offset`. */
export function diagramAt(compilation: Compilation, offset: number): FlowDiagram | undefined {
  return compilation.document.diagrams.find((d) => d.node.start <= offset && offset <= d.node.end);
}

/** The identifier reference whose token contains or ends at `offset`. */
export function referenceAt(
  compilation: Compilation,
  offset: number,
): { diagram: FlowDiagram; reference: Reference } | undefined {
  const diagram = diagramAt(compilation, offset);
  if (!diagram) return undefined;
  let fallback: Reference | undefined;
  for (const reference of diagram.references) {
    const token = reference.token;
    if (token.start <= offset && offset < token.end) return { diagram, reference };
    if (token.end === offset) fallback = reference;
  }
  return fallback ? { diagram, reference: fallback } : undefined;
}

/** The identifier characters before `offset` on its line, as the word being typed. */
export function wordBefore(text: string, offset: number): { start: number; word: string } {
  let start = offset;
  while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1]!)) start--;
  return { start, word: text.slice(start, offset) };
}

/**
 * The text of the current statement before the cursor: from the start of the line, the last `;`,
 * or the last `{`, whichever is closest, without leading spaces.
 */
export function statementPrefix(text: string, offset: number): string {
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  let start = lineStart;
  let inString = false;
  for (let i = lineStart; i < offset; i++) {
    const ch = text[i]!;
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === ";" || ch === "{") {
      start = i + 1;
    } else if (ch === "/" && text[i + 1] === "/") {
      // A line comment: nothing after it is code.
      return "";
    }
  }
  return text.slice(start, offset).replace(/^\s+/, "");
}
