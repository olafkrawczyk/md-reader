import type { ComponentType } from "react";

/**
 * Minimal v0 contribution registries so the extension API surface is
 * complete. The pane contract and settings rendering are refined by the
 * pane-engine and settings sections; expect these shapes to evolve.
 */

/**
 * @experimental v0 — panes currently take no props; the host contract is
 * derived from the three built-in panes before being declared stable.
 */
export type PaneComponent = ComponentType;
export interface PaneContribution {
  readonly id: string;
  readonly documentTypes: readonly string[];
  readonly component: PaneComponent;
}

export class PaneRegistry {
  readonly #panes = new Map<string, PaneContribution>();

  register(contribution: PaneContribution): void {
    this.#panes.set(contribution.id, contribution);
  }

  byId(id: string): PaneContribution | undefined {
    return this.#panes.get(id);
  }

  /** Panes that declared the given document type as viewable. */
  viewing(documentType: string): readonly PaneContribution[] {
    return this.all().filter((pane) => pane.documentTypes.includes(documentType));
  }

  all(): readonly PaneContribution[] {
    return [...this.#panes.values()];
  }
}

/** Layout preset as contributed data — core knows regions and pane slots, not modes. */
export interface LayoutPreset {
  readonly id: string;
  readonly mainPaneIds: readonly string[];
  readonly sidebarPaneId?: string;
  /** At most one contributed preset should set this; it wins when nothing was chosen yet. */
  readonly isDefault?: boolean;
}

export class PresetRegistry {
  readonly #presets = new Map<string, LayoutPreset>();

  register(preset: LayoutPreset): void {
    this.#presets.set(preset.id, preset);
  }

  all(): readonly LayoutPreset[] {
    return [...this.#presets.values()];
  }
}

export type SettingSchemaEntry =
  | {
      readonly key: string;
      readonly label: string;
      readonly type: "choice";
      readonly choices: readonly string[];
      readonly defaultValue: string;
    }
  | {
      readonly key: string;
      readonly label: string;
      readonly type: "boolean";
      readonly defaultValue: boolean;
    }
  | {
      readonly key: string;
      readonly label: string;
      readonly type: "text";
      readonly defaultValue: string;
    }
  | {
      readonly key: string;
      readonly label: string;
      readonly type: "number";
      readonly defaultValue: number;
      readonly min?: number;
      readonly max?: number;
      readonly step?: number;
    };

function validateSettingEntry(entry: SettingSchemaEntry): void {
  if (entry.type === "choice" && !entry.choices.includes(entry.defaultValue)) {
    throw new TypeError(
      `setting "${entry.key}": defaultValue "${entry.defaultValue}" is not among choices`,
    );
  }
  if (entry.type === "number") {
    if (!Number.isFinite(entry.defaultValue)) {
      throw new TypeError(`setting "${entry.key}": defaultValue must be a finite number`);
    }
    if ((entry.min !== undefined && !Number.isFinite(entry.min)) ||
      (entry.max !== undefined && !Number.isFinite(entry.max))) {
      throw new TypeError(`setting "${entry.key}": bounds must be finite numbers`);
    }
    if (entry.min !== undefined && entry.max !== undefined && entry.min > entry.max) {
      throw new TypeError(`setting "${entry.key}": min must not exceed max`);
    }
    if (entry.step !== undefined && (!Number.isFinite(entry.step) || entry.step <= 0)) {
      throw new TypeError(`setting "${entry.key}": step must be a positive finite number`);
    }
  }
}

export interface SettingsSchemaContribution {
  readonly namespace: string;
  readonly entries: readonly SettingSchemaEntry[];
}

export class SettingsSchemaRegistry {
  readonly #contributions = new Map<string, SettingsSchemaContribution>();

  register(contribution: SettingsSchemaContribution): void {
    for (const entry of contribution.entries) {
      validateSettingEntry(entry);
    }
    this.#contributions.set(contribution.namespace, contribution);
  }

  all(): readonly SettingsSchemaContribution[] {
    return [...this.#contributions.values()];
  }
}

/** Where contributed UI is rendered by the app shell. */
export type UiSlot = "toolbar" | "overlay";

export interface UiContribution {
  readonly id: string;
  readonly slot: UiSlot;
  readonly component: ComponentType;
}

export class UiRegistry {
  readonly #contributions = new Map<string, UiContribution>();

  register(contribution: UiContribution): void {
    this.#contributions.set(contribution.id, contribution);
  }

  bySlot(slot: UiSlot): readonly UiContribution[] {
    return [...this.#contributions.values()].filter(
      (contribution) => contribution.slot === slot,
    );
  }
}
