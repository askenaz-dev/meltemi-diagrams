import { assetProblems } from "./asset-problems.js";
import {
  SEMANTIC_TOKEN_MODIFIERS,
  SEMANTIC_TOKEN_TYPES,
  codeActions,
  completions,
  definition,
  documentSymbols,
  formatDocument,
  highlights,
  hover,
  prepareRename,
  references,
  rename,
  semanticTokens,
  type CompletionKind,
  type SymbolNode,
} from "@meltemi/diagrams-editor";
import * as vscode from "vscode";
import {
  addFileEdits,
  offsetRange,
  toDiagnostic,
  toRange,
  toTextEdits,
  toWorkspaceEdit,
} from "./convert.js";
import { isMeltemi, type Analyses } from "./documents.js";

const SELECTOR: vscode.DocumentSelector = [
  { language: "meltemi", scheme: "file" },
  { language: "meltemi", scheme: "untitled" },
];

const COMPLETION_KINDS: Readonly<Record<CompletionKind, vscode.CompletionItemKind>> = {
  keyword: vscode.CompletionItemKind.Keyword,
  element: vscode.CompletionItemKind.Variable,
  group: vscode.CompletionItemKind.Module,
  relation: vscode.CompletionItemKind.Function,
  port: vscode.CompletionItemKind.Property,
  value: vscode.CompletionItemKind.EnumMember,
  property: vscode.CompletionItemKind.Property,
  theme: vscode.CompletionItemKind.Color,
  class: vscode.CompletionItemKind.Class,
  icon: vscode.CompletionItemKind.File,
  snippet: vscode.CompletionItemKind.Snippet,
};

const SYMBOL_KINDS: Readonly<Record<SymbolNode["kind"], vscode.SymbolKind>> = {
  diagram: vscode.SymbolKind.Class,
  group: vscode.SymbolKind.Namespace,
  element: vscode.SymbolKind.Object,
  relation: vscode.SymbolKind.Function,
  model: vscode.SymbolKind.Module,
  entity: vscode.SymbolKind.Object,
  event: vscode.SymbolKind.Event,
  scenario: vscode.SymbolKind.Enum,
  theme: vscode.SymbolKind.Struct,
  story: vscode.SymbolKind.File,
  scene: vscode.SymbolKind.Field,
  export: vscode.SymbolKind.Package,
};

export const SEMANTIC_LEGEND = new vscode.SemanticTokensLegend(
  [...SEMANTIC_TOKEN_TYPES],
  [...SEMANTIC_TOKEN_MODIFIERS],
);

function toSymbol(node: SymbolNode): vscode.DocumentSymbol {
  const symbol = new vscode.DocumentSymbol(
    node.name,
    node.detail,
    SYMBOL_KINDS[node.kind],
    toRange(node.range),
    toRange(node.selectionRange),
  );
  symbol.children = node.children.map(toSymbol);
  return symbol;
}

/**
 * Registers the language providers and keeps the Problems view in step with the analyses. When the
 * interface language changes, the analyses are made again and announced, and so published in it.
 */
