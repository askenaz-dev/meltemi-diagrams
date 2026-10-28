# Sharing in the cloud (only when the person asks)

A project can mirror itself in the optional Meltemi cloud service, to open it in the browser, share
it or publish its catalog as a web page. These commands need a signed-in person and change things
outside the repository, so run them only when asked, and never add `--force` unasked.

- `pnpm mdg login` opens the person's browser to approve the request (`--no-browser` prints the
  address); `logout` revokes the token and `whoami` says who it is for. In CI the token is
  `MELTEMI_TOKEN`. Exit code 3 means "run `login`".
- `pnpm mdg push <folder> --create` makes the cloud project and records it in `project.json`
  (`cloud`). Later `push <folder>` lists what differs by path and by id and asks. `push --check`
  writes nothing and exits 1 when the cloud differs, so it is safe to run.
- `pnpm mdg pull [<id>] [folder]` brings the cloud's files into the folder (files that differ are
  kept unless `--force`); `pnpm mdg review <folder> --base cloud` lists what differs by id.
- `pnpm mdg publish <folder> --slug name` makes the catalog a public web page, so only on request;
  `--unpublish` takes it down. `pnpm mdg projects --json` lists the person's cloud projects.

Never print, read or copy a token (`mdg_…`): it lives in `MELTEMI_TOKEN` or in the credentials file
that `login` keeps, and belongs in no command line, file or commit. `docs/cli.md` has the details.
