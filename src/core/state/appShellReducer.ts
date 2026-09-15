/**
 * The application shell's UI state as one typed state machine
 * (react-state-architecture: state budget). Pure transitions — nothing here
 * touches the DOM, the network, or external stores.
 */

export interface StatusMessage {
  readonly text: string;
  readonly tone: "ok" | "error";
}

export interface SidebarState {
  readonly open: boolean;
  readonly width: number;
  readonly resizing: boolean;
}

export interface AppShellState {
  /** Extensions activated and the default preset is applied. */
  readonly ready: boolean;
  readonly status: StatusMessage | null;
  readonly settingsOpen: boolean;
  readonly sidebar: SidebarState;
}

export type AppShellAction =
  | { readonly type: "activated" }
  | { readonly type: "statusShown"; readonly message: StatusMessage }
  | { readonly type: "statusCleared" }
  | { readonly type: "settingsOpened" }
  | { readonly type: "settingsClosed" }
  | { readonly type: "sidebarToggled" }
  | { readonly type: "sidebarResizeStarted" }
  | { readonly type: "sidebarResizeMoved"; readonly width: number }
  | { readonly type: "sidebarResizeEnded" };

export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 420;

export function clampSidebarWidth(width: number): number {
  return Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH);
}

export const initialAppShellState: AppShellState = {
  ready: false,
  status: null,
  settingsOpen: false,
  sidebar: { open: true, width: 240, resizing: false },
};

export function appShellReducer(
  state: AppShellState,
  action: AppShellAction,
): AppShellState {
  switch (action.type) {
    case "activated":
      return { ...state, ready: true };
    case "statusShown":
      return { ...state, status: action.message };
    case "statusCleared":
      return { ...state, status: null };
    case "settingsOpened":
      return { ...state, settingsOpen: true };
    case "settingsClosed":
      return { ...state, settingsOpen: false };
    case "sidebarToggled":
      return {
        ...state,
        sidebar: { ...state.sidebar, open: !state.sidebar.open },
      };
    case "sidebarResizeStarted":
      return {
        ...state,
        sidebar: { ...state.sidebar, resizing: true },
      };
    case "sidebarResizeMoved":
      return {
        ...state,
        sidebar: {
          ...state.sidebar,
          width: clampSidebarWidth(action.width),
        },
      };
    case "sidebarResizeEnded":
      return {
        ...state,
        sidebar: { ...state.sidebar, resizing: false },
      };
  }
}
