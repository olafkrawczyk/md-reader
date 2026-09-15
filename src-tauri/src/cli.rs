use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::Manager;
use tauri_plugin_cli::ArgData;
use tauri_plugin_cli::CliExt;

const CLI_OPEN_EVENT: &str = "cli-open";
const PATH_ARG: &str = "path";

#[derive(Clone, Serialize)]
pub struct CliOpen {
    pub path: String,
    pub kind: String,
}

pub struct CliState(Mutex<Option<CliOpen>>);

/// Registers state and captures the launch-time path argument. The frontend
/// is not ready during setup, so the payload is stored and pulled by the
/// frontend once loaded (see `take_pending_cli_open`).
pub fn init(app: &mut tauri::App) {
    app.manage(CliState(Mutex::new(None)));
    if let Ok(matches) = app.cli().matches() {
        if let Some(ArgData { value, .. }) = matches.args.get(PATH_ARG) {
            if let Some(arg) = value.as_str() {
                let cwd =
                    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
                if let Some(open) = resolve(arg, &cwd) {
                    if let Ok(mut pending) = app.state::<CliState>().0.lock() {
                        *pending = Some(open);
                    }
                }
            }
        }
    }
}

/// A second invocation handed us its argv over the plugin's socket: bring
/// the existing window to the foreground and forward the path, if any.
pub fn handle_forwarded(app: &tauri::AppHandle, argv: Vec<String>, cwd: String) {
    focus_main_window(app);
    let Some(arg) = argv.into_iter().nth(1) else {
        return;
    };
    if let Some(open) = resolve(&arg, Path::new(&cwd)) {
        use tauri::Emitter;
        let _ = app.emit(CLI_OPEN_EVENT, open);
    }
}

/// Resolves a launch path to an absolute one relative to `cwd` and
/// classifies it as file or folder. A nonexistent path is kept as-is and
/// reported as a file so the frontend surfaces the open error.
fn resolve(arg: &str, cwd: &Path) -> Option<CliOpen> {
    let trimmed = arg.trim();
    if trimmed.is_empty() {
        return None;
    }
    let path = Path::new(trimmed);
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        cwd.join(path)
    };
    let kind = if absolute.is_dir() { "folder" } else { "file" };
    let canonical = absolute.canonicalize().unwrap_or(absolute);
    Some(CliOpen {
        path: canonical.display().to_string(),
        kind: kind.to_string(),
    })
}

fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[tauri::command]
pub fn take_pending_cli_open(app: tauri::AppHandle) -> Option<CliOpen> {
    let state = app.state::<CliState>();
    state.0.lock().ok().and_then(|mut pending| pending.take())
}