export function registerLanguageProviders(analyses: Analyses): vscode.Disposable[] {
  const collection = vscode.languages.createDiagnosticCollection("meltemi");
  // The problems of a project's assets, on the pack, licence or font files they concern.
  const assets = vscode.languages.createDiagnosticCollection("meltemi-assets");
  const shown = new Map<string, Set<string>>();
  const publishAssets = (document: vscode.TextDocument) => {
    if (document.uri.scheme !== "file") return;
    const workspace = analyses.workspaceOf(document);
    const found = assetProblems(workspace, shown.get(workspace.root) ?? new Set());
    for (const path of found.clear) assets.delete(vscode.Uri.file(path));
    for (const [path, list] of found.set) {
      const uri = vscode.Uri.file(path);
      assets.set(
        uri,
        list.map((d) => toDiagnostic({ uri }, d)),
      );
    }
    shown.set(workspace.root, new Set(found.set.keys()));
  };
  const publish = (document: vscode.TextDocument) => {
    if (!isMeltemi(document)) return;
    const analysis = analyses.get(document);
    collection.set(
      document.uri,
      analysis.diagnostics.map((d) => toDiagnostic(document, d)),
    );
    publishAssets(document);
  };
  for (const document of vscode.workspace.textDocuments) publish(document);
  const offset = (document: vscode.TextDocument, position: vscode.Position) =>
    document.offsetAt(position);

  return [
    collection,
    assets,
    analyses.onDidAnalyze(publish),
    vscode.workspace.onDidOpenTextDocument(publish),
    vscode.workspace.onDidCloseTextDocument((document) => collection.delete(document.uri)),

    vscode.languages.registerCompletionItemProvider(
      SELECTOR,
      {
        provideCompletionItems(document, position) {
          const analysis = analyses.get(document);
          return completions(analysis, offset(document, position)).map((item) => {
            const completion = new vscode.CompletionItem(item.label, COMPLETION_KINDS[item.kind]);
            completion.range = offsetRange(document, item.range.start, item.range.end);
            if (item.detail) completion.detail = item.detail;
            if (item.insertText) {
              completion.insertText = item.snippet
                ? new vscode.SnippetString(item.insertText)
                : item.insertText;
            }
            return completion;
          });
        },
      },
      ".",
      '"',
      " ",
    ),

    vscode.languages.registerHoverProvider(SELECTOR, {
      provideHover(document, position) {
        const found = hover(analyses.get(document), offset(document, position));
        if (!found) return undefined;
        const markdown = new vscode.MarkdownString(found.markdown);
        markdown.supportHtml = false;
        return new vscode.Hover(markdown, toRange(found.range));
      },
    }),

    vscode.languages.registerDocumentSymbolProvider(SELECTOR, {
      provideDocumentSymbols(document) {
        return documentSymbols(analyses.get(document)).map(toSymbol);
      },
    }),

    vscode.languages.registerDefinitionProvider(SELECTOR, {
      provideDefinition(document, position) {
        const at = offset(document, position);
        const range = definition(analyses.get(document), at);
        if (range) return new vscode.Location(document.uri, toRange(range));
        const entity = analyses.entityDefinition(document, at);
        if (entity) return new vscode.Location(entity.uri, toRange(entity.range));
        const linked = analyses.linkDefinition(document, at);
        if (linked) return new vscode.Location(linked.uri, toRange(linked.range));
        // Imported views of stories and their targets.
        const story = analyses.storyDefinition(document, at);
        return story ? new vscode.Location(story.uri, toRange(story.range)) : undefined;
      },
    }),

    vscode.languages.registerReferenceProvider(SELECTOR, {
      provideReferences(document, position, context) {
        // Entities of a model are named in other files of the project too.
        const entity = analyses.entityReferences(
          document,
          offset(document, position),
          context.includeDeclaration,
        );
        if (entity) return entity.map((r) => new vscode.Location(r.uri, toRange(r.range)));
        // So are elements, relations and events that stories of other files name.
        const target = analyses.targetReferences(
          document,
          offset(document, position),
          context.includeDeclaration,
        );
        if (target) return target.map((r) => new vscode.Location(r.uri, toRange(r.range)));
        return references(
          analyses.get(document),
          offset(document, position),
          context.includeDeclaration,
        ).map((range) => new vscode.Location(document.uri, toRange(range)));
      },
    }),

    vscode.languages.registerDocumentHighlightProvider(SELECTOR, {
      provideDocumentHighlights(document, position) {
        return highlights(analyses.get(document), offset(document, position)).map(
          (h) =>
            new vscode.DocumentHighlight(
              toRange(h.range),
              h.kind === "write"
                ? vscode.DocumentHighlightKind.Write
                : vscode.DocumentHighlightKind.Read,
            ),
        );
      },
    }),

    vscode.languages.registerRenameProvider(SELECTOR, {
      prepareRename(document, position) {
        const prepared = prepareRename(analyses.get(document), offset(document, position));
        if (!prepared.ok) throw new Error(prepared.reason);
        return { range: toRange(prepared.range), placeholder: prepared.placeholder };
      },
      async provideRenameEdits(document, position, newName) {
        // An entity of a model, or a target of an imported view of a story, is renamed in every
        // file of the project that names it.
        const at = offset(document, position);
        const project =
          analyses.entityRename(document, at, newName) ??
          analyses.storyTargetRename(document, at, newName);
        if (project) {
          if (!project.ok) throw new Error(project.reason);
          const edit = new vscode.WorkspaceEdit();
          await addFileEdits(edit, project.edits);
          return edit;
        }
        const result = rename(analyses.get(document), offset(document, position), newName);
        if (!result.ok) throw new Error(result.rejection.reason);
        // Stories of other files that import the diagram follow the rename.
        const edit = toWorkspaceEdit(document, result.plan.edits);
        await addFileEdits(edit, analyses.storyRenames(document, result.plan.operation));
        return edit;
      },
    }),

    vscode.languages.registerDocumentFormattingEditProvider(SELECTOR, {
      provideDocumentFormattingEdits(document) {
        return toTextEdits(document, formatDocument(analyses.get(document)));
      },
    }),

    vscode.languages.registerDocumentSemanticTokensProvider(
      SELECTOR,
      {
        provideDocumentSemanticTokens(document) {
          const builder = new vscode.SemanticTokensBuilder(SEMANTIC_LEGEND);
          for (const token of semanticTokens(analyses.get(document))) {
            const start = document.positionAt(token.start);
            const end = document.positionAt(token.start + token.length);
            if (start.line !== end.line) continue;
            builder.push(
              new vscode.Range(start, end),
              token.type,
              token.declaration ? ["declaration"] : [],
            );
          }
          return builder.build();
        },
      },
      SEMANTIC_LEGEND,
    ),

    vscode.languages.registerCodeActionsProvider(
      SELECTOR,
      {
        provideCodeActions(document, range, context) {
          const analysis = analyses.get(document);
          const start = document.offsetAt(range.start);
          const end = document.offsetAt(range.end);
          return codeActions(analysis, { start, end }).map((action) => {
            const kind =
              action.kind === "quickfix"
                ? vscode.CodeActionKind.QuickFix
                : vscode.CodeActionKind.Refactor;
            const result = new vscode.CodeAction(action.title, kind);
            result.edit = toWorkspaceEdit(document, action.edits);
            if (action.preferred) result.isPreferred = true;
            if (action.diagnostic) {
              const match = context.diagnostics.find(
                (d) =>
                  d.code === action.diagnostic!.code &&
                  d.range.isEqual(toRange(action.diagnostic!.range)),
              );
              if (match) result.diagnostics = [match];
            }
            return result;
          });
        },
      },
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.Refactor] },
    ),
  ];
}
