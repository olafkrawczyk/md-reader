## 1. Rust command conversion

- [x] 1.1 In `src-tauri/src/workspace.rs`, convert `read_dir_tree` to `async fn`; resolve `state.root()?` synchronously, clone the `PathBuf` into a closure, and run `read_dir_sorted` via `tauri::async_runtime::spawn_blocking`, mapping join errors to `format!("read dir tree task failed: {err}")` (mirror the `copy_entry` pattern at workspace.rs:322-332)
- [x] 1.2 Leave `read_dir_sorted` and the `FileEntry` payload unchanged; verify command registration in `src-tauri/src/lib.rs` needs no changes

## 2. Verification

- [x] 2.1 `cargo check`/`cargo build` in `src-tauri` passes with no new warnings
- [x] 2.2 Run the app and open a large folder (e.g. one containing `node_modules`): UI stays responsive during the scan, tree renders on completion, fs-change rescans still update the tree
- [x] 2.3 Run existing Rust tests for workspace (`cargo test` in `src-tauri`) and frontend test suite (`npm test`) to confirm no regressions
