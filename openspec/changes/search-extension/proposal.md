# Search Extension

## Why

The app has no way to find text in the open document or locate files by name within the workspace. Both are table stakes for a reading/editing app, and the extension platform's service registry makes a pluggable search provider cheap to introduce now — so a future content-search backend (e.g. qmd) can swap in without UI changes.

## What Changes

- New `@mdr/search` extension providing:
  - A shared `SearchService` (registered via the service registry) with two capability-declared facets: in-document find and workspace filename filtering. A default in-memory implementation ships in the extension; other extensions may re-register the service to replace it.
  - A Safari-style find bar overlay over the content area, opened with ⌘F, targeting the focused document pane (reader or editor) showing the active document. Enter/↓/↑ and buttons navigate matches; Esc closes; match count is shown ("3 of 17").
  - Search target adapters per pane: the editor implements find over the `@codemirror/search` headless API; the reader over the CSS Custom Highlight API (no DOM mutation).
- Sidebar filename search: a magnifier icon in a new explorer header row unfolds an in-place search input (autofocused). Typing prunes the tree to matching filenames (all depths), auto-expands folders containing matches, and closes/collapses on empty query or Esc.
- Global keydown handling in `App.tsx` gains the ⌘F trigger (delegating to the search extension's behavior).
- No Rust changes; no content search across files (future work).

## Capabilities

### New Capabilities

- `search`: The search provider contract (in-document find + filename filter, capability-declared), the find bar UI, keyboard triggering, and focused-pane targeting semantics in split layouts.

### Modified Capabilities

- `file-explorer`: New requirements for the explorer header search input — unfold-on-click, autofocus, in-place tree filtering with auto-expansion of matching folders.

## Impact

- `src/extensions/` — new `search.tsx` extension; `sidebar.tsx` gains the header/search input; `editor.tsx` and `reader.tsx` register search target adapters.
- `src/core/extension/` — pane host contract may gain a way for panes to expose search targets (design decision, see design.md).
- `src/App.tsx` — ⌘F handling.
- `src/theme.css` — find bar, match highlights (`::highlight()`), and explorer header styles.
- Dependency: `@codemirror/search` already present; no new packages.
- Risk: CSS Custom Highlight API requires Safari 18.2+ (macOS 15+) WKWebView; fallback strategy in design.md.
