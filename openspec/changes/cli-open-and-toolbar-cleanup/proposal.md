# Proposal: CLI open + toolbar cleanup

## Why

The `md-reader` CLI shim deliberately ignores its path argument today (per the distribution spec's "ignored functionally" clause), so users cannot open a file or folder directly from the terminal — they must use the native dialog every time. Separately, the leading toolbar icons (sidebar toggle, open folder) sit at an odd offset relative to the macOS traffic lights because the traffic-light clearance is a hard-coded fixed inset, making the toolbar look misaligned with the window controls.

## What Changes

- Make the CLI path argument functional:
  - `md-reader <file.md>` → activates the file's parent folder as the workspace and opens the file as the active tab.
  - `md-reader <folder>` (e.g. `md-reader ./`) → activates that folder as the workspace.
  - `md-reader` with no argument → current behavior (launch/foreground, no workspace change).
  - Passing a path to an already-running instance foregrounds it and opens the path there.
- Clean up the toolbar layout: the traffic-light controls get their own full-width top row (drag region); the sidebar-toggle and open-folder controls start on a new row below it, aligned to the left edge.

Assumption (confirmed with user): opening a single file opens its parent folder as the workspace (sidebar shows sibling files) — no file-only mode is introduced.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `distribution`: The CLI launcher requirement's "path argument ignored" clause is replaced by functional open-file/open-folder semantics, including forwarding to an already-running instance.
- `app-shell`: The unified toolbar requirement gains explicit requirements for the placement and alignment of the leading toolbar controls (sidebar toggle, open folder) relative to the traffic-light controls.

## Impact

- `scripts/launch-md-reader`: forward the path argument to the app (macOS `open` argument handling).
- `src-tauri/`: new dependency(s) for CLI argument capture and single-instance argument forwarding (e.g. `tauri-plugin-cli`, `tauri-plugin-single-instance`), new command(s) or event(s) to carry the requested path to the frontend, `tauri.conf.json` plugin config, capabilities.
- `src/App.tsx` / `src/core/workspace/`: startup path handling — activate workspace from launch argument, open file as active tab.
- `src/App.tsx` / `src/theme.css`: toolbar leading-controls layout and traffic-light inset handling.
- Specs: `openspec/specs/distribution/spec.md`, `openspec/specs/app-shell/spec.md`.
