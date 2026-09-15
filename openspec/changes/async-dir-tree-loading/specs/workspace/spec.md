## ADDED Requirements

### Requirement: Non-blocking tree loading
The system SHALL load the workspace file tree without blocking the app's event loop, so the app remains responsive while the directory scan is in progress.

#### Scenario: Open a large folder
- **WHEN** the user opens a workspace folder containing a large number of files and subfolders
- **THEN** the app UI remains responsive during the scan and the tree appears once the scan completes
