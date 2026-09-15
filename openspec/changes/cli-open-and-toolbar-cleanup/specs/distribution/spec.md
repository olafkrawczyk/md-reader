## MODIFIED Requirements

### Requirement: CLI launcher on PATH
The system SHALL install a `md-reader` command available on the shell's `PATH` that opens the app. Running the command SHALL launch the app if it is not running, or bring the running instance to the foreground if it is. The command SHALL accept an optional path argument: a file path SHALL open that file in the app (activating the file's parent folder as the workspace and opening the file as the active document), and a folder path SHALL activate that folder as the workspace. Running the command with no path argument SHALL NOT change the app's current workspace.

#### Scenario: Launch from terminal
- **WHEN** the user runs `md-reader` in any shell
- **THEN** the app window opens

#### Scenario: Single instance
- **WHEN** the app is already running and the user runs `md-reader` again
- **THEN** no second instance starts; the existing window comes to the foreground

#### Scenario: Available from any shell session
- **WHEN** the user opens a new terminal session after install
- **THEN** `md-reader` resolves on `PATH` without further configuration

#### Scenario: Open a single file from the CLI
- **WHEN** the user runs `md-reader <path-to-markdown-file>`
- **THEN** the app opens with the file's parent folder active as the workspace and the file open as the active document

#### Scenario: Open a folder from the CLI
- **WHEN** the user runs `md-reader <path-to-folder>` (including `md-reader ./` for the current directory)
- **THEN** the app opens with that folder active as the workspace

#### Scenario: Open a path in a running instance
- **WHEN** the app is already running and the user runs `md-reader <path>`
- **THEN** the running window comes to the foreground, the path's folder becomes the active workspace, and — for a file path — the file opens as the active document

#### Scenario: No argument preserves the workspace
- **WHEN** the user runs `md-reader` with no path argument while a workspace is already open
- **THEN** the previously active workspace remains active
