## Purpose

Protects edits from data loss: an idle-delay autosave persists changes without explicit save actions, and an unsaved-changes guard prompts the user before any close path discards a dirty document.

## ADDED Requirements

### Requirement: Idle-delay autosave
The system SHALL automatically save a dirty document after an idle period following its last edit. Autosave SHALL NOT write the file while the user is actively editing; only after the document has been idle for the configured delay. The idle delay SHALL default to 1 second.

#### Scenario: Edits persist without manual save
- **WHEN** the user edits a document and then stops typing for longer than the configured idle delay
- **THEN** the document's file on disk contains the edited content and the document is no longer marked dirty

#### Scenario: Continued typing postpones the save
- **WHEN** the user keeps editing within each idle window
- **THEN** no save occurs until an idle window longer than the configured delay elapses

#### Scenario: Manual save still works
- **WHEN** the user saves explicitly (e.g. the save shortcut) before the idle delay elapses
- **THEN** the document is saved immediately and the pending autosave timer is cancelled

### Requirement: Autosave is configurable
The system SHALL offer an autosave setting (boolean, default on) and an autosave delay setting (number of seconds, default 1) in the settings interface, applied live on change. Disabling autosave SHALL stop automatic saves; the unsaved-changes guard remains the only protection.

#### Scenario: Autosave settings appear in settings UI
- **WHEN** the user opens the settings interface
- **THEN** an autosave toggle and an autosave delay stepper appear as rows in the document-safety extension's group

#### Scenario: Disabling autosave applies live
- **WHEN** the user turns autosave off
- **THEN** subsequent edits leave the document dirty until the user saves manually, without restarting the app

#### Scenario: Delay change applies live
- **WHEN** the user changes the autosave delay setting
- **THEN** subsequent autosaves wait the new delay, clamped to the declared bounds

### Requirement: Save failures surface to the user
The system SHALL surface a failed autosave as an error status message and leave the document dirty, so the user knows the write did not persist.

#### Scenario: Autosave write fails
- **WHEN** an autosave attempt fails (e.g. the file is not writable)
- **THEN** an error status message is shown and the document remains marked dirty

### Requirement: Unsaved-changes guard on tab close
The system SHALL intercept every close path for a dirty tab (close affordance, middle click, close-tab shortcut) and SHALL present a Save / Discard / Cancel dialog before closing it. Cancel SHALL abort the close; Save SHALL save and then close; Discard SHALL close without saving.

#### Scenario: Close a dirty tab with Save
- **WHEN** the user closes a dirty tab and chooses Save
- **THEN** the file on disk contains the current content and the tab closes

#### Scenario: Close a dirty tab with Discard
- **WHEN** the user closes a dirty tab and chooses Discard
- **THEN** the tab closes, the file on disk is unchanged, and the changes are lost

#### Scenario: Close a dirty tab with Cancel
- **WHEN** the user closes a dirty tab and chooses Cancel
- **THEN** the tab remains open with its unsaved changes intact

#### Scenario: Clean tabs close without prompting
- **WHEN** the user closes a tab whose document is not dirty
- **THEN** the tab closes immediately with no dialog

### Requirement: Unsaved-changes guard on window close
The system SHALL intercept window close (close button, Cmd+Q, Cmd+W closing the last tab counts as tab close) while any open document is dirty, and SHALL prevent the close until the user resolves the prompt. Cancel SHALL abort the close and keep the app running with all tabs and changes intact.

#### Scenario: Quit with dirty documents and Save all
- **WHEN** the user closes the window while documents are dirty and chooses to save
- **THEN** all dirty documents are saved and the window closes

#### Scenario: Quit with dirty documents and Cancel
- **WHEN** the user closes the window while documents are dirty and chooses Cancel
- **THEN** the window stays open with all tabs and unsaved changes intact

#### Scenario: Quit with no dirty documents
- **WHEN** the user closes the window while no open document is dirty
- **THEN** the window closes immediately with no prompt
