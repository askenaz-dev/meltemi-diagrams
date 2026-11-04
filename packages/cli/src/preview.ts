import { statSync, watch, type FSWatcher } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { href } from "@meltemi/diagrams-catalog";
import type { Diagnostic } from "@meltemi/diagrams-language";
import {
  buildCatalog,
  type CatalogBuild,
  type ProjectSessions,
} from "@meltemi/diagrams-editor/node";
import { getLocale } from "@meltemi/diagrams-i18n";
import { joinPath, toProjectPath, type Workspace } from "@meltemi/diagrams-project";
import { argumentsError, messages } from "./messages/index.js";
import { openUrl } from "./open-url.js";

export interface PreviewOptions {
  /** The project folder, or a file whose diagrams open first. */
  readonly target: string;
  readonly isFolder: boolean;
  /** 0 picks a free port. */
  readonly port: number;
  readonly projects: () => ProjectSessions;
  readonly generator: string;
  readonly script: () => string;
  /** Each build's diagnostics and what was skipped, for the terminal. */
  readonly report: (build: CatalogBuild, workspace: Workspace) => void;
}

export interface PreviewServer {
  /** The address to open, with the route of the file's first diagram for a file. */
  readonly url: string;
  /** How many times the catalog was built. */
  readonly builds: number;
  /** Builds again and tells the open pages to reload. */
  rebuild(changed?: readonly string[]): void;
  close(): Promise<void>;
}

const EVENTS = "/events";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Whether a change under the project root can change the catalog. */
function relevant(root: string, file: string): boolean {
  const path = relative(root, file).split(sep).join("/");
  if (path.split("/").some((part) => part.startsWith(".") || part === "node_modules")) {
    return false;
  }
  return (
    path.endsWith(".meltemi") ||
    path === "project.json" ||
    path === "assets.lock.json" ||
    path.startsWith("assets/") ||
    /\.(svg|png|jpe?g|gif|webp)$/i.test(path)
  );
}

/**
 * Serves the catalog of a project on the loopback interface and builds it again when its files
 * change; open pages reload where they were (decision 0028). Only requests addressed to this
 * machine's names are answered.
 */
export function startPreview(options: PreviewOptions): Promise<PreviewServer> {
  let projects = options.projects();
  const workspaceOf = () =>
    options.isFolder ? projects.forFolder(options.target) : projects.forFile(options.target);
  let workspace = workspaceOf();
  const root = workspace.root;
  let html = "";
  let builds = 0;
  const clients = new Set<ServerResponse>();

  const build = () => {
    const result = buildCatalog(workspace, projects, {
      generator: options.generator,
      script: options.script,
      liveReload: EVENTS,
    });
    html = result.html;
    builds++;
    options.report(result, workspace);
    return result;
  };
  const first = build();

  const rebuild = (changed: readonly string[] = []) => {
    // Settings and assets reach fonts and icons: start again from the files.
    if (changed.some((p) => p === joinPath(root, "project.json") || p.includes("/assets"))) {
      projects = options.projects();
      workspace = workspaceOf();
    } else {
      for (const path of changed) workspace.invalidate(path);
    }
    build();
    for (const client of clients) client.write(`event: reload\ndata: ${builds}\n\n`);
  };

  const serve = (request: IncomingMessage, response: ServerResponse) => {
    const host = (request.headers.host ?? "").replace(/:\d+$/, "");
    if (!LOCAL_HOSTS.has(host)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(`${messages().preview.onlyHere}\n`);
      return;
    }
    const path = (request.url ?? "/").split("?")[0];
    if (request.method !== "GET") {
      response.writeHead(405, { Allow: "GET" });
      response.end();
    } else if (path === EVENTS) {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      });
      response.write("retry: 1000\n\n");
      clients.add(response);
      request.on("close", () => clients.delete(response));
    } else if (path === "/" || path === "/index.html") {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(html);
    } else {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(`${messages().preview.notFound}\n`);
    }
  };

  return new Promise((resolvePromise, reject) => {
    const server = createServer(serve);
    let watcher: FSWatcher | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Set<string>();
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => {
      server.off("error", reject);
      try {
        watcher = watch(root, { recursive: true }, (_event, name) => {
          if (!name) return;
          const file = toProjectPath(joinPath(root, String(name).split(sep).join("/")));
          if (!relevant(root, file)) return;
          pending.add(file);
          clearTimeout(timer);
          timer = setTimeout(() => {
            const changed = [...pending];
            pending.clear();
            rebuild(changed);
          }, 150);
        });
      } catch {
        // Without file watching, the page still serves; rebuild() still works.
      }
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : options.port;
      const firstDiagram = options.isFolder
        ? undefined
        : first.data.entries.find(
            (e) => e.file === relative(root, options.target).split(sep).join("/"),
          );
      const route = firstDiagram
        ? href(
            firstDiagram.kind === "story"
              ? { page: "story", key: firstDiagram.key }
              : { page: "diagram", key: firstDiagram.key, scenario: null, element: null },
          )
        : "";
      resolvePromise({
        url: `http://127.0.0.1:${port}/${route}`,
        get builds() {
          return builds;
        },
        rebuild,
        close: () =>
          new Promise<void>((done) => {
            clearTimeout(timer);
            watcher?.close();
            for (const client of clients) client.end();
            clients.clear();
            server.close(() => done());
          }),
      });
    });
  });
}

