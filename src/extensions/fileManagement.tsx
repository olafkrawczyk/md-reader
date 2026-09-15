import type { JSX } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { ExtensionApi, ExtensionDescriptor } from "../core/extension";
import { reportSafetyError } from "../core/safety";
import { ModalSheet } from "../core/ui/controls";
import { useStoreValue } from "../core/state/storeHooks";
import { storeSource } from "../core/state/store";
import type { StoreSource } from "../core/state/store";
import {
  actionsForEntry,
  baseNameOf,
  explorerActionsKey,
  explorerUiKey,
  isDescendantPath,
  joinPath,
  normalizeDocumentName,
  parentPathOf,
  uniqueCopyName,
} from "../core/explorer/explorerActions";
import type {
  ExplorerActionsService,
  ExplorerActionsState,
  ExplorerInlineMode,
  ExplorerMenuActionId,
} from "../core/explorer/explorerActions";
import type { FileEntry } from "../core/workspace/types";
import type { Workspace } from "../core/workspace/workspace";
import { registerMenuAction } from "../core/menu/menuActions";

const SETTINGS_NAMESPACE = "file-management";
const IGNORED_DIRECTORIES_KEY = "ignoredDirectories";
const DEFAULT_IGNORED_DIRECTORIES = "node_modules, .git, .venv, dist, target, .next";

