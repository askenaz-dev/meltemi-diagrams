import {
  appendChild,
  makeMissing,
  makeNode,
  type Arg,
  type Block,
  type BlockChain,
  type ChainClause,
  type CstElement,
  type DiagramBlock,
  type ErrorNode,
  type ExportBlock,
  type Header,
  type ImportMember,
  type ImportStatement,
  type KeywordStatement,
  type List,
  type Missing,
  type ModelBlock,
  type NumberLiteral,
  type QualifiedRef,
  type RelationStatement,
  type ShorthandDeclaration,
  type SourceFile,
  type Statement,
  type StoryBlock,
  type StringLiteral,
  type ThemeBlock,
  type TopLevelItem,
  type Tuple,
} from "./cst.js";
import {
  createDiagnostic,
  sortDiagnostics,
  type Diagnostic,
  type DiagnosticInput,
} from "./diagnostics.js";
import { tokenize } from "./lexer.js";
import { messages, type LanguageMessages } from "./messages/index.js";
import { LineIndex, type Span } from "./positions.js";
import { describeToken, isArrowKind, type Token, type TokenKind } from "./tokens.js";

/** What the parser expects at a position, from the catalog of a language. */
type Expected = (expected: LanguageMessages["expected"]) => string;

export interface ParseResult {
  readonly text: string;
  readonly root: SourceFile;
  readonly tokens: readonly Token[];
  /** Lexer and parser diagnostics, ordered by position. */
  readonly diagnostics: readonly Diagnostic[];
  readonly lines: LineIndex;
}

/** Maximum nesting of blocks, tuples and lists before the parser stops descending. */
export const MAX_NESTING_DEPTH = 100;

export const TOP_LEVEL_KEYWORDS = [
  "language",
  "import",
  "model",
  "diagram",
  "story",
  "export",
  "theme",
];

/**
 * Parses `.meltemi` text into a lossless concrete syntax tree. Never throws on user input:
 * every problem becomes a diagnostic and recovery continues at the next statement.
 */
export function parse(text: string): ParseResult {
  const lines = new LineIndex(text);
  const lexed = tokenize(text, lines);
  const parser = new Parser(lexed.tokens, lines);
  const root = parser.parseSourceFile();
  return {
    text,
    root,
    tokens: lexed.tokens,
    diagnostics: sortDiagnostics([...lexed.diagnostics, ...parser.diagnostics]),
    lines,
  };
}

const TERMINATORS: ReadonlySet<TokenKind> = new Set(["Newline", "Semicolon", "RBrace", "EOF"]);

