## 1. Spike

- [x] 1.1 Verify CSS Custom Highlight API availability in the app's WKWebView (tiny probe: register a highlight, confirm `CSS.highlights`); record outcome and pick adapter strategy per design D2
- [x] 1.2 SKIPPED (deliberate): the Highlight API is available (macOS 26.5 runtime; TS gap closed via `src/types/highlight-registry.d.ts`; runtime feature-detect guards the reader adapter), so the fallback condition does not apply. No code change required.

> 1.2 deliberate skip: the Highlight API is available (macOS 26.5 runtime; TS gap closed via `src/types/highlight-registry.d.ts`; runtime feature-detect guards the reader adapter), so the fallback condition does not apply.

## 2. Provider contract and default service

- [x] 2.1 Define `SearchService` key and interfaces (capabilities, `findInDocument`, `filterFileNames`) in the extension core types, per design D1
- [x] 2.2 Implement default in-memory provider: case-insensitive filename filter over the `FileEntry` tree (flat index + pruned-tree rebuild)
- [x] 2.3 Register the provider from `@mdr/search` activation; write unit tests for filter behavior (matches at depth, pruning, case-insensitivity)

## 3. Search targets (panes)

- [x] 3.1 Add the search-target registry (pane id → `SearchTarget` factory) per design D3
- [x] 3.2 Implement editor search target over `@codemirror/search` headless API (find, next, prev, clear, match count)
- [x] 3.3 Implement reader search target using the chosen highlight strategy (probe result from 1.1), including current-match emphasis and scroll-into-view
- [x] 3.4 Unit-test match counting and wrap navigation semantics against both targets

## 4. Find bar UI

- [x] 4.1 Build the find bar chrome overlay component (query field, count "N of M", prev/next/close buttons) styled with `--mdr-*` tokens
- [x] 4.2 Wire focused-pane targeting: resolve target via pane `focused` flag with reader → first-document-pane fallback
- [x] 4.3 Handle lifecycle: clear highlights and restore pane focus on close; suppress open when no document is active

## 5. Sidebar filename search

- [x] 5.1 Add explorer header row with search icon and unfolding, autofocused input (sidebar owns fold state)
- [x] 5.2 Wire the input to the provider's `filterFileNames`, auto-expanding folders containing matches while a query is active
- [x] 5.3 Restore the unfiltered tree and collapse the input on empty query or Escape

## 6. App wiring

- [x] 6.1 Add ⌘F to the global keydown handler in `App.tsx`, delegating to the search extension's open action

## 7. Styling

- [x] 7.1 Theme match highlights (including current match) and find bar for light and dark appearances using existing tokens
- [x] 7.2 Style explorer header, unfold animation, and search input to match the explorer's visual language

## 8. Verification

- [x] 8.1 Manual pass: find in reader, find in editor, reader|editor split with each pane focused, focus-outside-panes fallback, wrap navigation, Escape behavior
- [x] 8.2 Manual pass: sidebar search unfold/filter/restore with nested folders and collapsed folders containing matches
- [x] 8.3 Run lint and typecheck; run existing test suite
