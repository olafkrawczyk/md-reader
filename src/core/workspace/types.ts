export type FileEntryKind = "file" | "folder";

export interface FileEntry {
  readonly name: string;
  readonly path: string;
  readonly kind: FileEntryKind;
  readonly children?: readonly FileEntry[];
}

/**
 * Watcher batch, classified by the backend: `changed` paths are structural
 * (create/remove/rename — the tree may have changed), `modified` paths are
 * content-only in-place writes (tree-neutral).
 */
export interface FsEvent {
  readonly changed: readonly string[];
  readonly modified: readonly string[];
}
