## MODIFIED Requirements

### Requirement: Schema-driven settings with generic UI
The system SHALL let extensions contribute settings with a schema (key, type, allowed values where applicable), SHALL render all contributed settings in one generic settings interface without per-extension UI code, and SHALL apply setting changes live without restart. The settings interface SHALL be a native-styled settings window with a sidebar or grouped sections, one row per setting with a label on the left and its control on the right, using the design system's control vocabulary (switch for boolean, segmented control for choice settings with few options or pull-down for longer lists, text field for text) grouped by contributing extension.

#### Scenario: Contributed setting appears in settings UI
- **WHEN** an extension contributes a choice setting
- **THEN** the settings window shows it as a row in the contributing extension's group with a pull-down of its allowed values

#### Scenario: Setting change applies live
- **WHEN** the user changes a setting value
- **THEN** the affected behavior updates immediately without restarting the app

#### Scenario: Settings window opens over the app
- **WHEN** the user opens settings from the toolbar
- **THEN** the settings window appears without unmounting the main content, and closing it returns the user to the previous state
