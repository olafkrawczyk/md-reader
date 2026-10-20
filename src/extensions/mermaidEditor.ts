// Editor side of mermaid support: syntax highlighting inside ```mermaid
// fences and starter-template completion on a fence opener. The tokenizer and
// templates live in mermaidSyntax.ts; this file only binds them to CodeMirror.
// Lint markers and the edit-triggered library load live here too (design D5).
import { StreamLanguage, syntaxTree } from "@codemirror/language";
import type { Language } from "@codemirror/language";
import { snippet } from "@codemirror/autocomplete";
import type { CompletionContext, CompletionResult, CompletionSource } from "@codemirror/autocomplete";
import { forceLinting, linter } from "@codemirror/lint";
import type { Diagnostic } from "@codemirror/lint";
import type { EditorState, Extension } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { RenderMermaid } from "./markdownContract";
import { fenceOpenerPrefix, isMermaidInfo, MERMAID_TEMPLATES, mermaidStreamParser } from "./mermaidSyntax";

export const mermaidLanguage = StreamLanguage.define(mermaidStreamParser);

/** `codeLanguages` for markdown(): mermaid fences get the stream language. */
export function mermaidCodeLanguages(info: string): Language | null {
  return isMermaidInfo(info) ? mermaidLanguage : null;
}

const FENCE_LINE = /^\s*(```|~~~)/;

// Number of fence lines strictly before `lineNumber`; odd means that line
// would close a block rather than open one.
function fencesBefore(context: CompletionContext, lineNumber: number): number {
  let count = 0;
  for (let n = 1; n < lineNumber; n++) {
    if (FENCE_LINE.test(context.state.doc.line(n).text)) count++;
  }
  return count;
}

export const mermaidTemplateCompletion: CompletionSource = (
  context: CompletionContext,
): CompletionResult | null => {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  // Cheap line-prefix check first: the whole-document fence scan only runs
  // when the line could be a fence opener (this source runs on every query).
  if (!fenceOpenerPrefix(before, 0) || fencesBefore(context, line.number) % 2 !== 0) {
    return null;
  }
  return {
    from: line.from + before.indexOf("```"),
    // The typed text ("```mer") never matches the labels, so skip CodeMirror's filter.
    filter: false,
    options: MERMAID_TEMPLATES.map((t) => ({
      label: t.label,
      type: "text",
      apply: snippet("```mermaid\n" + t.body + "\n```"),
    })),
  };
};

interface MermaidFence {
  /** Doc offset where the diagram body starts (first body line). */
  readonly bodyFrom: number;
  readonly bodyTo: number;
}

// Mermaid fences in the document; empty fences are skipped.
function mermaidFences(state: EditorState): MermaidFence[] {
  const fences: MermaidFence[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "FencedCode") return;
      const info = node.node.getChild("CodeInfo");
      const text = node.node.getChild("CodeText");
      if (info && text && isMermaidInfo(state.sliceDoc(info.from, info.to))) {
        fences.push({ bodyFrom: text.from, bodyTo: text.to });
      }
      return false;
    },
  });
  return fences;
}

// True when [from, to] touches the body of a mermaid fence. Touching its edges
// counts: typing at either end is an edit of it.
function touchesMermaidFence(state: EditorState, from: number, to: number): boolean {
  let hit = false;
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (hit) return false;
      if (node.name !== "FencedCode") return;
      const info = node.node.getChild("CodeInfo");
      const text = node.node.getChild("CodeText");
      if (info && text && isMermaidInfo(state.sliceDoc(info.from, info.to)) && from <= text.to && to >= text.from) {
        hit = true;
      }
      return false;
    },
  });
  return hit;
}

/**
 * Marks mermaid syntax errors on the offending line (the first body line when
 * mermaid reports none). Linting never loads the library: until it is loaded
 * `parse` yields nothing, and a load completing re-lints the open view.
 */
export function mermaidLinter(getService: () => RenderMermaid | null): Extension {
  const source = async (view: EditorView): Promise<Diagnostic[]> => {
    const service = getService();
    if (service === null || !service.isLoaded()) return [];
    const { state } = view;
    const diagnostics: Diagnostic[] = [];
    for (const fence of mermaidFences(state)) {
      const error = await service.parse(state.sliceDoc(fence.bodyFrom, fence.bodyTo));
      if (error === null) continue;
      const first = state.doc.lineAt(fence.bodyFrom);
      const last = state.doc.lineAt(fence.bodyTo);
      const number = Math.min(first.number + Math.max((error.line ?? 1) - 1, 0), last.number);
      const line = state.doc.line(number);
      diagnostics.push({ from: line.from, to: line.to, severity: "error", message: error.message });
    }
    return diagnostics;
  };
  const relintOnLoad = ViewPlugin.define((view) => {
    const service = getService();
    const unsubscribe = service?.onLoaded(() => forceLinting(view));
    return { destroy: () => unsubscribe?.() };
  });
  return [linter(source, { delay: 500 }), relintOnLoad];
}

/**
 * Loads the mermaid library the first time an edit lands inside a mermaid
 * fence, so Writing-only mode gets markers without loading on open.
 */
export function mermaidPreloadOnEdit(getService: () => RenderMermaid | null): Extension {
  return ViewPlugin.define(() => {
    let done = false;
    return {
      update(update) {
        if (done || !update.docChanged) return;
        const service = getService();
        if (service === null) return;
        if (service.isLoaded()) {
          done = true;
          return;
        }
        // Only the changed ranges are examined — O(change), not O(document).
        let inside = false;
        update.changes.iterChangedRanges((_fa, _ta, fromB, toB) => {
          if (!inside && touchesMermaidFence(update.state, fromB, toB)) inside = true;
        });
        if (inside) {
          done = true;
          service.preload();
        }
      },
    };
  });
}
