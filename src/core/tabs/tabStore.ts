import { DocumentRouter } from "../panes/router";
import { autosave, reportSafetyError, requestCloseDecision } from "../safety";
import { workspace } from "../workspace/workspace";
import { storeSource } from "../state/store";
import type { StoreSource } from "../state/store";

type TabsListener = () => void;

export interface TabInfo {
  readonly path: string;
  readonly name: string;
  readonly dirty: boolean;
  readonly preview: boolean;
}

/**
 * Open documents as an ordered tab list (design D5). One consumer of the
 * DocumentRouter: opening routes through the router so panes and presets
 * are untouched; the store adds the multi-document model on top. Tabs are
 * session-scoped.
 */
class TabStore {
  #router: DocumentRouter | null = null;
  #paths: readonly string[] = [];
  #activePath: string | null = null;
  // The single preview tab: replaced by the next preview, promoted to
  // permanent on double-click or first edit (so a dirty preview is never
  // silently replaced).
  #previewPath: string | null = null;
  readonly #dirtyPaths = new Set<string>();
  readonly #documentUnsubscribers = new Map<string, () => void>();
  readonly #listeners = new Set<TabsListener>();
  // Cached snapshots: getters must return referentially stable values
  // between mutations so React subscription hooks stay consistent.
  #pathsSnapshot: readonly string[] | null = null;
  #tabsSnapshot: readonly TabInfo[] | null = null;

  /** Binds the store to the app's router; idempotent. */
  attach(router: DocumentRouter): void {
    if (this.#router === router) {
      return;
    }
    this.#router = router;
    // Lives for the whole session; the store outlives any single document.
    workspace.onDocumentDeleted((document) => {
      // The workspace has already dropped the document, so #removeTab
      // cannot find it; the autosave timer must still be cleared.
      autosave.forget(document);
      this.close(document.path).catch((err: unknown) => {
        console.error("failed to close deleted tab", err);
      });
    });
    // Renames and moves keep the document instance, so tabs and dirty
    // watchers are re-keyed to the new path in place.
    workspace.onDocumentsRetargeted((moves) => {
      for (const move of moves) {
        this.#retargetTab(move.from, move.to);
      }
      this.#notify();
    });
  }

  get paths(): readonly string[] {
    if (this.#pathsSnapshot === null) {
      this.#pathsSnapshot = [...this.#paths];
    }
    return this.#pathsSnapshot;
  }

  get activePath(): string | null {
    return this.#activePath;
  }

  get isEmpty(): boolean {
    return this.#paths.length === 0;
  }

