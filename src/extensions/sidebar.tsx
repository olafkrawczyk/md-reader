import { memo, useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { DragEvent, JSX, MouseEvent as ReactMouseEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { ExtensionApi, ExtensionDescriptor } from "../core/extension";
import type { FileEntry } from "../core/workspace/types";
import { tabs } from "../core/tabs/tabStore";
import { useService, useStoreSelection, useStoreValue } from "../core/state/storeHooks";
import { effectiveSearchKey } from "../core/search/searchTypes";
import {
  detachedExplorerActionsSource,
  explorerActionsKey,
  MENU_ACTION_LABELS,
  parentPathOf,
} from "../core/explorer/explorerActions";
import type {
  ExplorerActionsState,
  ExplorerInlineMode,
  ExplorerMenuActionId,
  ExplorerMenuState,
} from "../core/explorer/explorerActions";
import {
  ChevronIcon,
  CloseIcon,
  CodeFileIcon,
  FilePlusIcon,
  FolderIcon,
  FolderPlusIcon,
  MarkdownFileIcon,
  PlainFileIcon,
} from "../core/ui/icons";
import { QuietButton } from "../core/ui/controls";

/**
 * Explorer state as one typed state machine (react-state-architecture:
 * state budget). Disclosure is session-scoped — the sidebar stays mounted
 * across tab and preset switches, so this state is the session state.
 * `selectedPath` is the last-clicked tree row (any kind); it anchors the
 * action bar's contextual create target. `dropTarget` is transient
 * drag-and-drop highlight state.
 */
interface ExplorerState {
  readonly expandedFolders: ReadonlySet<string>;
  readonly selectedPath: string | null;
  readonly query: string;
  readonly dropTarget: string | null;
}

type ExplorerAction =
  | { readonly type: "folderToggled"; readonly path: string }
  | { readonly type: "foldersExpanded"; readonly paths: readonly string[] }
  | { readonly type: "rowSelected"; readonly path: string }
  | { readonly type: "queryChanged"; readonly query: string }
  | { readonly type: "dropTargetChanged"; readonly path: string | null };

const initialExplorerState: ExplorerState = {
  expandedFolders: new Set(),
  selectedPath: null,
  query: "",
  dropTarget: null,
};

function explorerReducer(
  state: ExplorerState,
  action: ExplorerAction,
): ExplorerState {
  switch (action.type) {
    case "folderToggled": {
      const next = new Set(state.expandedFolders);
      if (next.has(action.path)) {
        next.delete(action.path);
      } else {
        next.add(action.path);
      }
      return { ...state, expandedFolders: next };
    }
    case "foldersExpanded": {
      const next = new Set(state.expandedFolders);
      for (const path of action.paths) {
        next.add(path);
      }
      return next.size === state.expandedFolders.size
        ? state
        : { ...state, expandedFolders: next };
    }
    case "rowSelected":
      return state.selectedPath === action.path
        ? state
        : { ...state, selectedPath: action.path };
    case "queryChanged":
      return { ...state, query: action.query };
    case "dropTargetChanged":
      return state.dropTarget === action.path
        ? state
        : { ...state, dropTarget: action.path };
  }
}

/** Everything a row needs from the service layer plus sidebar callbacks. */
interface RowHandlers {
  readonly available: boolean;
  readonly actions: ExplorerActionsState;
  readonly onToggleFolder: (path: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onOpenFilePermanent: (path: string) => void;
  readonly onOpenMenu: (entry: FileEntry | null, x: number, y: number) => void;
  readonly onDropOn: (entry: FileEntry | null, draggedPath: string) => void;
  readonly onDropTarget: (path: string | null) => void;
  readonly onConfirmInline: (value: string) => void;
  readonly onCancelInline: () => void;
  readonly onConfirmRename: (value: string) => void;
  readonly onCancelRename: () => void;
}

interface RowState {
  readonly activePath: string | null;
  readonly selectedPath: string | null;
  readonly expandedFolders: ReadonlySet<string>;
  readonly actions: ExplorerActionsState;
  readonly dropTarget: string | null;
}

const NEW_FILE_INITIAL = "Untitled.md";

function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot + 1).toLowerCase();
}

function isDisplayableFile(path: string, api: ExtensionApi): boolean {
  return api.workspace.documentTypes.isDisplayableExtension(extensionOf(path));
}

/**
 * The explorer filters unsupported files but shows every folder, including
 * empty ones, so file-management operations always have a visible target.
 */
function filterDisplayable(
  entries: readonly FileEntry[],
  api: ExtensionApi,
): readonly FileEntry[] {
  const visible: FileEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === "folder") {
      visible.push(
        entry.children === undefined
          ? entry
          : { ...entry, children: filterDisplayable(entry.children, api) },
      );
      continue;
    }
    if (isDisplayableFile(entry.path, api)) {
      visible.push(entry);
    }
  }
  return visible;
}

