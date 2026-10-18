## ADDED Requirements

### Requirement: Render mermaid diagrams

The reading pane SHALL render fenced code blocks declaring the language `mermaid` as diagrams (SVG), preserving the block's position, focus-mode unit, and line anchor. Diagram labels SHALL NOT be able to execute script or inject HTML.

#### Scenario: Valid diagram

- **WHEN** a document contains a ```` ```mermaid ```` block with a valid flowchart and the block is visible in the reading pane
- **THEN** the block is replaced by the rendered diagram

#### Scenario: Script in a label

- **WHEN** a diagram label contains `<script>` or an `onclick` handler
- **THEN** the label is rendered as text and nothing executes

#### Scenario: Outline jump and focus mode

- **WHEN** a rendered diagram sits under a heading and the user jumps to that heading, or focus mode is enabled
- **THEN** the diagram participates in scrolling and focus dimming like the code block it replaced

### Requirement: Mermaid loading has no cost for documents without diagrams

The mermaid library SHALL NOT be part of the application's startup bundle and SHALL be loaded only when a document containing a mermaid block needs a diagram rendered or its source is edited. Opening documents without mermaid blocks SHALL NOT load it.

#### Scenario: Document without diagrams

- **WHEN** the user opens a document with no mermaid blocks
- **THEN** no mermaid code is requested or executed

#### Scenario: First diagram

- **WHEN** the user opens a document with a mermaid block
- **THEN** the document's text paints first with the block shown as plain code, and the diagram appears after the library loads

### Requirement: Diagrams render only near the viewport

The reading pane SHALL defer rendering each mermaid diagram until it is within roughly one viewport of being visible, and SHALL render diagrams one at a time off the render path.

#### Scenario: Diagram below the fold

- **WHEN** a document has a mermaid block far below the initial viewport
- **THEN** that block remains plain code until the user scrolls near it, then renders

### Requirement: Mermaid errors are shown inline

When a mermaid block fails to parse or render, the reading pane SHALL keep the block's source visible (or its last successful rendering during the current editing session, visibly marked as stale) and SHALL show a one-line error caption naming the problem.

#### Scenario: Invalid diagram on open

- **WHEN** a document contains a mermaid block with a syntax error
- **THEN** the block shows as code with a caption beginning "Mermaid:" describing the error

#### Scenario: Diagram broken while editing

- **WHEN** in Split View the user edits a rendered diagram into an invalid state
- **THEN** the previous diagram remains visible, dimmed, with the error caption, until the source becomes valid again

### Requirement: Diagrams follow appearance

Rendered diagrams SHALL use a light theme in light appearance and a dark theme in dark appearance, and SHALL update when the appearance changes without reopening the document.

#### Scenario: Switch to dark

- **WHEN** a document with a rendered diagram is open and the appearance switches to dark
- **THEN** the diagram re-renders with dark colors

### Requirement: Diagrams update live while editing

In a layout showing both editor and reader for a document, edits to a mermaid block SHALL update its diagram after a short pause in typing (≈300 ms), and diagrams whose source did not change SHALL remain displayed without re-rendering or flicker.

#### Scenario: Editing one of several diagrams

- **WHEN** a document has two diagrams and the user types inside the first in Split View
- **THEN** the second diagram stays displayed unchanged and the first updates after typing pauses
