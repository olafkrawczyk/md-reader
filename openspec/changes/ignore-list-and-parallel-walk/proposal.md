## Why

Opening `~/softwaremill/pathfinder` takes ~6 seconds to display: the full recursive walk spends ~5s on ~260k entries, ~87% of which are generated directories (`node_modules`, `.venv`, `.git`, build output) the user does not want in the catalog anyway. The fs watcher also triggers full rescans when those directories churn during builds. A user-configurable ignore list removes most of the work; a parallel walk reduces the remaining wall time.

## What Changes

- Add a user-configurable "ignored directories" list, contributed as a `text` setting (comma-separated names) in the existing settings panel, with sensible defaults (`node_modules`, `.git`, `.venv`, `dist`, `target`, `.next`).
- The Rust directory walk prunes ignored directories by name — they do not appear in the exposed tree.
- The fs watcher drops events originating inside ignored directories so they never trigger tree rescans.
- The frontend pushes the configured list to Rust (new `set_ignored_directories` command); changing the setting applies live and triggers a rescan.
- Replace the recursive `fs::read_dir` walk with a parallel walk (`rayon`) on the existing blocking-pool path, preserving the current per-directory folders-first sort and payload exactly.
- Out of scope (explicitly deferred): lazy per-directory loading; per-directory overrides; glob patterns (names only, exact match).

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `workspace`: add a requirement that the exposed file tree and fs change notifications respect an ignored-directories list — ignored directories are absent from the tree (by default without any configuration), and external changes inside ignored directories do not trigger tree updates.

## Impact

- `src-tauri/src/workspace.rs`: walk pruning + parallel walk in `read_dir_sorted`; `WorkspaceState` gains the ignore list (initialized with defaults so the CLI path is safe before any frontend push); watcher event filtering; new `set_ignored_directories` command (registered in `src-tauri/src/lib.rs`).
- `src-tauri/Cargo.toml`: new `rayon` dependency.
- Frontend: a new text setting registration (workspace/explorer extension), push-to-Rust on startup and on change following the `set_workspace_menu_enabled` pattern (`App.tsx:73-79`), rescan trigger on change.
- Settings persistence comes free via the existing `SettingsStore` (localStorage); no new persistence layer.
