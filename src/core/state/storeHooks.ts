import { useCallback, useRef, useSyncExternalStore } from "react";
import type { ServiceKey, ServiceRegistry } from "../extension/serviceRegistry";
import type { StoreSource } from "./store";

/**
 * React-side consumption of external stores (design D2): subscription hooks
 * instead of hand-written subscribe/useState/unsubscribe effect triples.
 * The store contract lives in ./store — in particular, snapshots returned
 * by `source.get()` (and by `select`, when provided) must be referentially
 * stable between store notifications, or React reports an unstable
 * getSnapshot.
 */

function useStoreSubscription<T>(source: StoreSource<T>): (onStoreChange: () => void) => () => void {
  return useCallback(
    (onStoreChange: () => void) => source.subscribe(onStoreChange),
    [source],
  );
}

/** Reads the whole store value; re-renders on every store change. */
export function useStoreValue<T>(source: StoreSource<T>): T {
  const subscribe = useStoreSubscription(source);
  const getSnapshot = useCallback(() => source.get(), [source]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Reads a selected projection of the store value; see the stability contract. */
export function useStoreSelection<T, S>(
  source: StoreSource<T>,
  select: (value: T) => S,
): S {
  const subscribe = useStoreSubscription(source);
  const getSnapshot = useCallback(() => select(source.get()), [source, select]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Reads a service from the registry reactively: null until the service is
 * registered, the service afterwards, updated live on re-registration.
 * Services are referenced from a ref because the registry has no read API
 * — registration and notification arrive together.
 */
export function useService<T>(
  registry: ServiceRegistry,
  key: ServiceKey<T>,
): T | null {
  const serviceRef = useRef<T | null>(null);
  const getSnapshot = useCallback(() => serviceRef.current, []);
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      registry.consume(key, (service) => {
        serviceRef.current = service;
        onStoreChange();
      }),
    [registry, key],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}
