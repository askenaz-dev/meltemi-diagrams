# Check packaged story inspection before publishing

## Why

The first release of agentic story authoring reached production after successful CI and both
35-step deployment gates. Package publication stopped safely: the installed-CLI release check
still expected two folder MCP tools and rejected the new `inspect_story` tool. The preceding
attempt also encountered a slow hosted-runner package mirror during FFmpeg installation.

## What changes

Use the canonical folder tool catalogue in the installed-package check and exercise story
inspection, including its compiled timeline and source revision, before preview. Bound FFmpeg
installation using the same mirror fallback, retry and timeout settings as CI.

## Impact

Release validation, workflow setup and regressions only. Preserve the reserved version tag and
let a new successful main push allocate the next version through the existing publisher.
