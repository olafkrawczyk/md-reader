## Context

See proposal.md — Why.

Three facts about the current code shape the decisions below:

- `activate_workspace` (`workspace.rs:241`) is the single funnel every folder open passes through — toolbar button, welcome button, CLI launch (`cli.rs:23`), CLI forward (`cli.rs:42`) — and it already canonicalizes the path and rejects non-directories.
- The native menu talks to the frontend one way only: `menu-action` events carrying a string id (`menu.rs:92` → `menuActions.ts:25`). Handlers take no arguments.
- `ModalSheet` (`controls.tsx:223`) already implements the overlay panel, Escape handling, and focus restoration that a shortcut reference needs.

## Goals / Non-Goals

**Goals**
- One place records recents; no call site has to remember to.
- The menu is correct before the webview finishes booting.
- A stale path never opens the wrong folder.

**Non-Goals**
- Reactive recents in the UI. The welcome list is read once at mount (see Decisions).
- Covering extension-local keys in the shortcut reference.

## Decisions

### Recents live in the backend, not `SettingsStore`

The frontend has a persistence mechanism already (`settingsStore.ts`, localStorage), and `set_workspace_menu_enabled` establishes a frontend-pushes-to-menu pattern. Recents still belong in Rust:

- Recording in `activate_workspace` covers all four entry points in one line. Recording in the frontend means touching `workspace.openFolder` plus verifying the CLI paths route through it.
- Validating entries is `path.is_dir()`. From the frontend it is a new command and a round trip.
- The menu must be populated during `setup()`, before any webview exists. Frontend-owned means the Open Recent submenu is empty on every launch until React boots and pushes.

Storage is `~/.config/md-reader/recents.json`, the directory `lib.rs:13` already computes for `extensions/`. A JSON array of absolute paths, most-recent-first.

**Alternative considered:** localStorage + a push command. Rejected on the startup-emptiness point — that is a visible defect, not a tradeoff.

### Menu ids carry the path, not an index

`open-recent:<absolute-path>` rather than `open-recent-<n>`.

An index requires the backend's list order and the frontend's copy of it to stay identical. Any drift — a validation pass that drops a missing folder on one side only, a record that lands between render and click — opens the wrong folder silently. The path is self-describing: what was clicked is what opens.

Cost: `MenuActionHandler` becomes `(arg?: string) => void` and dispatch splits the id on its first `:`. Roughly four lines in `menuActions.ts`. `menuActionIds` stays a closed tuple for the fixed ids; the recent prefix is matched separately.

### The welcome list is read once, not subscribed

The recent list renders only when `workspaceRoot === null`. Opening a folder leaves that state, so the list never needs to update while visible — a plain read on mount is sufficient and correct.

This holds precisely because there is no Clear Menu item. Adding one later would make the list mutable while visible and would require a `recents-changed` event plus a `storeSource`. That is the entire cost of Clear Menu, and it is why it is out of scope. Deleting `recents.json` is the escape hatch until someone asks.

### `showWelcome` splits into two states

`showWelcome = workspaceRoot === null || tabList.length === 0` (`App.tsx:141`) conflates:

- **A.** No workspace. Correct copy: "Open a folder to start reading and editing." Gets the recent list.
- **B.** Workspace open, no tab. Current copy tells the user to open a folder while the sidebar shows their tree. Should say no file is open, and must not show the recent list.

Gating recents on A forces this branch to exist; correcting B's copy is two lines inside a branch the change already creates.

### The shortcut list is hardcoded in the panel

The honest scope is the ten globals in `appShellHooks.ts:259` plus the native accelerators. A table driving both dispatch and display was considered: it replaces the if-chain with a lookup, but the chain has ordering subtleties (the `⌘⇧N` shifted-key note at `appShellHooks.ts:285`, the `ctrlKey && Tab` case) that a naive matcher would get wrong, and it still would not cover extension-local keys. A `shortcuts` contribution registry would cover them, at the cost of a new extension-platform concept for a discovery aid.

Hardcoding accepts drift in exchange for no new machinery. Mitigation is a comment at each declaration site pointing at the panel.

## Risks / Trade-offs

- **The hardcoded list drifts from the real keymap.** → Comments at `menu.rs` accelerators and the `appShellHooks` chain naming the panel as the place to update. Accepted deliberately; a registry is the upgrade path if it bites.
- **`⌘N` is declared twice** — as a native accelerator (`menu.rs:23`) and in the global keydown chain (`appShellHooks.ts:283`). On macOS the menu normally consumes it first, which would make the keydown branch dead. Unverified. → Confirm which path fires before writing that row, so the panel documents what actually happens.
- **`recents.json` is user-editable and could be malformed.** → Parse failures fall back to an empty list, the same way `settingsStore.ts:50` treats unreadable storage. Non-string and non-existent entries are filtered on read.
- **Recording happens before the tree scan.** A folder that canonicalizes and is a directory but fails to scan still lands in recents. → Acceptable: it exists and is a folder, so offering it again is reasonable.

## Open Questions

None. The list caps at ten, matching the macOS convention for Open Recent; nothing else depends on the number.
