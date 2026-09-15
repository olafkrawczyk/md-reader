## Purpose

Filesystem mutation operations for the active workspace — create files and folders, rename/move, copy, and delete — provided by the workspace and consumed through the extension API, so product features like the explorer stay extensions.

## ADDED Requirements

### Requirement: Create file or folder with nested path
The system SHALL let an extension create a new empty file or a new folder at a workspace-relative or workspace-absolute path, and SHALL create any missing parent directories named in that path in the same operation.

#### Scenario: Create a file inside a new directory
- **WHEN** the user creates a file with the path `notes/new_dir/new_file.md` and no part of that path exists yet
- **THEN** the directories `notes/new_dir` are created and an empty `new_file.md` exists inside them

#### Scenario: Create a folder
- **WHEN** the user creates a folder with the path `archive/2026`
- **THEN** the folder exists in the workspace and appears in the tree immediately, even while it is empty

#### Scenario: Creating over an existing entry fails cleanly
- **WHEN** the requested path already exists as a file or folder
- **THEN** the operation fails with a clear error and nothing on disk is changed

### Requirement: Rename or move preserves content
The system SHALL let an extension rename or move a file or folder to a new location inside the workspace. The file's or folder's contents SHALL be unchanged by the operation.

#### Scenario: Rename a file
- **WHEN** the user renames a file within its folder
- **THEN** the same content exists under the new name and the old name no longer exists

#### Scenario: Move a file into another folder
- **WHEN** the user moves a file into a different folder in the workspace
- **THEN** the file exists only at the destination and its content is unchanged

#### Scenario: Move into a missing destination folder fails cleanly
- **WHEN** a move or rename targets a destination whose parent folder does not exist
- **THEN** the operation fails with a clear error and nothing on disk is changed

### Requirement: Copy duplicates a file or folder
The system SHALL let an extension copy a file or an entire folder subtree to a destination inside the workspace, leaving the source untouched.

#### Scenario: Duplicate a file
- **WHEN** the user copies a file to a destination path in the same folder
- **THEN** both the original and the copy exist with identical content

#### Scenario: Copy a folder subtree
- **WHEN** the user copies a folder containing nested files and folders
- **THEN** the full subtree is reproduced at the destination and the source is unchanged

### Requirement: Delete a file or folder
The system SHALL let an extension delete a file or a folder with its entire subtree from the workspace.

#### Scenario: Delete a file
- **WHEN** the user deletes a file
- **THEN** the file no longer exists on disk or in the tree

#### Scenario: Delete a folder
- **WHEN** the user deletes a folder
- **THEN** the folder and everything inside it no longer exists on disk or in the tree

### Requirement: Operations are confined to the workspace
Every create, rename/move, copy, and delete operation SHALL resolve to a path inside the active workspace and SHALL be rejected otherwise, including operations that would traverse out via symlinks.

#### Scenario: Destination outside the workspace is rejected
- **WHEN** an operation's destination path resolves outside the active workspace
- **THEN** the operation is rejected with an error and nothing on disk is changed

### Requirement: Open documents follow renames and moves
When a document that is currently open is renamed or moved, the system SHALL retarget that document's path to the new location and preserve its in-memory content, including unsaved changes. Deleting an open document SHALL continue to be signaled as a deletion so views can close it.

#### Scenario: Rename an open dirty document
- **WHEN** a document with unsaved changes is renamed
- **THEN** the open document keeps its unsaved content and is associated with the new path

#### Scenario: Move a folder containing an open document
- **WHEN** a folder holding an open document is moved
- **THEN** the open document's path is retargeted beneath the new folder location

### Requirement: Tree reflects operations through the change watcher
The exposed file tree SHALL update after each operation through the same change-detection path used for external changes; operations SHALL NOT maintain a second tree-update mechanism.

#### Scenario: Explorer reflects a completed operation
- **WHEN** any create, rename/move, copy, or delete operation completes
- **THEN** the exposed tree shows the resulting file system state without any user-initiated refresh

### Requirement: Operations do not block the interface
File operations SHALL run without blocking the interface; the UI SHALL remain responsive while a large copy or move is in flight.

#### Scenario: Large folder copy keeps UI responsive
- **WHEN** the user copies a folder containing many files
- **THEN** the interface remains interactive while the copy runs

#### Scenario: Failed operation is reported
- **WHEN** a file operation fails (e.g. permission denied, destination exists)
- **THEN** the error is surfaced to the user and the file system is left unchanged
