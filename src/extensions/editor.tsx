import { useCallback, useEffect, useRef } from "react";
import type { JSX, RefObject } from "react";
import { EditorState, RangeSetBuilder, StateEffect, StateField, Transaction } from "@codemirror/state";
import { EditorView, keymap, Decoration, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { SearchQuery } from "@codemirror/search";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { markdown } from "@codemirror/lang-markdown";
import type { ExtensionApi, ExtensionDescriptor } from "../core/extension";
import { usePaneHost } from "../core/extension";
import { useService } from "../core/state/storeHooks";
import { searchTargetRegistryKey } from "../core/search/searchTypes";
import type { SearchTarget } from "../core/search/searchTypes";
import type { Document } from "../core/workspace/document";

// Syntax colors ride --mdr-syntax-* variables, so a dark-appearance switch
// restyles highlighting live without re-creating the editor.
const mdrHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--mdr-syntax-keyword)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--mdr-syntax-string)" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--mdr-syntax-comment)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--mdr-syntax-constant)" },
  { tag: [tags.heading, tags.strong], color: "var(--mdr-color-fg)", fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.link, color: "var(--mdr-color-accent)", textDecoration: "underline" },
  { tag: [tags.meta, tags.processingInstruction], color: "var(--mdr-syntax-entity)" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
]);

// ---- find (design D2): CodeMirror's search panel stays closed; a custom
// highlighter decorates all matches of the find bar's query, and navigation
// moves the selection so CodeMirror's own scroll-into-view machinery applies.

const setFindQuery = StateEffect.define<SearchQuery>();

const findQueryField = StateField.define<SearchQuery | null>({
  create: () => null,
  update: (value, transaction) => {
    for (const effect of transaction.effects) {
      if (effect.is(setFindQuery)) {
        return effect.value;
      }
    }
    return value;
  },
});

const matchMark = Decoration.mark({ class: "cm-searchMatch" });
const currentMark = Decoration.mark({ class: "cm-searchMatch cm-searchMatch-current" });

interface MatchRange {
  readonly from: number;
  readonly to: number;
}

function matchRanges(state: EditorState, query: SearchQuery): readonly MatchRange[] {
  const ranges: MatchRange[] = [];
  const cursor = query.getCursor(state.doc);
  for (let match = cursor.next(); !match.done; match = cursor.next()) {
    ranges.push(match.value);
  }
  return ranges;
}

function currentIndexOf(ranges: readonly MatchRange[], head: number): number {
  return ranges.findIndex((range) => range.from <= head && head <= range.to);
}

function buildFindDecorations(view: EditorView): DecorationSet {
  const query = view.state.field(findQueryField);
  if (query === null || !query.valid) {
    return Decoration.none;
  }
  const ranges = matchRanges(view.state, query);
  const head = view.state.selection.main.head;
  const current = currentIndexOf(ranges, head);
  const builder = new RangeSetBuilder<Decoration>();
  for (const [index, range] of ranges.entries()) {
    builder.add(range.from, range.to, index === current ? currentMark : matchMark);
  }
  return builder.finish();
}

const findHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildFindDecorations(view);
    }

    update(update: ViewUpdate): void {
      const queryChanged = update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(setFindQuery)),
      );
      if (queryChanged || update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildFindDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

class EditorSearchTarget implements SearchTarget {
  readonly #listeners = new Set<(state: { count: number; current: number | null }) => void>();
  readonly #view: EditorView;

  constructor(view: EditorView) {
    this.#view = view;
  }

  get view(): EditorView {
    return this.#view;
  }

  find(query: string): void {
    this.#apply(new SearchQuery({ search: query }));
  }

  next(): void {
    this.#move(1);
  }

  prev(): void {
    this.#move(-1);
  }

  refresh(): void {
    this.#emit();
  }

  clear(): void {
    this.#view.dispatch({ effects: setFindQuery.of(new SearchQuery({ search: "" })) });
    this.#emit();
  }

  onState(handler: (state: { count: number; current: number | null }) => void): () => void {
    this.#listeners.add(handler);
    return () => {
      this.#listeners.delete(handler);
    };
  }

  #apply(query: SearchQuery): void {
    this.#view.dispatch({ effects: setFindQuery.of(query) });
    this.#selectNeighbor(query, 1);
    this.#emit();
  }

  /**
   * Selects the first match strictly after (direction 1) or before
   * (direction -1) the cursor, wrapping at the document ends.
   */
  #selectNeighbor(query: SearchQuery, direction: 1 | -1): void {
    const ranges = matchRanges(this.#view.state, query);
    if (ranges.length === 0) {
      return;
    }
    const head = this.#view.state.selection.main.head;
    let neighbor: MatchRange | undefined;
    if (direction === 1) {
      neighbor = ranges.find((range) => range.from > head);
      if (neighbor === undefined) {
        neighbor = ranges[0];
      }
    } else {
      for (const range of ranges) {
        if (range.to < head) {
          neighbor = range;
        }
      }
      if (neighbor === undefined) {
        neighbor = ranges[ranges.length - 1];
      }
    }
    if (neighbor === undefined) {
      return;
    }
    this.#view.dispatch({
      selection: { anchor: neighbor.from, head: neighbor.to },
      scrollIntoView: true,
    });
  }

  #move(direction: 1 | -1): void {
    const query = this.#view.state.field(findQueryField);
    if (query === null || !query.valid) {
      return;
    }
    this.#selectNeighbor(query, direction);
    this.#emit();
  }

  #emit(): void {
    const query = this.#view.state.field(findQueryField);
    let state = { count: 0, current: null as number | null };
    if (query !== null && query.valid) {
      const ranges = matchRanges(this.#view.state, query);
      const current = currentIndexOf(ranges, this.#view.state.selection.main.head);
      state = {
        count: ranges.length,
        current: current === -1 ? null : current + 1,
      };
    }
    for (const listener of this.#listeners) {
      listener(state);
    }
  }
}

