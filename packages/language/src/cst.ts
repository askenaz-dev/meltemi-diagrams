import type { Token } from "./tokens.js";

export type NodeKind =
  | "SourceFile"
  | "Header"
  | "ImportStatement"
  | "ImportMember"
  | "ModelBlock"
  | "DiagramBlock"
  | "StoryBlock"
  | "ExportBlock"
  | "ThemeBlock"
  | "Block"
  | "RelationStatement"
  | "ShorthandDeclaration"
  | "KeywordStatement"
  | "BlockChain"
  | "ChainClause"
  | "QualifiedRef"
  | "StringLiteral"
  | "NumberLiteral"
  | "Tuple"
  | "List"
  | "Missing"
  | "Error";

export type CstElement = CstNode | Token;

/**
 * Common shape of every syntax node. `children` hold every token and node in source order, so
 * the tree is lossless. Typed fields on each node kind point into `children` for convenience.
 */
export interface NodeBase {
  readonly kind: NodeKind;
  readonly children: readonly CstElement[];
  /** Offset of the first token text (excluding leading trivia). */
  readonly start: number;
  /** Offset after the last token. */
  readonly end: number;
  /** Offset where the leading trivia of the first token starts. */
  readonly fullStart: number;
  /** True when the node contains a syntax error (missing or skipped tokens, bad tokens). */
  readonly hasError: boolean;
}

/** Zero-width placeholder inserted by error recovery where a token or node was expected. */
export interface Missing extends NodeBase {
  readonly kind: "Missing";
  readonly expected: string;
}

/** Tokens skipped by error recovery. */
export interface ErrorNode extends NodeBase {
  readonly kind: "Error";
}

export interface SourceFile extends NodeBase {
  readonly kind: "SourceFile";
  readonly items: readonly TopLevelItem[];
  readonly eof: Token;
}

export type TopLevelItem =
  | Header
  | ImportStatement
  | ModelBlock
  | DiagramBlock
  | StoryBlock
  | ExportBlock
  | ThemeBlock
  | ErrorNode;

export interface Header extends NodeBase {
  readonly kind: "Header";
  readonly keyword: Token;
  readonly version: Token | Missing;
}

/**
 * `import "<path>" as <namespace>` (form `namespace`) or
 * `import <id> [as <alias>], ... from "<path>"` (form `members`).
 */
export interface ImportStatement extends NodeBase {
  readonly kind: "ImportStatement";
  readonly keyword: Token;
  readonly form: "namespace" | "members";
  /** The path string, or a placeholder when it is missing. */
  readonly path: Token | Missing;
  /** Namespace form: `as` and the namespace id. */
  readonly asKeyword: Token | Missing | undefined;
  readonly namespace: Token | Missing | undefined;
  /** Members form: the imported ids and `from`. */
  readonly members: readonly ImportMember[];
  readonly fromKeyword: Token | Missing | undefined;
}

/** One imported id with its optional alias: `corporate as corp`. */
export interface ImportMember extends NodeBase {
  readonly kind: "ImportMember";
  readonly id: Token;
  readonly asKeyword: Token | undefined;
  readonly alias: Token | Missing | undefined;
}

export interface DiagramBlock extends NodeBase {
  readonly kind: "DiagramBlock";
  readonly keyword: Token;
  readonly id: Token | Missing;
  readonly colon: Token | Missing | undefined;
  readonly type: Token | Missing | undefined;
  readonly usingKeyword: Token | undefined;
  readonly usingRef: QualifiedRef | Missing | undefined;
  readonly block: Block | Missing;
}

/** `model <id> { }` and `theme <id> { }`. */
export interface ModelBlock extends NodeBase {
  readonly kind: "ModelBlock";
  readonly keyword: Token;
  readonly id: Token | Missing;
  readonly block: Block | Missing;
}

export interface ThemeBlock extends NodeBase {
  readonly kind: "ThemeBlock";
  readonly keyword: Token;
  readonly id: Token | Missing;
  readonly block: Block | Missing;
}

