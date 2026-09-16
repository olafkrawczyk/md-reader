import remarkGfm from "remark-gfm";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { ExtensionApi, ExtensionDescriptor } from "../core/extension";
import type { MarkdownPayload } from "./markdownContract";

const gfmParser = unified().use(remarkParse).use(remarkGfm);

function activate(api: ExtensionApi): void {
  // Priority 0: re-parses the text, so it must run before any transformer
  // that mutates AST nodes — a later re-parse would discard that work.
  api.transformers.attach("markdown", {
    id: "@mdr/gfm",
    priority: 0,
    transform(payload: MarkdownPayload): void {
      payload.ast = gfmParser.parse(payload.text);
    },
  });
}

export const gfmExtension: ExtensionDescriptor = {
  manifest: {
    id: "@mdr/gfm",
    displayName: "GitHub Flavored Markdown",
    version: "0.1.0",
  },
  load: () => Promise.resolve({ activate }),
};
