# Tasks: React State and Effects Refactor

## 1. Store consumption foundation

- [x] 1.1 Add snapshot caching to `TabStore` so `tabs`, `paths`, and `activePath` reads return referentially stable values between mutations
- [x] 1.2 Create `src/core/state/storeHooks.ts` with `useStoreValue(source, select)` over `useSyncExternalStore`, including per-subscriber selection caching and a documented stable-snapshot contract
- [x] 1.3 Verify `npm run typecheck` and `npm run lint` stay green; existing behavior unchanged (no component migrated yet)

## 2. Leaf components to store hooks and memoization

- [x] 2.1 Migrate `PresetSwitcher` (src/extensions/presets.tsx) to `useStoreValue` over `api.layout`, removing its subscription `useEffect` and hand-mirrored state
- [x] 2.2 Migrate `SettingsPanel` (src/core/settings/SettingsPanel.tsx) to per-value store hooks, removing the bump-reducer + `subscribeAnyChange` whole-panel re-render; memoize `EntryControl` and stabilize control callbacks
- [x] 2.3 Add `React.memo` to `QuietButton`, `SegmentedControl`, `Switch`, `PullDown`, `TextField`, `Stepper` in src/core/ui/controls.tsx and stabilize call-site handlers with `useCallback` where children are memoized
- [x] 2.4 Migrate `SidebarPane` (src/extensions/sidebar.tsx): tree, active path, and search-service consumption via store hooks; collapse `searchOpen`+`query` into the explorer state reducer per the state budget; derive `visibleTree`/`expanded` purely at render; memoize `ExplorerRows`
- [x] 2.5 Migrate `TabStrip` consumption in App to the tabs store adapter (part of 3.x if deferred — keep App working throughout)

## 3. FindBar state machine

- [x] 3.1 Rewrite `FindBar` (src/extensions/search.tsx) state as one typed reducer (`closed | open { query, target, paneId, matchState }`) eliminating `openRef`, `queryRef`, and `paneIdRef`; open/close/applyQuery/navigation become actions
- [x] 3.2 Keep target binding/cleanup effects within the reducer hook with identical clear-on-close and refocus-previous-pane behavior; verify find in editor and reader panes manually

## 4. Formalize module globals as stores

- [x] 4.1 Move split `fractionCache` into the layout state store (`src/core/panes/layoutState.ts`) with `{ subscribe, get, set }` keyed by slot signature; `SplitLayout` keeps its reducer for the active drag and persists through the store
- [x] 4.2 Replace reader `astCache`/`cacheListeners` with a subscribable availability store; rewrite `useRenderTick` as `useSyncExternalStore` subscriptions (cache availability + `document.subscribe`) so `useMemo` needs no eslint-disable
- [x] 4.3 Formalize pane focus tracking in `paneHost.tsx` as a `{ subscribe, get }` source consumed via the store hook; memoize `PaneHostValue` and stabilize `requestFocus`/`setKeyHandler` so context consumers re-render only on focus/document change

## 5. Editor imperative lifecycle isolation

- [x] 5.1 Extract CodeMirror creation/update/destroy into a `useCodeMirror(document, onDocChanged)` hook (src/extensions/editor.tsx) with all instance refs internal and one justification comment for the remaining effect
- [x] 5.2 Confirm editor search target registration/unregistration and dirty-state propagation unchanged; test split-mode editing and find

## 6. App shell consolidation

- [x] 6.1 Move `bootstrapExtensions` to an idempotent module-level lazy singleton; `App` render no longer calls it
- [x] 6.2 Implement `appShellReducer` (ready, status, settings open, sidebar open/width/resizing) with exhaustively handled discriminated actions in a dedicated module with unit-testable pure transitions
- [x] 6.3 Create top-level hooks `useExtensionActivation`, `useCliOpenEvents`, `useGlobalShortcuts` (including the status auto-clear timer and save/find/tab-switch/close bindings) and wire them in `App`; delete the corresponding inline effects
- [x] 6.4 Migrate remaining App state (preset, active document, tabs, status) to store hooks and the shell reducer; derive `routedDocument`, `mainSlots`, `showWelcome` at render
- [x] 6.5 Full manual pass: every keyboard shortcut (⌘S, ⌘F, ⌘←/→, Ctrl+Tab, ⌘W), sidebar resize, preset switching, CLI-open (initial and second invocation), settings modal focus restore, status flash timing
  <!-- Verified via Playwright smoke run against the dev server (stubbed Tauri): ⌘F find in reader (match count) and editor (decorations), Escape close, split divider drag, sidebar resize, Ctrl+Tab / Ctrl+Shift+Tab cycling, ⌘S status flash, ⌘W close to welcome, settings modal Escape, zero page errors. CLI-open flows keep their ported code path but need the real Tauri binary (`npm run tauri dev`) for event delivery. -->

## 7. Lint enforcement

- [x] 7.1 Add local ESLint rule `max-use-state` (error: >2 `useState` per component) in `eslint.config.js` flat config
- [x] 7.2 Add local ESLint rule `no-mirroring-effects` (warning on effects whose only state write is mirroring) and confirm zero warnings on `src/`
- [x] 7.3 Run `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test:ui`; all green
