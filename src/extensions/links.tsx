import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { autocompletion } from "@codemirror/autocomplete";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { ExtensionApi, ExtensionDescriptor } from "../core/extension";
import { serviceKey, usePaneHost } from "../core/extension";
import { useService, useStoreValue } from "../core/state/storeHooks";
import { storeSource } from "../core/state/store";
import type { StoreSource } from "../core/state/store";
import type { FileEntry } from "../core/workspace/types";
import { tabs } from "../core/tabs/tabStore";
import { BacklinksIcon } from "../core/ui/icons";
import { QuietButton } from "../core/ui/controls";
import type { MarkdownPayload } from "./markdownContract";
import { readTextFile } from "../core/workspace/bridge";

export interface BacklinkItem {
  readonly sourcePath: string;
  readonly sourceName: string;
  readonly target: string;
  readonly alias?: string | undefined;
  readonly line: number;
  readonly snippet: string;
}

export interface TargetCompletion {
  readonly label: string;
  readonly detail?: string | undefined;
}

export interface LinkIndexService {
  resolveTarget(target: string, fromPath?: string): string | null;
  getBacklinks(path: string): readonly BacklinkItem[];
  backlinksSource(path: string): StoreSource<readonly BacklinkItem[]>;
  getTargetCompletions(): readonly TargetCompletion[];
  indexFile(path: string, text: string): void;
  removeFile(path: string): void;
  retargetFile(from: string, to: string): void;
  reindexAll(): Promise<void>;
}

export const linkIndexKey = serviceKey<LinkIndexService>("mdr.links.index");

const EMPTY_BACKLINKS: readonly BacklinkItem[] = [];
const emptyBacklinksSource: StoreSource<readonly BacklinkItem[]> = storeSource(
  () => EMPTY_BACKLINKS,
  () => () => {},
);

// ---------------------------------------------------------------------------
// Wikilink AST Transformer (Task 2.1)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const WIKILINK_REGEX = /\[\[([^\]|\n]+?)(?:\|([^\]|\n]+?))?\]\]/g;

function transformWikilinksInAst(node: unknown): void {
  if (!isRecord(node)) {
    return;
  }
  if (node.type === "code" || node.type === "inlineCode") {
    return;
  }
  if (Array.isArray(node.children)) {
    const nextChildren: unknown[] = [];
    for (const child of node.children) {
      if (isRecord(child) && child.type === "text" && typeof child.value === "string") {
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        WIKILINK_REGEX.lastIndex = 0;
        while ((match = WIKILINK_REGEX.exec(child.value)) !== null) {
          if (match.index > lastIndex) {
            nextChildren.push({ type: "text", value: child.value.slice(lastIndex, match.index) });
          }
          const target = match[1]?.trim() ?? "";
          const alias = match[2]?.trim() || target;
          nextChildren.push({
            type: "wikiLink",
            data: {
              hName: "a",
              hProperties: {
                className: ["mdr-wikilink"],
                href: `#wikilink:${encodeURIComponent(target)}`,
                "data-wikilink-target": target,
                title: target,
              },
              hChildren: [{ type: "text", value: alias }],
            },
            children: [{ type: "text", value: alias }],
          });
          lastIndex = match.index + match[0].length;
        }
        if (lastIndex < child.value.length) {
          nextChildren.push({ type: "text", value: child.value.slice(lastIndex) });
        }
      } else {
        transformWikilinksInAst(child);
        nextChildren.push(child);
      }
    }
    node.children = nextChildren;
  }
}

// ---------------------------------------------------------------------------
// Link Parsing & In-Memory Index (Tasks 2.2 & 2.3)
// ---------------------------------------------------------------------------

export interface ParsedLink {
  readonly target: string;
  readonly alias?: string | undefined;
  readonly line: number;
  readonly snippet: string;
}

export function parseLinksFromText(text: string): readonly ParsedLink[] {
  const links: ParsedLink[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i] ?? "";
    WIKILINK_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WIKILINK_REGEX.exec(lineText)) !== null) {
      const target = match[1]?.trim() ?? "";
      if (target.length > 0) {
        const alias = match[2]?.trim();
        links.push({
          target,
          alias,
          line: i + 1,
          snippet: lineText.trim(),
        });
      }
    }
  }
  return links;
}

function dirname(path: string): string {
  const clean = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const idx = clean.lastIndexOf("/");
  if (idx === -1) return "";
  if (idx === 0) return "/";
  return clean.slice(0, idx);
}

