import * as React from "react";
import { ServiceRegistryImpl } from "./serviceRegistry";
import type { ServiceRegistry } from "./serviceRegistry";
import { TransformerRegistry } from "./transformerRegistry";
import {
  PaneRegistry,
  PresetRegistry,
  SettingsSchemaRegistry,
  UiRegistry,
} from "./contributionRegistries";
import { DocumentRouter } from "../panes/router";
import { LayoutState } from "../panes/layoutState";
import { SettingsStore } from "../settings/settingsStore";
import { workspace } from "../workspace/workspace";

/**
 * The public extension API.
 *
 * @unstable The surface is still growing while the built-in pack is
 * completed; expect additions and reshaping until it is frozen.
 */
export interface ExtensionApi {
  /** Core's single React instance — extensions must not bundle their own. */
  readonly react: typeof React;
  readonly services: ServiceRegistry;
  readonly transformers: TransformerRegistry;
  readonly panes: PaneRegistry;
  readonly presets: PresetRegistry;
  readonly settings: SettingsSchemaRegistry;
  readonly ui: UiRegistry;
  /** Active workspace: tree, document open/save, document type claims. */
  readonly workspace: typeof workspace;
  /** Document routing: panes and the layout follow the active document. */
  readonly router: DocumentRouter;
  /** Which contributed layout preset is active. */
  readonly layout: LayoutState;
  /** Namespaced KV values behind the contributed settings schemas. */
  readonly settingsValues: SettingsStore;
}

export interface ExtensionRegistries {
  readonly panes: PaneRegistry;
  readonly presets: PresetRegistry;
  readonly settings: SettingsSchemaRegistry;
}

export function createExtensionApi(): ExtensionApi {
  return {
    react: React,
    services: new ServiceRegistryImpl(),
    transformers: new TransformerRegistry(),
    panes: new PaneRegistry(),
    presets: new PresetRegistry(),
    settings: new SettingsSchemaRegistry(),
    ui: new UiRegistry(),
    workspace,
    router: new DocumentRouter(),
    layout: new LayoutState(),
    settingsValues: new SettingsStore(),
  };
}
