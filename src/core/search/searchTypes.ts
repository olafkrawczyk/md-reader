import { serviceKey } from "../extension/serviceRegistry";
import type { FileEntry } from "../workspace/types";

/**
 * Search seams (design D1–D3): a replaceable provider service, a pane-side
 * target registry the find bar resolves against, and a UI controller the
 * app shell's ⌘F handler delegates to.
 */

export interface MatchState {
  /** Total matches for the active query in the targeted pane. */
  readonly count: number;
  /** 1-based index of the current match, or null when there is none. */
  readonly current: number | null;
}

/** One pane renderer's find session: the find bar drives exactly this. */
export interface SearchTarget {
  find(query: string): void;
  next(): void;
  prev(): void;
  /** Re-applies the active query after the pane's content changed. */
  refresh(): void;
  clear(): void;
  onState(handler: (state: MatchState) => void): () => void;
}

export type SearchTargetFactory = () => SearchTarget | null;

export interface SearchTargetResolution {
  readonly paneId: string;
  readonly target: SearchTarget;
}

export interface SearchTargetRegistry {
  register(paneId: string, factory: SearchTargetFactory): void;
  unregister(paneId: string): void;
  /**
   * Resolves the target for `preferredPaneId` (the focused pane), falling
   * back to the reader pane, then any registered document pane.
   */
  resolve(preferredPaneId: string | null): SearchTargetResolution | null;
}

export interface SearchCapabilities {
  readonly findInDocument: boolean;
  readonly fileNameFilter: boolean;
}

/**
 * The replaceable search provider. `createDocumentSearch` mediates session
 * creation for a pane target (the default provider returns it unchanged;
 * replacements may wrap it); `filterFileNames` returns a pruned tree of
 * entries whose names match the query at any depth.
 */
export interface SearchService {
  readonly capabilities: SearchCapabilities;
  createDocumentSearch(target: SearchTarget): SearchTarget;
  filterFileNames(
    entries: readonly FileEntry[],
    query: string,
  ): readonly FileEntry[];
}

export interface SearchUiController {
  openFind(): void;
}

export const searchProviderKey = serviceKey<SearchService>("mdr.search.provider");
export const effectiveSearchKey = serviceKey<SearchService>("mdr.search.effective");
export const searchTargetRegistryKey = serviceKey<SearchTargetRegistry>(
  "mdr.search.targets",
);
export const searchUiKey = serviceKey<SearchUiController>("mdr.search.ui");

const READER_PANE_ID = "reader";

export class SearchTargetRegistryImpl implements SearchTargetRegistry {
  readonly #factories = new Map<string, SearchTargetFactory>();

  register(paneId: string, factory: SearchTargetFactory): void {
    this.#factories.set(paneId, factory);
  }

  unregister(paneId: string): void {
    this.#factories.delete(paneId);
  }

  resolve(preferredPaneId: string | null): SearchTargetResolution | null {
    const fallbacks = [...this.#factories.keys()].filter(
      (paneId) => paneId !== READER_PANE_ID,
    );
    const order = [
      ...(preferredPaneId !== null ? [preferredPaneId] : []),
      READER_PANE_ID,
      ...fallbacks,
    ];
    for (const paneId of order) {
      const factory = this.#factories.get(paneId);
      if (factory === undefined) {
        continue;
      }
      const target = factory();
      if (target !== null) {
        return { paneId, target };
      }
    }
    return null;
  }
}
