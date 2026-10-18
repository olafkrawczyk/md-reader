## ADDED Requirements

### Requirement: Mermaid syntax highlighting in the editor

The editor SHALL highlight the contents of fenced code blocks declaring the language `mermaid`: diagram type headers and structural keywords, arrows/links, strings and node labels, numbers, and `%%` comments, using the app's syntax color tokens. This SHALL NOT require loading the mermaid library.

#### Scenario: Flowchart source

- **WHEN** the editor shows a ```` ```mermaid ```` block containing `flowchart TD`, `A["Start"] --> B`, and a `%% note` line
- **THEN** `flowchart` is styled as a keyword, `-->` as an operator, `"Start"` as a string, and the comment line as a comment

### Requirement: Mermaid template completion

When the user types a code fence opener (```` ``` ````, optionally followed by a prefix of `mermaid`) at the start of a line that is not closing an existing block, the editor SHALL offer completions that insert a complete fenced mermaid block for each of: flowchart, sequence, class, state, ER, gantt, pie, and mindmap, placing the cursor in the first editable position.

#### Scenario: Insert a sequence diagram

- **WHEN** the user types ```` ```mer ```` on an empty line and accepts "mermaid · sequence"
- **THEN** a ```` ```mermaid ```` block with a `sequenceDiagram` skeleton and a closing fence is inserted

#### Scenario: Closing fence

- **WHEN** the user types ```` ``` ```` to close an open code block
- **THEN** no mermaid templates are offered

### Requirement: Mermaid syntax errors marked in the editor

Once the mermaid library is loaded, the editor SHALL mark syntax errors in mermaid blocks with an error underline on the offending line (or the block's first line when the line is unknown) and a message on hover, re-checking after a short pause in typing. Making an edit inside a mermaid block SHALL cause the library to load; opening a document in the editor alone SHALL NOT.

#### Scenario: Error in Writing mode

- **WHEN** in Writing mode the user edits a mermaid block so its third line is invalid
- **THEN** after a pause the third line is underlined as an error, with mermaid's message on hover

#### Scenario: Fixed error

- **WHEN** the user corrects the invalid line
- **THEN** the error marker disappears after the next pause