/**
 * Owns the imperative CodeMirror lifecycle for one routed document:
 * creates the view when a document appears, destroys it on change or
 * unmount, and forwards content edits to the document. The editor view is
 * an external system outside React, so this is the one legitimate
 * synchronization effect in the pane; the content-changed callback rides a
 * ref so the view is not rebuilt when callers re-render.
 */
function useCodeMirror(
  document: Document | null,
  onContentChanged: () => void,
): {
  readonly hostRef: RefObject<HTMLDivElement | null>;
  readonly getView: () => EditorView | null;
} {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const changedHandlerRef = useRef(onContentChanged);
  // Last text this view accounted for: its own edits and applied external
  // changes update it before the document notifies, so a mismatch in the
  // subscription unambiguously means "changed elsewhere".
  const syncedTextRef = useRef<string>("");

  useEffect(() => {
    changedHandlerRef.current = onContentChanged;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (document === null || host === null) {
      viewRef.current?.destroy();
      viewRef.current = null;
      return;
    }
    viewRef.current?.destroy();
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: document.text,
        extensions: [
          markdown(),
          history(),
          EditorView.lineWrapping,
          syntaxHighlighting(mdrHighlightStyle),
          findQueryField,
          findHighlighter,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const next = update.state.doc.toString();
              syncedTextRef.current = next;
              document.setText(next);
              changedHandlerRef.current();
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    view.focus();
    syncedTextRef.current = document.text;
    // External changes (design D4): a reader tick writes through the
    // document, not this view. The editor's own edits mark themselves
    // synced before notifying, so a subscription mismatch means the change
    // came from elsewhere — and it never fires mid-update. The remote
    // annotation keeps applied changes out of undo history.
    const unsubscribe = document.subscribe(() => {
      if (document.text === syncedTextRef.current) {
        return;
      }
      syncedTextRef.current = document.text;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: document.text },
        annotations: Transaction.remote.of(true),
      });
    });
    return () => {
      unsubscribe();
      view.destroy();
      viewRef.current = null;
    };
  }, [document]);

  const getView = useCallback(() => viewRef.current, []);
  return { hostRef, getView };
}

function EditorPane(api: ExtensionApi) {
  return function EditorPane(): JSX.Element {
    const { document } = usePaneHost();
    const targetRef = useRef<EditorSearchTarget | null>(null);
    const { hostRef, getView } = useCodeMirror(document, () => {
      targetRef.current?.refresh();
    });
    const registry = useService(api.services, searchTargetRegistryKey);

    // One search target per editor view, created lazily when the find bar
    // resolves against this pane.
    const getTarget = useCallback((): EditorSearchTarget | null => {
      const view = getView();
      if (view === null) {
        return null;
      }
      const existing = targetRef.current;
      if (existing === null || existing.view !== view) {
        targetRef.current = new EditorSearchTarget(view);
      }
      return targetRef.current;
    }, [getView]);

    useEffect(() => {
      if (registry === null) {
        return;
      }
      registry.register("editor", getTarget);
      return () => registry.unregister("editor");
    }, [registry, getTarget]);

    if (document === null) {
      return <div className="mdr-empty">No document open.</div>;
    }
    return <div className="mdr-editor" ref={hostRef} />;
  };
}

function activate(api: ExtensionApi): void {
  api.panes.register({
    id: "editor",
    documentTypes: ["markdown"],
    component: EditorPane(api),
  });
}

export const editorExtension: ExtensionDescriptor = {
  manifest: {
    id: "@mdr/editor",
    displayName: "Editor",
    version: "0.1.0",
  },
  load: () => Promise.resolve({ activate }),
};
