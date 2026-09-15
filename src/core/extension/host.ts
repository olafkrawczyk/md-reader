import type { ExtensionApi } from "./api";
import type { ExtensionDescriptor } from "./types";

export interface ActivationFailure {
  readonly id: string;
  readonly detail: string;
}

export interface ActivationReport {
  readonly activated: readonly string[];
  readonly failed: readonly ActivationFailure[];
}

/**
 * Activates each extension once, in descriptor order. A throwing (or
 * rejecting) activate is isolated: the failure is recorded and the remaining
 * extensions still activate.
 */
export async function activateExtensions(
  descriptors: readonly ExtensionDescriptor[],
  api: ExtensionApi,
): Promise<ActivationReport> {
  const activated: string[] = [];
  const failed: ActivationFailure[] = [];

  for (const descriptor of descriptors) {
    const id = descriptor.manifest.id;
    try {
      const extension = await descriptor.load();
      await extension.activate(api);
      activated.push(id);
    } catch (err) {
      failed.push({ id, detail: String(err) });
    }
  }

  return { activated, failed };
}
