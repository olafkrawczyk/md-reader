/**
 * Session restore: serialize/deserialize workspace + tabs state.
 * Persisted as a JSON string in settingsStore("session", "state").
 */

export interface SessionState {
  readonly workspaceRoot: string;
  readonly tabPaths: readonly string[];
  readonly activeIndex: number;
}

export function serialize(
  workspaceRoot: string | null,
  tabPaths: readonly string[],
  activePath: string | null,
): string | null {
  if (workspaceRoot === null) {
    return null;
  }
  const activeIndex = activePath === null ? 0 : tabPaths.indexOf(activePath);
  const state: SessionState = {
    workspaceRoot,
    tabPaths,
    activeIndex: activeIndex === -1 ? 0 : activeIndex,
  };
  return JSON.stringify(state);
}

export function deserialize(json: string | null): SessionState | null {
  if (json === null || json === "") {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(json);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "workspaceRoot" in parsed &&
      "tabPaths" in parsed &&
      "activeIndex" in parsed &&
      typeof parsed.workspaceRoot === "string" &&
      Array.isArray(parsed.tabPaths) &&
      parsed.tabPaths.every((p) => typeof p === "string") &&
      typeof parsed.activeIndex === "number"
    ) {
      const clamped =
        parsed.tabPaths.length === 0
          ? 0
          : Math.max(0, Math.min(parsed.activeIndex, parsed.tabPaths.length - 1));
      return {
        workspaceRoot: parsed.workspaceRoot,
        tabPaths: parsed.tabPaths,
        activeIndex: clamped,
      };
    }
  } catch {
    // Bad JSON falls through to null.
  }
  return null;
}
