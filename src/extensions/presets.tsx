import type { JSX } from "react";
import type { ExtensionApi, ExtensionDescriptor } from "../core/extension";
import { useStoreValue } from "../core/state/storeHooks";
import { SegmentedControl } from "../core/ui/controls";

const PRESET_LABELS: Readonly<Record<string, string>> = {
  read: "Read",
  edit: "Edit",
  split: "Split",
};

function labelFor(presetId: string): string {
  return PRESET_LABELS[presetId] ?? presetId;
}

function PresetSwitcher(api: ExtensionApi) {
  return function PresetSwitcher(): JSX.Element {
    const activeId = useStoreValue(api.layout.presetSource);

    const presets = api.presets.all();
    const active = activeId ?? presets[0]?.id;
    if (active === undefined) {
      return <span className="mdr-status">No layouts available.</span>;
    }
    return (
      <SegmentedControl
        label="Layout"
        value={active}
        options={presets.map((preset) => ({
          value: preset.id,
          label: labelFor(preset.id),
        }))}
        onChange={(presetId) => {
          api.layout.setPreset(presetId);
        }}
      />
    );
  };
}

function activate(api: ExtensionApi): void {
  // Modes are contributed data; core knows regions and pane slots only.
  api.presets.register({
    id: "read",
    isDefault: true,
    sidebarPaneId: "sidebar",
    mainPaneIds: ["reader"],
  });
  api.presets.register({
    id: "edit",
    sidebarPaneId: "sidebar",
    mainPaneIds: ["editor"],
  });
  api.presets.register({
    id: "split",
    sidebarPaneId: "sidebar",
    mainPaneIds: ["editor", "reader"],
  });

  api.ui.register({
    id: "preset-switcher",
    slot: "toolbar",
    component: PresetSwitcher(api),
  });
}

export const presetsExtension: ExtensionDescriptor = {
  manifest: {
    id: "@mdr/presets",
    displayName: "Layout presets",
    version: "0.1.0",
  },
  load: () => Promise.resolve({ activate }),
};
