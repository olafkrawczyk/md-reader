export { autosave } from "./autosave";
export type { AutosaveOptions } from "./autosave";
export {
  closePromptQueue,
  reportSafetyError,
  requestCloseDecision,
  setCloseGuardHandler,
  setSafetyErrorReporter,
} from "./closeGuard";
export type { CloseDecision, CloseGuardHandler, ClosePrompt } from "./closeGuard";
export { CloseGuardDialog } from "./CloseGuardDialog";
