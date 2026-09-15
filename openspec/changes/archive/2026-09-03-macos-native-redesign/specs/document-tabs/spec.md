## Purpose

Lets users keep multiple documents open at once as tabs in a strip above the main region. Each tab is one open document; the active tab's document is what layout presets route. Tabs make the reader feel like a desktop document app rather than a one-file-at-a-time viewer.

## ADDED Requirements

### Requirement: Opening a document creates or activates a tab
The system SHALL represent every opened document as a tab in the tab strip. Opening a document that already has a tab SHALL activate that existing tab instead of duplicating it.

#### Scenario: Open a new file
- **WHEN** the user opens a file that is not currently open
- **THEN** a new tab appears with the file's name and becomes the active tab

#### Scenario: Re-open an already open file
- **WHEN** the user opens a file from the sidebar that already has a tab
- **THEN** no duplicate tab is created and the existing tab becomes active

### Requirement: Tab strip display and activation
The system SHALL display all open documents as tabs showing the document's file name, with the active tab visually distinguished. Only the active tab's document is routed to the layout panes.

#### Scenario: Switch tabs
- **WHEN** the user clicks a different tab
- **THEN** that tab becomes active and the main region shows its document under the current layout preset

#### Scenario: Keyboard tab navigation
- **WHEN** the user triggers the next/previous tab keyboard shortcut
- **THEN** the adjacent tab becomes active

### Requirement: Closing tabs
The system SHALL let the user close any tab via its close affordance, a middle click, or a close-tab keyboard shortcut. Closing a tab with unsaved changes SHALL indicate the unsaved state before closing.

#### Scenario: Close the active tab
- **WHEN** the user closes the active tab
- **THEN** the tab is removed and an adjacent tab becomes active

#### Scenario: Close the last tab
- **WHEN** the user closes the only open tab
- **THEN** the tab strip disappears and the main region shows the welcome state

#### Scenario: Dirty indicator
- **WHEN** the active document has unsaved changes
- **THEN** its tab shows an unsaved-changes marker instead of a plain close affordance until the document is saved

### Requirement: Tabs coexist with layout presets
The system SHALL keep layout presets (read, edit, split) operating inside the active tab. Switching presets SHALL not close or reorder tabs.

#### Scenario: Preset switch with multiple tabs open
- **WHEN** the user switches from the read preset to the split preset while several tabs are open
- **THEN** the tab strip is unchanged and the active document is shown in the split layout

### Requirement: External deletion closes the tab
The system SHALL close the tab of a document deleted outside the app while it is open.

#### Scenario: Open file deleted on disk
- **WHEN** a file with an open tab is deleted from the workspace
- **THEN** its tab closes and the workspace tree no longer shows the file
