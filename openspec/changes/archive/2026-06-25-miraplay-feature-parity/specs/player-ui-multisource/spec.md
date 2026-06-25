## ADDED Requirements

### Requirement: Quality selection UI
The player SHALL display available quality options as chips/buttons overlaying the video, supporting tap to switch.

#### Scenario: Multiple qualities shown
- **WHEN** play response returns multiple quality labels (e.g., "4K", "HD", "标清")
- **THEN** UI shows selectable chips in the player control overlay

#### Scenario: Quality switch reloads video
- **WHEN** user taps a different quality chip
- **THEN** player reloads the new URL at that quality

### Requirement: Playback speed control
The player SHALL support speed adjustment from 0.5x to 3.0x with long-press speed panel.

#### Scenario: Speed cycling
- **WHEN** user taps speed button
- **THEN** speed cycles through [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0]

#### Scenario: Speed panel
- **WHEN** user long-presses speed button
- **THEN** a panel with all speed options is shown for direct selection

### Requirement: Resume playback
The player SHALL save and restore playback position per vodId+siteKey pair.

#### Scenario: Resume prompt on revisit
- **WHEN** user re-opens a video with saved position >5s
- **THEN** player seeks to saved position after load

### Requirement: Auto-hide controls
Player overlay controls SHALL auto-hide after 5 seconds of inactivity, show on tap.

#### Scenario: Controls timeout
- **WHEN** user has not interacted for 5 seconds
- **THEN** control overlay fades out

#### Scenario: Controls show on tap
- **WHEN** user taps the video area
- **THEN** controls reappear and reset hide timer
