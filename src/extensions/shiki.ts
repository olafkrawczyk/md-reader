import { createHighlighter } from "shiki";
import type { Highlighter } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { ExtensionApi, ExtensionDescriptor } from "../core/extension";
import type { Html } from "mdast";
import { walkCodeBlocks } from "./markdownContract";
import type { MarkdownPayload } from "./markdownContract";

const THEMES = { light: "github-light", dark: "github-dark" } as const;

async function activate(api: ExtensionApi): Promise<void> {
  let highlighter: Highlighter | null = null;

  // Priority 10: runs after @mdr/gfm (0) so its node rewrites survive.
  api.transformers.attach("markdown", {
    id: "@mdr/shiki",
    priority: 10,
    transform(payload: MarkdownPayload): void {
      const hl = highlighter;
      if (hl === null) {
        return;
      }
      walkCodeBlocks(payload.ast, (code, parent, index) => {
        const lang = code.lang ?? "";
        // Unlabeled blocks keep the plain monospace fallback styling of
        // the reading pane; shiki throws for unknown/aliased-unloaded
        // languages and that falls back too.
        if (lang === "") {
          return;
        }
        try {
          const html: Html = {
            type: "html",
            // Dual themes: light colors inline, dark on --shiki-dark; the
            // stylesheet swaps them off [data-appearance].
            value: hl.codeToHtml(code.value, { lang, themes: THEMES, defaultColor: "light" }),
          };
          parent.children[index] = html;
        } catch {
          // Highlighting is best-effort per block.
        }
      });
    },
  });

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
}

export const shikiExtension: ExtensionDescriptor = {
  manifest: {
    id: "@mdr/shiki",
    displayName: "Code block highlighting",
    version: "0.1.0",
  },
  load: () => Promise.resolve({ activate }),
};
