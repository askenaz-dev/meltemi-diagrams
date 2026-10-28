import {
  type Arg,
  type Block,
  type DiagnosticBag,
  type DiagramBlock,
  type KeywordStatement,
  type LineIndex,
  type Missing,
  type RelationStatement,
  type Statement,
  type Token,
} from "@meltemi/diagrams-language";
import { FlowAnalyzer, type Classified, type Mutable } from "./flow.js";
import { messages } from "./messages/index.js";
import {
  FRAGMENT_BRANCH_KEYWORDS,
  FRAGMENT_OPERATORS,
  PARTICIPANT_KINDS,
  SEQUENCE_PROFILE,
} from "./schema.js";
import { describeArg, headerHasError, singleIdent } from "./style-values.js";
import type {
  EventPlace,
  FlowDiagram,
  FragmentBranch,
  FragmentEvent,
  FragmentOperator,
  Relation,
  ScenarioChoice,
  SequenceEvent,
} from "./types.js";

const EVENT_KEYWORDS: ReadonlySet<string> = new Set(SEQUENCE_PROFILE.events);
const OPERATORS: ReadonlySet<string> = new Set(FRAGMENT_OPERATORS);
const PARTICIPANTS: ReadonlySet<string> = new Set(PARTICIPANT_KINDS);
const NOTE_POSITIONS = ["over", "left", "right"] as const;

/** Analyzes one `diagram <id>: sequence { }` block. */
export function analyzeSequenceDiagram(
  node: DiagramBlock,
  id: Token,
  lines: LineIndex,
  bag: DiagnosticBag,
): { diagram: FlowDiagram; errors: number } {
  const analyzer = new SequenceAnalyzer(node, id, lines, bag, SEQUENCE_PROFILE);
  return { diagram: analyzer.run(), errors: analyzer.errors };
}

interface Lifeline {
  depth: number;
  /** The levels of `depth` that calls' blocks opened: no `deactivate` ends them. */
  implicit: number;
  appeared: boolean;
  created: boolean;
  destroyed: boolean;
}

type LifeState = Map<string, Lifeline>;

function cloneState(state: LifeState): LifeState {
  return new Map([...state].map(([id, line]) => [id, { ...line }]));
}

/** Clauses of a keyword statement: the head and its chained clauses. */
function clausesOf(stmt: KeywordStatement): {
  keyword: Token;
  args: readonly Arg[];
  block: Block | Missing | undefined;
  node: { start: number; end: number };
}[] {
  if (!stmt.chain)
    return [{ keyword: stmt.keyword, args: stmt.args, block: stmt.block, node: stmt }];
  return stmt.chain.clauses.map((clause) => ({
    keyword: clause.keyword,
    args: clause.args,
    block: clause.block,
    node: clause,
  }));
}

const blockOf = (block: Block | Missing | undefined): Block | undefined =>
  block && block.kind === "Block" ? block : undefined;

/** A statement of the event order: a message, `return` or another event keyword. */
const isEventStatement = (stmt: Statement): boolean =>
  stmt.kind === "RelationStatement" ||
  (stmt.kind === "KeywordStatement" && EVENT_KEYWORDS.has(stmt.keyword.text));

/** The events a call's block holds; its other statements are the message's properties. */
const callEvents = (block: Block | Missing | undefined): Statement[] =>
  (blockOf(block)?.statements ?? []).filter(
    (stmt) => stmt.kind !== "Error" && !headerHasError(stmt) && isEventStatement(stmt),
  );

/** The call an event stands inside: the last `{ message }` place of its path, or undefined. */
const enclosingCall = (path: readonly EventPlace[]): string | undefined => {
  for (let i = path.length - 1; i >= 0; i--) {
    const place = path[i]!;
    if ("message" in place) return place.message;
  }
  return undefined;
};

/** Declarations of flow and free diagrams, which sequence diagrams do not have. */
const OTHER_DECLARATIONS: readonly string[] = [
  "node",
  "decision",
  "data",
  "note",
  "tag",
  "box",
  "text",
  "icon",
  "image",
];

/** The statements of sequence diagrams besides participants, as their hint lists them. */
const SEQUENCE_STATEMENTS: readonly string[] = [
  "group",
  "activate",
  "deactivate",
  "create",
  "destroy",
  "note",
  "alt",
  "opt",
  "loop",
  "par",
  "break",
  "critical",
  "region",
  "divider",
  "delay",
  "title",
  "description",
  "theme",
  "preset",
  "canvas",
  "autonumber",
  "placement",
  "style",
  "animate",
  "class",
  "rule",
  "scenario",
];

