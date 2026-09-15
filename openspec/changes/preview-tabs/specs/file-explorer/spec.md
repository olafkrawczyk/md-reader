## MODIFIED Requirements

### Requirement: Single-click opens files
The system SHALL open a file with a single click on its row as a preview tab and mark it as the selected row. Double-clicking the row SHALL open the file as a permanent tab.

#### Scenario: Open a file from the explorer
- **WHEN** the user clicks a file row
- **THEN** the file opens as the active document in a preview tab and its row shows the selected state

#### Scenario: Open a file permanently from the explorer
- **WHEN** the user double-clicks a file row
- **THEN** the file opens as a permanent (non-preview) tab
