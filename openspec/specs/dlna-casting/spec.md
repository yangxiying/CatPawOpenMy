# dlna-casting Specification

## Purpose
TBD - created by archiving change miraplay-feature-parity. Update Purpose after archive.
## Requirements
### Requirement: SSDP device discovery
The system SHALL discover UPnP/DLNA Media Renderer devices on the local network via SSDP M-SEARCH multicast.

#### Scenario: Device discovered
- **WHEN** user opens DLNA casting panel
- **THEN** system sends SSDP M-SEARCH to 239.255.255.250:1900
- **THEN** displays discovered DMR devices with friendlyName and icon

#### Scenario: No devices found
- **WHEN** no DMR device responds within 5 seconds
- **THEN** displays "未发现投屏设备" message with retry button

### Requirement: DLNA playback control
The system SHALL send SetAVTransportURI SOAP command to selected DMR device to initiate playback.

#### Scenario: Push URL to device
- **WHEN** user selects a discovered DMR device
- **THEN** system sends SOAP SetAVTransportURI with CurrentURI = video URL
- **THEN** sends Play command to start playback on the device

#### Scenario: UPnP service discovery
- **WHEN** connecting to a DMR device
- **THEN** system parses device description XML for AVTransport/RenderingControl/ConnectionManager service URLs

### Requirement: DLNA service lifecycle
The system SHALL manage the DLNA session lifecycle: connect → SetURI → Play → Stop → disconnect.

#### Scenario: Stop casting
- **WHEN** user taps "停止投屏"
- **THEN** system sends STOP command to the DMR device

#### Scenario: Session cleanup
- **WHEN** casting session ends or app backgrounds
- **THEN** system cleans up SSDP listeners and SOAP connections

