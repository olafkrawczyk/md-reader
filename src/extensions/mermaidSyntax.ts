// Pure mermaid helpers shared by the editor and the render service: fence
// matching, a line tokenizer for CodeMirror's StreamLanguage, completion
// templates, and error parsing. Only type imports from @codemirror, so the
// module loads under plain node for tests/mermaid-syntax.mjs.
import type { StreamParser, StringStream } from "@codemirror/language";

/** True when a fence info string names mermaid (first word, any case). */
export function isMermaidInfo(info: string): boolean {
  return info.trim().split(/\s+/)[0]?.toLowerCase() === "mermaid";
}

// ---- Tokenizer ----

const KEYWORDS = new Set([
  // diagram headers
  "flowchart", "graph", "sequenceDiagram", "classDiagram", "stateDiagram",
  "erDiagram", "gantt", "pie", "mindmap", "journey", "gitGraph", "timeline",
  // flowchart directions
  "TB", "TD", "BT", "RL", "LR",
  // structure
  "subgraph", "end", "direction", "participant", "actor", "loop", "alt",
  "else", "opt", "par", "and", "rect", "critical", "break", "note", "over",
  "class", "state", "section", "title", "dateFormat", "axisFormat",
  "excludes", "showData", "autonumber", "activate", "deactivate",
  "classDef", "style", "linkStyle", "click", "left", "right", "of",
]);

// Arrow/link shapes, tried in order. Anchored; the first match wins, so
// longer forms must come before the shorter ones they contain.
const ER_END = String.raw`(?:\|\||\|o|o\||\}\||\|\{|\}o|o\{)`;
const ARROWS: RegExp[] = [
  new RegExp(`^${ER_END}(?:--|\\.\\.)${ER_END}`), // ||--o{  }|..|{
  /^(?:<\|--|<\|\.\.|--\|>|\.\.\|>)/, // inheritance / realization
  /^[<ox]?-\.+-[>xo]?(?!\w)/, // dotted flowchart: -.-> -.-
  /^[<ox]?={2,}[>xo]?(?!\w)/, // thick: ==>
  /^--?(?:>>|\)|x(?!\w))/, // sequence: ->> -->> -) -x
  /^[<ox*]?-{1,}[>xo*]?(?!\w)/, // plain links, composition/aggregation: --> --- *-- o-- --o
  /^[<ox]?\.\.[>xo]?(?!\w)/, // dependency: ..>
];

const CLOSERS: Record<string, string> = { "[": "]", "(": ")", "{": "}" };

// End index (exclusive) of the bracket group opening at `from`, honouring
// nesting of the same bracket kind ("((circle))"); -1 when unclosed.
function bracketEnd(text: string, from: number): number {
  const open = text[from]!;
  const close = CLOSERS[open];
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return i + 1;
  }
  return -1;
}

function token(stream: StringStream, state: { line: number }): string | null {
  if (stream.sol()) state.line++;
  if (stream.eatSpace()) return null;

  if (stream.match("%%")) {
    stream.skipToEnd();
    return "comment";
  }

  const ch = stream.peek()!;
  if (ch === '"') {
    stream.next();
    while (!stream.eol()) if (stream.next() === '"') break;
    return "string";
  }

  // Node label after an identifier: A[text] B(text) C{text}. Quoted labels are
  // left to the string rule so the quotes keep their own token.
  if (ch in CLOSERS && stream.pos > 0 && /[\w)\]}]/.test(stream.string[stream.pos - 1]!)) {
    const end = bracketEnd(stream.string, stream.pos);
    if (end !== -1 && stream.string[stream.pos + 1] !== '"') {
      stream.pos = end;
      return "string";
    }
  }

  const rest = stream.string.slice(stream.pos);
  const prevIsWord = stream.pos > 0 && /\w/.test(stream.string[stream.pos - 1]!);
  for (const re of ARROWS) {
    const m = re.exec(rest);
    // Letter-led arrows (o--, x--) must not start mid-word.
    if (m && !(prevIsWord && /^[ox]/.test(m[0]))) {
      stream.pos += m[0].length;
      return "operator";
    }
  }

  if (stream.match(/^\d+(?:\.\d+)?/)) return "number";

  if (stream.match(/^stateDiagram-v2\b/)) return "keyword";
  if (stream.match(/^[A-Za-z_]\w*/)) {
    return KEYWORDS.has(stream.current()) ? "keyword" : null;
  }

  stream.next();
  return null;
}

