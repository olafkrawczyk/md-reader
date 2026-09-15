## MODIFIED Requirements

### Requirement: Reflect external file system changes
The system SHALL detect files and folders added, removed, or renamed inside the active workspace while the app is running, and update the exposed tree accordingly. The system SHALL also detect content-only modifications to files inside the active workspace: an open, clean (non-dirty) document affected by such a modification SHALL reflect the new on-disk content, and a dirty document SHALL NOT be overwritten by the external modification (the in-app buffer wins until the user saves). Content-only modifications SHALL be reflected without depending on a structural tree refresh, and SHALL NOT change the tree structure.

#### Scenario: File created externally
- **WHEN** a new file is created inside the workspace folder by another application
- **THEN** the exposed tree includes the new file without the user refreshing anything

#### Scenario: Open document deleted externally
- **WHEN** a document that is currently open is deleted outside the app
- **THEN** the system signals the deletion so views can react (e.g. drop the document from display)

#### Scenario: External save reaches a clean open document
- **WHEN** another application saves new content to a file whose document is open and not dirty
- **THEN** the open document's content becomes the new on-disk content without the user closing and reopening it, and the document remains clean

#### Scenario: External save does not clobber a dirty document
- **WHEN** another application saves new content to a file whose document is open and dirty
- **THEN** the open document keeps the user's in-app buffer and dirty state, and the external content is not applied

#### Scenario: Content-only change leaves the tree alone
- **WHEN** only the contents of an existing file change externally (no file or folder is created, removed, or renamed)
- **THEN** the exposed tree structure is unchanged, and any open clean document for that file still reflects the new content
