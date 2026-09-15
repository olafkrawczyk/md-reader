## Context

`read_dir_sorted` (`src-tauri/src/workspace.rs:165-194`) hand-rolls a serial recursive walk; it now runs on the blocking pool via `spawn_blocking` (see `async-dir-tree-loading`). The watcher (`workspace.rs:97-129`) is recursive and forwards every event path unfiltered, and every event triggers a full tree rescan from the frontend (`src/core/workspace/workspace.ts:73-78`).

Settings infrastructure is frontend-only: `SettingsStore` (localStorage, `src/core/settings/settingsStore.ts`), schema entries of type `choice | boolean | text | number` contributed by extensions (`src/core/extension/contributionRegistries.ts:62-90`), rendered generically by `SettingsPanel.tsx`. Rust holds no persistent config; the only existing "frontend pushes state to Rust" pattern is `set_workspace_menu_enabled` (`src-tauri/src/menu.rs`, invoked from `App.tsx:73-79`).

Spike data for the motivating workspace: 260,785 entries, ~87% inside `node_modules`/`.venv`/`.git`/build output; walk ≈ 5s of the 6s.

## Goals / Non-Goals

**Goals:**
- Ignored directories never enter the tree or trigger rescans; a default set works with zero configuration (CLI forward path included).
- Parallel walk for the remaining legitimate content.
- Live behavior when the setting changes; persistence via the existing settings store.

**Non-Goals:**
- Lazy per-directory loading (deferred).
- Glob patterns, negation, per-workspace overrides — exact name match only.
- Moving settings persistence to Rust.

## Decisions

- **List lives in the frontend settings store; Rust holds a runtime copy.** A `text` setting (comma-separated names) contributed by the explorer extension under a workspace namespace. Defaults are hardcoded in `WorkspaceState` (e.g. `node_modules`, `.git`, `.venv`, `dist`, `target`, `.next`) so the walk is correct even before the frontend pushes anything — important because `activate_workspace` is reachable from the CLI-forward path (`lib.rs:90-92`). The frontend pushes the parsed list at startup and on every change via a new `set_ignored_directories` command storing into `Mutex<Vec<String>>` (same shape as `set_workspace_menu_enabled`), then triggers `#rescan()`.
  *Alternative considered*: keep the list entirely in Rust with its own config file — rejected: creates a second settings home, duplicates the settings UI contract for no benefit.
- **Match rule: exact directory-name match.** `item.file_name()` compared against the list; pruned directories are omitted from the tree entirely (consistent with the existing "only displayable files are shown" behavior — the tree shows no trace of them). Case-sensitive matching keeps semantics predictable; macOS case-insensitivity is a non-issue for names like `node_modules`. Parsing on the frontend trims whitespace and drops empties.
- **Watcher filtering happens at event-enqueue time, not watch setup.** Keep `watch(root, Recursive)`; in the event closure (workspace.rs:100-105), read the current ignore list and drop any event whose path contains an ignored directory as a path component. This is cheaper and simpler than re-scoping watches when the list changes, and the list is a tiny `Mutex` read per event.
- **Parallel walk via `rayon`.** Replace the recursion in `read_dir_sorted` with a rayon `par_iter` over each directory's entries (recursing per subdirectory), building the identical `Vec<FileEntry>` tree; the per-directory folders-first sort runs after collection, so output ordering is identical to today. New dependency in `Cargo.toml`.
  *Alternative considered*: `jwalk` — yields a flat parallel stream, forcing tree reconstruction with weaker ordering guarantees than a recursive parallel map; `ignore` crate — brings gitignore semantics we explicitly don't want (user asked for a name list, not repo rules).
- **Symlink semantics preserved.** Today a symlinked directory is treated as a `File` (`symlink_metadata`, never followed, workspace.rs:171-174). The jwalk build must classify entries the same way (`symlink_metadata`/entry metadata, no symlink-following) so traversal cannot escape the workspace.

## Risks / Trade-offs

- [jwalk reorders entries across directories] → Replaced by rayon recursion: each directory's children are collected in parallel, then sorted sequentially — ordering is identical to the serial walk.
- [Ignored dir hides real content the user wants] → The setting is user-editable and live; removing a name restores the subtree immediately.
- [Watcher still walks event paths inside ignored subtrees for the filter check] → Cost is one component scan per event path; negligible vs. the rescan it prevents.
- [Large tree still crosses IPC as one payload] → Post-prune payload is ~9x smaller for the motivating workspace; residual latency addressed later by lazy loading if it matters.

## Open Questions

<!-- none -->
