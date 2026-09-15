/**
 * Transformers mutate the pipeline payload (the intermediate representation)
 * in place — the unified/remark trees the built-ins pass through are mutable.
 *
 * Ordering semantics: lower `priority` runs first; ties break by attachment
 * order (recorded in design.md, open question 3).
 */
export interface DocTransformer<P> {
  readonly id: string;
  readonly priority?: number;
  transform(value: P): void;
}

export interface TransformerPipeline<P> {
  readonly documentType: string;
  /** Attaches a transformer; returns a detach function. */
  attach(transformer: DocTransformer<P>): () => void;
  /** Runs attached transformers in deterministic order over `input`. */
  run(input: P): P;
}

interface Entry<P> {
  readonly transformer: DocTransformer<P>;
  readonly order: number;
}

function byRunOrder<P>(a: Entry<P>, b: Entry<P>): number {
  const pa = a.transformer.priority ?? Number.POSITIVE_INFINITY;
  const pb = b.transformer.priority ?? Number.POSITIVE_INFINITY;
  if (pa !== pb) {
    return pa - pb;
  }
  return a.order - b.order;
}

export function createTransformerPipeline<P>(
  documentType: string,
): TransformerPipeline<P> {
  const entries: Array<Entry<P>> = [];
  let nextOrder = 0;

  return {
    documentType,
    attach(transformer: DocTransformer<P>): () => void {
      const entry: Entry<P> = { transformer, order: nextOrder };
      nextOrder += 1;
      entries.push(entry);
      return () => {
        const index = entries.indexOf(entry);
        if (index >= 0) {
          entries.splice(index, 1);
        }
      };
    },
    run(input: P): P {
      const ordered = [...entries].sort(byRunOrder);
      for (const entry of ordered) {
        entry.transformer.transform(input);
      }
      return input;
    },
  };
}

interface RegisteredPipeline {
  readonly documentType: string;
  attach(transformer: DocTransformer<unknown>): () => void;
}

/**
 * Owns one pipeline per document type. Extensions that do not own the
 * document type attach through `attach`; attachments made before the owner
 * claims the pipeline are buffered and flushed on claim, so activation order
 * does not matter.
 */
export class TransformerRegistry {
  readonly #pipelines = new Map<string, RegisteredPipeline>();
  readonly #pending = new Map<string, Array<DocTransformer<unknown>>>();

  /**
   * Claims the pipeline for a document type. The claimer keeps the returned
   * typed pipeline and runs it; typically it is also published as a service
   * so other extensions can run it without core involvement.
   */
  pipeline<P>(documentType: string): TransformerPipeline<P> {
    if (this.#pipelines.has(documentType)) {
      throw new Error(`pipeline already claimed for ${documentType}`);
    }
    const typedPipeline = createTransformerPipeline<P>(documentType);
    const registered: RegisteredPipeline = {
      documentType,
      attach: (transformer) => typedPipeline.attach(transformer),
    };
    this.#pipelines.set(documentType, registered);

    const queued = this.#pending.get(documentType);
    if (queued) {
      this.#pending.delete(documentType);
      for (const transformer of queued) {
        registered.attach(transformer);
      }
    }
    return typedPipeline;
  }

  attach<P>(
    documentType: string,
    transformer: DocTransformer<P>,
  ): () => void {
    const registered = this.#pipelines.get(documentType);
    if (registered) {
      return registered.attach(transformer);
    }
    const queued = this.#pending.get(documentType) ?? [];
    queued.push(transformer);
    this.#pending.set(documentType, queued);
    return () => {
      const index = queued.indexOf(transformer);
      if (index >= 0) {
        queued.splice(index, 1);
      }
    };
  }
}
