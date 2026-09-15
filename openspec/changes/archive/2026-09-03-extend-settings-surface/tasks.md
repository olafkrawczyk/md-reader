## 1. Token foundation

- [x] 1.1 Add content typography tokens to `src/theme.css` (light/dark variants): `--mdr-content-font-scale` (per step), `--mdr-content-tint-*` pairs for default/sepia/slate/high-contrast, `--mdr-content-line-height` (per choice), `--mdr-content-measure` (per choice)
- [x] 1.2 Add step/tint/height/measure name→value maps to `src/core/theme/tokens.ts` with defaults exported for the schema defaults

## 2. Number setting type

- [x] 2.1 Extend `SettingSchemaEntry` in `contributionRegistries.ts` with a `number` variant (`defaultValue: number`, optional `min`/`max`/`step`) and validate contributions
- [x] 2.2 Widen `SettingValue` in `settingsStore.ts` to `string | number | boolean`, add `getNumber` with clamping, extend the load-time value check, add `set` unit coverage via existing store tests
- [x] 2.3 Add `Stepper` control to `src/core/ui/controls.tsx` (label association, real buttons, clamped emission) with styles in the design system control vocabulary
- [x] 2.4 Render number entries as steppers in `SettingsPanel.tsx`

## 3. Theme extension settings

- [x] 3.1 Register the four `reading` namespace entries in `src/extensions/theme.ts`: font size (choice S/M/L/XL, default M), text tint (choice, default Default), line height (choice, default Comfortable), measure (choice, default Medium)
- [x] 3.2 Add live subscribers that map stored values to the content tokens via `applyTokens`/`setProperty`, matching the existing font/appearance subscription pattern

## 4. Content pane styling

- [x] 4.1 Apply content font scale, tint, line height, and measure to document content containers in editor and reading panes (`max-inline-size` for measure; ensure CodeMirror content inherits rather than reconfigures its theme)
- [x] 4.2 Verify UI chrome (toolbar, sidebar, tabs, settings) is untouched by the new content tokens

## 5. Verification

- [x] 5.1 Playwright checks: size change applies live to both pane kinds and persists; tint applies to content only in light and dark; measure caps line length; settings group renders one row per setting
- [x] 5.2 Run `npm run lint`, `npm run typecheck`, and `npm run build` clean
- [x] 5.3 Validate change: `openspec validate extend-settings-surface --strict`