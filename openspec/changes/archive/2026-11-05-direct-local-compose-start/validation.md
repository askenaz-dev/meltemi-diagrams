# Validation: Direct local installation

Verified on 5 November 2026 with Windows PowerShell and Docker Desktop using Linux containers.

- The documented shallow clone of `v1.11.19` succeeded in a new `meltemi-local` folder and
  resolved to source commit `afdc260919a0b3a3997e953db07873dcdfd1772f`.
- `docker compose up` built the image automatically. The default port was already allocated to
  an existing local instance, so startup correctly refused to bind it. The proof then ran the
  same Compose startup with an isolated project name and `MELTEMI_PORT=18879`; the container
  became healthy, `/healthz` reported readiness with a default project, and the editor returned
  HTTP 200. Startup printed the editor address and agent setup prompt. No host Node install or
  manual initialization was used for the installation proof.
- The proof's container, volume, network and image tag were removed afterwards; the existing
  instance remained running on port 8879.
- `pnpm typecheck` and `pnpm lint` passed.
- `pnpm test` passed: 378 files, 11,237 tests passed and one skipped, including the existing
  documentation links and English/Spanish heading/code parity checks.
- `openspec validate direct-local-compose-start --strict` and `git diff --check` passed.
- An independent review found no material accuracy or scope issues.

Evidence is retained outside the repository in
`C:/meltemi/artifacts/direct-local-compose-docs/`: installation proof JSON and Compose/check logs.
Bash commands use the same shell-neutral arguments; the fresh installation was exercised in
PowerShell. This correction does not publish or deploy documentation by itself.
