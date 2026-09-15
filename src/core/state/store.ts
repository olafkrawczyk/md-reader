/**
 * The minimal contract a reactive store must satisfy to back React
 * subscription hooks: `get` MUST return a referentially stable snapshot
 * between mutations (cache derived collections; notify on change), and
 * `subscribe` MUST notify on every state change. Stores whose state is a
 * mutable object (documents) expose stable primitives (versions) instead.
 */
export interface StoreSource<T> {
  readonly get: () => T;
  readonly subscribe: (listener: (value: T) => void) => () => void;
}

export function storeSource<T>(
  get: () => T,
  subscribe: (listener: (value: T) => void) => () => void,
): StoreSource<T> {
  return { get, subscribe };
}
