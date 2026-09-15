## Purpose

Owns the concept of an opened folder: exposing its nested file tree, watching for changes, and providing the document model (text, path, version, dirty state) that all views operate on.

## ADDED Requirements

### Requirement: Expose the workspace file tree
The system SHALL expose the active workspace as a nested file tree, including files and subfolders at any depth.

#### Scenario: Folder contains nested structure
- **WHEN** the active workspace folder contains subfolders with files at multiple depths
- **THEN** the exposed tree contains every folder and file, preserving the nesting structure

### Requirement: Reflect external file system changes
The system SHALL detect files and folders added, removed, or renamed inside the active workspace while the app is running, and update the exposed tree accordingly.

#### Scenario: File created externally
- **WHEN** a new file is created inside the workspace folder by another application
- **THEN** the exposed tree includes the new file without the user refreshing anything

#### Scenario: Open document deleted externally
- **WHEN** a document that is currently open is deleted outside the app
- **THEN** the system signals the deletion so views can react (e.g. drop the document from display)

### Requirement: Provide document content
The system SHALL load a workspace file as a document consisting of its text content and its file path, and SHALL support saving text back to that path.

#### Scenario: Open a document
- **WHEN** a file is opened from the workspace
- **THEN** the document's initial content matches the file contents on disk

#### Scenario: Save a document
- **WHEN** a document with unsaved changes is saved
- **THEN** the file on disk contains the saved content and the document is no longer marked dirty

### Requirement: Track document version and dirty state
The system SHALL increment a document's version on each in-app content change and SHALL mark it dirty until saved.

#### Scenario: Edit then save
- **WHEN** the document content is changed and then saved
- **THEN** the version has increased, the dirty flag was set after the change, and is cleared after the save
