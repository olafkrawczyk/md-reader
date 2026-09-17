import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { JSX } from "react";
import { unified } from "unified";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import type { ExtensionApi, ExtensionDescriptor } from "../core/extension";
import { usePaneHost } from "../core/extension";
import { highlightCodeKey, mdAstCacheKey, mdOutlineCacheKey } from "./markdownContract";
import { swapTaskMarker } from "./taskTicks";
import { useService, useStoreValue } from "../core/state/storeHooks";
import type { Document } from "../core/workspace/document";
import { searchTargetRegistryKey } from "../core/search/searchTypes";
import type { MatchState, SearchTarget } from "../core/search/searchTypes";
import { openUrl } from "@tauri-apps/plugin-opener";
import { outlineNavigationKey, usePendingJump } from "./outline";
import type { OutlineJumpTarget } from "./outline";
import { FocusIcon } from "../core/ui/icons";
import { QuietButton } from "../core/ui/controls";
import { linkIndexKey, openAtFragment, splitTarget } from "./links";

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

// ---- Bionic reading (task 1.7): a hast transform that splits each word's
// leading characters into a bold `<b>` span, emphasizing the initial word
// fixation for faster saccadic reading. Applied only to the rendered HTML —
// the document source (and its AST) is never touched, so this never leaks
// into edits or saves. Code blocks and existing markup elements are walked
// but only bare text nodes are split.
const WORD_RE = /^([\p{L}\p{N}]+)(.*)$/u;

function bionicBoldLength(stemLength: number): number {
  if (stemLength <= 3) return 1;
  if (stemLength <= 5) return 2;
  if (stemLength <= 8) return 3;
  return Math.ceil(stemLength * 0.4);
}

function transformBionicText(text: string): unknown[] {
  const parts = text.split(/(\s+)/);
  const nodes: unknown[] = [];
  for (const part of parts) {
    if (part === "") {
      continue;
    }
    if (/^\s+$/.test(part)) {
      nodes.push({ type: "text", value: part });
      continue;
    }
    const match = WORD_RE.exec(part);
    if (match === null) {
      nodes.push({ type: "text", value: part });
      continue;
    }
    const stem = match[1];
    const rest = match[2];
    if (stem === undefined) {
      nodes.push({ type: "text", value: part });
      continue;
    }
    const boldLength = bionicBoldLength(stem.length);
    nodes.push({
      type: "element",
      tagName: "b",
      properties: { className: ["mdr-bionic"] },
      children: [{ type: "text", value: stem.slice(0, boldLength) }],
    });
    const remainder = stem.slice(boldLength) + (rest ?? "");
    if (remainder !== "") {
      nodes.push({ type: "text", value: remainder });
    }
  }
  return nodes;
}

const BIONIC_SKIP_TAGS = new Set(["pre", "code", "script", "style"]);

function applyBionicReading(node: unknown, insideSkip: boolean): void {
  if (!isRecord(node) || !Array.isArray(node.children)) {
    return;
  }
  const skip = insideSkip || BIONIC_SKIP_TAGS.has(typeof node.tagName === "string" ? node.tagName : "");
  const nextChildren: unknown[] = [];
  for (const child of node.children) {
    if (!skip && isRecord(child) && child.type === "text" && typeof child.value === "string") {
      nextChildren.push(...transformBionicText(child.value));
      continue;
    }
    applyBionicReading(child, skip);
    nextChildren.push(child);
  }
  node.children = nextChildren;
}

/**
 * Stamps every top-level block with its source line so a line-addressed jump
 * (link with #Lnn, search hit, backlink) has something to scroll to. Only the
 * block level is stamped: that is the granularity the reader can scroll to,
 * and nested elements would multiply the attribute for no gain.
 */
function stampSourceLines(tree: unknown): void {
  if (!isRecord(tree) || !Array.isArray(tree.children)) {
    return;
  }
  for (const child of tree.children) {
    if (!isRecord(child) || child.type !== "element") {
      continue;
    }
    const line = isRecord(child.position) && isRecord(child.position.start)
      ? child.position.start.line
      : undefined;
    if (typeof line !== "number") {
      continue;
    }
    const properties = isRecord(child.properties) ? child.properties : {};
    // Headings already carry data-line from extractHeadings; don't fight it.
    if (properties["data-line"] === undefined) {
      child.properties = { ...properties, "data-line": line };
    }
  }
}

