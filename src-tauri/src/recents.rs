//! Recently opened folders, persisted to `~/.config/md-reader/recents.json`
//! as a JSON array of absolute paths, most-recent-first.

use std::fs;
use std::path::{Path, PathBuf};

const MAX_RECENTS: usize = 10;

fn recents_file() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| String::from("."));
    Path::new(&home)
        .join(".config")
        .join("md-reader")
        .join("recents.json")
}

/// Loads the recorded folders, dropping entries that are no longer
/// directories. Any read or parse failure yields an empty list.
pub fn list() -> Vec<String> {
    let raw = fs::read_to_string(recents_file()).unwrap_or_default();
    let entries: Vec<String> = serde_json::from_str(&raw).unwrap_or_default();
    entries
        .into_iter()
        .filter(|path| Path::new(path).is_dir())
        .collect()
}

/// Moves `path` to the front of the list (removing a duplicate), caps at
/// [`MAX_RECENTS`], and persists best-effort: a write failure never fails
/// the open that triggered the recording.
pub fn record(path: &str) {
    let file = recents_file();
    if let Some(parent) = file.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let mut entries: Vec<String> = serde_json::from_str(
        &fs::read_to_string(&file).unwrap_or_default(),
    )
    .unwrap_or_default();
    entries.retain(|entry| entry != path);
    entries.insert(0, path.to_string());
    entries.truncate(MAX_RECENTS);
    let _ = fs::write(&file, serde_json::to_string(&entries).unwrap_or_default());
}

/// Command the frontend uses to fill the welcome-screen list.
#[tauri::command]
pub fn recent_folders() -> Vec<String> {
    list()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record_path(list: &mut Vec<String>, path: &str) {
        list.retain(|entry| entry != path);
        list.insert(0, path.to_string());
        list.truncate(MAX_RECENTS);
    }

    #[test]
    fn re_record_moves_to_front_without_duplicating() {
        let mut entries = vec!["/a".to_string(), "/b".to_string(), "/c".to_string()];
        record_path(&mut entries, "/b");
        assert_eq!(entries, vec!["/b", "/a", "/c"]);
    }

    #[test]
    fn cap_discards_oldest() {
        let mut entries: Vec<String> = Vec::new();
        for i in 0..12 {
            record_path(&mut entries, &format!("/d{i}"));
        }
        assert_eq!(entries.len(), MAX_RECENTS);
        assert_eq!(entries[0], "/d11");
        assert_eq!(entries.last().unwrap(), "/d2");
        assert!(!entries.contains(&"/d0".to_string()));
        assert!(!entries.contains(&"/d1".to_string()));
    }

    #[test]
    fn malformed_json_falls_back_to_empty_list() {
        let parsed: Vec<String> =
            serde_json::from_str("{not an array").unwrap_or_default();
        assert!(parsed.is_empty());
    }
}
