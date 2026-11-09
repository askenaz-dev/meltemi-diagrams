## ADDED Requirements

### Requirement: Packaged story inspection gate

The installed-CLI release check SHALL verify the complete canonical folder MCP tool catalogue
and call `inspect_story` on the generated purchase project before preview. It SHALL reject an
absent inspection tool, an invalid compiled timeline or a missing source revision.

#### Scenario: Installed story inspection succeeds

- **WHEN** the release check installs the CLI from the checked tarballs
- **THEN** its MCP server exposes the canonical folder tools and returns a compiled purchase
  story timeline with a source revision before the preview check runs

#### Scenario: Incomplete installed server fails the gate

- **WHEN** the installed server omits story inspection or returns an invalid timeline report
- **THEN** the release check fails before uploading a checked release artifact

### Requirement: Bounded release media setup

Release FFmpeg setup SHALL preserve the checked-artifact recovery condition, use the CI mirror
fallback, limit acquisition to two retries with thirty-second HTTP and HTTPS timeouts, and have
a ten-minute step timeout.

#### Scenario: Slow runner package mirror

- **WHEN** a fresh release runner installs FFmpeg
- **THEN** it replaces the degraded Azure Ubuntu mirror, uses bounded acquisitions, and cannot
  leave the installation step running beyond ten minutes
