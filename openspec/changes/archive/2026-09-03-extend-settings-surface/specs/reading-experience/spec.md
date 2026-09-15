## Purpose

Content-level reading comfort: settings contributed by the built-in theme extension that control how document text looks and flows — font size, text tint, line height, and reading measure — applied live and persisted across launches.

## ADDED Requirements

### Requirement: Reading font size
The system SHALL offer a reading font size setting with four discrete steps (S, M, L, XL), defaulting to M. The selected size SHALL apply to document content — in both editing and reading panes — immediately on change, and SHALL NOT affect UI chrome typography.

#### Scenario: Size change applies live
- **WHEN** the user changes the reading font size from M to XL
- **THEN** document text in every open document pane immediately renders at the XL scale, without a restart

#### Scenario: Size persists
- **WHEN** the user quits and relaunches the app after selecting L
- **THEN** document content renders at the L size step

#### Scenario: Toolbar unaffected
- **WHEN** the reading font size is changed
- **THEN** toolbar, sidebar, tabs, and settings text keep the design system's UI chrome scale

### Requirement: Reading text tint
The system SHALL offer a reading text color setting whose values are curated tints (Default, Sepia, Slate, High contrast), defaulting to Default. Free-form color input SHALL NOT be offered. The selected tint SHALL apply to document content text immediately on change, while UI chrome keeps its appearance-driven text colors.

#### Scenario: Tint applies to content only
- **WHEN** the user selects the Sepia tint
- **THEN** document content text renders with the sepia tint and sidebar, toolbar, and tabs remain on their appearance-driven text tokens

#### Scenario: Tint persists across appearance modes
- **WHEN** the Sepia tint is selected and the app switches from light to dark appearance
- **THEN** document content text uses the dark-appearance variant of the sepia tint and remains legible

### Requirement: Line height
The system SHALL offer a line height setting with three choices (Compact, Comfortable, Relaxed), defaulting to Comfortable. The choice SHALL adjust the vertical rhythm of document content immediately on change.

#### Scenario: Line height change applies live
- **WHEN** the user switches line height from Comfortable to Relaxed
- **THEN** the vertical spacing of document content lines increases immediately in all open document panes

### Requirement: Reading measure
The system SHALL offer a reading measure setting with three choices (Narrow, Medium, Wide), defaulting to Medium, constraining the maximum rendered line length of document content. The setting SHALL NOT leave document content unbounded at any choice.

#### Scenario: Narrow measure constrains lines
- **WHEN** the user selects Narrow and opens a wide window
- **THEN** document content lines are capped at the narrow measure instead of stretching across the pane

#### Scenario: Measure applies to editor and reader
- **WHEN** a document is open in both an editing pane and a reading pane
- **THEN** both panes respect the selected measure

### Requirement: Settings appear as one group
All reading-experience settings SHALL appear in the settings interface grouped under the contributing extension's namespace, one row per setting, ordered consistently, using the generic settings UI without per-setting custom code.

#### Scenario: Group renders in settings UI
- **WHEN** the user opens settings
- **THEN** the reading-experience settings appear as rows in the theme extension's group, each with a label on the left and its control on the right