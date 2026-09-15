## Purpose

Defines the app's visual language: a macOS-native, minimal, elegant design expressed as appearance-aware theme tokens (light, dark, auto), a typography scale, spacing rhythm, control styles, and iconography. All panes, extensions, and core surfaces style against these tokens so the whole app restyles coherently.

## Requirements

### Requirement: Appearance modes
The system SHALL support three appearance modes: Light, Dark, and Auto. Auto SHALL follow the operating system's current appearance. The active mode SHALL be selectable in the settings interface and SHALL apply to the entire app immediately.

#### Scenario: Auto follows system appearance
- **WHEN** the appearance mode is set to Auto and the operating system switches from light to dark
- **THEN** the app's colors, materials, and icons switch to the dark variants without a restart

#### Scenario: Manual override
- **WHEN** the user selects Dark while the operating system is in light mode
- **THEN** the app renders in dark appearance and stays dark until the mode is changed

#### Scenario: Choice persists
- **WHEN** the user quits and relaunches the app after selecting an appearance mode
- **THEN** the app starts in the previously selected mode

### Requirement: Appearance-aware token set
The system SHALL expose a complete token set (surfaces, text hierarchy, accent, separators, materials, focus rings) as CSS custom properties, with values resolved per active appearance. Extensions SHALL NOT hardcode appearance-specific colors.

#### Scenario: Extension renders correctly in both appearances
- **WHEN** an extension styles against the token set only
- **THEN** its UI is legible and visually consistent in both light and dark appearance without extension-specific color logic

### Requirement: System typography
The system SHALL use the platform system font stack for all UI chrome, with a defined type scale (window titles, section headers, body, captions) and the existing reading-font options preserved for document content.

#### Scenario: UI chrome typography
- **WHEN** any built-in surface renders UI chrome (toolbar, sidebar, tabs, settings)
- **THEN** it uses the system font stack at the designated scale step, not a bundled web font

### Requirement: Native-feeling controls
The system SHALL provide a control vocabulary styled to macOS conventions: quiet borderless buttons for toolbar and list rows, a segmented control for mutually exclusive choices such as layout presets and settings with few options, a switch for boolean settings, and a pull-down menu for choice settings with longer option lists.

#### Scenario: Segmented preset switcher
- **WHEN** the user clicks a segment in the layout preset switcher
- **THEN** the selected segment is visibly marked as active and the layout changes accordingly

#### Scenario: Choice setting renders as a segmented control
- **WHEN** an extension contributes a choice setting with at most three options
- **THEN** the settings interface shows it as a segmented control whose active segment matches the stored value

#### Scenario: Switch reflects state
- **WHEN** a boolean setting is displayed in the settings interface
- **THEN** it renders as a switch whose visual state matches the stored value and toggles on click

### Requirement: Iconography
The system SHALL provide a single stroke-based icon set used consistently across toolbar, sidebar, tabs, and settings. Icons SHALL inherit the current text color token and SHALL be paired with a text label or an accessible name.

#### Scenario: Icons follow appearance
- **WHEN** the active appearance changes
- **THEN** icons re-tint via the text color token so they remain visible in both light and dark modes

### Requirement: Welcome state
The system SHALL present a calm, centered welcome view in the main region when no folder is open, offering a single clear action to open a folder.

#### Scenario: First launch
- **WHEN** the app launches with no previously opened folder
- **THEN** the main region shows the welcome view and the sidebar area shows no file tree
