use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use notify::event::{EventKind, ModifyKind};
use notify::{RecursiveMode, Watcher};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    File,
    Folder,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub kind: EntryKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileEntry>>,
}

#[derive(Serialize, Clone)]
pub struct FsEventPayload {
    /// Structural paths (create/remove/rename): the tree may have changed.
    pub changed: Vec<String>,
    /// Content-only paths (in-place writes): tree-neutral.
    pub modified: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchMatch {
    pub file_path: String,
    pub relative_path: String,
    pub line_number: usize,
    pub line_content: String,
    pub match_start: usize,
    pub match_end: usize,
}

struct ActiveWorkspace {
    root: PathBuf,
    _watcher: notify::RecommendedWatcher,
}

/// Directories hidden from the tree until the frontend pushes a user
/// configuration, so the CLI-forward path is covered before any push.
pub const DEFAULT_IGNORED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    ".venv",
    "dist",
    "target",
    ".next",
];

pub struct WorkspaceState {
    active: Mutex<Option<ActiveWorkspace>>,
    ignored_dirs: Arc<Mutex<Vec<String>>>,
}

impl WorkspaceState {
    pub fn new() -> Self {
        WorkspaceState {
            active: Mutex::new(None),
            ignored_dirs: Arc::new(Mutex::new(
                DEFAULT_IGNORED_DIRS.iter().map(|name| name.to_string()).collect(),
            )),
        }
    }

    fn root(&self) -> Result<PathBuf, String> {
        self.active
            .lock()
            .map_err(|err| err.to_string())?
            .as_ref()
            .map(|ws| ws.root.clone())
            .ok_or_else(|| "no active workspace".to_string())
    }

    /// Shared handle so the watcher closure filters with the live list.
    fn ignored_dirs(&self) -> Arc<Mutex<Vec<String>>> {
        self.ignored_dirs.clone()
    }

    fn ignored_set(&self) -> HashSet<String> {
        self.ignored_dirs
            .lock()
            .map(|list| list.iter().cloned().collect())
            .unwrap_or_default()
    }

    fn set_ignored_dirs(&self, directories: Vec<String>) -> Result<(), String> {
        let mut list = self.ignored_dirs.lock().map_err(|err| err.to_string())?;
        *list = directories;
        Ok(())
    }

    fn ensure_inside(&self, canonical: &Path) -> Result<(), String> {
        let root = self.root()?;
        let root_canonical = root.canonicalize().map_err(|err| err.to_string())?;
        if canonical.starts_with(&root_canonical) {
            Ok(())
        } else {
            Err(format!("path outside workspace: {}", canonical.display()))
        }
    }

    /// Resolves a workspace-relative or absolute path against the workspace.
    fn resolve(&self, path: &str) -> Result<PathBuf, String> {
        let candidate = Path::new(path);
        if candidate.is_absolute() {
            Ok(candidate.to_path_buf())
        } else {
            Ok(self.root()?.join(candidate))
        }
    }

    /// Validates containment for a possibly not-yet-existing target by
    /// canonicalizing its deepest existing ancestor (catches `..` and
    /// symlink escapes), the same pattern `write_text_file` uses.
    fn ensure_target_inside(&self, target: &Path) -> Result<(), String> {
        let mut anchor = target.to_path_buf();
        while !anchor.exists() {
            match anchor.parent() {
                Some(parent) => anchor = parent.to_path_buf(),
                None => return Err(format!("no existing ancestor: {}", target.display())),
            }
        }
        let canonical = anchor.canonicalize().map_err(|err| err.to_string())?;
        self.ensure_inside(&canonical)
    }
}

/// Coalesces raw watcher events so a burst of writes produces one UI update.
const DEBOUNCE: Duration = Duration::from_millis(250);

/// Content-only event kinds: an in-place write cannot change the tree.
/// Editors that save via temp-file-plus-rename surface as Rename/Create and
/// stay structural on purpose.
fn is_content_only(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Modify(ModifyKind::Data(_) | ModifyKind::Metadata(_))
    )
}

