import { CanvasApp, type PersistedState } from "@meltemi/diagrams-canvas";
import type { HostMessage } from "@meltemi/diagrams-editor/canvas";
import { resolveLocale, setLocale } from "@meltemi/diagrams-i18n";

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

// The extension writes the interface language in the page's `lang`; the canvas speaks it.
setLocale(resolveLocale(document.documentElement.lang));
const api = acquireVsCodeApi();
const app = new CanvasApp(
  document.getElementById("app")!,
  {
    post: (message) => api.postMessage(message),
    getState: () => api.getState() as PersistedState | undefined,
    setState: (state) => api.setState(state),
  },
  /mac/i.test(navigator.platform),
);
window.addEventListener("message", (event: MessageEvent<HostMessage>) => app.receive(event.data));
