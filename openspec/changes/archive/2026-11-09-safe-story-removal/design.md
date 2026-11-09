# Design

Parser recovery is useful for diagnostics but cannot prove a safe deletion boundary when braces
are missing. Reject before looking up the story or constructing its dependent-export deletion.
Check parser errors rather than all compilation errors so removing a story can still repair
semantic problems. Both cascade modes use the same guard.

Reuse `edit.unsafe-target` and localized source-repair feedback. Test LF and CRLF source with a
later diagram, require no edit plan on refusal, and retain a valid-syntax/invalid-reference case.
