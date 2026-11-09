# MCP acceptance

The MCP endpoint of the hosted service (change `agent-mcp`, [decision 0072](../decisions/0072-agent-mcp.md))
is accepted against the thirty criteria of section 13 of the owner's specification "MCP for agentic
diagramming". Twenty-five of them are run by a script, `pnpm acceptance:mcp`, on every deploy: first
against staging, which must pass before production is touched, then against production. The others
need the real Codex, and a voice for three of them; they are the procedure below, and a criterion is
marked passed here only with a recorded run beside it, which a test enforces.

## The criteria and what proves each

Criterion 30, the whole proof on staging and on production with a controlled test project, is the
deploy workflow's two runs of the suite with the test accounts' tokens, each with its
`results.json`.

| Criterion | What it asks                                                                                 | Proved by                                         |
| --------: | -------------------------------------------------------------------------------------------- | ------------------------------------------------- |
|         1 | The person registers the MCP address, completes OAuth, and Codex discovers and calls tools   | The procedure                                     |
|         2 | Codex creates a project in the signed-in account and gives its address                       | The suite                                         |
|         3 | At least two diagrams in it, listed, opened and drawn separately                             | The suite                                         |
|         4 | A second project leaves the first's content and permissions as they were                     | The suite                                         |
|         5 | Retrying a creation with the same key makes no duplicate                                     | The suite                                         |
|         6 | The whole flow without the person making folders, pasting code or setting each diagram up    | The suite                                         |
|         7 | In a voice conversation, the person asks for a realistic example in an open diagram          | The procedure                                     |
|         8 | Codex reads the state, changes the right diagram, and the browser shows it without a reload  | The procedure                                     |
|         9 | Codex receives a legible picture of the changed revision and can judge its layout            | The procedure                                     |
|        10 | A person changes a text; Codex's next read holds it                                          | The suite                                         |
|        11 | A write on an old revision is refused without overwriting the person's change                | The suite                                         |
|        12 | The same request retried duplicates no element                                               | The suite                                         |
|        13 | An invalid change is refused without leaving the document half changed                       | The suite                                         |
|        14 | An uploaded image is on the board and in the preview, with consistent resources and fonts    | The suite                                         |
|        15 | If drawing fails after a save, the save is reported and only the drawing is retried          | The suite                                         |
|        16 | An added diagram's address reaches the person, who can focus it in the linked visual session | The suite (the address); the procedure (by voice) |
|        17 | A read link set on request, checked from an independent session                              | The suite                                         |
|        18 | An invitation for a recipient and role, reported as it is, never as an email sent            | The suite                                         |
|        19 | Access changed or withdrawn and checked, including other ways in that stay open              | The suite                                         |
|        20 | A live session started and ended, with its term and scope                                    | The suite                                         |
|        21 | A catalog published on request, its address given and read back                              | The suite                                         |
|        22 | A publication updated or withdrawn without touching other publications or projects           | The suite                                         |
|        23 | Create, draw and share without redundant confirmations from the server                       | The suite                                         |
|        24 | A read-only member cannot edit, create in the project or manage its sharing                  | The suite                                         |
|        25 | An editor gains no owner's power from a wide OAuth scope                                     | The suite                                         |
|        26 | Another account gets no document, file or preview by a guessed id or a cache                 | The suite                                         |
|        27 | Expired tokens, a wrong audience and insufficient scopes are refused                         | The suite (preprovisioned fixtures)               |
|        28 | Refresh works and revocation applies as documented                                           | The suite (preprovisioned fixtures)               |
|        29 | No log holds a secret or a link that grants access                                           | The suite                                         |
|        30 | The whole proof passes on staging and on production, with a controlled test project          | The deploy workflow                               |

Criteria 27 and 28 use isolated fixtures made with the production OAuth provider and its D1 store.
Expired and wrong-resource access credentials are preprovisioned with that provider; narrow and
refreshable grants exchange their authorization codes on the deployed public token endpoint.
The unprivileged suite then checks the deployed MCP endpoint's expiry/resource enforcement,
read-only scopes, two refresh rotations and the provider's previous-token grace, and RFC 7009
revocation of the grant. Reports identify these as preprovisioned fixtures. They do not prove
interactive consent: the real Codex procedure's criterion 1 still requires that separate evidence.

## The suite

The story-authoring step uses a separate run-owned project. It creates a story and its export,
inspects compiled sequential/parallel/transition times, edits timing and scene order, rejects a
stale write while preserving a concurrent human comment and another story, and previews scene
starts and final-state instants at matching revisions. It also proves that deleting a story with
a remaining export is refused atomically, then removes only its own story and export. The run's
unconditional cleanup deletes that fixture project even after an assertion fails. This journey
also runs against a local Worker fixture in unit/integration tests; that is separate evidence
from executing all 35 hosted steps against staging and production.

