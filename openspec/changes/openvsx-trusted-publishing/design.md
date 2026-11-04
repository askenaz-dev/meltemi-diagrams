# Design

## Identity boundary

The Open VSX job in `.github/workflows/release.yml` declares `environment: open-vsx` and
`contents: read` / `id-token: write`. The environment permits only `main`. The registry's
GitHub registration names owner `askenaz-dev`, repository `meltemi-diagrams`, workflow filename
`release.yml` and environment `open-vsx`, for extension `meltemi.meltemi-diagrams-vscode`.

The existing CI authorization and artifact preflight remain prerequisites. The environment
adds a registry-matched identity boundary; an arbitrary ref of the workflow cannot use it.
Marketplace keeps its separate registration with an empty environment.

## CLI and recovery

Keep the exact `ovsx@1.3.0` pin, verified against the published CLI help and source. Node 24
satisfies its Node >=22 requirement. Pass `--trusted-publishing` and keep `OVSX_PAT` out of that
step: its presence would take precedence over OIDC. A registration needs an extension with an
active version, so the job first asks the registry's public API whether the VSIX's extension
exists. When it does not, a separate step publishes that first version with `OVSX_PAT`, which
Terraform distributes, and leaves a notice to register the trusted publisher. Any answer other
than found or missing fails the channel. The CLI obtains the GitHub token for the
default Open VSX audience, exchanges it and publishes the already checked VSIX.

An already published version remains a successful retry; authentication or exchange failures
remain failures. Both new deliveries and original-artifact recovery use this same job. No
package interfaces, product source, version calculation or artifact bytes change.

The native `--skip-duplicate` flag replaces the former shell message filter. In the published
CLI's source revision `e0b958f49aa1d19a6284b73d4ec2b4a60f08361e`, `cli/src/publish.ts`
obtains and exchanges the token before entering its duplicate-error catch. That catch accepts
only publication errors ending in `is already published.`; authentication errors still exit 1.

Alternative: retain the bootstrap PAT. Rejected because namespace ownership and active
versions now satisfy trusted publishing's prerequisites. Alternative: leave the environment
empty. Rejected because Open VSX would trust every ref running the registered workflow.

## Verification

`packages/acceptance/test/workflows.test.ts` checks the pinned command, OIDC permission,
dedicated environment, absence of PAT injection and independent/recovery job relationships.
`RELEASING.md` records setup fields and failure/retry behavior. Required repository checks
run before review; production verification follows confirmation of the external registration.

## References

- [Open VSX trusted publishing](https://github.com/eclipse-openvsx/openvsx/wiki/Trusted-Publishing)
- [Published ovsx CLI](https://www.npmjs.com/package/ovsx/v/1.3.0)
- [Granted namespace claim](https://github.com/EclipseFdn/open-vsx.org/issues/15211)
