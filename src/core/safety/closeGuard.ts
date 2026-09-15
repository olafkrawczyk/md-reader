import type { Document } from "../workspace/document";
import { storeSource } from "../state/store";
import type { StoreSource } from "../state/store";

/** What the user chose to do with unsaved changes. */
export type CloseDecision = "save" | "discard" | "cancel";

/**
 * Asks the user what to do with the given dirty documents (one for a tab
 * close, all of them for a window close). Resolves with the decision;
 * must never reject.
 */
export type CloseGuardHandler = (
  documents: readonly Document[],
) => Promise<CloseDecision>;

type PromptListener = () => void;

export interface ClosePrompt {
  readonly documents: readonly Document[];
  readonly resolve: (decision: CloseDecision) => void;
}

/**
 * Queue of unresolved prompts; the modal renders the first. Tab and
 * window closes can overlap, so requests queue instead of replacing.
 */
class ClosePromptQueue {
  readonly #queue: ClosePrompt[] = [];
  readonly #listeners = new Set<PromptListener>();
  #snapshot: readonly ClosePrompt[] | null = null;

  readonly source: StoreSource<readonly ClosePrompt[]> = storeSource(
    () => this.pending,
    (listener) =>
      this.subscribe(() => {
        listener(this.pending);
      }),
  );

  get pending(): readonly ClosePrompt[] {
    if (this.#snapshot === null) {
      this.#snapshot = [...this.#queue];
    }
    return this.#snapshot;
  }

  request(documents: readonly Document[]): Promise<CloseDecision> {
    return new Promise((resolve) => {
      this.#queue.push({ documents, resolve });
      this.#notify();
    });
  }

  decide(decision: CloseDecision): void {
    const prompt = this.#queue.shift();
    if (prompt !== undefined) {
      this.#snapshot = null;
      this.#notify();
      prompt.resolve(decision);
    }
  }

  subscribe(listener: PromptListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #notify(): void {
    this.#snapshot = null;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

/** The dialog renders this queue; closes await its decisions. */
export const closePromptQueue = new ClosePromptQueue();

let handler: CloseGuardHandler | null = null;
let errorReporter: ((err: unknown) => void) | null = null;

/** Binds the decision UI; the shell does this once per session. */
export function setCloseGuardHandler(next: CloseGuardHandler | null): void {
  handler = next;
}

/**
 * Report a failed save or autosave. The shell binds this to the status
 * surface; without a binding it falls back to the console.
 */
export function setSafetyErrorReporter(
  next: ((err: unknown) => void) | null,
): void {
  errorReporter = next;
}

export function reportSafetyError(err: unknown): void {
  if (errorReporter === null) {
    console.error(err);
    return;
  }
  errorReporter(err);
}

/**
 * One guarded entry point for every close path. Without a bound handler
 * the decision is "cancel" — the document is kept, never silently lost.
 */
export function requestCloseDecision(
  documents: readonly Document[],
): Promise<CloseDecision> {
  if (handler === null) {
    return Promise.resolve("cancel");
  }
  return handler(documents);
}
