import { createExtensionApi } from "./api";
import type { ExtensionApi } from "./api";
import { activateExtensions } from "./host";
import type { ActivationReport } from "./host";
import type { ExtensionDescriptor } from "./types";

export interface ExtensionRuntime {
  readonly api: ExtensionApi;
  readonly activation: Promise<ActivationReport>;
}

let runtime: ExtensionRuntime | null = null;

/**
 * Activates the built-in extensions exactly once per app run (module-level
 * singleton, so React StrictMode double-mounts are harmless). Returns the
 * existing runtime on subsequent calls.
 */
export function bootstrapExtensions(
  builtins: readonly ExtensionDescriptor[],
): ExtensionRuntime {
  if (runtime !== null) {
    return runtime;
  }
  const api = createExtensionApi();
  runtime = { api, activation: activateExtensions(builtins, api) };
  return runtime;
}
