import { useCallback, useEffect, useReducer, useRef } from "react";
import type { JSX } from "react";
import type { ExtensionApi, ExtensionDescriptor } from "../core/extension";
import { getFocusedPaneId } from "../core/panes/paneHost";
import {
  CloseIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "../core/ui/icons";
import { QuietButton } from "../core/ui/controls";
import { useService } from "../core/state/storeHooks";
import {
  effectiveSearchKey,
  searchProviderKey,
  searchTargetRegistryKey,
  searchUiKey,
  SearchTargetRegistryImpl,
} from "../core/search/searchTypes";
import type {
  MatchState,
  SearchService,
  SearchTarget,
} from "../core/search/searchTypes";
import type { FileEntry } from "../core/workspace/types";

// ---------------------------------------------------------------------------
// Default provider: in-memory filename filtering. Document find is delegated
// to the pane renderers themselves (CodeMirror / DOM highlighting), so
// `createDocumentSearch` returns the pane's target unchanged.
// ---------------------------------------------------------------------------

function pruneTree(
  entries: readonly FileEntry[],
  query: string,
): readonly FileEntry[] {
  const result: FileEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === "file") {
      if (entry.name.toLowerCase().includes(query)) {
        result.push(entry);
      }
      continue;
    }
    if (entry.children === undefined) {
      result.push(entry);
      continue;
    }
    const children = pruneTree(entry.children, query);
    if (children.length > 0) {
      result.push({ ...entry, children });
    }
  }
  return result;
}

export const defaultSearchProvider: SearchService = {
  capabilities: { findInDocument: true, fileNameFilter: true },
  createDocumentSearch: (target) => target,
  filterFileNames: (entries, query) => {
    const normalized = query.trim().toLowerCase();
    if (normalized === "") {
      return entries;
    }
    return pruneTree(entries, normalized);
  },
};

/**
 * Merges the latest provider per capability (design D1): a replacement that
 * only declares `findInDocument` replaces document find while filename
 * filtering keeps the previous provider.
 */
function activateProviderMerge(api: ExtensionApi): void {
  let findProvider: SearchService | null = null;
  let filterProvider: SearchService | null = null;
  api.services.consume(searchProviderKey, (service) => {
    if (service.capabilities.findInDocument) {
      findProvider = service;
    }
    if (service.capabilities.fileNameFilter) {
      filterProvider = service;
    }
    const mergedFind = findProvider;
    const mergedFilter = filterProvider;
    api.services.register(effectiveSearchKey, {
      capabilities: {
        findInDocument: mergedFind !== null,
        fileNameFilter: mergedFilter !== null,
      },
      createDocumentSearch: (target) =>
        mergedFind === null ? target : mergedFind.createDocumentSearch(target),
      filterFileNames: (entries, query) =>
        mergedFilter === null ? entries : mergedFilter.filterFileNames(entries, query),
    });
  });
}

// ---------------------------------------------------------------------------
// Find bar: one Safari-style bar over the content area, driving the resolved
// pane's SearchTarget.
// ---------------------------------------------------------------------------

class FindBarController {
  #onOpen: (() => void) | null = null;

  openFind(): void {
    this.#onOpen?.();
  }

  set onOpen(handler: (() => void) | null) {
    this.#onOpen = handler;
  }
}

function countText(query: string, state: MatchState): string {
  if (query === "") {
    return "";
  }
  if (state.count === 0) {
    return "No matches";
  }
  return `${state.current ?? 0} of ${state.count}`;
}

// Find bar state as one typed state machine (react-state-architecture:
// state budget). Everything the old version mirrored into refs — whether
// the bar is open, the standing query, the resolved pane — lives here.
interface FindBarState {
  readonly open: boolean;
  readonly query: string;
  readonly target: SearchTarget | null;
  readonly paneId: string | null;
  readonly matchState: MatchState;
}

type FindBarAction =
  | { readonly type: "opened"; readonly target: SearchTarget; readonly paneId: string }
  | { readonly type: "closed" }
  | { readonly type: "queryChanged"; readonly query: string }
  | { readonly type: "matchStateChanged"; readonly matchState: MatchState };

const noMatches: MatchState = { count: 0, current: null };

const initialFindBarState: FindBarState = {
  open: false,
  query: "",
  target: null,
  paneId: null,
  matchState: noMatches,
};

