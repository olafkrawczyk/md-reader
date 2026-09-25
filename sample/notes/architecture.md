# System Architecture

High-level overview of md-reader subsystems.

## Subsystems

1. **Native Menu (`src-tauri/src/menu.rs`)**:
   - Manages top-level menus and accelerators.
   - Emits `menu-action` events with prefixed payloads like `open-recent:<path>`.
2. **Workspace Manager (`src-tauri/src/workspace.rs`)**:
   - Single funnel for folder activations (`activate_workspace`).
   - File system watcher with debounced change notification.
3. **Recents Store (`src-tauri/src/recents.rs`)**:
   - Persists up to 10 folders in `~/.config/md-reader/recents.json`.

Related documents: [[daily-log]], [[guides/advanced-usage]], [[README]]
