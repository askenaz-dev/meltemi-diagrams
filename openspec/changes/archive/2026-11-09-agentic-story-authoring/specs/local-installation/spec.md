## MODIFIED Requirements

### Requirement: Shared MCP transport and local feature policy
Local MCP SHALL keep stateless Streamable HTTP, shared schemas, protocol negotiation, no issued MCP session ID and existing method/body/render/rate limits. Fifteen core tools SHALL operate locally, including read-only compiled story inspection. The thirteen sharing/live-guest/publishing tools SHALL return `local.feature-unavailable` before effects; equivalent HTTP/UI actions SHALL be unavailable.

#### Scenario: Discover capabilities
- **WHEN** the plugin initializes and lists tools
- **THEN** it receives shared schemas and instructions naming enabled local features, with ordinary person-agent room synchronization available

#### Scenario: Unsupported tool or transport input
- **WHEN** a caller invokes a disabled feature, unsupported protocol/method or excessive payload
- **THEN** it receives the corresponding local-feature or shared transport refusal and no project changes
