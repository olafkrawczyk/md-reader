## 1. Sidebar empty state

- [x] 1.1 Remove the Open Folder button from the sidebar empty state (`sidebar.tsx:727-733`), leaving the "No folder open." message; drop `handleOpenFolder` and the `@tauri-apps/plugin-dialog` import if nothing else in the file uses them
- [x] 1.2 Remove `.mdr-sidebar-empty button` and `:hover` rules (`theme.css:491-501`)
- [x] 1.3 `npm run lint && npm run typecheck` — no unused-import or dead-code errors

## 2. Recents storage (backend)

- [x] 2.1 Create `src-tauri/src/recents.rs` with the store: read `~/.config/md-reader/recents.json` (reuse the config-dir derivation from `lib.rs:10-21`), parse a JSON array of absolute paths, fall back to an empty list on any read or parse failure
- [x] 2.2 Implement `record(path)`: move-to-front on duplicate, cap at 10, persist best-effort (a write failure must not fail the open)
- [x] 2.3 Implement `list()`: filter entries whose path is not currently a directory, returning only live folders
- [x] 2.4 Add a `#[tauri::command] recent_folders() -> Vec<String>` for the frontend and register it in `lib.rs`'s `invoke_handler`; declare `mod recents;`
- [x] 2.5 Call `recents::record` from `activate_workspace` (`workspace.rs:241`) after canonicalization and the `is_dir` check, before returning Ok
- [x] 2.6 Self-check: a Rust unit test in `recents.rs` asserting move-to-front on re-record, the cap discarding the oldest, and an empty list from malformed JSON

## 3. Open Recent menu

- [x] 3.1 Build the Open Recent submenu in `menu::init` from `recents::list()`, placed under Open Folder…, with item ids `open-recent:<absolute-path>` and the folder's basename as the label; store the submenu handle in `WorkspaceMenuState`
- [x] 3.2 Rebuild the submenu's items after each record so the menu reflects the current list (`Submenu::remove_at` / `append`)
- [x] 3.3 Extend the `on_menu_event` handler to emit ids with the `open-recent:` prefix over the existing `menu-action` event
- [x] 3.4 Show an empty Open Recent submenu (no entries) when nothing has been opened yet

## 4. Frontend menu plumbing

- [x] 4.1 Widen `MenuActionHandler` to `(arg?: string) => void` in `menuActions.ts`; split an incoming id on its first `:` and dispatch the prefix to the handler with the remainder as the argument
- [x] 4.2 Register an `open-recent` handler in `App.tsx` that calls `api.workspace.openFolder(path)`, activates the default preset, and clears status — the same tail as `handleOpenFolder` minus the dialog; surface failures through the existing error status path
- [x] 4.3 Self-check: extend or add a node test under `tests/` asserting that a `menu-action` payload of `open-recent:/some/path` reaches the registered handler with `/some/path`, and that an unprefixed unknown id is ignored

## 5. Welcome screen

- [x] 5.1 Split the welcome branch in `App.tsx:224-237`: state A (`workspaceRoot === null`) keeps the current title, caption, and Open Folder… button; state B (root open, no tab) shows a quiet "No file open." message with no open-folder prompt
- [x] 5.2 In state A only, read `recent_folders()` once on mount and render the entries below the button as clickable rows showing the folder basename, with the full path available on hover; render nothing extra when the list is empty
- [x] 5.3 Clicking a row opens that folder through the same path as the menu handler (4.2)
- [x] 5.4 Add `.mdr-welcome-recents` styles in `theme.css` following the existing welcome-section token usage

## 6. Help menu and shortcut reference

- [x] 6.1 Confirm whether ⌘N is served by the native accelerator (`menu.rs:23`) or the global keydown branch (`appShellHooks.ts:283`) — the panel must document what actually fires
- [x] 6.2 Add a `Keyboard Shortcuts` item to the Help submenu (`menu.rs:71`) emitting `show-shortcuts`; add that id to `menuActionIds`
- [x] 6.3 Add `shortcutsOpened` / `shortcutsClosed` actions and a `shortcutsOpen` flag to `appShellReducer.ts`, mirroring the settings pair
- [x] 6.4 Create `src/core/settings/ShortcutsPanel.tsx`: a `ModalSheet` consumer rendering a hardcoded table of the global shortcuts (⌘O, ⌘S, ⌘E, ⌥⌘E, ⌘F, ⌘N, ⌘⇧N, ⌘←/⌘→, ⌃Tab, ⌘W) with their actions, reflecting 6.1's finding
- [x] 6.5 Render the panel in `App.tsx` beside `SettingsPanel` and bind the menu action
- [x] 6.6 Add `.mdr-shortcuts` table styles in `theme.css`
- [x] 6.7 Add comments at `menu.rs`'s accelerator declarations and the `appShellHooks` keydown chain naming `ShortcutsPanel.tsx` as the place to update when a binding changes

## 7. Verification

- [x] 7.1 `npm run lint && npm run typecheck && cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] 7.2 Manual: launch with no prior recents — Open Recent is empty, welcome shows no list; open two folders; relaunch and confirm both appear in the menu and on the welcome screen, most recent first
- [ ] 7.3 Manual: delete one recorded folder from disk, relaunch, confirm it appears in neither the menu nor the welcome list
- [ ] 7.4 Manual: open a folder from the CLI (`md-reader <path>`) and confirm it is recorded
- [ ] 7.5 Manual: with a folder open and all tabs closed, confirm the main region says no file is open and shows no recent list or open-folder prompt
- [ ] 7.6 Manual: Help ▸ Keyboard Shortcuts opens the panel, Escape closes it, and the active document is unchanged
