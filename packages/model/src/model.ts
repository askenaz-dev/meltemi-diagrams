import {
  isToken,
  type DiagnosticBag,
  type KeywordStatement,
  type LineIndex,
  type ModelBlock,
  type QualifiedRef,
  type Range,
  type RelationStatement,
  type Span,
  type Statement,
  type Token,
  type DiagnosticData,
} from "@meltemi/diagrams-language";
import { messages } from "./messages/index.js";
import { ENTITY_CHILDREN, ENTITY_KINDS } from "./schema.js";
import { headerHasError, isSafeUrl, singleIdent, spanOf } from "./style-values.js";
import type {
  EntityKind,
  EntityReference,
  ModelDefinition,
  ModelEntity,
  ModelRelation,
} from "./types.js";

const KINDS: ReadonlySet<string> = new Set(ENTITY_KINDS);

/** Edit distance between two words. */
export function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length]!;
}

/** Paths close to a written one, by whole path or by last segment, closest first. */
export function closePaths(written: string, paths: Iterable<string>, limit = 3): string[] {
  const last = written.split(".").pop()!.toLowerCase();
  return [...paths]
    .map((path) => ({
      path,
      d: Math.min(
        distance(path.toLowerCase(), written.toLowerCase()),
        distance(path.split(".").pop()!.toLowerCase(), last),
      ),
    }))
    .filter((c) => c.d <= Math.max(2, Math.floor(written.length / 3)))
    .sort((a, b) => a.d - b.d || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map((c) => c.path);
}

/** Whether `ancestor` holds `path` at any depth. */
export function isAncestorPath(ancestor: string, path: string): boolean {
  return path.startsWith(`${ancestor}.`);
}

/** Analyzes `model <id> { }` into a model definition, reporting diagnostics. */
export function analyzeModel(
  node: ModelBlock,
  id: Token,
  lines: LineIndex,
  bag: DiagnosticBag,
): ModelDefinition {
  return new ModelAnalyzer(node, id, lines, bag).run();
}

class ModelAnalyzer {
  private errors = 0;
  private readonly entities: ModelEntity[] = [];
  private readonly byPath = new Map<string, ModelEntity>();
  private readonly relations: ModelRelation[] = [];
  private readonly references: EntityReference[] = [];
  private readonly pending: { stmt: RelationStatement; scope: string | null }[] = [];

  constructor(
    private readonly node: ModelBlock,
    private readonly id: Token,
    private readonly lines: LineIndex,
    private readonly bag: DiagnosticBag,
  ) {}

  private range(at: Span | Token): Range {
    return this.lines.range(spanOf(at as Token));
  }

  private error(
    code: string,
    message: string,
    at: Span | Token,
    options: {
      hints?: string[];
      related?: { message: string; at: Token }[];
      data?: DiagnosticData;
    } = {},
  ): void {
    this.errors++;
    this.bag.add({
      code,
      message,
      span: spanOf(at as Token),
      ...(options.hints ? { hints: options.hints } : {}),
      ...(options.data ? { data: options.data } : {}),
      ...(options.related
        ? { related: options.related.map((r) => ({ message: r.message, span: spanOf(r.at) })) }
        : {}),
    });
  }

  run(): ModelDefinition {
    const block = this.node.block.kind === "Block" ? this.node.block : undefined;
    if (block) this.visit(block.statements, null);
    this.resolveRelations();
    const counts = new Map<string, number>();
    const relations = this.relations.map((relation) => {
      if (relation.id !== null) return relation;
      const pair = `${relation.from}->${relation.to}`;
      const n = (counts.get(pair) ?? 0) + 1;
      counts.set(pair, n);
      return { ...relation, key: `${pair}#${n}` };
    });
    return {
      id: this.id.text,
      range: this.range(this.node),
      idRange: this.range(this.id),
      node: this.node,
      entities: this.entities,
      entitiesByPath: this.byPath,
      relations,
      relationsByKey: new Map(relations.map((r) => [r.key, r])),
      references: this.references,
      hasErrors: this.node.hasError || this.errors > 0,
    };
  }

  private visit(statements: readonly Statement[], parent: ModelEntity | null): void {
    for (const stmt of statements) {
      if (stmt.kind === "Error" || headerHasError(stmt)) continue;
      if (stmt.kind === "RelationStatement") {
        this.pending.push({ stmt, scope: parent?.path ?? null });
        continue;
      }
      if (stmt.kind === "ShorthandDeclaration") {
        const m = messages();
        this.error("prop.unknown", m.diagnostics.model.brackets, stmt.id, {
          hints: [m.hints.model.kindNotBrackets(stmt.id.text)],
        });
        continue;
      }
      const keyword = stmt.keyword.text;
      if (KINDS.has(keyword)) {
        this.entity(stmt, parent);
        continue;
      }
      if (parent && ["description", "technology", "external", "url"].includes(keyword)) continue;
      const allowed = ENTITY_CHILDREN[parent?.kind ?? "model"]!;
      const accepted = parent ? [...allowed, ...propertiesOf(parent.kind)] : [];
      const m = messages();
      this.error(
        "prop.unknown",
        m.diagnostics.model.unknownStatement(keyword, parent),
        stmt.keyword,
        {
          data: { candidates: parent ? accepted : ["person", "system"] },
          hints: [
            parent ? m.hints.model.blockAccepts(parent.kind, accepted) : m.hints.model.modelAccepts,
          ],
        },
      );
    }
  }

  private entity(stmt: KeywordStatement, parent: ModelEntity | null): void {
    const kind = stmt.keyword.text as EntityKind;
    const form = `\`${kind} <id> ["Label"] { ... }\``;
    const allowed = ENTITY_CHILDREN[parent?.kind ?? "model"]!;
    if (!allowed.includes(kind)) {
      const m = messages();
      this.error(
        "model.invalid-nesting",
        m.diagnostics.model.invalidNesting(kind, parent),
        stmt.keyword,
        {
          hints: [
            allowed.length > 0
              ? m.hints.model.canDeclare(allowed)
              : m.hints.model.holdsNothing(parent!.kind),
          ],
        },
      );
      return;
    }
    if (stmt.chain) {
      this.error("prop.invalid-value", messages().diagnostics.common.singleBlock(kind), stmt.chain);
      return;
    }
    const [idArg, labelArg, extra] = stmt.args;
    const idToken = singleIdent(idArg);
    if (!idToken || (labelArg && labelArg.kind !== "StringLiteral") || extra) {
      const m = messages();
      this.error(
        "prop.invalid-value",
        m.diagnostics.common.expected(form),
        (extra ??
          (labelArg && labelArg.kind !== "StringLiteral" ? labelArg : idArg) ??
          stmt.keyword) as Span,
        { hints: [m.hints.example(`${kind} api "Orders API"`)] },
      );
      return;
    }
    const path = parent ? `${parent.path}.${idToken.text}` : idToken.text;
    const first = this.byPath.get(path);
    if (first) {
      const m = messages();
      this.error("ref.duplicate-id", m.diagnostics.model.duplicateEntity(path), idToken, {
        related: [{ message: m.related.firstDeclared, at: first.idToken }],
      });
      return;
    }
    let description: string | null = null;
    let technology: string | null = null;
    let external = false;
    let url: string | null = null;
    const seen = new Map<string, Token>();
    const block = stmt.block;
    for (const inner of block?.statements ?? []) {
      if (inner.kind !== "KeywordStatement" || headerHasError(inner)) continue;
      const word = inner.keyword.text;
      if (!["description", "technology", "external", "url"].includes(word)) continue;
      const before = seen.get(word);
      if (before) {
        const m = messages();
        this.error("prop.duplicate", m.diagnostics.common.setMoreThanOnce(word), inner.keyword, {
          related: [{ message: m.related.firstSet, at: before }],
        });
        continue;
      }
      seen.set(word, inner.keyword);
      if (word === "external") {
        if (kind !== "person" && kind !== "system") {
          this.error("prop.invalid-value", messages().diagnostics.model.external, inner.keyword);
        } else if (inner.args.length > 0 || inner.block) {
          this.error(
            "prop.invalid-value",
            messages().diagnostics.common.takesNoValue("external"),
            inner.args[0] ?? inner,
          );
        } else external = true;
        continue;
      }
      const [value, more] = inner.args;
      if (value?.kind !== "StringLiteral" || more || inner.block) {
        this.error(
          "prop.invalid-value",
          messages().diagnostics.model.quotedExample(word),
          (more ?? value ?? inner.keyword) as Span,
        );
        continue;
      }
      if (word === "url") {
        if (isSafeUrl(value.value)) url = value.value;
        else this.error("prop.invalid-value", messages().diagnostics.model.url, value);
        continue;
      }
      if (word === "description") description = value.value;
      else technology = value.value;
    }
    const entity: ModelEntity = {
      path,
      id: idToken.text,
      kind,
      label: labelArg?.kind === "StringLiteral" ? labelArg.value : idToken.text,
      description,
      technology,
      external,
      url,
      parent: parent?.path ?? null,
      range: this.range(stmt),
      idRange: this.range(idToken),
      idToken,
      node: stmt,
    };
    this.entities.push(entity);
    this.byPath.set(path, entity);
    this.references.push({ token: idToken, model: this.id.text, path, role: "declaration" });
    if (block) this.visit(block.statements, entity);
  }

  /**
   * The entity a reference names, looked up from the innermost enclosing entity outwards, then
   * from the root, with a reference for every part.
   */
  resolve(
    ref: QualifiedRef,
    scope: string | null,
    role: EntityReference["role"],
  ): string | undefined {
    const written = ref.text;
    let base: string | null = scope;
    for (;;) {
      const path = base ? `${base}.${written}` : written;
      if (this.byPath.has(path)) {
        const prefix = base ? `${base}.` : "";
        ref.parts.forEach((part, i) => {
          this.references.push({
            token: part,
            model: this.id.text,
            path: `${prefix}${ref.parts
              .slice(0, i + 1)
              .map((p) => p.text)
              .join(".")}`,
            role,
          });
        });
        return path;
      }
      if (base === null) break;
      base = this.byPath.get(base)?.parent ?? null;
    }
    const close = closePaths(written, this.byPath.keys());
    const m = messages();
    this.error(
      "ref.unknown-entity",
      m.diagnostics.common.unknownEntity(written, this.id.text),
      ref,
      {
        data: { candidates: close },
        hints: [close.length > 0 ? m.hints.didYouMean(close) : m.hints.model.declareEntity],
      },
    );
    return undefined;
  }

  private resolveRelations(): void {
    const ids = new Map<string, Token>();
    for (const { stmt, scope } of this.pending) {
      if (stmt.target.kind !== "QualifiedRef") continue;
      const from = this.resolve(stmt.source, scope, "endpoint");
      const to = this.resolve(stmt.target, scope, "endpoint");
      if (stmt.arrow.text !== "->") {
        const m = messages();
        this.error("prop.invalid-value", m.diagnostics.model.arrow, stmt.arrow, {
          hints: [m.hints.model.dashed],
        });
        continue;
      }
      if (from === undefined || to === undefined) continue;
      if (from === to || isAncestorPath(from, to) || isAncestorPath(to, from)) {
        const m = messages().diagnostics.model;
        this.error(
          "model.invalid-relation",
          from === to ? m.selfRelation(from) : m.nestedRelation(from, to),
          stmt,
        );
        continue;
      }
      const idToken = stmt.id && isToken(stmt.id) ? stmt.id : undefined;
      let id: string | null = null;
      if (idToken) {
        const first = ids.get(idToken.text);
        if (first) {
          const m = messages();
          this.error(
            "ref.duplicate-id",
            m.diagnostics.model.relationIdUsed(idToken.text),
            idToken,
            {
              related: [{ message: m.related.firstUsed, at: first }],
            },
          );
        } else {
          ids.set(idToken.text, idToken);
          id = idToken.text;
        }
      }
      let technology: string | null = null;
      let description: string | null = null;
      let assumption: string | null = null;
      for (const inner of stmt.block?.statements ?? []) {
        if (inner.kind !== "KeywordStatement" || headerHasError(inner)) continue;
        const word = inner.keyword.text;
        if (word !== "technology" && word !== "description" && word !== "assumption") {
          const m = messages();
          this.error("prop.unknown", m.diagnostics.model.unknownInRelation(word), inner.keyword, {
            hints: [m.hints.model.relationAccepts],
            data: { candidates: ["technology", "description", "assumption"] },
          });
          continue;
        }
        const [value, more] = inner.args;
        if (value?.kind !== "StringLiteral" || more || inner.block) {
          this.error(
            "prop.invalid-value",
            messages().diagnostics.common.expectsString(word),
            (more ?? value ?? inner.keyword) as Span,
          );
          continue;
        }
        if (word === "technology") technology = value.value;
        else if (word === "assumption") assumption = value.value;
        else description = value.value;
      }
      this.relations.push({
        key: id ?? "",
        id,
        from,
        to,
        label: stmt.label && isToken(stmt.label) ? String(stmt.label.value ?? "") : null,
        technology,
        description,
        assumption,
        range: this.range(stmt),
        idRange: id !== null && idToken ? this.range(idToken) : null,
        scope,
        node: stmt,
      });
    }
  }
}

/** The properties an entity of a kind takes. */
function propertiesOf(kind: string): string[] {
  return kind === "person" || kind === "system"
    ? ["description", "technology", "external", "url"]
    : ["description", "technology", "url"];
}
