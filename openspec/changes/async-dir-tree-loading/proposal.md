## Why

Opening a folder with many files freezes the app (macOS beachball 10+ seconds). `read_dir_tree` is a synchronous Tauri command, so its full recursive directory walk runs on the main thread and blocks the app event loop. The codebase already uses the correct pattern for this (`copy_entry` is async + `spawn_blocking`); `read_dir_tree` just never received it.

## What Changes

- Convert the `read_dir_tree` Tauri command from synchronous to `async fn`, running the directory walk on the blocking thread pool via `tauri::async_runtime::spawn_blocking`, matching the existing `copy_entry` pattern.
- No change to the walk itself: still full-depth, same sorting, same `FileEntry` payload, no ignore rules, no depth cap. The tree snapshot contract between Rust and the frontend is untouched.
- Out of scope (follow-ups): lazy per-directory loading, ignore rules/pruning, rendering virtualization, and async conversion of other sync commands (`activate_workspace`, `read_text_file`).

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `workspace`: add a requirement that loading the workspace file tree does not block the app UI — the app remains responsive while the directory scan is in progress.

## Impact

- `src-tauri/src/workspace.rs`: `read_dir_tree` signature becomes `async fn`; walk body moves into a closure executed via `spawn_blocking`. No frontend changes — the Tauri client and `invoke` call sites in `src/core/workspace/bridge.ts` are unaffected by async commands.
- No API/IPC payload changes; no dependency changes.
- Verification: opening a large folder (e.g. one containing `node_modules`) shows a responsive UI instead of a beachball.
