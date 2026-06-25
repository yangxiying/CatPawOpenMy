## ADDED Requirements

### Requirement: URL sniffing via WebView
The system SHALL load a non-m3u8 video page URL in a hidden WebView, execute JS to extract the real .m3u8 stream URL, and return it along with required headers.

#### Scenario: Successful sniff
- **WHEN** play endpoint receives a URL not ending in .m3u8
- **THEN** Node.js sends `{action: 'sniff', url, timeout, rule}` message to native layer
- **THEN** native layer loads URL in WKWebView, extracts matching URL via regex rule
- **THEN** response includes `{url, headers}` containing the sniffed m3u8 and any User-Agent/Referer

#### Scenario: Sniff timeout
- **WHEN** WebView fails to find matching URL within timeout (default 10s)
- **THEN** returns null/empty, play endpoint falls through to next resolution strategy

### Requirement: Sniff rule customization
The sniff request SHALL accept a configurable regex rule string for flexible URL pattern matching.

#### Scenario: Custom rule passed
- **WHEN** sniff message includes `rule: 'http((?!http).){12,}?\\.m3u8(?!\\?)'`
- **THEN** only URLs matching this pattern are returned

### Requirement: Header propagation
Sniffed headers SHALL be returned and applied to subsequent HLS playback requests.

#### Scenario: Headers included in response
- **WHEN** sniffed URL has associated User-Agent and Referer headers
- **THEN** response includes these headers which are passed to subsequent play requests
