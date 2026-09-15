## ADDED Requirements

### Requirement: Native menu bar with file actions
The system SHALL present a native macOS application menu bar containing a File menu with the create and open actions: "Open Folder…", "New File", and "New Folder". These menu items SHALL trigger the same behaviors as their in-app counterparts (the native folder dialog, and inline creation in the file explorer). Standard Edit, View, Window, and Help menus SHALL be preserved.

#### Scenario: Menu bar shows file actions
- **WHEN** the user opens the File menu in the macOS system menu bar
- **THEN** it contains "Open Folder…", "New File", and "New Folder" items

#### Scenario: Open Folder from the menu bar
- **WHEN** the user selects "Open Folder…" in the menu bar
- **THEN** the native folder selection dialog opens and a chosen folder becomes the active workspace, identical to the toolbar open-folder action

#### Scenario: Create from the menu bar
- **WHEN** the user selects "New File" or "New Folder" in the menu bar
- **THEN** inline creation of that entry begins in the file explorer at the current location, identical to the explorer's own create controls

#### Scenario: File actions disabled without a workspace
- **WHEN** no workspace folder is open
- **THEN** the "New File" and "New Folder" menu items are disabled, while "Open Folder…" remains enabled

#### Scenario: Keyboard shortcuts
- **WHEN** the user presses the menu accelerators (⌘O for Open Folder…, ⌘N for New File, ⇧⌘N for New Folder)
- **THEN** the corresponding action runs
