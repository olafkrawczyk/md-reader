## Why

The app's native macOS menu bar (the system menu bar where Help and View live) offers only Tauri's default menus — there is no File menu, so "Create" (new file / new folder) and "Open" actions are unreachable from the menu bar even though the same actions exist in the toolbar and explorer. Separately, text rendering looks poor: bundled reading fonts ship only a 400 weight, so any bold content renders as synthetic (faux) bold, and the global `-webkit-font-smoothing: antialiased` setting renders thin, jagged text on macOS.

## What Changes

- Define a native application menu for macOS (replacing Tauri's default menu) with a File menu containing the create and open actions:
  - **Open Folder…** (⌘O) — opens the native folder dialog, same action as the toolbar open-folder button.
  - **New File** (⌘N) — begins inline file creation in the explorer, same action as the explorer's "New File" control.
  - **New Folder** (⇧⌘N) — begins inline folder creation, same action as the explorer's "New Folder" control.
- Menu items that act on the workspace are disabled while no workspace folder is open, mirroring the in-app controls.
- Standard Edit, View, Window, and Help menus are preserved with their default behavior.
- Fix font rendering quality:
  - Load the full weight set actually used by the bundled reading fonts (Atkinson Hyperlegible, Lexend) so no browser-synthesized bold/italic is rendered.
  - Remove (or correct) the global `-webkit-font-smoothing: antialiased` override so text renders with macOS default subpixel antialiasing and no longer looks thin/choppy.
  - Ensure no visible font-loading swap or layout shift when the app starts.

Assumptions (recorded, not confirmed with user):
- "Create" means new file and new folder in the active workspace; "Open" means open folder. No open-single-file menu item is added (the CLI path covers file-open).
- "Choppy" fonts refers to rendering quality (synthetic bold, antialiasing, font swap), not the choice of typefaces.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `app-shell`: adds a native menu bar requirement — the system menu bar SHALL expose File-menu create/open actions wired to the same behaviors as the toolbar and explorer, with standard menus preserved.
- `visual-design-system`: the "System typography" requirement is extended with font rendering quality — complete font weights SHALL be loaded (no synthetic bolding), and text SHALL render crisply without a global antialiasing override or visible font swap.

## Impact

- `src-tauri/src/lib.rs` (or a new `src-tauri/src/menu.rs`): build and install the native menu via `tauri::menu`; menu item identifiers forwarded to the frontend as events; enable/disable of workspace-dependent items on workspace state change.
- `src/App.tsx` / `src/extensions/fileManagement.tsx`: listen for menu events and invoke the existing `beginCreate("file" | "folder")` and open-folder actions; no new behaviors invented — menu reuses existing command paths.
- `src/extensions/theme.ts`: import additional font weight CSS (e.g. 700, italic variants if used) from `@fontsource/*`.
- `src/theme.css`: remove/adjust `-webkit-font-smoothing` on `body`; verify reading-content weights against loaded faces.
- Capabilities: `tauri.conf.json` or Tauri capabilities file may need menu permissions (e.g. `core:menu`) if the default capability set does not include them.
- Specs: `openspec/specs/app-shell/spec.md`, `openspec/specs/visual-design-system/spec.md`.