/** `story <id> for <ref> { }`. */
export interface StoryBlock extends NodeBase {
  readonly kind: "StoryBlock";
  readonly keyword: Token;
  readonly id: Token | Missing;
  readonly forKeyword: Token | Missing | undefined;
  readonly target: QualifiedRef | Missing | undefined;
  readonly block: Block | Missing;
}

/** `export <id> for <ref> { }`. */
export interface ExportBlock extends NodeBase {
  readonly kind: "ExportBlock";
  readonly keyword: Token;
  readonly id: Token | Missing;
  readonly forKeyword: Token | Missing | undefined;
  readonly target: QualifiedRef | Missing | undefined;
  readonly block: Block | Missing;
}

export interface Block extends NodeBase {
  readonly kind: "Block";
  readonly open: Token;
  readonly statements: readonly Statement[];
  readonly close: Token | Missing;
}

export type Statement = RelationStatement | ShorthandDeclaration | KeywordStatement | ErrorNode;

/** `<ref> -> <ref> [: "label"] [as <id>] [{ ... }]` */
export interface RelationStatement extends NodeBase {
  readonly kind: "RelationStatement";
  readonly source: QualifiedRef;
  readonly arrow: Token;
  readonly target: QualifiedRef | Missing;
  readonly colon: Token | undefined;
  readonly label: Token | Missing | undefined;
  readonly asKeyword: Token | undefined;
  readonly id: Token | Missing | undefined;
  readonly block: Block | undefined;
}

/** `<id>["Label"]` (shape `box`) or `<id>[("Label")]` (shape `data`), with an optional block. */
export interface ShorthandDeclaration extends NodeBase {
  readonly kind: "ShorthandDeclaration";
  readonly id: Token;
  readonly shape: "box" | "data";
  readonly label: Token | Missing;
  readonly block: Block | undefined;
}

/** `<word> <arg>* [{ ... }]`, optionally followed on the same line by more `<word> <arg>* { ... }`. */
export interface KeywordStatement extends NodeBase {
  readonly kind: "KeywordStatement";
  readonly keyword: Token;
  readonly args: readonly Arg[];
  readonly block: Block | undefined;
  /** Present when more than one clause is chained, e.g. `alt "A" { } else "B" { }`. */
  readonly chain: BlockChain | undefined;
}

export interface BlockChain extends NodeBase {
  readonly kind: "BlockChain";
  readonly clauses: readonly ChainClause[];
}

export interface ChainClause extends NodeBase {
  readonly kind: "ChainClause";
  readonly keyword: Token;
  readonly args: readonly Arg[];
  readonly block: Block | Missing;
}

export type Arg = QualifiedRef | StringLiteral | NumberLiteral | Tuple | List;

/** One identifier or several joined by dots: `api`, `shop.api`, `api.east`. */
export interface QualifiedRef extends NodeBase {
  readonly kind: "QualifiedRef";
  readonly parts: readonly Token[];
  readonly text: string;
}

export interface StringLiteral extends NodeBase {
  readonly kind: "StringLiteral";
  readonly token: Token;
  readonly value: string;
}

export interface NumberLiteral extends NodeBase {
  readonly kind: "NumberLiteral";
  readonly token: Token;
  readonly value: number;
  readonly unit: string | null;
}

export interface Tuple extends NodeBase {
  readonly kind: "Tuple";
  readonly open: Token;
  readonly items: readonly Arg[];
  readonly close: Token | Missing;
}

export interface List extends NodeBase {
  readonly kind: "List";
  readonly open: Token;
  readonly items: readonly Arg[];
  readonly close: Token | Missing;
}

export type CstNode =
  | SourceFile
  | Header
  | ImportStatement
  | ImportMember
  | ModelBlock
  | DiagramBlock
  | StoryBlock
  | ExportBlock
  | ThemeBlock
  | Block
  | RelationStatement
  | ShorthandDeclaration
  | KeywordStatement
  | BlockChain
  | ChainClause
  | QualifiedRef
  | StringLiteral
  | NumberLiteral
  | Tuple
  | List
  | Missing
  | ErrorNode;

export function isToken(element: CstElement | undefined): element is Token {
  return element !== undefined && "leadingTrivia" in element;
}

