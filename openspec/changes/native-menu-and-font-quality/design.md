## Context

The app is a Tauri v2 desktop app (React frontend) that currently defines no native menu, so macOS shows Tauri's default menu bar (App/Edit/View/Window/Help) with no File menu. The actions the menu needs already exist and are wired end-to-end:

- Create: `fileManagement.tsx` registers the explorer-actions service exposing `beginCreate("file" | "folder")` (src/extensions/fileManagement.tsx:241), used by the explorer toolbar.
- Open: the native folder dialog via `@tauri-apps/plugin-dialog` is used by the toolbar open-folder action and the welcome view.

Fonts: `@fontsource/atkinson-hyperlegible` and `@fontsource/lexend` are imported with only `400.css` (src/extensions/theme.ts:1-2). The reading font stack renders document content in these faces; any bold/italic content therefore gets browser-synthesized bold/italic. `body` sets `-webkit-font-smoothing: antialiased` globally (src/theme.css:111), which thins text on macOS. UI chrome uses the system font stack (`--mdr-font-ui`), so its weights (600 headers) are unaffected by the bundling issue.

## Goals / Non-Goals

**Goals:**

- A native macOS menu bar with a File menu (Open Folder…, New File, New Folder) whose items invoke the existing in-app actions — no duplicated behavior.
- Menu enablement that mirrors the in-app controls (create actions need an open workspace).
- Crisp text rendering: no synthetic bold/italic for bundled reading fonts, no global antialiasing override, no visible font swap on launch.

**Non-Goals:**

- No new app behaviors invented for menu items (no separate "open file" mode, no menu-driven save/close).
- No change to typeface choices or the reading-settings font options.
- No Windows/Linux menu work beyond what Tauri's default menu provides there (macOS is the platform in scope).

## Decisions

### D1: Build the menu in Rust at setup, replacing the default menu

Construct the menu in `src-tauri` (new `menu.rs`, wired in `lib.rs` `setup`) using `tauri::menu`: an app submenu built from predefined items (About, Services, Hide, Quit), a File submenu with "Open Folder…" (accelerator CmdOrCtrl+O), "New File" (CmdOrCtrl+N), "New Folder" (Shift+CmdOrCtrl+N), then predefined Edit/View/Window/Help submenus. Setting an explicit app menu replaces Tauri's default on macOS.

*Alternative considered:* defining the menu in `tauri.conf.json`. Rejected — enable/disable state must be updated at runtime, which needs Rust-side handles to the menu items anyway.

### D2: Menu → frontend via event with a small action registry

On menu item activation, Rust emits a window/app event (e.g. `menu-action` with the item id: `open-folder` | `new-file` | `new-folder`). The frontend gets a small core module (`src/core/menu/menuActions.ts`) exposing a registry (`registerMenuAction(id, handler)`); the file-management extension registers the create actions, and the existing open-folder flow registers `open-folder`. This keeps the extension architecture: no extension imports another's internals, and the core module has no knowledge of what the actions do.

*Alternative considered:* Rust invoking Tauri commands directly. Rejected — the behaviors live behind extension services in the frontend; bridging backwards would invert the existing ownership.

### D3: Frontend drives menu enablement

The workspace state lives in the frontend. Add a tiny Tauri command (`set_workspace_menu_enabled(enabled: bool)`) that flips the enabled state of the "New File" and "New Folder" items via their `MenuItem` handles. The file-management extension (or App, on workspace change) calls it whenever the active workspace changes. "Open Folder…" stays always enabled.

*Alternative considered:* mirroring workspace state into Rust and computing enablement there. Rejected as a second source of truth for state that already exists in the frontend.

### D4: Load the full weight set actually used, nothing speculative

Import `@fontsource/atkinson-hyperlegible` `400.css` + `700.css` + `400-italic.css` + `700-italic.css` (markdown bold/italic content) and `@fontsource/lexend` `400.css` + `700.css`. Before finalizing the list, grep the reading/content styles for every `font-weight` (and `<strong>`/`<em>` usage) that can hit the reading faces and match the import list to it — the rule is "every face the design can reference is loaded"; no speculative weights.

### D5: Remove the global antialiasing override; fix rendering at the cause

Delete `-webkit-font-smoothing: antialiased` from `body` so macOS uses default subpixel antialiasing. If any individual surface still looks thin, address that surface specifically (weight/size at the token level) rather than re-adding a global override.

### D6: Font swap handled by verification first

Fonts are bundled locally (no network), so `font-display: swap` from Fontsource should never show a visible swap. The tasks include an explicit launch check; if a swap is observable, the fallback is self-hosted `@font-face` declarations with `font-display: block` over the same bundled files — not accepted as part of this change until the check proves it necessary.

## Risks / Trade-offs

- [Menu event ids drift from registered action ids] → Define the id strings as a single shared contract documented in both `menu.rs` and `menuActions.ts`; a test asserting every emitted id has a registered handler (or is explicitly ignored).
- [Tauri capabilities block the new APIs] → `core:menu`/event permissions may need to be added to the capabilities file; tasks include a build+launch verification step that surfaces this immediately.
- [Removing `antialiased` changes text look everywhere] → That is the intent (crisper, normal-weight text), but it must be reviewed across all surfaces in both appearances; if a specific surface regresses, fix that surface's tokens, not the global.
- [Italic faces may be unused after checking] → If the design never renders italic in the reading faces, drop those imports (D4's "match to usage" rule keeps the bundle minimal).
- [Single-instance CLI forwarding vs menu events] → No interaction expected (menu events are in-process); both paths converge on the same frontend actions.

## Open Questions

- None. The face list (D4) is resolved by a verification step inside the change, not by a user decision.