fn start_watcher(
    root: PathBuf,
    ignored_dirs: Arc<Mutex<Vec<String>>>,
    app: AppHandle,
) -> Result<notify::RecommendedWatcher, String> {
    let (tx, rx) = mpsc::channel();
    let watcher_root = root.clone();
    let mut watcher = notify::recommended_watcher(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                let ignored: HashSet<String> = ignored_dirs
                    .lock()
                    .map(|list| list.iter().cloned().collect())
                    .unwrap_or_default();
                let classified: Vec<(String, bool)> = event
                    .paths
                    .iter()
                    .filter(|path| !is_ignored_path(path, &watcher_root, &ignored))
                    .map(|path| (path.display().to_string(), is_content_only(&event.kind)))
                    .collect();
                let _ = tx.send(classified);
            }
        },
    )
    .map_err(|err| err.to_string())?;
    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|err| err.to_string())?;

    thread::spawn(move || {
        loop {
            let mut batch = match rx.recv() {
                Ok(paths) => paths,
                Err(_) => break, // watcher dropped
            };
            while let Ok(more) = rx.recv_timeout(DEBOUNCE) {
                batch.extend(more);
            }
            let payload = merge_batch(batch);
            let _ = app.emit("workspace-fs-changed", payload);
        }
    });

    Ok(watcher)
}

/// Coalesces a debounce batch into per-path classification with
/// "structural wins": a path touched by any structural event is structural.
fn merge_batch(batch: Vec<(String, bool)>) -> FsEventPayload {
    let mut content_only: HashMap<String, bool> = HashMap::new();
    for (path, is_content) in batch {
        let entry = content_only.entry(path).or_insert(true);
        *entry &= is_content;
    }
    let mut changed = Vec::new();
    let mut modified = Vec::new();
    for (path, is_content) in content_only {
        if is_content {
            modified.push(path);
        } else {
            changed.push(path);
        }
    }
    changed.sort();
    modified.sort();
    FsEventPayload { changed, modified }
}

/// True when a path component below the workspace root matches the ignore
/// list, so events inside ignored directories never reach the UI.
fn is_ignored_path(path: &Path, root: &Path, ignored: &HashSet<String>) -> bool {
    path.strip_prefix(root)
        .map(|relative| {
            relative
                .components()
                .filter_map(|component| match component {
                    Component::Normal(name) => Some(name.to_string_lossy().to_string()),
                    _ => None,
                })
                .any(|name| ignored.contains(&name))
        })
        .unwrap_or(false)
}

#[tauri::command]
pub fn activate_workspace(
    app: AppHandle,
    state: State<'_, WorkspaceState>,
    root: String,
) -> Result<(), String> {
    let canonical = Path::new(&root)
        .canonicalize()
        .map_err(|err| format!("cannot open folder {root}: {err}"))?;
    if !canonical.is_dir() {
        return Err(format!("not a folder: {root}"));
    }

    let watcher = start_watcher(canonical.clone(), state.ignored_dirs(), app.clone())?;

    let mut active = state.active.lock().map_err(|err| err.to_string())?;
    // Dropping the previous watcher stops its thread via the closed channel.
    *active = Some(ActiveWorkspace {
        root: canonical.clone(),
        _watcher: watcher,
    });
    crate::recents::record(&canonical.to_string_lossy());
    crate::menu::refresh_recents(&app);

    // Grant asset protocol access to workspace directory for image rendering.
    app.asset_protocol_scope()
        .allow_directory(&canonical, true)
        .map_err(|err| format!("cannot grant asset access: {err}"))?;

    Ok(())
}

/// Updates the ignored-directories list; the next walk and subsequent
/// watcher events use it immediately.
#[tauri::command]
pub fn set_ignored_directories(
    state: State<'_, WorkspaceState>,
    directories: Vec<String>,
) -> Result<(), String> {
    state.set_ignored_dirs(directories)
}