export function isNode(element: CstElement | undefined): element is CstNode {
  return element !== undefined && !("leadingTrivia" in element);
}

export function isMissing(element: CstElement | undefined): element is Missing {
  return isNode(element) && element.kind === "Missing";
}

/** All tokens under an element, in source order. */
export function* tokensOf(element: CstElement): Generator<Token> {
  if (isToken(element)) {
    yield element;
    return;
  }
  for (const child of element.children) yield* tokensOf(child);
}

/** Source text of an element, including the leading trivia of its first token. */
export function toText(element: CstElement): string {
  let out = "";
  for (const token of tokensOf(element)) {
    for (const trivia of token.leadingTrivia) out += trivia.text;
    out += token.text;
  }
  return out;
}

export function firstToken(element: CstElement): Token | undefined {
  for (const token of tokensOf(element)) return token;
  return undefined;
}

export function lastToken(element: CstElement): Token | undefined {
  if (isToken(element)) return element;
  for (let i = element.children.length - 1; i >= 0; i--) {
    const found = lastToken(element.children[i]!);
    if (found) return found;
  }
  return undefined;
}

/** Depth-first walk over nodes. Return `false` from the visitor to skip a node's children. */
export function walk(
  node: CstNode,
  visit: (node: CstNode, parent: CstNode | undefined) => boolean | void,
): void {
  const stack: { node: CstNode; parent: CstNode | undefined }[] = [{ node, parent: undefined }];
  while (stack.length > 0) {
    const { node: current, parent } = stack.pop()!;
    if (visit(current, parent) === false) continue;
    for (let i = current.children.length - 1; i >= 0; i--) {
      const child = current.children[i]!;
      if (isNode(child)) stack.push({ node: child, parent: current });
    }
  }
}

/** Map from every node to its parent node. */
export function buildParentMap(root: CstNode): Map<CstNode, CstNode> {
  const parents = new Map<CstNode, CstNode>();
  walk(root, (node, parent) => {
    if (parent) parents.set(node, parent);
  });
  return parents;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Builds a node and computes its spans and error flag from its children. */
export function makeNode<T extends CstNode>(
  kind: T["kind"],
  children: CstElement[],
  fields: Omit<T, keyof NodeBase>,
  position?: number,
): T {
  const node = { kind, children, start: 0, end: 0, fullStart: 0, hasError: false, ...fields } as
    Mutable<NodeBase> | Record<string, unknown>;
  computeSpans(node as Mutable<NodeBase>, position);
  return node as unknown as T;
}

export function makeMissing(expected: string, position: number): Missing {
  return {
    kind: "Missing",
    expected,
    children: [],
    start: position,
    end: position,
    fullStart: position,
    hasError: true,
  };
}

/** Appends a child to an already built node (used to attach skipped tokens) and updates spans. */
export function appendChild(node: CstNode, child: CstElement): void {
  (node.children as CstElement[]).push(child);
  computeSpans(node as Mutable<NodeBase>, node.start);
}

function computeSpans(node: Mutable<NodeBase>, position: number | undefined): void {
  let start = -1;
  let end = -1;
  let fullStart = -1;
  let hasError = node.kind === "Missing" || node.kind === "Error";
  let missingPosition: number | undefined;
  for (const child of node.children) {
    if (isToken(child)) {
      if (start < 0) {
        start = child.start;
        fullStart = child.fullStart;
      }
      end = child.end;
      if (child.kind === "Unknown" || child.malformed) hasError = true;
      continue;
    }
    if (child.hasError) hasError = true;
    if (child.kind === "Missing") {
      if (missingPosition === undefined) missingPosition = child.start;
      continue;
    }
    if (child.end > child.start || child.children.length > 0) {
      if (start < 0) {
        start = child.start;
        fullStart = child.fullStart;
      }
      end = child.end;
    }
  }
  if (start < 0) {
    const p = missingPosition ?? position ?? 0;
    start = end = fullStart = p;
  }
  node.start = start;
  node.end = end;
  node.fullStart = fullStart;
  node.hasError = hasError;
}