/**
 * Opens a URL in the default browser, the way `login` does (`open-url.ts`): the address is one
 * argument of the opener and no shell reads it, so a `&` or a quote in it means nothing (`cmd /c
 * start` ended the command at the first `&`). The preview prints its address first, so an opener
 * that cannot start is not an error here. `open` is replaceable for tests.
 */
export function openInBrowser(url: string, open: (url: string) => Promise<void> = openUrl): void {
  try {
    void open(url).catch(() => undefined);
  } catch {
    // An address that is not a web address: nothing to open.
  }
}

/** Prints the diagnostics of a build as the other commands do. */
export function previewReport(
  print: (path: string, diagnostics: readonly Diagnostic[]) => void,
  stdout: (text: string) => void,
  display: (path: string) => string,
): (build: CatalogBuild) => void {
  return (build) => {
    const t = messages().preview;
    for (const [path, diagnostics] of build.diagnostics) print(display(path), diagnostics);
    for (const entry of build.skipped) {
      stdout(`${t.skipped(`${display(entry.path)}#${entry.id}`, entry.reason)}\n`);
    }
    const diagrams = build.data.entries.filter((e) => e.kind === "diagram").length;
    const stories = build.data.entries.length - diagrams;
    // The machine's clock in English, as before; Spanish writes its own.
    const locale = getLocale();
    const time = new Date().toLocaleTimeString(locale === "en" ? undefined : locale);
    stdout(`${t.built(diagrams, stories, time)}\n`);
  };
}

/** What the preview command needs from the CLI. */
export interface PreviewContext {
  readonly name: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly cwd: string;
  readonly display: (path: string) => string;
  readonly projects: () => ProjectSessions;
  readonly generator: string;
  readonly script: () => string;
  readonly printDiagnostics: (path: string, diagnostics: readonly Diagnostic[]) => void;
}

/** `meltemi-diagrams preview`: runs until stopped; usage errors return 2 at once. */
export function previewCommand(args: readonly string[], context: PreviewContext): number {
  const fail = (message: string) => {
    context.stderr(`${context.name} preview: ${message}\n`);
    return 2;
  };
  let values: { port?: string; open: boolean; help: boolean };
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: [...args],
      options: {
        port: { type: "string" },
        open: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: true,
      strict: true,
    });
    values = parsed.values as typeof values;
    positionals = parsed.positionals;
  } catch (error) {
    return fail(argumentsError(error));
  }
  const t = messages().preview;
  if (values.help) {
    context.stdout(messages().help.preview);
    return 0;
  }
  if (positionals.length > 1) return fail(messages().common.oneProject);
  const port = values.port === undefined ? 4317 : Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) return fail(t.port(values.port));
  const target = toProjectPath(resolve(context.cwd, positionals[0] ?? "."));
  let isFolder: boolean;
  try {
    isFolder = statSync(target).isDirectory();
  } catch {
    return fail(messages().common.pathNotFound(positionals[0] ?? "."));
  }
  startPreview({
    target,
    isFolder,
    port,
    projects: context.projects,
    generator: context.generator,
    script: context.script,
    report: previewReport(context.printDiagnostics, context.stdout, context.display),
  }).then(
    (server) => {
      context.stdout(`${t.serving(server.url)}\n`);
      if (values.open) openInBrowser(server.url);
      process.once("SIGINT", () => {
        void server.close().then(() => process.exit(0));
      });
    },
    (error: NodeJS.ErrnoException) => {
      context.stderr(
        `${context.name} preview: ${
          error.code === "EADDRINUSE" ? t.portInUse(port) : error.message
        }\n`,
      );
      process.exitCode = 2;
    },
  );
  return 0;
}
