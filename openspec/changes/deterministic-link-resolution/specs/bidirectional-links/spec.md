## Purpose

Provides deterministic, source-relative wikilink resolution, exact-match bidirectional link indexing without phantom backlinks, and disambiguated autocompletion across the workspace.

## ADDED Requirements

### Requirement: Source-relative and path-qualified wikilink resolution
The system SHALL resolve wikilinks using a deterministic, context-aware precedence hierarchy based on the referencing document's directory location before searching root-relative or workspace-wide paths.

#### Scenario: Resolving sibling document in same directory
- **WHEN** document `A/notes.md` contains link `[[readme]]`
- **AND** both `A/readme.md` and `B/readme.md` exist in the workspace
- **THEN** activating the link in `A/notes.md` navigates to `A/readme.md`

#### Scenario: Resolving explicit path with slashes
- **WHEN** document `index.md` contains link `[[A/readme]]` or `[[./A/readme]]`
- **THEN** activating the link navigates to `A/readme.md` regardless of other `readme.md` files in the workspace

#### Scenario: Resolving unique global match
- **WHEN** document `A/notes.md` contains link `[[changelog]]`
- **AND** exactly one `changelog.md` exists anywhere in the workspace
- **THEN** activating the link navigates to that `changelog.md`

### Requirement: Ambiguous bare link handling
The system SHALL treat bare wikilinks as unresolved (dead links) when multiple matching targets exist outside the source document's directory and no sibling matches.

#### Scenario: Activating ambiguous bare link
- **WHEN** document `index.md` contains link `[[readme]]`
- **AND** `index.md` has no sibling `readme.md` in its directory
- **AND** both `A/readme.md` and `B/readme.md` exist in the workspace
- **THEN** the link does not navigate to either file and remains unresolved

### Requirement: Exact-match backlinks
The system SHALL populate the Backlinks context pane strictly with incoming references whose resolved target matches the active document's exact path, with no stem-based or filename-based fallback matching.

#### Scenario: Backlinks for document with colliding name
- **WHEN** `A/notes.md` links to `[[readme]]` (resolving to `A/readme.md`)
- **AND** the user opens `B/readme.md`
- **THEN** the Backlinks pane for `B/readme.md` displays zero backlinks from `A/notes.md`

#### Scenario: Backlinks for disambiguated target
- **WHEN** `index.md` links to `[[B/readme]]`
- **AND** the user opens `B/readme.md`
- **THEN** the Backlinks pane for `B/readme.md` displays `index.md` as an incoming backlink

#### Scenario: Backlink source with colliding filename is directory-qualified
- **WHEN** `A/notes.md` and `B/notes.md` both link to their respective sibling `readme.md`
- **AND** the user opens `B/readme.md`
- **THEN** the Backlinks pane displays the source as `B/notes.md` (workspace-relative, directory-qualified) rather than the bare `notes.md`
- **AND** opening `A/readme.md` displays `A/notes.md` the same way

### Requirement: Disambiguated wikilink autocompletion
The system SHALL suggest path-qualified targets in the editor completion popup whenever multiple workspace documents share the same filename stem.

#### Scenario: Autocompleting duplicate document names
- **WHEN** user types `[[` in an editor and the workspace contains `A/readme.md` and `B/readme.md`
- **THEN** the completion list displays distinct entries qualified by their relative path (e.g. `A/readme` and `B/readme`)
- **AND** selecting an entry inserts the path-qualified wikilink target
