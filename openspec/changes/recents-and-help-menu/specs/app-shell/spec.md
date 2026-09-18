## ADDED Requirements

### Requirement: Remember recently opened folders
The system SHALL record every folder that becomes the active workspace, however it was opened, in a most-recently-used ordered list that persists across app restarts. Reopening a folder already in the list SHALL move it to the front rather than adding a duplicate. The list SHALL be capped at a fixed maximum, discarding the least recent entry when full.

#### Scenario: Folder is recorded on open
- **WHEN** a folder becomes the active workspace
- **THEN** it appears at the front of the recent-folders list

#### Scenario: Recorded regardless of entry point
- **WHEN** a folder becomes the active workspace by way of the command line, rather than the in-app open action
- **THEN** it is recorded the same as any other opened folder

#### Scenario: Reopening does not duplicate
- **WHEN** the user opens a folder that is already in the recent list
- **THEN** the list contains that folder exactly once, at the front

#### Scenario: List survives a restart
- **WHEN** the user quits the app and launches it again
- **THEN** the recent-folders list contains the same entries in the same order

#### Scenario: Oldest entry is discarded when full
- **WHEN** the user opens a new folder while the list is at its maximum size
- **THEN** the new folder is at the front and the least recently opened folder is no longer in the list

### Requirement: Offer recent folders for reopening
The system SHALL present the recent folders as a list in the native menu, under the open-folder action, and selecting an entry SHALL make that folder the active workspace without presenting the folder selection dialog. Entries whose folder no longer exists on disk SHALL be omitted.

#### Scenario: Reopen from the menu
- **WHEN** the user selects a folder from the recent list in the native menu
- **THEN** that folder becomes the active workspace and no folder selection dialog appears

#### Scenario: Deleted folder is not offered
- **WHEN** a folder in the recent list has been deleted or moved outside the app
- **THEN** it is not shown in the recent list

#### Scenario: No recent folders yet
- **WHEN** the user has never opened a folder
- **THEN** the recent list is present but offers no entries

### Requirement: Keyboard shortcut reference
The system SHALL provide a Help menu entry that opens a reference listing the application's global keyboard shortcuts with their actions. The reference SHALL be dismissible without changing any application state.

#### Scenario: Open the shortcut reference
- **WHEN** the user triggers the keyboard-shortcuts entry in the Help menu
- **THEN** a panel opens listing the global shortcuts alongside what each one does

#### Scenario: Dismiss the reference
- **WHEN** the user dismisses the shortcut reference
- **THEN** the panel closes and the document, workspace, and layout are exactly as they were before it opened

## MODIFIED Requirements

### Requirement: Open a folder via native dialog
The system SHALL let the user pick a folder using the macOS-native folder selection dialog, and that folder SHALL become the active workspace. When no folder is open, the system SHALL additionally offer the recently opened folders for direct reopening, so returning to previous work does not require the dialog. When a folder is open but no document is showing, the system SHALL NOT prompt the user to open a folder.

#### Scenario: User opens a folder
- **WHEN** the user triggers "Open Folder" and selects a folder in the native dialog
- **THEN** the selected folder becomes the active workspace and its contents become available to the app

#### Scenario: Recent folders offered before any folder is open
- **WHEN** no folder is open and the user has opened folders before
- **THEN** the main region offers those recent folders alongside the open-folder action, and choosing one makes it the active workspace

#### Scenario: No prompt to open a folder once one is open
- **WHEN** a folder is open and no document is showing
- **THEN** the main region does not prompt the user to open a folder and does not offer the recent list
