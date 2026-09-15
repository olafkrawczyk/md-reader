import { listen } from "@tauri-apps/api/event";

/**
 * Ids the native menu emits over the `menu-action` event (contract with
 * src-tauri/src/menu.rs). Ids without a registered handler are ignored.
 */
export const menuActionIds = ["open-folder", "new-file", "new-folder"] as const;
export type MenuActionId = (typeof menuActionIds)[number];

type MenuActionHandler = () => void;

const menuActionIdSet: ReadonlySet<string> = new Set(menuActionIds);
const handlers = new Map<MenuActionId, MenuActionHandler>();
let listening = false;

function isMenuActionId(id: unknown): id is MenuActionId {
  return typeof id === "string" && menuActionIdSet.has(id);
}

function ensureListener(): void {
  if (listening) {
    return;
  }
  listening = true;
  listen<string>("menu-action", (event) => {
    if (!isMenuActionId(event.payload)) {
      return;
    }
    handlers.get(event.payload)?.();
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
