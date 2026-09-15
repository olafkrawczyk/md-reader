## Context

The workspace layer (`src/core/workspace/`) already owns the tree, the debounced watcher/rescan loop, and open documents; the Tauri backend (`src-tauri/src/workspace.rs`) exposes read commands plus `write_text_file`, whose containment pattern (`ensure_inside` on a canonicalized path) is the established safety check. The explorer UI lives in the `@mdr/sidebar` extension and renders rows from the reactive tree source. The extension platform provides a typed service registry with "act on service becoming available" semantics, which is the intended contract for cross-extension features. Motivation: see proposal.md.

## Goals / Non-Goals

**Goals:**
- One mutation path: Rust commands → bridge → Workspace methods → ExtensionApi; the tree updates only through the existing watcher/rescan loop.
- Containment enforcement lives entirely in the backend, mirroring `write_text_file`.
- Dirty open documents survive rename/move without user-visible loss.
- No new dependencies (npm or Rust); no second tree-update mechanism; UI never blocked by a long copy.

**Non-Goals:**
- Multi-select, clipboard-paste across workspaces, or undo.
- Watching/renaming files outside the active workspace.
- Replacing the existing read/save document pipeline.

## Decisions

### Backend: four new Tauri commands, not the fs plugin
`create_entry(path, kind)`, `rename_entry(from, to)`, `copy_entry(from, to)`, `delete_entry(path)`. Each resolves paths against the workspace root (accepting workspace-relative paths), canonicalizes the deepest existing ancestor (so `create` works for not-yet-existing paths, like `write_text_file` does for its parent), and calls `ensure_inside`. `create_entry` uses mkdir-p semantics for parents. `rename_entry`/`copy_entry` reject a destination that exists.

- *Alternative considered*: `@tauri-apps/plugin-fs` — no per-workspace containment validation and would add a dependency for behavior we must own anyway.

### Blocking work off the main thread
`copy_entry` on a large subtree runs on `tauri::async_runtime::spawn_blocking` so the UI thread stays free; the small ops (create/rename/delete) stay plain commands. This is the entire performance story on the backend — the frontend is already reactive over the debounced watcher.

### Tree updates: watcher only, no optimistic patching
Mutations complete, the OS watcher fires, the debounced rescan updates the tree. Spec forbids a second update mechanism, and optimistic patching would need rollback logic on failure for near-zero latency gain (the 250 ms debounce already applies to external changes; a mutation's own event rides the same window).

- *Alternative considered*: optimistic in-memory tree patch on each operation — rejected: two sources of truth, rollback complexity, no observable win.

### Dirty-document retargeting in Workspace, synchronously
The Workspace mutation methods know the source and destination, so on rename/move success they re-key affected open documents (a moved folder retargets every open document under it) before the rescan lands, preserving in-memory text and dirty state. Delete keeps the existing deleted-document signal path.

- *Alternative considered*: diffing rescans to infer renames — rejected: heuristic, and a same-content copy would be indistinguishable from a rename.

### UI affordances as a service, not a sidebar fork
New `@mdr/file-management` extension registers an `explorer-actions` service (handlers for create/rename/move/copy/delete plus which row has an active inline input). The sidebar consumes it through the service registry (`useService`, already handles "not yet registered"), so activation order doesn't matter and the sidebar stays a pure renderer. Inline inputs (create/rename), the context menu, and drag-and-drop are rendered by the sidebar; all behavior lives behind the service.

- *Alternative considered*: putting the handlers directly in the sidebar extension — rejected: couples storage of file-operation state into the display component and makes the feature non-swappable, against the platform contract that built-ins are extensions.

### "Move to…" uses the native directory picker
The context-menu fallback for users who don't drag reuses `@tauri-apps/plugin-dialog` `open({ directory: true })`, consistent with the existing "Open Folder…" flow. Drag-and-drop remains the primary path (native HTML5 DnD on rows; a folder row is a drop target when expanded-visible or collapsed).

### Case-only renames on macOS
A rename that changes only letter case can fail on a case-insensitive filesystem. `rename_entry` detects the no-op rename case and falls back to rename-via-temporary-name inside the same folder.

## Risks / Trade-offs

- [Delete discards a dirty open document] → The explorer's delete confirmation (spec'd) names the entry; the existing close-guard/deleted-signal path handles the open tab. Residual risk accepted: no undo.
- [Watcher debounces the tree update ~250 ms after each operation] → Acceptable latency for a file-manager action; keeps one update path.
- [Rust command surface grows by four commands] → All follow the existing command + `ensure_inside` pattern; lib.rs registration is the only wiring.
- [DnD on nested `<ul>` rows can mis-hit] → Drop targets are the row buttons themselves with clear active styling; rejected drops (self, descendant) are validated in the backend too, so a UI miss can never move outside containment.

## Migration Plan

Purely additive: new commands, new extension, new service. No existing behavior changes; shipping and rolling back is a single build. The sidebar degrades gracefully (context menu absent) if the service never registers.

## Open Questions

None.
