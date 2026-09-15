import { unified } from "unified";
import remarkParse from "remark-parse";
import type { ExtensionApi } from "../core/extension";
import type { ExtensionDescriptor } from "../core/extension";
import { mdAstCacheKey, mdParseKey } from "./markdownContract";
import type { MarkdownPayload } from "./markdownContract";

const parser = unified().use(remarkParse);

function activate(api: ExtensionApi): void {
  // Claim the document type: .md files become openable markdown documents.
  api.workspace.documentTypes.register(
    { id: "markdown", mimeType: "text/markdown" },
    ["md", "markdown"],
  );

  // Own the markdown transformer pipeline; gfm/shiki attach through the
  // registry (buffered until this claim, so order never matters).
  const pipeline = api.transformers.pipeline<MarkdownPayload>("markdown");

  api.services.register(mdParseKey, (text: string) => parser.parse(text));

  // Keyed on the document's text, not its version: an external reload
  // swaps the text without bumping the version, and the reader must
  // re-render from the new content.
  const cache = new Map<string, { text: string; ast: MarkdownPayload["ast"] }>();
  api.services.register(mdAstCacheKey, {
    get(document) {
      const cached = cache.get(document.path);
      if (cached && cached.text === document.text) {
        return cached.ast;
      }
      const payload: MarkdownPayload = {
        text: document.text,
        ast: parser.parse(document.text),
      };
      pipeline.run(payload);
      cache.set(document.path, { text: document.text, ast: payload.ast });
      return payload.ast;
    },
  });
}

export const markdownExtension: ExtensionDescriptor = {
  manifest: {
    id: "@mdr/markdown",
    displayName: "Markdown",
    version: "0.1.0",
  },
  load: () => Promise.resolve({ activate }),
};