/// Reads the full workspace tree. Runs on the blocking pool so a large
/// directory scan never stalls the UI thread.
#[tauri::command]
pub async fn read_dir_tree(state: State<'_, WorkspaceState>) -> Result<Vec<FileEntry>, String> {
    let root = state.root()?;
    let ignored = state.ignored_set();
    tauri::async_runtime::spawn_blocking(move || read_dir_sorted(&root, &ignored))
        .await
        .map_err(|err| format!("read dir tree task failed: {err}"))?
}

fn read_dir_sorted(dir: &Path, ignored: &HashSet<String>) -> Result<Vec<FileEntry>, String> {
    let read = fs::read_dir(dir).map_err(|err| err.to_string())?;
    let raw: Vec<fs::DirEntry> = read.flatten().collect();
    let mut entries: Vec<FileEntry> = raw
        .par_iter()
        .filter_map(|item| build_entry(item, ignored))
        .collect();
    entries.sort_by(|a, b| {
        let dir_a = matches!(a.kind, EntryKind::Folder);
        let dir_b = matches!(b.kind, EntryKind::Folder);
        dir_b.cmp(&dir_a).then_with(|| a.name.cmp(&b.name))
    });
    Ok(entries)
}

fn build_entry(item: &fs::DirEntry, ignored: &HashSet<String>) -> Option<FileEntry> {
    let path = item.path();
    let name = item.file_name().to_string_lossy().to_string();
    // Symlinks are treated as files: never follow them out of the workspace.
    let is_dir = fs::symlink_metadata(&path)
        .map(|meta| meta.is_dir())
        .unwrap_or(false);
    // Ignored directories are pruned entirely: absent from the tree, so
    // their contents are never read.
    if is_dir && ignored.contains(&name) {
        return None;
    }
    let kind = if is_dir { EntryKind::Folder } else { EntryKind::File };
    let children = if is_dir {
        read_dir_sorted(&path, ignored).ok()
    } else {
        None
    };
    Some(FileEntry {
        name,
        path: path.display().to_string(),
        kind,
        children,
    })
}

#[tauri::command]
pub async fn workspace_search(
    state: State<'_, WorkspaceState>,
    query: String,
    case_sensitive: Option<bool>,
    max_results: Option<usize>,
) -> Result<Vec<WorkspaceSearchMatch>, String> {
    let root = state.root()?;
    let ignored = state.ignored_set();
    let case_sensitive = case_sensitive.unwrap_or(false);
    let limit = max_results.unwrap_or(500);

    tauri::async_runtime::spawn_blocking(move || {
        search_in_workspace(&root, &ignored, &query, case_sensitive, limit)
    })
    .await
    .map_err(|err| format!("search task failed: {err}"))?
}

fn search_in_workspace(
    root: &Path,
    ignored: &HashSet<String>,
    query: &str,
    case_sensitive: bool,
    max_results: usize,
) -> Result<Vec<WorkspaceSearchMatch>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let files = collect_markdown_files(root, root, ignored);
    let needle = if case_sensitive {
        query.to_string()
    } else {
        query.to_lowercase()
    };

    let mut matches: Vec<WorkspaceSearchMatch> = files
        .par_iter()
        .flat_map(|file_path| {
            let mut file_matches = Vec::new();
            let bytes = match fs::read(file_path) {
                Ok(b) => b,
                Err(_) => return file_matches,
            };

            // Skip binary files
            if is_binary_content(&bytes) {
                return file_matches;
            }

            let content = match String::from_utf8(bytes) {
                Ok(s) => s,
                Err(_) => return file_matches,
            };

            let relative_path = file_path
                .strip_prefix(root)
                .map(|p| p.display().to_string())
                .unwrap_or_else(|_| file_path.display().to_string());

            for (line_idx, line) in content.lines().enumerate() {
                let haystack = if case_sensitive {
                    line.to_string()
                } else {
                    line.to_lowercase()
                };

                let mut start_idx = 0;
                while let Some(found_idx) = haystack[start_idx..].find(&needle) {
                    let match_start = start_idx + found_idx;
                    let match_end = match_start + needle.len();

                    file_matches.push(WorkspaceSearchMatch {
                        file_path: file_path.display().to_string(),
                        relative_path: relative_path.clone(),
                        line_number: line_idx + 1,
                        line_content: line.to_string(),
                        match_start,
                        match_end,
                    });

                    start_idx = match_end;
                }
            }
            file_matches
        })
        .collect();

    // Sort matches by relative_path and line_number for deterministic order
    matches.sort_by(|a, b| {
        a.relative_path
            .cmp(&b.relative_path)
            .then_with(|| a.line_number.cmp(&b.line_number))
            .then_with(|| a.match_start.cmp(&b.match_start))
    });

    if matches.len() > max_results {
        matches.truncate(max_results);
    }
    Ok(matches)
}

