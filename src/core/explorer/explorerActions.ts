import { serviceKey } from "../extension/serviceRegistry";
import { storeSource } from "../state/store";
import type { StoreSource } from "../state/store";
import type { FileEntry } from "../workspace/types";

/**
 * The explorer-actions seam (design: UI affordances as a service): the
 * file-management extension registers the behavior — which menu actions an
 * entry offers, create/rename/delete handlers, inline-input state — while
 * the sidebar stays a pure renderer that degrades gracefully when the
 * service is absent.
 */

export type ExplorerMenuActionId =
  | "new-file"
  | "new-folder"
  | "rename"
  | "copy"
  | "move"
  | "delete";

export type ExplorerInlineMode = "file" | "folder";

export interface ExplorerMenuState {
  /** null targets the workspace root. */
  readonly entry: FileEntry | null;
  readonly actions: readonly ExplorerMenuActionId[];
  readonly x: number;
  readonly y: number;
}

export interface ExplorerInlineState {
  readonly parentPath: string;
  readonly mode: ExplorerInlineMode;
  readonly error: string | null;
}

export interface ExplorerRenameState {
  readonly path: string;
  readonly initialName: string;
  readonly isFolder: boolean;
  readonly error: string | null;
}

export interface ExplorerDeleteState {
  readonly path: string;
  readonly name: string;
  readonly isFolder: boolean;
}

export interface ExplorerActionsState {
  readonly menu: ExplorerMenuState | null;
  readonly inline: ExplorerInlineState | null;
  readonly rename: ExplorerRenameState | null;
  readonly deletePrompt: ExplorerDeleteState | null;
}

export const initialExplorerActionsState: ExplorerActionsState = {
  menu: null,
  inline: null,
  rename: null,
  deletePrompt: null,
};

/** Used while the file-management service is not (yet) registered. */
export const detachedExplorerActionsSource: StoreSource<ExplorerActionsState> =
  storeSource(
    () => initialExplorerActionsState,
    () => () => {},
  );

export const MENU_ACTION_LABELS: Readonly<
  Record<ExplorerMenuActionId, string>
> = {
  "new-file": "New File",
  "new-folder": "New Folder",
  rename: "Rename",
  copy: "Duplicate",
  move: "Move to…",
  delete: "Delete",
};

export function actionsForEntry(
  entry: FileEntry | null,
): readonly ExplorerMenuActionId[] {
  if (entry === null) {
    return ["new-file", "new-folder"];
  }
  if (entry.kind === "folder") {
    return ["new-file", "new-folder", "rename", "copy", "move", "delete"];
  }
  return ["rename", "copy", "move", "delete"];
}

export function parentPathOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index <= 0 ? path : path.slice(0, index);
}

export function joinPath(parent: string, name: string): string {
  return `${parent.replace(/\/+$/, "")}/${name}`;
}

export function baseNameOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

/** True when `path` is `ancestor` itself or lives underneath it. */
export function isDescendantPath(path: string, ancestor: string): boolean {
  return (
    path === ancestor ||
    path.startsWith(ancestor.endsWith("/") ? ancestor : `${ancestor}/`)
  );
}

/** A copy name that does not collide with the given sibling names. */
export function uniqueCopyName(
  name: string,
  siblings: readonly string[],
): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? `${stem} copy${ext}` : `${stem} copy ${n}${ext}`;
    if (!siblings.includes(candidate)) {
      return candidate;
    }
  }
}

/**
 * Document name normalization (design D1): a name whose extension is
 * missing, blank, or not displayable gets `.md` appended to the full typed
 * name; a displayable extension passes through. Extension-only edge cases:
 * a trailing dot is dropped (`note.` → `note.md`), and a leading dot is
 * treated as no extension (`.gitignore` → `.gitignore.md`).
 */
export function normalizeDocumentName(
  name: string,
  isSupportedExtension: (ext: string) => boolean,
): string {
  const trimmed = name.trim();
  const dot = trimmed.lastIndexOf(".");
  const ext = dot <= 0 ? "" : trimmed.slice(dot + 1).toLowerCase();
  if (ext !== "" && isSupportedExtension(ext)) {
    return trimmed;
  }
  const stem = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
  return `${stem}.md`;
}

export interface ExplorerActionsService {
  /** Reactive view of the menu/inline/rename/delete state. */
  readonly stateSource: StoreSource<ExplorerActionsState>;

  /** `entry === null` opens the root menu (new file/folder only). */
  openMenu(entry: FileEntry | null, x: number, y: number): void;
  closeMenu(): void;
  runMenuAction(action: ExplorerMenuActionId): void;

  /** Opens the inline create field at `parentPath`. */
  beginCreate(parentPath: string, mode: ExplorerInlineMode): void;

  /**
   * Confirms the inline create; empty input cancels. Resolves with the
   * created path, or null when cancelled or failed (failure leaves the
   * input open with its error shown).
   */
  confirmInline(value: string): Promise<string | null>;
  /** Confirms the inline rename; empty/unchanged input cancels. */
  confirmRename(value: string): Promise<boolean>;
  cancelInline(): void;
  cancelRename(): void;

  /** Drops a dragged path onto `entry` (null = workspace root). */
  dropOn(entry: FileEntry | null, draggedPath: string): Promise<void>;
}

export const explorerActionsKey = serviceKey<ExplorerActionsService>(
  "mdr.explorer.actions",
);

/** Shell-facing entry points for global shortcuts (the ⌘N pattern follows
 * the search UI controller). */
export interface ExplorerUiController {
  newFile(): void;
  newFolder(): void;
}

export const explorerUiKey = serviceKey<ExplorerUiController>(
  "mdr.explorer.ui",
);
