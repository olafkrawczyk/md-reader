## ADDED Requirements

### Requirement: Document name normalization
When a file is created or renamed, the system SHALL normalize the resulting name: a name whose extension is missing, blank, or not displayable SHALL receive the `.md` extension appended to the full typed name; a name with a displayable extension SHALL pass through unchanged. Folder names SHALL NOT be normalized.

#### Scenario: Create without an extension
- **WHEN** the user creates a file named `groceries`
- **THEN** the file `groceries.md` is created and revealed in the explorer

#### Scenario: Create with a supported extension
- **WHEN** the user creates a file named `notes.txt`
- **THEN** the file is created as `notes.txt`

#### Scenario: Create with an unsupported extension
- **WHEN** the user creates a file named `notes.cpp`
- **THEN** the file is created as `notes.cpp.md` and remains visible in the explorer

#### Scenario: Create with a blank extension
- **WHEN** the user creates a file named `note.`
- **THEN** the file is created as `note.md`

#### Scenario: Rename that drops the extension
- **WHEN** the user renames `note.md` to `note`
- **THEN** the file becomes `note.md` and stays visible in the explorer

#### Scenario: Folders are never normalized
- **WHEN** the user creates or renames a folder named `docs`
- **THEN** the folder is named exactly `docs`

### Requirement: New-file field prefill
When the user starts creating a file, the inline naming field SHALL contain `Untitled.md` with the stem (`Untitled`) selected, so typing replaces the stem while the `.md` default stays visible and editable.

#### Scenario: Prefilled create field
- **WHEN** the user triggers New File from the action bar or context menu
- **THEN** the inline field contains `Untitled.md` with the stem selected, and confirming the untouched field creates `Untitled.md`

#### Scenario: Replace stem, keep extension
- **WHEN** the user types `groceries` over the selected stem and confirms
- **THEN** the file is created as `groceries.md`