class SequenceAnalyzer extends FlowAnalyzer {
  private readonly relationOf = new Map<Statement, Relation>();
  /** Each `return` and the call statement whose block holds it. */
  private readonly returnCalls = new Map<KeywordStatement, RelationStatement>();
  /** The relation of each call statement, as it is built. */
  private readonly callRelations = new Map<RelationStatement, Relation>();
  private readonly counters = new Map<string, number>();
  /** Ids written on notes and fragments, with their tokens. */
  private readonly eventIds = new Map<string, Token>();

  // ---------------------------------------------------------------- classification

  protected override classifyEvent(
    stmt: Statement,
    context: "diagram" | "group",
    out: Classified,
  ): boolean {
    const event =
      stmt.kind === "RelationStatement" ||
      (stmt.kind === "KeywordStatement" && EVENT_KEYWORDS.has(stmt.keyword.text));
    if (context === "group") {
      if (!event) return false;
      this.error(
        "prop.unknown",
        messages().diagnostics.sequence.groupHoldsParticipants,
        stmt.kind === "KeywordStatement" ? stmt.keyword : stmt,
      );
      return true;
    }
    if (!event) return false;
    out.events.push(stmt);
    this.collectRelations(stmt, out);
    return true;
  }

  /**
   * Relations at any depth of fragments and of calls' blocks, in source order, so that they are
   * built and numbered with the others; a `return` in a call's block is a relation too, answering
   * the innermost call around it.
   */
  private collectRelations(stmt: Statement, out: Classified, call?: RelationStatement): void {
    if (stmt.kind === "RelationStatement") {
      out.relations.push({ stmt, groupPath: [] });
      for (const inner of callEvents(stmt.block)) this.collectRelations(inner, out, stmt);
      return;
    }
    if (stmt.kind !== "KeywordStatement") return;
    if (stmt.keyword.text === "return") {
      if (!call) return; // `sequence.return`, reported with the events
      this.returnCalls.set(stmt, call);
      // Built by `relation`, which tells a `return` from a relation statement.
      out.relations.push({ stmt: stmt as unknown as RelationStatement, groupPath: [] });
      return;
    }
    if (!OPERATORS.has(stmt.keyword.text)) return;
    for (const clause of clausesOf(stmt)) {
      for (const inner of blockOf(clause.block)?.statements ?? []) {
        if (inner.kind === "Error" || headerHasError(inner)) continue;
        this.collectRelations(inner, out, call);
      }
    }
  }

  /**
   * A message's relation: its block's properties alone, the events of a call's block being built
   * as events; a `return` is a reply from the call's receiver to its caller.
   */
  protected override relation(
    stmt: RelationStatement | KeywordStatement,
    groupPath: string[],
  ): void {
    if (stmt.kind === "KeywordStatement") {
      this.returnRelation(stmt);
      return;
    }
    const before = this.relations.length;
    const block = blockOf(stmt.block);
    if (block && block.statements.some(isEventStatement)) {
      const properties = {
        ...block,
        statements: block.statements.filter((s) => !isEventStatement(s)),
      };
      super.relation({ ...stmt, block: properties }, groupPath);
    } else {
      super.relation(stmt, groupPath);
    }
    const made =
      this.relations.length > before ? this.relations[this.relations.length - 1] : undefined;
    if (!made) return;
    made.node = stmt;
    this.callRelations.set(stmt, made);
  }

  /** `return ["Label"] [as <id>] [{ properties }]`: the reply of the call around it. */
  private returnRelation(stmt: KeywordStatement): void {
    const callStmt = this.returnCalls.get(stmt);
    const call = callStmt ? this.callRelations.get(callStmt) : undefined;
    // A call that did not resolve has no reply to draw; its own error says why.
    if (!call) return;
    const form = '`return ["Label"] [as <id>] [{ ... }]`';
    let [first, ...rest] = stmt.args;
    let label: string | null = null;
    if (first?.kind === "StringLiteral") {
      label = String(first.value ?? "");
      [first, ...rest] = rest;
    }
    let idToken: Token | undefined;
    if (first !== undefined) {
      const as = singleIdent(first);
      idToken = rest.length === 1 ? singleIdent(rest[0]) : undefined;
      if (as?.text !== "as" || !idToken || rest.length !== 1) {
        this.invalid(messages().diagnostics.common.expected(form), first);
        return;
      }
    }
    let id: string | null = null;
    if (idToken) {
      const element = this.elementsById.get(idToken.text);
      const firstRelation = this.relationIdTokens.get(idToken.text);
      if (element) {
        const m = messages();
        this.error(
          "ref.duplicate-id",
          m.diagnostics.flow.relationIdUsedByElement(idToken.text),
          idToken,
          {
            related: [{ message: m.related.elementDeclared, at: element.idToken }],
            hints: [m.hints.flow.sharedNamespace],
          },
        );
      } else if (firstRelation && firstRelation !== idToken) {
        const m = messages();
        this.error("ref.duplicate-id", m.diagnostics.flow.relationIdUsed(idToken.text), idToken, {
          related: [{ message: m.related.firstUsed, at: firstRelation }],
        });
      } else {
        id = idToken.text;
        this.relationIdTokens.set(id, idToken);
      }
    }
    const { description, classes, layer, layerRange, values } = this.elementBlock(
      blockOf(stmt.block),
      this.profile.relationProperties,
      "Relation",
      undefined,
    );
    const relation: Mutable<Relation> = {
      key: "",
      id,
      from: call.to,
      to: call.from,
      line: "dashed",
      heads: "end",
      twoWay: false,
      async: false,
      // Set once the call has its key.
      returns: null,
      technology: null,
      sources: [],
      derived: false,
      label,
      description,
      assumption: typeof values.assumption === "string" ? values.assumption : null,
      data: {},
      classes,
      layer,
      layerRange,
      groupPath: [],
      range: this.range(stmt),
      idRange: id !== null && idToken ? this.range(idToken) : null,
      node: stmt,
    };
    this.relations.push(relation);
    if (id !== null && idToken) this.reference(idToken, id, "relation", "relation-id", stmt);
  }

