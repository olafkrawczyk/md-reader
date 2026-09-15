## Purpose

Provides the native macOS application shell: window management, folder selection, and serving of extension module files to the UI runtime.

## Requirements

### Requirement: Native macOS application window
The system SHALL present itself as a native macOS application window with standard window behavior (resize, fullscreen, focus), using an integrated toolbar window style: the window title is hidden and the traffic-light controls are inset into the app's own toolbar so the toolbar sits flush with the top of the window.

#### Scenario: Launch app
- **WHEN** the user launches the application
- **THEN** a native macOS window opens with no browser chrome, its traffic lights inset into the app toolbar, and a reasonable default size

#### Scenario: Toolbar drag region
- **WHEN** the user drags the empty area of the toolbar
- **THEN** the window moves, while clicks on toolbar controls do not move the window

### Requirement: Unified toolbar
The system SHALL provide a single unified toolbar as the app's primary chrome, containing: an open-folder action, the workspace folder name, the layout preset switcher as a segmented control, extension-contributed toolbar items, and the settings entry point. The app SHALL NOT render any separate title bar or inline settings panel in the content area.

#### Scenario: Toolbar identifies the workspace
- **WHEN** a folder is open
- **THEN** the toolbar shows the workspace folder's name alongside the open-folder action

#### Scenario: Settings opens the settings surface
- **WHEN** the user clicks the settings toolbar item
- **THEN** the settings surface opens and the content area does not reflow to accommodate an inline panel

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
