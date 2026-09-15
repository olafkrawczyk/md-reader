/**
 * Proof of the service's payload type. The id is the runtime key; the
 * phantom `serviceType` slot keeps the payload type on the key so
 * register/consume calls are checked against each other.
 */
export interface ServiceKey<T> {
  readonly id: string;
  readonly serviceType?: (service: T) => T;
}

export function serviceKey<T>(id: string): ServiceKey<T> {
  return { id };
}

export interface ServiceRegistry {
  /**
   * Registers (or replaces) the service under `key`. Existing consumers are
   * notified immediately, so re-registration acts as a live update.
   */
  register<T>(key: ServiceKey<T>, service: T): void;

  /**
   * Fires `onAvailable` right away if the service already exists, and again
   * every time it is (re-)registered — activation order across extensions
   * is not guaranteed. Returns an unsubscribe function.
   */
  consume<T>(key: ServiceKey<T>, onAvailable: (service: T) => void): () => void;
}

// Consumers are stored behind a method-syntax view so the typed callback
// (service: T) => void is assignable to the type-erased (service: unknown)
// => void via method-parameter bivariance — no assertion needed.
interface StoredConsumer {
  onService(service: unknown): void;
}

export class ServiceRegistryImpl implements ServiceRegistry {
  readonly #services = new Map<string, unknown>();
  readonly #consumers = new Map<string, Array<StoredConsumer>>();

  register<T>(key: ServiceKey<T>, service: T): void {
    this.#services.set(key.id, service);
    for (const consumer of this.#consumers.get(key.id) ?? []) {
      consumer.onService(service);
    }
  }

  consume<T>(key: ServiceKey<T>, onAvailable: (service: T) => void): () => void {
    const consumer: StoredConsumer = {
      onService(service: T): void {
        onAvailable(service);
      },
    };
    const consumers = this.#consumers.get(key.id) ?? [];
    consumers.push(consumer);
    this.#consumers.set(key.id, consumers);

    if (this.#services.has(key.id)) {
      consumer.onService(this.#services.get(key.id));
    }

    return () => {
      const list = this.#consumers.get(key.id);
      if (!list) {
        return;
      }
      const index = list.indexOf(consumer);
      if (index >= 0) {
        list.splice(index, 1);
      }
    };
  }
}
