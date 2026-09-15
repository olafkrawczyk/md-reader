## Why

The explorer is read-only today: users cannot create, rename, move, copy, or delete files from the app and must fall back to Finder, which breaks the flow of a reader/editor that already shows the workspace tree. Adding these operations as a built-in extension keeps the core surface small (extension-platform contract) while delivering the everyday file management users expect from a sidebar.

## What Changes

- New built-in extension (`@mdr/file-management`) that contributes file operations to the explorer:
  - Create a new file or folder via an inline entry, accepting a nested path such as `new_dir/new_file.md`, creating missing parent directories in one action (VS Code-style).
  - Rename a file or folder inline.
  - Move a file or folder to another folder (drag and drop plus a context-menu "Move to…" fallback).
  - Copy (duplicate) a file or folder, including folder subtrees.
  - Delete a file or folder with confirmation.
- New Tauri commands for filesystem mutation (create, rename/move, copy, delete, mkdir) with workspace containment validation, following the existing `write_text_file` safety pattern.
- Workspace store gains mutation methods that invoke the new commands; tree updates arrive through the existing watcher/rescan path (no parallel update mechanism).
- Dirty open documents: a rename/move retargets the open document's path so in-memory edits are preserved; delete routes through the existing document-deleted signal.
- Operations are asynchronous and non-blocking; the UI stays responsive during large moves/copies.

## Capabilities

### New Capabilities
- `file-management`: Filesystem mutation operations (create with nested path, rename/move, copy, delete) exposed to extensions, their safety rules (workspace containment, confirmation, dirty-document handling), and their effect on the tree and open documents.

### Modified Capabilities
- `file-explorer`: The explorer gains user-facing affordances for the new operations — a context menu per row, inline create/rename entry fields, drag-and-drop move targets, and confirmation before delete.

## Impact

- **Backend**: `src-tauri/src/workspace.rs` — new `#[tauri::command]` mutations reusing `WorkspaceState::ensure_inside`; command registration in `src-tauri/src/lib.rs`.
- **Bridge**: `src/core/workspace/bridge.ts` — bindings for the new commands.
- **Workspace store**: `src/core/workspace/workspace.ts` — mutation methods; retargeting open documents on rename/move.
- **Extension API**: `src/core/extension/api.ts` / `src/core/workspace/index.ts` — expose the mutation methods on the workspace API consumed by extensions.
- **New extension**: `src/extensions/fileManagement.tsx` registered in `src/extensions/index.ts` / `presets.tsx`.
- **No new dependencies**: drag-and-drop uses native HTML5 DnD; no npm or Rust crate additions.
- **Performance**: tree changes still flow through the single debounced watcher/rescan path; operations fire one command per user action and the UI renders from the existing reactive tree source.
