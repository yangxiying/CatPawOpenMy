# play-spider Specification

## Purpose
TBD - created by archiving change miraplay-feature-parity. Update Purpose after archive.
## Requirements
### Requirement: Play endpoint resolution chain
The spider play endpoint SHALL implement a multi-strategy URL resolution chain: direct m3u8 → sniff via WebView → parser chain → NBY decode → direct pass-through.

#### Scenario: Resolution order
- **WHEN** play endpoint is called with id
- **THEN** checks for encoding prefix first (NBY-, jqq-, etc.)
- **THEN** if not encoded, checks if id contains .m3u8 → direct proxy
- **THEN** if no .m3u8, sends sniff request to native layer
- **THEN** if sniff fails, falls back to direct return of original URL

#### Scenario: Response format
- **WHEN** play endpoint resolves a URL
- **THEN** always returns `{parse: 0, url, header?}`
- **WHEN** URL is HLS
- **THEN** url is rewritten as local proxy path `/proxy/hls/{encodedUrl}/.m3u8`