class Parser {
  readonly diagnostics: Diagnostic[] = [];
  private pos = 0;
  /** Whether the statement being parsed already reported (or inherited) an error. */
  private failed = false;
  private depth = 0;
  private reportedMissingBraceAtEof = false;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly lines: LineIndex,
  ) {}

  // ---------------------------------------------------------------- token access

  private get current(): Token {
    return this.tokens[this.pos]!;
  }

  private peek(offset: number): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]!;
  }

  private at(kind: TokenKind): boolean {
    return this.current.kind === kind;
  }

  private atKeyword(text: string): boolean {
    return this.current.kind === "Identifier" && this.current.text === text;
  }

  private advance(): Token {
    const token = this.current;
    if (token.kind !== "EOF") this.pos++;
    // The lexer already reported this token; the statement fails without a second diagnostic.
    if (token.kind === "Unknown" || token.malformed) this.failed = true;
    return token;
  }

  private previousEnd(): number {
    return this.pos > 0 ? this.tokens[this.pos - 1]!.end : 0;
  }

  private missing(expected: string): Missing {
    return makeMissing(expected, this.previousEnd());
  }

  // ---------------------------------------------------------------- diagnostics

  private report(input: DiagnosticInput): void {
    this.diagnostics.push(createDiagnostic(this.lines, input));
  }

  /** Reports the first error of the current statement; later errors of the same statement are dropped. */
  private fail(input: DiagnosticInput): void {
    if (!this.failed) this.report(input);
    this.failed = true;
  }

  /** Reports that something was expected at the current token. Silent on tokens the lexer already reported. */
  private failExpected(what: string, hints?: string[]): void {
    const token = this.current;
    if (token.kind === "Unknown" || token.malformed) {
      this.failed = true;
      return;
    }
    this.fail({
      code: "syntax.expected-token",
      message: messages().diagnostics.expectedToken(what, describeToken(token)),
      span: tokenSpan(token),
      hints,
    });
  }

  private failUnexpected(message: string, hints?: string[]): void {
    const token = this.current;
    if (token.kind === "Unknown" || token.malformed) {
      this.failed = true;
      return;
    }
    this.fail({ code: "syntax.unexpected-token", message, span: tokenSpan(token), hints });
  }

  // ---------------------------------------------------------------- recovery

  /** Consumes tokens up to the next statement terminator at the current brace depth. */
  private skipToTerminator(): Token[] {
    const skipped: Token[] = [];
    let depth = 0;
    for (;;) {
      const token = this.current;
      if (token.kind === "EOF") break;
      if (depth === 0 && TERMINATORS.has(token.kind)) break;
      if (token.kind === "LBrace") depth++;
      else if (token.kind === "RBrace") depth--;
      skipped.push(this.advance());
    }
    return skipped;
  }

  /** Consumes tokens until a `{` or a terminator on the current line. */
  private skipToBlockOrTerminator(): Token[] {
    const skipped: Token[] = [];
    while (!this.at("LBrace") && !TERMINATORS.has(this.current.kind)) skipped.push(this.advance());
    return skipped;
  }

  /** Consumes a balanced region after an opener that was already consumed. */
  private skipBalanced(): Token[] {
    const skipped: Token[] = [];
    let depth = 1;
    while (!this.at("EOF")) {
      const kind = this.current.kind;
      if (kind === "LBrace" || kind === "LParen" || kind === "LBracket") depth++;
      if (kind === "RBrace" || kind === "RParen" || kind === "RBracket") {
        depth--;
        if (depth === 0) break;
      }
      skipped.push(this.advance());
    }
    return skipped;
  }

  private errorNode(tokens: CstElement[]): ErrorNode {
    return makeNode<ErrorNode>("Error", tokens, {}, this.previousEnd());
  }

  /** After a statement, anything other than a terminator is an error; skipped tokens join the statement. */
  private finishStatement<T extends Statement | TopLevelItem>(node: T): T {
    if (TERMINATORS.has(this.current.kind)) return node;
    if (!this.failed) {
      const token = this.current;
      const m = messages();
      const hints =
        token.kind === "Identifier" || token.kind === "String"
          ? [m.hints.separateStatements]
          : undefined;
      this.failUnexpected(m.diagnostics.expectedEndOfStatement(describeToken(token)), hints);
    }
    const skipped = this.skipToTerminator();
    if (skipped.length > 0) appendChild(node, this.errorNode(skipped));
    return node;
  }

  // ---------------------------------------------------------------- source file

  parseSourceFile(): SourceFile {
    const children: CstElement[] = [];
    const items: TopLevelItem[] = [];
    let seenItem = false;
    while (!this.at("EOF")) {
      if (this.at("Newline") || this.at("Semicolon")) {
        children.push(this.advance());
        continue;
      }
      this.failed = false;
      const item = this.finishStatement(this.parseTopLevelItem(seenItem));
      seenItem = true;
      children.push(item);
      items.push(item);
    }
    const eof = this.advance();
    children.push(eof);
    return makeNode<SourceFile>("SourceFile", children, { items, eof });
  }

  private parseTopLevelItem(seenItem: boolean): TopLevelItem {
    const token = this.current;
    if (token.kind === "Identifier") {
      switch (token.text) {
        case "language":
          return this.parseHeader(seenItem);
        case "import":
          return this.parseImport();
        case "diagram":
          return this.parseDiagramBlock();
        case "model":
          return this.parseNamedBlock("ModelBlock");
        case "theme":
          return this.parseNamedBlock("ThemeBlock");
        case "story":
          return this.parseTargetedBlock("StoryBlock");
        case "export":
          return this.parseTargetedBlock("ExportBlock");
      }
    }
    if (token.kind === "Unknown" || token.malformed) {
      this.failed = true;
    } else {
      const m = messages();
      const hints = [m.hints.topLevel];
      const next = this.peek(1).kind;
      if (token.kind === "Identifier" && (isArrowKind(next) || next === "LBracket")) {
        hints.unshift(m.hints.insideDiagram);
      }
      this.fail({
        code: "syntax.unexpected-top-level",
        message: m.diagnostics.unexpectedTopLevel(describeToken(token)),
        span: tokenSpan(token),
        hints,
      });
    }
    const first: Token[] = token.kind === "LBrace" ? [] : [this.advance()];
    return this.errorNode(first.concat(this.skipToTerminator()));
  }

  private parseHeader(seenItem: boolean): Header {
    const keyword = this.advance();
    let version: Token | Missing;
    if (this.at("String")) {
      version = this.advance();
    } else {
      this.failExpected(messages().expected.versionString);
      version = this.missing("version string");
    }
    const header = makeNode<Header>("Header", [keyword, version], { keyword, version });
    if (seenItem) {
      const m = messages();
      this.report({
        code: "syntax.header-not-first",
        message: m.diagnostics.headerNotFirst,
        span: { start: header.start, end: header.end },
        hints: [m.hints.headerFirst],
      });
    }
    return header;
  }

  private parseImport(): ImportStatement {
    const keyword = this.advance();
    const children: CstElement[] = [keyword];
    const m = messages();
    const namespaceShape = m.hints.importNamespace;
    const membersShape = m.hints.importMembers;
    const members: ImportMember[] = [];
    let path: Token | Missing;
    let asKeyword: Token | Missing | undefined;
    let namespace: Token | Missing | undefined;
    let fromKeyword: Token | Missing | undefined;

    if (this.at("String")) {
      path = this.advance();
      children.push(path);
      if (this.atKeyword("as")) {
        asKeyword = this.advance();
        children.push(asKeyword);
        namespace = this.expectIdentifier((e) => e.namespaceAfterAs, [namespaceShape]);
        children.push(namespace);
      } else {
        this.failExpected(m.expected.asAndNamespace, [namespaceShape]);
        asKeyword = this.missing("as");
        children.push(asKeyword);
      }
      return makeNode<ImportStatement>("ImportStatement", children, {
        keyword,
        form: "namespace",
        path,
        asKeyword,
        namespace,
        members,
        fromKeyword,
      });
    }

    const startsMembers =
      this.at("Identifier") && !(this.atKeyword("from") && this.peek(1).kind === "String");
    if (startsMembers) {
      for (;;) {
        const id = this.advance();
        const memberChildren: CstElement[] = [id];
        let memberAs: Token | undefined;
        let alias: Token | Missing | undefined;
        if (this.atKeyword("as")) {
          memberAs = this.advance();
          memberChildren.push(memberAs);
          alias = this.expectIdentifier((e) => e.aliasAfterAs, [membersShape]);
          memberChildren.push(alias);
        }
        const member = makeNode<ImportMember>("ImportMember", memberChildren, {
          id,
          asKeyword: memberAs,
          alias,
        });
        members.push(member);
        children.push(member);
        if (this.failed || !this.at("Comma")) break;
        children.push(this.advance());
        if (!this.at("Identifier")) {
          this.failExpected(m.expected.idAfterComma, [membersShape]);
          break;
        }
      }
    } else {
      this.failExpected(m.expected.pathOrIds, [namespaceShape, membersShape]);
    }

    if (!this.failed && this.atKeyword("from")) {
      fromKeyword = this.advance();
      children.push(fromKeyword);
      if (this.at("String")) {
        path = this.advance();
      } else {
        this.failExpected(m.expected.pathAfterFrom, [membersShape]);
        path = this.missing("path");
      }
      children.push(path);
    } else {
      if (!this.failed) this.failExpected(m.expected.fromAndPath, [membersShape]);
      fromKeyword = this.missing("from");
      path = this.missing("path");
      children.push(fromKeyword, path);
    }
    return makeNode<ImportStatement>("ImportStatement", children, {
      keyword,
      form: "members",
      path,
      asKeyword,
      namespace,
      members,
      fromKeyword,
    });
  }

  /**
   * Takes an identifier, or reports what was expected. The `Missing` node of the tree keeps the
   * English description, so the tree does not depend on the interface language.
   */
  private expectIdentifier(what: Expected, hints?: string[]): Token | Missing {
    if (this.at("Identifier")) return this.advance();
    this.failExpected(what(messages().expected), hints);
    return this.missing(what(messages("en").expected));
  }

  private expectToken(kind: TokenKind, what: Expected, hints?: string[]): Token | Missing {
    if (this.at(kind)) return this.advance();
    this.failExpected(what(messages().expected), hints);
    return this.missing(what(messages("en").expected));
  }

  /**
   * Parses the body block of a top-level construct (`diagram`, `model`, `theme`, `story` or
   * `export`), recovering from header errors first.
   */
  private parseBodyBlock(children: CstElement[], owner: string): Block | Missing {
    if (this.failed) {
      const skipped = this.skipToBlockOrTerminator();
      if (skipped.length > 0) children.push(this.errorNode(skipped));
    }
    let block: Block | Missing;
    if (this.at("LBrace")) {
      block = this.parseBlock();
    } else {
      this.failExpected(messages().expected.openBody(owner));
      block = this.missing("{");
    }
    children.push(block);
    return block;
  }

  private parseDiagramBlock(): DiagramBlock {
    const keyword = this.advance();
    const children: CstElement[] = [keyword];
    const shape = [messages().hints.diagramShape];
    const id = this.expectIdentifier((e) => e.diagramId, shape);
    children.push(id);
    let colon: Token | Missing | undefined;
    let type: Token | Missing | undefined;
    let usingKeyword: Token | undefined;
    let usingRef: QualifiedRef | Missing | undefined;
    if (!this.failed) {
      colon = this.expectToken("Colon", (e) => e.colonAfterId, shape);
      children.push(colon);
    }
    if (!this.failed) {
      type = this.expectIdentifier((e) => e.diagramType);
      children.push(type);
    }
    if (!this.failed && this.atKeyword("using")) {
      usingKeyword = this.advance();
      children.push(usingKeyword);
      if (this.at("Identifier")) {
        usingRef = this.parseRef();
      } else {
        this.failExpected(messages().expected.modelReference);
        usingRef = this.missing("model reference");
      }
      children.push(usingRef);
    }
    const block = this.parseBodyBlock(children, "diagram");
    return makeNode<DiagramBlock>("DiagramBlock", children, {
      keyword,
      id,
      colon,
      type,
      usingKeyword,
      usingRef,
      block,
    });
  }

  private parseNamedBlock(kind: "ModelBlock" | "ThemeBlock"): ModelBlock | ThemeBlock {
    const keyword = this.advance();
    const children: CstElement[] = [keyword];
    const id = this.expectIdentifier((e) => e.idAfter(keyword.text));
    children.push(id);
    const block = this.parseBodyBlock(children, keyword.text);
    return makeNode<ModelBlock | ThemeBlock>(kind, children, { keyword, id, block });
  }

  private parseTargetedBlock(kind: "StoryBlock" | "ExportBlock"): StoryBlock | ExportBlock {
    const keyword = this.advance();
    const children: CstElement[] = [keyword];
    const id = this.expectIdentifier((e) => e.idAfter(keyword.text));
    children.push(id);
    let forKeyword: Token | Missing | undefined;
    let target: QualifiedRef | Missing | undefined;
    if (!this.failed) {
      if (this.atKeyword("for")) {
        forKeyword = this.advance();
      } else {
        const m = messages();
        this.failExpected(m.expected.forAndTarget, [m.hints.targetedShape(keyword.text)]);
        forKeyword = this.missing("for");
      }
      children.push(forKeyword);
    }
    if (!this.failed) {
      if (this.at("Identifier")) {
        target = this.parseRef();
      } else {
        this.failExpected(messages().expected.targetAfterFor);
        target = this.missing("target");
      }
      children.push(target);
    }
    const block = this.parseBodyBlock(children, keyword.text);
    return makeNode<StoryBlock | ExportBlock>(kind, children, {
      keyword,
      id,
      forKeyword,
      target,
      block,
    });
  }

  // ---------------------------------------------------------------- blocks and statements

  private parseBlock(): Block {
    const open = this.advance();
    const children: CstElement[] = [open];
    const statements: Statement[] = [];
    const outerFailed = this.failed;
    let close: Token | Missing;

    if (this.depth >= MAX_NESTING_DEPTH) {
      this.reportTooDeep(open);
      const skipped = this.skipBalanced();
      if (skipped.length > 0) children.push(this.errorNode(skipped));
      close = this.at("RBrace") ? this.advance() : this.missing("}");
      children.push(close);
      this.failed = true;
      return makeNode<Block>("Block", children, { open, statements, close });
    }

    this.depth++;
    for (;;) {
      const token = this.current;
      if (token.kind === "RBrace") {
        close = this.advance();
        break;
      }
      if (token.kind === "EOF") {
        if (!this.reportedMissingBraceAtEof) {
          this.reportedMissingBraceAtEof = true;
          const opened = this.lines.location(open.start);
          const m = messages();
          this.report({
            code: "syntax.expected-token",
            message: m.diagnostics.unclosedBlock(opened.line),
            span: { start: token.start, end: token.start },
            related: [{ message: m.related.blockOpened, span: tokenSpan(open) }],
          });
        }
        close = this.missing("}");
        break;
      }
      if (token.kind === "Newline" || token.kind === "Semicolon") {
        children.push(this.advance());
        continue;
      }
      this.failed = false;
      const statement = this.finishStatement(this.parseStatement());
      children.push(statement);
      statements.push(statement);
    }
    children.push(close);
    this.depth--;
    this.failed = outerFailed;
    return makeNode<Block>("Block", children, { open, statements, close });
  }

  private reportTooDeep(opener: Token): void {
    this.fail({
      code: "syntax.nesting-too-deep",
      message: messages().diagnostics.nestingTooDeep(MAX_NESTING_DEPTH),
      span: tokenSpan(opener),
    });
  }

  private parseStatement(): Statement {
    const token = this.current;
    if (token.kind === "Identifier") {
      if (this.peek(1).kind === "LBracket") return this.parseShorthand();
      const ref = this.parseRef();
      if (isArrowKind(this.current.kind)) return this.parseRelation(ref);
      if (ref.parts.length > 1 || this.failed) {
        this.failExpected(messages().expected.arrowAfter(ref.text));
        return this.errorNode([ref, ...this.skipToTerminator()]);
      }
      return this.parseKeywordStatement(ref.parts[0]!);
    }
    if (token.kind === "Unknown" || token.malformed) {
      this.failed = true;
    } else {
      const m = messages();
      const hints =
        token.kind === "String"
          ? [m.hints.labelledElement]
          : token.kind === "LBrace"
            ? [m.hints.blockAfterWord]
            : undefined;
      this.fail({
        code: "syntax.unexpected-token",
        message: m.diagnostics.unexpectedAtStatementStart(describeToken(token)),
        span: tokenSpan(token),
        hints,
      });
    }
    return this.errorNode(this.skipToTerminator());
  }

  private parseRef(): QualifiedRef {
    const first = this.advance();
    const parts = [first];
    const children: CstElement[] = [first];
    while (this.at("Dot")) {
      if (this.peek(1).kind === "Identifier") {
        children.push(this.advance());
        const part = this.advance();
        parts.push(part);
        children.push(part);
      } else {
        children.push(this.advance());
        this.failExpected(messages().expected.identifierAfterDot);
        children.push(this.missing("identifier"));
        break;
      }
    }
    return makeNode<QualifiedRef>("QualifiedRef", children, {
      parts,
      text: parts.map((p) => p.text).join("."),
    });
  }

  private parseRelation(source: QualifiedRef): RelationStatement {
    const arrow = this.advance();
    const children: CstElement[] = [source, arrow];
    let target: QualifiedRef | Missing;
    let colon: Token | undefined;
    let label: Token | Missing | undefined;
    let asKeyword: Token | undefined;
    let id: Token | Missing | undefined;
    let block: Block | undefined;

    if (this.at("Identifier")) {
      target = this.parseRef();
    } else {
      this.failExpected(messages().expected.relationTarget(arrow.text));
      target = this.missing("relation target");
    }
    children.push(target);
    if (!this.failed && this.at("Colon")) {
      colon = this.advance();
      children.push(colon);
      if (this.at("String")) {
        label = this.advance();
      } else {
        const m = messages();
        this.failExpected(m.expected.labelAfterColon, [m.hints.quotedRelationLabel]);
        label = this.missing("label");
      }
      children.push(label);
    }
    if (!this.failed && this.atKeyword("as")) {
      asKeyword = this.advance();
      children.push(asKeyword);
      id = this.expectIdentifier((e) => e.relationId);
      children.push(id);
    }
    if (!this.failed && isArrowKind(this.current.kind)) {
      this.failUnexpected(messages().diagnostics.chainedRelations);
    }
    if (!this.failed && this.at("LBrace")) {
      block = this.parseBlock();
      children.push(block);
    }
    if (this.failed) {
      const skipped = this.skipToTerminator();
      if (skipped.length > 0) children.push(this.errorNode(skipped));
    }
    return makeNode<RelationStatement>("RelationStatement", children, {
      source,
      arrow,
      target,
      colon,
      label,
      asKeyword,
      id,
      block,
    });
  }

  private parseShorthand(): ShorthandDeclaration {
    const id = this.advance();
    const open = this.advance();
    const children: CstElement[] = [id, open];
    let shape: "box" | "data" = "box";
    let label: Token | Missing;
    let block: Block | undefined;
    if (this.at("LParen")) {
      children.push(this.advance());
      shape = "data";
    }
    if (this.at("String")) {
      label = this.advance();
    } else {
      const m = messages();
      this.failExpected(m.expected.labelString, [m.hints.quotedShorthandLabel]);
      label = this.missing("label");
    }
    children.push(label);
    if (shape === "data" && !this.failed) children.push(this.expectToken("RParen", () => "`)`"));
    if (!this.failed) children.push(this.expectToken("RBracket", () => "`]`"));
    if (!this.failed && this.at("LBrace")) {
      block = this.parseBlock();
      children.push(block);
    }
    if (this.failed) {
      const skipped = this.skipToTerminator();
      if (skipped.length > 0) children.push(this.errorNode(skipped));
    }
    return makeNode<ShorthandDeclaration>("ShorthandDeclaration", children, {
      id,
      shape,
      label,
      block,
    });
  }

  private parseKeywordStatement(keyword: Token): KeywordStatement {
    const clauseChildren: CstElement[] = [keyword];
    const args = this.parseArgs(clauseChildren);
    let block: Block | undefined;
    if (!this.failed && this.at("LBrace")) {
      block = this.parseBlock();
      clauseChildren.push(block);
    }

    let chain: BlockChain | undefined;
    let children = clauseChildren;
    if (block && !this.failed && this.at("Identifier")) {
      const clauses: ChainClause[] = [
        makeNode<ChainClause>("ChainClause", clauseChildren, { keyword, args, block }),
      ];
      while (!this.failed && this.at("Identifier")) {
        const word = this.advance();
        const cc: CstElement[] = [word];
        const clauseArgs = this.parseArgs(cc);
        let clauseBlock: Block | Missing;
        if (!this.failed && this.at("LBrace")) {
          clauseBlock = this.parseBlock();
        } else {
          this.failExpected(messages().expected.blockAfter(word.text));
          clauseBlock = this.missing("{");
        }
        cc.push(clauseBlock);
        clauses.push(
          makeNode<ChainClause>("ChainClause", cc, {
            keyword: word,
            args: clauseArgs,
            block: clauseBlock,
          }),
        );
      }
      chain = makeNode<BlockChain>("BlockChain", clauses, { clauses });
      children = [chain];
    }
    if (this.failed) {
      const skipped = this.skipToTerminator();
      if (skipped.length > 0) children.push(this.errorNode(skipped));
    }
    return makeNode<KeywordStatement>("KeywordStatement", children, {
      keyword,
      args,
      block,
      chain,
    });
  }

  // ---------------------------------------------------------------- arguments

  private parseArgs(children: CstElement[]): Arg[] {
    const args: Arg[] = [];
    while (!this.failed) {
      if (this.at("Comma")) {
        children.push(this.advance());
        continue;
      }
      const arg = this.parseArg();
      if (!arg) break;
      children.push(arg);
      args.push(arg);
    }
    return args;
  }

  private parseArg(): Arg | undefined {
    const token = this.current;
    switch (token.kind) {
      case "Identifier":
        return this.parseRef();
      case "String": {
        this.advance();
        return makeNode<StringLiteral>("StringLiteral", [token], {
          token,
          value: String(token.value ?? ""),
        });
      }
      case "Number": {
        this.advance();
        return makeNode<NumberLiteral>("NumberLiteral", [token], {
          token,
          value: Number(token.value),
          unit: token.unit ?? null,
        });
      }
      case "LParen":
        return this.parseSequence("Tuple");
      case "LBracket":
        return this.parseSequence("List");
      default:
        return undefined;
    }
  }

  /**
   * Parses `( ... )` or `[ ... ]`. Line breaks continue the sequence when the line ends with the
   * opener or a comma, or when the next line starts with a comma or the closer.
   */
  private parseSequence(kind: "Tuple" | "List"): Tuple | List {
    const open = this.advance();
    const closeKind: TokenKind = kind === "Tuple" ? "RParen" : "RBracket";
    const closeText = kind === "Tuple" ? ")" : "]";
    const children: CstElement[] = [open];
    const items: Arg[] = [];
    let close: Token | Missing;

    if (this.depth >= MAX_NESTING_DEPTH) {
      this.reportTooDeep(open);
      const skipped = this.skipBalanced();
      if (skipped.length > 0) children.push(this.errorNode(skipped));
      close = this.at(closeKind) ? this.advance() : this.missing(closeText);
      children.push(close);
      return makeNode<Tuple | List>(kind, children, { open, items, close });
    }

    this.depth++;
    let previous: "open" | "comma" | "item" = "open";
    for (;;) {
      const token = this.current;
      if (token.kind === closeKind) {
        close = this.advance();
        break;
      }
      if (token.kind === "Newline") {
        let j = this.pos;
        while (this.tokens[j]!.kind === "Newline") j++;
        const next = this.tokens[j]!.kind;
        if (previous !== "item" || next === closeKind || next === "Comma") {
          while (this.at("Newline")) children.push(this.advance());
          continue;
        }
        this.failExpected(`\`${closeText}\``);
        close = this.missing(closeText);
        break;
      }
      if (token.kind === "Comma") {
        children.push(this.advance());
        previous = "comma";
        continue;
      }
      const item = this.failed ? undefined : this.parseArg();
      if (!item) {
        this.failExpected(`\`${closeText}\``);
        close = this.missing(closeText);
        break;
      }
      children.push(item);
      items.push(item);
      previous = "item";
    }
    children.push(close);
    this.depth--;
    return makeNode<Tuple | List>(kind, children, { open, items, close });
  }
}

function tokenSpan(token: Token): Span {
  return token.kind === "Newline" || token.kind === "EOF"
    ? { start: token.start, end: token.start }
    : { start: token.start, end: token.end };
}
