# Design: React State and Effects Refactor

## Context

The audit behind this change (see proposal.md — Why) found three structural problems: components mirror external stores into local state via hand-written subscription effects; a few components accumulate many parallel `useState` values whose transitions are coupled; and several modules keep bare mutable globals. The app already has the right IO seams — `TabStore`, `SettingsStore`, `DocumentRouter`, the extension service registry — all class-based observables with subscribe/read APIs and side effects confined to their edges. React 19 is in use; `useSyncExternalStore` is available and unused. ESLint already runs `eslint-plugin-react-hooks`.

## Goals / Non-Goals

**Goals:**
- A single, documented pattern for consuming external stores from React (`useSyncExternalStore` adapters) and a single pattern for multi-value component state (typed reducer state machines).
- Global effects consolidated at the app shell; leaf effects limited to resources the leaf owns.
- Elimination of state-in-refs duplication and render-time side effects.
- Referentially stable context values and memoized hot leaves.
- Lint enforcement so the rules survive future contributions.

**Non-Goals:**
- No behavior, feature, visual, or API changes; no persistence semantics changes.
- No new runtime dependencies; no state-management library adoption.
- No rewrite of the imperative subsystems themselves (CodeMirror integration, CSS Custom Highlight API find, Tauri event plumbing keep their current external behavior — only their React integration shape changes).
- No introduction of async-effect libraries or suspense-based data flow.

## Decisions

### D1: React built-ins over state libraries
Use `useReducer`, `useSyncExternalStore`, `memo`, and stable context. Alternatives considered: Zustand (would replace the existing store classes for marginal gain and add a dependency while the app already owns working stores); XState (formal statecharts are overkill for the current action space); TanStack Query (no server cache exists). The existing stores are the IO layer; React built-ins are the consumption layer. Recorded in proposal as an explicit assumption.

### D2: One thin adapter per store, not per component
Add `src/core/state/storeHooks.ts` exposing `useStoreValue(source, select)` implemented over `useSyncExternalStore`, where `source` is the existing `{ subscribe, get }`-shaped observables. Because `getSnapshot` must return referentially stable values, stores that build fresh objects per read (`TabStore.tabs`) get snapshot caching (recompute only on version bump). Selected values are memoized per-subscriber with the standard cached-snapshot pattern. Alternatives: hand-rolled `useSyncExternalStore` calls in each component (repeats the cache-stability fix everywhere and re-invites drift); converting stores to RxJS/signals (new dependency, no payoff at this scale).

### D3: App shell state becomes one reducer plus three focused hooks
`App.tsx`'s ten `useState` values split into: (1) `appShellReducer` — a typed state machine for `{ ready, status, settingsOpen, sidebar: { open, width, resizing } }` with actions like `activated`, `statusShown`, `statusCleared`, `sidebarToggled`, `sidebarResized`, `dragStarted`, `dragEnded`; (2) `useActivePreset()` and `useActiveDocument()` — store hooks over `api.layout` / `api.router`; (3) tab state via the tabs store adapter. Subscription, CLI-event, and keyboard effects move into dedicated top-level hooks (`useExtensionActivation`, `useCliOpenEvents`, `useGlobalShortcuts`) so the shell component renders and composes only. Alternatives considered: several smaller context providers per concern (more ceremony than the app's size warrants; revisit when a second consumer of chrome state appears); keeping separate `useState` but grouping (fails the state-budget rule the user set).

### D4: Effects taxonomy — keep, hoist, or delete
Every existing effect is classified: **delete** (store-mirroring effects → D2 hooks; derivation effects → render-time computation); **hoist** (global keydown, CLI open listener, body-class drag flags → app-shell hooks; status auto-clear timer → stays with status state in the shell reducer's hook); **keep in leaf** (CodeMirror lifecycle in a `useCodeMirror` hook, pane-container focus listeners, ModalSheet's own dialog behavior, reader find target cleanup). No new effect may read or write React state as its primary purpose. This is the codification of "effects as high as possible": global ones to the shell, resource ones to the component owning the DOM node.

### D5: Extension runtime bootstraps once, outside render
`bootstrapExtensions(builtinExtensions)` moves to a module-level lazy singleton (same file or `src/core/extension/bootstrap.ts`), so `App` render is pure and the runtime identity is stable for effect deps. Alternative: `useMemo` in `App` (still couples runtime identity to a component instance and breaks under StrictMode double-render semantics the same way render-time work always does).