function findBarReducer(
  state: FindBarState,
  action: FindBarAction,
): FindBarState {
  switch (action.type) {
    case "opened":
      return { ...state, open: true, target: action.target, paneId: action.paneId };
    case "closed":
      return initialFindBarState;
    case "queryChanged":
      return { ...state, query: action.query };
    case "matchStateChanged":
      return { ...state, matchState: action.matchState };
  }
}

function FindBar(api: ExtensionApi, controller: FindBarController) {
  return function FindBar(): JSX.Element | null {
    const [state, dispatch] = useReducer(findBarReducer, initialFindBarState);
    const registry = useService(api.services, searchTargetRegistryKey);
    const inputRef = useRef<HTMLInputElement | null>(null);

    // Rebinds the match-state listener whenever the resolved target changes
    // and re-applies the standing query; cleanup clears the outgoing
    // target's highlights. (Synchronizes React state with the imperative
    // search target — a legitimate external system, not a mirror.)
    useEffect(() => {
      const target = state.target;
      if (target === null) {
        return;
      }
      const unsubscribe = target.onState((matchState) => {
        dispatch({ type: "matchStateChanged", matchState });
      });
      if (state.query === "") {
        target.clear();
      } else {
        target.find(state.query);
      }
      return () => {
        unsubscribe();
        target.clear();
      };
      // The effect must re-run only when the binding identity changes; the
      // query re-application reads the latest state via the closure below.
    }, [state.target, state.query]);

    const handleOpen = useCallback(() => {
      if (api.router.active === null) {
        return;
      }
      // ⌘F while the bar is already open and no pane holds focus (the bar
      // itself does): keep the current target, just refocus the field.
      if (state.open && getFocusedPaneId() === null) {
        inputRef.current?.focus();
        return;
      }
      if (registry === null) {
        return;
      }
      const resolution = registry.resolve(getFocusedPaneId());
      if (resolution === null) {
        return;
      }
      dispatch({ type: "opened", target: resolution.target, paneId: resolution.paneId });
    }, [registry, state.open]);

    useEffect(() => {
      controller.onOpen = handleOpen;
      return () => {
        controller.onOpen = null;
      };
    }, [handleOpen]);

    if (!state.open) {
      return null;
    }

    function close(): void {
      const paneId = state.paneId;
      dispatch({ type: "closed" });
      if (paneId !== null) {
        document
          .querySelector<HTMLElement>(`[data-pane-id="${paneId}"]`)
          ?.focus();
      }
    }

    function applyQuery(next: string): void {
      dispatch({ type: "queryChanged", query: next });
    }

    const { target } = state;

    return (
      <div className="mdr-findbar" role="search" aria-label="Find in document">
        <input
          ref={inputRef}
          className="mdr-findbar-input"
          type="text"
          placeholder="Find"
          aria-label="Find in document"
          autoFocus
          value={state.query}
          onChange={(event) => applyQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close();
              return;
            }
            if (event.key === "Enter" && event.shiftKey) {
              event.preventDefault();
              target?.prev();
              return;
            }
            if (event.key === "Enter" || event.key === "ArrowDown") {
              event.preventDefault();
              target?.next();
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              target?.prev();
            }
          }}
        />
        <span className="mdr-findbar-count">{countText(state.query, state.matchState)}</span>
        <QuietButton onClick={() => target?.prev()} title="Previous match">
          <ChevronUpIcon />
        </QuietButton>
        <QuietButton onClick={() => target?.next()} title="Next match">
          <ChevronDownIcon />
        </QuietButton>
        <QuietButton onClick={close} title="Close find bar">
          <CloseIcon />
        </QuietButton>
      </div>
    );
  };
}

// ---------------------------------------------------------------------------

function activate(api: ExtensionApi): void {
  api.services.register(searchProviderKey, defaultSearchProvider);
  activateProviderMerge(api);
  api.services.register(searchTargetRegistryKey, new SearchTargetRegistryImpl());

  const controller = new FindBarController();
  api.services.register(searchUiKey, {
    openFind: () => controller.openFind(),
  });
  api.ui.register({
    id: "find-bar",
    slot: "overlay",
    component: FindBar(api, controller),
  });
}

export const searchExtension: ExtensionDescriptor = {
  manifest: {
    id: "@mdr/search",
    displayName: "Search",
    version: "0.1.0",
  },
  load: () => Promise.resolve({ activate }),
};