  protected override statementCandidates(keyword: string): readonly string[] {
    return OTHER_DECLARATIONS.includes(keyword)
      ? [...PARTICIPANT_KINDS, "group"]
      : [...PARTICIPANT_KINDS, ...SEQUENCE_STATEMENTS];
  }

  protected override statementHints(keyword: string): string[] {
    const hints = messages().hints.sequence;
    if (OTHER_DECLARATIONS.includes(keyword)) {
      const profile = ["box", "text", "icon", "image"].includes(keyword) ? "free" : "flow";
      return [hints.otherDeclaration(keyword, profile, PARTICIPANT_KINDS)];
    }
    return [hints.statements];
  }

  // ---------------------------------------------------------------- events

  protected override afterRelations(classified: Classified): void {
    // A `return` names the call it answers, now that the call has its key.
    for (const relation of this.relations) {
      if (relation.node.kind !== "KeywordStatement") continue;
      const callStmt = this.returnCalls.get(relation.node);
      const call = callStmt ? this.callRelations.get(callStmt) : undefined;
      if (call) relation.returns = call.key;
    }
    for (const relation of this.relations) {
      this.relationOf.set(relation.node, relation);
      for (const end of new Set([relation.from, relation.to])) {
        const element = this.elementsById.get(end);
        if (element?.kind === "group") {
          this.error(
            "ref.unknown-element",
            messages().diagnostics.sequence.groupEnd(end),
            relation.node,
            { data: { ids: [end] } },
          );
        }
      }
    }
    this.events = this.buildEvents(classified.events, []);
    this.checkOrder(this.events, new Map());
  }

