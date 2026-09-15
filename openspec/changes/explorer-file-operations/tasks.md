## 1. Backend commands (src-tauri)

- [x] 1.1 Add `create_entry`, `rename_entry`, `copy_entry`, `delete_entry` commands to `src-tauri/src/workspace.rs`, reusing the `ensure_inside` containment pattern with deepest-existing-ancestor canonicalization and mkdir-p semantics for `create_entry`
- [x] 1.2 Reject existing destinations in `rename_entry`/`copy_entry`; run `copy_entry` on `tauri::async_runtime::spawn_blocking`; implement case-only rename fallback via temporary name
- [x] 1.3 Register the four commands in `src-tauri/src/lib.rs` invoke handler

## 2. Bridge and Workspace store (src/core/workspace)

- [x] 2.1 Add typed bridge bindings for the four commands in `bridge.ts` (no `any`; `unknown` caught errors only)
- [x] 2.2 Add `Workspace` mutation methods (`createEntry`, `renameEntry`, `copyEntry`, `deleteEntry`) in `workspace.ts` that call the bridge and, on rename/move success, synchronously re-key affected open documents (path and paths under a moved folder) preserving text and dirty state
- [x] 2.3 Expose the mutation methods on the workspace section of `ExtensionApi` (`src/core/workspace/index.ts`, `src/core/extension/api.ts`)

## 3. File-management extension service (src/extensions)

- [x] 3.1 Create `fileManagement.tsx` extension that registers an `explorer-actions` service in the service registry: per-row action availability, create/rename/move/copy/delete handlers backed by the Workspace mutations, and inline-input state (which row, which mode)
- [x] 3.2 Register the extension in `src/extensions/index.ts` and include it in the default preset (`src/extensions/presets.tsx`)

## 4. Explorer UI affordances (src/extensions/sidebar.tsx + theme)

- [x] 4.1 Consume the `explorer-actions` service via `useService` and render a context menu per row with type-appropriate actions; show nothing when the service is absent
- [x] 4.2 Render inline create and rename inputs on the target row: nested-path create input, pre-filled rename input, Enter confirms, Escape/empty-create cancels, errors keep the input open with the typed path
- [x] 4.3 Add HTML5 drag-and-drop: file/folder rows draggable, folder rows and root act as drop targets with active styling; reject drops of a folder onto its own descendants before invoking the move
- [x] 4.4 Add delete confirmation dialog (names the entry; folder variant warns contents are removed) and wire "Move to…" to the native directory picker via `@tauri-apps/plugin-dialog`
- [x] 4.5 Surface operation failures as error feedback to the user; style new affordances against theme tokens only
- [x] 4.6 Add top-bar New File and New Folder actions contributed by the file-management extension (hidden while no folder is open); suppress the native context menu on explorer background right-click so the root menu works in WKWebView
- [x] 4.7 Show empty folders in the explorer (folders are never filtered; unsupported files still are), so created folders stay visible

## 5. Verification

- [x] 5.1 `npm run typecheck` and `npm run lint` pass
- [ ] 5.2 Manual pass against every scenario in the `file-management` and `file-explorer` delta specs: nested create, rename, move (drag + picker), copy file and folder subtree, delete file/folder with confirmation, containment rejection (path outside workspace via `../`), dirty open document survives rename/move, tree updates without manual refresh, UI stays responsive during a large folder copy
