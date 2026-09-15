## Why

Naming is a trap today: create a file called `groceries` and it never appears (unsupported name → hidden by the explorer's display rule); rename `note.md` to `note` and the file vanishes from the tree. Markdown is the app's primary type, so file naming should default to it and never let a supported file become invisible. (Follow-up to `tickable-task-checkboxes`/`explorer-action-bar` UX pass; reference `02436b0d`.)

## What Changes

- **New-file creation prefills the inline field with `Untitled.md`**, stem selected — typing replaces the stem, `.md` is the visible default, and the user can change it to another supported extension (e.g. `.txt`).
- **Create and rename normalize document names at confirm**: missing/blank/unsupported extension → `.md` appended (`groceries` → `groceries.md`, `notes.cpp` → `notes.cpp.md`, `note.` → `note.md`); supported extensions pass through untouched (`notes.txt` stays). Folders are never normalized.
- **Single source of truth for "displayable extension"**: the document-type registry gains `isDisplayableExtension` (claimed extensions plus plain text), replacing the duplicated extension set in the sidebar.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `file-explorer`: New requirement for document-name normalization on file create and rename, and the create-field prefill.

## Impact

- `src/core/explorer/explorerActions.ts` — pure `normalizeDocumentName` helper; rename state carries `isFolder`.
- `src/core/workspace/documentTypes.ts` — `isDisplayableExtension(ext)` method.
- `src/extensions/fileManagement.tsx` — apply normalization in `confirmInline` (file mode only) and `confirmRename` (files only); build the supported-extension predicate.
- `src/extensions/sidebar.tsx` — create field prefill + stem selection; `isDisplayableFile` uses the registry method.
- `tests/` — new Playwright harness for naming rules.
