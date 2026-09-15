## ADDED Requirements

### Requirement: Tickable task checkboxes
The reading pane SHALL render GFM task-list items with enabled, clickable checkboxes styled to the design system. Activating a checkbox SHALL replace the task marker of exactly that list item in the markdown source (`[ ]` becomes `[x]`, `[x]` or `[X]` becomes `[ ]`) and SHALL mark the document dirty, flowing through the existing save pipeline. Markers outside task-list items — in code blocks, inline code, or prose — SHALL NOT be affected.

#### Scenario: Tick an unchecked task
- **WHEN** the user clicks the checkbox of a task rendered from `- [ ] Buy milk`
- **THEN** the source text becomes `- [x] Buy milk`, the document is marked dirty, and the rendered checkbox shows as checked without reopening the document

#### Scenario: Untick a checked task
- **WHEN** the user clicks the checkbox of a task rendered from `- [x] Done`
- **THEN** the source text becomes `- [ ] Done` and the rendered checkbox shows as unchecked

#### Scenario: Nested and ordered task lists
- **WHEN** a document contains tasks inside nested lists or ordered lists and the user ticks one
- **THEN** only that item's marker changes; sibling and parent markers are untouched

#### Scenario: Similar text elsewhere is untouched
- **WHEN** a document also contains the literal text `[ ]` or `[x]` inside a fenced code block, inline code, or plain prose
- **THEN** ticking a task list item never changes those occurrences

#### Scenario: Keyboard activation
- **WHEN** the user moves focus to a task checkbox and presses Space
- **THEN** the task toggles exactly as if it had been clicked
