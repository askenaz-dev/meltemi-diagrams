// The stylesheet of the service's own pages (the command line's approval page and the authorization
// server's consent page), served at `/cli-auth/style.css`. The token values are a subset of the family's, copied from the identity service's stylesheet (Meltemi Web,
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
:root {
  --on-accent: #ffffff;
  --warn-bg: #fffbeb;
  --warn-border: #f59e0b;
  --warn-text: #78350f;
  --shadow-card: 0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06);
  /* Motion, as the app moves (its --pg-motion tokens): a card rises in, the scopes follow it. */
  --motion-fast: 120ms;
  --motion: 180ms;
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --rise: 6px;
  --stagger: 30ms;
}
@media (prefers-color-scheme: dark) {
  :root {
    --on-accent: #0b1220;
    --warn-bg: #2a2110;
    --warn-border: #b45309;
    --warn-text: #fde68a;
    --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.25);
  }
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
  box-shadow: var(--shadow-card);
  animation: page-in var(--motion) var(--ease) both;
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
.btn {
  transition:
    background-color var(--motion-fast) var(--ease),
    border-color var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease),
    box-shadow var(--motion-fast) var(--ease),
    transform var(--motion-fast) var(--ease);
}
.btn:hover { border-color: var(--focus); }
.btn:active { transform: translateY(1px); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.btn.primary:hover { box-shadow: 0 2px 10px color-mix(in srgb, var(--accent) 35%, transparent); }
.small { font-size: var(--fs-dense); }

/* The consent page of the authorization server: the client, the scopes in words, a warning. */
.consent-title { overflow-wrap: anywhere; }
.client-name { color: var(--accent); }
.client {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin: var(--sp-4) 0;
  padding: var(--sp-3);
  border: 1px solid var(--hair);
  border-radius: var(--radius-panel);
  background: var(--surface-2);
}
.client-mark {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 1.125rem;
  font-weight: 600;
}
.client-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
.section-title {
  margin: var(--sp-4) 0 var(--sp-2);
  color: var(--text-muted);
  font-size: var(--fs-dense);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.scopes {
  margin: 0 0 var(--sp-3);
  padding: 0;
  overflow: hidden;
  list-style: none;
  border: 1px solid var(--hair);
  border-radius: var(--radius-panel);
}
.scope {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-top: 1px solid var(--hair);
  animation: scope-in var(--motion) var(--ease) both;
}
.scope:first-child { border-top: 0; }
.scope:nth-child(2) { animation-delay: calc(var(--stagger) * 1); }
.scope:nth-child(3) { animation-delay: calc(var(--stagger) * 2); }
.scope:nth-child(4) { animation-delay: calc(var(--stagger) * 3); }
.scope:nth-child(5) { animation-delay: calc(var(--stagger) * 4); }
.scope:nth-child(6) { animation-delay: calc(var(--stagger) * 5); }
.scope svg { flex: none; margin-top: 3px; color: var(--accent); }
.scope-text { display: flex; flex-direction: column; gap: 2px; }
.scope-text span { color: var(--text-muted); font-size: var(--fs-dense); }
.callout {
  margin: 0 0 var(--sp-3);
  padding: var(--sp-3);
  border: 1px solid var(--warn-border);
  border-radius: var(--radius-panel);
  background: var(--warn-bg);
  color: var(--warn-text);
}
.callout p { margin: var(--sp-1) 0 0; }
.revoke-note { margin-top: var(--sp-3); }

@keyframes page-in {
  from { opacity: 0; transform: translateY(var(--rise)); }
}
@keyframes scope-in {
  from { opacity: 0; transform: translateY(4px); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;

/** The body of `GET /cli-auth/style.css`. */
export const CLI_AUTH_CSS: string = TOKENS + PAGE;