function normalizePath(path: string): string {
  const clean = path.replace(/\\/g, "/");
  const isAbsolute = clean.startsWith("/");
  const segments = clean.split("/");
  const resolved: string[] = [];
  for (const seg of segments) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (resolved.length > 0 && resolved[resolved.length - 1] !== "..") {
        resolved.pop();
      } else if (!isAbsolute) {
        resolved.push("..");
      }
    } else {
      resolved.push(seg);
    }
  }
  const result = resolved.join("/");
  return isAbsolute ? `/${result}` : result;
}

function joinPath(base: string, rel: string): string {
  if (!base) return normalizePath(rel);
  return normalizePath(`${base}/${rel}`);
}

function fileNameOf(path: string): string {
  return path.split("/").pop() ?? path;
}

function stemOf(path: string): string {
  const name = fileNameOf(path);
  const dot = name.lastIndexOf(".");
  return dot === -1 ? name : name.slice(0, dot);
}

function collectAllFiles(entries: readonly FileEntry[]): string[] {
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.kind === "file") {
      paths.push(entry.path);
    } else if (entry.children) {
      paths.push(...collectAllFiles(entry.children));
    }
  }
  return paths;
}

export class LinkIndexServiceImpl implements LinkIndexService {
  readonly #api: ExtensionApi;
  readonly #listeners = new Set<() => void>();
  // Map of sourcePath -> links parsed from that file
  readonly #fileLinks = new Map<string, readonly ParsedLink[]>();
  // Cached per-path backlink snapshots: getBacklinks is read on every render
  // through the store sources, so snapshots must be referentially stable
  // between index mutations.
  readonly #backlinksCache = new Map<string, readonly BacklinkItem[]>();
  // The workspace tree is walked by every resolveTarget call, and
  // getBacklinks makes one per link in the workspace — an O(files x links)
  // re-walk that dominated opening a file. The derived file list is cached
  // against the tree identity instead; the workspace replaces the array on
  // every rescan, so identity is an exact staleness check.
  #fileListTree: readonly FileEntry[] | null = null;
  #mdFiles: readonly string[] = [];
  // Candidate path (lowercased, with and without extension) -> first file
  // matching it, and lowercased stem -> every file with that stem. Both
  // replace linear scans that ran once per link per backlink query.
  #byCandidate = new Map<string, string>();
  #byStem = new Map<string, string[]>();

  constructor(api: ExtensionApi) {
    this.#api = api;
  }

