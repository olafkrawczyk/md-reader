## 1. Native menu (Rust)

- [x] 1.1 Create `src-tauri/src/menu.rs`: build the macOS app menu (app submenu from predefined items, File submenu with "Open Folder…" ⌘O / "New File" ⌘N / "New Folder" ⇧⌘N, predefined Edit/View/Window/Help submenus) and install it in `lib.rs` setup, replacing the default menu
- [x] 1.2 Emit a `menu-action` event with the item id (`open-folder` | `new-file` | `new-folder`) on menu activation, and add the `set_workspace_menu_enabled` command that toggles the enabled state of the New File / New Folder items
- [x] 1.3 Add any required permissions to the Tauri capabilities file (menu/event APIs) and verify the app builds and launches with the new menu bar

## 2. Menu wiring (frontend)

- [x] 2.1 Create `src/core/menu/menuActions.ts`: registry mapping menu-action ids to handlers, listening for the `menu-action` event
- [x] 2.2 Register `open-folder` to invoke the existing open-folder flow (same dialog/activation path as the toolbar action and welcome view)
- [x] 2.3 Register `new-file` / `new-folder` in the file-management extension to invoke `beginCreate("file" | "folder")`
- [x] 2.4 Call `set_workspace_menu_enabled` on workspace change so New File / New Folder are disabled with no open workspace (Open Folder… stays enabled)
- [x] 2.5 Verify every id emitted by the Rust menu has a registered handler or is explicitly ignored (per design D1/D2 contract)

## 3. Font loading and rendering

- [x] 3.1 Grep the reading/content styles for every font weight/style that can hit the reading faces (including `<strong>`/`<em>` rendering) and list the required Fontsource face files
- [x] 3.2 Import the verified face files in `src/extensions/theme.ts` (expected: Atkinson Hyperlegible 400/700 + italics as needed, Lexend 400/700) and confirm no weight/style in the app renders as synthetic bold/italic
- [x] 3.3 Remove the global `-webkit-font-smoothing: antialiased` from `src/theme.css`; review text rendering across toolbar, sidebar, tabs, settings, and document content in both light and dark appearance; fix any thin-looking surface at the token level, not globally
- [ ] 3.4 Launch check: confirm no visible font swap or reflow when the app starts; if a swap is observable, implement the design D6 fallback (self-hosted `@font-face` with `font-display: block`)

## 4. Verification

- [ ] 4.1 Manual pass over the spec scenarios: menu bar shows File actions, each action performs the same behavior as its in-app counterpart, accelerators work, create items disabled without a workspace
- [x] 4.2 Run `npm run lint`, `npm run typecheck`, and the existing test scripts (`npm run test:ui`, `npm run test:safety`); confirm all pass
