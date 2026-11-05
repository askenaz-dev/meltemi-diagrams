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
|        27 | Expired tokens, a wrong audience and insufficient scopes are refused                         | The suite, in part; see below                     |
|        28 | Refresh works and revocation applies as documented                                           | The suite, in part; see below                     |
|        29 | No log holds a secret or a link that grants access                                           | The suite                                         |
|        30 | The whole proof passes on staging and on production, with a controlled test project          | The deploy workflow                               |

Criteria 27 and 28 need, for their full proof, an OAuth access token that a person approved on the
consent page (one past its hour, one of a revoked grant, one with `projects:read` alone, a refresh
token used twice). A script has no person to approve one, so the suite runs what needs nobody:
the challenge, tokens the service never issued, a wrong `resource` refused before consent once the
authorization server is deployed, and a code or a refresh token the server never issued. The rest
is reported skipped, with that reason, in every run; the cloud package's tests cover it in memory,
and the procedure's criterion 1 uses a real grant.

## The suite

`packages/acceptance/src/mcp/run.ts` is an agent built on the official SDK's client
(`@modelcontextprotocol/client` 2.3.1). It connects to the endpoint with the `mdg_` API tokens of
two dedicated test accounts, as Codex does with `bearer_token_env_var`, and runs one named step per
check, each named by its criterion, in the order they build on each other:

```bash
MELTEMI_ORIGIN=https://staging.diagrams.meltemi.dev MELTEMI_TOKEN=… MELTEMI_TOKEN_2=… pnpm acceptance:mcp
```

- `MELTEMI_ORIGIN` is the service's origin (`MELTEMI_MCP_URL`, the endpoint's address, works too).
  A host that does not answer is named, and the run exits 1 before any step.
- `MELTEMI_TOKEN` and `MELTEMI_TOKEN_2` are the two accounts' tokens. The second account must be
  another account, with an email: the first invites it, as a viewer and then an editor, to prove
  criteria 24 and 25, and asks for the first's project as a stranger for criterion 26. Without the
  second token, its steps are reported skipped with the variable's name; without the first, only
  what anybody sees is checked (the metadata documents when the host has them, the `401` challenge
  with `WWW-Authenticate`, `tools/list` refused, a token the service never issued).
  A run never passes silently: every skipped step says why, in the output and in `results.json`.
- Everything a run makes is named `mcp-acceptance-<run>-…` (projects, publications, an invitation's
  address) and deleted at the end; a project of the prefix older than an hour, left by a run that
  was killed, is deleted at the start. Publishing needs a handle: when the first account has none,
  the run gives it `mcp-acceptance-` and six hexadecimal digits, which stays. Once the authorization
  server is deployed, the wrong-resource step registers one public client, which no endpoint
  removes.
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
  code is 1 when a step failed or a line held a secret.

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

## The staging gate

`.github/workflows/deploy.yml` deploys the approved source to staging before production, from
Meltemi Web's Terraform ([its decision 0008](https://github.com/askenaz-dev/meltemi-web/blob/main/docs/decisions/0008-diagrams-staging.md)):
the `staging` environment (branch `main` only) holds the deploy token and, once the owner adds
them, `MELTEMI_TOKEN` and `MELTEMI_TOKEN_2`, and the variables `scripts/deploy-config.mjs
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

Two cases do not hold production back. While the staging hosts are not attached (Meltemi Web
attaches them in the commit after the first staging upload, `staging_deployed`), the host does not
answer: the job says so in a notice and skips the suite. Without the test tokens, the suite runs
what needs none and reports the rest skipped. A failing step with the tokens fails the staging job,
and production is not deployed. A failing step on production fails the workflow after the deploy:
production stays as deployed, and going back is a revert on `main` that passes CI, or a rollback of
the Worker on Cloudflare with the owner ([RELEASING.md](../../RELEASING.md#hosted-deployment)). The
suite runs without the Cloudflare token in its environment, and the tokens are read as secrets only.

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
