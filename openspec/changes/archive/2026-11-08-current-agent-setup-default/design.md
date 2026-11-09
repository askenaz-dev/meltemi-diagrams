# Setup defaults

Update `packages/cli/agent-setup/prompt.md`, the English and Spanish setup HTML, and
`docs/agents.md` and `docs/es/agents.md`. The public command remains
`npx @meltemi/diagrams-cli@latest skill install --agent <names>`.

Default to the agent running the conversation, with explicit examples for Codex and Claude Code
and `agents` for an unnamed compatible client. Only an explicit request adds other agents. Use
the selected project's root; a container with several repositories and no selected project is a
real ambiguity. Existing usable skill copies are read instead of replaced. Choose a real flow
or the supplied sequence template, use unused output filenames, and continue through validation
and SVG export. Missing prerequisites and decisions requiring broader permissions remain gates.

Choosing every detected agent would preserve the interruption's broad scope and introduce
unnecessary destinations. Choosing only the current agent is the requested, predictable default.
There are no unresolved choices.

Existing prompt, parity and command tests plus a playground build verify the packaged text,
documentation consistency and hosted copy. No runtime API changes are required.
