import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { JSX } from "react";
import type { ExtensionApi, ExtensionDescriptor } from "../core/extension";
import { usePaneHost } from "../core/extension";
import { useService, useStoreValue } from "../core/state/storeHooks";
import { storeSource } from "../core/state/store";
import type { StoreSource } from "../core/state/store";
import { serviceKey } from "../core/extension";
import { mdOutlineCacheKey } from "./markdownContract";
import type { DocumentHeading } from "./markdownContract";
import type { Document } from "../core/workspace/document";
import { OutlineIcon } from "../core/ui/icons";
import { QuietButton } from "../core/ui/controls";

export interface OutlineJumpTarget {
  scrollToHeading(id: string, line: number): void;
}

export interface OutlineNavigationService {
  readonly activeHeadingId: string | null;
  readonly activeHeadingSource: StoreSource<string | null>;
  setActiveHeading(id: string | null): void;
  registerJumpTarget(target: OutlineJumpTarget): () => void;
  jumpToHeading(id: string, line: number): void;
}

export const outlineNavigationKey = serviceKey<OutlineNavigationService>("mdr.outline.navigation");

export class OutlineNavigationServiceImpl implements OutlineNavigationService {
  readonly #listeners = new Set<(id: string | null) => void>();
  readonly #jumpTargets = new Set<OutlineJumpTarget>();
  #activeHeadingId: string | null = null;

  get activeHeadingId(): string | null {
    return this.#activeHeadingId;
  }

  readonly activeHeadingSource: StoreSource<string | null> = storeSource(
    () => this.#activeHeadingId,
    (listener) => {
      this.#listeners.add(listener);
      return () => {
        this.#listeners.delete(listener);
      };
    },
  );

  setActiveHeading(id: string | null): void {
    if (this.#activeHeadingId === id) {
      return;
    }
    this.#activeHeadingId = id;
    for (const listener of this.#listeners) {
      listener(id);
    }
  }

  registerJumpTarget(target: OutlineJumpTarget): () => void {
    this.#jumpTargets.add(target);
    return () => {
      this.#jumpTargets.delete(target);
    };
  }

  jumpToHeading(id: string, line: number): void {
    this.setActiveHeading(id);
    for (const target of this.#jumpTargets) {
      target.scrollToHeading(id, line);
    }
  }
}

function useDocumentText(document: Document | null): string | null {
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      document === null ? () => undefined : document.subscribe(onStoreChange),
    [document],
  );
  const getSnapshot = useCallback(() => document?.text ?? null, [document]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

interface OutlineListProps {
  readonly headings: readonly DocumentHeading[];
  readonly activeHeadingId: string | null;
  readonly onSelect: (heading: DocumentHeading) => void;
}

export function OutlineList({ headings, activeHeadingId, onSelect }: OutlineListProps): JSX.Element {
  if (headings.length === 0) {
    return <div className="mdr-empty">No headings found.</div>;
  }

  return (
    <ul className="mdr-outline-list">
      {headings.map((heading) => {
        const isActive = activeHeadingId === heading.id;
        return (
          <li
            key={`${heading.id}-${heading.line}`}
            className="mdr-outline-item"
            data-level={heading.level}
            data-active={isActive}
            style={{ paddingLeft: `${(heading.level - 1) * 14 + 10}px` }}
          >
            <button
              type="button"
              className="mdr-outline-link"
              onClick={() => onSelect(heading)}
              title={heading.title}
            >
              <span className="mdr-outline-title">{heading.title}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function OutlinePane(api: ExtensionApi) {
  return function OutlinePane(): JSX.Element {
    // Sidebar-hosted panes are always routed `document: null` (App.tsx), so
    // this falls back to the router's active document; main-pane usage gets
    // the routed document directly.
    const routedDoc = usePaneHost().document;
    const activeDocFromRouter = useStoreValue(api.router.activeSource);
    const document = routedDoc ?? activeDocFromRouter;
    const text = useDocumentText(document);
    const outlineCache = useService(api.services, mdOutlineCacheKey);
    const nav = useService(api.services, outlineNavigationKey);
    const activeHeadingId = useStoreValue(
      nav?.activeHeadingSource ?? storeSource(() => null, () => () => {}),
    );

    const headings = useMemo<readonly DocumentHeading[]>(() => {
      if (!document || !outlineCache || text === null) {
        return [];
      }
      return outlineCache.get(document);
    }, [document, outlineCache, text]);

    const handleSelect = useCallback(
      (heading: DocumentHeading) => {
        nav?.jumpToHeading(heading.id, heading.line);
      },
      [nav],
    );

    if (!document) {
      return <div className="mdr-empty">No document open.</div>;
    }

    return (
      <nav className="mdr-outline" aria-label="Document Outline">
        <div className="mdr-outline-header">
          <span className="mdr-outline-header-title">Outline</span>
        </div>
        <div className="mdr-outline-body">
          <OutlineList
            headings={headings}
            activeHeadingId={activeHeadingId}
            onSelect={handleSelect}
          />
        </div>
      </nav>
    );
  };
}

function OutlineToolbarControl(api: ExtensionApi) {
  return function OutlineToolbarControl(): JSX.Element | null {
    const [open, setOpen] = useState(false);
    const activeDoc = useStoreValue(api.router.activeSource);
    const text = useDocumentText(activeDoc);
    const outlineCache = useService(api.services, mdOutlineCacheKey);
    const nav = useService(api.services, outlineNavigationKey);
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    const activeHeadingId = useStoreValue(
      nav?.activeHeadingSource ?? storeSource(() => null, () => () => {}),
    );

    const headings = useMemo<readonly DocumentHeading[]>(() => {
      if (!activeDoc || !outlineCache || text === null) {
        return [];
      }
      return outlineCache.get(activeDoc);
    }, [activeDoc, outlineCache, text]);

    const handleToggle = useCallback(() => {
      setOpen((prev) => !prev);
    }, []);

    const handleSelect = useCallback(
      (heading: DocumentHeading) => {
        nav?.jumpToHeading(heading.id, heading.line);
        setOpen(false);
      },
      [nav],
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

    if (!activeDoc) {
      return null;
    }

    return (
      <div ref={wrapperRef} className="mdr-outline-toolbar-wrapper">
        <QuietButton
          onClick={handleToggle}
          title="Document Outline"
        >
          <OutlineIcon />
        </QuietButton>
        {open && (
          <div className="mdr-outline-popover" role="dialog" aria-label="Outline">
            <div className="mdr-outline-popover-title">Document Outline</div>
            <div className="mdr-outline-popover-content">
              <OutlineList
                headings={headings}
                activeHeadingId={activeHeadingId}
                onSelect={handleSelect}
              />
            </div>
          </div>
        )}
      </div>
    );
  };
}

function activate(api: ExtensionApi): void {
  const navService = new OutlineNavigationServiceImpl();
  api.services.register(outlineNavigationKey, navService);

  api.panes.register({
    id: "outline",
    documentTypes: ["markdown"],
    component: OutlinePane(api),
  });

  api.ui.register({
    id: "outline-toggle",
    slot: "toolbar",
    component: OutlineToolbarControl(api),
  });
}

export const outlineExtension: ExtensionDescriptor = {
  manifest: {
    id: "@mdr/outline",
    displayName: "Outline",
    version: "0.1.0",
  },
  load: () => Promise.resolve({ activate }),
};