const FOCUS_UNIT_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "pre",
  "table",
  "hr",
  "img",
  "blockquote",
]);

/**
 * Stamps discrete readable blocks with data-focus-unit (design D3).
 * List containers themselves are not units; their direct top-level list items are.
 * Nested lists are not stamped — they ride with their containing top-level li.
 */
function stampFocusUnits(tree: unknown): void {
  if (!isRecord(tree) || !Array.isArray(tree.children)) {
    return;
  }
  for (const child of tree.children) {
    if (!isRecord(child) || child.type !== "element") {
      continue;
    }
    const tag = typeof child.tagName === "string" ? child.tagName : "";
    if (FOCUS_UNIT_TAGS.has(tag)) {
      const properties = isRecord(child.properties) ? child.properties : {};
      child.properties = { ...properties, "data-focus-unit": "" };
    } else if (tag === "ul" || tag === "ol") {
      if (Array.isArray(child.children)) {
        for (const item of child.children) {
          if (isRecord(item) && item.type === "element" && item.tagName === "li") {
            const properties = isRecord(item.properties) ? item.properties : {};
            item.properties = { ...properties, "data-focus-unit": "" };
          }
        }
      }
    }
  }
}

/**
 * The rendered block containing a source line. Only block starts are stamped,
 * so an arbitrary line (a search hit inside a paragraph, an explicit `#L42`)
 * lands on the last block starting at or before it.
 */
function nearestBlockAtLine(container: Element, line: number): Element | null {
  let best: Element | null = null;
  let bestLine = 0;
  for (const element of container.querySelectorAll("[data-line]")) {
    const candidate = Number(element.getAttribute("data-line"));
    if (candidate <= line && candidate >= bestLine) {
      best = element;
      bestLine = candidate;
    }
  }
  return best;
}

const renderer = unified()
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(() => (tree: unknown) => {
    enableTaskInputs(tree, false);
    stampSourceLines(tree);
    stampFocusUnits(tree);
  })
  .use(rehypeStringify, { allowDangerousHtml: true });

interface FocusUnit {
  readonly element: HTMLElement;
  readonly top: number;
  readonly bottom: number;
  readonly isHeading: boolean;
}

/** Accumulates offsetTop to the scroll parent so geometry is cached in container coordinates (design D6). */
function getUnitTop(element: HTMLElement, scrollParent: HTMLElement): number {
  let top = 0;
  let curr: HTMLElement | null = element;
  while (curr !== null && curr !== scrollParent) {
    top += curr.offsetTop;
    const parent: Element | null = curr.offsetParent;
    curr = parent instanceof HTMLElement ? parent : null;
  }
  if (curr !== scrollParent) {
    let parentTop = 0;
    let pCurr: HTMLElement | null = scrollParent;
    while (pCurr !== null) {
      parentTop += pCurr.offsetTop;
      const parent: Element | null = pCurr.offsetParent;
      pCurr = parent instanceof HTMLElement ? parent : null;
    }
    top -= parentTop;
  }
  return top;
}

/** Resolves the pixel offset of the focal band within the reading pane (design D1). */
function getFocusBand(container: HTMLElement, pane: HTMLElement): number {
  const raw = getComputedStyle(container).getPropertyValue("--mdr-focus-band").trim();
  const val = parseFloat(raw);
  if (!Number.isFinite(val)) return pane.clientHeight * 0.42;
  if (raw.endsWith("cqh") || raw.endsWith("%")) return (val / 100) * pane.clientHeight;
  if (raw.endsWith("vh")) return (val / 100) * window.innerHeight;
  if (raw.endsWith("px")) return val;
  return val < 1 ? val * pane.clientHeight : val;
}

