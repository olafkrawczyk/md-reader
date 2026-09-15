## Purpose

The sidebar file browser: presents the workspace tree as a macOS-native explorer with collapsible folders, file icons, and clear selection and active-document states. Predictable Finder-like behavior over novelty.

## Requirements

### Requirement: Collapsible folders
The system SHALL render folders with a disclosure control that expands and collapses their children. Disclosure state SHALL persist for the session, including across tab switches.

#### Scenario: Expand a folder
- **WHEN** the user clicks a collapsed folder's disclosure control
- **THEN** the folder's immediate children appear indented beneath it

#### Scenario: Collapse a folder
- **WHEN** the user clicks an expanded folder's disclosure control
- **THEN** its children are hidden and its state stays collapsed when the user switches tabs and returns

### Requirement: Single-click opens files
The system SHALL open a file with a single click on its row and mark it as the selected row.

#### Scenario: Open a file from the explorer
- **WHEN** the user clicks a file row
- **THEN** the file opens as the active document and its row shows the selected state

### Requirement: Active document highlight
The system SHALL highlight the explorer row of the currently active document, distinct from transient selection, so the user can always locate the open file in the tree.

#### Scenario: Active file visible in tree
- **WHEN** a document is open and active while its folder is expanded
- **THEN** the row for that file shows the active-document highlight

#### Scenario: Active file in collapsed folder
- **WHEN** the active document's containing folder is collapsed
- **THEN** the highlight is not shown until the user expands that folder

### Requirement: File icons
The system SHALL show a type-appropriate icon before each row: a folder icon for folders and distinct icons per document type, tinted through the appearance token set.

#### Scenario: Icons distinguish types
- **WHEN** the tree renders a folder, a markdown file, and another supported document type
- **THEN** each row shows its distinct type icon, legible in the current appearance

### Requirement: Empty workspace state
The system SHALL show a brief, quiet prompt in the sidebar area when no folder is open, with an action that opens the folder dialog.

#### Scenario: Prompt before a folder is opened
- **WHEN** no workspace folder is open
- **THEN** the sidebar area shows the prompt and clicking it presents the native folder selection dialog

### Requirement: Only displayable files are shown
The explorer SHALL show only files whose type the app can display (claimed document types plus plain-text files), and SHALL hide folders that contain no displayable files after filtering.

#### Scenario: Unsupported file is hidden
- **WHEN** the workspace contains a file with an extension no document type claims and that is not plain text
- **THEN** the explorer does not show a row for it

#### Scenario: Folder with no displayable content is hidden
- **WHEN** a folder contains only unsupported files
- **THEN** the explorer does not show the folder

### Requirement: Resizable sidebar
The system SHALL let the user adjust the sidebar width by dragging a divider on its edge, clamped to sensible minimum and maximum widths, and the width SHALL persist for the session.

#### Scenario: Drag the sidebar divider
- **WHEN** the user drags the sidebar's divider
- **THEN** the sidebar width changes within the allowed range and remains as adjusted for the session

### Requirement: Foldable sidebar
The system SHALL let the user hide and show the sidebar from a toolbar toggle. Hiding SHALL give the main region the full window width.

#### Scenario: Fold the sidebar
- **WHEN** the user triggers the sidebar toggle
- **THEN** the sidebar and its divider disappear and the main region spans the remaining width

#### Scenario: Unfold the sidebar
- **WHEN** the user triggers the sidebar toggle again
- **THEN** the sidebar reappears with its previous width and disclosure state
