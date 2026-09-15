import { autosave } from "../core/safety";
import type { ExtensionApi, ExtensionDescriptor } from "../core/extension";

const NAMESPACE = "document-safety";
const DEFAULT_DELAY_SECONDS = 1;

function activate(api: ExtensionApi): void {
  api.settings.register({
    namespace: NAMESPACE,
    entries: [
      {
        key: "autosave",
        label: "Autosave",
        type: "boolean",
        defaultValue: true,
      },
      {
        key: "autosaveDelay",
        label: "Autosave delay (seconds)",
        type: "number",
        defaultValue: DEFAULT_DELAY_SECONDS,
        min: 1,
        max: 60,
        step: 1,
      },
    ],
  });

  // Applied live: subscriptions fire on registration and on every change.
  const apply = (): void => {
    autosave.configure({
      enabled: api.settingsValues.getBoolean(NAMESPACE, "autosave", true),
      delayMs:
        api.settingsValues.getNumber(
          NAMESPACE,
          "autosaveDelay",
          DEFAULT_DELAY_SECONDS,
          { min: 1, max: 60 },
        ) * 1000,
    });
  };
  api.settingsValues.subscribe(NAMESPACE, "autosave", apply);
  api.settingsValues.subscribe(NAMESPACE, "autosaveDelay", apply);

  // Documents opened before activation are covered by the initial set;
  // later opens arrive through the workspace notification.
  autosave.start(
    (listener) => api.workspace.onDocumentOpened(listener),
    api.workspace.documents,
  );
}

export const documentSafetyExtension: ExtensionDescriptor = {
  manifest: {
    id: "@mdr/document-safety",
    displayName: "Document Safety",
    version: "0.1.0",
  },
  load: () => Promise.resolve({ activate }),
};
