import { useEffect, useState } from "react";
import type { JSX } from "react";
import { check } from "@tauri-apps/plugin-updater";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type { ExtensionDescriptor } from "../core/extension";

type Phase = "idle" | "installing" | "failed";

/**
 * Checks the GitHub Releases `latest.json` once at startup. A failed check
 * (offline, feed missing) is logged and stays silent: it must never block reading.
 */
function UpdateNotice(): JSX.Element | null {
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    check()
      .then(setUpdate)
      .catch((error: unknown) => {
        console.warn("Update check failed", error);
      });
  }, []);

  if (update === null) {
    return null;
  }

  const install = (): void => {
    setPhase("installing");
    update
      .downloadAndInstall()
      .then(() => relaunch())
      .catch((error: unknown) => {
        console.error("Update install failed", error);
        setPhase("failed");
      });
  };

  return (
    <div className="mdr-update-notice" role="status">
      <span>
        {phase === "failed"
          ? "Update failed. Try again later."
          : `md-reader ${update.version} is available (you have ${update.currentVersion}).`}
      </span>
      <button
        type="button"
        className="mdr-primary-button"
        disabled={phase === "installing"}
        onClick={install}
      >
        {phase === "installing" ? "Updating…" : "Update & Restart"}
      </button>
      <button
        type="button"
        className="mdr-update-dismiss"
        aria-label="Dismiss"
        disabled={phase === "installing"}
        onClick={() => setUpdate(null)}
      >
        ×
      </button>
    </div>
  );
}

export const updaterExtension: ExtensionDescriptor = {
  manifest: {
    id: "@mdr/updater",
    displayName: "Updater",
    version: "0.1.0",
  },
  load: () =>
    Promise.resolve({
      activate(api) {
        api.ui.register({ id: "update-notice", slot: "overlay", component: UpdateNotice });
      },
    }),
};
