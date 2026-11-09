# Source navigation wording

Change only the `showInText` values in `packages/canvas/src/messages/en.ts` and `es.ts`.
Keeping the internal key and `focusText` event means every shared context menu in the browser and
VS Code keeps the same source navigation, selection and read-only behavior.

Update the existing webview menu assertions, the playground's folded-code navigation test and
current shell comment, and both editor guides. The public labels become "Go to code" and
"Ir al código"; historical decision notes keep the wording they recorded.

The person's suggested "Go to code" describes navigation more precisely than "Show text", which
could mean exposing a diagram label. There are no unresolved choices.

Run the repository's typecheck, lint, unit, playground, webview, VS Code and VSIX checks. Existing
navigation tests verify the source focus behavior; no new behavior or tests are needed.
