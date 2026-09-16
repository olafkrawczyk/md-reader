import type { JSX } from "react";
import { useCallback } from "react";
import type { ExtensionApi, ExtensionDescriptor } from "../core/extension";
import { useStoreValue } from "../core/state/storeHooks";
import { documentModeKey } from "../core/modes/documentModes";
import { QuietButton } from "../core/ui/controls";
import { EyeIcon, PenIcon, ResearchIcon, SplitIcon } from "../core/ui/icons";

// Core layout preset IDs
const READ = "read";
const EDIT = "edit";
const SPLIT = "split";
const RESEARCH = "research";

function ModeControls(api: ExtensionApi) {
  return function ModeControls(): JSX.Element {
    const activeId = useStoreValue(api.layout.presetSource) ?? READ;
    const isEdit = activeId === EDIT;
    const isSplit = activeId === SPLIT;
    const isResearch = activeId === RESEARCH;

    const toggleMode = useCallback(() => {
      api.layout.setPreset(isEdit ? READ : EDIT);
    }, [isEdit]);

    const toggleSplit = useCallback(() => {
      api.layout.setPreset(isSplit ? READ : SPLIT);
    }, [isSplit]);

    const toggleResearch = useCallback(() => {
      api.layout.setPreset(isResearch ? READ : RESEARCH);
    }, [isResearch]);

    return (
      <div className="mdr-mode-controls" style={{ display: "inline-flex", gap: "2px", alignItems: "center" }}>
        <QuietButton
          onClick={toggleMode}
          title={isEdit ? "Switch to Reading (⌘E)" : "Switch to Writing (⌘E)"}
        >
          <span data-mode-active={isEdit} style={{ display: "inline-flex" }}>
            {isEdit ? <EyeIcon /> : <PenIcon />}
          </span>
        </QuietButton>
        <QuietButton
          onClick={toggleSplit}
          title={isSplit ? "Close Split View (⌘⌥E)" : "Split View (⌘⌥E)"}
        >
          <span
            data-split-active={isSplit}
            style={{
              display: "inline-flex",
              color: isSplit ? "var(--mdr-color-accent)" : undefined,
            }}
          >
            <SplitIcon />
          </span>
        </QuietButton>
        <QuietButton
          onClick={toggleResearch}
          title={isResearch ? "Close Research View" : "Research View (Backlinks)"}
        >
          <span
            data-research-active={isResearch}
            style={{
              display: "inline-flex",
              color: isResearch ? "var(--mdr-color-accent)" : undefined,
            }}
          >
            <ResearchIcon />
          </span>
        </QuietButton>
      </div>
    );
  };
}

function activate(api: ExtensionApi): void {
  api.services.register(documentModeKey, {
    toggleMode() {
      const id = api.layout.activePresetId;
      api.layout.setPreset(id === EDIT ? READ : EDIT);
    },
    toggleSplit() {
      const id = api.layout.activePresetId;
      api.layout.setPreset(id === SPLIT ? READ : SPLIT);
    },
  });

  api.presets.register({
    id: READ,
    isDefault: true,
    sidebarPaneId: "sidebar",
    mainPaneIds: ["reader"],
  });
  api.presets.register({
    id: EDIT,
    sidebarPaneId: "sidebar",
    mainPaneIds: ["editor"],
  });
  api.presets.register({
    id: SPLIT,
    sidebarPaneId: "sidebar",
    mainPaneIds: ["editor", "reader"],
  });
  api.presets.register({
    id: RESEARCH,
    sidebarPaneId: "sidebar",
    mainPaneIds: ["reader", "backlinks"],
  });

  api.ui.register({
    id: "mode-controls",
    slot: "toolbar",
    component: ModeControls(api),
  });
}

export const presetsExtension: ExtensionDescriptor = {
  manifest: {
    id: "@mdr/presets",
    displayName: "Layout presets",
    version: "0.2.0",
  },
  load: () => Promise.resolve({ activate }),
};
