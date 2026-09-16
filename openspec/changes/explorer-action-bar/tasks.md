## 1. Controller surface (selection-aware create)

- [x] 1.1 In `src/extensions/fileManagement.tsx`, extend the create entry point so the sidebar can request creation at an explicit parent path: replace the root-bound `beginCreate(mode)` service surface with a selection-aware form (accept a resolved parent, or a resolver the sidebar passes at click time); keep `#beginCreate(parentPath, mode)` behavior unchanged
- [x] 1.2 Update `src/core/explorer/explorerActions.tsx` service types (`ExplorerUiService` or equivalent) and the `explorerUiKey` registration in `fileManagement.tsx` to match the new surface; ⌘N / ⌘⇧N menu actions still create at root (menu layer resolves root as before)
- [x] 1.3 Run `npm run lint` and `npm run typecheck` (or repo equivalents) — no regressions from the surface change

## 2. Explorer action bar UI

- [x] 2.1 In `src/extensions/sidebar.tsx`, add an action-bar region at the bottom of the explorer `<nav>`: New File and New Folder `QuietButton`s on the left, always-visible filter input filling the remainder on the right
- [x] 2.2 Compute the create target per design D5/D2 at click time: last-clicked tree row (folder → inside it, file → its parent), falling back to the active document's parent, then the workspace root; extend the clicked-row selection treatment to folder rows so the target is visible
- [x] 2.3 Wire the buttons through the controller path from 1.1 so the inline field opens at the target and the created entry is revealed (existing `handleConfirmInline` reveal logic)
- [x] 2.4 Delete the search toggle: remove `searchOpen` from `ExplorerState`/`explorerReducer`, render the filter input unconditionally in the action bar, keep live filtering and forced folder expansion via the existing `query` flow
- [x] 2.5 Filter field behavior: clear (ⓧ) affordance appears only when text is present and clicking it clears + refocuses; Escape clears the query; field keeps focus unless the user clicks away
- [x] 2.6 Keep the bar (and toolbar removal) out of the empty-workspace state — the "No folder open" branch is untouched

## 3. Toolbar removal

- [x] 3.1 Delete `ToolbarFileActions` and its `api.ui.register({ id: "explorer-file-actions", slot: "toolbar", ... })` block in `src/extensions/fileManagement.tsx`
- [x] 3.2 Grep for other `explorer-file-actions` / `toolbar`-slot consumers and clean up any now-dead registration or styling assumptions

## 4. Styling

- [x] 4.1 In `src/theme.css`, add action-bar styles per the visual-design-system tokens: single row, quiet buttons, compact always-visible text field with clear affordance; remove the `.mdr-explorer-search-button` styles and the standalone header search styles
- [x] 4.2 Verify both appearances (light/dark) tint icons and field correctly via the existing token set

## 5. Verification

- [ ] 5.1 Manual pass against the spec scenarios: bar always visible with a folder open; no creation buttons in the toolbar; create inside selected folder / beside selected file / at root; type-to-filter with expanded match folders; clear affordance and Escape; empty-workspace state unchanged
- [x] 5.2 Manual pass that ⌘N / ⌘⇧N and the context menu's New File / New Folder still work and that document find (⌘F) is unaffected — document find covered by `tests/search.mjs`; the filter field's Escape and ⓧ paths are now asserted there too (the suite had still been asserting the removed toggle)
- [x] 5.3 Run lint, typecheck, and the test suite; fix or file anything they surface
