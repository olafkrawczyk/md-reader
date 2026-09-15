import type { LayoutPreset } from "../extension/contributionRegistries";
import { storeSource } from "../state/store";
import type { StoreSource } from "../state/store";

type ActivePresetListener = (presetId: string | null) => void;

/**
 * Which contributed layout preset is currently active. Kept in core state
 * (not component state) so documents and layout survive preset switches
 * and contributed UI (the preset switcher) can drive it.
 */
export class LayoutState {
  readonly #listeners = new Set<ActivePresetListener>();
  #activeId: string | null = null;

  get activePresetId(): string | null {
    return this.#activeId;
  }

  /** Reactive view of the active preset for subscription hooks. */
  readonly presetSource: StoreSource<string | null> = storeSource(
    () => this.activePresetId,
    (listener) => this.subscribe(listener),
  );

  setPreset(presetId: string): void {
    this.#activeId = presetId;
    for (const listener of this.#listeners) {
      listener(presetId);
    }
  }

  /** Activates the default contributed preset, if one exists. */
  activateDefault(presets: readonly LayoutPreset[]): void {
    if (this.#activeId !== null) {
      return;
    }
    const fallback = presets.find((preset) => preset.isDefault === true) ?? presets[0];
    if (fallback) {
      this.setPreset(fallback.id);
    }
  }

  subscribe(listener: ActivePresetListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}

/**
 * Session-scoped divider positions for split layouts, keyed by the slot
 * signature. Replaces the former bare module-level Map so the shared
 * mutable state has an explicit, typed store API (react-state-architecture:
 * no undocumented module-level mutable state).
 */
export class SplitFractionStore {
  readonly #listeners = new Set<() => void>();
  readonly #fractions = new Map<string, readonly number[]>();

  get(signature: string): readonly number[] | null {
    return this.#fractions.get(signature) ?? null;
  }

  set(signature: string, fractions: readonly number[]): void {
    this.#fractions.set(signature, fractions);
    for (const listener of this.#listeners) {
      listener();
    }
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}

/** Session singleton: divider positions survive pane remounts. */
export const splitFractions = new SplitFractionStore();
