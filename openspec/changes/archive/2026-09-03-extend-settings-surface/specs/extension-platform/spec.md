## MODIFIED Requirements

### Requirement: Schema-driven settings with generic UI
The system SHALL let extensions contribute settings with a schema (key, type, allowed values where applicable), SHALL render all contributed settings in one generic settings interface without per-extension UI code, and SHALL apply setting changes live without restart. Supported setting types SHALL be choice, boolean, text, and number. Number settings SHALL declare a default and optional bounds and step; the settings interface SHALL render them as a stepper whose value is clamped to the declared bounds and which steps by the declared increment. The settings interface SHALL be a native-styled settings window with a sidebar or grouped sections, one row per setting with a label on the left and its control on the right, using the design system's control vocabulary (switch for boolean, segmented control for choice settings with few options or pull-down for longer lists, text field for text, stepper for number) grouped by contributing extension.

#### Scenario: Contributed setting appears in settings UI
- **WHEN** an extension contributes a choice setting
- **THEN** the settings window shows it as a row in the contributing extension's group with a pull-down of its allowed values

#### Scenario: Setting change applies live
- **WHEN** the user changes a setting value
- **THEN** the affected behavior updates immediately without restarting the app

#### Scenario: Settings window opens over the app
- **WHEN** the user opens settings from the toolbar
- **THEN** the settings window appears without unmounting the main content, and closing it returns the user to the previous state

#### Scenario: Number setting renders as a stepper
- **WHEN** an extension contributes a number setting with bounds and an increment
- **THEN** the settings window shows it as a stepper, and stepping past the declared bounds clamps the value

#### Scenario: Number setting honors declared increment
- **WHEN** the user steps a number setting whose declared increment is 2
- **THEN** each step changes the stored value by 2