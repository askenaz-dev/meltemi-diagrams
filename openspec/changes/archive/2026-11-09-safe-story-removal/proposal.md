# Safe story removal

## Why

Release review reproduced a data-loss case: a story with a missing closing brace can have a
recovered parser range extending through a later diagram. Removing that range deletes unrelated
source. The owner authorized completing and shipping the authoring changes; this correction is
required before that release.

## What changes

Refuse `removeStory` while the current source has syntax errors, with a stable diagnostic and
English/Spanish feedback. Preserve deletion from syntactically valid source with semantic errors.
Add byte-exact regressions and a corpus refusal case.

## Impact

Shared edit planner, story rejection messages, regression tests and the story-editing contract.
No language, project configuration or deployment changes.
