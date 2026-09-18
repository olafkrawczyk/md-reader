import { listen } from "@tauri-apps/api/event";

/**
 * Ids the native menu emits over the `menu-action` event (contract with
 * src-tauri/src/menu.rs). Ids without a registered handler are ignored.
 * Prefix-based ids (e.g. `open-recent:<path>`) split on the first colon and
 * dispatch to the prefix handler with the remainder as the argument.
 */
export const menuActionIds = [
  "open-folder",
  "new-file",
  "new-folder",
  "show-shortcuts",
  "open-recent",
] as const;
export type MenuActionId = (typeof menuActionIds)[number];

export type MenuActionHandler = (arg?: string) => void;

const menuActionIdSet: ReadonlySet<string> = new Set(menuActionIds);
const handlers = new Map<MenuActionId, MenuActionHandler>();
let listening = false;

function isMenuActionId(id: unknown): id is MenuActionId {
  return typeof id === "string" && menuActionIdSet.has(id);
}

export function dispatchMenuAction(rawId: string): void {
  const colon = rawId.indexOf(":");
  const prefix = colon === -1 ? rawId : rawId.slice(0, colon);
  const arg = colon === -1 ? undefined : rawId.slice(colon + 1);
  if (!isMenuActionId(prefix)) {
    return;
  }
  handlers.get(prefix)?.(arg);
}

function ensureListener(): void {
  if (listening || typeof window === "undefined") {
    return;
  }
  listening = true;
  listen<string>("menu-action", (event) => {
    dispatchMenuAction(event.payload);
  }).catch((err: unknown) => {
    listening = false;
    console.error("failed to bind native menu actions", err);
  });
}

export function registerMenuAction(
  id: MenuActionId,
  handler: MenuActionHandler,
): () => void {
  handlers.set(id, handler);
  ensureListener();
  return () => {
    if (handlers.get(id) === handler) {
      handlers.delete(id);
    }
  };
}