  get tabs(): readonly TabInfo[] {
    if (this.#tabsSnapshot === null) {
    this.#tabsSnapshot = this.#paths.map((path) => ({
      path,
      name: path.split("/").pop() ?? path,
      dirty: this.#dirtyPaths.has(path),
      preview: this.#previewPath === path,
    }));
    }
    return this.#tabsSnapshot;
  }

  /** Reactive view for subscription hooks; `get` returns the store itself. */
  readonly source: StoreSource<TabStore> = storeSource(
    () => this,
    (listener) =>
      this.subscribe(() => {
        listener(this);
      }),
  );

  subscribe(listener: TabsListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Opens the document as a permanent tab (existing tab is activated, not duplicated). */
  async open(path: string): Promise<void> {
    if (this.#previewPath === path) {
      // Permanent open promotes the preview tab.
      this.#previewPath = null;
      this.#notify();
    }
    await this.#activate(path, this.#paths.includes(path));
  }

  /**
   * Activates an open tab without changing its preview state; used for
   * tab clicks and keyboard navigation.
   */
  async activate(path: string): Promise<void> {
    if (!this.#paths.includes(path)) {
      return;
    }
    await this.#activate(path, true);
  }

  /**
   * Preview-open: at most one preview tab exists; a new preview replaces
   * the previous clean one. A dirty preview is promoted to permanent
   * instead, so replacement never discards edits or fires the close guard.
   */
  async openPreview(path: string): Promise<void> {
    const previous = this.#previewPath;
    if (previous !== null && previous !== path) {
      this.#previewPath = null;
      const document = workspace.documents.find(
        (candidate) => candidate.path === previous,
      );
      const promoted = document !== undefined && document.dirty;
      if (!promoted && this.#paths.includes(previous)) {
        await this.#removeTab(previous);
      }
      // A promoted (or promoted-by-absence) preview stays; #notify below.
      this.#notify();
    }
    if (this.#previewPath !== path && this.#paths.includes(path)) {
      // Re-activating an existing permanent tab never converts it.
      await this.activate(path);
      return;
    }
    this.#previewPath = path;
    await this.#activate(path, this.#paths.includes(path));
  }

  async #activate(path: string, alreadyOpen: boolean): Promise<void> {
    const router = this.#router;
    if (router === null) {
      return;
    }
    await router.open(path);
    const document = router.active;
    if (document === null) {
      return;
    }
    if (!alreadyOpen) {
      this.#paths = [...this.#paths, path];
      this.#watchDirty(document.path, document.subscribe(() => {
        this.#setDirty(path, document.dirty);
        // First edit promotes a preview: its tab becomes permanent, so it
        // is never silently replaced while holding unsaved changes.
        if (document.dirty && this.#previewPath === path) {
          this.#previewPath = null;
        }
      }));
    }
    this.#activePath = path;
    this.#notify();
  }

  /** Opens the adjacent tab when closing the active one. */
  async close(path: string): Promise<void> {
    if (!this.#paths.includes(path)) {
      return;
    }
    const document = workspace.documents.find((candidate) => candidate.path === path);
    const externallyDeleted =
      document !== undefined && workspace.deletedPaths.includes(path);
    if (
      document !== undefined &&
      document.dirty &&
      !externallyDeleted
    ) {
      const decision = await requestCloseDecision([document]);
      if (decision === "cancel") {
        return;
      }
      // A pending autosave may have written while the dialog was open
      // (design D5); only write when the document is still dirty.
      if (decision === "save" && document.dirty) {
        try {
          await document.save();
        } catch (err: unknown) {
          reportSafetyError(err);
          return;
        }
      }
      if (decision === "discard") {
        // Drop the in-memory copy so a reopen reloads from disk and the
        // discarded edits are really gone.
        autosave.forget(document);
        workspace.forgetDocument(document.path);
      }
    }
    await this.#removeTab(path);
  }

  #retargetTab(from: string, to: string): void {
    if (!this.#paths.includes(from)) {
      return;
    }
    this.#paths = this.#paths.map((path) => (path === from ? to : path));
    if (this.#activePath === from) {
      this.#activePath = to;
    }
    if (this.#previewPath === from) {
      this.#previewPath = to;
    }
    if (this.#dirtyPaths.has(from)) {
      this.#dirtyPaths.delete(from);
      this.#dirtyPaths.add(to);
    }
    const unsubscribe = this.#documentUnsubscribers.get(from);
    if (unsubscribe !== undefined) {
      unsubscribe();
      this.#documentUnsubscribers.delete(from);
      const document = workspace.documents.find(
        (candidate) => candidate.path === to,
      );
      if (document !== undefined) {
        this.#watchDirty(
          to,
          document.subscribe(() => {
            this.#setDirty(to, document.dirty);
            if (document.dirty && this.#previewPath === to) {
              this.#previewPath = null;
            }
          }),
        );
      }
    }
  }

  async #removeTab(path: string): Promise<void> {
    const index = this.#paths.indexOf(path);
    const remaining = this.#paths.filter((candidate) => candidate !== path);
    const wasActive = this.#activePath === path;
    if (this.#previewPath === path) {
      this.#previewPath = null;
    }
    this.#unwatchDirty(path);
    const document = workspace.documents.find(
      (candidate) => candidate.path === path,
    );
    if (document !== undefined) {
      autosave.forget(document);
    }
    this.#paths = remaining;
    if (!wasActive) {
      this.#notify();
      return;
    }
    this.#activePath = null;
    const neighbor = remaining[Math.min(index, remaining.length - 1)];
    if (neighbor !== undefined) {
      // Activation only: the neighbor's preview state is untouched.
      await this.activate(neighbor);
    } else {
      this.#notify();
    }
  }

  async activateNeighbor(offset: -1 | 1): Promise<void> {
    if (this.#paths.length < 2 || this.#activePath === null) {
      return;
    }
    const index = this.#paths.indexOf(this.#activePath);
    const next = (index + offset + this.#paths.length) % this.#paths.length;
    const path = this.#paths[next];
    if (path !== undefined) {
      await this.activate(path);
    }
  }

  async closeActive(): Promise<void> {
    if (this.#activePath !== null) {
      await this.close(this.#activePath);
    }
  }

  #setDirty(path: string, dirty: boolean): void {
    const had = this.#dirtyPaths.has(path);
    if (dirty === had) {
      return;
    }
    if (dirty) {
      this.#dirtyPaths.add(path);
    } else {
      this.#dirtyPaths.delete(path);
    }
    this.#notify();
  }

  #watchDirty(path: string, unsubscribe: () => void): void {
    this.#documentUnsubscribers.get(path)?.();
    this.#documentUnsubscribers.set(path, unsubscribe);
  }

  #unwatchDirty(path: string): void {
    this.#documentUnsubscribers.get(path)?.();
    this.#documentUnsubscribers.delete(path);
    this.#dirtyPaths.delete(path);
  }

  #notify(): void {
    this.#pathsSnapshot = null;
    this.#tabsSnapshot = null;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

export const tabs = new TabStore();
