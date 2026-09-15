# Tasks — Content-Change Reload

## 1. Rust: classify watcher events

- [x] 1.1 In `src-tauri/src/workspace.rs`, change the watcher closure to map each `notify::Event` to `(path, structural)` pairs: `EventKind::Modify(ModifyKind::Data(_))` and `ModifyKind::Metadata` are content-only, everything else structural; ignored-path filtering unchanged
- [x] 1.2 Rework the debounce thread to merge its batch into a per-path structural flag (`HashMap<String, bool>`, structural wins) and emit `FsEventPayload { changed, modified }` (sorted lists, no path in both)
- [x] 1.3 Add a unit test covering the classifier and the batch merge (create/remove/rename → structural; data modify → modified; a path with both → structural only)

## 2. Bridge and types

- [x] 2.1 Update `FsEvent` in `src/core/workspace/types.ts` to `{ changed: readonly string[]; modified: readonly string[] }`; no bridge signature change (`onFsChanged` forwards the payload)

## 3. Document reload

- [x] 3.1 Add `Document.reload(text)` in `src/core/workspace/document.ts`: swaps `#text` and emits without touching `#dirty` or `#version`; no-op when text is unchanged or the document is dirty

## 4. Workspace routing

- [x] 4.1 In `src/core/workspace/workspace.ts`, split the `onFsChanged` handler: non-empty `changed` → existing `#rescan()`; then reload affected open clean documents over `changed ∪ modified` (exact path match, skip dirty, log read failures) via `Document.reload`
- [x] 4.2 Confirm split-view consistency: reader and editor both render from the same `Document` subscription, so a reload emits once and both panes update (no new wiring; verify by inspection)

## 5. Verification

- [x] 5.1 `cargo test` in `src-tauri` passes, including the new classification/merge test
- [x] 5.2 Lint, typecheck, and existing suites pass (`test:safety`, `test:ticks`, `test:naming`, `test:links`, `test:ui`); `npm run build` clean
- [ ] 5.3 Manual: open a document, edit it externally (another editor saves), the reader/editor picks up the new text without a tree rescan and stays clean; repeat with a dirty document — buffer is kept; externally create/rename/delete files — tree updates as before and deletion of an open document still signals

## 6. Regression test for the reload route (bug-fix revision)

- [x] 6.1 Confirm the app under test is rebuilt from current sources (Rust binary recompiled, dev server restarted) — rule out the stale-binary candidate before debugging
- [x] 6.2 Add a UI test (Playwright harness, following `tests/file-management.mjs`'s listener stub) that emits `{ changed: [], modified: [path] }` after changing the stubbed file contents, and asserts an open clean document re-renders the new text and stays clean (`tests/content-reload.mjs`)
- [x] 6.3 Add a test that emits a `modified` event for a dirty document and asserts the in-app buffer is kept
- [x] 6.4 Add a test that emits the event via the rename-save shape (`changed: [path]`) and asserts the open clean document still re-reads the new content

## 7. Fix the confirmed root cause

- [x] 7.1 Diagnosed via the section-6 tests: the event pipeline works end to end; the reader renders through the version-keyed AST cache in `src/extensions/markdown.ts`, so a reloaded document's stale AST is served. Fix: key the cache entry on the document text (`{ text, ast }`, hit when `cached.text === document.text`), preserving D4's version semantics
- [x] 7.2 n/a — resolved by 7.1: the route passed in test and the defect was in the render path, not path normalization or the listener-attach race
- [x] 7.3 n/a — resolved by 7.1: no live-delivery investigation needed

## 8. Verification (bug-fix revision)

- [x] 8.1 New tests from section 6 pass; existing suites (`test:ui`, `test:safety`, `test:naming`, `test:links`, `test:ticks`, `tests/search.mjs`, `tests/file-management.mjs`) and `cargo test` still pass; `npm run build` clean. Note: `tests/search.mjs` fails its "sidebar search … input should collapse" check both with and without this change — pre-existing, owned by another active change, not caused here
- [ ] 8.2 Complete the manual verification in 5.3 and check it off
