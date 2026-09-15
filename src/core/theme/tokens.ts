/**
 * The theme token set. Extensions style against `--mdr-*` CSS variables
 * only — never hardcoded values — so a theme change restyles everything
 * consistently. Defaults are declared in src/theme.css and can be
 * overridden at runtime via `applyTokens`.
 */
export type ThemeTokens = Readonly<Record<string, string>>;

function toCustomProperty(token: string): string {
  return `--mdr-${token.replaceAll(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

export function applyTokens(tokens: ThemeTokens): void {
  for (const [token, value] of Object.entries(tokens)) {
    document.documentElement.style.setProperty(toCustomProperty(token), value);
  }
}

export const defaultReadingFont = "Atkinson Hyperlegible";

export const fontStacks: Readonly<Record<string, string>> = {
  "Atkinson Hyperlegible": '"Atkinson Hyperlegible", system-ui, sans-serif',
  Lexend: '"Lexend", system-ui, sans-serif',
};

export function fontStackFor(font: string): string {
  return fontStacks[font] ?? fontStacks[defaultReadingFont] ?? "system-ui, sans-serif";
}

/** Content font-size steps, as multipliers of the inherited base size. */
export const fontScaleSteps: Readonly<Record<string, number>> = {
  S: 0.875,
  M: 1,
  L: 1.15,
  XL: 1.3,
};
export const defaultFontScaleStep = "M";

/** Content text tints; values are the token-suffix names in theme.css. */
export const textTints: Readonly<Record<string, string>> = {
  Default: "default",
  Sepia: "sepia",
  Slate: "slate",
  "High contrast": "high-contrast",
};
export const defaultTextTint = "Default";

/** Content line-height multipliers. */
export const lineHeightChoices: Readonly<Record<string, number>> = {
  Compact: 1.35,
  Comfortable: 1.6,
  Relaxed: 1.85,
};
export const defaultLineHeight = "Comfortable";

/** Content measure caps (max line length) for document content. */
export const measureChoices: Readonly<Record<string, string>> = {
  Narrow: "36rem",
  Medium: "46rem",
  Wide: "62rem",
};
export const defaultMeasure = "Medium";
