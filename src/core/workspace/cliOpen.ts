import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";

export interface CliOpen {
  readonly path: string;
  readonly kind: "file" | "folder";
}

function isCliOpen(value: unknown): value is CliOpen {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string" &&
    "kind" in value &&
    (value.kind === "file" || value.kind === "folder")
  );
}

/**
 * The path passed at launch, stored by the backend until the frontend is
 * ready to consume it. Only meaningful once, right after boot.
 */
export function takePendingCliOpen(): Promise<CliOpen | null> {
  return invoke<unknown>("take_pending_cli_open").then((payload) =>
    isCliOpen(payload) ? payload : null,
  );
}

/** Path handed to the already-running instance by a second invocation. */
export function onCliOpen(
  handler: (open: CliOpen) => void,
): Promise<UnlistenFn> {
  return listen<unknown>("cli-open", (event) => {
    if (isCliOpen(event.payload)) {
      handler(event.payload);
    }
  });
}
