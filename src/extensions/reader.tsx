import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { JSX } from "react";
import { unified } from "unified";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import type { ExtensionApi, ExtensionDescriptor } from "../core/extension";
import { usePaneHost } from "../core/extension";
import { mdAstCacheKey } from "./markdownContract";
import { swapTaskMarker } from "./taskTicks";
import { useService } from "../core/state/storeHooks";
import type { Document } from "../core/workspace/document";
import { searchTargetRegistryKey } from "../core/search/searchTypes";
import type { MatchState, SearchTarget } from "../core/search/searchTypes";
import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Task checkboxes (design D3): remark-rehype renders them `disabled`; this
 * rehype transformer enables exactly those inside task-list items annotated
 * by @mdr/task-ticks, so the rendered html carries the enabled state and
 * stays byte-identical across re-renders. Post-commit DOM patching would be
 * clobbered by the next commit and replace the input mid-click — the browser
 * then suppresses mouseup/click entirely.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function enableTaskInputs(node: unknown, insideTaskItem: boolean): void {
  if (!isRecord(node)) {
    return;
  }
  const properties = isRecord(node.properties) ? node.properties : undefined;
  if (
    insideTaskItem &&
    node.tagName === "input" &&
    properties?.type === "checkbox"
  ) {
    delete properties.disabled;
  }
  const isTaskItem =
    node.tagName === "li" && properties?.dataTaskStart !== undefined;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      enableTaskInputs(child, insideTaskItem || isTaskItem);
    }
  }
}

const renderer = unified()
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(() => (tree: unknown) => {
    enableTaskInputs(tree, false);
  })
  .use(rehypeStringify, { allowDangerousHtml: true });

/**
 * Re-renders whenever the document changes (e.g. edits in split mode): the
 * document is a mutable external object, so its current text — an immutable
 * string — doubles as the store snapshot that useSyncExternalStore watches.
 */
function useDocumentText(document: Document | null): string | null {
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      document === null ? () => undefined : document.subscribe(onStoreChange),
    [document],
  );
  const getSnapshot = useCallback(() => document?.text ?? null, [document]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

// ---- find (design D2): matches are painted with the CSS Custom Highlight
// API, so the memoized reader HTML never mutates. Re-renders re-apply the
// standing query via a MutationObserver.

const MATCHES_HIGHLIGHT = "mdr-find-matches";
const CURRENT_HIGHLIGHT = "mdr-find-current";

const highlightsSupported =
  typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight === "function";

function collectMatchRanges(
  container: HTMLElement,
  query: string,
): readonly Range[] {
  const needle = query.toLowerCase();
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.tagName === "SCRIPT" || node.parentElement?.tagName === "STYLE"
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node.nodeValue ?? "";
    const haystack = text.toLowerCase();
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + needle.length);
      ranges.push(range);
      index = haystack.indexOf(needle, index + needle.length);
    }
  }
  return ranges;
}

/** Scrolls the nearest scrollable ancestor so the range is comfortably in view. */
function scrollRangeIntoView(range: Range): void {
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return;
  }
  let node: HTMLElement | null =
    range.startContainer instanceof HTMLElement
      ? range.startContainer
      : range.startContainer.parentElement;
  while (node !== null && node !== document.body) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") {
      break;
    }
    node = node.parentElement;
  }
  if (node === null || node === document.body) {
    return;
  }
  const hostRect = node.getBoundingClientRect();
  const margin = 24;
  if (rect.top < hostRect.top) {
    node.scrollTop -= hostRect.top - rect.top + margin;
  } else if (rect.bottom > hostRect.bottom) {
    node.scrollTop += rect.bottom - hostRect.bottom + margin;
  }
}

class ReaderSearchTarget implements SearchTarget {
  readonly #listeners = new Set<(state: MatchState) => void>();
  readonly #container: HTMLElement;
  readonly #observer: MutationObserver;
  #query: string | null = null;
  #ranges: readonly Range[] = [];
  #currentIndex = 0;

  constructor(container: HTMLElement) {
    this.#container = container;
    this.#observer = new MutationObserver(() => {
      if (this.#query !== null) {
        this.#apply(this.#query, this.#currentIndex);
      }
    });
    this.#observer.observe(container, { childList: true, subtree: true });
  }

  get container(): HTMLElement {
    return this.#container;
  }

  find(query: string): void {
    this.#apply(query, 0);
  }

  next(): void {
    this.#move(1);
  }

  prev(): void {
    this.#move(-1);
  }

  refresh(): void {
    if (this.#query !== null) {
      this.#apply(this.#query, this.#currentIndex);
    }
  }

  clear(): void {
    this.#query = null;
    this.#ranges = [];
    this.#paint();
    this.#emit();
  }

  onState(handler: (state: MatchState) => void): () => void {
    this.#listeners.add(handler);
    return () => {
      this.#listeners.delete(handler);
    };
  }

  destroy(): void {
    this.#observer.disconnect();
    this.clear();
  }

  #move(direction: 1 | -1): void {
    if (this.#query === null || this.#ranges.length === 0) {
      return;
    }
    const count = this.#ranges.length;
    this.#currentIndex = (this.#currentIndex + direction + count) % count;
    this.#paint();
    this.#scrollToCurrent();
    this.#emit();
  }

  #apply(query: string, currentIndex: number): void {
    this.#query = query;
    this.#ranges = collectMatchRanges(this.#container, query);
    this.#currentIndex = Math.min(currentIndex, Math.max(this.#ranges.length - 1, 0));
    this.#paint();
    this.#scrollToCurrent();
    this.#emit();
  }

  #paint(): void {
    if (!highlightsSupported) {
      return;
    }
    if (this.#query === null || this.#ranges.length === 0) {
      CSS.highlights.delete(MATCHES_HIGHLIGHT);
      CSS.highlights.delete(CURRENT_HIGHLIGHT);
      return;
    }
    CSS.highlights.set(MATCHES_HIGHLIGHT, new Highlight(...this.#ranges));
    const current = this.#ranges[this.#currentIndex] ?? this.#ranges[0];
    if (current !== undefined) {
      CSS.highlights.set(CURRENT_HIGHLIGHT, new Highlight(current));
    }
  }

  #scrollToCurrent(): void {
    const current = this.#ranges[this.#currentIndex];
    if (current !== undefined) {
      scrollRangeIntoView(current);
    }
  }

  #emit(): void {
    const state: MatchState = {
      count: this.#ranges.length,
      current:
        this.#query === null || this.#ranges.length === 0
          ? null
          : this.#currentIndex + 1,
    };
    for (const listener of this.#listeners) {
      listener(state);
    }
  }
}

