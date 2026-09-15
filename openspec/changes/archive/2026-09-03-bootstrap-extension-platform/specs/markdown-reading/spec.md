## Purpose

The reading experience for markdown: fully rendered documents — text, headings, tables, highlighted code blocks — with user-selectable reading fonts.

## ADDED Requirements

### Requirement: Render markdown documents
The reading pane SHALL render markdown documents with headings, emphasis, lists, links, blockquotes, and GFM tables, honoring heading hierarchy and table structure.

#### Scenario: Document with mixed elements
- **WHEN** a markdown document containing headings, a list, and a GFM table is displayed in the reading pane
- **THEN** all elements render with their structure visible (heading levels distinct, list items enumerated, table rows and columns aligned)

### Requirement: Syntax-highlighted code blocks
The reading pane SHALL render fenced code blocks with syntax highlighting appropriate to the declared language of the block.

#### Scenario: Fenced code block with language
- **WHEN** a document contains a fenced code block declaring a language
- **THEN** the rendered block highlights tokens of that language distinctly

#### Scenario: Fenced code block without language
- **WHEN** a document contains a fenced code block with no language declared
- **THEN** the block renders as plain monospace code without failing

### Requirement: Selectable reading fonts
The reading pane SHALL support Atkinson Hyperlegible and Lexend as reading fonts, selectable through the settings interface, with the choice applied live to rendered documents.

#### Scenario: Switch reading font
- **WHEN** the user switches the reading font setting from Atkinson Hyperlegible to Lexend
- **THEN** the currently rendered document redisplays in Lexend without reopening it

### Requirement: Rendering follows document changes
The reading pane SHALL update its rendered output when the displayed document changes, without requiring the user to reopen the document.

#### Scenario: Edit reflected while split
- **WHEN** the document is edited in the editing pane while the same document is displayed in the reading pane
- **THEN** the reading pane's rendered output updates to include the edit
