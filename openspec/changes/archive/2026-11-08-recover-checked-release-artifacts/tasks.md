## 1. Implementation

- [x] 1.1 Record the production failure and the bounded recovery design before code changes.
- [x] 1.2 Implement validated original-artifact recovery and shared publication preflight.
- [x] 1.3 Add regression fixtures, workflow guards and release/incident documentation.

## 2. Verification

- [x] 2.1 Run focused tests, typecheck, lint and strict OpenSpec validation.
- [x] 2.2 Pass complete PR CI and verify 1.10.18 remains intact before integrating this fix.
- [x] 2.3 Verify the new main release and recover a complete existing release with unchanged hashes.

## Local verification on 2026-11-03

- Full typecheck and lint passed. Full unit suite: 333 files, 9,934 passed and one skipped.
- Final focused run including the real historical manifest fixture: 69 passed across recovery,
  publication, workflow and versioning tests. Strict OpenSpec validation passed.
- Independent review checked authorization, exact attempt selection, archive/path integrity,
  package identities and independence of fresh channels; its two findings were fixed with tests.
- Both downloaded production 1.10.17 artifacts were exercised against the new preflight, using
  the recorded registry hashes: original bytes reject the existing assist package mismatch;
  rebuilt bytes reject the published GitHub manifest mismatch. Neither test attempted publication.
- Historical measurement: 18 npm packages exist, render is absent, ten npm tarballs differ from
  the original manifest. All package content differences are dependency key ordering; parsed
  JSON and executable content are identical. The immutable versions/assets were preserved.

## Production verification on 2026-11-03

The run numbers below belong to the repository before its recreation on 2026-11-04.

- The fix was integrated after complete PR CI, with 1.10.18 untouched; main then released
  1.10.19 (CI run 41702203078, release run 41704004624).
- Recovery run 41705905089 published 1.10.18 again from its original release run 41698236010
  without rebuilding. All six jobs passed, the 19 npm packages verified, the three GitHub assets
  kept their SHA-256 digests and `latest` stayed 1.10.19.
