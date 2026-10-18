// Dependency-free core of the mermaid render service: lazy load, one render
// queue, result cache. The library itself arrives through `load`, so this
// module runs under plain node for tests/mermaid-service.mjs. Relative
// imports carry .ts extensions for the same reason.
import { budgetedLru } from "../core/budgetedMemo.ts";
import { mermaidErrorLine, mermaidErrorMessage } from "./mermaidSyntax.ts";
import type { Appearance, MermaidParseError, MermaidResult, RenderMermaid } from "./markdownContract.ts";

/** The slice of the mermaid API this service uses. */
export interface MermaidLike {
  initialize(config: Record<string, unknown>): void;
  render(id: string, text: string): Promise<{ svg: string }>;
  parse(text: string): Promise<unknown>;
}

const LOAD_FAILED = "Mermaid failed to load";

function configFor(appearance: Appearance): Record<string, unknown> {
  return {
    startOnLoad: false,
    securityLevel: "strict",
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    theme: appearance === "dark" ? "dark" : "default",
  };
}

export function createMermaidService(options: {
  load: () => Promise<MermaidLike>;
  removeTemp?: (id: string) => void;
}): RenderMermaid {
  // Keyed by appearance + source, values tagged "S"+svg / "E"+message so one
  // string-valued LRU holds both outcomes — failures are cached too.
  const cache = budgetedLru(4_000_000);
  const listeners = new Set<() => void>();

  let loading: Promise<MermaidLike | null> | null = null;
  let mermaid: MermaidLike | null = null;
  let configured: Appearance | null = null;
  let nextId = 0;
  // Mermaid renders into shared scratch DOM and holds global state, so
  // concurrent renders corrupt each other: everything runs through one chain.
  let queue: Promise<unknown> = Promise.resolve();

  const key = (source: string, appearance: Appearance) => `${appearance}\0${source}`;
  const decode = (v: string): MermaidResult => (v[0] === "S" ? { svg: v.slice(1) } : { error: v.slice(1) });

  function ensureLoaded(): Promise<MermaidLike | null> {
    loading ??= options.load().then(
      (m) => {
        mermaid = m;
        for (const listener of [...listeners]) listener();
        return m;
      },
      // Terminal: the memoized rejection is never retried.
      () => null,
    );
    return loading;
  }

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  }

  async function renderNow(source: string, appearance: Appearance): Promise<MermaidResult> {
    const cached = cache.get(key(source, appearance));
    if (cached !== undefined) return decode(cached);
    const m = await ensureLoaded();
    if (m === null) return { error: LOAD_FAILED };
    if (configured !== appearance) {
      m.initialize(configFor(appearance));
      configured = appearance;
    }
    const id = `mdr-mermaid-${nextId++}`;
    let encoded: string;
    try {
      encoded = "S" + (await m.render(id, source)).svg;
    } catch (e) {
      encoded = "E" + mermaidErrorMessage(e);
    } finally {
      options.removeTemp?.(id);
    }
    cache.set(key(source, appearance), encoded);
    return decode(encoded);
  }

  return {
    peek(source, appearance) {
      const hit = cache.get(key(source, appearance));
      return hit === undefined ? null : decode(hit);
    },
    render: (source, appearance) => enqueue(() => renderNow(source, appearance)),
    parse(source): Promise<MermaidParseError | null> {
      const m = mermaid;
      if (m === null) return Promise.resolve(null);
      return enqueue(async () => {
        try {
          await m.parse(source);
          return null;
        } catch (e) {
          return { line: mermaidErrorLine(e), message: mermaidErrorMessage(e) };
        }
      });
    },
    preload() {
      void ensureLoaded();
    },
    isLoaded: () => mermaid !== null,
    onLoaded(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
