import {
  activateWorkspace,
  copyEntry,
  createEntry,
  deleteEntry,
  onFsChanged,
  readDirTree,
  readTextFile,
  renameEntry,
  setIgnoredDirectories,
} from "./bridge";
import { Document } from "./document";
import { DocumentTypeRegistry } from "./documentTypes";
import { storeSource } from "../state/store";
import type { StoreSource } from "../state/store";
import type { FileEntry, FileEntryKind, FsEvent } from "./types";

type TreeListener = (tree: readonly FileEntry[]) => void;
type DocumentDeletedListener = (document: Document) => void;
type DocumentOpenedListener = (document: Document) => void;
type DocumentsRetargetedListener = (moves: readonly PathMove[]) => void;

/** One open document's file moved from `from` to `to` (rename or move). */
export interface PathMove {
  readonly from: string;
  readonly to: string;
}

/**
 * The active workspace: its nested file tree, live-updated from file system
 * events, plus the set of open documents. Deletion of an open document's
 * file (directly or via a parent folder) is signaled to listeners.
 */
export class Workspace {
  readonly documentTypes = new DocumentTypeRegistry();

  readonly #treeListeners = new Set<TreeListener>();
  readonly #deletedListeners = new Set<DocumentDeletedListener>();
  readonly #openedListeners = new Set<DocumentOpenedListener>();
  readonly #retargetedListeners = new Set<DocumentsRetargetedListener>();
  readonly #documents = new Map<string, Document>();
  readonly #deletedPaths = new Set<string>();
  #root: string | null = null;
  #tree: readonly FileEntry[] = [];
  #unlisten: (() => void) | null = null;

  get root(): string | null {
    return this.#root;
  }

  get tree(): readonly FileEntry[] {
    return this.#tree;
  }

  /** Reactive view of the file tree for subscription hooks. */
  readonly treeSource: StoreSource<readonly FileEntry[]> = storeSource(
    () => this.tree,
    (listener) => this.onTreeChanged(listener),
  );

