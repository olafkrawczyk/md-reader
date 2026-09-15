import { writeTextFile } from "./bridge";

type DocumentListener = (document: Document) => void;

/**
 * A file opened from the workspace: its text, path, a version that
 * increments on every in-app content change, and a dirty flag that is set
 * by edits and cleared by saving.
 */
export class Document {
  readonly #listeners = new Set<DocumentListener>();
  #text: string;
  #version = 0;
  #dirty = false;
  #path: string;

  constructor(path: string, initialText: string) {
    this.#path = path;
    this.#text = initialText;
  }

  get path(): string {
    return this.#path;
  }

  /**
   * Re-associates the document with a new location after a rename or move
   * of its file. In-memory text and dirty state are untouched.
   */
  retarget(newPath: string): void {
    this.#path = newPath;
    this.#emit();
  }

  get text(): string {
    return this.#text;
  }

  get version(): number {
    return this.#version;
  }

  get dirty(): boolean {
    return this.#dirty;
  }

  setText(text: string): void {
    if (text === this.#text) {
      return;
    }
    this.#text = text;
    this.#version += 1;
    this.#dirty = true;
    this.#emit();
  }

  /**
   * Ingests externally modified on-disk text. Never dirties the document
   * (a clean document stays clean) and never bumps the version (version
   * counts in-app edits). A dirty document's buffer wins, so a reload is a
   * no-op while dirty.
   */
  reload(text: string): void {
    if (this.#dirty || text === this.#text) {
      return;
    }
    this.#text = text;
    this.#emit();
  }

  async save(): Promise<void> {
    await writeTextFile(this.path, this.#text);
    this.#dirty = false;
    this.#emit();
  }

  subscribe(listener: DocumentListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #emit(): void {
    for (const listener of this.#listeners) {
      listener(this);
    }
  }
}
