## ADDED Requirements

### Requirement: Respect the ignored directories list
The system SHALL exclude directories whose names match the ignored-directories list from the exposed file tree. The list SHALL be user-configurable in the settings interface and SHALL have a default set applied without any configuration. Changing the list SHALL update the exposed tree without restarting the app.

#### Scenario: Ignored directory is absent from the tree
- **WHEN** the active workspace folder contains a directory whose name is in the ignored-directories list (e.g. `node_modules`)
- **THEN** that directory and everything inside it are absent from the exposed tree, without the user configuring anything first

#### Scenario: User adds a directory name to the list
- **WHEN** the user adds a directory name to the ignored-directories setting
- **THEN** that directory and its contents disappear from the exposed tree immediately, without restarting the app

#### Scenario: User removes a directory name from the list
- **WHEN** the user removes a directory name from the ignored-directories setting
- **THEN** that directory and its contents appear in the exposed tree immediately

### Requirement: Ignore list applies to change notifications
The system SHALL NOT surface file system changes that occur inside ignored directories, so they do not cause tree updates.

#### Scenario: Build tool churns inside an ignored directory
- **WHEN** files are created or modified inside a directory whose name is in the ignored-directories list (e.g. a build output directory)
- **THEN** the system does not update the exposed tree in response to those changes