function iconFor(entry: FileEntry, documentType: (path: string) => string): JSX.Element {
  if (entry.kind === "folder") {
    return <FolderIcon />;
  }
  const type = documentType(entry.path);
  if (type === "markdown") {
    return <MarkdownFileIcon />;
  }
  if (type === "text") {
    return <PlainFileIcon />;
  }
  return <CodeFileIcon />;
}

function findEntry(
  entries: readonly FileEntry[],
  path: string,
): FileEntry | null {
  for (const entry of entries) {
    if (entry.path === path) {
      return entry;
    }
    if (entry.children !== undefined) {
      const found = findEntry(entry.children, path);
      if (found !== null) {
        return found;
      }
    }
  }
  return null;
}

/** The inline create/rename field. Enter confirms, Escape cancels; a failed
 * confirm keeps the typed value and shows the error below the field.
 * `selectUpTo` pre-selects the stem of a prefilled name (create mode), so
 * typing replaces it while the default extension stays visible. */
function InlineInput({
  initial,
  placeholder,
  label,
  error,
  onConfirm,
  onCancel,
  selectUpTo,
}: {
  readonly initial: string;
  readonly placeholder: string;
  readonly label: string;
  readonly error: string | null;
  readonly onConfirm: (value: string) => void;
  readonly onCancel: () => void;
  readonly selectUpTo?: number | undefined;
}): JSX.Element {
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (selectUpTo !== undefined) {
      ref.current?.setSelectionRange(0, selectUpTo);
    }
  }, [selectUpTo]);

  return (
    <span className="mdr-explorer-inline">
      <input
        ref={ref}
        type="text"
        className="mdr-explorer-inline-input"
        defaultValue={initial}
        placeholder={placeholder}
        aria-label={label}
        autoFocus
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onConfirm(ref.current?.value ?? "");
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      {error !== null && (
        <span className="mdr-explorer-inline-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

function rowDragProps(
  entry: FileEntry,
  handlers: RowHandlers,
): {
  readonly draggable: boolean | undefined;
  readonly onDragStart: ((event: DragEvent<HTMLLIElement>) => void) | undefined;
} {
  if (!handlers.available) {
    return { draggable: undefined, onDragStart: undefined };
  }
  return {
    draggable: true,
    onDragStart: (event) => {
      event.dataTransfer.setData("text/plain", entry.path);
      event.dataTransfer.effectAllowed = "move";
    },
  };
}

function dropProps(entry: FileEntry, handlers: RowHandlers): {
  readonly onDragOver: (event: DragEvent<HTMLButtonElement>) => void;
  readonly onDragLeave: (event: DragEvent<HTMLButtonElement>) => void;
  readonly onDrop: (event: DragEvent<HTMLButtonElement>) => void;
} {
  return {
    onDragOver: (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      handlers.onDropTarget(entry.path);
    },
    onDragLeave: (event) => {
      event.stopPropagation();
      handlers.onDropTarget(null);
    },
    onDrop: (event) => {
      event.preventDefault();
      event.stopPropagation();
      handlers.onDropTarget(null);
      const draggedPath = event.dataTransfer.getData("text/plain");
      if (draggedPath !== "") {
        handlers.onDropOn(entry, draggedPath);
      }
    },
  };
}

const ExplorerRows = memo(function ExplorerRows({
  entries,
  state,
  documentType,
  handlers,
}: {
  readonly entries: readonly FileEntry[];
  readonly state: RowState;
  readonly documentType: (path: string) => string;
  readonly handlers: RowHandlers;
}): JSX.Element {
  const { actions } = state;
  return (
    <ul>
      {entries.map((entry) => {
        const renaming = actions.rename?.path === entry.path;
        const creatingHere = actions.inline?.parentPath === entry.path;
        const dropHere = state.dropTarget === entry.path;
        const menuProps = {
          onContextMenu: (event: ReactMouseEvent<HTMLButtonElement>) => {
            event.preventDefault();
            event.stopPropagation();
            handlers.onOpenMenu(entry, event.clientX, event.clientY);
          },
        };
        if (entry.kind === "folder") {
          const expanded = state.expandedFolders.has(entry.path);
          const drag = rowDragProps(entry, handlers);
          const drop = dropProps(entry, handlers);
          const createInput = creatingHere && actions.inline !== null && (
            <InlineInput
              initial={actions.inline.mode === "file" ? NEW_FILE_INITIAL : ""}
              selectUpTo={actions.inline.mode === "file" ? NEW_FILE_INITIAL.indexOf(".") : undefined}
              placeholder="nested/path"
              label={actions.inline.mode === "file" ? "New file name" : "New folder name"}
              error={actions.inline.error}
              onConfirm={handlers.onConfirmInline}
              onCancel={handlers.onCancelInline}
            />
          );
          return (
            <li key={entry.path} draggable={drag.draggable} onDragStart={drag.onDragStart}>
              {renaming && actions.rename !== null ? (
                <InlineInput
                  initial={actions.rename.initialName}
                  placeholder={entry.name}
                  label="New name"
                  error={actions.rename.error}
                  onConfirm={handlers.onConfirmRename}
                  onCancel={handlers.onCancelRename}
                />
              ) : (
                <button
                  type="button"
                  className="mdr-explorer-row"
                  data-drop={dropHere}
                  data-selected={entry.path === state.selectedPath}
                  aria-expanded={expanded}
                  onClick={() => handlers.onToggleFolder(entry.path)}
                  {...menuProps}
                  {...drop}
                >
                  <span className="mdr-explorer-chevron" data-expanded={expanded}>
                    <ChevronIcon />
                  </span>
                  <span className="mdr-explorer-icon">{iconFor(entry, documentType)}</span>
                  <span className="mdr-explorer-name">{entry.name}</span>
                </button>
              )}
              {createInput}
              {expanded && entry.children && (
                <ExplorerRows
                  entries={entry.children}
                  state={state}
                  documentType={documentType}
                  handlers={handlers}
                />
              )}
            </li>
          );
        }
        const drag = rowDragProps(entry, handlers);
        return (
          <li key={entry.path} draggable={drag.draggable} onDragStart={drag.onDragStart}>
            {renaming && actions.rename !== null ? (
              <InlineInput
                initial={actions.rename.initialName}
                placeholder={entry.name}
                label="New name"
                error={actions.rename.error}
                onConfirm={handlers.onConfirmRename}
                onCancel={handlers.onCancelRename}
              />
            ) : (
              <button
                type="button"
                className="mdr-explorer-row"
                data-type="file"
                data-active={entry.path === state.activePath}
                data-selected={entry.path === state.selectedPath}
                onClick={() => handlers.onOpenFile(entry.path)}
                onDoubleClick={() => handlers.onOpenFilePermanent(entry.path)}
                {...menuProps}
              >
                <span className="mdr-explorer-chevron" data-hidden="true">
                  <ChevronIcon />
                </span>
                <span className="mdr-explorer-icon">{iconFor(entry, documentType)}</span>
                <span className="mdr-explorer-name">{entry.name}</span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
});

/** All folder paths in the tree: while a filename query is active, every
 * shown folder contains matches and must be expanded. */
function collectFolderPaths(
  entries: readonly FileEntry[],
  into: Set<string>,
): Set<string> {
  for (const entry of entries) {
    if (entry.kind === "folder") {
      into.add(entry.path);
      if (entry.children !== undefined) {
        collectFolderPaths(entry.children, into);
      }
    }
  }
  return into;
}

function ExplorerContextMenu({
  menu,
  onClose,
  onAction,
}: {
  readonly menu: ExplorerMenuState;
  readonly onClose: () => void;
  readonly onAction: (action: ExplorerMenuActionId) => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      const element = ref.current;
      if (
        element !== null &&
        event.target instanceof Node &&
        !element.contains(event.target)
      ) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const width = 168;
  const itemHeight = 26;
  return (
    <div
      ref={ref}
      className="mdr-explorer-menu"
      role="menu"
      aria-label="File actions"
      style={{
        left: Math.max(0, Math.min(menu.x, window.innerWidth - width - 8)),
        top: Math.max(
          0,
          Math.min(menu.y, window.innerHeight - menu.actions.length * itemHeight - 8),
        ),
      }}
    >
      {menu.actions.map((action) => (
        <button
          key={action}
          type="button"
          role="menuitem"
          className="mdr-explorer-menu-item"
          onClick={() => {
            onAction(action);
          }}
        >
          {MENU_ACTION_LABELS[action]}
        </button>
      ))}
    </div>
  );
}

function SidebarPane(api: ExtensionApi) {
  return function SidebarPane(): JSX.Element {
    // External stores consumed through subscription hooks (no mirroring
    // effects); explorer UI state in one reducer.
    const tree = useStoreValue(api.workspace.treeSource);
    const activePath = useStoreSelection(
      api.router.activeSource,
      (document) => document?.path ?? null,
    );
    const search = useService(api.services, effectiveSearchKey);
    const actions = useService(api.services, explorerActionsKey);
    const actionState = useStoreValue(
      actions === null ? detachedExplorerActionsSource : actions.stateSource,
    );
    const [explorer, dispatch] = useReducer(explorerReducer, initialExplorerState);

    const handleOpenFolder = useCallback(() => {
      open({ directory: true, multiple: false })
        .then(async (selection) => {
          if (typeof selection === "string") {
            await api.workspace.openFolder(selection);
            api.layout.activateDefault(api.presets.all());
          }
        })
        .catch((err: unknown) => {
          console.error("failed to open folder", err);
        });
    }, []);

    const documentType = useCallback(
      (path: string) => api.workspace.documentTypes.typeForPath(path).id,
      [],
    );

    const handleToggleFolder = useCallback((path: string) => {
      dispatch({ type: "rowSelected", path });
      dispatch({ type: "folderToggled", path });
    }, []);

    const handleOpenFile = useCallback((path: string) => {
      dispatch({ type: "rowSelected", path });
      tabs.openPreview(path).catch((err: unknown) => {
        console.error("failed to preview document", err);
      });
    }, []);

    const handleOpenFilePermanent = useCallback((path: string) => {
      dispatch({ type: "rowSelected", path });
      tabs.open(path).catch((err: unknown) => {
        console.error("failed to open document", err);
      });
    }, []);

    const handleOpenMenu = useCallback(
      (entry: FileEntry | null, x: number, y: number) => {
        actions?.openMenu(entry, x, y);
      },
      [actions],
    );

    const handleCloseMenu = useCallback(() => {
      actions?.closeMenu();
    }, [actions]);

    const handleMenuAction = useCallback(
      (action: ExplorerMenuActionId) => {
        actions?.runMenuAction(action);
      },
      [actions],
    );

    const handleDropOn = useCallback(
      (entry: FileEntry | null, draggedPath: string) => {
        actions?.dropOn(entry, draggedPath).catch((err: unknown) => {
          console.error("failed to move entry", err);
        });
      },
      [actions],
    );

    const handleDropTarget = useCallback((path: string | null) => {
      dispatch({ type: "dropTargetChanged", path });
    }, []);

    const handleConfirmInline = useCallback(
      (value: string) => {
        if (actions === null) {
          return;
        }
        actions
          .confirmInline(value)
          .then((createdPath) => {
            if (createdPath === null) {
              return;
            }
            // Reveal the created entry: expand every folder on its path.
            const rootPath = api.workspace.root;
            const ancestors: string[] = [];
            let folder = parentPathOf(createdPath);
            while (rootPath !== null && folder.length > rootPath.length) {
              ancestors.push(folder);
              folder = parentPathOf(folder);
            }
            if (ancestors.length > 0) {
              dispatch({ type: "foldersExpanded", paths: ancestors });
            }
          })
          .catch((err: unknown) => {
            console.error("failed to create entry", err);
          });
      },
      [actions],
    );

    const handleCancelInline = useCallback(() => {
      actions?.cancelInline();
    }, [actions]);

    const handleConfirmRename = useCallback(
      (value: string) => {
        actions?.confirmRename(value).catch((err: unknown) => {
          console.error("failed to rename entry", err);
        });
      },
      [actions],
    );

    const handleCancelRename = useCallback(() => {
      actions?.cancelRename();
    }, [actions]);

    // Design D2/D5: the action bar creates relative to the last-clicked row
    // (folder → inside it, file → its parent), falling back to the active
    // document's parent, then the workspace root.
    const handleBeginCreate = useCallback(
      (mode: ExplorerInlineMode) => {
        if (actions === null) {
          return;
        }
        const root = api.workspace.root;
        if (root === null) {
          return;
        }
        let parentPath: string | null = null;
        if (explorer.selectedPath !== null) {
          const entry = findEntry(tree, explorer.selectedPath);
          if (entry !== null) {
            parentPath =
              entry.kind === "folder" ? entry.path : parentPathOf(entry.path);
          }
        }
        if (parentPath === null && activePath !== null) {
          parentPath = parentPathOf(activePath);
        }
        actions.beginCreate(parentPath ?? root, mode);
      },
      [actions, explorer.selectedPath, tree, activePath],
    );

    const filterRef = useRef<HTMLInputElement | null>(null);

    const handleClearQuery = useCallback(() => {
      dispatch({ type: "queryChanged", query: "" });
      filterRef.current?.focus();
    }, []);

    const handlers = useMemo<RowHandlers>(
      () => ({
        available: actions !== null,
        actions: actionState,
        onToggleFolder: handleToggleFolder,
        onOpenFile: handleOpenFile,
        onOpenFilePermanent: handleOpenFilePermanent,
        onOpenMenu: handleOpenMenu,
        onDropOn: handleDropOn,
        onDropTarget: handleDropTarget,
        onConfirmInline: handleConfirmInline,
        onCancelInline: handleCancelInline,
        onConfirmRename: handleConfirmRename,
        onCancelRename: handleCancelRename,
      }),
      [
        actions,
        actionState,
        handleToggleFolder,
        handleOpenFile,
        handleOpenFilePermanent,
        handleOpenMenu,
        handleDropOn,
        handleDropTarget,
        handleConfirmInline,
        handleCancelInline,
        handleConfirmRename,
        handleCancelRename,
      ],
    );

    const displayableTree = useMemo(
      () => filterDisplayable(tree, api),
      [tree],
    );
    const filtering =
      search !== null && search.capabilities.fileNameFilter && explorer.query.trim() !== "";
    const visibleTree = useMemo(
      () =>
        filtering && search !== null
          ? search.filterFileNames(displayableTree, explorer.query)
          : displayableTree,
      [filtering, search, displayableTree, explorer.query],
    );
    // While a filename query is active, every shown folder contains matches
    // and must be expanded — derived, not stored.
    const expanded = filtering
      ? collectFolderPaths(visibleTree, new Set())
      : explorer.expandedFolders;
    const rowState = useMemo(
      () => ({
        activePath,
        selectedPath: explorer.selectedPath,
        expandedFolders: expanded,
        actions: actionState,
        dropTarget: explorer.dropTarget,
      }),
      [activePath, explorer.selectedPath, expanded, actionState, explorer.dropTarget],
    );

    if (api.workspace.root === null) {
      return (
        <div className="mdr-sidebar-empty">
          <p className="mdr-empty">No folder open.</p>
          <button type="button" onClick={handleOpenFolder}>
            Open Folder…
          </button>
        </div>
      );
    }

    const rootPath = api.workspace.root;
    const rootInline = actionState.inline?.parentPath === rootPath;
    const rootDrop = explorer.dropTarget === rootPath;

    // The nav itself is the root drop zone and root context-menu surface;
    // row-level drag events stopPropagation so only the empty area hits it.
    const rootDropProps = handlers.available
      ? {
          onDragOver: (event: DragEvent<HTMLElement>) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            handleDropTarget(rootPath);
          },
          onDragLeave: () => {
            handleDropTarget(null);
          },
          onDrop: (event: DragEvent<HTMLElement>) => {
            event.preventDefault();
            handleDropTarget(null);
            const draggedPath = event.dataTransfer.getData("text/plain");
            if (draggedPath !== "") {
              handleDropOn(null, draggedPath);
            }
          },
        }
      : {};

    return (
      <nav
        className="mdr-explorer"
        aria-label="Files"
        data-drop={rootDrop}
        onContextMenu={(event) => {
          // Suppress the native context menu (WKWebView otherwise overlays
          // it and swallows all subsequent clicks).
          event.preventDefault();
          handleOpenMenu(null, event.clientX, event.clientY);
        }}
        {...rootDropProps}
      >
        <div className="mdr-explorer-tree">
          {rootInline && actionState.inline !== null && (
            <InlineInput
              initial={actionState.inline.mode === "file" ? NEW_FILE_INITIAL : ""}
              selectUpTo={actionState.inline.mode === "file" ? NEW_FILE_INITIAL.indexOf(".") : undefined}
              placeholder="nested/path"
              label={actionState.inline.mode === "file" ? "New file name" : "New folder name"}
              error={actionState.inline.error}
              onConfirm={handleConfirmInline}
              onCancel={handleCancelInline}
            />
          )}
          <ExplorerRows
            entries={visibleTree}
            state={rowState}
            documentType={documentType}
            handlers={handlers}
          />
        </div>
        <div className="mdr-explorer-actionbar">
          <QuietButton
            title="New File"
            onClick={() => handleBeginCreate("file")}
          >
            <FilePlusIcon />
          </QuietButton>
          <QuietButton
            title="New Folder"
            onClick={() => handleBeginCreate("folder")}
          >
            <FolderPlusIcon />
          </QuietButton>
          <div className="mdr-explorer-filter">
            <input
              ref={filterRef}
              className="mdr-explorer-search"
              type="text"
              placeholder="Search"
              aria-label="Search file names"
              value={explorer.query}
              onChange={(event) =>
                dispatch({ type: "queryChanged", query: event.target.value })
              }
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  dispatch({ type: "queryChanged", query: "" });
                }
              }}
            />
            {explorer.query !== "" && (
              <button
                type="button"
                className="mdr-explorer-filter-clear"
                aria-label="Clear search"
                title="Clear search"
                onClick={handleClearQuery}
              >
                <CloseIcon />
              </button>
            )}
          </div>
        </div>
        {actionState.menu !== null && (
          <ExplorerContextMenu
            menu={actionState.menu}
            onClose={handleCloseMenu}
            onAction={handleMenuAction}
          />
        )}
      </nav>
    );
  };
}

function activate(api: ExtensionApi): void {
  api.panes.register({
    id: "sidebar",
    documentTypes: [],
    component: SidebarPane(api),
  });
}

export const sidebarExtension: ExtensionDescriptor = {
  manifest: {
    id: "@mdr/sidebar",
    displayName: "Sidebar",
    version: "0.1.0",
  },
  load: () => Promise.resolve({ activate }),
};
