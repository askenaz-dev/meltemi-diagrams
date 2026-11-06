## Why

The English and Spanish SVG guides still say that SVG is the only export format and introduce
only flow/free diagrams, despite the delivered CLI supporting more formats and all five profiles.
This post-1.0 documentation correction is outside the original roadmap.

Remote verification also exposed a hosted-runner installation problem: the Ubuntu Azure mirror
downloaded FFmpeg prerequisites so slowly that no browser test started in more than twenty
minutes. The same PR includes a separate CI-only recovery commit.

## What Changes

- State SVG is the default and `--format svg` selects it explicitly.
- Include flow, free, sequence, C4 and Gantt in the introduction and link the general export guide
  for other formats and their tool requirements.
- Keep the working example, options, diagnostics and detailed SVG reference unchanged.
- Install the mandatory browser prerequisite through the official Ubuntu archive, with bounded
  APT retries/network waits and a ten-minute installation-step backstop.

## Capabilities

### Modified Capabilities

- `current-user-documentation`: verify the SVG introduction/options against the delivered CLI.

The CI bootstrap adjustment changes no product capability or public interface.

## Non-goals

Exporter and format behaviour remains with the delivered `export-png-pdf`, `export-video-gif`,
`sequence-profile` and `gantt-diagrams` implementation changes.
