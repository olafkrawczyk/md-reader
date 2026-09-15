## MODIFIED Requirements

### Requirement: System typography
The system SHALL use the platform system font stack for all UI chrome, with a defined type scale (window titles, section headers, body, captions) and the existing reading-font options preserved for document content. For bundled reading fonts, the system SHALL load every font face (weight and style variant) referenced by the design so no type is rendered with browser-synthesized bold or italic. Text SHALL render with the platform's default text antialiasing — the system SHALL NOT apply a global font-smoothing override that thins text — and SHALL NOT show a visible font swap or layout shift when fonts finish loading.

#### Scenario: UI chrome typography
- **WHEN** any built-in surface renders UI chrome (toolbar, sidebar, tabs, settings)
- **THEN** it uses the system font stack at the designated scale step, not a bundled web font

#### Scenario: Bold content uses a real bold face
- **WHEN** document content or UI renders text in a bundled reading font at a weight or style other than regular
- **THEN** a matching loaded font face is used and no synthetic (faux) bold or italic is rendered

#### Scenario: Crisp text rendering
- **WHEN** text is rendered anywhere in the app
- **THEN** it uses the platform's default antialiasing so strokes render at normal weight and remain crisp

#### Scenario: No font swap on launch
- **WHEN** the app launches and bundled fonts finish loading
- **THEN** already-rendered text does not visibly swap typefaces or reflow
