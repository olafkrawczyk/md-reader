## Why

md-reader currently looks like a web page in a native window: a bare button topbar, a flat non-interactive file list, settings rendered as an inline strip, and a single active document with no sense of an open workspace. The app has a solid extension/token architecture but no visual identity. We want it to feel like a real Apple desktop app — quiet, precise, elegant — without betraying the predictability users expect from macOS.

## What Changes

- Introduce a macOS-native design system: system typography (SF Pro via system font stack), native color ramps, hairline separators, translucent sidebar materials, native-feeling controls, and a small consistent icon set (SF-Symbols-style stroke icons).
- Ship light and dark appearances plus "Auto" (follow system), selectable in settings; all components restyle through the existing `--mdr-*` token contract.
- Replace the topbar with a native-style unified toolbar: inline window title area, folder picker, layout preset switcher (segmented control), and settings entry point — with Tauri window styling so traffic lights sit in the toolbar.
- Add a document tab strip above the main region: every opened file becomes a tab; presets (read/edit/split) continue to work inside the active tab. Tabs support close buttons, dirty indicators, keyboard navigation, and middle-click close.
- Redesign the sidebar as a proper file explorer: collapsible folders with disclosure chevrons, file-type icons, selected/active-file highlight, hover states, and a drag-free single-click open — replacing today's flat, non-expanding tree.
- Redesign settings as a native-style settings window (toolbar-titled, grouped rows, native controls: switches for booleans, pull-downs for choices) replacing the inline panel.
- Unify empty states: a calm, centered welcome view when no folder is open.

## Capabilities

### New Capabilities

- `visual-design-system`: the visual language of the app — token set for light/dark/auto appearance, typography scale, spacing, materials, control styles, iconography rules. Everything else styles against it.
- `document-tabs`: open-document lifecycle as tabs above the main region — open, activate, close, dirty indicators, persistence for the session, interaction with layout presets.
- `file-explorer`: the sidebar file browser UX — collapsible tree, disclosure state, selection, active-document highlight, icons, empty state.

### Modified Capabilities

- `app-shell`: the window requirement changes — the app now uses an integrated toolbar window style (traffic lights inset into the app's toolbar), and folder opening/settings entry move into that toolbar.
- `extension-platform`: the generic settings UI requirement changes — contributed settings still render without per-extension UI code, but the surface becomes a native-styled settings window with grouped rows and native controls, including an Appearance section contributed by the new design system.

## Impact

- `src/theme.css` (rewritten around the new token set), `src/core/theme/tokens.ts` (appearance-aware token application), `src/App.tsx` (toolbar + tab strip layout), `src/core/settings/SettingsPanel.tsx` (settings window shell), `src/extensions/sidebar.tsx` (file explorer).
- New core modules: appearance manager (system appearance detection + override), tab store (open documents, active tab), icon library.
- `src-tauri/tauri.conf.json`: window `titleBarStyle`/`hiddenTitle` for toolbar integration.
- New dependency: an icon set (e.g. `lucide-react` — closest maintained stroke-icon set to SF Symbols styling); no UI framework introduced.
- Extension API: unchanged contracts; settings schema gains an `appearance` contribution from a built-in extension.
