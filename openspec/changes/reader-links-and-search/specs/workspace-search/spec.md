## Purpose

Provides native Rust-powered full-text search across all markdown files in the workspace with match snippets, fast navigation, and ignore-list compliance.

## ADDED Requirements

### Requirement: High-performance workspace text search
The system SHALL execute multi-file text searches via the native backend across all readable markdown documents in the open workspace, respecting `.gitignore` and default ignore rules.

#### Scenario: Searching for a keyword across the workspace
- **WHEN** the user submits a search query in the workspace search panel
- **THEN** the system returns matching files grouped with line numbers and preview snippets within milliseconds

#### Scenario: Case-insensitive query matching
- **WHEN** the user searches for lowercase "tauri"
- **THEN** results include matches for "Tauri", "TAURI", and "tauri" unless case-sensitive mode is explicitly toggled

#### Scenario: No matches found
- **WHEN** a search query returns no matches across the workspace
- **THEN** the search results view displays a clear empty state indicating no results were found

### Requirement: Search excludes irrelevant paths and binary files
The system SHALL exclude paths ignored by the workspace ignore rules (such as `.git` and `node_modules`), and SHALL restrict scanning to text-readable markdown documents.

#### Scenario: Ignored directories excluded
- **WHEN** the workspace contains `.git` or `node_modules` directories with matching text
- **THEN** search results never include matches from those directories

#### Scenario: Binary files skipped
- **WHEN** the workspace contains binary files such as images or compiled assets
- **THEN** search does not attempt to match against them and produces no errors

### Requirement: Search result jump to source
The system SHALL navigate to the exact line and position of a search match when the user selects a search result item.

#### Scenario: Clicking a search match
- **WHEN** the user clicks a match result corresponding to line 42 of `docs/api.md`
- **THEN** `docs/api.md` opens in the active tab strip and scrolls line 42 into the center of the viewport with the matching text highlighted
