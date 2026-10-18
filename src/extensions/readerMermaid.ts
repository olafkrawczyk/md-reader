// Reader post-paint mermaid pass (design D2). The reader's html is rewritten
// wholesale on every document change, wiping earlier swaps, so the pass has
// two halves: a layout-effect half that re-applies everything the render
// cache already knows before the browser paints (no flicker while typing in
// Split View), and an effect half that renders the rest lazily — near the
// viewport, one diagram at a time, debounced while editing.
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import { effectiveAppearance, subscribeAppearance } from "../core/theme/appearance";
import type { Appearance, MermaidResult, RenderMermaid } from "./markdownContract";
import { isMermaidInfo } from "./mermaidSyntax";

const EDIT_DEBOUNCE_MS = 300;
const CAPTION_CLASS = "mdr-mermaid-error";

/** A mermaid block still waiting on its render: the plain `<pre>`, or a figure (stale / other appearance). */
interface Block {
  readonly element: Element;
  readonly source: string;
  readonly index: number;
}

// A swapped-in figure no longer carries its source text; remember it so an
// appearance switch (same html, no fresh <pre>) can re-render in place.
const figureSources = new WeakMap<Element, string>();
let instance = 0;

export function isMermaidCode(code: Element): boolean {
  return isMermaidInfo(/language-(\S+)/.exec(code.className)?.[1] ?? "");
}

function collectBlocks(container: HTMLElement): Block[] {
  const blocks: Block[] = [];
  const candidates = container.querySelectorAll("pre > code[class*='language-'], figure.mdr-mermaid");
  for (const el of candidates) {
    if (el.tagName === "FIGURE") {
      blocks.push({ element: el, source: figureSources.get(el) ?? "", index: blocks.length });
    } else if (isMermaidCode(el) && el.parentElement !== null) {
      blocks.push({ element: el.parentElement, source: el.textContent ?? "", index: blocks.length });
    }
  }
  return blocks;
}

/**
 * The service caches one svg per source, so duplicate diagrams would share
 * element ids (and the svg's id-scoped <style>). Every placed copy gets its
 * own id; all references inside the markup are renamed with it.
 */
function uniqueSvg(svg: string): string {
  const id = /^<svg[^>]*?\sid="([^"]+)"/.exec(svg)?.[1];
  return id === undefined ? svg : svg.split(id).join(`${id}-${instance++}`);
}

function setCaption(host: Element, inside: boolean, message: string): void {
  const caption = window.document.createElement("figcaption");
  caption.className = CAPTION_CLASS;
  caption.textContent = `Mermaid: ${message}`;
  if (inside) {
    host.querySelector(`.${CAPTION_CLASS}`)?.remove();
    host.append(caption);
  } else {
    clearCaption(host);
    host.after(caption);
  }
}

function clearCaption(pre: Element): void {
  if (pre.nextElementSibling?.classList.contains(CAPTION_CLASS) === true) {
    pre.nextElementSibling.remove();
  }
}

/** Replaces `target` with a figure holding `svg`; copies the anchors focus mode and line jumps rely on. */
function placeFigure(target: Element, source: string, svg: string, stale: boolean): Element {
  const template = window.document.createElement("template");
  template.innerHTML = `<figure class="mdr-mermaid">${uniqueSvg(svg)}</figure>`;
  const figure = template.content.firstElementChild;
  if (figure === null) {
    return target;
  }
  for (const name of ["data-line", "data-focus-unit"]) {
    const value = target.getAttribute(name);
    if (value !== null) figure.setAttribute(name, value);
  }
  if (target.classList.contains("is-focused")) figure.classList.add("is-focused");
  if (stale) figure.setAttribute("data-stale", "");
  if (target.tagName === "PRE") clearCaption(target);
  figureSources.set(figure, source);
  target.replaceWith(figure);
  return figure;
}

export function useMermaidDiagrams(
  containerRef: RefObject<HTMLDivElement | null>,
  html: string | null,
  path: string | null,
  renderMermaid: RenderMermaid | null,
): void {
  const appearance = useSyncExternalStore(subscribeAppearance, effectiveAppearance);
  // Last good svg per block index, for the stale render while an edit is broken.
  // ponytail: keyed by position, so inserting a diagram above another can
  // briefly show a neighbour's stale render until the new one lands.
  const lastGood = useRef(new Map<number, string>());
  const previous = useRef<{ html: string | null; path: string | null; appearance: Appearance }>({
    html: null,
    path: null,
    appearance,
  });
  const pending = useRef<{ blocks: Block[]; edit: boolean }>({ blocks: [], edit: false });

  const apply = (block: Block, result: MermaidResult): void => {
    if ("svg" in result) {
      lastGood.current.set(block.index, result.svg);
      placeFigure(block.element, block.source, result.svg, false);
      return;
    }
    const good = lastGood.current.get(block.index);
    if (block.element.tagName === "PRE" && good !== undefined) {
      setCaption(placeFigure(block.element, block.source, good, true), true, result.error);
    } else if (block.element.tagName === "FIGURE") {
      block.element.setAttribute("data-stale", "");
      setCaption(block.element, true, result.error);
    } else {
      setCaption(block.element, false, result.error);
    }
  };

  useLayoutEffect(() => {
    const container = containerRef.current;
    const prev = previous.current;
    const edit = prev.path === path && prev.html !== null && prev.html !== html;
    if (prev.path !== path || prev.appearance !== appearance) {
      lastGood.current.clear();
    }
    previous.current = { html, path, appearance };
    pending.current = { blocks: [], edit };
    if (container === null || html === null || renderMermaid === null) {
      return;
    }
    for (const block of collectBlocks(container)) {
      const hit = renderMermaid.peek(block.source, appearance);
      if (hit !== null) {
        apply(block, hit);
        continue;
      }
      // An edited diagram keeps its previous render, dimmed, until the new one lands.
      const good = lastGood.current.get(block.index);
      const element =
        edit && good !== undefined && block.element.tagName === "PRE"
          ? placeFigure(block.element, block.source, good, true)
          : block.element;
      pending.current.blocks.push({ ...block, element });
    }
    // apply closes over refs only; re-running per html/appearance is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, renderMermaid, appearance]);

  useEffect(() => {
    const container = containerRef.current;
    const { blocks, edit } = pending.current;
    if (container === null || renderMermaid === null || blocks.length === 0) {
      return;
    }
    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    const queue: Block[] = [];
    let draining = false;

    const drain = async (): Promise<void> => {
      if (draining) return;
      draining = true;
      for (let block = queue.shift(); block !== undefined; block = queue.shift()) {
        const result = await renderMermaid.render(block.source, appearance);
        if (cancelled) return;
        if (block.element.isConnected) apply(block, result);
      }
      draining = false;
    };

    const start = (): void => {
      const byElement = new Map(blocks.map((b) => [b.element, b]));
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const block = byElement.get(entry.target);
            if (!entry.isIntersecting || block === undefined) continue;
            observer?.unobserve(entry.target);
            queue.push(block);
          }
          void drain();
        },
        { root: container.closest(".mdr-pane"), rootMargin: "100% 0px" },
      );
      for (const block of blocks) observer.observe(block.element);
    };

    const timer = window.setTimeout(start, edit ? EDIT_DEBOUNCE_MS : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, renderMermaid, appearance]);
}