### D6: Globals become stores with the same shape
- Split fractions: `fractionCache` moves into a small `layoutState` store (already exists as a concept at `src/core/panes/layoutState.ts` — extend it) exposing `get(signature)`, `set(signature, fractions)`, `subscribe`. SplitLayout consumes via reducer + the store for persistence across remounts; semantics (session-scoped, keyed by arrangement) unchanged.
- Reader AST cache + tick: replace the `cacheListeners` set + `useRenderTick` (reducer tick + eslint-disable) with `useSyncExternalStore` over a `mdAstCacheService` availability store and over `document.subscribe`; the HTML derivation keys off a version the subscription provides, removing the lint disable.
- Pane focus: keep the module-scoped focus registry (it is a legitimate external store) but formalize it as the same `{ subscribe, get }` shape consumed via `useStoreValue`, instead of ad-hoc listener sets.
- FindBar controller: `FindBarController` stays, but open/query/target/pane become one reducer state; refs are eliminated.

### D7: Lint enforcement
`eslint.config.js` gains a local flat-config plugin with two rules (no dependency): (1) `max-use-state` — more than two `useState` calls in one component function is an error, pointing at the reducer rule; (2) `no-mirroring-effects` — flags `useEffect` bodies that call a setter of a `useState` whose only source is the effect (heuristic: `setX` referenced inside `useEffect` where `x` is local state and not written elsewhere) as a warning prompting review. Plus `no-restricted-syntax` banning `as any`/`any` (already absent in src; keep it that way) and enabling the strictest `react-hooks` options. Alternatives: relying on review only (rules drift); a full custom-rule test suite (defer — rules are small and local).

### D8: Performance hygiene, minimally invasive
- `PaneContainer`: memoize the `PaneHostValue` with `useMemo` keyed on `{ document, focused }` and stabilize `setKeyHandler`/`requestFocus` with `useCallback`, so context consumers re-render only when focus/document changes.
- `React.memo` on `ExplorerRows`, `TabStrip`, `QuietButton`, `SegmentedControl` and stable `useCallback` handlers at call sites that pass them.
- `PresetSwitcher`/`SettingsPanel` consume stores via D2 hooks (removing whole-panel bump re-renders; per-value selection means only affected rows re-render).
- `reader.tsx`: `useMemo` over `(document, cacheVersion)` with no lint suppression; the version comes from the subscription hook.

## Risks / Trade-offs

- [Snapshot instability causes render loops with `useSyncExternalStore`] → every adapted store must return cached, referentially stable snapshots; the adapter documents this contract and `TabStore` gets explicit snapshot caching; verified by the Playwright UI run and manual tab/find exercises.
- [Reducer consolidation changes subtle timing (e.g. status auto-clear vs error tone)] → transitions port 1:1 from the current handlers; flash-status timer logic moves into one hook with identical clear-on-new-message behavior; keyboard shortcuts exercised manually after each shell refactor step.
- [Drag resizing regresses (mousemove throttling, clamp boundaries)] → drag math is copied unchanged from current code into the new hook; only state plumbing changes; manual resize test on the sidebar and split dividers.
- [StrictMode/19 double-invocation interacting with the moved bootstrap singleton] → singleton is idempotent (already guarded by `attach`-style idempotency patterns); activation promise is cached.
- [Custom lint rules produce false positives on legit effects] → the mirroring rule is a warning, not an error, and each remaining effect carries a short justification comment; tuning during tasks is expected.
- [Bigger diff in `App.tsx` complicates review] → tasks are sequenced per component with typecheck+lint green at every step; each component refactor is independently verifiable and revertible.

## Migration Plan

Component-by-component, lowest-risk first: (1) store hooks + snapshot caching; (2) leaf components (`presets`, `SettingsPanel`, `controls`, `sidebar`); (3) `FindBar` reducer; (4) `paneHost`/`splitLayout`/`reader` store formalization; (5) editor hook extraction; (6) app shell reducer + hoisted effects; (7) lint rules last, once violations are already fixed. Rollback is per-commit revert; no data or format changes exist. The `tests/reading-settings.mjs` Playwright run and manual shortcut checks gate each shell-level step.

## Open Questions

None. The one scope fork — third-party state library vs React built-ins — was resolved as an explicit recorded assumption (built-ins, no new dependencies) in the proposal.