function ReaderPane(api: ExtensionApi) {
  return function ReaderPane(): JSX.Element {
    const { document } = usePaneHost();
    const astCache = useService(api.services, mdAstCacheKey);
    const text = useDocumentText(document);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const targetRef = useRef<ReaderSearchTarget | null>(null);
    const registry = useService(api.services, searchTargetRegistryKey);

    const html = useMemo<string | null>(() => {
      if (document === null || astCache === null || text === null) {
        return null;
      }
      const hast = renderer.runSync(astCache.get(document));
      return renderer.stringify(hast);
    }, [document, astCache, text]);

    // One search target per reader container, created lazily when the find
    // bar resolves against this pane; destroyed with the registration.
    const getTarget = useCallback((): SearchTarget | null => {
      const container = containerRef.current;
      if (container === null) {
        return null;
      }
      const existing = targetRef.current;
      if (existing === null || existing.container !== container) {
        existing?.destroy();
        targetRef.current = new ReaderSearchTarget(container);
      }
      return targetRef.current;
    }, []);

    useEffect(() => {
      if (registry === null) {
        return;
      }
      registry.register("reader", getTarget);
      return () => {
        registry.unregister("reader");
        targetRef.current?.destroy();
        targetRef.current = null;
      };
    }, [registry, getTarget]);

    // Task ticks (design D3): one delegated listener per document resolves
    // the clicked item's source span. Keyed on html as well: on first render
    // the container does not exist yet (html is null until the AST cache
    // serves), and only a re-run after content arrives can attach.
    useEffect(() => {
      const container = containerRef.current;
      if (document === null || container === null) {
        return;
      }

      const handleClick = (event: MouseEvent): void => {
        if (!(event.target instanceof Element)) {
          return;
        }
        const input = event.target.closest<HTMLInputElement>("input[type=checkbox]");
        if (input === null || input.disabled) {
          return;
        }
        const item = input.closest<HTMLElement>("li[data-task-start]");
        const start = Number(item?.dataset.taskStart);
        const end = Number(item?.dataset.taskEnd);
        if (item === null || !Number.isFinite(start) || !Number.isFinite(end)) {
          return;
        }
        // The browser toggles `checked` before dispatching click, so the
        // property already holds the new state.
        const next = swapTaskMarker(document.text, start, end, input.checked);
        if (next !== document.text) {
          document.setText(next);
        }
      };

      container.addEventListener("click", handleClick);
      return () => {
        container.removeEventListener("click", handleClick);
      };
    }, [document, html]);

    // External links (design D2/D3): every anchor click is prevented so the
    // webview can never navigate from rendered content; http/https/mailto
    // hrefs are handed to the OS handler. The scheme check reads the raw
    // attribute — a malformed href is ignored, not thrown on. Same keying as
    // the task-tick listener: attach once per document/content swap.
    useEffect(() => {
      const container = containerRef.current;
      if (container === null) {
        return;
      }

      const externalScheme = /^(https?:\/\/|mailto:)/i;

      const handleClick = (event: MouseEvent): void => {
        if (!(event.target instanceof Element)) {
          return;
        }
        const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
        if (anchor === null) {
          return;
        }
        event.preventDefault();
        const href = anchor.getAttribute("href") ?? "";
        if (externalScheme.test(href)) {
          openUrl(href).catch((error: unknown) => {
            console.error("Failed to open external link", href, error);
          });
        }
      };

      container.addEventListener("click", handleClick);
      return () => {
        container.removeEventListener("click", handleClick);
      };
    }, [html]);

    // Element identity as memo boundary: react-dom rewrites
    // dangerouslySetInnerHTML on every commit even when the html string is
    // unchanged, which would replace the whole reader subtree — killing any
    // click in flight (mousedown on the old node, mouseup on the new one,
    // no common ancestor). A stable element reference makes React skip the
    // subtree entirely for re-renders that did not change the content.
    const reader = useMemo(
      () => (
        <div
          className="mdr-reader"
          ref={containerRef}
          dangerouslySetInnerHTML={{ __html: html ?? "" }}
        />
      ),
      [html],
    );

    if (document === null || html === null) {
      return <div className="mdr-empty">No document open.</div>;
    }
    return reader;
  };
}

function activate(api: ExtensionApi): void {
  api.panes.register({
    id: "reader",
    documentTypes: ["markdown"],
    component: ReaderPane(api),
  });
}

export const readerExtension: ExtensionDescriptor = {
  manifest: {
    id: "@mdr/reader",
    displayName: "Reader",
    version: "0.1.0",
  },
  load: () => Promise.resolve({ activate }),
};
