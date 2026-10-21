/** Code inside a sentence: `text`. */
const code = (text: string) => `\`${text}\``;

/**
 * The words of the lexer, the parser and the formatter: the messages of `syntax.*` and
 * `format.*` diagnostics, their hints and related notes. Code in them (keywords, punctuation,
 * samples) stays as written in every language.
 */
export const en = {
  /** Messages of diagnostics, by what they report. */
  diagnostics: {
    /** `syntax.bom`. */
    bom: "The file starts with a byte order mark; it is kept as is.",
    /** `syntax.unterminated-comment`. */
    unterminatedComment: "Block comment is not closed with `*/` before the end of the file.",
    /** `syntax.mixed-line-endings`: `LF` or `CRLF`. */
    mixedLineEndings: (line: string, first: string) =>
      `This line ends with ${line} but the file started with ${first}.`,
    /** `syntax.invalid-escape`: the escape as written, such as `\q`. */
    invalidEscape: (escape: string) => `Unknown escape sequence ${code(escape)} in string.`,
    /** `syntax.unterminated-string`. */
    unterminatedString: 'String is not closed with `"` before the end of the line.',
    /** `syntax.unexpected-character`: one character. */
    unexpectedCharacter: (chars: string) => `Unexpected character ${code(chars)}.`,
    /** `syntax.unexpected-character`: a run of characters, already shortened. */
    unexpectedCharacters: (chars: string) => `Unexpected characters ${code(chars)}.`,
    /** `syntax.expected-token`: what was expected (see `expected`) and the token found. */
    expectedToken: (what: string, found: string) => `Expected ${what} but found ${found}.`,
    /** `syntax.expected-token` at the end of the file, for a block left open. */
    unclosedBlock: (line: number) =>
      `Expected \`}\` to close the block opened on line ${line} but found end of file.`,
    /** `syntax.unexpected-token` after a complete statement. */
    expectedEndOfStatement: (found: string) =>
      `Unexpected ${found}; expected the end of the statement.`,
    /** `syntax.unexpected-token` where a statement starts. */
    unexpectedAtStatementStart: (found: string) =>
      `Unexpected ${found} at the start of a statement.`,
    /** `syntax.unexpected-token`: `a -> b -> c`. */
    chainedRelations: "Chained relations are not supported; write one relation per statement.",
    /** `syntax.unexpected-top-level`. */
    unexpectedTopLevel: (found: string) => `Unexpected ${found} at the top level of the file.`,
    /** `syntax.header-not-first`. */
    headerNotFirst: "The `language` header must be the first statement of the file.",
    /** `syntax.nesting-too-deep`. */
    nestingTooDeep: (depth: number) =>
      `Blocks, tuples and lists are nested more than ${depth} levels deep.`,
    /** `format.invalid-option`: the indentation as JSON. */
    invalidIndent: (written: string) =>
      `Indentation must be 1 to 8 spaces or "tab", not ${written}.`,
  },

  /** What the parser expected, completing `diagnostics.expectedToken`. */
  expected: {
    versionString: 'a version string such as `"0.2"` after `language`',
    namespaceAfterAs: "a namespace after `as`",
    asAndNamespace: "`as` and a namespace after the path",
    aliasAfterAs: "an alias after `as`",
    idAfterComma: "an id to import after `,`",
    pathOrIds: "a path string or the ids to import after `import`",
    pathAfterFrom: "a path string after `from`",
    fromAndPath: "`from` and a path after the imported ids",
    /** The body of a top-level block: `diagram`, `model`, `theme`, `story` or `export`. */
    openBody: (block: string) => `\`{\` to open the ${block} body`,
    diagramId: "a diagram id after `diagram`",
    colonAfterId: "`:` after the diagram id",
    diagramType: "a diagram type (`flow`, `sequence`, `c4` or `free`)",
    modelReference: "a model reference after `using`",
    /** After `model`, `theme`, `story` or `export`. */
    idAfter: (keyword: string) => `an id after ${code(keyword)}`,
    forAndTarget: "`for` followed by the target",
    targetAfterFor: "a target after `for`",
    /** After the reference that starts a statement. */
    arrowAfter: (ref: string) =>
      `an arrow (\`->\`, \`-->\`, \`<->\` or \`<-->\`) after ${code(ref)}`,
    identifierAfterDot: "an identifier after `.`",
    relationTarget: (arrow: string) => `a relation target after ${code(arrow)}`,
    labelAfterColon: "a label string after `:`",
    relationId: "a relation id after `as`",
    labelString: "a label string",
    /** `{` after a chained clause such as `else`. */
    blockAfter: (word: string) => `\`{\` after ${code(word)}`,
  },

  /** How diagnostics name the token they found. */
  tokens: {
    endOfLine: "end of line",
    endOfFile: "end of file",
    /** A string as written, shortened. */
    string: (text: string) => `string ${text}`,
  },

  /** Hints of diagnostics. */
  hints: {
    bom: "UTF-8 without a byte order mark is the canonical encoding.",
    lineEndings: "Use one line ending style per file; edits follow the first one.",
    escapes: 'Supported escapes are \\", \\\\, \\n and \\t.',
    multilineString: "Strings cannot span lines; use \\n for a line break inside a label.",
    arrows: "The supported arrows are `->`, `-->`, `<->` and `<-->`.",
    identifiers: "Identifiers use ASCII letters, digits and `_`; put other text in a quoted label.",
    minus: "A minus sign must be followed by a digit or `>`.",
    separateStatements: "Separate statements with a line break or `;`.",
    topLevel:
      "Top-level statements are `language`, `import`, `model`, `diagram`, `story`, `export` and `theme`.",
    insideDiagram: "Elements and relations belong inside a `diagram <id>: flow { ... }` block.",
    headerFirst: "Move it above every `import` and every block.",
    importNamespace: 'Write `import "<path>" as <namespace>`.',
    importMembers: 'Write `import <id>, <id> as <alias> from "<path>"`.',
    diagramShape:
      "Write `diagram <id>: <type> { ... }`, for example `diagram checkout: flow { ... }`.",
    /** `story` or `export`. */
    targetedShape: (keyword: string) => `Write \`${keyword} <id> for <target> { ... }\`.`,
    labelledElement: 'Declare a labelled element with `id["Label"]`.',
    blockAfterWord: "A block must follow a statement word, for example `placement { ... }`.",
    quotedRelationLabel: 'Labels are quoted: `a -> b: "Label"`.',
    quotedShorthandLabel: 'Labels are quoted: `id["Label"]` or `id[("Label")]`.',
  },

  /** Notes of related ranges. */
  related: {
    blockOpened: "Block opened here.",
  },
};
