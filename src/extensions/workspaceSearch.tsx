import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { JSX } from "react";
import type { ExtensionApi, ExtensionDescriptor } from "../core/extension";
import { workspaceSearch } from "../core/workspace/bridge";
import type { WorkspaceSearchMatch } from "../core/workspace/bridge";
import { tabs } from "../core/tabs/tabStore";
import { useStoreValue } from "../core/state/storeHooks";
import { SearchIcon } from "../core/ui/icons";
import { QuietButton } from "../core/ui/controls";
import { outlineNavigationKey } from "./outline";
import { useService } from "../core/state/storeHooks";

const DEBOUNCE_MS = 200;
const MAX_RESULTS = 500;
const EMPTY_MATCHES: readonly WorkspaceSearchMatch[] = [];

interface GroupedMatches {
  readonly relativePath: string;
  readonly matches: readonly WorkspaceSearchMatch[];
}

function groupByFile(matches: readonly WorkspaceSearchMatch[]): readonly GroupedMatches[] {
  const groups: { relativePath: string; matches: WorkspaceSearchMatch[] }[] = [];
  let current: { relativePath: string; matches: WorkspaceSearchMatch[] } | null = null;
  for (const match of matches) {
    if (current === null || current.relativePath !== match.relativePath) {
      current = { relativePath: match.relativePath, matches: [] };
      groups.push(current);
    }
    current.matches.push(match);
  }
  return groups;
}

/** Renders a line with its match range wrapped for highlighting. */
function HighlightedLine({ match }: { readonly match: WorkspaceSearchMatch }): JSX.Element {
  const { lineContent, matchStart, matchEnd } = match;
  const before = lineContent.slice(0, matchStart);
  const hit = lineContent.slice(matchStart, matchEnd);
  const after = lineContent.slice(matchEnd);
  return (
    <span className="mdr-search-line">
      {before}
      <mark className="mdr-search-highlight">{hit}</mark>
      {after}
    </span>
  );
}

interface ResultsListProps {
  readonly groups: readonly GroupedMatches[];
  readonly onSelect: (match: WorkspaceSearchMatch) => void;
}

