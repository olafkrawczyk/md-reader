## ADDED Requirements

### Requirement: Focus reading mode
The system SHALL offer a focus reading mode toggle that visually dims non-active paragraphs and sections while highlighting the block currently nearest to the reading focal point or cursor.

#### Scenario: Activating focus mode in reading pane
- **WHEN** the user enables focus mode while reading a document
- **THEN** blocks outside the active reading viewport or section are rendered with reduced opacity

#### Scenario: Moving reading position in focus mode
- **WHEN** the user scrolls or navigates to a different section while focus mode is active
- **THEN** the opacity transitions smoothly to highlight the new section while dimming the previous section

#### Scenario: Focus mode state persistence
- **WHEN** the user toggles focus mode on and restarts the application
- **THEN** the focus mode preference is retained and applied to newly opened documents

### Requirement: Bionic reading typography enhancement
The system SHALL offer an optional bionic reading mode setting that visually highlights the initial characters of words within document content to facilitate rapid saccadic reading.

#### Scenario: Toggling bionic reading on
- **WHEN** the user toggles the bionic reading setting on
- **THEN** document content in reading panes renders word fixations with emphasized initial letter weights

#### Scenario: Bionic reading does not modify document source
- **WHEN** bionic reading mode is active and the document is saved or inspected in editor mode
- **THEN** the raw markdown text source remains completely unmodified
