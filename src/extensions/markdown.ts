import { unified } from "unified";
import remarkParse from "remark-parse";
import type { ExtensionApi } from "../core/extension";
import type { ExtensionDescriptor } from "../core/extension";
import {
  extractHeadings,
  mdAstCacheKey,
  mdOutlineCacheKey,
  mdParseKey,
} from "./markdownContract";
import type { MarkdownPayload, MdParse } from "./markdownContract";

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

  // Keyed on the document's text, not its version: an external reload
  // swaps the text without bumping the version, and the reader must
  // re-render from the new content.
  const cache = new Map<
    string,
    { text: string; ast: MarkdownPayload["ast"]; headings: ReturnType<typeof extractHeadings> }
  >();

  api.services.register(mdParseKey, (text: string) => parser.parse(text));

  // The registered parser is the one to use — @mdr/gfm replaces it with a
  // GFM-enabled parse, and re-registration invalidates anything parsed with
  // the previous one.
  let parse: MdParse = (text: string) => parser.parse(text);
  api.services.consume(mdParseKey, (service) => {
    parse = service;
    cache.clear();
  });

  function getParsed(document: { path: string; text: string }) {
    const cached = cache.get(document.path);
    if (cached && cached.text === document.text) {
      return cached;
    }
    const payload: MarkdownPayload = {
      text: document.text,
      ast: parse(document.text),
    };
    pipeline.run(payload);
    const headings = extractHeadings(payload.ast);
    const entry = { text: document.text, ast: payload.ast, headings };
    cache.set(document.path, entry);
    return entry;
  }

  api.services.register(mdAstCacheKey, {
    get(document) {
      return getParsed(document).ast;
    },
  });

  api.services.register(mdOutlineCacheKey, {
    get(document) {
      return getParsed(document).headings;
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
