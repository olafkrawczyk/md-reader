# Proposal: React State and Effects Refactor

## Why

A pre-planning audit of the component layer (September 2026) found that state management and effects have drifted from a predictable model as features landed: `App.tsx` alone holds 10 `useState` and 11 `useEffect` mixing bootstrap, store subscriptions, global keybindings, drag handling, and timers; external stores are manually mirrored into component state via subscription effects instead of `useSyncExternalStore`; `FindBar` duplicates its state in refs; and three modules keep undocumented mutable globals. The codebase is otherwise strong (no `any`, no unsafe casts, clean IO boundaries in the store classes), so now — while the app is small — is the cheapest moment to lock in a type-safe, functional state discipline before more surfaces grow on top of the current patterns.

## What Changes

- **State budget rule**: any component with more than two independent `useState` values is refactored to a single typed `useReducer` with discriminated-action state machines (`App`, `SidebarPane`, `FindBar`).
- **Effects discipline**: effects that only mirror an external store into `useState` are replaced with `useSyncExternalStore` (layout, router, tabs, settings, workspace tree, focus). Remaining effects are limited to true external-system synchronization (CodeMirror lifecycle, DOM/window listeners, Tauri events) and are hoisted as high in the tree as possible, concentrated in dedicated custom hooks or the app shell.
- **Derived state over synchronized state**: values computable from props/store state (routed documents, visible trees, expanded-folders-while-filtering) become render-time derivations; the reader's tick + eslint-disable `useMemo` hack is replaced by subscription-driven `useSyncExternalStore` memoization.
- **No state mirrored in refs**: `FindBar`'s `openRef`/`queryRef`/`paneIdRef` collapse into one reducer state; `PaneContainer`'s key-handler ref stays (imperative registry) but the host context value becomes referentially stable.
- **Module-level mutable globals made explicit**: `fractionCache`, reader `astCache`/`cacheListeners`, and pane-focus tracking move behind the established store/service pattern (subscribable, typed, testable) instead of loose module variables.
- **Performance hygiene**: memoize context providers, `React.memo` the hot leaf components (`ExplorerRows`, `TabStrip`, controls), `useCallback` for handlers passed to memoized children, stable deps — no behavior change, fewer wasted renders (e.g. `bootstrapExtensions` no longer called in the render body).
- **Enforcement**: ESLint rules encoding the state budget and effects discipline so the conventions hold for future code.
- No user-visible behavior changes: all features (tabs, presets, sidebar, find, settings, CLI open, keyboard shortcuts) keep working identically.

Assumption (recorded, not asked): no new runtime dependencies — the discipline is built on React 19 built-ins (`useReducer`, `useSyncExternalStore`, `memo`, stable context) plus the existing hand-rolled store classes, which already provide the IO seam.

## Capabilities

### New Capabilities

- `react-state-architecture`: the conventions governing how components hold and update state, how effects synchronize with external systems, and how external stores are consumed — the rules every current and future component must satisfy (state budget, effects placement, IO separation, store consumption pattern, render purity).

### Modified Capabilities

<!-- None: all existing capabilities keep their external behavior. This change
     alters implementation patterns and adds an architecture capability only. -->

## Impact

- **Code**: `src/App.tsx` (split into hooks + reducer state), `src/extensions/sidebar.tsx`, `src/extensions/search.tsx`, `src/extensions/editor.tsx`, `src/extensions/reader.tsx`, `src/extensions/presets.tsx`, `src/core/panes/paneHost.tsx`, `src/core/panes/splitLayout.tsx`, `src/core/settings/SettingsPanel.tsx`, `src/core/ui/controls.tsx`; new hook/store modules under `src/core/state/`.
- **Tooling**: `eslint.config.js` gains rules enforcing the state budget and effects discipline; `npm run lint` / `npm run typecheck` / `npm run build` must stay green.
- **Dependencies**: none added or removed.
- **Risk**: subscription and drag/keybinding semantics are easy to break silently; mitigated by mechanical per-component refactors, existing Playwright UI test, and manual verification of every keyboard shortcut and pane interaction.