function parseIgnoredDirectories(raw: string): string[] {
  return raw
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

/**
 * File management: registers the explorer-actions service — create (with
 * nested paths), rename/move, duplicate, delete — so the sidebar extension
 * can render the affordances without owning any file-operation behavior.
 */

function errorMessage(err: unknown): string {
  if (typeof err === "string") {
    return err;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

function findChildren(
  entries: readonly FileEntry[],
  parentPath: string,
): readonly FileEntry[] | null {
  for (const entry of entries) {
    if (entry.kind !== "folder") {
      continue;
    }
    if (entry.path === parentPath) {
      return entry.children ?? [];
    }
    if (entry.children !== undefined) {
      const found = findChildren(entry.children, parentPath);
      if (found !== null) {
        return found;
      }
    }
  }
  return null;
}

class ExplorerActionsController implements ExplorerActionsService {
  readonly #workspace: Workspace;
  #state: ExplorerActionsState = {
    menu: null,
    inline: null,
    rename: null,
    deletePrompt: null,
  };
  readonly #listeners = new Set<(state: ExplorerActionsState) => void>();

  readonly stateSource: StoreSource<ExplorerActionsState>;

  constructor(workspaceApi: Workspace) {
    this.#workspace = workspaceApi;
    this.stateSource = storeSource(
      () => this.#state,
      (listener) => {
        this.#listeners.add(listener);
        return () => {
          this.#listeners.delete(listener);
        };
      },
    );
  }

  #patch(partial: Partial<ExplorerActionsState>): void {
    this.#state = { ...this.#state, ...partial };
    for (const listener of this.#listeners) {
      listener(this.#state);
    }
  }

  /** Non-inline failures go to the shell's error status surface. */
  #report(err: unknown): void {
    reportSafetyError(err);
  }

  #siblingNames(parentPath: string): readonly string[] {
    const children = findChildren(this.#workspace.tree, parentPath);
    return children === null ? [] : children.map((entry) => entry.name);
  }

  openMenu(entry: FileEntry | null, x: number, y: number): void {
    if (entry === null && this.#workspace.root === null) {
      return;
    }
    this.#patch({
      menu: { entry, actions: actionsForEntry(entry), x, y },
      inline: null,
      rename: null,
    });
  }

  closeMenu(): void {
    if (this.#state.menu !== null) {
      this.#patch({ menu: null });
    }
  }

  runMenuAction(action: ExplorerMenuActionId): void {
    const menu = this.#state.menu;
    this.#patch({ menu: null });
    if (menu === null) {
      return;
    }
    const entry = menu.entry;
    switch (action) {
      case "new-file":
      case "new-folder": {
        const parentPath = entry?.path ?? this.#workspace.root;
        if (parentPath !== null) {
          this.beginCreate(parentPath, action === "new-file" ? "file" : "folder");
        }
        return;
      }
      case "rename":
        if (entry !== null) {
          this.#patch({
            rename: {
              path: entry.path,
              initialName: entry.name,
              isFolder: entry.kind === "folder",
              error: null,
            },
          });
        }
        return;
      case "copy":
        if (entry !== null) {
          this.#duplicate(entry);
        }
        return;
      case "move":
        if (entry !== null) {
          this.#moveViaPicker(entry);
        }
        return;
      case "delete":
        if (entry !== null) {
          this.#patch({
            deletePrompt: {
              path: entry.path,
              name: entry.name,
              isFolder: entry.kind === "folder",
            },
          });
        }
    }
  }

  /** Displayable extension test shared by create and rename normalization. */
  #isSupportedExtension(ext: string): boolean {
    return this.#workspace.documentTypes.isDisplayableExtension(ext);
  }

  confirmInline(value: string): Promise<string | null> {
    const inline = this.#state.inline;
    if (inline === null) {
      return Promise.resolve(null);
    }
    const typed = value.trim().replace(/^\.\//, "");
    if (typed === "") {
      this.#patch({ inline: null });
      return Promise.resolve(null);
    }
    const name =
      inline.mode === "file"
        ? normalizeDocumentName(typed, (ext) => this.#isSupportedExtension(ext))
        : typed;
    const target = joinPath(inline.parentPath, name);
    return this.#workspace.createEntry(target, inline.mode).then(
      () => {
        this.#patch({ inline: null });
        return target;
      },
      (err: unknown) => {
        this.#patch({
          inline: { ...inline, error: errorMessage(err) },
        });
        return null;
      },
    );
  }

  confirmRename(value: string): Promise<boolean> {
    const rename = this.#state.rename;
    if (rename === null) {
      return Promise.resolve(false);
    }
    const name = value.trim();
    if (name === "" || name === rename.initialName) {
      this.#patch({ rename: null });
      return Promise.resolve(true);
    }
    const normalized =
      rename.isFolder
        ? name
        : normalizeDocumentName(name, (ext) => this.#isSupportedExtension(ext));
    const to = joinPath(parentPathOf(rename.path), normalized);
    return this.#workspace.renameEntry(rename.path, to).then(
      () => {
        this.#patch({ rename: null });
        return true;
      },
      (err: unknown) => {
        this.#patch({
          rename: { ...rename, error: errorMessage(err) },
        });
        return false;
      },
    );
  }

  cancelInline(): void {
    this.#patch({ inline: null });
  }

  cancelRename(): void {
    this.#patch({ rename: null });
  }

  dropOn(entry: FileEntry | null, draggedPath: string): Promise<void> {
    const targetPath = entry === null ? this.#workspace.root : entry.path;
    if (targetPath === null || (entry !== null && entry.kind !== "folder")) {
      return Promise.resolve();
    }
    return this.#move(draggedPath, targetPath);
  }

  /** Opens the inline create field at `parentPath` (action bar, context menu). */
  beginCreate(parentPath: string, mode: ExplorerInlineMode): void {
    this.#beginCreate(parentPath, mode);
  }

  /** Root-bound create for global shortcuts (⌘N / ⌘⇧N). */
  beginCreateAtRoot(mode: ExplorerInlineMode): void {
    const root = this.#workspace.root;
    if (root !== null) {
      this.#beginCreate(root, mode);
    }
  }

  #beginCreate(parentPath: string, mode: ExplorerInlineMode): void {
    this.#patch({
      menu: null,
      inline: { parentPath, mode, error: null },
    });
  }

  requestDeleteConfirmation(entry: FileEntry): void {    this.#patch({
      deletePrompt: {
        path: entry.path,
        name: entry.name,
        isFolder: entry.kind === "folder",
      },
    });
  }

  confirmDelete(): void {
    const prompt = this.#state.deletePrompt;
    if (prompt === null) {
      return;
    }
    this.#patch({ deletePrompt: null });
    this.#workspace.deleteEntry(prompt.path).catch((err: unknown) => {
      this.#report(err);
    });
  }

  cancelDelete(): void {
    this.#patch({ deletePrompt: null });
  }

  /** Moves `from` into `destinationFolder`; rejects self/descendant/no-op moves. */
  #move(from: string, destinationFolder: string): Promise<void> {
    if (
      destinationFolder === parentPathOf(from) ||
      isDescendantPath(destinationFolder, from)
    ) {
      return Promise.resolve();
    }
    const to = joinPath(destinationFolder, baseNameOf(from));
    return this.#workspace.renameEntry(from, to).catch((err: unknown) => {
      this.#report(err);
    });
  }

  #duplicate(entry: FileEntry): void {
    const parentPath = parentPathOf(entry.path);
    const to = joinPath(
      parentPath,
      uniqueCopyName(entry.name, this.#siblingNames(parentPath)),
    );
    this.#workspace.copyEntry(entry.path, to).catch((err: unknown) => {
      this.#report(err);
    });
  }

  #moveViaPicker(entry: FileEntry): void {
    open({ directory: true, multiple: false })
      .then((selection) => {
        if (typeof selection === "string") {
          return this.#move(entry.path, selection);
        }
        return undefined;
      })
      .catch((err: unknown) => {
        this.#report(err);
      });
  }
}

