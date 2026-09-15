## ADDED Requirements
### Requirement: Row context menu
The system SHALL offer a context menu on each explorer row with actions appropriate to the entry type: new file, new folder, rename, copy, move to…, and delete. The menu SHALL be available for the workspace root and every visible folder row.

#### Scenario: File row menu shows file actions
- **WHEN** the user opens the context menu on a file row
- **THEN** the menu offers rename, copy, move to…, and delete

#### Scenario: Folder row menu shows folder actions
- **WHEN** the user opens the context menu on a folder row
- **THEN** the menu offers new file, new folder, rename, copy, move to…, and delete

### Requirement: Inline create with nested path
The system SHALL let the user create a file or folder through an inline input on the target folder row that accepts a nested path, creating missing parent directories in the same action. Confirming with an empty input SHALL cancel the operation; Escape SHALL cancel it.

#### Scenario: Create via nested path input
- **WHEN** the user types `new_dir/new_file.md` into the inline create input on a folder and confirms
- **THEN** `new_dir` and `new_file.md` are created inside that folder and the input closes

#### Scenario: Escape cancels create
- **WHEN** the user presses Escape while the inline create input is open
- **THEN** no file or folder is created and the input closes

#### Scenario: Create error surfaces inline
- **WHEN** confirming the inline create fails (e.g. the name already exists)
- **THEN** the input stays open and the error is shown without losing the typed path

### Requirement: Inline rename
The system SHALL let the user rename a file or folder in place: the row's name becomes an editable input pre-filled with the current name, and confirming applies the rename. Escape SHALL cancel the rename.

#### Scenario: Rename through the row input
- **WHEN** the user starts a rename, edits the name, and confirms
- **THEN** the entry is renamed on disk and the row shows the new name

#### Scenario: Escape cancels rename
- **WHEN** the user presses Escape while the inline rename input is open
- **THEN** the row returns to its previous name with nothing changed on disk

### Requirement: Toolbar create actions
The system SHALL offer New File and New Folder actions in the top bar that open the inline create input on the workspace root. The actions SHALL be hidden while no folder is open.

#### Scenario: Toolbar new file
- **WHEN** the user clicks the top-bar New File action
- **THEN** the inline create input opens on the workspace root and confirming creates the file

#### Scenario: Toolbar actions without a workspace
- **WHEN** no folder is open
- **THEN** the top-bar create actions are not shown

### Requirement: Drag and drop move
The system SHALL let the user move a file or folder by dragging its row onto a visible folder row or the workspace root. Dropping a folder into one of its own descendants SHALL be rejected.

#### Scenario: Drag a file onto a folder
- **WHEN** the user drags a file row onto a folder row
- **THEN** the file is moved into that folder

#### Scenario: Drop onto own descendant is rejected
- **WHEN** the user drops a folder onto one of its own descendant folders
- **THEN** the drop is rejected and nothing is moved

### Requirement: Delete confirmation
The system SHALL require confirmation before deleting, showing the entry's name. For a folder, the confirmation SHALL make clear that the folder's entire contents will be deleted.

#### Scenario: Confirm deletes
- **WHEN** the user confirms the delete confirmation for a file
- **THEN** the file is deleted

#### Scenario: Cancel keeps the entry
- **WHEN** the user cancels the delete confirmation
- **THEN** nothing is deleted

#### Scenario: Folder delete warns about contents
- **WHEN** the user triggers delete on a folder
- **THEN** the confirmation indicates the folder and its contents will be removed

## MODIFIED Requirements

### Requirement: Only displayable files are shown
The explorer SHALL show only files whose type the app can display (claimed document types plus plain-text files). Folders SHALL be shown regardless of their contents, including empty folders and folders containing only unsupported files, so file-management operations always have a visible target.

#### Scenario: Unsupported file is hidden
- **WHEN** the workspace contains a file with an extension no document type claims and that is not plain text
- **THEN** the explorer does not show a row for it

#### Scenario: Empty folder is shown
- **WHEN** the workspace contains a folder with no displayable content
- **THEN** the explorer shows the folder so it can be browsed and receive new files
