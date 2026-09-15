## ADDED Requirements

### Requirement: Two-row toolbar under the window controls
The toolbar SHALL be laid out in two rows: the top row is a full-width title-bar band that contains the traffic-light controls and serves as the window drag region; the toolbar controls (the sidebar toggle and the open-folder action first) SHALL begin on a new row below that band, aligned to the left edge, vertically centered in their row, without overlapping the traffic lights. The title-bar band and the empty middle of the controls row SHALL remain draggable, while clicks on toolbar controls do not drag the window.

#### Scenario: Leading controls sit below the traffic lights
- **WHEN** the app window is displayed on macOS
- **THEN** the sidebar-toggle and open-folder controls are on the row below the traffic-light controls, starting at the left edge of that row with consistent spacing

#### Scenario: No overlap with traffic lights
- **WHEN** the toolbar is displayed at any supported window size
- **THEN** the traffic-light controls occupy the top row alone and the toolbar controls remain fully clickable on their own row

#### Scenario: Window still draggable
- **WHEN** the user drags the title-bar band or the empty middle of the controls row
- **THEN** the window moves, while clicks on toolbar controls do not move the window
