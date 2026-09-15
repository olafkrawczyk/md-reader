import { storeSource } from "../state/store";
import type { StoreSource } from "../state/store";
import type { SettingSchemaEntry } from "../extension/contributionRegistries";

export type SettingValue = string | number | boolean;

export interface NumberBounds {
  readonly min?: number | undefined;
  readonly max?: number | undefined;
}

type SettingListener = (value: SettingValue | null) => void;

const STORAGE_KEY = "md-reader:settings";

function isSettingValue(value: unknown): value is SettingValue {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function clampNumber(value: number, bounds: NumberBounds | undefined): number {
  let result = value;
  if (bounds?.min !== undefined) {
    result = Math.max(bounds.min, result);
  }
  if (bounds?.max !== undefined) {
    result = Math.min(bounds.max, result);
  }
  return result;
}

function loadStored(): Map<string, SettingValue> {
  const values = new Map<string, SettingValue>();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return values;
    }
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object") {
      for (const [key, value] of Object.entries(parsed)) {
        if (isSettingValue(value)) {
          values.set(key, value);
        }
      }
    }
  } catch {
    // Unreadable storage falls back to defaults; nothing to recover.
  }
  return values;
}

/**
 * Namespaced KV store behind the schema contributions. Values persist to
 * localStorage and changes notify subscribers immediately, so settings
 * apply live without a restart.
 */
export class SettingsStore {
  readonly #values: Map<string, SettingValue>;
  readonly #listeners = new Map<string, Set<SettingListener>>();

  constructor() {
    this.#values = loadStored();
  }

  /** Raw stored value, or null when unset. Reactive sources build on this. */
  get(namespace: string, key: string): SettingValue | null {
    return this.#values.get(`${namespace}.${key}`) ?? null;
  }

  /**
   * Reactive view of one setting, resolved through the typed getters
   * (including number clamping) that the schema entry declares.
   */
  settingSource(
    namespace: string,
    entry: SettingSchemaEntry,
  ): StoreSource<SettingValue> {
    const read = (): SettingValue => {
      switch (entry.type) {
        case "choice":
        case "text":
          return this.getString(namespace, entry.key, entry.defaultValue);
        case "boolean":
          return this.getBoolean(namespace, entry.key, entry.defaultValue);
        case "number":
          return this.getNumber(namespace, entry.key, entry.defaultValue, {
            min: entry.min,
            max: entry.max,
          });
      }
    };
    return storeSource(read, (listener) =>
      this.subscribe(namespace, entry.key, () => listener(read())),
    );
  }

  getString(namespace: string, key: string, defaultValue: string): string {
    const stored = this.#values.get(`${namespace}.${key}`);
    return typeof stored === "string" ? stored : defaultValue;
  }

  getBoolean(namespace: string, key: string, defaultValue: boolean): boolean {
    const stored = this.#values.get(`${namespace}.${key}`);
    return typeof stored === "boolean" ? stored : defaultValue;
  }

  /** Reads a number value, clamping stored and default to the bounds. */
  getNumber(
    namespace: string,
    key: string,
    defaultValue: number,
    bounds?: NumberBounds,
  ): number {
    const stored = this.#values.get(`${namespace}.${key}`);
    const value = typeof stored === "number" ? stored : defaultValue;
    return clampNumber(value, bounds);
  }

  set(namespace: string, key: string, value: SettingValue): void {
    this.#values.set(`${namespace}.${key}`, value);
    this.#persist();
    this.#notify(namespace, key);
  }

  subscribe(namespace: string, key: string, listener: SettingListener): () => void {
    const storageKey = `${namespace}.${key}`;
    const listeners = this.#listeners.get(storageKey) ?? new Set<SettingListener>();
    listeners.add(listener);
    this.#listeners.set(storageKey, listeners);
    listener(this.#values.get(storageKey) ?? null);
    return () => {
      listeners.delete(listener);
    };
  }

  #notify(namespace: string, key: string): void {
    const storageKey = `${namespace}.${key}`;
    const value = this.#values.get(storageKey) ?? null;
    for (const listener of this.#listeners.get(storageKey) ?? []) {
      listener(value);
    }
  }

  #persist(): void {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Object.fromEntries(this.#values)),
      );
    } catch {
      // Persistence is best-effort; live behavior is unaffected.
    }
  }
}
