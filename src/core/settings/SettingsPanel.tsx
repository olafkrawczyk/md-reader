import { memo, useMemo } from "react";
import type { JSX } from "react";
import type { ExtensionApi } from "../extension/api";
import type { SettingSchemaEntry } from "../extension/contributionRegistries";
import { useStoreValue } from "../state/storeHooks";
import { ModalSheet, PullDown, SegmentedControl, Stepper, Switch, TextField } from "../ui/controls";

interface SettingsPanelProps {
  readonly api: ExtensionApi;
  readonly open: boolean;
  readonly onClose: () => void;
}

interface EntryControlProps {
  readonly api: ExtensionApi;
  readonly namespace: string;
  readonly entry: SettingSchemaEntry;
}

/** One setting row subscribes to its own store key; only it re-renders on change. */
const EntryControl = memo(function EntryControl({
  api,
  namespace,
  entry,
}: EntryControlProps): JSX.Element {
  const source = useMemo(
    () => api.settingsValues.settingSource(namespace, entry),
    [api, namespace, entry],
  );
  const value = useStoreValue(source);
  if (entry.type === "choice") {
    const selected = typeof value === "string" ? value : entry.defaultValue;
    // Few options read as a segmented toggle; long lists stay a pull-down.
    if (entry.choices.length <= 3) {
      return (
        <SegmentedControl
          label={entry.label}
          value={selected}
          options={entry.choices.map((choice) => ({ value: choice, label: choice }))}
          onChange={(choice) => {
            api.settingsValues.set(namespace, entry.key, choice);
          }}
        />
      );
    }
    return (
      <PullDown
        label={entry.label}
        value={selected}
        options={entry.choices}
        onChange={(choice) => {
          api.settingsValues.set(namespace, entry.key, choice);
        }}
      />
    );
  }
  if (entry.type === "boolean") {
    const checked = typeof value === "boolean" ? value : entry.defaultValue;
    return (
      <Switch
        label={entry.label}
        checked={checked}
        onChange={(newValue) => {
          api.settingsValues.set(namespace, entry.key, newValue);
        }}
      />
    );
  }
  if (entry.type === "number") {
    return (
      <Stepper
        label={entry.label}
        value={typeof value === "number" ? value : entry.defaultValue}
        min={entry.min}
        max={entry.max}
        step={entry.step}
        onChange={(newValue) => {
          api.settingsValues.set(namespace, entry.key, newValue);
        }}
      />
    );
  }
  return (
    <TextField
      label={entry.label}
      value={typeof value === "string" ? value : entry.defaultValue}
      onChange={(newValue) => {
        api.settingsValues.set(namespace, entry.key, newValue);
      }}
    />
  );
});

/**
 * Generic settings UI: renders every contributed schema entry
 * (choice/boolean/text) with no per-extension code, grouped by
 * contributing extension. Changes hit the store immediately, so live
 * subscribers apply them without a restart.
 */
export function SettingsPanel({ api, open, onClose }: SettingsPanelProps): JSX.Element {
  const contributions = api.settings.all();
  return (
    <ModalSheet open={open} title="Settings" onClose={onClose}>
      {contributions.map((contribution) => (
        <section key={contribution.namespace} className="mdr-settings-section">
          <h3 className="mdr-settings-heading">{contribution.namespace}</h3>
          <div className="mdr-settings-group">
            {contribution.entries.map((entry) => (
              <div
                key={`${contribution.namespace}.${entry.key}`}
                className="mdr-setting-row"
              >
                <span className="mdr-setting-label">{entry.label}</span>
                <EntryControl
                  api={api}
                  namespace={contribution.namespace}
                  entry={entry}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </ModalSheet>
  );
}
