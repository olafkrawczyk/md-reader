import type { JSX } from "react";
import { ModalSheet } from "../ui/controls";

interface ShortcutsPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

interface ShortcutEntry {
  readonly keys: string;
  readonly action: string;
}

// ponytail: hardcoded list mirrors appShellHooks keydown chain and menu.rs accelerators.
// Upgrade to a registry if extension-contributed shortcuts are needed.
const SHORTCUTS: readonly ShortcutEntry[] = [
  { keys: "⌘O", action: "Open Folder…" },
  { keys: "⌘S", action: "Save Document" },
  { keys: "⌘E", action: "Toggle Reader / Editor" },
  { keys: "⌥⌘E", action: "Toggle Side-by-Side Split" },
  { keys: "⌘F", action: "Find in Document" },
  { keys: "⌘N", action: "New File" },
  { keys: "⌘⇧N", action: "New Folder" },
  { keys: "⌘← / ⌘→", action: "Previous / Next Tab" },
  { keys: "⌃Tab", action: "Next Tab (⌃⇧Tab for Previous)" },
  { keys: "⌘W", action: "Close Tab" },
];

export function ShortcutsPanel({ open, onClose }: ShortcutsPanelProps): JSX.Element {
  return (
    <ModalSheet open={open} title="Keyboard Shortcuts" onClose={onClose}>
      <table className="mdr-shortcuts-table">
        <tbody>
          {SHORTCUTS.map(({ keys, action }) => (
            <tr key={keys} className="mdr-shortcuts-row">
              <td className="mdr-shortcuts-keys">
                <kbd>{keys}</kbd>
              </td>
              <td className="mdr-shortcuts-action">{action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ModalSheet>
  );
}
