import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import type { ExtensionApi } from "../extension/api";
import { ModalSheet } from "./controls";
import { useService, useStoreValue } from "../state/storeHooks";
import { linkIndexKey, openAtFragment, splitTarget } from "../../extensions/links";
import type { TargetCompletion } from "../../extensions/links";
import { outlineNavigationKey } from "../../extensions/outline";
import { mdOutlineCacheKey } from "../../extensions/markdownContract";
import { tabs } from "../tabs/tabStore";

interface QuickOpenProps {
  readonly api: ExtensionApi;
  readonly open: boolean;
  readonly onClose: () => void;
}

export function scoreMatch(query: string, label: string): number | null {
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  if (q === "") return 0;
  let labelIdx = 0, queryIdx = 0, score = 0, consecutiveBonus = 0;
  while (queryIdx < q.length && labelIdx < l.length) {
    if (l[labelIdx] === q[queryIdx]) {
      score += 1 + consecutiveBonus;
      consecutiveBonus += 0.5;
      queryIdx++;
    } else {
      consecutiveBonus = 0;
    }
    labelIdx++;
  }
  return queryIdx < q.length ? null : (l.startsWith(q) ? score + 10 : score);
}

export function QuickOpen({ api, open, onClose }: QuickOpenProps): JSX.Element {
  const linkIndex = useService(api.services, linkIndexKey);
  const outlineNav = useService(api.services, outlineNavigationKey);
  const outlineCache = useService(api.services, mdOutlineCacheKey);
  const [state, setState] = useState({ query: "", selectedIndex: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const tree = useStoreValue(api.workspace.treeSource);
  const all = useMemo(() => linkIndex?.getTargetCompletions() ?? [], [linkIndex, tree, open]);

  const filtered = useMemo(() => {
    const base = state.query.split("#")[0] ?? "";
    if (base === "") return all.slice(0, 50).map((c) => ({ completion: c, score: 0 }));
    const scored: Array<{ completion: TargetCompletion; score: number }> = [];
    for (const c of all) {
      const s = scoreMatch(base, c.label);
      if (s !== null) scored.push({ completion: c, score: s });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 50);
  }, [all, state.query]);

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const openItem = useCallback(
    (completion: TargetCompletion, fragment: string) => {
      const resolved = linkIndex?.resolveTarget(completion.label, undefined);
      if (!resolved) return;
      onClose();
      (fragment ? openAtFragment(resolved, fragment, outlineCache, outlineNav) : tabs.open(resolved))
        .catch(console.error);
    },
    [linkIndex, outlineCache, outlineNav, onClose]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setState((p) => ({ ...p, selectedIndex: Math.min(p.selectedIndex + 1, filtered.length - 1) }));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setState((p) => ({ ...p, selectedIndex: Math.max(p.selectedIndex - 1, 0) }));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const item = filtered[state.selectedIndex];
        if (item) openItem(item.completion, splitTarget(state.query).fragment ?? "");
      }
    },
    [filtered, state, openItem]
  );

  return (
    <ModalSheet open={open} title="Quick Open" onClose={onClose}>
      <div className="mdr-quickopen">
        <input
          ref={inputRef}
          type="text"
          className="mdr-quickopen-input"
          placeholder="Type to filter files… (#heading to jump)"
          aria-label="Quick open file search"
          aria-activedescendant={filtered[state.selectedIndex] ? `qo-${state.selectedIndex}` : undefined}
          value={state.query}
          onChange={(e) => setState({ query: e.target.value, selectedIndex: 0 })}
          onKeyDown={handleKeyDown}
        />
        <div role="listbox" className="mdr-quickopen-list">
          {filtered.map(({ completion }, idx) => (
            <div
              key={completion.label}
              id={`qo-${idx}`}
              role="option"
              aria-selected={idx === state.selectedIndex}
              className="mdr-quickopen-item"
              data-selected={idx === state.selectedIndex}
              onClick={() => openItem(completion, splitTarget(state.query).fragment ?? "")}
            >
              <span className="mdr-quickopen-label">{completion.label}</span>
              {completion.detail && <span className="mdr-quickopen-detail">{completion.detail}</span>}
            </div>
          ))}
        </div>
      </div>
    </ModalSheet>
  );
}
