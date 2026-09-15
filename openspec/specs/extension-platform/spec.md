## Purpose

The extension host: manifest-driven lifecycle, a typed service registry for inter-extension contracts, transformer pipelines per document type, schema-driven settings, and theme tokens. Every product feature ships through this contract, including the built-ins.

## Requirements

### Requirement: Extension lifecycle via activate
The system SHALL load every extension — built-in or external — through a manifest that declares its identity and entry module, and SHALL initialize it by calling an activate entry point with an API object. Core SHALL treat built-in and external extensions identically except for module location.

#### Scenario: Built-in extension activates
- **WHEN** the app starts
- **THEN** every built-in extension's activate entry point is called exactly once with the API object

#### Scenario: Extension activation failure is isolated
- **WHEN** an extension's activate entry point throws
- **THEN** the app continues to run and remaining extensions still activate

### Requirement: Typed service registry
The system SHALL let extensions register services under stable keys and consume services registered by others. A consumer SHALL be able to act on a service becoming available, since registration order across extensions is not guaranteed.

#### Scenario: Consume a registered service
- **WHEN** a service is registered under a key an extension consumes
- **THEN** the consumer can invoke the service regardless of which extension activated first

### Requirement: Transformer pipelines per document type
The system SHALL let extensions attach transformers to the processing pipeline of a claimed document type, and SHALL run attached transformers in a deterministic order before rendered output is produced.

#### Scenario: Transformer affects rendered output
- **WHEN** a transformer is attached to the markdown pipeline and a document is rendered in a reading pane
- **THEN** the rendered output reflects the transformer's changes to the intermediate representation

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

### Requirement: Theme token contract
The system SHALL expose a stable set of theme tokens (colors, fonts, spacing) that extensions SHALL style against, so that changing the theme restyles all extensions consistently.

#### Scenario: Theme change restyles extensions
- **WHEN** the active theme changes token values
- **THEN** UI contributed by extensions that styles against tokens reflects the new values

### Requirement: Document type claiming
The system SHALL let an extension claim a document type (e.g. a new markup format) and provide its processing services, after which files of that type are openable and viewable without core changes.

#### Scenario: New document type becomes openable
- **WHEN** an extension claims a new document type and the user opens a matching file
- **THEN** the file opens as a document and is routed to panes that declared that type viewable