/** Binary search for the unit whose [top, bottom) span contains the focal band (design D2). */
function findContainingUnit(units: readonly FocusUnit[], focalY: number): number {
  let low = 0;
  let high = units.length - 1;
  // 1px tolerance absorbs subpixel layout rounding between getUnitTop (integer offsetTop)
  // and scrollIntoView (floating-point subpixel position).
  const EPSILON = 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const unit = units[mid];
    if (unit === undefined) {
      break;
    }
    if (focalY < unit.top - EPSILON) {
      high = mid - 1;
    } else if (focalY >= unit.bottom) {
      low = mid + 1;
    } else {
      return mid;
    }
  }
  return -1;
}

/** Resolves focused unit index: containment with keep-previous in gaps, fallback to first/last (design D2). */
function resolveFocusIndex(
  units: readonly FocusUnit[],
  focalY: number,
  prevIndex: number,
): number {
  if (units.length === 0) return -1;
  const first = units[0];
  if (first !== undefined && focalY <= first.top) {
    return 0;
  }
  const last = units[units.length - 1];
  if (last !== undefined && focalY >= last.bottom) {
    return units.length - 1;
  }
  const hit = findContainingUnit(units, focalY);
  if (hit !== -1) return hit;

  // Band sits in a margin gap between unit i and unit i + 1.
  let nextIndex = units.length - 1;
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    if (unit !== undefined && unit.top >= focalY) {
      nextIndex = i;
      break;
    }
  }
  // Hold previous focus when it was one of the two bordering units (hysteresis).
  if (prevIndex === nextIndex || prevIndex === nextIndex - 1) {
    return prevIndex;
  }
  return nextIndex;
}

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

/**
 * Reactive boolean from a contributed setting namespace/key. Defaults to
 * `fallback` until the setting resolves; re-renders on store changes.
 */
function useSettingBoolean(api: ExtensionApi, key: string, fallback: boolean): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      api.settingsValues.subscribe("reading", key, () => onStoreChange()),
    [api, key],
  );
  const getSnapshot = useCallback(
    () => api.settingsValues.getBoolean("reading", key, fallback),
    [api, key, fallback],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}

// ---- find (design D2): matches are painted with the CSS Custom Highlight
// API, so the memoized reader HTML never mutates. Re-renders re-apply the
// standing query via a MutationObserver.

// Safari/WebKit — the Tauri webview on macOS — ships no requestIdleCallback,
// so calling it throws a ReferenceError and unmounts the reader. A timeout
// slice with a synthetic deadline keeps the same "yield between blocks"
// behavior; it just cannot see real idle time.
// ponytail: fixed 8ms budget rather than a scheduler. Upgrade to
// scheduler.postTask (WebKit 26.4+) once the minimum webview allows it.
const idleStart: (step: (deadline: IdleDeadline) => void) => number =
  typeof requestIdleCallback === "function"
    ? (step) => requestIdleCallback(step, { timeout: 500 })
    : (step) =>
        window.setTimeout(() => {
          const began = performance.now();
          step({
            didTimeout: false,
            timeRemaining: () => Math.max(0, 8 - (performance.now() - began)),
          });
        }, 1);

