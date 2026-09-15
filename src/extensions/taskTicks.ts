import type { Blockquote, ListItem, List, Root } from "mdast";
import type { ExtensionApi, ExtensionDescriptor } from "../core/extension";
import type { MarkdownPayload } from "./markdownContract";

/**
 * Task ticks (design D1/D2): a markdown transformer that annotates GFM
 * task-list items with their exact source spans — remark-rehype copies
 * `data.hProperties` onto the rendered `<li>` as data attributes — plus the
 * pure marker swap the reading pane applies on click. The span scoping keeps
 * the swap exact: bracket patterns in code blocks, inline code, or prose are
 * never touched.
 */

const MARKER_PATTERN = /\[( |x|X)\]/;

type TaskParent = Root | List | Blockquote | ListItem;

/** Lists live at top level and inside blockquotes and list items only. */
function annotateTasks(parent: TaskParent): void {
  for (const child of parent.children) {
    if (child.type === "list") {
      annotateTasks(child);
      continue;
    }
    if (child.type !== "blockquote" && child.type !== "listItem") {
      continue;
    }
    if (child.type === "listItem" && child.checked !== null) {
      const start = child.position?.start.offset;
      const end = child.position?.end.offset;
      if (start !== undefined && end !== undefined) {
        const data = (child.data ??= {});
        data.hProperties = { dataTaskStart: start, dataTaskEnd: end };
      }
    }
    annotateTasks(child);
  }
}

/**
 * Replaces the first task marker inside the `[start, end)` source span with
 * `[x]` (ticked) or `[ ]` (unticked); returns `text` unchanged when the span
 * holds no marker. The marker is always the first bracket pattern in an
 * item's span (it directly follows the bullet), so first-match is exact.
 */
export function swapTaskMarker(
  text: string,
  start: number,
  end: number,
  ticked: boolean,
): string {
  const match = MARKER_PATTERN.exec(text.slice(start, end));
  if (match === null) {
    return text;
  }
  const markerStart = start + match.index;
  const replacement = ticked ? "[x]" : "[ ]";
  return (
    text.slice(0, markerStart) +
    replacement +
    text.slice(markerStart + match[0].length)
  );
}

function activate(api: ExtensionApi): void {
  // Priority 5: after @mdr/gfm (0) parses tasks, before @mdr/shiki (10).
  api.transformers.attach("markdown", {
    id: "@mdr/task-ticks",
    priority: 5,
    transform(payload: MarkdownPayload): void {
      annotateTasks(payload.ast);
    },
  });
}

export const taskTicksExtension: ExtensionDescriptor = {
  manifest: {
    id: "@mdr/task-ticks",
    displayName: "Task Ticks",
    version: "0.1.0",
  },
  load: () => Promise.resolve({ activate }),
};
