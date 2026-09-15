import type { JSX } from "react";
import { ModalSheet } from "../ui/controls";
import { useStoreValue } from "../state/storeHooks";
import { closePromptQueue } from "./closeGuard";

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

/**
 * Save / Discard / Cancel decision UI (design D1). Renders whenever the
 * close-guard queue is non-empty; the first queued prompt is shown.
 */
export function CloseGuardDialog(): JSX.Element | null {
  const prompts = useStoreValue(closePromptQueue.source);
  const prompt = prompts[0];
  if (prompt === undefined) {
    return null;
  }
  const names = prompt.documents.map((document) => baseName(document.path));
  const message =
    names.length === 1
      ? `Save changes to “${names[0]}” before closing?`
      : `Save changes to ${names.length} documents before closing?`;
  return (
    <ModalSheet
      open
      title="Unsaved Changes"
      onClose={() => closePromptQueue.decide("cancel")}
    >
      <p className="mdr-dialog-message">{message}</p>
      <div className="mdr-dialog-actions">
        <button
          type="button"
          className="mdr-dialog-button"
          data-danger
          onClick={() => closePromptQueue.decide("discard")}
        >
          Discard
        </button>
        <button
          type="button"
          className="mdr-dialog-button"
          onClick={() => closePromptQueue.decide("cancel")}
        >
          Cancel
        </button>
        <button
          type="button"
          className="mdr-primary-button"
          onClick={() => closePromptQueue.decide("save")}
        >
          Save
        </button>
      </div>
    </ModalSheet>
  );
}