  get documents(): readonly Document[] {
    return [...this.#documents.values()];
  }

  get deletedPaths(): readonly string[] {
    return [...this.#deletedPaths];
  }

  /** Makes `path` the active workspace and starts watching it. */
  async openFolder(path: string): Promise<void> {
    await activateWorkspace(path);
    this.#root = path;
    this.#unlisten?.();
    this.#unlisten = await onFsChanged((event) => {
      this.#applyFsEvent(event).catch((err: unknown) => {
        console.error("workspace fs-event handling failed", err);
      });
    });
    await this.#rescan();
  }

  /**
   * Updates the ignored-directories list and refreshes the tree so the
   * change applies live. No-op rescan when no workspace is open.
   */
  async setIgnoredDirectories(directories: readonly string[]): Promise<void> {
    await setIgnoredDirectories(directories);
    if (this.#root !== null) {
      await this.#rescan();
    }
  }

  async openDocument(path: string): Promise<Document> {
    const existing = this.#documents.get(path);
    if (existing) {
      return existing;
    }
    const text = await readTextFile(path);
    this.#deletedPaths.delete(path);
    const document = new Document(path, text);
    this.#documents.set(path, document);
    for (const listener of this.#openedListeners) {
      listener(document);
    }
    return document;
  }

  /** Creates a file or folder, including missing parent directories. */
  async createEntry(path: string, kind: FileEntryKind): Promise<void> {
    await createEntry(path, kind);
  }

  /**
   * Renames or moves an entry. Open documents at or under the source are
   * retargeted synchronously (before the rescan lands) so in-memory edits
   * stay attached to their file.
   */
  async renameEntry(from: string, to: string): Promise<void> {
    await renameEntry(from, to);
    this.#retargetDocuments(from, to);
  }

  /** Copies a file or folder subtree; the source stays untouched. */
  async copyEntry(from: string, to: string): Promise<void> {
    await copyEntry(from, to);
  }

  /** Deletes a file or folder with its subtree; open documents are signaled. */
  async deleteEntry(path: string): Promise<void> {
    await deleteEntry(path);
  }

  onDocumentsRetargeted(listener: DocumentsRetargetedListener): () => void {
    this.#retargetedListeners.add(listener);
    return () => {
      this.#retargetedListeners.delete(listener);
    };
  }

  #retargetDocuments(from: string, to: string): void {
    const moves: PathMove[] = [];
    for (const [path, document] of [...this.#documents]) {
      if (path !== from && !path.startsWith(`${from}/`)) {
        continue;
      }
      const target = `${to}${path.slice(from.length)}`;
      this.#documents.delete(path);
      document.retarget(target);
      this.#documents.set(target, document);
      this.#deletedPaths.delete(target);
      moves.push({ from: path, to: target });
    }
    if (moves.length > 0) {
      for (const listener of this.#retargetedListeners) {
        listener(moves);
      }
    }
  }

  onTreeChanged(listener: TreeListener): () => void {
    this.#treeListeners.add(listener);
    return () => {
      this.#treeListeners.delete(listener);
    };
  }

  onDocumentDeleted(listener: DocumentDeletedListener): () => void {
    this.#deletedListeners.add(listener);
    return () => {
      this.#deletedListeners.delete(listener);
    };
  }

  onDocumentOpened(listener: DocumentOpenedListener): () => void {
    this.#openedListeners.add(listener);
    return () => {
      this.#openedListeners.delete(listener);
    };
  }

  /** Drops the in-memory document so a later open reloads from disk. */
  forgetDocument(path: string): void {
    this.#documents.delete(path);
  }

  /**
   * Routes a classified watcher batch: structural paths rescan the tree;
   * every affected path (both kinds — a temp-file-rename save surfaces as
   * rename/create) re-reads matching open clean documents. Content-only
   * batches skip the tree walk entirely.
   */
  async #applyFsEvent(event: FsEvent): Promise<void> {
    if (event.changed.length > 0) {
      await this.#rescan();
    }
    const touched = new Set<string>([...event.changed, ...event.modified]);
    await this.#reloadModified(touched);
  }

  /** Re-reads open, clean documents whose files appear in the batch. */
  async #reloadModified(paths: ReadonlySet<string>): Promise<void> {
    for (const [path, document] of this.#documents) {
      if (!paths.has(path) || document.dirty) {
        continue;
      }
      try {
        document.reload(await readTextFile(path));
      } catch (err: unknown) {
        // The file may have been deleted between the event and the read;
        // deletion signaling owns that case.
        console.error("failed to reload externally modified document", path, err);
      }
    }
  }

  async #rescan(): Promise<void> {
    this.#tree = await readDirTree();
    this.#signalDeleted();
    for (const listener of this.#treeListeners) {
      listener(this.#tree);
    }
  }

  /**
   * External changes are reflected by rescanning the tree; an open document
   * counts as deleted once its path no longer appears anywhere in it.
   */
  #signalDeleted(): void {
    for (const [path, document] of this.#documents) {
      if (this.#deletedPaths.has(path)) {
        continue;
      }
      if (!treeContains(this.#tree, path)) {
        this.#deletedPaths.add(path);
        this.#documents.delete(path);
        for (const listener of this.#deletedListeners) {
          listener(document);
        }
      }
    }
  }
}

function treeContains(entries: readonly FileEntry[], path: string): boolean {
  for (const entry of entries) {
    if (entry.path === path) {
      return true;
    }
    if (entry.children && treeContains(entry.children, path)) {
      return true;
    }
  }
  return false;
}

export const workspace = new Workspace();

export type { FsEvent, FileEntry } from "./types";
export { Document } from "./document";
export { DocumentTypeRegistry, PLAIN_TEXT_TYPE } from "./documentTypes";
export type { DocumentType } from "./documentTypes";
