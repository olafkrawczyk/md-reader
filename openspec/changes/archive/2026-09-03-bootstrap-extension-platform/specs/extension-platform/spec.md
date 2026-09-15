## Purpose

The extension host: manifest-driven lifecycle, a typed service registry for inter-extension contracts, transformer pipelines per document type, schema-driven settings, and theme tokens. Every product feature ships through this contract, including the built-ins.

## ADDED Requirements

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
The system SHALL let extensions contribute settings with a schema (key, type, allowed values where applicable), SHALL render all contributed settings in one generic settings interface without per-extension UI code, and SHALL apply setting changes live without restart.

#### Scenario: Contributed setting appears in settings UI
- **WHEN** an extension contributes a choice setting
- **THEN** the settings interface shows it with its allowed values

#### Scenario: Setting change applies live
- **WHEN** the user changes a setting value
- **THEN** the affected behavior updates immediately without restarting the app

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
