import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { FileEntry, FileEntryKind, FsEvent } from "./types";

export function activateWorkspace(root: string): Promise<void> {
  return invoke("activate_workspace", { root });
}

export function setIgnoredDirectories(
  directories: readonly string[],
): Promise<void> {
  return invoke("set_ignored_directories", { directories: [...directories] });
}

export function readDirTree(): Promise<readonly FileEntry[]> {
  return invoke<readonly FileEntry[]>("read_dir_tree");
}

export function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

export function writeTextFile(path: string, contents: string): Promise<void> {
  return invoke("write_text_file", { path, contents });
}

export function createEntry(
  path: string,
  kind: FileEntryKind,
): Promise<void> {
  return invoke("create_entry", { path, kind });
}

export function renameEntry(from: string, to: string): Promise<void> {
  return invoke("rename_entry", { from, to });
}

export function copyEntry(from: string, to: string): Promise<void> {
  return invoke("copy_entry", { from, to });
}

export function deleteEntry(path: string): Promise<void> {
  return invoke("delete_entry", { path });
}

export function onFsChanged(
  handler: (event: FsEvent) => void,
): Promise<UnlistenFn> {
  return listen<FsEvent>("workspace-fs-changed", (event) => {
    handler(event.payload);
  });
}

export interface WorkspaceSearchMatch {
  readonly filePath: string;
  readonly relativePath: string;
  readonly lineNumber: number;
  readonly lineContent: string;
  readonly matchStart: number;
  readonly matchEnd: number;
}

export function workspaceSearch(
  query: string,
  caseSensitive?: boolean,
  maxResults?: number,
): Promise<readonly WorkspaceSearchMatch[]> {
  return invoke<readonly WorkspaceSearchMatch[]>("workspace_search", {
    query,
    caseSensitive,
    maxResults,
  });
}
