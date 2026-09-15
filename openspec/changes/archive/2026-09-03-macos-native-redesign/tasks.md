## 1. Design system foundation

- [x] 1.1 Add `lucide-react` dependency and verify tree-shaken import works in build
- [x] 1.2 Rewrite `src/theme.css` token block with the full vocabulary: surface hierarchy (bg, bg-elevated, bg-sidebar), three text tiers, accent, separator, hover/active/selected fills, focus ring, spacing, radius (D8)
- [x] 1.3 Add `[data-appearance="dark"]` token overrides with hand-chosen dark values, and update `tokens.ts` typing if the token registry needs appearance awareness
- [x] 1.4 Build `src/core/ui/` primitives styled against tokens: quiet button, segmented control, switch, pull-down, list row, modal sheet — each strictly typed, no `any`
- [x] 1.5 Create the icon module wrapping lucide icons used across toolbar, explorer, tabs, and settings; icons inherit `currentColor`
- [x] 1.6 Contribute an `appearance` choice setting (light/dark/auto) from the theme extension's settings namespace and persist it through the settings store
- [x] 1.7 Implement the appearance manager: resolve mode to `data-appearance` on the root element, subscribe to `prefers-color-scheme` changes for auto mode, emit change events (D3)
- [x] 1.8 Wire CodeMirror and Shiki themes to paired light/dark definitions that re-resolve on appearance change

## 2. Shell and toolbar

- [x] 2.1 Configure Tauri window: `titleBarStyle: "Overlay"` + `hiddenTitle` for macOS, standard title bar fallback for other platforms (D4)
- [x] 2.2 Rebuild `App.tsx` chrome as the unified toolbar: traffic-light inset, drag region, open-folder action, workspace folder name, preset segmented control, extension toolbar slot, settings entry
- [x] 2.3 Remove the inline settings panel from the content flow and the old topbar markup/styles
- [x] 2.4 Move global save/error feedback into a non-reflowing surface (toolbar-adjacent status area)

## 3. Document tabs

- [x] 3.1 Create `core/tabs/` TabStore: ordered open paths, active path, open/activate/close, de-duplication on reopen, sync with `DocumentRouter.active` (D5)
- [x] 3.2 Auto-close a tab when its document is deleted externally, via `workspace.onDocumentDeleted`
- [x] 3.3 Render the tab strip between toolbar and body spanning the main region: file name per tab, active-tab styling, close affordance, dirty indicator replacing close when unsaved
- [x] 3.4 Tab interactions: click to activate, close button, middle-click close, next/previous tab keyboard shortcuts
- [x] 3.5 Show the welcome state in the main region and hide the strip when the last tab closes

## 4. File explorer sidebar

- [x] 4.1 Rewrite `sidebar.tsx` as the file explorer: disclosure chevrons, type icons, 28px rows, hover/selected/active tints per tokens (D7)
- [x] 4.2 Session-scoped expanded-folder `Set<string>` state; all collapsed on first open; state survives tab switches
- [x] 4.3 Single-click opens the file and selects its row; active document row shows the distinct active highlight when its folder is expanded
- [x] 4.4 Empty-workspace prompt in the sidebar area that triggers the native folder dialog

## 5. Settings surface

- [x] 5.1 Convert `SettingsPanel` body into grouped rows (label left, control right) grouped by contributing extension, rendered inside the modal sheet with toolbar title and close button (D6)
- [x] 5.2 Swap generic controls for the new vocabulary: switch for booleans, pull-down for choices, text field for text
- [x] 5.3 Open/close from the toolbar without unmounting main content; closing restores prior focus state

## 6. Welcome state and polish

- [x] 6.1 Build the centered welcome view for the main region when no folder is open, with the open-folder action
- [x] 6.2 Sweep remaining hardcoded colors/sizes in built-in extensions (reader, editor, presets) onto tokens; remove dead topbar/settings CSS from theme.css

## 7. Verification

- [x] 7.1 `npm run lint` and `npm run typecheck` pass
- [x] 7.2 Manual pass: light/dark/auto switching with reader, editor, and split open simultaneously; CodeMirror and Shiki restyle live
- [x] 7.3 Manual pass: open 5+ files as tabs, dirty/save cycle shows and clears the indicator, middle-click close, external deletion closes the tab
- [x] 7.4 Manual pass: explorer expand/collapse persistence across tab switches, active-file highlight, empty states (no folder, last tab closed)

## 8. Feedback round 1

- [x] 8.1 Grant `core:window:allow-start-dragging` capability so the toolbar drag region works (window was immovable)
- [x] 8.2 Fix font shorthand token order (weight before size) that dropped the UI font and fell back to serif; add global button/input font reset
- [x] 8.3 Fix broken scroll: add `min-height: 0` to `.mdr-content`/`.mdr-main-region` so panes bound and scroll internally
- [x] 8.4 Rework dark palette to neutral Apple-like greys with a brighter accent; style reader links via the accent token so URLs are legible in dark mode
- [x] 8.5 Render choice settings with three or fewer options as a segmented control (appearance is now a segmented toggle, not a select)
- [x] 8.6 Add sidebar resizing (drag divider, session-persistent, clamped) and fold/unfold toolbar toggle
- [x] 8.7 Hide non-displayable files (and folders left empty) in the explorer: claimed types plus .txt/.text only
- [x] 8.8 Update spec deltas (file-explorer, visual-design-system, extension-platform) and lint/typecheck pass
