## ADDED Requirements

### Requirement: Explorer filename search input

The file explorer SHALL render a header row containing a filename-search affordance. Activating it SHALL unfold an inline search input with keyboard focus, per the `search` capability.

#### Scenario: Search affordance present in header

- **WHEN** a folder is open in the workspace
- **THEN** the explorer shows a header row with a search icon above the file tree
