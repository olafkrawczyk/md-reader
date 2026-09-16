export * from "./workspace";
export {
  activateWorkspace,
  readDirTree,
  readTextFile,
  writeTextFile,
  createEntry,
  renameEntry,
  copyEntry,
  deleteEntry,
  onFsChanged,
  workspaceSearch,
} from "./bridge";
export type { WorkspaceSearchMatch } from "./bridge";