  private nextKey(kind: string): string {
    const n = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, n);
    return `${kind}#${n}`;
  }

  /** Claims the id of a note or fragment in the diagram's namespace. */
  private claim(token: Token, stmt: Statement): boolean {
    const name = token.text;
    const element = this.elementsById.get(name);
    const relation = this.relationsByKey.get(name);
    const first = this.eventIds.get(name);
    if (element || (relation && relation.id === name) || first) {
      const m = messages();
      this.error("ref.duplicate-id", m.diagnostics.sequence.idUsed(name), token, {
        related: [
          {
            message: m.related.firstUsed,
            at: element?.idToken ?? first ?? (relation!.node as Statement),
          },
        ],
        hints: [m.hints.sequence.sharedNamespace],
      });
      return false;
    }
    this.eventIds.set(name, token);
    this.reference(token, name, "event", "declaration", stmt);
    return true;
  }

  private register(event: SequenceEvent): SequenceEvent {
    if (!this.eventsByKey.has(event.key)) this.eventsByKey.set(event.key, event);
    return event;
  }

  /** A participant named by an event, or undefined after reporting it. */
  private participant(
    token: Token,
    stmt: Statement,
    role: "event" | "gap" = "event",
  ): string | undefined {
    const element = this.elementsById.get(token.text);
    if (!element) {
      const m = messages();
      this.error(
        "ref.unknown-element",
        m.diagnostics.sequence.unknownParticipant(token.text),
        token,
        {
          hints: [m.hints.sequence.declareParticipant(token.text)],
          data: { ids: [token.text] },
        },
      );
      return undefined;
    }
    if (element.kind === "group") {
      this.error(
        "ref.unknown-element",
        messages().diagnostics.sequence.participantGroup(token.text),
        token,
        { data: { ids: [token.text] } },
      );
      return undefined;
    }
    this.reference(token, token.text, "element", role, stmt);
    return token.text;
  }

  private buildEvents(statements: readonly Statement[], path: EventPlace[]): SequenceEvent[] {
    const events: SequenceEvent[] = [];
    // A `return` ends its statement list: what follows it in the same list is reported.
    let returned = false;
    const afterReturn = (stmt: Statement) => {
      if (!returned) return;
      const m = messages();
      this.error(
        "sequence.return",
        m.diagnostics.sequence.afterReturn(enclosingCall(path) ?? ""),
        stmt.kind === "KeywordStatement" ? stmt.keyword : stmt,
      );
    };
    for (const stmt of statements) {
      if (stmt.kind === "Error" || headerHasError(stmt)) continue;
      if (stmt.kind === "RelationStatement") {
        const relation = this.relationOf.get(stmt);
        if (!relation) continue;
        afterReturn(stmt);
        // The call's block: its events, inside the call.
        const inner = callEvents(stmt.block);
        const nested =
          inner.length > 0 ? this.buildEvents(inner, [...path, { message: relation.key }]) : [];
        events.push(
          this.register({
            kind: "message",
            key: relation.key,
            id: relation.id,
            idRange: relation.idRange,
            relation: relation.key,
            events: nested,
            path,
            range: this.range(stmt),
            node: stmt,
          }),
        );
        continue;
      }
      if (stmt.kind === "KeywordStatement" && stmt.keyword.text === "return") {
        if (!this.returnCalls.has(stmt)) {
          const m = messages();
          this.error("sequence.return", m.diagnostics.sequence.returnOutsideCall, stmt.keyword, {
            hints: [m.hints.sequence.returnInCall],
          });
          continue;
        }
        const relation = this.relationOf.get(stmt);
        if (!relation) continue;
        afterReturn(stmt);
        events.push(
          this.register({
            kind: "message",
            key: relation.key,
            id: relation.id,
            idRange: relation.idRange,
            relation: relation.key,
            events: [],
            path,
            range: this.range(stmt),
            node: stmt,
          }),
        );
        returned = true;
        continue;
      }
      afterReturn(stmt);
      if (stmt.kind === "ShorthandDeclaration" || !EVENT_KEYWORDS.has(stmt.keyword.text)) {
        // Only nested statements get here: the diagram level was classified already.
        const keyword = stmt.kind === "KeywordStatement" ? stmt.keyword : stmt;
        const declaration =
          stmt.kind === "ShorthandDeclaration" ||
          (stmt.kind === "KeywordStatement" &&
            (PARTICIPANTS.has(stmt.keyword.text) || stmt.keyword.text === "group"));
        const m = messages();
        this.error(
          "prop.unknown",
          declaration
            ? m.diagnostics.sequence.participantsAtTop
            : m.diagnostics.sequence.unknownInFragment(
                stmt.kind === "KeywordStatement" ? stmt.keyword.text : "",
              ),
          keyword,
          { hints: [m.hints.sequence.fragmentContents] },
        );
        continue;
      }
      const event = this.keywordEvent(stmt, path);
      if (event) events.push(this.register(event));
    }
    return events;
  }

  private keywordEvent(stmt: KeywordStatement, path: EventPlace[]): SequenceEvent | undefined {
    const keyword = stmt.keyword.text;
    const range = this.range(stmt);
    switch (keyword) {
      case "activate":
      case "deactivate":
      case "create":
      case "destroy": {
        const form = `\`${keyword} <participant>\``;
        if (stmt.block || stmt.chain)
          return this.invalidEvent(messages().diagnostics.common.takesNoBlock(keyword), stmt);
        const [arg, extra] = stmt.args;
        const token = singleIdent(arg);
        if (!token || extra) {
          return this.invalidEvent(
            messages().diagnostics.common.expected(form),
            extra ?? arg ?? stmt.keyword,
          );
        }
        const participant = this.participant(token, stmt);
        if (!participant) return undefined;
        return {
          kind: keyword,
          key: this.nextKey(keyword),
          id: null,
          idRange: null,
          participant,
          participantRange: this.range(token),
          path,
          range,
          node: stmt,
        };
      }
      case "note":
        return this.note(stmt, path);
      case "divider": {
        const [label, extra] = stmt.args;
        if (stmt.block || stmt.chain || label?.kind !== "StringLiteral" || extra) {
          return this.invalidEvent(
            messages().diagnostics.sequence.divider,
            extra ?? label ?? stmt.keyword,
          );
        }
        return {
          kind: "divider",
          key: this.nextKey("divider"),
          id: null,
          idRange: null,
          label: label.value,
          path,
          range,
          node: stmt,
        };
      }
      case "delay": {
        const [label, extra] = stmt.args;
        if (stmt.block || stmt.chain || (label && label.kind !== "StringLiteral") || extra) {
          return this.invalidEvent(
            messages().diagnostics.sequence.delay,
            extra ?? label ?? stmt.keyword,
          );
        }
        return {
          kind: "delay",
          key: this.nextKey("delay"),
          id: null,
          idRange: null,
          label: label?.kind === "StringLiteral" ? label.value : null,
          path,
          range,
          node: stmt,
        };
      }
      default:
        return this.fragment(stmt, path);
    }
  }

  private invalidEvent(
    message: string,
    at: Arg | Token | Statement | { start: number; end: number },
  ): undefined {
    this.invalid(message, at as Token);
    return undefined;
  }

  /** `note [id] over p[, q] "T"`, `note [id] left of p "T"`, `note [id] right of p "T"`. */
  private note(stmt: KeywordStatement, path: EventPlace[]): SequenceEvent | undefined {
    const m = messages();
    const form = m.words.noteForm;
    if (stmt.block || stmt.chain) {
      return this.invalidEvent(
        m.diagnostics.common.takesNoBlockExpected("note", form),
        stmt.block ?? stmt.chain!,
      );
    }
    const args = [...stmt.args];
    let idToken: Token | undefined;
    const first = singleIdent(args[0]);
    if (first && !(NOTE_POSITIONS as readonly string[]).includes(first.text)) {
      idToken = first;
      args.shift();
    }
    const position = singleIdent(args.shift());
    if (!position || !(NOTE_POSITIONS as readonly string[]).includes(position.text)) {
      return this.invalidEvent(m.diagnostics.common.expected(form), position ?? stmt.keyword);
    }
    if (position.text !== "over") {
      const of = singleIdent(args.shift());
      if (of?.text !== "of") {
        return this.invalidEvent(m.diagnostics.sequence.noteSide(position.text), of ?? position);
      }
    }
    const text = args.pop();
    if (text?.kind !== "StringLiteral")
      return this.invalidEvent(m.diagnostics.sequence.noteText(form), text ?? stmt.keyword);
    if (args.length === 0)
      return this.invalidEvent(m.diagnostics.sequence.noteParticipant(form), position);
    if (position.text !== "over" && args.length > 1) {
      return this.invalidEvent(m.diagnostics.sequence.oneParticipant(position.text), args[1]!);
    }
    const participants: string[] = [];
    for (const arg of args) {
      const token = singleIdent(arg);
      if (!token) {
        return this.invalidEvent(m.diagnostics.sequence.invalidParticipant(describeArg(arg)), arg);
      }
      const participant = this.participant(token, stmt);
      if (!participant) return undefined;
      participants.push(participant);
    }
    const id = idToken && this.claim(idToken, stmt) ? idToken.text : null;
    return {
      kind: "note",
      key: id ?? this.nextKey("note"),
      id,
      idRange: id ? this.range(idToken!) : null,
      position: position.text as "over" | "left" | "right",
      participants,
      text: text.value,
      path,
      range: this.range(stmt),
      node: stmt,
    };
  }

  /** `alt [id] ["c"] { } else ["c"] { }` and the other fragments. */
  private fragment(stmt: KeywordStatement, path: EventPlace[]): SequenceEvent | undefined {
    const operator = stmt.keyword.text as FragmentOperator;
    const branchKeyword = FRAGMENT_BRANCH_KEYWORDS[operator];
    const clauses = clausesOf(stmt);
    const head = clauses[0]!;
    let idToken: Token | undefined;
    const args = [...head.args];
    const first = singleIdent(args[0]);
    if (first) {
      idToken = first;
      args.shift();
    }
    const id = idToken && this.claim(idToken, stmt) ? idToken.text : null;
    const key = id ?? this.nextKey(operator);
    const branches: FragmentBranch[] = [];
    for (const [index, clause] of clauses.entries()) {
      const clauseArgs = index === 0 ? args : [...clause.args];
      if (index > 0 && clause.keyword.text !== branchKeyword) {
        const m = messages().diagnostics;
        this.invalid(
          branchKeyword
            ? m.sequence.branchKeyword(operator, branchKeyword, clause.keyword.text)
            : m.common.singleBlock(operator),
          clause.keyword,
        );
        continue;
      }
      const [condition, extra] = clauseArgs;
      if ((condition && condition.kind !== "StringLiteral") || extra) {
        this.invalid(
          messages().diagnostics.common.expected(
            `\`${clause.keyword.text}${index === 0 ? " [<id>]" : ""} ["condition"] { ... }\``,
          ),
          extra ?? condition!,
        );
        continue;
      }
      const block = blockOf(clause.block);
      if (!block) {
        this.invalid(
          messages().diagnostics.sequence.needsBlock(clause.keyword.text),
          clause.keyword,
        );
        continue;
      }
      branches.push({
        condition: condition?.kind === "StringLiteral" ? condition.value : null,
        conditionRange: condition ? this.range(condition) : null,
        events: this.buildEvents(block.statements, [
          ...path,
          { fragment: key, branch: branches.length },
        ]),
        range: this.lines.range({ start: clause.node.start, end: clause.node.end }),
        block,
      });
    }
    if (branches.length === 0) return undefined;
    const event: FragmentEvent = {
      kind: "fragment",
      key,
      id,
      idRange: id ? this.range(idToken!) : null,
      operator,
      branches,
      path,
      range: this.range(stmt),
      node: stmt,
    };
    return event;
  }

  // ---------------------------------------------------------------- order

  private line(state: LifeState, participant: string): Lifeline {
    let line = state.get(participant);
    if (!line) {
      line = { depth: 0, implicit: 0, appeared: false, created: false, destroyed: false };
      state.set(participant, line);
    }
    return line;
  }

  private lifecycle(message: string, at: Statement): void {
    this.error("sequence.lifecycle", message, at.kind === "KeywordStatement" ? at : at);
  }

  /** Checks activations and lifecycles in event order; returns the state after the events. */
  private checkOrder(events: readonly SequenceEvent[], state: LifeState): LifeState {
    for (const event of events) {
      switch (event.kind) {
        case "message": {
          const relation = this.relationsByKey.get(event.relation);
          if (!relation) break;
          for (const participant of new Set([relation.from, relation.to])) {
            const line = this.line(state, participant);
            if (line.destroyed) {
              this.lifecycle(
                messages().diagnostics.sequence.destroyedBeforeMessage(participant),
                event.node,
              );
            }
            line.appeared = true;
          }
          if (event.events.length > 0) {
            // The receiver is active for the call's block, a level no `deactivate` ends.
            const callee = this.line(state, relation.to);
            callee.depth++;
            callee.implicit++;
            this.checkOrder(event.events, state);
            const after = this.line(state, relation.to);
            after.depth = Math.max(0, after.depth - 1);
            after.implicit = Math.max(0, after.implicit - 1);
          }
          break;
        }
        case "activate":
        case "deactivate": {
          const line = this.line(state, event.participant);
          if (line.destroyed) {
            this.lifecycle(
              messages().diagnostics.sequence.destroyedBeforeEvent(event.participant),
              event.node,
            );
          }
          if (event.kind === "activate") line.depth++;
          else if (line.depth > 0 && line.depth === line.implicit) {
            const m = messages();
            this.error(
              "sequence.activation",
              m.diagnostics.sequence.activeForCall(
                event.participant,
                enclosingCall(event.path) ?? "",
              ),
              event.node,
            );
          } else if (line.depth === 0) {
            const m = messages();
            this.error(
              "sequence.activation",
              m.diagnostics.sequence.notActive(event.participant),
              event.node,
              { hints: [m.hints.sequence.activate(event.participant)] },
            );
          } else line.depth--;
          line.appeared = true;
          break;
        }
        case "create": {
          const line = this.line(state, event.participant);
          if (line.created) {
            this.lifecycle(
              messages().diagnostics.sequence.createdTwice(event.participant),
              event.node,
            );
          } else if (line.appeared) {
            this.lifecycle(
              messages().diagnostics.sequence.createAfterUse(event.participant),
              event.node,
            );
          }
          line.created = true;
          line.appeared = true;
          break;
        }
        case "destroy": {
          const line = this.line(state, event.participant);
          if (line.destroyed) {
            this.lifecycle(
              messages().diagnostics.sequence.destroyedTwice(event.participant),
              event.node,
            );
          }
          line.destroyed = true;
          line.appeared = true;
          break;
        }
        case "note":
          for (const participant of event.participants) {
            const line = this.line(state, participant);
            if (line.destroyed) {
              this.lifecycle(
                messages().diagnostics.sequence.destroyedBeforeNote(participant),
                event.node,
              );
            }
            line.appeared = true;
          }
          break;
        case "fragment": {
          if (
            event.operator === "alt" ||
            event.operator === "par" ||
            event.operator === "critical"
          ) {
            // Each branch starts from the same state; the first branch's result goes on.
            const entry = cloneState(state);
            const results = event.branches.map((branch) =>
              this.checkOrder(branch.events, cloneState(entry)),
            );
            const after = results[0] ?? entry;
            state.clear();
            for (const [id, line] of after) state.set(id, line);
          } else {
            for (const branch of event.branches) this.checkOrder(branch.events, state);
          }
          break;
        }
        default:
          break;
      }
    }
    return state;
  }

  // ---------------------------------------------------------------- placement

  protected override placementStatement(stmt: KeywordStatement): boolean {
    const keyword = stmt.keyword.text;
    if (keyword === "label") return false;
    if (keyword !== "space" && keyword !== "gap") {
      const m = messages();
      this.error("prop.unknown", m.diagnostics.sequence.placementStatement(keyword), stmt.keyword, {
        hints: [m.hints.sequence.placement],
      });
      return true;
    }
    const form = `\`${keyword} <${keyword === "space" ? "event" : "participant"}> <n> [before|after]\``;
    if (!this.noBlock(stmt, form)) return true;
    const [target, amount, sideArg, extra] = stmt.args;
    const token = singleIdent(target);
    if (!token) {
      this.shapeError(stmt, form, target);
      return true;
    }
    const words = messages().diagnostics.sequence;
    // `space` is room, 0 or more; a `gap` may be negative, to bring two participants closer.
    if (
      amount?.kind !== "NumberLiteral" ||
      (amount.unit !== null && amount.unit !== "px") ||
      (keyword === "space" && amount.value < 0)
    ) {
      this.invalid(
        keyword === "space" ? words.pixels(form) : words.signedPixels(form),
        amount ?? stmt.keyword,
      );
      return true;
    }
    const sideToken = sideArg === undefined ? undefined : singleIdent(sideArg);
    if (
      (sideArg !== undefined &&
        (!sideToken || (sideToken.text !== "before" && sideToken.text !== "after"))) ||
      extra
    ) {
      this.invalid(words.side(form), extra ?? sideArg ?? stmt.keyword);
      return true;
    }
    const side = sideToken?.text === "after" ? "after" : "before";
    let name: string | undefined;
    if (keyword === "gap") {
      name = this.participant(token, stmt, "gap");
      if (!name) return true;
      // Before the first participant and after the last there is nothing to bring closer.
      const order = this.elements.filter((element) => element.kind !== "group");
      const edge = side === "before" ? order[0]?.id === name : order[order.length - 1]?.id === name;
      if (amount.value < 0 && edge) {
        this.error("prop.invalid-value", words.outerGap(name, side), amount, {
          hints: [messages().hints.sequence.outerGap(name)],
        });
        return true;
      }
    } else {
      const relation = this.relationsByKey.get(token.text);
      const event = this.eventsByKey.get(token.text);
      if (relation && relation.id === token.text) {
        this.reference(token, token.text, "relation", "space", stmt);
        name = token.text;
      } else if (event && event.id === token.text) {
        this.reference(token, token.text, "event", "space", stmt);
        name = token.text;
      } else {
        const m = messages();
        this.error("ref.unknown-element", m.diagnostics.sequence.unknownEvent(token.text), token, {
          hints: [m.hints.sequence.spaceTarget],
          data: { ids: [token.text] },
        });
        return true;
      }
    }
    if (this.duplicatePlacement(stmt, name, side)) return true;
    this.placement.push({
      statement: keyword,
      target: name,
      amount: amount.value,
      side,
      range: this.range(stmt),
      targetRange: this.range(token),
      node: stmt,
    });
    return true;
  }

  // ---------------------------------------------------------------- scenarios

  protected override scenarioBlock(stmt: KeywordStatement): void {
    const form = '`scenario <id> ["Label"] { ... }`';
    const [idArg, labelArg, extra] = stmt.args;
    const idToken = singleIdent(idArg);
    if (!idToken || (labelArg && labelArg.kind !== "StringLiteral") || extra) {
      this.invalid(
        messages().diagnostics.common.expected(form),
        extra ?? labelArg ?? idArg ?? stmt.keyword,
      );
      return;
    }
    if (stmt.chain || !stmt.block) {
      this.invalid(
        messages().diagnostics.common.needsOneBlock("scenario", form),
        stmt.chain ?? stmt.keyword,
      );
      return;
    }
    const existing = this.scenarios.find((s) => s.id === idToken.text);
    if (existing) {
      this.error(
        "ref.duplicate-id",
        messages().diagnostics.sequence.duplicateScenario(idToken.text),
        idToken,
      );
      return;
    }
    const choices: ScenarioChoice[] = [];
    const seen = new Map<string, Token>();
    for (const inner of stmt.block.statements) {
      if (inner.kind === "Error" || headerHasError(inner)) continue;
      if (
        inner.kind !== "KeywordStatement" ||
        !["choose", "repeat", "skip", "take"].includes(inner.keyword.text)
      ) {
        this.error(
          "prop.unknown",
          messages().diagnostics.sequence.scenarioStatements,
          inner.kind === "KeywordStatement" ? inner.keyword : inner,
        );
        continue;
      }
      const choice = this.choice(inner);
      if (!choice) continue;
      const first = seen.get(choice.fragment);
      if (first) {
        const m = messages();
        this.error(
          "prop.duplicate",
          m.diagnostics.sequence.decidedTwice(choice.fragment),
          inner.keyword,
          { related: [{ message: m.related.firstDecided, at: first }] },
        );
        continue;
      }
      seen.set(choice.fragment, inner.keyword);
      choices.push(choice);
    }
    this.scenarios.push({
      id: idToken.text,
      label: labelArg?.kind === "StringLiteral" ? labelArg.value : idToken.text,
      choices,
      range: this.range(stmt),
      idRange: this.range(idToken),
      node: stmt,
    });
  }

  private scenarioError(message: string, at: Token | Arg, hints?: string[]): undefined {
    this.error("sequence.scenario", message, at, hints ? { hints } : {});
    return undefined;
  }

  private choice(stmt: KeywordStatement): ScenarioChoice | undefined {
    const kind = stmt.keyword.text as ScenarioChoice["kind"];
    const m = messages();
    const forms = {
      choose: m.words.chooseForm,
      repeat: "`repeat <loop> <n>`",
      skip: "`skip <fragment>`",
      take: "`take <fragment>`",
    };
    if (stmt.block || stmt.chain) {
      this.invalid(
        m.diagnostics.common.takesNoBlockExpected(kind, forms[kind]),
        stmt.block ?? stmt.chain!,
      );
      return undefined;
    }
    const [target, value, extra] = stmt.args;
    const token = singleIdent(target);
    if (
      !token ||
      extra ||
      ((kind === "skip" || kind === "take") && value) ||
      ((kind === "choose" || kind === "repeat") && !value)
    ) {
      this.invalid(
        m.diagnostics.common.expected(forms[kind]),
        extra ?? value ?? target ?? stmt.keyword,
      );
      return undefined;
    }
    const named = [...this.eventsByKey.values()].filter(
      (e): e is FragmentEvent => e.kind === "fragment" && e.id !== null,
    );
    const fragment = this.eventsByKey.get(token.text);
    if (!fragment || fragment.kind !== "fragment" || fragment.id !== token.text) {
      return this.scenarioError(m.diagnostics.sequence.unknownFragment(token.text), token, [
        named.length > 0
          ? m.hints.sequence.namedFragments(named.map((f) => ({ id: f.id!, operator: f.operator })))
          : m.hints.sequence.nameFragment,
      ]);
    }
    this.reference(token, token.text, "event", "scenario", stmt);
    const accepts: Record<ScenarioChoice["kind"], readonly FragmentOperator[]> = {
      choose: ["alt", "critical"],
      repeat: ["loop"],
      skip: ["opt", "break"],
      take: ["opt", "break"],
    };
    if (!accepts[kind].includes(fragment.operator)) {
      return this.scenarioError(
        m.diagnostics.sequence.choiceOperator(kind, fragment.operator, token.text, accepts[kind]),
        stmt.keyword,
      );
    }
    let branch: number | null = null;
    let iterations: number | null = null;
    if (kind === "choose") {
      const conditions = fragment.branches.map((b, i) => b.condition ?? `${i + 1}`);
      if (value!.kind === "StringLiteral") {
        const index = fragment.branches.findIndex(
          (b) => b.condition === (value as { value: string }).value,
        );
        if (index < 0) {
          return this.scenarioError(
            m.diagnostics.sequence.noBranch(token.text, value!.value),
            value!,
            [m.hints.sequence.branches(conditions)],
          );
        }
        branch = index;
      } else if (
        value!.kind === "NumberLiteral" &&
        value!.unit === null &&
        Number.isInteger(value!.value)
      ) {
        if (value!.value < 1 || value!.value > fragment.branches.length) {
          return this.scenarioError(
            m.diagnostics.sequence.branchCount(token.text, fragment.branches.length),
            value!,
            [m.hints.sequence.branches(conditions)],
          );
        }
        branch = value!.value - 1;
      } else {
        this.invalid(m.diagnostics.common.expected(forms.choose), value!);
        return undefined;
      }
    }
    if (kind === "repeat") {
      if (
        value!.kind !== "NumberLiteral" ||
        value!.unit !== null ||
        !Number.isInteger(value!.value) ||
        value!.value < 1 ||
        value!.value > 100
      ) {
        return this.scenarioError(m.diagnostics.sequence.loopCount, value!);
      }
      iterations = value!.value;
    }
    return {
      kind,
      fragment: token.text,
      branch,
      iterations,
      range: this.range(stmt),
      fragmentRange: this.range(token),
      node: stmt,
    };
  }
}
