## ADDED Requirements

### Requirement: Preview tabs
The system SHALL support preview tabs: a file opened in preview mode occupies a single tab slot that is visually marked and is replaced by the next preview instead of accumulating. A preview tab SHALL become permanent when the user double-clicks its tab or edits the document, so a preview with unsaved changes is never silently replaced.

#### Scenario: Single-click opens a preview
- **WHEN** the user single-clicks a file in the explorer
- **THEN** the file opens as the active document in a tab that is visually marked as a preview

#### Scenario: Next preview replaces the previous one
- **WHEN** a preview tab exists and the user previews a different file
- **THEN** the previous preview tab is removed (without prompting) and the new file takes its place

#### Scenario: Preview with unsaved changes is not replaced
- **WHEN** the user edits the document in the preview tab (it is no longer clean) and then previews a different file
- **THEN** the edited tab is promoted to permanent before the new preview opens, and both tabs remain

#### Scenario: Double-click promotes
- **WHEN** the user double-clicks a preview tab or the file's explorer row
- **THEN** the tab loses the preview marking and behaves as a permanently opened tab

#### Scenario: Search results preview
- **WHEN** the user opens a search result
- **THEN** the file opens as a preview tab

#### Scenario: Permanent opens stay permanent
- **WHEN** a file is opened by a non-preview path (e.g. opened via the command line at launch)
- **THEN** it opens as a permanent tab with no preview marking
