## Purpose

Lets users find text within the open document and locate files by name across the workspace, through a search provider contract that other extensions can replace.

## ADDED Requirements

### Requirement: Keyboard-triggered find in document

Pressing ⌘F (Cmd+F on macOS) SHALL open the find bar for the open document in the active tab. Pressing Escape SHALL close the find bar and restore focus to the document pane.

#### Scenario: Open find bar from a document pane

- **WHEN** a document is open in the active tab and the user presses ⌘F
- **THEN** the find bar appears over the content area with the query field focused

#### Scenario: Close find bar

- **WHEN** the find bar is open and the user presses Escape
- **THEN** the find bar closes, all match highlights are cleared, and focus returns to the document pane

#### Scenario: No document open

- **WHEN** no document is open and the user presses ⌘F
- **THEN** the find bar does not open

### Requirement: Find targets the focused pane

In a split layout where the active document is visible in more than one pane, find SHALL target the focused pane when it renders the active document. When focus is outside any pane rendering the active document, find SHALL target the reader pane if present, otherwise the first pane rendering the document. Match highlights SHALL appear only in the targeted pane.

#### Scenario: Split view with editor focused

- **WHEN** the active document is shown in both the reader and editor panes and focus is in the editor pane when the user presses ⌘F
- **THEN** searching highlights matches in the editor pane only

#### Scenario: Focus outside document panes

- **WHEN** focus is in the sidebar and the user presses ⌘F while the active document is open in a reader|editor split
- **THEN** the find bar targets the reader pane

### Requirement: Match navigation and count

The find bar SHALL display the match count and support navigating matches with Enter, the down-arrow action, and the up-arrow action. Navigating forward from the last match SHALL wrap to the first match, and backward from the first SHALL wrap to the last. The targeted pane SHALL scroll the current match into view.

#### Scenario: Navigate matches

- **WHEN** a query has 17 matches and the user presses Enter twice
- **THEN** the counter shows "2 of 17" and the second match is scrolled into view

#### Scenario: Wrap navigation

- **WHEN** the current match is the last and the user navigates forward
- **THEN** the first match becomes current

### Requirement: Match highlighting per pane renderer

The editor pane SHALL highlight find matches using its own editing machinery, and the reader pane SHALL highlight find matches without modifying the document's rendered DOM. The find bar SHALL present match highlighting and navigation identically regardless of which pane type is targeted.

#### Scenario: Find in reader pane

- **WHEN** the find bar targets the reader pane and the user types a query present in the document
- **THEN** all matches are visually highlighted and the reader's rendered content is not re-rendered as a side effect

### Requirement: Pluggable search provider

The search extension SHALL publish its search behavior as a replaceable service with two independently declared capabilities: in-document find and workspace filename filtering. Another extension MAY re-register the service at runtime; after re-registration, the find bar and filename filtering SHALL use the replacement without restart.

#### Scenario: Provider replacement

- **WHEN** another extension re-registers the search service declaring both capabilities
- **THEN** subsequent find queries and filename filters are answered by the replacement service

#### Scenario: Partial capability provider

- **WHEN** a replacement service declares only the in-document find capability
- **THEN** in-document find uses the replacement while filename filtering continues using the previous provider

### Requirement: Sidebar filename search

The file explorer SHALL offer a search affordance that unfolds an in-place search input, immediately focused, when activated. While the input is non-empty, the explorer SHALL show only files whose names match the query at any depth, with folders containing matches automatically expanded. Clearing the query or pressing Escape SHALL restore the unfiltered tree.

#### Scenario: Unfold search input

- **WHEN** the user clicks the explorer search icon
- **THEN** a search input unfolds in the explorer header and has keyboard focus without a second click

#### Scenario: Filter across subdirectories

- **WHEN** the user types a query matching files inside collapsed folders
- **THEN** matching files at any depth are visible and their ancestor folders are shown expanded

#### Scenario: Restore tree

- **WHEN** the user clears the query or presses Escape in the search input
- **THEN** the unfiltered tree is restored and the input collapses back to the icon
