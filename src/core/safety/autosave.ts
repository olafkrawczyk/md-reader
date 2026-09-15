import type { Document } from "../workspace/document";
import { reportSafetyError } from "./closeGuard";

export interface AutosaveOptions {
  readonly enabled: boolean;
  readonly delayMs: number;
}

type DocumentOpenedListener = (document: Document) => void;

/**
 * Idle-delay autosave policy: one timer per open document, reset on every
 * edit, cleared when the document becomes clean (explicit save) or is
 * forgotten (tab closed). The policy engine is framework-free; the
 * document-safety extension feeds it the settings values.
 */
class AutosaveController {
  #options: AutosaveOptions = { enabled: true, delayMs: 1000 };
  #watching = false;
  readonly #timers = new Map<Document, number>();
  readonly #unsubscribers = new Map<Document, () => void>();

  /** Applies new settings live; disabling clears pending timers. */
  configure(options: Partial<AutosaveOptions>): void {
    const wasEnabled = this.#options.enabled;
    this.#options = { ...this.#options, ...options };
    if (!this.#options.enabled) {
      this.#clearTimers();
      return;
    }
    if (this.#watching && !wasEnabled) {
      for (const document of this.#unsubscribers.keys()) {
        this.#arm(document);
      }
    }
  }

  /**
   * Starts watching: `watch` delivers future documents (workspace opens);
   * `initial` covers documents opened before activation.
   */
  start(
    watch: (listener: DocumentOpenedListener) => () => void,
    initial: readonly Document[],
  ): void {
    if (this.#watching) {
      return;
    }
    this.#watching = true;
    this.#unwatchOpened = watch((document) => this.#track(document));
    for (const document of initial) {
      this.#track(document);
    }
  }

  #unwatchOpened: (() => void) | null = null;

  stop(): void {
    this.#clearTimers();
    for (const unsubscribe of this.#unsubscribers.values()) {
      unsubscribe();
    }
    this.#unsubscribers.clear();
    this.#unwatchOpened?.();
    this.#unwatchOpened = null;
    this.#watching = false;
  }

  /**
   * The document left the tab set (closed or externally deleted). Its
   * subscription stays — reopening the same file returns the same
   * instance — but a discarded document must not be autosaved.
   */
  forget(document: Document): void {
    this.#disarm(document);
  }

  #track(document: Document): void {
    if (this.#unsubscribers.has(document)) {
      return;
    }
    this.#unsubscribers.set(
      document,
      document.subscribe(() => this.#onChanged(document)),
    );
    if (document.dirty) {
      this.#arm(document);
    }
  }

  #onChanged(document: Document): void {
    if (!this.#watching) {
      return;
    }
    if (document.dirty) {
      // Reset the idle window on every edit; typing postpones the save.
      this.#arm(document);
    } else {
      this.#disarm(document);
    }
  }

  #arm(document: Document): void {
    this.#disarm(document);
    if (!this.#options.enabled || !this.#watching) {
      return;
    }
    const handle = window.setTimeout(() => {
      this.#timers.delete(document);
      this.#save(document);
    }, this.#options.delayMs);
    this.#timers.set(document, handle);
  }

  #disarm(document: Document): void {
    const handle = this.#timers.get(document);
    if (handle !== undefined) {
      window.clearTimeout(handle);
      this.#timers.delete(document);
    }
  }

  #clearTimers(): void {
    for (const handle of this.#timers.values()) {
      window.clearTimeout(handle);
    }
    this.#timers.clear();
  }

  /** A failed autosave leaves the document dirty; the next edit re-arms. */
  #save(document: Document): void {
    document.save().catch((err: unknown) => {
      reportSafetyError(err);
    });
  }
}

export const autosave = new AutosaveController();
