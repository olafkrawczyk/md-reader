## Context

The app is a Tauri v2 + React 19 SPA with no component library. All styling flows through `--mdr-*` CSS custom properties (theme.css defaults, `applyTokens` runtime overrides), and every feature ships as an extension styling against those tokens — so a visual redesign is mostly a token- and shell-level change, not a rewrite. The document router holds a single active document (`DocumentRouter`), layout presets are contributed data, and settings render generically from contributed schemas. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- A macOS-native visual language implemented entirely within the existing token contract
- Light, Dark, and Auto appearance with live switching
- A tab strip layered over (not replacing) the pane-engine presets
- A Finder-predictable file explorer replacing the flat tree
- A settings surface that feels like a native settings window without multi-window complexity

**Non-Goals:**
- Native `NSWindow`-level theming beyond Tauri's config options; no Objective-C/plugin work
- Real multi-window support (settings in its own OS window)
- Touch/gesture support, responsive/mobile layouts
- Changing extension contracts (`ExtensionApi`), document types, or transformer pipelines

## Decisions

### D1: Hand-built control vocabulary, no UI framework
Build a small set of styled primitives (quiet button, segmented control, switch, pull-down, list row, tab, modal sheet) as React components in `src/core/ui/`, styled purely against tokens.

- *Why*: total visual control for the native look, no fighting a web-styled library, tiny bundle, and the house rules favor small typed modules. Radix/react-aria bring behavior we barely need and styling we'd override everywhere.
- *Alternative considered*: shadcn/Radix — faster to start, but every component would need de-styling to feel native.

### D2: Icons via `lucide-react`
One stroke-icon dependency, tree-shaken to the handful of icons used (folder, chevron, file types, settings gear, layout segments, close X, plus).

- *Why*: MIT-licensed, closest maintained aesthetic to SF Symbols' 1.5–2px stroke style, inherits `currentColor` so icons tint through the text token automatically.
- *Alternative considered*: hand-rolled SVG sprite — zero deps but ongoing maintenance burden; SF Symbols directly — licensing/reachability from the webview is not viable.

### D3: Appearance via `data-appearance` attribute + `prefers-color-scheme`
An appearance manager resolves mode (light/dark/auto) to a `data-appearance` attribute on `document.documentElement`. Light values stay on `:root`; dark values override under `[data-appearance="dark"]`. Auto subscribes to a `matchMedia('(prefers-color-scheme: dark)')` change listener. The mode itself is a `choice` setting contributed by the built-in theme extension (existing `@mdr/theme` settings namespace), so persistence and the settings UI come free from the settings store.

- *Why*: CSS-only resolution keeps extensions appearance-agnostic (they already style against tokens); reusing the settings pipeline avoids a second persistence mechanism.
- *Alternative considered*: Tauri window theme API — per-window, doesn't feed CSS resolution.

### D4: Integrated toolbar via Tauri overlay title bar
Set `titleBarStyle: "Overlay"` and `hiddenTitle: true` on the macOS window; the toolbar reserves a fixed left inset (~80px) for the traffic lights and marks its empty background `data-tauri-drag-region`. On non-macOS platforms the inset collapses and a standard title bar is used (platform-conditional config).

- *Alternative considered*: full `decorations: false` custom chrome — rejected: we lose real traffic lights, mission-control and window management fidelity.

### D5: Tabs as a `TabStore` wrapping the existing router
New `core/tabs/` module: an ordered list of open document paths plus the active path. Opening a path routes through `DocumentRouter` as today; the store keeps the tab model and keeps `router.active` in sync, so panes, presets, and routing code are untouched. Tab close on external deletion hooks the existing `workspace.onDocumentDeleted`. Dirty state reads the existing `Document` dirty/version model. Tabs are session-scoped (in-memory only). The tab strip renders between toolbar and body, spanning the main region only — the sidebar stays full-height, matching Finder.

- *Why not tabs in core router*: keeps the router single-responsibility; tabs become one consumer of it, and a future multi-window story starts from a clean model.
- *Alternatives considered*: tabs-in-router (couples concerns); per-pane tab groups (rejected in scoping — user chose tabs over presets).

### D6: Settings as an in-app modal sheet styled as a settings window
A centered floating panel (native window look: toolbar title, close button, grouped rows, label-left/control-right) rendered above dimmed content. Grouping uses the existing per-extension contribution boundaries.

- *Why not a real second Tauri window*: extension runtime, settings store, and appearance state would need to bootstrap and sync across windows — significant machinery for a visual goal. The sheet preserves the *feel* (non-destructive, dismissible, main content untouched) at a fraction of the complexity.
- *Escape hatch*: if a real window is wanted later, the settings body is a pure component and moves unchanged.

### D7: File explorer interaction model
Disclosure state is a `Set<string>` of expanded folder paths, session-scoped, all folders collapsed on first open. Selection follows the active document (not click history). Rows: disclosure chevron + type icon + name, 28px row height, hover tint, selected tint via accent token at low alpha. The row is the click target; the chevron is the only disclosure toggle (Finder behavior — clicking the folder name navigates into it rather than toggling, but since folders aren't navigable here, clicking the name also toggles; chevron remains the affordance).

### D8: Token set expansion
Extend the token vocabulary in one pass: surface hierarchy (`bg`, `bg-elevated`, `bg-sidebar` with translucency), three text tiers, accent, separator, hover/active/selected fills, focus ring, plus the existing spacing/radius/font tokens. Dark values are chosen by hand (not a filter/inversion) to avoid the washed-out inverted-UI look. Editor (CodeMirror) and syntax (Shiki) themes gain paired light/dark definitions that re-resolve on appearance change.

## Risks / Trade-offs

- [Overlay title bar behaves differently per OS/version] → Gate the overlay config to macOS; keep a standard-titlebar fallback path; verify on the current macOS version during apply.
- [Live appearance switch mid-session vs CodeMirror/Shiki cached themes] → Re-resolve editor/syntax themes from the appearance manager's change event; test with a document open in split view.
- [Tab strip + preset switcher can crowd a narrow window] → Tab strip gets horizontal scroll with fade masks before the toolbar ever wraps; minimum window width already enforced.
- [Modal settings sheet could feel less "real" than a window] → Accepted trade-off (D6); visual fidelity is prioritized over OS-window mechanics, component is portable later.
- [Translucent sidebar material over the webview] → Real vibrancy would need Tauri window effects; ship a solid token-based `bg-sidebar` first, treat vibrancy as a follow-up polish item.

## Migration Plan

Single cohesive change, additive at the API level: ship token system + shell + tabs + explorer + settings together, since each spec builds on the visual language. Rollback is a revert of the change; no data migrations (settings store gains one key; unknown keys are ignored by old builds).

## Open Questions

- Tab overflow affordance (shrink-to-fit vs horizontal scroll) — decide against real file names during implementation; both satisfy the spec.
