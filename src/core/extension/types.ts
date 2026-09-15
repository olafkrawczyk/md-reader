import type { ExtensionApi } from "./api";

export interface ExtensionManifest {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
}

export interface ExtensionModule {
  activate(api: ExtensionApi): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

/**
 * Where an extension's module comes from. Built-ins pass a bundler-resolved
 * dynamic import; future external extensions pass an `mdext://` import of the
 * same shape, so the host never distinguishes the two.
 */
export type ExtensionModuleSource = () => Promise<ExtensionModule>;

export interface ExtensionDescriptor {
  readonly manifest: ExtensionManifest;
  readonly load: ExtensionModuleSource;
}