`packages/acceptance/src/mcp/run.ts` is an agent built on the official SDK's client
(`@modelcontextprotocol/client` 2.3.1). It connects to the endpoint with the `mdg_` API tokens of
two dedicated test accounts, as Codex does with `bearer_token_env_var`, and runs one named step per
check, each named by its criterion, in the order they build on each other:

```bash
MELTEMI_ORIGIN=https://staging.diagrams.meltemi.dev pnpm acceptance:mcp
```

- `MELTEMI_ORIGIN` is the service's origin (`MELTEMI_MCP_URL`, the endpoint's address, works too).
  A host that does not answer is named, and the run exits 1 before any step.
- `MELTEMI_TOKEN` and `MELTEMI_TOKEN_2` are the two accounts' tokens. The second account must be
  another account, with an email: the first invites it, as a viewer and then an editor, to prove
  criteria 24 and 25, and asks for the first's project as a stranger for criterion 26. Without the
  second token, its steps are reported skipped with the variable's name; without the first, only
  what anybody sees is checked (the metadata documents when the host has them, the `401` challenge
  with `WWW-Authenticate`, `tools/list` refused, a token the service never issued).
  Tokens are injected into the process environment from the secret store, never written in a
  command line or the repository. A diagnostic run labels every omitted step in `results.json`.
- `MELTEMI_OAUTH_FIXTURES` names a private, origin-bound manifest made by the separate setup process.
  It must be outside the uploaded results directory. Every credential in it, and every credential
  returned by refresh, is registered for redaction before assertions. A malformed or cross-origin
  manifest fails without echoing its contents.
- `--require-complete` is the hosted delivery gate: exactly 35 passed, zero failed and zero skipped.
  Missing account tokens or fixtures fail before running steps and leave sanitized prerequisite
  evidence. It cannot be combined with `--local` or `--probe`. Cloudflare API credentials must be
  absent from the acceptance process. Without this flag, anonymous and local diagnostics retain
  honest skips and do not claim complete hosted acceptance.
- Everything a run makes is named `mcp-acceptance-<run>-…` (projects, publications, an invitation's
  address) and deleted at the end; a project of the prefix older than an hour, left by a run that
  was killed, is deleted at the start. Publishing needs a handle: when the first account has none,
  the run gives it `mcp-acceptance-` and six hexadecimal digits, which stays. Hosted fixture cleanup
  also removes the four fixture clients/grants and the exact public client registered by the
  wrong-resource step, after checking its run-owned metadata. Diagnostic runs without a fixture
  journal leave that registration because no public endpoint removes one. Registration is limited
  to ten per hour per source address; a hosted rate-limit refusal fails the strict gate.
- Every line the run prints goes through a scan for `mdg_`, a bearer credential, `?invite=`, the
  address that accepts an invitation, `?live=`, `?code=` and the exact values of the tokens and the
  links the run received. A line that holds one is printed redacted and fails the step that wrote
  it, naming the step, and criterion 29's step names them again. `MELTEMI_SERVER_LOG`, a file of the
  Worker's log (the output of `wrangler dev`, say), is scanned too: a line the Worker printed that
  holds one fails the step, while the platform's request lines that carry one in their address are
  counted and reported as a finding. That is the address's shape
  (`POST /api/invitations/<token>/accept`, `/p/<id>?invite=…`), and Cloudflare's invocation logs
  record addresses the same way.
- `results.json` (by default `.test-output/mcp-acceptance/results.json`, or `MELTEMI_RESULTS`) lists
  every step with its criterion, outcome, duration and reason, the server's name and version, the
  protocol revision, the client's version, which tokens were given (never their values) and whether
  the host had an authorization server; `log.txt` beside it is the run's output, redacted. The exit
  code is 1 when a step failed or a line held a secret; hosted strict mode also fails any omission
  or incomplete step count. Fixture provenance is reported separately from interactive consent.

The privileged setup/cleanup CLI is `packages/acceptance/src/mcp/oauth-fixtures-cli.ts`. Setup
requires the selected environment's Cloudflare account/database/deployment credential and both
dedicated account tokens. It verifies both account identities before writing only run-owned OAuth
data. No identity signing key, browser cookie, test authentication route or product OAuth change
is used. The manifest and its registration sidecar are private temporary files, never artifacts.
Cleanup verifies ownership, removes exact records and Connected apps usage, confirms zero
residuals and writes only sanitized counts.

Fixture setup accepts only the two reviewed test identities, checked against SHA-256 subject
fingerprints in the fixture tooling and against the live account/database records. Rotating an
API token for the same account preserves this boundary; changing either account requires review.
On Windows, use a parent directory with a protected ACL granting access only to the current user
and SYSTEM. POSIX mode bits alone do not secure a Windows file. The helper verifies the ACL and
initializes ownership on a newly created empty file before writing any credential.

