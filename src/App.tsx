import { useCallback, useEffect, useReducer } from "react";
import type { JSX } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { PaneView, bootstrapExtensions } from "./core/extension";
import type { LayoutPreset, PaneContribution } from "./core/extension";
import { appShellReducer, initialAppShellState } from "./core/state/appShellReducer";
import {
  useCliOpenEvents,
  useCloseGuardBinding,
  useExtensionActivation,
  useGlobalShortcuts,
  useSidebarResize,
  useWindowCloseGuard,
} from "./core/state/appShellHooks";
import { CloseGuardDialog } from "./core/safety";
import { registerMenuAction } from "./core/menu/menuActions";
import { useStoreSelection, useStoreValue } from "./core/state/storeHooks";
import { SettingsPanel } from "./core/settings/SettingsPanel";
import { QuietButton } from "./core/ui/controls";
import { FolderOpenIcon, SettingsIcon, SidebarIcon } from "./core/ui/icons";
import { tabs } from "./core/tabs/tabStore";
import { TabStrip } from "./core/tabs/TabStrip";
import type { Document } from "./core/workspace/document";
import { workspace } from "./core/workspace/workspace";
import SplitLayout from "./core/panes/splitLayout";
import { slotSignature } from "./core/panes/splitLayout";
import type { SplitSlot } from "./core/panes/splitLayout";
import { builtinExtensions } from "./extensions";

// Activated exactly once per app run before first render (idempotent
// module-level singleton); render stays side-effect free.
const runtime = bootstrapExtensions(builtinExtensions);
const api = runtime.api;

function documentFitsPane(
  document: Document | null,
  pane: PaneContribution,
  documentType: string | null,
): boolean {
  return document !== null && documentType !== null && pane.documentTypes.includes(documentType);
}

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

// The overlay title bar is macOS-only; other platforms keep the standard
// title bar and need no traffic-light inset.
const usesOverlayTitleBar = /mac/i.test(navigator.platform);

