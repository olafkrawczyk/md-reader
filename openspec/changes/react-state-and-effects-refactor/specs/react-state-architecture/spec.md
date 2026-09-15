# react-state-architecture

## Purpose

Defines the state-management and effects conventions every component in the app must follow: bounded component state held in typed reducers, effects reserved for external-system synchronization and hoisted toward the tree root, external stores consumed through subscription hooks, and pure renders. It exists so state stays predictable and type-safe as the app grows.

## ADDED Requirements

### Requirement: Component state budget
A component SHALL NOT declare more than two independent `useState` values. When a component needs three or more independent pieces of state, or state whose next value depends on the combination of existing values, it SHALL hold that state in a single typed reducer (one state object, discriminated actions) instead of parallel `useState` calls.

#### Scenario: Component grows a third state value
- **WHEN** a component already has two `useState` values and needs a third
- **THEN** the component's state is consolidated into one typed reducer whose actions cover all transitions, and lint flags any future violation

#### Scenario: Two trivially independent values remain hooks
- **WHEN** a component holds at most two independent state values with no coupled transitions
- **THEN** plain `useState` is used and no reducer is introduced

### Requirement: Effects synchronize external systems only
A component SHALL NOT use effects to transform, derive, or mirror application state. Values computable during render from props, context, or store state SHALL be derived at render time. Effects are permitted only to synchronize with systems outside React (imperative widget lifecycles, DOM/window/global listeners, timers, external-process events) or to subscribe to external stores via the store-consumption hook.

#### Scenario: Value derivable from existing state
- **WHEN** a rendered value can be computed from props and current state without synchronization
- **THEN** it is computed during render and no effect writes state that mirrors it

#### Scenario: Imperative external system
- **WHEN** a component must create, update, or destroy a non-React resource (such as a code editor instance) in response to prop changes
- **THEN** an effect owns that lifecycle, is isolated in a dedicated hook or module, and cleans up on unmount and on every dependency change

### Requirement: Effects hoisted toward the tree root
Global-scope effects (window/document listeners, app-level event subscriptions, timers) SHALL live as high in the component tree as possible — in the application shell or a dedicated top-level hook — and SHALL NOT be duplicated in leaf components. A leaf component SHALL install listeners only on DOM nodes it owns.

#### Scenario: Global keyboard shortcut
- **WHEN** a keyboard shortcut must respond regardless of which pane has focus
- **THEN** the key listener is installed once at the application shell level, not inside individual panes or widgets

#### Scenario: Component-scoped listener
- **WHEN** a listener concerns only one component's own DOM element (for example, focus tracking on a pane container)
- **THEN** the listener is attached to that component's container and removed on unmount

### Requirement: External stores consumed via subscription hooks
External state (stores, services, documents outside React) SHALL be consumed through a subscription hook that returns the current value and re-renders on change. Components SHALL NOT hand-write subscribe/useState/unsubscribe effect triples for external stores, and SHALL NOT read mutable external state during render except through such a hook.

#### Scenario: Component reflects store state
- **WHEN** a component displays state owned by an external store (active preset, active document, tab list, setting value, workspace tree)
- **THEN** it reads that state through the subscription hook and updates without any hand-written subscription effect

#### Scenario: Store change while displayed
- **WHEN** the external store changes while a component is mounted
- **THEN** the component re-renders with the new value without losing consistency (no tearing between the store value and the render)

### Requirement: Render purity and referential stability
Component render SHALL be free of side effects: no mutation of module or external state, no store writes, no subscriptions created during render. Values provided via context SHALL be referentially stable across re-renders unless their content changes, so context consumers do not re-render gratuitously. Handlers passed to child components SHALL keep stable identities where children are memoized.

#### Scenario: Provider re-renders for unrelated reasons
- **WHEN** a context provider component re-renders without its context value changing
- **THEN** consumers of that context do not re-render

#### Scenario: Hot leaf re-render isolation
- **WHEN** a parent re-renders but a leaf component's props are unchanged
- **THEN** the leaf component skips re-rendering via memoization

### Requirement: Type-safe state transitions
All reducer state and actions SHALL be typed with discriminated unions exhaustively handled by the reducer, with no `any`, no unsafe assertions, and no non-null assertions. State transitions SHALL be pure functions of (state, action).

#### Scenario: New action variant added
- **WHEN** a new action variant is added to a reducer's union
- **THEN** compilation fails until the reducer handles it, and lint reports no unsafe casts in the transition logic

### Requirement: No undocumented module-level mutable state
Mutable state shared across components SHALL live in a named, typed store or service with an explicit subscribe/read API — not in bare module-level variables. Any module-level mutable singleton SHALL be reachable through the extension service or store layer so it can be tested and reset.

#### Scenario: Shared layout state needed by two components
- **WHEN** two components must read or update the same mutable value (for example, pane split fractions)
- **THEN** the value lives behind a store API with subscription, and both components consume it through the store-consumption hook
