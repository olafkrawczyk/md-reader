## Purpose

Provides real-time table of contents extraction, document outline visualization, and scroll-synchronized heading navigation for long-form reading and editing.

## ADDED Requirements

### Requirement: Heading extraction and hierarchy
The system SHALL extract all Markdown headings (H1 through H6) from the active document, preserving their source line positions, text labels, and nesting levels.

#### Scenario: Document with multiple heading levels
- **WHEN** a document containing H1, H2, and H3 headings is opened
- **THEN** the outline extracts all headings in sequential order with their corresponding depth levels

#### Scenario: Empty document or no headings
- **WHEN** a document with no Markdown headings is active
- **THEN** the outline displays an empty state indicating that no headings were found

### Requirement: Outline jump navigation
The system SHALL allow users to click any heading in the outline to immediately scroll the active document pane to that heading's location.

#### Scenario: Clicking an outline entry
- **WHEN** the user clicks an H2 item in the outline
- **THEN** the active reader or editor pane scrolls smoothly to bring the target heading into view

### Requirement: Active heading scroll synchronization
The system SHALL highlight the heading in the outline that corresponds to the user's current reading position in the document viewport.

#### Scenario: Scrolling down a long document
- **WHEN** the user scrolls past an H2 heading into its section content
- **THEN** that H2 heading is visibly marked as the active section in the outline
