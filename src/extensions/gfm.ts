import remarkGfm from "remark-gfm";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { ExtensionApi, ExtensionDescriptor } from "../core/extension";

import { mdParseKey } from "./markdownContract";

const gfmParser = unified().use(remarkParse).use(remarkGfm);

function activate(api: ExtensionApi): void {
  // GFM is the parse every consumer actually reads, so it replaces the
  // provider's parser outright rather than running as a transformer that
  // re-parsed the text and threw the first tree away. That cost a second
  // full parse on every open (~32ms on a 20KB document) for no new output,
  // and forced every later transformer to re-annotate a fresh AST.
  api.services.register(mdParseKey, (text: string) => gfmParser.parse(text));
}

export const gfmExtension: ExtensionDescriptor = {
  manifest: {
    id: "@mdr/gfm",
    displayName: "GitHub Flavored Markdown",
    version: "0.1.0",
  },
  load: () => Promise.resolve({ activate }),
};