function ResultsList({ groups, onSelect }: ResultsListProps): JSX.Element {
  if (groups.length === 0) {
    return <div className="mdr-empty">No results found.</div>;
  }
  return (
    <div className="mdr-search-results">
      {groups.map((group) => (
        <div key={group.relativePath} className="mdr-search-group">
          <div className="mdr-search-group-header">{group.relativePath}</div>
          <ul className="mdr-search-matches">
            {group.matches.map((match, index) => (
              <li key={`${match.filePath}-${match.lineNumber}-${match.matchStart}-${index}`}>
                <button
                  type="button"
                  className="mdr-search-match"
                  onClick={() => onSelect(match)}
                >
                  <span className="mdr-search-line-number">{match.lineNumber}</span>
                  <HighlightedLine match={match} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

interface SearchState {
  readonly query: string;
  readonly matches: readonly WorkspaceSearchMatch[];
  readonly loading: boolean;
}

type SearchAction =
  | { readonly type: "queryUpdated"; readonly query: string }
  | { readonly type: "searchStarted" }
  | { readonly type: "resultsLoaded"; readonly matches: readonly WorkspaceSearchMatch[] }
  | { readonly type: "searchCleared" };

const initialSearchState: SearchState = {
  query: "",
  matches: EMPTY_MATCHES,
  loading: false,
};

function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case "queryUpdated":
      return { ...state, query: action.query };
    case "searchStarted":
      return { ...state, loading: true };
    case "resultsLoaded":
      return { ...state, matches: action.matches, loading: false };
    case "searchCleared":
      return { ...state, query: "", matches: EMPTY_MATCHES, loading: false };
  }
}

function useWorkspaceSearch(): {
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly matches: readonly WorkspaceSearchMatch[];
  readonly loading: boolean;
  readonly truncated: boolean;
} {
  const [state, dispatch] = useReducer(searchReducer, initialSearchState);
  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<number | null>(null);

  const onQueryChange = useCallback((query: string) => {
    dispatch({ type: "queryUpdated", query });
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }
    const trimmed = query.trim();
    if (trimmed === "") {
      dispatch({ type: "searchCleared" });
      return;
    }
    dispatch({ type: "searchStarted" });
    const requestId = ++requestIdRef.current;
    debounceTimerRef.current = window.setTimeout(() => {
      workspaceSearch(trimmed, false, MAX_RESULTS)
        .then((results) => {
          if (requestIdRef.current === requestId) {
            dispatch({ type: "resultsLoaded", matches: results });
          }
        })
        .catch((err: unknown) => {
          console.error("workspace search failed", err);
          if (requestIdRef.current === requestId) {
            dispatch({ type: "resultsLoaded", matches: EMPTY_MATCHES });
          }
        });
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    query: state.query,
    onQueryChange,
    matches: state.matches,
    loading: state.loading,
    truncated: state.matches.length >= MAX_RESULTS,
  };
}

function useMatchSelection(api: ExtensionApi) {
  const outlineNav = useService(api.services, outlineNavigationKey);
  return useCallback(
    (match: WorkspaceSearchMatch) => {
      // Tab first, then the line jump — parked by the nav service until the
      // opened document's panes have rendered, so no timing assumption here.
      tabs
        .open(match.filePath)
        .then(() => {
          outlineNav?.jumpToHeading(
            `search:${match.lineNumber}`,
            match.lineNumber,
            match.filePath,
          );
        })
        .catch((err: unknown) => {
          console.error("failed to open search result", match.filePath, err);
        });
    },
    [outlineNav],
  );
}

function WorkspaceSearchPane(api: ExtensionApi) {
  return function WorkspaceSearchPane(): JSX.Element {
    const { query, onQueryChange, matches, loading, truncated } = useWorkspaceSearch();
    const groups = useMemo(() => groupByFile(matches), [matches]);
    const handleSelect = useMatchSelection(api);

    return (
      <nav className="mdr-workspace-search" aria-label="Workspace Search">
        <div className="mdr-workspace-search-header">
          <input
            type="text"
            className="mdr-workspace-search-input"
            placeholder="Search workspace…"
            aria-label="Search workspace"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            autoFocus
          />
        </div>
        <div className="mdr-workspace-search-body">
          {loading ? (
            <div className="mdr-empty">Searching…</div>
          ) : (
            <>
              {truncated && (
                <div className="mdr-search-truncated">Showing first 500 matches.</div>
              )}
              <ResultsList groups={groups} onSelect={handleSelect} />
            </>
          )}
        </div>
      </nav>
    );
  };
}

function WorkspaceSearchToolbarControl(api: ExtensionApi) {
  return function WorkspaceSearchToolbarControl(): JSX.Element | null {
    const [open, setOpen] = useState(false);
    const workspaceRoot = useStoreValue(api.workspace.treeSource);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const { query, onQueryChange, matches, loading, truncated } = useWorkspaceSearch();
    const groups = useMemo(() => groupByFile(matches), [matches]);
    const handleSelect = useMatchSelection(api);

    const handleToggle = useCallback(() => {
      setOpen((prev) => !prev);
    }, []);

    const wrappedSelect = useCallback(
      (match: WorkspaceSearchMatch) => {
        handleSelect(match);
        setOpen(false);
      },
      [handleSelect],
    );

    useEffect(() => {
      if (!open) return;
      function handlePointerDown(event: PointerEvent) {
        const element = wrapperRef.current;
        if (
          element !== null &&
          event.target instanceof Node &&
          !element.contains(event.target)
        ) {
          setOpen(false);
        }
      }
      function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") {
          setOpen(false);
        }
      }
      document.addEventListener("pointerdown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("pointerdown", handlePointerDown);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, [open]);

    if (workspaceRoot.length === 0 && api.workspace.root === null) {
      return null;
    }

    return (
      <div ref={wrapperRef} className="mdr-workspace-search-toolbar-wrapper">
        <QuietButton onClick={handleToggle} title="Search Workspace">
          <SearchIcon />
        </QuietButton>
        {open && (
          <div className="mdr-workspace-search-popover" role="dialog" aria-label="Workspace Search">
            <div className="mdr-workspace-search-popover-header">
              <input
                type="text"
                className="mdr-workspace-search-input"
                placeholder="Search workspace…"
                aria-label="Search workspace"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                autoFocus
              />
            </div>
            <div className="mdr-workspace-search-popover-content">
              {loading ? (
                <div className="mdr-empty">Searching…</div>
              ) : (
                <>
                  {truncated && (
                    <div className="mdr-search-truncated">Showing first 500 matches.</div>
                  )}
                  <ResultsList groups={groups} onSelect={wrappedSelect} />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };
}

function activate(api: ExtensionApi): void {
  api.panes.register({
    id: "workspace-search",
    documentTypes: [],
    component: WorkspaceSearchPane(api),
  });

  api.ui.register({
    id: "workspace-search-toggle",
    slot: "toolbar",
    component: WorkspaceSearchToolbarControl(api),
  });
}

export const workspaceSearchExtension: ExtensionDescriptor = {
  manifest: {
    id: "@mdr/workspace-search",
    displayName: "Workspace Search",
    version: "0.1.0",
  },
  load: () => Promise.resolve({ activate }),
};
