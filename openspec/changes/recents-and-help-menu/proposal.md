## Why

Reopening a folder you had open yesterday costs a native dialog and a path you have to remember — every launch starts from zero even though the app knows exactly where you have been. Meanwhile the app offers three Open Folder buttons on first launch (toolbar, welcome screen, sidebar empty state), and the Help menu is an empty shell (`menu.rs:71`) while ten global shortcuts exist with nowhere to discover them.

## What Changes

- **Track recently opened folders in the backend.** `activate_workspace` is the single funnel every open path already passes through — toolbar, welcome, CLI launch, CLI forward — so recording there covers every entry point with no frontend bookkeeping. The list is capped, most-recent-first, deduplicated, and persisted to `~/.config/md-reader/recents.json` alongside the existing `extensions/` directory.
- **Add File ▸ Open Recent to the native menu.** Entries are validated against the filesystem at read time; folders that no longer exist are dropped silently. Each item carries its own path in the menu id, so no index invariant has to stay in sync across the IPC boundary.
- **Show the recent list on the welcome screen**, only in the true no-workspace state.
- **Split the welcome screen's two states.** `showWelcome` is true both when no folder is open and when a folder is open with no tab; the latter currently tells the user to open a folder while the sidebar shows their tree. The recents gate forces this branch to exist, so the wrong copy gets corrected with it.
- **Remove the sidebar's empty-state Open Folder button** (`sidebar.tsx:727-733`). Redundant with the welcome screen's primary button, which is larger and already on screen.
- **Add Help ▸ Keyboard Shortcuts**, opening a modal that lists the global shortcuts. The list is hardcoded in the panel — deliberately partial, covering the global keymap and the native accelerators, not extension-local keys (reader j/k, search Enter/arrows, inline-input Escape).

**Non-goals:** recent *files* (the app's unit of opening is a folder — a CLI file path opens its parent); a Clear Menu item (its absence is what keeps the welcome list free of reactive plumbing); a shortcut contribution registry (rejected as more machinery than a discovery aid needs today).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `app-shell`: new requirements for recording and offering recently opened folders (native menu submenu plus welcome-screen list), a keyboard-shortcut reference in the Help menu, and a welcome screen whose copy matches which of its two states is showing.
- `file-explorer`: the "Empty workspace state" requirement is removed — the sidebar shows a quiet prompt with no action when no folder is open.

## Impact

- `src-tauri/src/recents.rs` (new) — load, record, validate, persist; cap and dedup.
- `src-tauri/src/workspace.rs` — one `record` call in `activate_workspace`, after canonicalization and the `is_dir` check.
- `src-tauri/src/menu.rs` — Open Recent submenu rebuilt on change; Help ▸ Keyboard Shortcuts; both emit over the existing `menu-action` event.
- `src/core/menu/menuActions.ts` — handler signature gains an optional argument so `open-recent:<path>` can carry its payload; `menuActionIds` gains the Help id.
- `src/core/state/appShellReducer.ts` — `shortcutsOpened` / `shortcutsClosed`, mirroring the settings pair.
- `src/core/settings/ShortcutsPanel.tsx` (new) — `ModalSheet` consumer.
- `src/App.tsx` — welcome branch split; recent list; Help menu binding.
- `src/extensions/sidebar.tsx` — delete the empty-state button; drop the now-unused `open` import if nothing else uses it.
- `src/theme.css` — `.mdr-sidebar-empty button` rules removed; recent-list and shortcut-table styles added.