For an operator-run proof, inject the environment's credentials using the secret store, choose a
private temporary manifest and separate results directories for staging and production, and wrap
these commands so cleanup executes even when setup or acceptance fails. `RUNNER_TEMP` must name a
private, unique directory for this run:

```bash
export MELTEMI_ORIGIN=https://staging.diagrams.meltemi.dev
node --conditions=@meltemi/diagrams-source --import tsx packages/acceptance/src/mcp/oauth-fixtures-cli.ts setup --environment staging --file "$RUNNER_TEMP/mcp-oauth-staging.json"
env CLOUDFLARE_API_TOKEN= CLOUDFLARE_API_KEY= CF_API_TOKEN= CF_API_KEY= \
  MELTEMI_OAUTH_FIXTURES="$RUNNER_TEMP/mcp-oauth-staging.json" \
  MELTEMI_RESULTS=.test-output/mcp-acceptance-staging/results.json \
  pnpm acceptance:mcp --require-complete
node --conditions=@meltemi/diagrams-source --import tsx packages/acceptance/src/mcp/oauth-fixtures-cli.ts cleanup --environment staging --file "$RUNNER_TEMP/mcp-oauth-staging.json" --summary .test-output/mcp-acceptance-staging/oauth-fixture-cleanup.json
```

Run staging first, then production with its own account tokens, database, origin and manifest.
Never run the suite with the deployment credential, upload the manifest, or redeploy an old source
to obtain acceptance evidence. A standalone suite run does not deploy or publish the product.

To run it against the Worker on this computer, with two accounts of your own:

```bash
pnpm playground:build
pnpm cloud:dev-session
pnpm cloud:migrate --local
pnpm --filter @meltemi/diagrams-cloud exec wrangler dev
```

`pnpm cloud:dev-session` prints, for Ana and Ben, the cookie that signs them in on
`http://localhost:8788`; each makes an API token in the page's **API tokens** dialog (the account
menu), or with `POST /api/tokens` and the cookie, and the suite runs with `MELTEMI_ORIGIN=http://localhost:8788` and the
two tokens in the environment, never on a command line that a history keeps.

## Through the local server

`--local` runs the same steps through the command line's local server (change `local-mcp-server`,
[decision 0073](../decisions/0073-local-mcp-server.md)) instead of the endpoint: one built
`mdg mcp` process for each test account, on a free port of `127.0.0.1`, with that account's token in
its own environment only, the target's origin as its host and an empty configuration folder. The
agents connect to the addresses the processes print, with no bearer. The steps of the endpoint's own
door and OAuth server (discovery, the challenge, a foreign token, criteria 27 and 28) are skipped
with their reason, and nothing is asked of `/mcp`; the processes' standard error is written to
`mdg-mcp.log` beside `results.json` and scanned like the Worker's log for criterion 29.

```bash
pnpm --filter "@meltemi/diagrams-cli..." build
MELTEMI_ORIGIN=https://staging.diagrams.meltemi.dev MELTEMI_TOKEN=… MELTEMI_TOKEN_2=… pnpm acceptance:mcp --local
```

Against the Worker on this computer, `packages/cloud/test/browser/mcp-local-run.ts` starts it as
the browser suite does (`wrangler dev` with the test keys), signs two people in, makes a token for
each, runs the suite with `--local` and counts the requests to `/mcp` in the Worker's log, which
must be none:

```bash
pnpm playground:build
pnpm --filter "@meltemi/diagrams-cli..." build
tsx --conditions=@meltemi/diagrams-source packages/cloud/test/browser/mcp-local-run.ts
```

## The staging gate

`.github/workflows/deploy.yml` deploys the approved source to staging before production, from
Meltemi Web's Terraform ([its decision 0008](https://github.com/askenaz-dev/meltemi-web/blob/main/docs/decisions/0008-diagrams-staging.md)):
the `staging` environment (branch `main` only) requires the deploy token,
`MELTEMI_TOKEN` and `MELTEMI_TOKEN_2` through the family's Terraform, and the variables `scripts/deploy-config.mjs
--environment staging` writes into the configurations of `meltemi-diagrams-staging`
(`staging.diagrams.meltemi.dev`) and `meltemi-diagrams-publish-staging` (`staging.meltemi.page`):
the staging database `meltemi-diagrams-staging` (which holds the authorization server's state too),
the bucket `meltemi-diagrams-staging-blobs`, the Store's `FORMS_SECRET_STAGING` and `IDENTITY_EVENTS_SECRET_STAGING`
(`ADMIN_SUBS` and `SPONSORS_WEBHOOK_SECRET` are shared), the staging origin and publish host, and
`PRODUCT_NAME` `diagrams-staging`, the identity service's name for staging.

1. **Staging**: the same checks as production's (the source on `main`, superseded sources skipped
   before any mutation), the migrations on the staging database, both staging Workers, then the
   suite against `https://staging.diagrams.meltemi.dev` with the environment's tokens. Its
   `results.json` and `log.txt` are the artifact `mcp-acceptance-staging`.
