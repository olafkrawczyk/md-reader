## Why

Every debounced file system event triggers a full workspace tree rescan (`readDirTree`), even when only a file's content changed and the tree is untouched. This wastes CPU on every external save burst. Worse, content-only changes are functionally invisible: a rescan rebuilds tree structure but never re-reads file contents, so an open document keeps showing stale text after another editor saves it.

## What Changes

- Classify watcher events in the Rust backend by kind: structural (create/remove/rename) vs content-only (modify), coalesced per-path during the 250ms debounce batch with "structural wins" resolution (a path touched by any structural event in a batch is treated as structural).
- Extend the `workspace-fs-changed` payload to carry two lists: `changed` (structural) and `modified` (content-only), replacing the single `paths` list. **BREAKING** (internal event contract between backend and frontend).
- Route events in the `Workspace` frontend layer: structural paths trigger the existing rescan; content-only paths trigger a targeted re-read of each affected *open* document only — no tree walk at all.
- Add `Document.reload(text)`: swaps in externally modified text without setting the dirty flag, so clean documents stay clean after an external edit.
- Dirty documents ignore external content changes (buffer wins; last writer wins on save) — consistent with the accepted tradeoff recorded in `unsaved-changes-protection-and-autosave/design.md`, which explicitly defers external-modification conflict UI.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `workspace`: The "Reflect external file system changes" requirement now also covers content-only modifications: open clean documents SHALL reflect external content changes without a rescan, and dirty documents SHALL NOT be overwritten by external changes.

## Impact

- `src-tauri/src/workspace.rs`: capture `notify::Event.kind`, classify per-path during debounce batching, new payload shape.
- `src/core/workspace/types.ts` + `bridge.ts`: `FsEvent` payload gains `changed`/`modified` fields.
- `src/core/workspace/workspace.ts`: `onFsChanged` handler splits into rescan vs. `#reloadModified` routes.
- `src/core/workspace/document.ts`: new `reload` mutation preserving clean/dirty invariants.
- No new dependencies; watcher infrastructure, ignore-list filtering, and deletion signaling are unchanged.

## Bug-Fix Revision (2026-09-11)

Field report: with the above implemented, an external save still never updates an open document's text. Static review finds the routing and classification correct on paper, but the `modified` → reload route has no test coverage and the required manual verification was never performed. The change now includes a diagnosis-first bug-fix pass: reproduce the reload route with a UI test, fix the confirmed root cause (candidates: stale app binary; event-path vs document-path form mismatch dropped by exact-match lookup; watcher events lost between `activateWorkspace` and listener attach; FSEvents delivery), and re-verify manually per task 5.3.