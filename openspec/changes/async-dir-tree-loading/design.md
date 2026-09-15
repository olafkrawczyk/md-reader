## Context

`read_dir_tree` (`src-tauri/src/workspace.rs:155`) is a synchronous Tauri command. Tauri runs sync commands on the main thread, so the full recursive walk in `read_dir_sorted` (per-entry `read_dir` + `symlink_metadata`, no depth cap, no ignores) blocks the macOS event loop and produces the beachball. The repo already contains the correct pattern in `copy_entry` (`workspace.rs:322-332`): an `async fn` command that offloads blocking work via `tauri::async_runtime::spawn_blocking`.

The frontend (`src/core/workspace/bridge.ts:10-12` → `Workspace.#rescan`) calls `invoke("read_dir_tree")` and awaits the result; it does not care whether the command is sync or async.

## Goals / Non-Goals

**Goals:**
- Directory walk runs on the blocking pool; app event loop stays responsive during the scan.
- Follow the existing `copy_entry` pattern exactly (consistency over novelty).
- Zero change to the IPC contract: same `Vec<FileEntry>` payload, same error type (`String`).

**Non-Goals:**
- Lazy per-directory loading, ignore rules, depth caps (see proposal).
- Async conversion of other sync commands (`activate_workspace`, `read_text_file`).
- Any frontend changes.

## Decisions

- **`async fn` + `spawn_blocking`, cloning the root path out of state first.** `State<'_, WorkspaceState>` borrows from Tauri's state and cannot cross into the blocking closure. `state.root()?` is resolved synchronously (cheap map lookup), the `PathBuf` is moved into the closure, and `read_dir_sorted` runs there unchanged. Alternative considered — making `read_dir_sorted` itself return a future or rewriting with `jwalk` — rejected: larger diff, new dependency, no behavioral gain for this scope.
- **Keep `read_dir_sorted` synchronous and unchanged.** It is also called from other sync contexts; only the command wrapper changes.
- **Error semantics preserved.** `spawn_blocking` join failure maps to `format!("read dir tree task failed: {err}")`, mirroring `copy_entry`'s "copy task failed" wording; the inner `Result` passes through as before.

## Risks / Trade-offs

- [Walk still does full work; large folders still take seconds] → The UI now stays responsive (spinner-free but interactive); total latency is unchanged. Acceptable per proposal scope; lazy loading is the follow-up if latency itself becomes the complaint.
- [Two threads could walk simultaneously if user rescans while one is in flight] → Pre-existing concern: the frontend awaits `#rescan()` before issuing the next; `spawn_blocking` does not change the call pattern.

## Open Questions

<!-- none -->
