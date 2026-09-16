// Every face the reader pane can request: regular/bold and both italics
// (headings and strong default to 700, em to italic). Lexend ships no
// italic faces upstream, so italics under that option stay synthesized.
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/atkinson-hyperlegible/400-italic.css";
import "@fontsource/atkinson-hyperlegible/700-italic.css";
import "@fontsource/lexend/400.css";
import "@fontsource/lexend/700.css";
import type { ExtensionApi, ExtensionDescriptor } from "../core/extension";
import {
  applyTokens,
  defaultFontScaleStep,
  defaultLineHeight,
  defaultMeasure,
  defaultReadingFont,
  defaultTextTint,
  fontScaleSteps,
  fontStackFor,
  lineHeightChoices,
  measureChoices,
  textTints,
} from "../core/theme/tokens";
import {
  setAppearanceMode,
} from "../core/theme/appearance";
import type { AppearanceMode } from "../core/theme/appearance";
import type { SettingValue } from "../core/settings/settingsStore";

const APPEARANCE_MODES: readonly AppearanceMode[] = ["auto", "light", "dark"];

function toMode(value: SettingValue | null): AppearanceMode {
  return APPEARANCE_MODES.find((mode) => mode === value) ?? "auto";
}

/** Resolves a stored choice label to its token value, falling back to the default. */
function toChoiceValue<T>(value: SettingValue | null, table: Readonly<Record<string, T>>, fallback: T): T {
  const match = typeof value === "string" ? table[value] : undefined;
  return match ?? fallback;
}

function activate(api: ExtensionApi): void {
  api.settings.register({
    namespace: "reading",
    entries: [
      {
        key: "font",
        label: "Reading font",
        type: "choice",
        choices: ["Atkinson Hyperlegible", "Lexend"],
        defaultValue: defaultReadingFont,
      },
      {
        key: "fontSize",
        label: "Font size",
        type: "choice",
        choices: Object.keys(fontScaleSteps),
        defaultValue: defaultFontScaleStep,
      },
      {
        key: "textTint",
        label: "Text color",
        type: "choice",
        choices: Object.keys(textTints),
        defaultValue: defaultTextTint,
      },
      {
        key: "lineHeight",
        label: "Line height",
        type: "choice",
        choices: Object.keys(lineHeightChoices),
        defaultValue: defaultLineHeight,
      },
      {
        key: "measure",
        label: "Reading measure",
        type: "choice",
        choices: Object.keys(measureChoices),
        defaultValue: defaultMeasure,
      },
      {
        key: "focusMode",
        label: "Focus mode",
        type: "boolean",
        defaultValue: false,
      },
      {
        key: "bionicReading",
        label: "Bionic reading",
        type: "boolean",
        defaultValue: false,
      },
    ],
  });
  api.settings.register({
    namespace: "appearance",
    entries: [
      {
        key: "mode",
        label: "Appearance",
        type: "choice",
        choices: APPEARANCE_MODES,
        defaultValue: "auto",
      },
    ],
  });

  // Applied live: the store subscription fires on registration and on
  // every change, without a restart.
  api.settingsValues.subscribe("reading", "font", (value) => {
    const font = typeof value === "string" ? value : defaultReadingFont;
    document.documentElement.style.setProperty(
      "--mdr-font-reading",
      fontStackFor(font),
    );
  });
  api.settingsValues.subscribe("reading", "fontSize", (value) => {
    const scale = toChoiceValue(value, fontScaleSteps, fontScaleSteps[defaultFontScaleStep] ?? 1);
    applyTokens({ contentFontScale: String(scale) });
  });
  api.settingsValues.subscribe("reading", "textTint", (value) => {
    const tint = toChoiceValue(value, textTints, textTints[defaultTextTint] ?? "default");
    applyTokens({ contentTint: `var(--mdr-content-tint-${tint})` });
  });
  api.settingsValues.subscribe("reading", "lineHeight", (value) => {
    const height = toChoiceValue(
      value,
      lineHeightChoices,
      lineHeightChoices[defaultLineHeight] ?? 1.6,
    );
    applyTokens({ contentLineHeight: String(height) });
  });
  api.settingsValues.subscribe("reading", "measure", (value) => {
    const measure = toChoiceValue(value, measureChoices, measureChoices[defaultMeasure] ?? "46rem");
    applyTokens({ contentMeasure: measure });
  });
  api.settingsValues.subscribe("appearance", "mode", (value) => {
    setAppearanceMode(toMode(value));
  });
}

export const themeExtension: ExtensionDescriptor = {
  manifest: {
    id: "@mdr/theme",
    displayName: "Theme",
    version: "0.1.0",
  },
  load: () => Promise.resolve({ activate }),
};
