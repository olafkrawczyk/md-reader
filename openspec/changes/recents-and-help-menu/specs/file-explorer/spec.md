## MODIFIED Requirements

### Requirement: Empty workspace state
The system SHALL show a brief, quiet message in the sidebar area when no folder is open. The message SHALL NOT carry its own open-folder action; opening a folder is offered by the main region and the native menu.

#### Scenario: Prompt before a folder is opened
- **WHEN** no workspace folder is open
- **THEN** the sidebar area shows the message and offers no action of its own
