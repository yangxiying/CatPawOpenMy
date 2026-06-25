## ADDED Requirements

### Requirement: NBY-XMYAE decoding
The system SHALL decode the NBY-XMYAE URL format used by certain video sources, extracting the real play URL and decryption key.

#### Scenario: NBY decode success
- **WHEN** play endpoint receives id starting with "NBY-XMYAE" or similar encoding prefix
- **THEN** decoder extracts and decrypts the embedded real URL using the embedded key/IV
- **THEN** returns standard `{parse: 0, url, header}` response

#### Scenario: NBY decode failure
- **WHEN** decoded result is empty or malformed
- **THEN** falls through to direct URL return

### Requirement: jqq- format API resolution
The system SHALL resolve jqq- prefixed IDs by calling the juquanquanapp.com API with device-specific headers.

#### Scenario: jqq- resolution
- **WHEN** play endpoint receives id starting with "jqq-"
- **THEN** extracts dramaId/episodeSid from the encoded id
- **THEN** calls juquanquanapp.com API with cached device headers
- **THEN** returns the playInfo.url from the response

### Requirement: Parser chain for commercial sites
The play endpoint SHALL support a configurable parser chain for URLs from youku/iqiyi/v.qq.com/pptv/mgtv etc., trying each parser in order until one returns a valid URL.

#### Scenario: Parser chain fallthrough
- **WHEN** a video URL matches the commercial site pattern
- **THEN** system iterates through available parser URLs
- **THEN** returns the first valid result with header and parse=0

#### Scenario: Parser chain exhaustion
- **WHEN** all parsers fail to return a URL
- **THEN** falls through to direct URL return
