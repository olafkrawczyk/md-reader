## Purpose

Provides the native macOS application shell: window management, folder selection, and serving of extension module files to the UI runtime.

## ADDED Requirements

### Requirement: Native macOS application window
The system SHALL present itself as a native macOS application window with standard window behavior (resize, fullscreen, focus), launched without a bundled browser engine UI chrome.

#### Scenario: Launch app
- **WHEN** the user launches the application
- **THEN** a native macOS window opens with no browser chrome and a reasonable default size

### Requirement: Open a folder via native dialog
The system SHALL let the user pick a folder using the macOS-native folder selection dialog, and that folder SHALL become the active workspace.

#### Scenario: User opens a folder
- **WHEN** the user triggers "Open Folder" and selects a folder in the native dialog
- **THEN** the selected folder becomes the active workspace and its contents become available to the app

### Requirement: Serve extension modules over a custom URI protocol
The system SHALL serve JavaScript module files from a designated local directory via a custom URI scheme, with a JavaScript MIME type, such that the UI runtime can load them as ES modules via dynamic `import()`.

#### Scenario: Dynamic import of a served module
- **WHEN** the UI runtime calls `import()` on a module URL served by the custom protocol
- **THEN** the module loads and its exports are callable

#### Scenario: Module served with correct MIME type
- **WHEN** a `.js` module file is requested through the custom protocol
- **THEN** the response content type SHALL be a JavaScript module MIME type