export const mermaidStreamParser: StreamParser<{ line: number }> = {
  name: "mermaid",
  startState: () => ({ line: 0 }),
  token,
};

// ---- Templates ----

// Bodies use CodeMirror snippet syntax. Every field carries a default so the
// unedited skeleton is itself a valid, renderable diagram.
export const MERMAID_TEMPLATES: readonly { label: string; body: string }[] = [
  {
    label: "mermaid · flowchart",
    body: "flowchart TD\n    A[${1:Start}] --> B{${2:Decision}}\n    B -->|${3:Yes}| C[${4:Done}]\n    B -->|${5:No}| A",
  },
  {
    label: "mermaid · sequence",
    body: "sequenceDiagram\n    participant ${1:Alice}\n    participant ${2:Bob}\n    ${1:Alice}->>${2:Bob}: ${3:Hello}\n    ${2:Bob}-->>${1:Alice}: ${4:Hi back}",
  },
  {
    label: "mermaid · class",
    body: "classDiagram\n    class ${1:Animal} {\n        +String ${2:name}\n        +${3:speak}()\n    }\n    class ${4:Dog}\n    ${1:Animal} <|-- ${4:Dog}",
  },
  {
    label: "mermaid · state",
    body: "stateDiagram-v2\n    [*] --> ${1:Idle}\n    ${1:Idle} --> ${2:Running}: ${3:start}\n    ${2:Running} --> [*]",
  },
  {
    label: "mermaid · ER",
    body: "erDiagram\n    ${1:CUSTOMER} ||--o{ ${2:ORDER} : ${3:places}\n    ${2:ORDER} {\n        int ${4:id}\n    }",
  },
  {
    label: "mermaid · gantt",
    body: "gantt\n    title ${1:Plan}\n    dateFormat YYYY-MM-DD\n    section ${2:Phase}\n    ${3:Task} :a1, 2024-01-01, 7d",
  },
  {
    label: "mermaid · pie",
    body: 'pie title ${1:Pets}\n    "${2:Dogs}" : 386\n    "${3:Cats}" : 85',
  },
  {
    label: "mermaid · mindmap",
    body: "mindmap\n  root((${1:Topic}))\n    ${2:Branch A}\n    ${3:Branch B}",
  },
];

// ---- Fence opener detection ----

/**
 * True when `lineBefore` (line start to cursor) is a fence opener being typed
 * toward "mermaid" — and the fence count above is even, so this backtick run
 * opens a block instead of closing one.
 */
export function fenceOpenerPrefix(lineBefore: string, openFencesBefore: number): boolean {
  const m = /^\s*```([a-z]*)$/i.exec(lineBefore);
  return !!m && "mermaid".startsWith(m[1]!.toLowerCase()) && openFencesBefore % 2 === 0;
}

// ---- Error parsing ----

/** 1-based line within the diagram where mermaid reports a parse error. */
export function mermaidErrorLine(error: unknown): number | null {
  const e: { hash?: { loc?: { first_line?: number }; line?: number }; message?: unknown } | null =
    typeof error === "object" ? error : null;
  const first = e?.hash?.loc?.first_line;
  if (typeof first === "number") return first;
  // hash.line is 0-based.
  if (typeof e?.hash?.line === "number") return e.hash.line + 1;
  const m = /line (\d+)/i.exec(String(e?.message ?? ""));
  return m ? Number(m[1]) : null;
}

/** First non-empty line of mermaid's message, for the one-line caption. */
export function mermaidErrorMessage(error: unknown): string {
  const raw = typeof error === "object" && error !== null && "message" in error ? error.message : undefined;
  const line = String(raw ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  return line ?? "Unknown error";
}
