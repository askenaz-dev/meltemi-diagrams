# Validation

Run on 4 November 2026 on Windows 11 in the worktree of branch `unbranded-by-donation`, from
`origin/main` at `c291eda`. Browsers: the suites' headless Microsoft Edge 156.

## Gates

| Check                                              | Result                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck`                                   | green                                                                                                                    |
| `pnpm lint`                                        | green (ESLint and Prettier)                                                                                              |
| `pnpm test`                                        | 337 files, 10052 passed, 1 skipped                                                                                       |
| `pnpm playground:test-browser`                     | 109 passed, 1 failed (`explorer: lists folders and diagrams, picks a view, marks problems…`, a badge counted 7 for 1)    |
| the same test alone, with the nine donation tests  | 10 passed, 0 failed                                                                                                      |
| `pnpm cloud:test-browser`                          | 101 passed, 1 failed (`collaboration: a socket the Worker cuts reconnects and merges…`), the new donation scenario passed |
| that scenario alone, on this branch, twice         | failed both times, "Timed out waiting: the connection to leave connected or saving"                                       |
| that scenario alone, on `origin/main` (`c291eda`)  | failed the same way: it fails on this machine before the change                                                          |
| `openspec validate "unbranded-by-donation" --strict` | valid                                                                                                                  |

The explorer test types a line into the code pane and reads the file's problem badge once the
analysis has caught up; under the load of the whole suite the badge was read while the typed line
was still half there (seven problems for one). Alone it passes; nothing of it touches this change.
The cloud suite's reconnect scenario, one of the scenarios known to be flaky under load, fails on
this Windows machine on `origin/main` as on this branch, alone as in the whole run; the first full
run of this branch also failed six scenarios that compared the session answer exactly, before they
learned `support` (the run configures a sponsored account) and `unbrandedBy`, and passed after.

## Evidence by task

- 1.1: `packages/cloud/test/store/conformance-sponsorships.ts`, run over `memoryStore()` and
  `d1Store()` on node:sqlite (bare and with a round trip before every statement): a record, a
  repeated delivery id refused, the newest sponsorship of a login and kind updated ignoring case and
  a cancellation kept, the earliest unclaimed one found and never an organisation's, a claim of
  every unclaimed row with its grant and log in one step, a second claim refused (also in the same
  instant, and two racing claims of which one wins), a claim of a cancelled sponsorship, the grant
  kept after a cancellation, and cleared claims (by `clearClaims` and by `applyUserDeleted`).
  `migration-sponsorships.test.ts` checks 0007 (one table, two indexes, ASCII, the checks, NOCASE,
  applied over the six before). `d1.test.ts` pins the deletion's batch (eighteen writes) and runs
  every new statement through the audit that no value is pasted into SQL.
- 1.2: `packages/cloud/test/sponsors.test.ts` (52 tests): GitHub's documented test vector for the
  HMAC (through `verifyHmacHex` over bytes, and through the route), a signed `created`, a changed
  body refused without `JSON.parse` seeing it, six wrong signatures, a repeat, another sponsorable,
  a `ping` and another event, the sponsorable's case, thirteen missing or malformed fields, no
  delivery id, a body that is not an object, `415` for a form body, the 64 KiB cap at the byte, the
  later actions (and `constructor`, `__proto__`, `toString` as actions ignored), `404` without the
  variable or with one that is not a login, `500` with a blank secret, a spying `console` that sees
  no login, body or secret, and no `Origin` rule. `config.test.ts` checks `/_sponsors/*`, the
  fourth Store binding, `SPONSORS_ACCOUNT` shipped empty and its reading; `audit.test.ts` the
  Origin rule's three exceptions.
- 2.1: the claim through `GET /api/account/identity` with the harness's identity stand-in: Ana's
  claim (`claimed: true`, the session's `unbrandedBy`, the row, the log entry and the holder), the
  next opening claiming nothing, Ben refused after Ana, Google only then GitHub linked, cancelled
  before and after the claim, nothing without a sponsored account, a failing store answered with
  the sign-ins, a revocation by hand, and a deletion event that frees the row for another account.
- 2.2: the session answer's `support` in the three shapes and `unbrandedBy` for a sponsor, a grant
  by an administrator and an owner; nothing without the variable; the administration answer's
  sponsorships, the newest first, with `claimedBy`, and `404` for anyone else.
  `entitlements.test.ts`, `administration.test.ts`, `audit.test.ts` and `tokens.test.ts` take the
  new shape.
- 2.3, 3.3: `packages/acceptance/test/docs.test.ts` and the error tables' check in `audit.test.ts`
  are green; the JSON examples are the tests' answers.
- 3.1: `session.test.ts` reads `support` (an `https:` address without credentials only, ten
  hostile values) and `unbrandedBy`; the browser suite covers the line, its link's `href`,
  `target="_blank"` and `rel="noopener"`, its hint and the screen reader's words, its place under
  Theme, no box, an SVG with the strip, three hostile supports, the entitled and anonymous cases and
  the Spanish words. Screenshots: `export-donation-light.png`, `export-donation-dark.png`.
- 3.2: `account-panel-model.test.ts` (the claim told once, not after closing, `claimed` read
  strictly) and `administration.test.ts` (the sponsorships read, amounts in both languages, the log
  sentence "GitHub Sponsors granted Export without the Meltemi branding to Ana (ana)" and its
  Spanish); the browser suite covers the Google-only Profile and Open Sign-ins, the claim without a
  reload followed by the export dialog's box, the Sponsorships part after Permissions with Grant by
  hand's placeholder and focus, and no part without sponsorships. Screenshots:
  `account-support-google.png`, `account-donation-thanks.png`,
  `account-administration-sponsorships.png`. The cloud suite's new scenario does it against the
  real Worker: a delivery signed with the run's secret (and one refused), the line, the claim on
  opening the panel, the box, and the owner's answer naming the claim.
- 5.1: the changelog's entry is under `## Next`; decision 0071 extends 0061 and 0068, whose status
  lines say "Extended by 0071".

## Not done here

- 4.1 is Meltemi Web's pull request (the secret and the site's link).
- 4.2 is the owner's: the checklist is in `docs/cloud.md`, "Sponsorships".