function DeleteConfirmDialog(
  controller: ExplorerActionsController,
): () => JSX.Element | null {
  return function DeleteConfirmDialog(): JSX.Element | null {
    const state = useStoreValue(controller.stateSource);
    const prompt = state.deletePrompt;
    if (prompt === null) {
      return null;
    }
    const message = prompt.isFolder
      ? `Delete the folder “${prompt.name}” and all of its contents?`
      : `Delete “${prompt.name}”?`;
    return (
      <ModalSheet open title="Delete" onClose={() => controller.cancelDelete()}>
        <p className="mdr-dialog-message">{message}</p>
        <div className="mdr-dialog-actions">
          <button
            type="button"
            className="mdr-dialog-button"
            onClick={() => controller.cancelDelete()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="mdr-dialog-button"
            data-danger
            onClick={() => controller.confirmDelete()}
          >
            Delete
          </button>
        </div>
      </ModalSheet>
    );
  };
}

function activate(api: ExtensionApi): void {
  const controller = new ExplorerActionsController(api.workspace);
  api.services.register(explorerActionsKey, controller);
  api.services.register(explorerUiKey, {
    newFile: () => controller.beginCreateAtRoot("file"),
    newFolder: () => controller.beginCreateAtRoot("folder"),
  });
  registerMenuAction("new-file", () => controller.beginCreateAtRoot("file"));
  registerMenuAction("new-folder", () => controller.beginCreateAtRoot("folder"));
  api.ui.register({
    id: "explorer-delete-confirm",
    slot: "overlay",
    component: DeleteConfirmDialog(controller),
  });

  api.settings.register({
    namespace: SETTINGS_NAMESPACE,
    entries: [
      {
        key: IGNORED_DIRECTORIES_KEY,
        label: "Ignored directories",
        type: "text",
        defaultValue: DEFAULT_IGNORED_DIRECTORIES,
      },
    ],
  });

  // Applied live: the subscription fires on registration (pushing the
  // current list to Rust) and on every setting change.
  const applyIgnoredDirectories = (): void => {
    const raw = api.settingsValues.getString(
      SETTINGS_NAMESPACE,
      IGNORED_DIRECTORIES_KEY,
      DEFAULT_IGNORED_DIRECTORIES,
    );
    api.workspace
      .setIgnoredDirectories(parseIgnoredDirectories(raw))
      .catch((err: unknown) => {
        console.error("failed to sync ignored directories", err);
      });
  };
  api.settingsValues.subscribe(
    SETTINGS_NAMESPACE,
    IGNORED_DIRECTORIES_KEY,
    applyIgnoredDirectories,
  );
}

export const fileManagementExtension: ExtensionDescriptor = {
  manifest: {
    id: "@mdr/file-management",
    displayName: "File Management",
    version: "0.1.0",
  },
  load: () => Promise.resolve({ activate }),
};
