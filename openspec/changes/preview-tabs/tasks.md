## 1. Tab store

- [x] 1.1 Add `#previewPath: string | null` and expose `preview` on `TabInfo`; `open(path)` clears `#previewPath` when it matches (permanent open)
- [x] 1.2 Implement `openPreview(path)`: remove a different clean preview tab first (via `#removeTab`, no close guard), then open/activate the target and set `#previewPath`
- [x] 1.3 Promote on first edit: in the per-document dirty subscription (tabStore.ts:117-119), clear `#previewPath` when the previewed document's dirty flag flips true

## 2. Tab strip UI

- [x] 2.1 Render preview tabs with a `data-preview` attribute and italic `.mdr-tab-name` styling in `TabStrip.tsx` + CSS
- [x] 2.2 Add tab `onDoubleClick` handler that promotes the tab to permanent (`open(path)`)

## 3. Explorer and search

- [x] 3.1 `sidebar.tsx`: file-row `onClick` → `tabs.openPreview(path)`; add row `onDoubleClick` → `tabs.open(path)`; update the memoized `RowHandlers` object
- [x] 3.2 SKIPPED (deliberate): the search extension is a filename filter + in-document find only — it never opens files from results, so there is no search open path to switch. No code change required.

## 4. Verification

- [x] 4.1 Typecheck, lint, `cargo` untouched (frontend-only change); frontend suites pass (`test:safety`, `test:ticks`, `test:naming`, `test:ui`)
- [ ] 4.2 Manual: single-click several files → one preview tab, italic, replaced each time; double-click row/tab → promotion; edit a preview → becomes permanent; edit + preview another file → no close-guard dialog, both tabs remain; search result opens as preview; CLI-opened file stays permanent
