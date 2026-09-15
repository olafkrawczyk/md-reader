## Why

The settings surface currently exposes only two document-content controls (reading font family, appearance mode). Readers spend most of their time looking at document text, but cannot adjust its size, color, spacing, or measure. This change turns the theme extension into the carrier of a small, opinionated reading-experience setting set — sized to stay within the spirit of a minimal reader.

## What Changes

- Add **reading font size** setting (discrete steps S/M/L/XL), applied live to document content in both editor and reading panes.
- Add **reading text color** setting (curated tints: Default, Sepia, Slate, High contrast) — no free-form color picker; tints are design-system tokens, keeping the minimal-editor spirit.
- Add **line height** setting (choice: Compact / Comfortable / Relaxed).
- Add **reading measure** setting (choice: Narrow / Medium / Wide) constraining the maximum rendered line length.
- Extend the settings schema registry and generic settings UI with a **number setting type** rendered as a native macOS stepper, so future extensions can contribute numeric settings without custom UI.
- All new settings live in the built-in `@mdr/theme` extension under the existing `reading` namespace and follow the existing schema-driven settings contract.

## Capabilities

### New Capabilities
- `reading-experience`: Content-level reading comfort controls contributed by the theme extension — font size, text tint, line height, and reading measure — their defaults, live application, and persistence.

### Modified Capabilities
- `extension-platform`: The schema-driven settings requirement gains a `number` setting type; the settings UI control vocabulary gains a stepper for numeric settings.

## Impact

- `src/extensions/theme.ts` — new setting contributions and live subscribers.
- `src/core/extension/contributionRegistries.ts` — `SettingSchemaEntry` gains a `number` type with min/max/step constraints.
- `src/core/settings/SettingsPanel.tsx` — renders number entries as steppers.
- `src/core/ui/controls.tsx` — new `Stepper` control.
- `src/theme.css` / `src/core/theme/tokens.ts` — new tokens for content font size, text tint, line height, and measure.
- No breaking changes; existing settings keys and persisted values are untouched.