fn collect_markdown_files(dir: &Path, root: &Path, ignored: &HashSet<String>) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let read = match fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return files,
    };
    for entry in read.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('.') || ignored.contains(&name) {
            continue;
        }

        let is_dir = fs::symlink_metadata(&path)
            .map(|m| m.is_dir())
            .unwrap_or(false);

        if is_dir {
            files.extend(collect_markdown_files(&path, root, ignored));
        } else {
            let is_md = path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
                .unwrap_or(false);

            if is_md {
                files.push(path);
            }
        }
    }
    files
}

fn is_binary_content(bytes: &[u8]) -> bool {
    let probe_len = bytes.len().min(512);
    bytes[..probe_len].contains(&0)
}

#[tauri::command]
pub fn read_text_file(state: State<'_, WorkspaceState>, path: String) -> Result<String, String> {
    let canonical = Path::new(&path)
        .canonicalize()
        .map_err(|err| format!("cannot read {path}: {err}"))?;
    state.ensure_inside(&canonical)?;
    fs::read_to_string(canonical).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn write_text_file(
    state: State<'_, WorkspaceState>,
    path: String,
    contents: String,
) -> Result<(), String> {
    let target = Path::new(&path);
    // The file normally exists (we save documents we opened); for a new file,
    // validate its parent directory instead.
    let containment_anchor = if target.exists() {
        target.to_path_buf()
    } else {
        target.parent().ok_or_else(|| format!("bad path: {path}"))?.to_path_buf()
    };
    let canonical_anchor = containment_anchor
        .canonicalize()
        .map_err(|err| format!("cannot write {path}: {err}"))?;
    state.ensure_inside(&canonical_anchor)?;
    fs::write(target, contents).map_err(|err| err.to_string())
}

/// Creates a file or folder (mkdir -p semantics for missing parents).
#[tauri::command]
pub fn create_entry(
    state: State<'_, WorkspaceState>,
    path: String,
    kind: EntryKind,
) -> Result<(), String> {
    create_entry_impl(&state, path, kind)
}

fn create_entry_impl(state: &WorkspaceState, path: String, kind: EntryKind) -> Result<(), String> {
    let target = state.resolve(&path)?;
    if target.symlink_metadata().is_ok() {
        return Err(format!("already exists: {path}"));
    }
    state.ensure_target_inside(&target)?;
    let result = match kind {
        EntryKind::Folder => fs::create_dir_all(&target),
        EntryKind::File => {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|err| err.to_string())?;
            }
            fs::write(&target, "")
        }
    };
    result.map_err(|err| format!("cannot create {path}: {err}"))
}

fn names_differ_by_case(a: &Path, b: &Path) -> bool {
    match (a.file_name(), b.file_name()) {
        (Some(a), Some(b)) => {
            let a = a.to_string_lossy();
            let b = b.to_string_lossy();
            a != b && a.to_lowercase() == b.to_lowercase()
        }
        _ => false,
    }
}

/// Renames or moves an entry. The destination must not exist — except for a
/// case-only rename, which case-insensitive filesystems report as "already
/// exists" and which we perform via a temporary name in the same folder.
#[tauri::command]
pub fn rename_entry(
    state: State<'_, WorkspaceState>,
    from: String,
    to: String,
) -> Result<(), String> {
    rename_entry_impl(&state, from, to)
}

