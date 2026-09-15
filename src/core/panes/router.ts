import type { Document } from "../workspace/document";
import { workspace } from "../workspace/workspace";
import { storeSource } from "../state/store";
import type { StoreSource } from "../state/store";

type ActiveDocumentListener = (document: Document | null) => void;

/**
 * Routes documents to panes: holds the active document and notifies the
 * layout when it changes. Opening a deleted path re-opens it fresh.
 */
export class DocumentRouter {
  readonly #listeners = new Set<ActiveDocumentListener>();
  #active: Document | null = null;
  #unlistenDeleted: (() => void) | null = null;

  get active(): Document | null {
    return this.#active;
  }

  /** Reactive view of the active document for subscription hooks. */
  readonly activeSource: StoreSource<Document | null> = storeSource(
    () => this.active,
    (listener) => this.subscribe(listener),
  );

  async open(path: string): Promise<Document> {
    const document = await workspace.openDocument(path);
    if (this.#unlistenDeleted === null) {
      this.#unlistenDeleted = workspace.onDocumentDeleted((deleted) => {
        if (this.#active === deleted) {
          this.#setActive(null);
        }
      });
    }
    this.#setActive(document);
    return document;
  }

  subscribe(listener: ActiveDocumentListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #setActive(document: Document | null): void {
    this.#active = document;
    for (const listener of this.#listeners) {
      listener(document);
    }
  }
}
