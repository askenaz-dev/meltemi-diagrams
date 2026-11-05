# Design: Direct local startup

Use the same three commands in both languages: shallow-clone published tag `v1.11.19` into
`meltemi-local`, enter it and run `docker compose up`. That release contains the Compose file,
Dockerfile and complete build context. The tag is an explicit supported installation version;
it does not claim to track the newest release.

Alternatives: cloning `main` would install changing development sources; an `npx` installer or
prebuilt Docker image would require a new distribution capability. A pinned Git clone provides
the requested copyable path using the existing release.

Place prerequisites before the commands and the literal editor address immediately after them.
Distinguish the agent prerequisite from opening the editor. Existing documentation checks cover
relative links and translation/code parity; verify the commands in a clean installation folder.

No runtime package, public interface, release workflow or generated portal file changes.