fn rename_entry_impl(state: &WorkspaceState, from: String, to: String) -> Result<(), String> {
    let source = state.resolve(&from)?;
    let source_canonical = source
        .canonicalize()
        .map_err(|err| format!("cannot rename {from}: {err}"))?;
    state.ensure_inside(&source_canonical)?;

    let target = state.resolve(&to)?;
    let case_only = names_differ_by_case(&source, &target)
        && target
            .canonicalize()
            .map(|canonical| canonical == source_canonical)
            .unwrap_or(false);
    if target.symlink_metadata().is_ok() && !case_only {
        return Err(format!("destination already exists: {to}"));
    }
    state.ensure_target_inside(&target)?;

    if case_only {
        let tmp = target.with_file_name(format!(".mdr-rename-{}", std::process::id()));
        let _ = fs::remove_file(&tmp);
        fs::rename(&source, &tmp).map_err(|err| format!("cannot rename {from}: {err}"))?;
        if let Err(err) = fs::rename(&tmp, &target) {
            let _ = fs::rename(&tmp, &source);
            return Err(format!("cannot rename {from}: {err}"));
        }
        return Ok(());
    }
    fs::rename(&source, &target).map_err(|err| format!("cannot rename {from}: {err}"))
}

fn copy_recursive(source: &Path, target: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(source).map_err(|err| err.to_string())?;
    if meta.is_dir() {
        fs::create_dir_all(target).map_err(|err| err.to_string())?;
        for item in fs::read_dir(source).map_err(|err| err.to_string())?.flatten() {
            let name = item.file_name();
            copy_recursive(&item.path(), &target.join(name))?;
        }
        Ok(())
    } else {
        fs::copy(source, target)
            .map(|_: u64| ())
            .map_err(|err| format!("cannot copy {}: {err}", source.display()))
    }
}

/// Copies a file or a folder subtree. Runs on the blocking pool so a large
/// copy never stalls the UI thread.
#[tauri::command]
pub async fn copy_entry(
    state: State<'_, WorkspaceState>,
    from: String,
    to: String,
) -> Result<(), String> {
    let (source, target) = copy_entry_impl(&state, from, to)?;
    tauri::async_runtime::spawn_blocking(move || copy_recursive(&source, &target))
        .await
        .map_err(|err| format!("copy task failed: {err}"))?
}

/// Validates a copy request and returns the resolved (source, target) paths.
fn copy_entry_impl(
    state: &WorkspaceState,
    from: String,
    to: String,
) -> Result<(PathBuf, PathBuf), String> {
    let source = state.resolve(&from)?;
    let source_canonical = source
        .canonicalize()
        .map_err(|err| format!("cannot copy {from}: {err}"))?;
    state.ensure_inside(&source_canonical)?;
    let target = state.resolve(&to)?;
    if target.symlink_metadata().is_ok() {
        return Err(format!("destination already exists: {to}"));
    }
    state.ensure_target_inside(&target)?;
    Ok((source, target))
}

/// Deletes a file, or a folder with its entire subtree. Symlinks that
/// resolve outside the workspace are rejected before anything is removed.
#[tauri::command]
pub fn delete_entry(state: State<'_, WorkspaceState>, path: String) -> Result<(), String> {
    delete_entry_impl(&state, path)
}

fn delete_entry_impl(state: &WorkspaceState, path: String) -> Result<(), String> {
    let target = state.resolve(&path)?;
    let canonical = target
        .canonicalize()
        .map_err(|err| format!("cannot delete {path}: {err}"))?;
    state.ensure_inside(&canonical)?;
    let is_dir = fs::symlink_metadata(&target)
        .map(|meta| meta.is_dir())
        .unwrap_or(false);
    let result = if is_dir {
        fs::remove_dir_all(&target)
    } else {
        fs::remove_file(&target)
    };
    result.map_err(|err| format!("cannot delete {path}: {err}"))
}

