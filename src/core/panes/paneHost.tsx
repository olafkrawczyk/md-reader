import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, JSX } from "react";
import type { Document } from "../workspace/document";
import type { PaneContribution } from "../extension/contributionRegistries";

/**
 * The pane host contract, v0.
 *
 * @experimental The surface is derived from the three built-in panes
 * (sidebar, editor, reader) and will be revisited — possibly reshaped —
 * before it is documented as stable. Do not build external panes against
 * it yet.
 */
export interface PaneHostValue {
  /** The document routed to this pane, or null when nothing is open. */
  readonly document: Document | null;
  /** Whether this pane currently holds the focus within the layout. */
  readonly focused: boolean;
  /** Moves DOM focus into the pane container. */
  requestFocus(): void;
  /**
   * Keyboard routing v0: a focused pane may install a single keydown
   * handler on its container. Returning nothing leaves default behavior.
   */
  setKeyHandler(handler: ((event: KeyboardEvent) => void) | null): void;
}

const PaneHostContext = createContext<PaneHostValue | null>(null);

/**
 * Which pane currently holds focus, shared across the layout (chrome like
 * the find bar resolves which pane the user is working in). Focus moving
 * into pane-internal content (e.g. the editor's CodeMirror) still counts:
 * React focus events bubble from descendants.
 */
class PaneFocusStore {
  #focusedPaneId: string | null = null;
  readonly #listeners = new Set<(paneId: string | null) => void>();

  get focusedPaneId(): string | null {
    return this.#focusedPaneId;
  }

  set(paneId: string | null): void {
    if (this.#focusedPaneId === paneId) {
      return;
    }
    this.#focusedPaneId = paneId;
    for (const listener of this.#listeners) {
      listener(paneId);
    }
  }

  subscribe(listener: (paneId: string | null) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}

/** Session singleton; subscribe/read API per the store contract. */
const paneFocus = new PaneFocusStore();

export function getFocusedPaneId(): string | null {
  return paneFocus.focusedPaneId;
}

export function subscribeFocusedPane(
  listener: (paneId: string | null) => void,
): () => void {
  return paneFocus.subscribe(listener);
}

export function usePaneHost(): PaneHostValue {
  const value = useContext(PaneHostContext);
  if (value === null) {
    throw new Error("usePaneHost must be used inside a pane");
  }
  return value;
}

interface PaneViewProps {
  readonly pane: PaneContribution;
  readonly document: Document | null;
}

/**
 * Hosts a pane component: owns focus state and key routing on the pane
 * container, exposes the host contract via context.
 */
export function PaneView({ pane, document }: PaneViewProps): JSX.Element {
  const Component: ComponentType = pane.component;
  return <PaneContainer paneId={pane.id} document={document} component={Component} />;
}

interface PaneContainerProps {
  readonly paneId: string;
  readonly document: Document | null;
  readonly component: ComponentType;
}

function PaneContainer({ paneId, document, component }: PaneContainerProps): JSX.Element {
  const Component = component;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const keyHandlerRef = useRef<((event: KeyboardEvent) => void) | null>(null);
  const [focused, setFocused] = useState(false);

  // Stable identities: consumers re-render only when focus or document
  // changes, not on every container render.
  const requestFocus = useCallback(() => {
    containerRef.current?.focus();
  }, []);
  const setKeyHandler = useCallback((handler: ((event: KeyboardEvent) => void) | null) => {
    keyHandlerRef.current = handler;
  }, []);
  const host: PaneHostValue = useMemo(
    () => ({
      document,
      focused,
      requestFocus,
      setKeyHandler,
    }),
    [document, focused, requestFocus, setKeyHandler],
  );

  // The key handler belongs to the routed document: a new document starts
  // with no handler. (Syncs the imperative handler registry with props.)
  useEffect(() => {
    keyHandlerRef.current = null;
  }, [document]);

  return (
    <PaneHostContext.Provider value={host}>
      <div
        key={paneId}
        ref={containerRef}
        className="mdr-pane"
        data-pane-id={paneId}
        data-focused={focused}
        tabIndex={0}
        onFocus={() => {
          setFocused(true);
          paneFocus.set(paneId);
        }}
        onBlur={() => {
          setFocused(false);
          if (getFocusedPaneId() === paneId) {
            paneFocus.set(null);
          }
        }}
        onKeyDown={(event) => {
          keyHandlerRef.current?.(event.nativeEvent);
        }}
      >
        <Component />
      </div>
    </PaneHostContext.Provider>
  );
}
