// The stylesheet of the command line's approval page, served at `/cli-auth/style.css`. The token
// values are a subset of the family's, copied from the identity service's stylesheet (Meltemi Web,
// `packages/identity/src/pages/css.ts`), which copies the site's `tokens.css`. Do not edit a token
// value here: change it with the family. The page's policy allows styles and images from its own
// origin only, so nothing in this file may name another address.

/** Where the stylesheet is served: the pages link it, and the handler routes it. */
export const CLI_AUTH_CSS_PATH = "/cli-auth/style.css";

const TOKENS = `/* SPDX-License-Identifier: Apache-2.0 */
:root {
  --bg: #f8fafc;
  --surface: #ffffff;
  --surface-2: #eef2f7;
  --hair: #e2e8f0;
  --text: #0f172a;
  --text-muted: #475569;
  --border: #cbd5e1;
  --accent: #2563eb;
  --focus: #1d4ed8;
  --font-ui: "Inter", "Segoe UI", "SF Pro Text", Roboto, system-ui, sans-serif;
  --font-mono: "Cascadia Mono", "SF Mono", "JetBrains Mono", Consolas, monospace;
  --fs-dense: 0.8125rem;
  --fs-body: 0.875rem;
  --fs-view: 1.25rem;
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-6: 24px;
  --touch-min: 44px;
  --radius-control: 4px;
  --radius-panel: 8px;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0b1220;
    --surface: #111a2e;
    --surface-2: #1a2540;
    --hair: #1a2540;
    --text: #e2e8f0;
    --text-muted: #94a3b8;
    --border: #2c3a57;
    --accent: #60a5fa;
    --focus: #22d3ee;
  }
}
`;

// The text on the accent colour flips with the scheme: white on the light accent, the page's own
// background on the lighter dark-mode accent, so the button keeps its contrast in both.
const PAGE = `
:root { --on-accent: #ffffff; }
@media (prefers-color-scheme: dark) {
  :root { --on-accent: #0b1220; }
}
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-6) var(--sp-4);
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: var(--fs-body);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
.card {
  width: min(520px, 100%);
  padding: var(--sp-6);
  background: var(--surface);
  border: 1px solid var(--hair);
  border-radius: var(--radius-panel);
}
.brand { margin: 0 0 var(--sp-3); font-weight: 600; letter-spacing: 0.01em; color: var(--text-muted); }
h1 { margin: 0 0 var(--sp-3); font-size: var(--fs-view); line-height: 1.25; }
p { margin: 0 0 var(--sp-3); }
form { margin: 0; }
a { color: var(--accent); }
a:focus-visible, button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
code { font-family: var(--font-mono); font-size: var(--fs-dense); }
.muted { color: var(--text-muted); }
.code { color: var(--text-muted); font-size: var(--fs-dense); }
.check-line { margin-top: var(--sp-4); }
.check {
  display: inline-block;
  padding: var(--sp-1) var(--sp-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface-2);
  color: var(--text);
  font-size: var(--fs-view);
  font-weight: 600;
  letter-spacing: 0.25em;
}
.actions { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-4); }
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--touch-min);
  padding: 0 var(--sp-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: var(--fs-dense);
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
}
.btn:hover { border-color: var(--focus); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
`;

/** The body of `GET /cli-auth/style.css`. */
export const CLI_AUTH_CSS: string = TOKENS + PAGE;
