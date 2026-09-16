import { useCallback, useEffect, useRef } from "react";
import type { Dispatch } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ExtensionApi } from "../extension/api";
import type { ExtensionRuntime } from "../extension/bootstrap";
import {
  closePromptQueue,
  reportSafetyError,
  requestCloseDecision,
  setCloseGuardHandler,
  setSafetyErrorReporter,
} from "../safety/closeGuard";
import type { Document } from "../workspace/document";
import { searchUiKey } from "../search/searchTypes";
import type { SearchUiController } from "../search/searchTypes";
import { explorerUiKey } from "../explorer/explorerActions";
import type { ExplorerUiController } from "../explorer/explorerActions";
import { documentModeKey } from "../modes/documentModes";
import type { DocumentModeController } from "../modes/documentModes";
import { tabs } from "../tabs/tabStore";
import { onCliOpen, takePendingCliOpen } from "../workspace/cliOpen";
import type { CliOpen } from "../workspace/cliOpen";
import type { AppShellAction, StatusMessage } from "./appShellReducer";

/**
 * Top-level shell effects (react-state-architecture: effects hoisted toward
 * the tree root). Each hook owns one external synchronization concern; the
 * shell component only composes them.
 */

function parentDir(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut <= 0 ? "/" : path.slice(0, cut);
}

/**
 * A file opens in the context of its parent folder (sidebar shows sibling
 * files); a folder becomes the workspace itself.
 */
async function openFromCli(api: ExtensionApi, payload: CliOpen): Promise<void> {
  const target = payload.kind === "folder" ? payload.path : parentDir(payload.path);
  await api.workspace.openFolder(target);
  api.layout.activateDefault(api.presets.all());
  if (payload.kind === "file") {
    await tabs.open(payload.path);
  }
}

function showError(dispatch: Dispatch<AppShellAction>, err: unknown): void {
  dispatch({ type: "statusShown", message: { text: String(err), tone: "error" } });
}

/**
 * Binds the safety module's outputs to the shell: close decisions render
 * through the modal queue; save/autosave failures flash as error status.
 */
export function useCloseGuardBinding(
  dispatch: Dispatch<AppShellAction>,
): void {
  useEffect(() => {
    setCloseGuardHandler((documents) => closePromptQueue.request(documents));
    setSafetyErrorReporter((err: unknown) => {
      showError(dispatch, err);
    });
    return () => {
      setCloseGuardHandler(null);
      setSafetyErrorReporter(null);
    };
  }, [dispatch]);
}

/**
 * Window close protection: with dirty documents, veto the close, ask for
 * a decision over all of them, and only destroy after saving. With no
 * dirty documents the API's default behavior closes the window.
 */