2. **Production**, only when staging passed: the deploy as before, then the suite against
   `https://diagrams.meltemi.dev` with production's tokens; the artifact is
   `mcp-acceptance-production`.

Each environment's job prepares isolated OAuth fixtures in a privileged process, runs
`pnpm acceptance:mcp --require-complete` with Cloudflare credentials cleared, then always invokes
privileged cleanup before uploading only sanitized results and cleanup counts. A host that does
not answer, missing prerequisites, an omitted step, a failed assertion or incomplete cleanup fails
staging and prevents production deployment. A production failure fails the workflow after the
deploy: production stays as deployed, and going back is a revert on `main` that passes CI, or a
rollback of the Worker on Cloudflare with the owner
([RELEASING.md](../../RELEASING.md#hosted-deployment)). Superseded sources still skip every deployment
mutation under the existing current-main guard. No release workflow is needed merely to run the
standalone acceptance suite.

## The procedure with Codex

Criteria 1, 7, 8, 9 and the voice half of 16 are proved in the real Codex, with its versions,
permissions and handling of pictures: a server that works in an MCP inspector, or for the SDK's
client, does not prove them. Run it on staging first, then on production, with the first test
account.

**Before**: note the date, the Codex version (`codex --version`) and the surface used (the app, the
IDE extension or the command line, and how the voice reaches it), the server's version (`whoami`
or the suite's `results.json` of the same day) and the configuration used. Create the evidence
folder `docs/quality/mcp-acceptance/<date>-<host>/` (for example
`docs/quality/mcp-acceptance/2026-11-20-staging/`).

**The configuration.** With OAuth, which criterion 1 needs:

```bash
codex mcp add meltemi --url https://staging.diagrams.meltemi.dev/mcp
codex mcp login meltemi
```

`codex mcp login` opens the browser: sign in at `id.meltemi.dev`, read the consent page (the
client's name and each scope in words) and approve. With an API token instead (an `mdg_` token
made in the page's **API tokens** dialog, in `MELTEMI_TOKEN`, never written in the file), in
`~/.codex/config.toml`:

```toml
[mcp_servers.meltemi]
url = "https://staging.diagrams.meltemi.dev/mcp"
bearer_token_env_var = "MELTEMI_TOKEN"
```

The token path does not prove criterion 1, which asks for OAuth; it does prove the others.

**The steps**, each with the evidence to save in the folder:

1. Criterion 1: in Codex, list the MCP servers and their tools (`/mcp`) and ask which Meltemi account
   it is connected to. Pass when the server shows its tools and `whoami` answers the test account.
   Evidence: the consent page, the tools listed, the answer.
2. Ask Codex, by text, to create a project with a flow diagram of a checkout and to give its address;
   open the address in the browser and leave the page open.
3. Criterion 7: by voice, ask Codex to add a realistic example to the open diagram (a payment
   declined and retried, say). Evidence: the voice request as Codex transcribed it.
4. Criterion 8: pass when Codex reads the files first (`read_files` or `get_project`), writes the
   diagram that is open with `ifRevision`, and the open page shows the change without a reload.
   Evidence: the page before and after (the same tab, not reloaded) and the tool calls.
5. Criterion 9: ask Codex to look at the result and judge its layout. Pass when Codex receives the
   `preview` picture and says something true about the drawing (an overlap, a direction, a label
   that does not fit) or acts on it. Write down whether Codex showed the picture or used only the
   report beside it; a client that drops the picture does not pass. Evidence: the picture as Codex
   showed it and its answer.
6. Criterion 16, by voice: ask Codex to add a second diagram to the project and to say where it is.
   Pass when Codex gives the address and the person opens the new diagram from it in the linked
   page (the address opens the project; the diagram is picked in it). Evidence: the answer and the
   page showing the new diagram.
7. End: ask Codex to remove what it made, or delete the project from the app.

Redact before saving: no token, no invitation or live link, no code. Then add the run to the table
below, with the outcome of each criterion, and change the status above for each one that passed.

## Status by criterion

| Criterion | Status  | Recorded run |
| --------: | ------- | ------------ |
|         1 | not run | none         |
|         7 | not run | none         |
|         8 | not run | none         |
|         9 | not run | none         |
|        16 | not run | none         |

A status is `passed`, `failed` or `not run`; `passed` names the date of a recorded run whose
criteria hold it, and whose evidence folder exists.

## Recorded runs

| Date | Host | Codex | Server | Configuration | Passed | Failed | Evidence |
| ---- | ---- | ----- | ------ | ------------- | ------ | ------ | -------- |
