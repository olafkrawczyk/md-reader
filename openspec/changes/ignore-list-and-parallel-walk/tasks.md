## 1. Rust: ignore list state and command

- [x] 1.1 Add ignored-directories to `WorkspaceState` (`src-tauri/src/workspace.rs`): a `Mutex<Vec<String>>` initialized with the defaults (`node_modules`, `.git`, `.venv`, `dist`, `target`, `.next`) plus an accessor; add a `set_ignored_directories` command taking `Vec<String>` and registering it in `src-tauri/src/lib.rs`
- [x] 1.2 Prune in the walk: in `read_dir_sorted`, skip entries whose name matches the ignore list exactly (pass the list in as a parameter; ignored folders omitted from the tree entirely)

## 2. Rust: watcher filtering

- [x] 2.1 In the watcher event closure (`workspace.rs:97-129`), drop events whose path contains an ignored directory name as a path component before enqueueing, reading the current list from state

## 3. Rust: parallel walk

- [x] 3.1 Add `rayon` to `src-tauri/Cargo.toml`; rewrite `read_dir_sorted` to build the same `Vec<FileEntry>` tree via parallel `par_iter` per directory, keeping the folders-first sort per directory
- [x] 3.2 Preserve symlink semantics: symlinked directories are classified as files and never followed (parity with current `symlink_metadata` behavior)

## 4. Frontend: setting and push

- [x] 4.1 Contribute a workspace-namespace `text` setting `ignoredDirectories` (comma-separated) from the explorer/workspace extension, default `node_modules, .git, .venv, dist, target, .next`, following the schema pattern in `src/extensions/documentSafety.ts:8-27`
- [x] 4.2 Add `setIgnoredDirectories` to `src/core/workspace/bridge.ts`; push the parsed list on app startup and on every setting change (pattern: `App.tsx:73-79`), triggering a workspace rescan on change

## 5. Verification

- [x] 5.1 `cargo check`/`cargo test` in `src-tauri` clean, including a test that ignored names are pruned and sibling ordering is unchanged
- [ ] 5.2 Open `~/softwaremill/pathfinder`: catalog appears in ~1s or less, `node_modules`/`.venv` absent, entry count ≈ 30k not 260k
- [ ] 5.3 Toggle the setting live: adding `.next` hides those trees immediately; removing `node_modules` shows them again; runs without restart
- [ ] 5.4 Touch a file inside `node_modules` while the app is open: no rescan storm (tree unchanged); touch a file in a normal folder: tree updates as before
- [x] 5.5 Existing suites pass: frontend node test suites (`test:safety`, `test:ticks`, `test:naming`, plus relevant others) and a build of the app bundle
