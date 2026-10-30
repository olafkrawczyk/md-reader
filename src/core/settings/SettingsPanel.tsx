import { memo, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
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

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/**
 * Quiet offer, shown only when the login shell has no `md-reader` command.
 * Copying the command is the whole interaction — nothing is installed from here.
 */
function TerminalSetupNote({ open }: { readonly open: boolean }): JSX.Element | null {
  const [command, setCommand] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    invoke<{ command: string } | null>("terminal_setup").then(
      (setup) => {
        if (!cancelled) setCommand(setup?.command ?? null);
      },
      () => {
        if (!cancelled) setCommand(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  if (!command) return null;
  return (
    <div className="mdr-settings-terminal">
      <p>
        Open a folder from the terminal with <code>md-reader</code>.
      </p>
      <button
        type="button"
        onClick={() => {
          void copyText(command).then((ok) => {
            if (ok) setCopied(true);
          });
        }}
      >
        {copied ? "Copied" : "Copy setup command"}
      </button>
    </div>
  );
}

/**
 * Generic settings UI: renders every contributed schema entry
 * (choice/boolean/text) with no per-extension code, grouped by
 * contributing extension. Changes hit the store immediately, so live
 * subscribers apply them without a restart.
 */
export function SettingsPanel({ api, open, onClose }: SettingsPanelProps): JSX.Element {
  const contributions = api.settings.all();
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    getVersion().then(setVersion, (error: unknown) => {
      console.warn("Could not read app version", error);
    });
  }, []);
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
      <TerminalSetupNote open={open} />
      <p className="mdr-settings-version">md-reader {version ?? "…"}</p>
    </ModalSheet>
  );
}
