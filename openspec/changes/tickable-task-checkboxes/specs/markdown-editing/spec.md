## ADDED Requirements

### Requirement: Editing pane reflects external document changes
When the displayed document's text changes from outside the editing pane, the editing pane SHALL update its editor content to match without reopening the document, and subsequent editing SHALL NOT revert those external changes.

#### Scenario: Reader tick appears in split view
- **WHEN** a document is open in both a reading pane and an editing pane and the user ticks a task checkbox in the reading pane
- **THEN** the editing pane's text shows the updated task marker without any action in the editor

#### Scenario: Typing after an external change does not revert it
- **WHEN** a task was ticked in the reading pane while the document was open in the editing pane, and the user then types in the editing pane
- **THEN** the ticked marker remains ticked in the saved content

#### Scenario: External changes stay out of undo history
- **WHEN** an external change is applied to the editing pane and the user subsequently triggers undo
- **THEN** the undo reverts the user's own last edit rather than the external change
