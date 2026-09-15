## Context

Settings are schema-driven: extensions contribute entries via `api.settings.register()`, the generic `SettingsPanel` renders them, and the `SettingsStore` (namespaced KV over localStorage) notifies live subscribers. The `@mdr/theme` extension already owns the `reading` namespace (reading font) and applies values by setting `--mdr-*` CSS custom properties on `documentElement`. The design system styles all surfaces against tokens. Supported setting types are currently choice, boolean, and text.

## Goals / Non-Goals

**Goals:**
- Reading-comfort settings applied purely through the existing token + subscription mechanism — no new state layer.
- A `number` setting type general enough for future extensions (bounds, step), rendered by a macOS-style stepper.
- Every new knob maps to a CSS custom property so panes restyle without React re-renders of content.

**Non-Goals:**
- Free-form color pickers, arbitrary CSS input, per-document overrides, or export/import of settings presets.
- New settings for editor behavior beyond content typography (no keybindings, no cursor options).
- Syncing settings across machines.

## Decisions

- **Settings live in `@mdr/theme` under the existing `reading` namespace** — not a new extension. Rationale: they are appearance/typography concerns, and the namespace already groups reading content settings. Alternative considered: a separate `@mdr/reading-comfort` extension; rejected as fragmentation for zero benefit at this scale.
- **Font size as four discrete steps, not free numeric input in the UI.** Rationale: minimal-editor spirit — S/M/L/XL maps to one scale factor each (e.g. 0.875 / 1 / 1.15 / 1.3 × base) and keeps the choice type. The `number` type still ships for the platform contract; it is exercised by tests but no core setting uses it yet.
- **Text tint as curated tints, stored as token names, not hex values.** Values (`default`, `sepia`, `slate`, `high-contrast`) resolve to `--mdr-content-tint-*` CSS variables that have light/dark variants resolved by appearance, so tints compose with auto appearance instead of fighting it. Alternative considered: color picker writing raw hex; rejected — it would bypass the token contract that guarantees dark-mode legibility.
- **Line height and measure also map to tokens** (`--mdr-content-line-height`, `--mdr-content-measure`). Measure is applied via `max-inline-size` on document content containers in both pane kinds; it is a shared pane-level style, not per-extension CSS.
- **`number` type in `SettingSchemaEntry`:** `{ type: "number", defaultValue: number, min?: number, max?: number, step?: number }`. `SettingsStore` gains `getNumber` with the same clamping contract as the spec. The stepper control emits clamped values; the store does no numeric coercion of non-number types.
- **Persistence reuses the existing localStorage KV unchanged** — values are strings or numbers; the store's value type widens from `string | boolean` to `string | number | boolean`. Old persisted payloads validate fine because unknown entries were already type-checked on load; number checks are added.

## Risks / Trade-offs

- [CodeMirror content styling can lag token changes] → Apply the content font-size token to the CodeMirror theme via the existing token property (`.cm-editor` inherits from the pane container) rather than reconfiguring the editor theme on each change.
- [Tint + appearance interaction] → Each tint is defined only as light/dark token pairs; never raw hex. A scenario in the spec pins legibility across appearance switches.
- [Measure on editor panes can feel cramped when editing tables] → Measure caps line length but never clips; wrapping stays enabled. Narrow is opt-in.
- [Stepper accessibility] → Reuse the label association pattern from `Switch`/`TextField` so VoiceOver announces the setting; increment buttons are real buttons, not pointer-only handlers.

## Migration Plan

No migration: existing persisted settings keys are untouched; the store value widening is backward compatible. Rollback is a plain revert — new keys in localStorage are ignored by the old code's type check.

## Open Questions

None.