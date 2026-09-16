import type { Blockquote, Code, Heading, ListItem, Root } from "mdast";
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

export interface DocumentHeading {
  readonly id: string;
  readonly title: string;
  readonly level: number;
  readonly line: number;
}

export interface MdOutlineCache {
  /** Extracted headings for the document's current content. */
  get(document: Document): readonly DocumentHeading[];
}

/**
 * Highlights one code block, returning shiki's `<pre>` markup — or null when
 * the block should keep its plain rendering (no language, unknown language).
 */
export type HighlightCode = (code: string, lang: string) => string | null;

export const highlightCodeKey = serviceKey<HighlightCode>("md:highlight-code");

export const mdParseKey = serviceKey<MdParse>("md:parse");
export const mdAstCacheKey = serviceKey<MdAstCache>("md:ast-cache");
export const mdOutlineCacheKey = serviceKey<MdOutlineCache>("md:outline-cache");

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function hasChildren(node: unknown): node is { children: readonly unknown[] } {
  return (
    typeof node === "object" &&
    node !== null &&
    "children" in node &&
    Array.isArray((node as { readonly children: unknown }).children)
  );
}

function hasValue(node: unknown): node is { value: string } {
  return (
    typeof node === "object" &&
    node !== null &&
    "value" in node &&
    typeof (node as { readonly value: unknown }).value === "string"
  );
}

function extractNodeText(node: unknown): string {
  if (hasValue(node)) {
    return node.value;
  }
  if (hasChildren(node)) {
    let result = "";
    for (const child of node.children) {
      result += extractNodeText(child);
    }
    return result;
  }
  return "";
}

function isHeadingNode(node: unknown): node is Heading {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    (node as { readonly type: unknown }).type === "heading"
  );
}

/**
 * Extracts H1-H6 headings with titles, line positions, and deduplicated slugs,
 * and annotates AST heading nodes with hProperties for HTML rendering.
 */
export function extractHeadings(tree: Root): readonly DocumentHeading[] {
  const headings: DocumentHeading[] = [];
  const slugCounts = new Map<string, number>();

  function visit(node: unknown): void {
    if (isHeadingNode(node)) {
      const title = extractNodeText(node).trim();
      let baseSlug = slugify(title);
      if (baseSlug.length === 0) {
        baseSlug = "heading";
      }
      const count = slugCounts.get(baseSlug) ?? 0;
      slugCounts.set(baseSlug, count + 1);
      const id = count === 0 ? baseSlug : `${baseSlug}-${count}`;
      const line = node.position?.start?.line ?? 1;

      const existingData = typeof node.data === "object" && node.data !== null ? node.data : {};
      const existingHProps =
        "hProperties" in existingData &&
        typeof existingData.hProperties === "object" &&
        existingData.hProperties !== null
          ? existingData.hProperties
          : {};

      node.data = {
        ...existingData,
        hProperties: {
          ...existingHProps,
          id,
          "data-line": line,
        },
      };

      headings.push({
        id,
        title,
        level: node.depth,
        line,
      });
    }

    if (hasChildren(node)) {
      for (const child of node.children) {
        visit(child);
      }
    }
  }

  visit(tree);
  return headings;
}

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
