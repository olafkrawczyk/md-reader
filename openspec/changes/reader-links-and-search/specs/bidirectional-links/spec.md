## Purpose

Enables zero-database bidirectional linking with wikilink syntax, live link resolution across workspace documents, auto-completion, and incoming backlink discovery.

## ADDED Requirements

### Requirement: Wikilink syntax parsing and navigation
The system SHALL parse `[[target]]` and `[[target|display text]]` wikilink syntax in both reading and editing modes, and navigate to the matching workspace document upon activation.

#### Scenario: Clicking an existing wikilink in reader
- **WHEN** the user clicks a `[[Architecture]]` wikilink in a reading pane
- **THEN** the system resolves `Architecture.md` within the workspace and activates it in a document tab

#### Scenario: Activating a wikilink with alias text
- **WHEN** the user clicks a `[[Guides/Setup|Getting Started]]` wikilink
- **THEN** the rendered text displays "Getting Started" and navigates to `Guides/Setup.md` when clicked

### Requirement: Wikilink auto-completion in editor
The system SHALL provide an inline suggestion popup of matching workspace document titles when the user types `[[` in an active markdown editor.

#### Scenario: Typing link trigger characters
- **WHEN** the user types `[[` followed by partial text in the editor
- **THEN** a completion list shows matching markdown filenames in the workspace, and selecting one inserts the closed wikilink

### Requirement: Backlinks and context pane
The system SHALL provide a dedicated context pane displaying all documents in the current workspace that link to the currently active document.

#### Scenario: Viewing incoming references
- **WHEN** `Design.md` is referenced by `Roadmap.md` and `Tasks.md`
- **THEN** opening `Design.md` displays `Roadmap.md` and `Tasks.md` in the Backlinks pane with snippet previews of the referencing lines

#### Scenario: Active document has no backlinks
- **WHEN** an unreferenced document is active
- **THEN** the Backlinks pane displays an empty state indicating no incoming links exist
