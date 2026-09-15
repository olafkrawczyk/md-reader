## Why

Every explorer single click permanently opens a tab; a few clicks leave a dozen tabs behind. Users need to browse files without committing to each one. A preview-tab model (as in VS Code): single click soft-opens a marked preview tab that is replaced by the next preview; double click or editing opens it for good.

## What Changes

- Explorer single-click opens a file as a **preview tab**: exactly one preview tab exists at a time; the next preview closes the previous one (clean tabs only) and takes its place.
- The preview tab is visually marked with an **italic tab name**.
- A preview tab becomes permanent (unmarked) when the user **double-clicks the explorer row, double-clicks the tab, or edits the document** (first dirty state promotes it) — promotion is required so dirty preview tabs never hit the close guard on replacement.
- Double-click behavior needs no timing hacks: the two single clicks are idempotent preview-opens of the same file, then `dblclick` promotes.
- Search results soft-open as previews; CLI-opened files stay permanent opens.
- Out of scope: "keep" button on the tab itself, multiple simultaneous previews, per-pane preview tabs.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `file-explorer`: single-click now opens the file as a preview tab instead of a permanent tab (selection/highlight behavior unchanged).
- `document-tabs`: add a preview-tab lifecycle requirement — single preview slot, replacement on next preview, italic marker, promotion via double-click or first edit.

## Impact

- `src/core/tabs/tabStore.ts`: `#previewPath` state; `openPreview(path)` (replace-then-open); `TabInfo.preview` flag; promotion on the existing per-document dirty subscription (tabStore.ts:117-119); preview replacement must bypass/never need the close guard (only clean previews are auto-closed).
- `src/core/tabs/TabStrip.tsx`: render `preview` tabs with an italic name (new class + CSS); tab double-click handler promotes.
- `src/extensions/sidebar.tsx`: file-row `onClick` → preview open (sidebar.tsx:535-540), new `onDoubleClick` → permanent open; memoized handler objects updated.
- `src/extensions/search.tsx` (or its open path): switch to preview opens.
- CLI open path (`App.tsx` / `appShellHooks.ts`) unchanged.
- CSS: `.mdr-tab-name` italic variant under the visual design system's tab styles.