  /** Markdown files in the workspace, recomputed only when the tree changes. */
  #markdownFiles(): readonly string[] {
    const tree = this.#api.workspace.tree;
    if (tree !== this.#fileListTree) {
      this.#fileListTree = tree;
      this.#mdFiles = collectAllFiles(tree).filter(
        (p) => p.endsWith(".md") || p.endsWith(".markdown"),
      );
      this.#byCandidate = new Map();
      this.#byStem = new Map();
      for (const file of this.#mdFiles) {
        const norm = normalizePath(file).toLowerCase();
        // matchesCandidate accepts the path as written and the path with the
        // markdown extension stripped; both are keys onto the same file.
        // First file wins, matching the previous `find` semantics.
        for (const key of [norm, norm.replace(/\.(md|markdown)$/, "")]) {
          if (!this.#byCandidate.has(key)) {
            this.#byCandidate.set(key, file);
          }
        }
        const stem = stemOf(file).toLowerCase();
        const bucket = this.#byStem.get(stem);
        if (bucket === undefined) {
          this.#byStem.set(stem, [file]);
        } else {
          bucket.push(file);
        }
      }
    }
    return this.#mdFiles;
  }

  /** The file a candidate path names, or null. Replaces a linear scan. */
  #lookupCandidate(candidate: string): string | null {
    this.#markdownFiles();
    return this.#byCandidate.get(normalizePath(candidate).toLowerCase()) ?? null;
  }

  resolveTarget(target: string, fromPath?: string): string | null {
    const normalizedTarget = target.trim().replace(/\\/g, "/");
    if (!normalizedTarget) return null;

    const mdFiles = this.#markdownFiles();

    const hasSlash = normalizedTarget.includes("/");
    const sourceDir = fromPath ? dirname(fromPath) : undefined;

    // 1. Source directory relative
    if (sourceDir !== undefined) {
      if (!hasSlash) {
        // Bare target: check if sibling exists in source directory
        const sibling = this.#lookupCandidate(joinPath(sourceDir, normalizedTarget));
        if (sibling) {
          return sibling;
        }
      } else if (normalizedTarget.startsWith("./") || normalizedTarget.startsWith("../")) {
        // Explicit relative path with ./ or ../
        return this.#lookupCandidate(joinPath(sourceDir, normalizedTarget));
      }
    } else if (normalizedTarget.startsWith("./") || normalizedTarget.startsWith("../")) {
      return null;
    }

    // 2. Path with slashes (e.g. A/readme or sub/doc)
    if (hasSlash) {
      // 2a. Check relative to source directory (if sourceDir exists and target doesn't start with /)
      if (sourceDir !== undefined && !normalizedTarget.startsWith("/")) {
        const relMatch = this.#lookupCandidate(joinPath(sourceDir, normalizedTarget));
        if (relMatch) {
          return relMatch;
        }
      }

      // 2b. Check relative to workspace root
      const root = this.#api.workspace.root;
      const cleanTarget = normalizedTarget.startsWith("/") ? normalizedTarget.slice(1) : normalizedTarget;
      if (root) {
        const rootMatch = this.#lookupCandidate(joinPath(root, cleanTarget));
        if (rootMatch) {
          return rootMatch;
        }
      }

      // Fallback: match by workspace-relative suffix
      const targetLower = cleanTarget.toLowerCase();
      const suffixMatch = mdFiles.find((file) => {
        const normFile = normalizePath(file).toLowerCase();
        return (
          normFile.endsWith(`/${targetLower}.md`) ||
          normFile.endsWith(`/${targetLower}.markdown`) ||
          normFile.endsWith(`/${targetLower}`) ||
          normFile === `${targetLower}.md` ||
          normFile === targetLower
        );
      });
      if (suffixMatch) {
        return suffixMatch;
      }

      return null;
    }

    // 3. Unique global stem match (bare target without slashes)
    const matches = this.#byStem.get(stemOf(normalizedTarget).toLowerCase()) ?? [];
    if (matches.length === 1) {
      return matches[0] ?? null;
    }

    // 4. Ambiguous bare target (> 1 match) or not found (0 matches)
    return null;
  }

  getBacklinks(path: string): readonly BacklinkItem[] {
    const cached = this.#backlinksCache.get(path);
    if (cached !== undefined) {
      return cached;
    }

    // Count workspace filenames so colliding names (A/notes.md vs B/notes.md)
    // can be shown with their directory to stay distinguishable.
    const allFiles = collectAllFiles(this.#api.workspace.tree);
    const nameCounts = new Map<string, number>();
    for (const file of allFiles) {
      const name = fileNameOf(file).toLowerCase();
      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    }

    const root = this.#api.workspace.root;
    const rootNorm = root ? normalizePath(root) : "";

    const backlinks: BacklinkItem[] = [];

    for (const [sourcePath, links] of this.#fileLinks) {
      if (sourcePath === path) {
        continue; // Skip self-links
      }
      for (const link of links) {
        const resolved = this.resolveTarget(link.target, sourcePath);
        if (resolved === path) {
          const name = fileNameOf(sourcePath);
          const nameKey = name.toLowerCase();
          const isDuplicate = (nameCounts.get(nameKey) ?? 0) > 1;
          const normSource = normalizePath(sourcePath);
          const relative =
            rootNorm && normSource.startsWith(`${rootNorm}/`)
              ? normSource.slice(rootNorm.length + 1)
              : normSource;
          const displayPath = relative !== name ? relative : undefined;
          backlinks.push({
            sourcePath,
            sourceName: isDuplicate && displayPath ? displayPath : name,
            target: link.target,
            alias: link.alias,
            line: link.line,
            snippet: link.snippet,
          });
        }
      }
    }

    this.#backlinksCache.set(path, backlinks);
    return backlinks;
  }

  backlinksSource(path: string): StoreSource<readonly BacklinkItem[]> {
    return storeSource(
      () => this.getBacklinks(path),
      (listener) => {
        const onUpdate = () => listener(this.getBacklinks(path));
        this.#listeners.add(onUpdate);
        return () => {
          this.#listeners.delete(onUpdate);
        };
      },
    );
  }

  getTargetCompletions(): readonly TargetCompletion[] {
    const mdFiles = this.#markdownFiles();
    const root = this.#api.workspace.root;
    const rootNorm = root ? normalizePath(root) : "";

    // Count lowercase stems to detect collisions
    const stemCounts = new Map<string, number>();
    for (const file of mdFiles) {
      const stemKey = stemOf(file).toLowerCase();
      stemCounts.set(stemKey, (stemCounts.get(stemKey) ?? 0) + 1);
    }

    return mdFiles.map((file) => {
      const stem = stemOf(file);
      const stemKey = stem.toLowerCase();
      const isDuplicate = (stemCounts.get(stemKey) ?? 0) > 1;
      const normFile = normalizePath(file);
      const relative = rootNorm && normFile.startsWith(`${rootNorm}/`)
        ? normFile.slice(rootNorm.length + 1)
        : normFile;
      const relWithoutExt = relative.endsWith(".md")
        ? relative.slice(0, -3)
        : relative.endsWith(".markdown")
          ? relative.slice(0, -9)
          : relative;

      const label = isDuplicate ? relWithoutExt : stem;
      return {
        label,
        detail: relative !== label ? relative : undefined,
      };
    });
  }

  indexFile(path: string, text: string): void {
    const links = parseLinksFromText(text);
    this.#fileLinks.set(path, links);
    this.#notify();
  }

  removeFile(path: string): void {
    if (this.#fileLinks.delete(path)) {
      this.#notify();
    }
  }

  retargetFile(from: string, to: string): void {
    const existing = this.#fileLinks.get(from);
    if (existing !== undefined) {
      this.#fileLinks.delete(from);
      this.#fileLinks.set(to, existing);
      this.#notify();
    }
  }

  async reindexAll(): Promise<void> {
    const mdFiles = this.#markdownFiles();

    await Promise.all(
      mdFiles.map(async (path) => {
        try {
          const content = await readTextFile(path);
          const links = parseLinksFromText(content);
          this.#fileLinks.set(path, links);
        } catch {
          // Skip unreadable files
        }
      }),
    );
    this.#notify();
  }

  #notify(): void {
    this.#backlinksCache.clear();
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

// ---------------------------------------------------------------------------
// CodeMirror 6 Completion Extension (Task 2.7)
// ---------------------------------------------------------------------------

export function createWikilinkCompletion(getLinkIndex: () => LinkIndexService | null) {
  return autocompletion({
    override: [
      (context: CompletionContext): CompletionResult | null => {
        const word = context.matchBefore(/\[\[([^\]]*)/);
        if (!word) {
          return null;
        }
        const query = word.text.slice(2).toLowerCase();
        const linkIndex = getLinkIndex();
        const completions = linkIndex?.getTargetCompletions() ?? [];
        const options = completions
          .filter((c) => c.label.toLowerCase().includes(query))
          .map((c) => {
            const option: { label: string; detail?: string; type: string; apply: string } = {
              label: c.label,
              type: "text",
              apply: `${c.label}]]`,
            };
            if (c.detail !== undefined) {
              option.detail = c.detail;
            }
            return option;
          });
        return {
          from: word.from + 2,
          options,
        };
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Backlinks Pane Component (Tasks 2.5 & 2.6)
// ---------------------------------------------------------------------------

function BacklinksPane(api: ExtensionApi) {
  return function BacklinksPane(): JSX.Element {
    // Sidebar-hosted panes are always routed `document: null` (App.tsx), so
    // this falls back to the router's active document; main-pane usage gets
    // the routed document directly.
    const routedDoc = usePaneHost().document;
    const activeDocFromRouter = useStoreValue(api.router.activeSource);
    const activeDoc = routedDoc ?? activeDocFromRouter;
    const linkIndex = useService(api.services, linkIndexKey);

    const backlinks = useStoreValue(
      useMemo(() => {
        if (!linkIndex || !activeDoc) {
          return emptyBacklinksSource;
        }
        return linkIndex.backlinksSource(activeDoc.path);
      }, [linkIndex, activeDoc]),
    );

    const handleJump = useCallback(
      (item: BacklinkItem) => {
        tabs.open(item.sourcePath).catch((err: unknown) => {
          console.error("failed to open backlink source", item.sourcePath, err);
        });
      },
      [],
    );

    if (!activeDoc) {
      return <div className="mdr-empty">No document open.</div>;
    }

    return (
      <nav className="mdr-backlinks" aria-label="Incoming Links">
        <div className="mdr-backlinks-header">
          <span className="mdr-backlinks-header-title">Backlinks</span>
          <span className="mdr-backlinks-count">{backlinks.length}</span>
        </div>
        <div className="mdr-backlinks-body">
          {backlinks.length === 0 ? (
            <div className="mdr-empty">No incoming links found.</div>
          ) : (
            <ul className="mdr-backlinks-list">
              {backlinks.map((item, index) => (
                <li key={`${item.sourcePath}-${item.line}-${index}`} className="mdr-backlinks-item">
                  <button
                    type="button"
                    className="mdr-backlinks-link"
                    onClick={() => handleJump(item)}
                  >
                    <div className="mdr-backlinks-item-header">
                      <span className="mdr-backlinks-source-name">{item.sourceName}</span>
                      <span className="mdr-backlinks-line">line {item.line}</span>
                    </div>
                    <div className="mdr-backlinks-snippet">{item.snippet}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </nav>
    );
  };
}

function BacklinksToolbarControl(api: ExtensionApi) {
  return function BacklinksToolbarControl(): JSX.Element | null {
    const [open, setOpen] = useState(false);
    const activeDoc = useStoreValue(api.router.activeSource);
    const linkIndex = useService(api.services, linkIndexKey);
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    const backlinks = useStoreValue(
      useMemo(() => {
        if (!linkIndex || !activeDoc) {
          return emptyBacklinksSource;
        }
        return linkIndex.backlinksSource(activeDoc.path);
      }, [linkIndex, activeDoc]),
    );

    const handleToggle = useCallback(() => {
      setOpen((prev) => !prev);
    }, []);

    const handleJump = useCallback(
      (item: BacklinkItem) => {
        tabs.open(item.sourcePath).catch((err: unknown) => {
          console.error("failed to open backlink source", item.sourcePath, err);
        });
        setOpen(false);
      },
      [],
    );

    useEffect(() => {
      if (!open) return;
      function handlePointerDown(event: PointerEvent) {
        const element = wrapperRef.current;
        if (
          element !== null &&
          event.target instanceof Node &&
          !element.contains(event.target)
        ) {
          setOpen(false);
        }
      }
      function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") {
          setOpen(false);
        }
      }
      document.addEventListener("pointerdown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("pointerdown", handlePointerDown);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, [open]);

    if (!activeDoc) {
      return null;
    }

    return (
      <div ref={wrapperRef} className="mdr-backlinks-toolbar-wrapper">
        <QuietButton
          onClick={handleToggle}
          title={`Backlinks (${backlinks.length})`}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <BacklinksIcon />
            {backlinks.length > 0 && (
              <span className="mdr-toolbar-badge">{backlinks.length}</span>
            )}
          </span>
        </QuietButton>
        {open && (
          <div className="mdr-backlinks-popover" role="dialog" aria-label="Backlinks">
            <div className="mdr-backlinks-popover-title">
              Incoming Links ({backlinks.length})
            </div>
            <div className="mdr-backlinks-popover-content">
              {backlinks.length === 0 ? (
                <div className="mdr-empty">No incoming links found.</div>
              ) : (
                <ul className="mdr-backlinks-list">
                  {backlinks.map((item, index) => (
                    <li key={`${item.sourcePath}-${item.line}-${index}`} className="mdr-backlinks-item">
                      <button
                        type="button"
                        className="mdr-backlinks-link"
                        onClick={() => handleJump(item)}
                      >
                        <div className="mdr-backlinks-item-header">
                          <span className="mdr-backlinks-source-name">{item.sourceName}</span>
                          <span className="mdr-backlinks-line">line {item.line}</span>
                        </div>
                        <div className="mdr-backlinks-snippet">{item.snippet}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };
}

// ---------------------------------------------------------------------------
// Extension Activation
// ---------------------------------------------------------------------------

function activate(api: ExtensionApi): void {
  const linkIndex = new LinkIndexServiceImpl(api);
  api.services.register(linkIndexKey, linkIndex);

  // Markdown AST transformer for wikilinks (Priority 2: runs right after GFM)
  api.transformers.attach("markdown", {
    id: "@mdr/wikilinks",
    priority: 2,
    transform(payload: MarkdownPayload): void {
      transformWikilinksInAst(payload.ast);
    },
  });

  // Register Backlinks pane
  api.panes.register({
    id: "backlinks",
    documentTypes: ["markdown"],
    component: BacklinksPane(api),
  });

  // Register toolbar button
  api.ui.register({
    id: "backlinks-toggle",
    slot: "toolbar",
    component: BacklinksToolbarControl(api),
  });

  // Wire workspace tree and document events to keep index updated
  api.workspace.onTreeChanged(() => {
    linkIndex.reindexAll().catch((err: unknown) => {
      console.error("failed to reindex workspace links", err);
    });
  });

  api.workspace.onDocumentOpened((doc) => {
    linkIndex.indexFile(doc.path, doc.text);
    doc.subscribe(() => {
      linkIndex.indexFile(doc.path, doc.text);
    });
  });

  api.workspace.onDocumentsRetargeted((moves) => {
    for (const move of moves) {
      linkIndex.retargetFile(move.from, move.to);
    }
  });

  api.workspace.onDocumentDeleted((doc) => {
    linkIndex.removeFile(doc.path);
  });
}

export const linksExtension: ExtensionDescriptor = {
  manifest: {
    id: "@mdr/links",
    displayName: "Bidirectional Links",
    version: "0.1.0",
  },
  load: () => Promise.resolve({ activate }),
};