pub fn init_state(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(WorkspaceState::new());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state_with_root(root: &Path) -> WorkspaceState {
        let watcher = notify::recommended_watcher(|_| {}).expect("watcher");
        WorkspaceState {
            active: Mutex::new(Some(ActiveWorkspace {
                root: root.canonicalize().expect("canonical root"),
                _watcher: watcher,
            })),
            ignored_dirs: Arc::new(Mutex::new(
                DEFAULT_IGNORED_DIRS.iter().map(|name| name.to_string()).collect(),
            )),
        }
    }

    #[test]
    fn create_nested_file_and_folder() {
        let dir = std::env::temp_dir().join("mdr-ws-test-create");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let state = state_with_root(&dir);

        create_entry_impl(&state,
            "notes/new_dir/new_file.md".into(),
            EntryKind::File,
        )
        .unwrap();
        assert!(dir.join("notes/new_dir/new_file.md").is_file());

        create_entry_impl(&state, "archive/2026".into(), EntryKind::Folder).unwrap();
        assert!(dir.join("archive/2026").is_dir());

        // Existing entry is rejected.
        assert!(create_entry_impl(&state, "notes".into(), EntryKind::Folder).is_err());
        // Containment: escape via .. is rejected.
        assert!(create_entry_impl(&state, "../outside.md".into(), EntryKind::File).is_err());
        assert!(!dir.parent().unwrap().join("outside.md").exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rename_move_copy_delete_roundtrip() {
        let dir = std::env::temp_dir().join("mdr-ws-test-mutate");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("sub")).unwrap();
        fs::write(dir.join("a.md"), "hello").unwrap();
        let state = state_with_root(&dir);

        // Rename within folder.
        rename_entry_impl(&state, "a.md".into(), "b.md".into()).unwrap();
        assert!(!dir.join("a.md").exists() && dir.join("b.md").is_file());

        // Case-only rename.
        rename_entry_impl(&state, "b.md".into(), "B.md".into()).unwrap();
        // The temp dir may be case-insensitive, so check the stored name
        // via the directory listing, not via path probes.
        let names: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().to_string())
            .collect();
        assert!(
            names.contains(&"B.md".to_string()) && !names.contains(&"b.md".to_string()),
            "case-only rename did not take effect: {names:?}"
        );

        // Move into subfolder; existing destination rejected; missing parent rejected.
        rename_entry_impl(&state, "B.md".into(), "sub/B.md".into()).unwrap();
        assert!(dir.join("sub/B.md").is_file());
        assert!(rename_entry_impl(&state, "sub/B.md".into(), "sub/B.md".into()).is_err());
        assert!(rename_entry_impl(&state, "sub/B.md".into(), "missing/x.md".into()).is_err());

        // Copy file, then copy a folder subtree.
        let (src, dst) = copy_entry_impl(&state, "sub/B.md".into(), "copy.md".into()).unwrap();
        copy_recursive(&src, &dst).unwrap();
        assert_eq!(fs::read_to_string(dir.join("copy.md")).unwrap(), "hello");
        fs::write(dir.join("sub/inner.md"), "inner").unwrap();
        let (src, dst) = copy_entry_impl(&state, "sub".into(), "sub-copy".into()).unwrap();
        copy_recursive(&src, &dst).unwrap();
        assert!(dir.join("sub-copy/B.md").is_file());
        assert!(dir.join("sub-copy/inner.md").is_file());
        // Destination exists → rejected.
        assert!(copy_entry_impl(&state, "copy.md".into(), "copy.md".into()).is_err());

        // Delete file and folder subtree.
        delete_entry_impl(&state, "copy.md".into()).unwrap();
        assert!(!dir.join("copy.md").exists());
        delete_entry_impl(&state, "sub-copy".into()).unwrap();
        assert!(!dir.join("sub-copy").exists());

        // Containment on every mutation.
        assert!(rename_entry_impl(&state, "sub".into(), "../escape".into()).is_err());
        assert!(delete_entry_impl(&state, "../outside".into()).is_err());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn content_only_kinds_are_classified() {
        // In-place data/metadata writes are tree-neutral.
        assert!(is_content_only(&EventKind::Modify(ModifyKind::Data(
            notify::event::DataChange::Any
        ))));
        assert!(is_content_only(&EventKind::Modify(ModifyKind::Metadata(
            notify::event::MetadataKind::Any
        ))));
        // Everything that can move or change tree structure is structural.
        assert!(!is_content_only(&EventKind::Create(
            notify::event::CreateKind::File
        )));
        assert!(!is_content_only(&EventKind::Remove(
            notify::event::RemoveKind::File
        )));
        assert!(!is_content_only(&EventKind::Modify(
            ModifyKind::Name(notify::event::RenameMode::Any)
        )));
        assert!(!is_content_only(&EventKind::Modify(ModifyKind::Any)));
    }

    #[test]
    fn batch_merge_deduplicates_with_structural_wins() {
        // Second tuple element: true = content-only (in-place write).
        let payload = merge_batch(vec![
            ("a.md".into(), false),                 // create → structural
            ("b.md".into(), true),                  // data write
            ("b.md".into(), false),                 // later rename: structural wins
            ("c.md".into(), true),                  // data write, twice
            ("c.md".into(), true),                  //
            ("node_modules/pkg/x.md".into(), false), // structural; merge is ignore-neutral
        ]);
        assert_eq!(payload.changed, vec!["a.md", "b.md", "node_modules/pkg/x.md"]);
        assert_eq!(payload.modified, vec!["c.md"]);
    }

    #[test]
    fn ignored_directories_are_pruned_and_order_preserved() {
        let dir = std::env::temp_dir().join("mdr-ws-test-ignore");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("node_modules/pkg")).unwrap();
        fs::create_dir_all(dir.join(".venv")).unwrap();
        fs::create_dir_all(dir.join("src/nested")).unwrap();
        fs::write(dir.join("src/nested/inner.md"), "inner").unwrap();
        fs::write(dir.join("README.md"), "readme").unwrap();
        fs::write(dir.join("zeta.md"), "zeta").unwrap();

        let ignored: HashSet<String> = DEFAULT_IGNORED_DIRS
            .iter()
            .map(|name| name.to_string())
            .collect();
        let tree = read_dir_sorted(&dir, &ignored).unwrap();

        // Ignored directories are absent, siblings keep folders-first/name-asc.
        let names: Vec<&str> = tree.iter().map(|entry| entry.name.as_str()).collect();
        assert_eq!(names, vec!["src", "README.md", "zeta.md"]);

        let src = &tree[0];
        let nested = src
            .children
            .as_ref()
            .expect("folder children")
            .iter()
            .find(|entry| entry.name == "nested")
            .expect("nested folder");
        assert!(nested
            .children
            .as_ref()
            .expect("nested children")
            .iter()
            .any(|entry| entry.name == "inner.md"));

        // A directory name matching an ignored entry as a file stays visible.
        fs::write(dir.join("dist"), "not a dir").unwrap();
        let tree = read_dir_sorted(&dir, &ignored).unwrap();
        assert!(tree.iter().any(|entry| entry.name == "dist"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn ignored_list_updates_apply_to_walk_and_paths() {
        let dir = std::env::temp_dir().join("mdr-ws-test-ignore-list");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("secrets")).unwrap();
        fs::write(dir.join("secrets/x.md"), "x").unwrap();
        let state = state_with_root(&dir);

        // Defaults do not hide "secrets".
        let root = state.root().unwrap();
        let tree = read_dir_sorted(&root, &state.ignored_set()).unwrap();
        assert!(tree.iter().any(|entry| entry.name == "secrets"));

        state
            .set_ignored_dirs(vec!["secrets".to_string()])
            .unwrap();
        let tree = read_dir_sorted(&root, &state.ignored_set()).unwrap();
        assert!(tree.is_empty());

        // Watcher path filtering follows the same list. Event paths sit
        // under the canonical root, so probes canonicalize the same way.
        fs::write(dir.join("other.md"), "y").unwrap();
        let inside = dir.join("secrets/x.md").canonicalize().unwrap();
        let outside = dir.join("other.md").canonicalize().unwrap();
        assert!(is_ignored_path(&inside, &root, &state.ignored_set()));
        assert!(!is_ignored_path(&outside, &root, &state.ignored_set()));
        assert!(!is_ignored_path(&root, &root, &state.ignored_set()));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn workspace_search_finds_matches_case_insensitively() {
        let dir = std::env::temp_dir().join("mdr-ws-test-search");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("a.md"), "Rust is great.\nWrite rust with love.").unwrap();
        fs::write(dir.join("b.md"), "no matching content here").unwrap();

        let ignored: HashSet<String> = DEFAULT_IGNORED_DIRS
            .iter()
            .map(|name| name.to_string())
            .collect();
        let matches =
            search_in_workspace(&dir, &ignored, "rust", false, 100).unwrap();
        assert_eq!(matches.len(), 2, "expected 2 case-insensitive matches");
        assert_eq!(matches[0].file_path, dir.join("a.md").display().to_string());
        assert_eq!(matches[0].line_number, 1);
        assert_eq!(matches[0].line_content, "Rust is great.");
        assert_eq!(matches[0].match_start, 0);
        assert_eq!(matches[0].match_end, 4);
        assert_eq!(matches[1].line_number, 2);

        // Case-sensitive mode only hits the lowercase occurrence.
        let sensitive =
            search_in_workspace(&dir, &ignored, "rust", true, 100).unwrap();
        assert_eq!(sensitive.len(), 1);
        assert_eq!(sensitive[0].line_number, 2);

        // Empty query returns no matches.
        let empty = search_in_workspace(&dir, &ignored, "  ", false, 100).unwrap();
        assert!(empty.is_empty());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn workspace_search_excludes_ignored_dirs_hidden_and_binary() {
        let dir = std::env::temp_dir().join("mdr-ws-test-search-ignore");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("node_modules")).unwrap();
        fs::create_dir_all(dir.join(".hiddendir")).unwrap();
        fs::write(dir.join("node_modules/pkg.md"), "tauri lives here").unwrap();
        fs::write(dir.join(".hiddendir/secret.md"), "tauri hidden here").unwrap();
        fs::write(dir.join("visible.md"), "tauri visible here").unwrap();
        fs::write(dir.join("notes.txt"), "tauri in a txt").unwrap();
        fs::write(dir.join("image.md"), [0u8, 159, 146, 150]).unwrap();

        let ignored: HashSet<String> = DEFAULT_IGNORED_DIRS
            .iter()
            .map(|name| name.to_string())
            .collect();
        let matches =
            search_in_workspace(&dir, &ignored, "tauri", false, 100).unwrap();
        assert_eq!(matches.len(), 1, "expected only visible.md to match: {matches:?}");
        assert_eq!(matches[0].relative_path, "visible.md");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn workspace_search_respects_max_results() {
        let dir = std::env::temp_dir().join("mdr-ws-test-search-limit");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("doc.md"), "hit\nhit\nhit\nhit\nhit").unwrap();

        let ignored: HashSet<String> = DEFAULT_IGNORED_DIRS
            .iter()
            .map(|name| name.to_string())
            .collect();
        let matches =
            search_in_workspace(&dir, &ignored, "hit", false, 3).unwrap();
        assert_eq!(matches.len(), 3);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn workspace_search_reports_multiple_hits_per_line() {
        let dir = std::env::temp_dir().join("mdr-ws-test-search-multi");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("doc.md"), "todo first todo second todo").unwrap();

        let ignored: HashSet<String> = DEFAULT_IGNORED_DIRS
            .iter()
            .map(|name| name.to_string())
            .collect();
        let matches =
            search_in_workspace(&dir, &ignored, "todo", false, 100).unwrap();
        assert_eq!(matches.len(), 3);
        assert_eq!(matches[0].match_start, 0);
        assert_eq!(matches[1].match_start, 11);
        assert_eq!(matches[2].match_start, 23);

        let _ = fs::remove_dir_all(&dir);
    }
}
