# Design: CLI open + toolbar cleanup

## Context

The app is a Tauri 2 desktop app (`src-tauri/`) with a React frontend (`src/`). Relevant current state:

- `scripts/launch-md-reader` runs `exec open /Applications/md-reader.app` and **explicitly drops arguments** (a comment reserves them for a future change). The install script symlinks it to `md-reader` on PATH.
- The app window uses `titleBarStyle: "Overlay"` + `hiddenTitle: true` (tauri.conf.json), so the macOS traffic lights are drawn over the app's own toolbar. The frontend reserves clearance with a fixed `--mdr-traffic-inset: 80px` div (`src/theme.css`, `src/App.tsx`) before the sidebar-toggle and open-folder buttons, which produces the odd offset the proposal fixes.
- Workspace activation is frontend-driven: `App.tsx` `handleOpenFolder()` → dialog plugin → `api.workspace.openFolder()` → `activate_workspace` command (`src-tauri/src/workspace.rs`). Single-file documents are opened through the tab store (`src/core/tabs/tabStore.ts`) on top of an active folder workspace.
- No CLI/deep-link/single-instance plugins exist today; foregrounding relies on macOS LaunchServices deduplication via `open`.

## Goals / Non-Goals

**Goals:**
- `md-reader [path]` opens a file or folder as described in the distribution delta, in both cold-start and already-running cases.
- Leading toolbar controls sit cleanly beside the traffic lights.

**Non-Goals:**
- A file-only (no-sidebar) mode — opening a file activates its parent folder (confirmed with user).
- Reading piped stdin, multiple path arguments, or shell completion.
- Reworking the toolbar into separate components (layout fix stays inline in `App.tsx`).

## Decisions

### 1. Argument transport: `tauri-plugin-cli` + `tauri-plugin-single-instance`

- The launcher uses `open`, so arguments must survive LaunchServices. `tauri-plugin-cli` captures the process arguments at startup (`tauri::RunEvent::Exit`-free API: `app.cli().matches()`), and `tauri-plugin-single-instance` provides the macOS `open-url`/argv forwarding callback so a second invocation hands the path to the running instance instead of spawning a duplicate.
- Alternative considered: passing document paths through macOS LaunchServices (`open file.md` opens it as a document and Tauri's `RunEvent::Opened`/file-drop events receive it). Rejected: document-open events are inconsistent across invocation styles and don't cover folders; the CLI plugin gives one uniform argv channel for files and folders.
- Both plugins are official Tauri 2 plugins. Add `cli:default` to `src-tauri/capabilities/default.json`; the single-instance plugin is Rust-only (no guest-js API) and defines no capability permissions.

### 2. Launcher forwards the path with `open --args` / direct binary fallback

`scripts/launch-md-reader` becomes: if `$1` is set, prefer executing the app bundle's inner binary directly (`/Applications/md-reader.app/Contents/MacOS/md-reader "$@"`) so the CLI plugin reliably sees argv; fall back to `open -a` with `--args` where direct execution is unavailable. Keep the no-argument path as plain `open` to preserve LaunchServices foregrounding. Relative paths (`./`) are resolved to absolute by the launcher (`realpath`/`cd && pwd`) so the app doesn't depend on the caller's CWD — the Rust/frontend side always receives an absolute path.

### 3. Path handling lives in Rust, routing lives in the frontend

In `lib.rs` setup: read CLI matches (startup) and single-instance forwarded args (already-running), canonicalize with the same containment hygiene as `workspace.rs`, classify file vs folder via `fs::metadata`, and emit a single frontend event, e.g. `cli-open` with payload `{ path: String, kind: "file" | "folder" }`. The frontend (`App.tsx`) listens once and calls the existing `api.workspace.openFolder(path)` then, for files, `api.tabs.open(path)` after workspace activation. This reuses every existing command (`activate_workspace`, `read_text_file`) instead of adding new ones.

- Alternative considered: doing everything in Rust. Rejected — workspace/tab state is frontend-owned; duplicating it in Rust would create two sources of truth.

### 4. Toolbar alignment: two-row layout under the traffic lights

Keep a single `header.mdr-toolbar` element but restructure it into two rows: a full-width title-bar band (~28px) that hosts the overlaid traffic lights and acts as the drag region, and a 52px controls row below it where the sidebar-toggle and open-folder buttons start at the left edge with symmetric padding. This replaces the previous single-row approach (inset spacer sized to the traffic-light cluster) after user review: the icons are expected on their own line, not beside the dots. The `--mdr-traffic-inset` token is removed.

- Alternative considered: `decorations: false` with fully custom titlebar. Rejected: the overlay style is working and spec'd (`app-shell` "Native macOS application window"); this change is layout cleanup, not a titlebar rewrite.

### 5. `md-reader --help` handled in the launcher, not the app

`--help`/`-h` prints usage and exits in `scripts/launch-md-reader` before any launch. Terminal help must never open a GUI window; letting the app parse it (clap's `DisplayHelp` path in `tauri-plugin-cli`) would show a window, and `tauri-plugin-cli` writes nothing to the user's terminal. App-side argument handling stays focused on the path argument.

## Risks / Trade-offs

- [`tauri-plugin-cli` argument parsing on macOS via `open`] → The plugin reads `std::env::args` of the app process; the launcher must ensure argv actually reaches the process (hence the direct-binary execution path in Decision 2). Verify both `md-reader ./notes/todo.md` and `open --args` variants during implementation.
- [Second instance starts anyway when using direct binary execution] → `tauri-plugin-single-instance` handles this; test the cold-start and warm-start scenarios from the delta spec.
- [Traffic-light geometry varies across macOS versions/window states] → Mitigation: tune the inset token against the real overlay behavior and confirm the "no overlap" scenario at minimum window width; the spec allows consistent spacing, not pixel parity.
- [`navigator.platform` deprecation] → Out of scope, but the toolbar work touches `usesOverlayTitleBar`; opportunistically switch to `navigator.userAgent`-based detection only if trivial.

## Migration Plan

1. Add plugins + capabilities + event emission (Rust), frontend `cli-open` listener, launcher arg forwarding.
2. Toolbar layout fix (independent, safe to ship in same change).
3. Rebuild + reinstall via existing `npm run build:app && npm run install:app`; update the launcher symlink automatically (already points at `scripts/launch-md-reader`).
4. Rollback: revert the change; the no-argument CLI behavior and toolbar remain functional at every intermediate commit.
