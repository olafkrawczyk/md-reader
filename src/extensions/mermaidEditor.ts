// Editor side of mermaid support: syntax highlighting inside ```mermaid
// fences and starter-template completion on a fence opener. The tokenizer and
// templates live in mermaidSyntax.ts; this file only binds them to CodeMirror.
import { StreamLanguage } from "@codemirror/language";
import type { Language } from "@codemirror/language";
import { snippet } from "@codemirror/autocomplete";
import type { CompletionContext, CompletionResult, CompletionSource } from "@codemirror/autocomplete";
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
