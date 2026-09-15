## Purpose

The source editing experience for markdown: raw text editing in a monospace font with markdown syntax visually distinguished from prose.

## ADDED Requirements

### Requirement: Edit markdown source with syntax highlighting
The editing pane SHALL display the raw markdown source in a monospace font with markdown syntax (headings, emphasis, code, links, list markers) visually distinguished from surrounding prose.

#### Scenario: Document with headings and emphasis
- **WHEN** a markdown document containing headings and emphasized text is displayed in the editing pane
- **THEN** heading markers and emphasis delimiters are visually distinct from body text

### Requirement: Edits mark the document dirty
The editing pane SHALL mark the document dirty when its content is changed, and saving SHALL persist the content to the document's file.

#### Scenario: Type and save
- **WHEN** the user types in the editing pane and saves
- **THEN** the document is marked dirty after typing, the file on disk contains the typed content after saving, and the dirty mark is cleared

### Requirement: Large documents remain responsive
The editing pane SHALL remain responsive to input for documents of substantial size (thousands of lines) without perceivable input lag.

#### Scenario: Open and type in a large document
- **WHEN** a multi-thousand-line markdown document is opened in the editing pane and the user types
- **THEN** keystrokes appear without noticeable delay
