# hls-proxy Specification

## Purpose
TBD - created by archiving change miraplay-feature-parity. Update Purpose after archive.
## Requirements
### Requirement: HLS proxy endpoint
The Node.js server SHALL provide `GET /proxy/hls/{encodedUrl}/.m3u8` that fetches and proxies a remote HLS playlist locally.

#### Scenario: M3U8 playlist proxied
- **WHEN** player requests `/proxy/hls/{encoded-remote-url}/.m3u8`
- **THEN** Node.js fetches the remote .m3u8, rewrites TS segment URLs to local proxy paths, and returns the modified playlist

#### Scenario: TS segment proxied
- **WHEN** player requests a proxied .ts segment URL
- **THEN** server fetches the remote segment and streams it back with correct Content-Type

### Requirement: Header forwarding to proxy requests
The proxy SHALL forward necessary headers (User-Agent, Referer, Cookie) from the original sniffed response to upstream HLS requests.

#### Scenario: Custom headers on upstream fetch
- **WHEN** proxy fetch is made upstream
- **THEN** custom User-Agent and Referer from the sniff response are included in request headers

### Requirement: Minimal encoding of original URL
The encoded URL in the proxy path SHALL be URL-encoded to prevent parsing conflicts with the m3u8 path suffix.

#### Scenario: URL encoded correctly
- **WHEN** original URL contains special characters (?, &, #)
- **THEN** `encodeURIComponent` is applied before embedding in proxy path

