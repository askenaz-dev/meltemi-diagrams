# Security policy

## Supported versions

| Version | Supported                                 |
| ------- | ----------------------------------------- |
| 1.8.x   | yes: fixes are released as patch versions |
| < 1.8   | no: upgrade to the current minor version  |
| < 1.0   | no: these were never published            |

## Reporting a vulnerability

Report vulnerabilities privately through the repository's security advisories
(**Security › Report a vulnerability**), not in public issues. Include the version, what an
attacker controls (a `.meltemi` file, a project, a plugin, an imported Mermaid or PlantUML file, an
exported page) and what they gain.

The maintainers acknowledge a report within a week, agree on a disclosure date with the reporter,
and publish the fix with an advisory that credits them unless they ask otherwise.

## The safety model

Meltemi Diagrams treats every project and imported file as untrusted. No code from a project runs:
plugins are data with declared permissions, SVG assets are sanitised, paths stay inside the
project, nothing is fetched from the network, sizes are bounded, exported pages carry a strict
content security policy, and errors never show secrets. The details, and what is out of scope, are
in [docs/security.md](docs/security.md).
