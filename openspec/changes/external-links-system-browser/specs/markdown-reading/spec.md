## ADDED Requirements

### Requirement: External links open in the system browser
The reading pane SHALL open `http` and `https` links in the system browser via the OS, and SHALL delegate `mailto:` links to the OS. The app webview SHALL NOT navigate in response to any link click inside rendered content — including broken, unreachable, or non-HTTP links — so a bad link can never crash or replace the app.

#### Scenario: Web link goes to the system browser
- **WHEN** the user clicks a link whose target is an `http` or `https` URL
- **THEN** the URL is handed to the system browser and the reading pane remains unchanged

#### Scenario: Broken link does not crash or navigate
- **WHEN** the user clicks a link pointing at an unreachable or invalid URL
- **THEN** the webview does not navigate, the app keeps running, and any failure surfaces outside the app window (in the system browser)

#### Scenario: Mail links are delegated
- **WHEN** the user clicks a `mailto:` link
- **THEN** the OS mail handler is invoked and the webview does not navigate

#### Scenario: Non-URL links never navigate the app
- **WHEN** the user clicks a link with a relative or non-HTTP target
- **THEN** the webview does not navigate