const idleCancel: (handle: number) => void =
  typeof cancelIdleCallback === "function" ? cancelIdleCallback : clearTimeout;

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
  // When focus mode is active, scrolling the containing focus unit parks it at
  // the focal band via scroll-margin-block-start, keeping the match on a full-opacity unit.
  const reader = node?.closest<HTMLElement>(".mdr-reader");
  if (reader?.getAttribute("data-focus-mode") === "true") {
    const unit = node?.closest<HTMLElement>("[data-focus-unit]");
    if (unit !== null && unit !== undefined) {
      unit.scrollIntoView({ block: "start" });
      return;
    }
  }
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
    const { document, setKeyHandler } = usePaneHost();
    const astCache = useService(api.services, mdAstCacheKey);
    const text = useDocumentText(document);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const targetRef = useRef<ReaderSearchTarget | null>(null);
    const registry = useService(api.services, searchTargetRegistryKey);
    const outlineNav = useService(api.services, outlineNavigationKey);
    const linkIndex = useService(api.services, linkIndexKey);
    const outlineCache = useService(api.services, mdOutlineCacheKey);
    const highlightCode = useService(api.services, highlightCodeKey);
    const bionicReading = useSettingBoolean(api, "bionicReading", false);
    const focusMode = useSettingBoolean(api, "focusMode", false);
    const prevFocusModeRef = useRef(focusMode);

    const html = useMemo<string | null>(() => {
      if (document === null || astCache === null || text === null) {
        return null;
      }
      const hast = renderer.runSync(astCache.get(document));
      if (bionicReading) {
        applyBionicReading(hast, false);
      }
      return renderer.stringify(hast);
    }, [document, astCache, text, bionicReading]);

    // Highlighting runs after the plain markup has painted: it costs ~8.5ms
    // per KB of code, which on a code-heavy document is seconds of blocked
    // main thread if done inside the render above. Blocks are highlighted one
    // idle slice at a time so scrolling and typing stay responsive, and the
    // pass abandons itself if the document changes mid-flight.
    useEffect(() => {
      const container = containerRef.current;
      if (container === null || html === null || highlightCode === null) {
        return;
      }
      const pending = Array.from(
        container.querySelectorAll<HTMLElement>("pre > code[class*='language-']"),
      ).filter((code) => code.closest("pre")?.classList.contains("shiki") !== true);
      if (pending.length === 0) {
        return;
      }

      let cancelled = false;
      const template = window.document.createElement("template");

      const step = (deadline: IdleDeadline): void => {
        while (pending.length > 0 && (deadline.timeRemaining() > 4 || deadline.didTimeout)) {
          const code = pending.shift();
          const pre = code?.closest("pre");
          if (code === undefined || !pre) {
            continue;
          }
          const lang = /language-(\S+)/.exec(code.className)?.[1] ?? "";
          const markup = highlightCode(code.textContent ?? "", lang);
          if (markup === null) {
            continue;
          }
          template.innerHTML = markup;
          const replacement = template.content.firstElementChild;
          if (replacement !== null) {
            if (pre.hasAttribute("data-focus-unit")) {
              replacement.setAttribute("data-focus-unit", "");
            }
            if (pre.hasAttribute("data-line")) {
              replacement.setAttribute("data-line", pre.getAttribute("data-line") ?? "");
            }
            if (pre.classList.contains("is-focused")) {
              replacement.classList.add("is-focused");
            }
            pre.replaceWith(replacement);
          }
        }
        if (pending.length > 0 && !cancelled) {
          handle = idleStart(step);
        }
      };

      let handle = idleStart(step);
      return () => {
        cancelled = true;
        idleCancel(handle);
      };
    }, [html, highlightCode]);

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

    // Outline jump target registration
    useEffect(() => {
      if (outlineNav === null) {
        return;
      }
      const jumpTarget: OutlineJumpTarget = {
        scrollToHeading(id: string, line: number): boolean {
          const container = containerRef.current;
          if (container === null) {
            return false;
          }
          const escaped = id.replace(/["\\]/g, "\\$&");
          const target =
            container.querySelector(`[id="${escaped}"]`) ?? nearestBlockAtLine(container, line);
          if (target === null) {
            return false;
          }
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          return true;
        },
      };
      return outlineNav.registerJumpTarget(jumpTarget);
    }, [outlineNav]);

    usePendingJump(outlineNav, document, html);

    // Outline scroll tracking
    useEffect(() => {
      const container = containerRef.current;
      if (container === null || outlineNav === null) {
        return;
      }
      const scrollParent = container.closest(".mdr-pane") ?? container;

      const handleScroll = (): void => {
        const headings = Array.from(
          container.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"),
        );
        if (headings.length === 0) {
          return;
        }
        const parentRect = scrollParent.getBoundingClientRect();
        let currentHeading: HTMLElement | null = null;
        for (const heading of headings) {
          const rect = heading.getBoundingClientRect();
          if (rect.top - parentRect.top <= 100) {
            currentHeading = heading;
          } else {
            break;
          }
        }
        if (currentHeading === null && headings[0] !== undefined) {
          currentHeading = headings[0];
        }
        if (currentHeading !== null && currentHeading.id) {
          outlineNav.setActiveHeading(currentHeading.id);
        }
      };

      scrollParent.addEventListener("scroll", handleScroll, { passive: true });
      handleScroll();
      return () => {
        scrollParent.removeEventListener("scroll", handleScroll);
      };
    }, [outlineNav, html]);

    // Focus mode (designs D1–D7): a fixed focal band selects the unit whose
    // span contains it. Geometry is cached per content change and invalidated
    // by one ResizeObserver; the scroll path is a binary search over cached
    // numbers with no DOM queries or forced layout.
    useEffect(() => {
      const container = containerRef.current;
      if (container === null) {
        return;
      }
      if (!focusMode) {
        if (container.getAttribute("data-focus-mode") === "true") {
          const anchor = container.querySelector<HTMLElement>(".is-focused");
          container.removeAttribute("data-focus-mode");
          container
            .querySelectorAll(".is-focused, .is-ancestor")
            .forEach((el) => el.classList.remove("is-focused", "is-ancestor"));
          if (anchor !== null) {
            anchor.scrollIntoView({ block: "start" });
          }
        }
        prevFocusModeRef.current = false;
        setKeyHandler(null);
        return;
      }

      const scrollParent = container.closest<HTMLElement>(".mdr-pane") ?? container;
      const pane = scrollParent instanceof HTMLElement ? scrollParent : container;

      if (!prevFocusModeRef.current) {
        prevFocusModeRef.current = true;
        // Anchor on toggle: capture unit at focal band before padding alters layout (design Risks / task 3.7).
        const paneRect = pane.getBoundingClientRect();
        const band = getFocusBand(container, pane);
        const bandY = paneRect.top + band;
        let anchor: HTMLElement | null = null;
        for (const el of container.querySelectorAll<HTMLElement>("[data-focus-unit]")) {
          const r = el.getBoundingClientRect();
          if (r.top <= bandY && bandY < r.bottom) {
            anchor = el;
            break;
          }
          if (r.top >= bandY) {
            anchor = el;
            break;
          }
        }
        container.setAttribute("data-focus-mode", "true");
        if (anchor !== null) {
          anchor.scrollIntoView({ block: "start" });
        }
      } else {
        container.setAttribute("data-focus-mode", "true");
      }

      let units: FocusUnit[] = [];
      let focusedIndex = -1;
      let ancestorIndex = -1;

      const buildCache = (): void => {
        const elements = Array.from(
          container.querySelectorAll<HTMLElement>("[data-focus-unit]"),
        );
        units = elements.map((element) => {
          const top = getUnitTop(element, pane);
          return {
            element,
            top,
            bottom: top + element.offsetHeight,
            isHeading: /^H[1-6]$/.test(element.tagName),
          };
        });
      };

      const setFocusClasses = (index: number): void => {
        if (index === focusedIndex) {
          return;
        }
        const previous = units[focusedIndex];
        if (previous !== undefined) {
          previous.element.classList.remove("is-focused");
        }
        const current = units[index];
        if (current !== undefined) {
          current.element.classList.add("is-focused");
        }
        focusedIndex = index;

        // The nearest preceding heading unit stays legible (design D4).
        let nextAncestor = -1;
        for (let i = index - 1; i >= 0; i--) {
          if (units[i]?.isHeading) {
            nextAncestor = i;
            break;
          }
        }
        if (nextAncestor !== ancestorIndex) {
          const prevAncestor = units[ancestorIndex];
          if (prevAncestor !== undefined) {
            prevAncestor.element.classList.remove("is-ancestor");
          }
          const next = units[nextAncestor];
          if (next !== undefined) {
            next.element.classList.add("is-ancestor");
          }
          ancestorIndex = nextAncestor;
        }
      };

      const updateFocus = (): void => {
        if (units.length === 0) {
          return;
        }
        const band = getFocusBand(container, pane);
        const focalY = pane.scrollTop + band;
        setFocusClasses(resolveFocusIndex(units, focalY, focusedIndex));
      };

      const scrollToUnit = (index: number): void => {
        const unit = units[index];
        if (unit === undefined) {
          return;
        }
        unit.element.scrollIntoView({ block: "start" });
        setFocusClasses(index);
      };

      const handleKey = (event: KeyboardEvent): void => {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
          return;
        }
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }
        if (event.key === "Escape") {
          api.settingsValues.set("reading", "focusMode", false);
          event.preventDefault();
          return;
        }
        const step =
          event.key === "ArrowDown" || event.key === "j"
            ? 1
            : event.key === "ArrowUp" || event.key === "k"
              ? -1
              : 0;
        if (step === 0 || units.length === 0) {
          return;
        }
        event.preventDefault();
        const next = Math.max(0, Math.min(focusedIndex + step, units.length - 1));
        if (next !== focusedIndex) {
          scrollToUnit(next);
        }
      };
      setKeyHandler(handleKey);

      const handleClick = (event: MouseEvent): void => {
        if (!(event.target instanceof Element)) {
          return;
        }
        const unit = event.target.closest<HTMLElement>("[data-focus-unit]");
        if (unit === null || !container.contains(unit)) {
          return;
        }
        const index = units.findIndex((u) => u.element === unit);
        if (index !== -1) {
          scrollToUnit(index);
        }
      };

      buildCache();
      updateFocus();

      const observer = new ResizeObserver(() => {
        const savedIndex = focusedIndex;
        buildCache();
        if (savedIndex >= 0 && savedIndex < units.length) {
          setFocusClasses(savedIndex);
        } else {
          focusedIndex = -1;
          updateFocus();
        }
      });
      observer.observe(container);

      scrollParent.addEventListener("scroll", updateFocus, { passive: true });
      container.addEventListener("click", handleClick);

      return () => {
        observer.disconnect();
        scrollParent.removeEventListener("scroll", updateFocus);
        container.removeEventListener("click", handleClick);
        setKeyHandler(null);
        container.removeAttribute("data-focus-mode");
        container
          .querySelectorAll(".is-focused, .is-ancestor")
          .forEach((el) => el.classList.remove("is-focused", "is-ancestor"));
      };
    }, [focusMode, html, setKeyHandler]);

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
    // attribute — a malformed href is ignored, not thrown on. Wikilinks
    // (task 2.4) resolve through the link index and open in document tabs.
    // Same keying as the task-tick listener: attach once per
    // document/content swap.
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
        if (href.startsWith("#wikilink:")) {
          const target = decodeURIComponent(href.slice("#wikilink:".length));
          const resolved = linkIndex?.resolveTarget(target, document?.path);
          if (resolved !== null && resolved !== undefined) {
            openAtFragment(resolved, splitTarget(target).fragment, outlineCache, outlineNav).catch(
              (error: unknown) => {
                console.error("Failed to open wikilink target", target, error);
              },
            );
          }
          return;
        }
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
    }, [html, linkIndex, document, outlineCache, outlineNav]);

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

function FocusModeToggle(api: ExtensionApi) {
  return function FocusModeToggle(): JSX.Element | null {
    const focusMode = useSettingBoolean(api, "focusMode", false);
    const activeDoc = useStoreValue(api.router.activeSource);

    const handleToggle = useCallback(() => {
      api.settingsValues.set("reading", "focusMode", !focusMode);
    }, [focusMode]);

    if (activeDoc === null) {
      return null;
    }

    return (
      <QuietButton
        onClick={handleToggle}
        title={focusMode ? "Disable Focus Mode" : "Enable Focus Mode"}
      >
        <span data-focus-active={focusMode} style={{ display: "inline-flex" }}>
          <FocusIcon />
        </span>
      </QuietButton>
    );
  };
}

function activate(api: ExtensionApi): void {
  api.panes.register({
    id: "reader",
    documentTypes: ["markdown"],
    component: ReaderPane(api),
  });
  api.ui.register({
    id: "focus-mode-toggle",
    slot: "toolbar",
    component: FocusModeToggle(api),
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
