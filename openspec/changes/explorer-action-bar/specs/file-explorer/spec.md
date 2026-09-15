## ADDED Requirements

### Requirement: Explorer action bar
The explorer SHALL present a persistent action bar at the bottom of the sidebar containing New File and New Folder buttons grouped on the left and the filename filter field on the right. The bar SHALL appear whenever a workspace folder is open and SHALL NOT appear in the empty-workspace state. File creation controls SHALL NOT be presented in the window toolbar.

#### Scenario: Action bar is always present with a folder open
- **WHEN** a workspace folder is open
- **THEN** the New File button, the New Folder button, and the filename filter field are visible at the bottom of the explorer without any toggle or mode switch

#### Scenario: Creation controls leave the toolbar
- **WHEN** a workspace folder is open
- **THEN** the window toolbar does not show New File or New Folder buttons

### Requirement: Contextual creation target
The action bar's New File and New Folder buttons SHALL create relative to the explorer's current selection: inside the selected folder, beside the selected file (in its parent folder), or at the workspace root when nothing is selected. The inline naming field SHALL appear at the target location, and the created entry SHALL be revealed.

#### Scenario: Create inside the selected folder
- **WHEN** the user selects a folder and clicks New File in the action bar
- **THEN** the inline naming field appears inside that folder and confirming creates the file there

#### Scenario: Create beside the selected file
- **WHEN** the user selects a file and clicks New Folder in the action bar
- **THEN** the inline naming field appears in the file's parent folder and confirming creates the folder there

#### Scenario: Create at the root with no selection
- **WHEN** nothing is selected and the user clicks New File in the action bar
- **THEN** the inline naming field appears at the workspace root

### Requirement: Always-visible filename filter
The explorer's filename filter SHALL be an always-visible field in the action bar that filters the tree as the user types, without a prior click to reveal it. While a query is active, folders that contain matches SHALL be expanded to show them. The field SHALL offer a clear affordance when it contains text, and pressing Escape SHALL clear the query.

#### Scenario: Filter without opening a mode
- **WHEN** the user types into the always-visible filter field
- **THEN** the tree narrows to matching files as they type, with containing folders expanded

#### Scenario: Clear a filter from the field
- **WHEN** the filter field contains text and the user clicks its clear affordance or presses Escape
- **THEN** the query is removed and the full tree is shown again

#### Scenario: Empty filter leaves the field in place
- **WHEN** the user clears the filter field
- **THEN** the field remains visible for the next query; no toggle state is entered or left behind
