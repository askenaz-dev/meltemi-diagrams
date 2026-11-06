# One prompt copy control

## Decision

Wrap only the setup prompt's existing `pre > code` block, placing an icon button at its upper
right. The HTML contains the localized accessible name, copied confirmation and failure text.
The module enhances the button after binding its handler; without JavaScript the prompt remains
readable and selectable and the inactive button stays hidden.

`src/agent-setup-copy.ts` reuses `src/cloud/clipboard.ts` and is built independently as
`agent-setup/copy-prompt.js`, without the editor or sea runtime. The two static pages load it
with relative module URLs. Their policy adds only `script-src 'self'`; inline scripts, network
connections, forms and foreign resources remain forbidden.

## Interaction

The button copies the code element's exact text. Success shows a check icon, updates its
accessible name/tooltip and announces a localized status, restoring its copy state afterward.
Repeated clicks clear the prior reset timer. A pending operation cannot race another one and
keeps keyboard focus. Failure selects the prompt for manual copying and displays instructions;
it never reports success or throws an unhandled clipboard rejection.

## Modules

The agent setup templates/CSS, standalone copy module, build and setup policy change. Existing
unit checks continue enforcing prompt/doc parity and a single approved script. Browser checks
cover the actual clipboard, keyboard, denial/retry, narrow layouts, themes and no-JavaScript access.
No prompt or MCP configuration is edited.
