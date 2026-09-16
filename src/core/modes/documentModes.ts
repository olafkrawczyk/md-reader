import { serviceKey } from "../extension/serviceRegistry";

/**
 * The document-mode seam: the presets extension registers mode control,
 * while core binds ⌘E / ⌘⌥E without knowing preset ids.
 */
export interface DocumentModeController {
  toggleMode(): void;
  toggleSplit(): void;
}

export const documentModeKey = serviceKey<DocumentModeController>("mdr.document.mode");