function App(): JSX.Element {
  const [shell, dispatch] = useReducer(appShellReducer, initialAppShellState);
  useExtensionActivation(runtime, api, dispatch);
  useCliOpenEvents(api, dispatch);
  useCloseGuardBinding(dispatch);
  useWindowCloseGuard(api);
  useGlobalShortcuts(api, dispatch);
  useSidebarResize(shell.sidebar.resizing, dispatch);

  // External stores via subscription hooks; chrome UI state via the shell
  // reducer. No mirroring effects.
  const presetId = useStoreValue(api.layout.presetSource);
  const activeDocument = useStoreValue(api.router.activeSource);
  const tabList = useStoreSelection(tabs.source, (store) => store.tabs);
  const activeTabPath = useStoreSelection(tabs.source, (store) => store.activePath);
  // `root` has no dedicated notification; a rescan always follows a folder
  // open, so selecting it off the tree source updates exactly when it changes.
  const workspaceRoot = useStoreSelection(workspace.treeSource, () => api.workspace.root);

  // The native menu's create actions mirror the workspace-dependent in-app
  // controls; Open Folder… stays enabled in the welcome state.
  useEffect(() => {
    invoke("set_workspace_menu_enabled", { enabled: workspaceRoot !== null }).catch(
      (err: unknown) => {
        console.error("failed to sync menu enablement", err);
      },
    );
  }, [workspaceRoot]);

  // Idempotent binding; lives for the whole session.
  useEffect(() => tabs.attach(api.router), []);

  const toggleSidebar = useCallback(() => dispatch({ type: "sidebarToggled" }), [dispatch]);
  const openSettings = useCallback(() => dispatch({ type: "settingsOpened" }), [dispatch]);
  const closeSettings = useCallback(() => dispatch({ type: "settingsClosed" }), [dispatch]);

  const handleOpenFolder = useCallback(() => {
    open({ directory: true, multiple: false })
      .then(async (selection) => {
        if (typeof selection === "string") {
          await api.workspace.openFolder(selection);
          api.layout.activateDefault(api.presets.all());
          dispatch({ type: "statusCleared" });
        }
      })
      .catch((err: unknown) => {
        dispatch({ type: "statusShown", message: { text: String(err), tone: "error" } });
      });
  }, [dispatch]);

  // The native menu's Open Folder… shares the toolbar/welcome action.
  useEffect(
    () => registerMenuAction("open-folder", handleOpenFolder),
    [handleOpenFolder],
  );

  // Single click activates without promoting; double-click opens for good.
  const activateTab = useCallback((path: string) => {
    tabs.activate(path).catch((err: unknown) => {
      console.error("failed to activate tab", err);
    });
  }, []);

  const promoteTab = useCallback((path: string) => {
    tabs.open(path).catch((err: unknown) => {
      console.error("failed to promote tab", err);
    });
  }, []);

  const closeTab = useCallback((path: string) => {
    tabs.close(path).catch((err: unknown) => {
      console.error("failed to close tab", err);
    });
  }, []);

  const preset: LayoutPreset | undefined = api.presets
    .all()
    .find((candidate) => candidate.id === presetId);

  const documentType: string | null =
    activeDocument === null
      ? null
      : api.workspace.documentTypes.typeForPath(activeDocument.path).id;

  function routedDocument(pane: PaneContribution): Document | null {
    return documentFitsPane(activeDocument, pane, documentType) ? activeDocument : null;
  }

  const rootName = workspaceRoot === null ? null : baseName(workspaceRoot);
  const showWelcome = workspaceRoot === null || tabList.length === 0;

  const mainSlots: SplitSlot[] = [];
  if (preset) {
    for (const paneId of preset.mainPaneIds) {
      const pane = api.panes.byId(paneId);
      if (pane) {
        mainSlots.push({
          id: paneId,
          content: <PaneView pane={pane} document={routedDocument(pane)} />,
        });
      }
    }
  }

  const sidebarPane = preset?.sidebarPaneId
    ? api.panes.byId(preset.sidebarPaneId)
    : undefined;
  const status = shell.status;

  return (
    <div className="mdr-app">
      <header className="mdr-toolbar">
        {usesOverlayTitleBar && <div className="mdr-titlebar-band" data-tauri-drag-region />}
        <div className="mdr-toolbar-controls">
          <QuietButton onClick={toggleSidebar} title="Toggle Sidebar">
            <SidebarIcon />
          </QuietButton>
          <QuietButton onClick={handleOpenFolder} title="Open Folder">
            <FolderOpenIcon />
          </QuietButton>
          {rootName !== null && <span className="mdr-workspace-name">{rootName}</span>}
          <div className="mdr-toolbar-spacer" data-tauri-drag-region />
          {api.ui
            .bySlot("toolbar")
            .map((contribution) => (
              <contribution.component key={contribution.id} />
            ))}
          {status !== null && (
            <span
              className="mdr-status"
              role={status.tone === "error" ? "alert" : "status"}
              data-tone={status.tone}
            >
              {status.text}
            </span>
          )}
          <QuietButton onClick={openSettings} title="Settings">
            <SettingsIcon />
          </QuietButton>
        </div>
      </header>
      <div className="mdr-body">
        {shell.ready && preset ? (
          <>
            {sidebarPane && shell.sidebar.open && (
              <div
                className="mdr-sidebar-region"
                style={{ width: shell.sidebar.width }}
              >
                <PaneView pane={sidebarPane} document={null} />
              </div>
            )}
            {sidebarPane && shell.sidebar.open && (
              <div
                className="mdr-sidebar-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize sidebar"
                onMouseDown={() => dispatch({ type: "sidebarResizeStarted" })}
              />
            )}
            <div className="mdr-content">
              {!showWelcome && (
                <TabStrip
                  tabs={tabList}
                  activePath={activeTabPath}
                  onActivate={activateTab}
                  onPromote={promoteTab}
                  onClose={closeTab}
                />
              )}
              <div className="mdr-main-region">
                {showWelcome ? (
                  <div className="mdr-welcome">
                    <h1 className="mdr-welcome-title">md-reader</h1>
                    <p className="mdr-welcome-caption">
                      Open a folder to start reading and editing.
                    </p>
                    <button
                      type="button"
                      className="mdr-primary-button"
                      onClick={handleOpenFolder}
                    >
                      Open Folder…
                    </button>
                  </div>
                ) : mainSlots.length > 0 ? (
                  <SplitLayout key={slotSignature(mainSlots)} slots={mainSlots} />
                ) : (
                  <div className="mdr-empty">No panes in this layout.</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="mdr-empty">
            {status === null ? "Starting…" : "Extension activation failed."}
          </div>
        )}
      </div>
      <SettingsPanel
        api={api}
        open={shell.settingsOpen}
        onClose={closeSettings}
      />
      <CloseGuardDialog />
      {api.ui.bySlot("overlay").map((contribution) => (
        <contribution.component key={contribution.id} />
      ))}
    </div>
  );
}

export default App;
