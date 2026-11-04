import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ProjectSessions } from "@meltemi/diagrams-editor/node";
import { BRAND_NAME } from "@meltemi/diagrams-layout";
import { loadElkWorkerFile } from "@meltemi/diagrams-layout-elk";
import * as vscode from "vscode";
import {
  CanvasEditorProvider,
  CanvasPanels,
  openBesideText,
  VIEW_TYPE,
  type CanvasHost,
} from "./canvas.js";
import { registerAssist } from "./assist.js";
import { exportPlayer, exportSvg, registerCommands } from "./commands.js";
import { Analyses } from "./documents.js";
import { Importer } from "./import.js";
import { InterfaceLanguage } from "./language.js";
import { registerLanguageProviders } from "./providers.js";
import { CanvasOpening, REMEMBER_KEY, type OpenWithText } from "./remember.js";

/** Reads files under a folder of the bundled assets, by forward-slash path. */
function assetReader(folder: string) {
  return {
    bytes: (path: string): Uint8Array | undefined => {
      try {
        return new Uint8Array(readFileSync(join(folder, ...path.split("/"))));
      } catch {
        return undefined;
      }
    },
    text: (path: string): string | undefined => {
      try {
        return readFileSync(join(folder, ...path.split("/")), "utf8");
      } catch {
        return undefined;
      }
    },
  };
}

let active = false;

/** What the extension exposes to its tests. */
export interface MeltemiApi {
  readonly analyses: Analyses;
  readonly host: CanvasHost;
  readonly importer: Importer;
}

export function activate(context: vscode.ExtensionContext): MeltemiApi {
  active = true;
  // The interface language first: everything below builds words for people.
  const language = new InterfaceLanguage();
  context.subscriptions.push(language);
  const assets = join(context.extensionPath, "dist", "assets");
  const fonts = assetReader(join(assets, "fonts"));
  const bundled = assetReader(assets);
  const version = (context.extension.packageJSON as { version: string }).version;
  const sessions = new ProjectSessions({
    toolVersion: version,
    fontReader: fonts.bytes,
    assetReader: bundled.text,
    loadElkWorker: () => loadElkWorkerFile(join(assets, "elk-worker.min.js")),
  });
  const analyses = new Analyses(sessions);
  const opening = new CanvasOpening(
    {
      get: () => context.globalState.get<boolean>(REMEMBER_KEY, true),
      set: (value) => context.globalState.update(REMEMBER_KEY, value),
    },
    () =>
      vscode.workspace
        .getConfiguration("meltemi.canvas")
        .get<OpenWithText>("openWithText", "remember"),
  );
  const panels = new CanvasPanels();
  let script: string | undefined;
  let catalog: string | undefined;
  const asset = async (name: string) =>
    new TextDecoder().decode(
      await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(context.extensionUri, "dist", "assets", name),
      ),
    );
  const host: CanvasHost = {
    analyses,
    opening,
    panels,
    exportSvg: (document) => exportSvg(host, document),
    exportPlayer: (document, story) => exportPlayer(host, document, story),
    playerScript: async () => (script ??= await asset("player.js")),
    catalogScript: async () => (catalog ??= await asset("catalog.js")),
    generator: `${BRAND_NAME} ${version}`,
    active: () => active,
  };
  context.subscriptions.push(
    analyses,
    ...registerLanguageProviders(analyses),
    language.onDidChange(() => {
      // Diagnostics take their words when they are made: the open documents are analysed again,
      // which publishes them in the new language; then open canvases load their page again.
      analyses.analyzeAgain();
      panels.reload();
    }),
    vscode.window.registerCustomEditorProvider(
      VIEW_TYPE,
      new CanvasEditorProvider(context.extensionUri, host),
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
    ...registerCommands(host),
    ...registerAssist(analyses, context.secrets, version),
    ...openBesideText(host),
  );
  const importer = new Importer(sessions);
  context.subscriptions.push(importer, ...importer.register());
  return { analyses, host, importer };
}

export function deactivate(): void {
  active = false;
}