export function useWindowCloseGuard(api: ExtensionApi): void {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    const win = getCurrentWindow();
    win.onCloseRequested((event) => {
      const dirty = api.workspace.documents.filter(
        (document) =>
          document.dirty && !api.workspace.deletedPaths.includes(document.path),
      );
      if (dirty.length === 0) {
        // No preventDefault: the API destroys the window.
        return;
      }
      event.preventDefault();
      resolveWindowClose(win, dirty).catch((err: unknown) => {
        console.error("window close resolution failed", err);
      });
    })
      .then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((err: unknown) => {
        console.error("failed to watch window close", err);
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [api]);
}

async function resolveWindowClose(
  win: ReturnType<typeof getCurrentWindow>,
  dirty: readonly Document[],
): Promise<void> {
  const decision = await requestCloseDecision(dirty);
  if (decision === "cancel") {
    return;
  }
  if (decision === "save") {
    for (const document of dirty) {
      // A pending autosave may have written while the dialog was open.
      if (!document.dirty) {
        continue;
      }
      try {
        await document.save();
      } catch (err: unknown) {
        reportSafetyError(err);
        return;
      }
    }
  }
  await win.destroy();
}

/** Extension activation, then the path (if any) the process was opened with. */
export function useExtensionActivation(
  runtime: ExtensionRuntime,
  api: ExtensionApi,
  dispatch: Dispatch<AppShellAction>,
): void {
  useEffect(() => {
    let cancelled = false;
    runtime.activation
      .then(() => {
        if (cancelled) {
          return;
        }
        api.layout.activateDefault(api.presets.all());
        dispatch({ type: "activated" });
        return takePendingCliOpen();
      })
      .then((pending) => {
        if (!cancelled && pending !== null && pending !== undefined) {
          return openFromCli(api, pending).catch((err: unknown) => {
            showError(dispatch, err);
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          showError(dispatch, err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [runtime, api, dispatch]);
}

/** A second `md-reader <path>` invocation forwards the path here while the
 * app is already running. */
export function useCliOpenEvents(
  api: ExtensionApi,
  dispatch: Dispatch<AppShellAction>,
): void {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    onCliOpen((payload) => {
      openFromCli(api, payload).catch((err: unknown) => {
        showError(dispatch, err);
      });
    })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          showError(dispatch, err);
        }
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [api, dispatch]);
}

/**
 * Global keyboard shortcuts and the transient status flash. Global-scope
 * effects live here at the shell level, not in panes or widgets.
 */
export function useGlobalShortcuts(
  api: ExtensionApi,
  dispatch: Dispatch<AppShellAction>,
): void {
  const searchUiRef = useRef<SearchUiController | null>(null);
  const explorerUiRef = useRef<ExplorerUiController | null>(null);
  const modeControllerRef = useRef<DocumentModeController | null>(null);
  const statusTimer = useRef<number | null>(null);

  useEffect(
    () =>
      api.services.consume(searchUiKey, (ui) => {
        searchUiRef.current = ui;
      }),
    [api],
  );

  useEffect(
    () =>
      api.services.consume(explorerUiKey, (ui) => {
        explorerUiRef.current = ui;
      }),
    [api],
  );

  useEffect(
    () =>
      api.services.consume(documentModeKey, (mode) => {
        modeControllerRef.current = mode;
      }),
    [api],
  );

  const flashStatus = useCallback(
    (message: StatusMessage): void => {
      if (statusTimer.current !== null) {
        window.clearTimeout(statusTimer.current);
      }
      dispatch({ type: "statusShown", message });
      if (message.tone === "ok") {
        statusTimer.current = window.setTimeout(() => {
          dispatch({ type: "statusCleared" });
        }, 1500);
      }
    },
    [dispatch],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key === "s") {
        event.preventDefault();
        api.router.active
          ?.save()
          .then(() => flashStatus({ text: "Saved", tone: "ok" }))
          .catch((err: unknown) => showError(dispatch, err));
        return;
      }
      if (mod && (event.key === "e" || event.key === "E")) {
        event.preventDefault();
        if (event.altKey) {
          modeControllerRef.current?.toggleSplit();
        } else {
          modeControllerRef.current?.toggleMode();
        }
        return;
      }
      if (mod && event.key === "f") {
        event.preventDefault();
        searchUiRef.current?.openFind();
        return;
      }
      if (mod && event.key === "n") {
        event.preventDefault();
        // Shift+N yields the shifted key "N"; check it first so ⌘⇧N
        // (new folder) is not swallowed by the plain-⌘N branch.
        if (event.shiftKey) {
          explorerUiRef.current?.newFolder();
        } else {
          explorerUiRef.current?.newFile();
        }
        return;
      }
      if (mod && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        tabs
          .activateNeighbor(event.key === "ArrowRight" ? 1 : -1)
          .catch((err: unknown) => console.error("tab switch failed", err));
        return;
      }
      if (event.ctrlKey && event.key === "Tab") {
        event.preventDefault();
        tabs
          .activateNeighbor(event.shiftKey ? -1 : 1)
          .catch((err: unknown) => console.error("tab switch failed", err));
        return;
      }
      if (mod && event.key === "w") {
        event.preventDefault();
        tabs
          .closeActive()
          .catch((err: unknown) => console.error("tab close failed", err));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [api, dispatch, flashStatus]);

  useEffect(() => {
    return () => {
      if (statusTimer.current !== null) {
        window.clearTimeout(statusTimer.current);
      }
    };
  }, []);
}

/** Sidebar resize: pointer x equals sidebar width because the sidebar
 * starts at the window's left edge. */
export function useSidebarResize(
  resizing: boolean,
  dispatch: Dispatch<AppShellAction>,
): void {
  useEffect(() => {
    if (!resizing) {
      return;
    }
    document.body.classList.add("mdr-resizing-sidebar", "mdr-dragging");
    function onMove(event: MouseEvent): void {
      dispatch({ type: "sidebarResizeMoved", width: event.clientX });
    }
    function onUp(): void {
      dispatch({ type: "sidebarResizeEnded" });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      document.body.classList.remove("mdr-resizing-sidebar", "mdr-dragging");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizing, dispatch]);
}
