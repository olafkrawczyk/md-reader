## MODIFIED Requirements

### Requirement: Closing tabs
The system SHALL let the user close any tab via its close affordance, a middle click, or a close-tab keyboard shortcut. Closing a tab with unsaved changes SHALL present a Save / Discard / Cancel dialog before closing; Cancel SHALL abort the close, Save SHALL save the document and close the tab, and Discard SHALL close the tab without saving. The tab's unsaved state SHALL be indicated before closing via the dirty marker.

#### Scenario: Close the active tab
- **WHEN** the user closes the active tab
- **THEN** the tab is removed and an adjacent tab becomes active

#### Scenario: Close the last tab
- **WHEN** the user closes the only open tab
- **THEN** the tab strip disappears and the main region shows the welcome state

#### Scenario: Dirty indicator
- **WHEN** the active document has unsaved changes
- **THEN** its tab shows an unsaved-changes marker instead of a plain close affordance until the document is saved

#### Scenario: Close a dirty tab
- **WHEN** the user closes a tab whose document has unsaved changes and chooses Save
- **THEN** the document is saved and the tab closes

#### Scenario: Cancel closing a dirty tab
- **WHEN** the user closes a tab whose document has unsaved changes and chooses Cancel
- **THEN** the tab remains open and unchanged
