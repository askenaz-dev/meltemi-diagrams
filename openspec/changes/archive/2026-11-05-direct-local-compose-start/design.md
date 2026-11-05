# Design: Direct local startup

Resolve GitHub's published `latest` release at installation time, shallow-clone its exact tag into
`meltemi-local`, enter it and run `docker compose up`. Both languages provide matching Bash and
PowerShell blocks. The guide contains no hard-coded version number.

Bash follows the public `releases/latest` redirect with curl and extracts the final URL's tag;
PowerShell uses its built-in JSON reader on the public latest-release API. Neither needs Node,
jq or GitHub CLI. Failed resolution/clone must stop before starting Compose. GitHub's latest
excludes drafts and prereleases. Do not sort Git tags: delivery reserves them before publishing.

Alternatives: a fixed tag makes instructions stale; cloning `main` installs development sources;
an `npx` installer or prebuilt Docker image requires a new distribution capability.

Place prerequisites before the commands and the literal editor address immediately after them.
Distinguish the agent prerequisite from opening the editor. Existing documentation checks cover
relative links and translation/code parity; verify the commands in a clean installation folder.

`RELEASING.md` records the future stable/preview track boundary. The current workflow publishes
full releases from approved main pushes; a future delivery change must define preview naming,
registry channels and stable promotion while preserving automatic releases per main push.

No runtime package, public interface, release workflow or generated portal file changes.
