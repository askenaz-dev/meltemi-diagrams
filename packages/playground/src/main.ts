import { setLocale } from "@meltemi/diagrams-i18n";
import { realTimers } from "./cloud/binding.js";
import type { CloudEnvironment } from "./cloud/controller.js";
import type { IdbFactoryLike, KeyValueStore } from "./cloud/persistence.js";
import type { RoomSocket } from "./cloud/room.js";
import { loadSession } from "./cloud/session.js";
import type { ViewEnvironment } from "./cloud/view-page.js";
import { interfaceLocale } from "./language.js";
import { LazyFiles } from "./lazy.js";
import { messages } from "./messages/index.js";
import { Playground } from "./shell.js";
import { loadSettings } from "./store.js";
import { Studio } from "./studio.js";
import { loadTemplates } from "./templates.js";

/** Font files every template measures with; others are fetched when a text needs them. */
const STARTUP_FONTS = [
  "inter-ui/web/Inter-Regular.woff2",
  "inter-ui/web/Inter-Medium.woff2",
  "inter-ui/web/Inter-SemiBold.woff2",
  "inter-ui/web/Inter-Bold.woff2",
  "@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-Regular.woff2",
  "@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-Medium.woff2",
  "@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-SemiBold.woff2",
  "@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-Bold.woff2",
];
/** The bundled assets read when the page starts: Tabler's icons and the built-in libraries. */
const ASSET_FILES = [
  "tabler/package.json",
  "tabler/tabler-nodes-outline.json",
  "tabler/tabler-nodes-filled.json",
  "icons/index.json",
  "libraries/tech.json",
];

/**
 * The interface language, before anything is drawn: the language setting, else the browser's. The
 * canvas and the editor's words read it through the same module, so the whole page speaks it.
 */
function chooseLanguage(): void {
  const locale = interfaceLocale(loadSettings().language, navigator.language);
  setLocale(locale);
  document.documentElement.lang = locale;
  const page = messages().page;
  document.title = page.title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", page.description);
  const boot = document.querySelector("#playground > .boot");
  if (boot) boot.textContent = page.loading;
}

/** A browser object that may be missing or refused (private windows, blocked site data), or nothing. */
function optional<T>(read: () => T | null | undefined): T | undefined {
  try {
    return read() ?? undefined;
  } catch {
    return undefined;
  }
}

/** What the cloud projects use of the browser; the page gives it only to a person who is signed in. */
function cloudEnvironment(): CloudEnvironment {
  return {
    fetch: (input, init) => fetch(input, init),
    socket: (url) => new WebSocket(url) as unknown as RoomSocket,
    indexedDB: optional(() => window.indexedDB as unknown as IdbFactoryLike),
    storage: optional<KeyValueStore>(() => window.localStorage),
    online: () => navigator.onLine,
    timers: realTimers,
    location: {
      href: () => location.href,
      replace: (url) => history.replaceState(null, "", url),
    },
  };
}

/**
 * What opening a project by its link needs of the browser, for a person signed in or not: the page's
 * calls, its clock and its address bar. Nothing is asked of the service until an address names a
 * project, so a page with no `?project` has no trace of it.
 */
function viewEnvironment(): ViewEnvironment {
  return {
    fetch: (input, init) => fetch(input, init),
    timers: realTimers,
    location: {
      href: () => location.href,
      replace: (url) => history.replaceState(null, "", url),
    },
  };
}

async function start(): Promise<void> {
  const root = document.getElementById("playground")!;
  const page = location.href.replace(/#.*$/, "");
  const base = new URL(".", page).href;
  const fonts = new LazyFiles(`${base}assets/fonts/`);
  const assets = new LazyFiles(`${base}assets/`);
  // The layout engine is a chunk of its own, fetched while the rest loads.
  const elk = import("elkjs/lib/elk-worker.min.js");
  // Who is signed in is asked once, beside the rest: any way it fails is nobody, and the page is
  // then what it has always been.
  const [templates, elkModule, session] = await Promise.all([
    loadTemplates(`${base}templates.json`),
    elk,
    loadSession(fetch, location, PLAYGROUND_IDENTITY),
    fonts.load(STARTUP_FONTS),
    assets.load(ASSET_FILES),
  ]);
  const studio = new Studio({
    toolVersion: __PLAYGROUND_VERSION__,
    fonts,
    assets,
    elk: () => elkModule.default,
  });
  const playground = new Playground(root, studio, {
    version: __PLAYGROUND_VERSION__,
    templates,
    fonts,
    assets,
    page,
    session,
    view: viewEnvironment(),
    // Cloud projects are for a person signed in; nobody else gets any of their machinery.
    ...(session.kind === "cookie" ? { cloud: cloudEnvironment() } : {}),
  });
  await playground.start();
  // For tests and the curious: the page's parts, read-only by convention.
  (window as unknown as { meltemiPlayground?: unknown }).meltemiPlayground = playground;
}

chooseLanguage();
start().catch((error: unknown) => {
  const root = document.getElementById("playground");
  if (root) {
    root.classList.remove("loading");
    root.textContent = messages().page.failed(
      error instanceof Error ? error.message : String(error),
    );
  }
  console.error(error);
});
