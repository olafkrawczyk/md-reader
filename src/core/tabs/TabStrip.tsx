import type { JSX, MouseEvent } from "react";
import { CloseIcon } from "../ui/icons";
import type { TabInfo } from "./tabStore";

interface TabStripProps {
  readonly tabs: readonly TabInfo[];
  readonly activePath: string | null;
  readonly onActivate: (path: string) => void;
  readonly onPromote: (path: string) => void;
  readonly onClose: (path: string) => void;
}

export function TabStrip({
  tabs,
  activePath,
  onActivate,
  onPromote,
  onClose,
}: TabStripProps): JSX.Element {
  function closeViaAuxClick(event: MouseEvent, path: string): void {
    if (event.button === 1) {
      event.preventDefault();
      onClose(path);
    }
  }
  return (
    <div className="mdr-tabstrip" role="tablist" aria-label="Open documents">
      {tabs.map((tab) => (
        <div
          key={tab.path}
          role="tab"
          aria-selected={tab.path === activePath}
          tabIndex={0}
          className="mdr-tab"
          data-active={tab.path === activePath}
          data-preview={tab.preview}
          title={tab.path}
          onClick={() => onActivate(tab.path)}
          onDoubleClick={() => onPromote(tab.path)}
          onAuxClick={(event) => closeViaAuxClick(event, tab.path)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onActivate(tab.path);
            }
          }}
        >
          <span className="mdr-tab-name">{tab.name}</span>
          {tab.dirty ? (
            <button
              type="button"
              className="mdr-tab-dirty"
              aria-label={`Close ${tab.name} with unsaved changes`}
              title="Unsaved changes — click to close"
              onClick={(event) => {
                event.stopPropagation();
                onClose(tab.path);
              }}
            />
          ) : (
            <button
              type="button"
              className="mdr-tab-close"
              aria-label={`Close ${tab.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onClose(tab.path);
              }}
            >
              <CloseIcon />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
