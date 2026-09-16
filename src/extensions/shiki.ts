import { createHighlighter } from "shiki";
import type { Highlighter } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { budgetedMemo } from "../core/budgetedMemo";
import type { ExtensionApi, ExtensionDescriptor } from "../core/extension";
import { highlightCodeKey } from "./markdownContract";
import type { HighlightCode } from "./markdownContract";

const THEMES = { light: "github-light", dark: "github-dark" } as const;

/**
 * Highlighting costs ~8.5ms per KB of code and scales with bytes, not block
 * count, so a code-heavy document spends seconds in shiki. It therefore runs
 * off the render path: @mdr/reader paints plain <pre><code> first and calls
 * this service afterwards to swap in highlighted markup block by block.
 */
async function activate(api: ExtensionApi): Promise<void> {
  let highlighter: Highlighter | null = null;

  // Edits reparse the whole document, so every keystroke re-runs this pass over
  // every block — but only the edited block's text actually changed. Keyed by
  // language + source, holding ~8MB of markup: a few hundred typical blocks.
  const memo = budgetedMemo(4_000_000);

  const highlight: HighlightCode = (code, lang) => {
    const hl = highlighter;
    // Unlabeled blocks keep the plain monospace fallback styling of the
    // reading pane; shiki throws for unknown/aliased-unloaded languages and
    // that falls back too.
    if (hl === null || lang === "") {
      return null;
    }
    return memo(`${lang}\0${code}`, () => {
      try {
        // Dual themes: light colors inline, dark on --shiki-dark; the
        // stylesheet swaps them off [data-appearance]. Both palettes sit in
        // the markup, so an appearance change never invalidates a cached block.
        return hl.codeToHtml(code, { lang, themes: THEMES, defaultColor: "light" });
      } catch {
        // Highlighting is best-effort per block; the miss is cached too, so an
        // unknown language costs one throw rather than one per keystroke.
        return null;
      }
    });
  };

  highlighter = await createHighlighter({
    themes: [THEMES.light, THEMES.dark],
    langs: [
      "typescript",
      "javascript",
      "python",
      "rust",
      "bash",
      "json",
      "html",
      "css",
      "markdown",
      "yaml",
    ],
    engine: createJavaScriptRegexEngine(),
  });

  // Registered only once the highlighter is ready — consumers re-run when
  // the service appears, so a document opened during boot highlights late
  // rather than not at all.
  api.services.register(highlightCodeKey, highlight);
}

export const shikiExtension: ExtensionDescriptor = {
  manifest: {
    id: "@mdr/shiki",
    displayName: "Code block highlighting",
    version: "0.1.0",
  },
  load: () => Promise.resolve({ activate }),
};
