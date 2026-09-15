## Purpose

Getting the app out of the dev loop and onto the machine: producing an installable release bundle, installing it to /Applications, and launching it from any terminal with a short command.

## ADDED Requirements

### Requirement: Release bundle build
The system SHALL provide a single build command that produces a macOS `.app` bundle from a clean checkout, running the frontend build and the Tauri release build with no manual steps. The produced bundle SHALL launch the app in release mode (no dev server, no console dependency).

#### Scenario: Clean build from a fresh clone
- **WHEN** a developer runs the documented build command on a machine with the toolchain installed
- **THEN** a `.app` bundle is produced at a predictable output path without intermediate errors

#### Scenario: Bundle launches standalone
- **WHEN** the produced bundle is opened (double-click or `open`)
- **THEN** the app runs in release mode with no terminal attached

### Requirement: Install to Applications
The system SHALL provide an install step that copies the built `.app` bundle into `/Applications`, replacing a previously installed copy. Rebuilding SHALL NOT be required to reinstall an already-built bundle.

#### Scenario: Fresh install
- **WHEN** the user runs the install step after a successful build
- **THEN** the bundle is present at `/Applications/md-reader.app` and launches from there

#### Scenario: Reinstall over existing
- **WHEN** the install step runs again after a rebuild
- **THEN** the previous copy is replaced without leaving duplicate bundles

### Requirement: CLI launcher on PATH
The system SHALL install a `md-reader` command available on the shell's `PATH` that opens the app. Running the command SHALL launch the app if it is not running, or bring the running instance to the foreground if it is. The command SHALL accept an optional path argument, which SHALL be ignored functionally (no file or folder opening) in this change.

#### Scenario: Launch from terminal
- **WHEN** the user runs `md-reader` in any shell
- **THEN** the app window opens

#### Scenario: Single instance
- **WHEN** the app is already running and the user runs `md-reader` again
- **THEN** no second instance starts; the existing window comes to the foreground

#### Scenario: Available from any shell session
- **WHEN** the user opens a new terminal session after install
- **THEN** `md-reader` resolves on `PATH` without further configuration