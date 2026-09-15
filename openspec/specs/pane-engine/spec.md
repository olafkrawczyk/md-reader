## Purpose

Renders registered panes (sidebar, editor, reader, any future view) inside named layout regions, and turns "modes" into declarative layout presets so no view mode is hardcoded in core.

## Requirements

### Requirement: Pane registration with viewable document types
The system SHALL let a component register itself as a pane, declaring which document types it can view. A pane registration SHALL be possible without modifying core code.

#### Scenario: Pane declares a document type
- **WHEN** a pane is registered declaring that it views `text/markdown`
- **THEN** the pane is a candidate for displaying markdown documents

### Requirement: Layout presets for read, edit, and split
The system SHALL support layout presets composed of named regions and pane assignments: a read preset (sidebar + reading pane), an edit preset (sidebar + editing pane), and a split preset (sidebar + editing pane + reading pane side by side). Presets SHALL be contributed data, not core-enumerated modes.

#### Scenario: Switch from read to split
- **WHEN** the user switches from the read preset to the split preset with a markdown document open
- **THEN** the same document is shown simultaneously in the editing pane and the reading pane, with the sidebar retained

#### Scenario: Default preset on opening a document
- **WHEN** a markdown document is opened and no preset was previously chosen
- **THEN** it opens in the read preset

### Requirement: Resizable split
The system SHALL let the user adjust the divider between panes within the main region, and the adjustment SHALL persist for the session.

#### Scenario: Drag divider in split preset
- **WHEN** the user drags the divider between the editing and reading panes
- **THEN** the pane widths change and remain as adjusted until the user changes them again

### Requirement: Document routing to a viewing pane
The system SHALL route an opened document to a pane that declared the document's type as viewable.

#### Scenario: Open a document with a viewing pane available
- **WHEN** a markdown document is opened while in the edit preset
- **THEN** the document is displayed in the editing pane
