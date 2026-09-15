import type { Blockquote, Code, ListItem, Root } from "mdast";
import { serviceKey } from "../core/extension";
import type { Document } from "../core/workspace/document";

/**
 * Shared contract between @mdr/markdown (the provider) and its consumers
 * (@mdr/reader, @mdr/gfm, @mdr/shiki). A contract module, not an extension
 * import — consumers resolve everything through the service registry.
 */

export interface MarkdownPayload {
  readonly text: string;
  ast: Root;
}

export type MdParse = (text: string) => Root;

export interface MdAstCache {
  /** Transformed AST for the document's current version; reparses on change. */
  get(document: Document): Root;
}

export const mdParseKey = serviceKey<MdParse>("md:parse");
export const mdAstCacheKey = serviceKey<MdAstCache>("md:ast-cache");

export type MdParent = Root | Blockquote | ListItem;

export interface CodeBlockVisitor {
  (code: Code, parent: MdParent, index: number): void;
}

/** Fenced code blocks live at top level or inside blockquotes/list items. */
export function walkCodeBlocks(parent: MdParent, visit: CodeBlockVisitor): void {
  parent.children.forEach((child, index) => {
    if (child.type === "code") {
      visit(child, parent, index);
      return;
    }
    if (child.type === "blockquote" || child.type === "listItem") {
      walkCodeBlocks(child, visit);
    }
  });
}
