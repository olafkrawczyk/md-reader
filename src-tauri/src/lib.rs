use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::Deserialize;
use tauri::http::{header, Request, Response, StatusCode};

struct ExtensionsDir(PathBuf);

fn extensions_dir() -> &'static ExtensionsDir {
    static DIR: OnceLock<ExtensionsDir> = OnceLock::new();
    DIR.get_or_init(|| {
        let home = std::env::var("HOME").unwrap_or_else(|_| String::from("."));
        ExtensionsDir(
            Path::new(&home)
                .join(".config")
                .join("md-reader")
                .join("extensions"),
        )
    })
}

fn is_extension_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn resolve_module_path(extension_id: &str, file: &str) -> Option<PathBuf> {
    if !is_extension_id(extension_id) || file.is_empty() || file.contains("..") {
        return None;
    }
    let root = extensions_dir();
    let canonical = root.0.join(extension_id).join(file).canonicalize().ok()?;
    let root_canonical = root.0.canonicalize().ok()?;
    canonical.starts_with(root_canonical).then_some(canonical)
}

fn script_response(status: StatusCode, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/javascript")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(body)
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

fn serve_extension_module(request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let uri = request.uri();
    let extension_id = uri.host().unwrap_or_default();
    let file = uri.path().trim_start_matches('/');
    let Some(path) = resolve_module_path(extension_id, file) else {
        return script_response(StatusCode::NOT_FOUND, Vec::new());
    };
    match fs::read(path) {
        Ok(body) => script_response(StatusCode::OK, body),
        Err(_) => script_response(StatusCode::NOT_FOUND, Vec::new()),
    }
}

#[derive(Deserialize)]
struct SpikeAttemptReport {
    path: String,
    success: bool,
    detail: String,
}

#[tauri::command]
fn read_extension_source(extension_id: String, file: String) -> Result<String, String> {
    let path = resolve_module_path(&extension_id, &file)
        .ok_or_else(|| format!("module not found: {extension_id}/{file}"))?;
    fs::read_to_string(path).map_err(|err| err.to_string())
}

#[tauri::command]
fn report_spike_result(attempt: SpikeAttemptReport) {
    println!(
        "SPIKE path={} success={} detail={}",
        attempt.path, attempt.success, attempt.detail
    );
}

mod cli;
mod menu;
mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be first: on a second invocation it forwards argv to the
        // running instance and exits before anything else initializes.
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            cli::handle_forwarded(app, argv, cwd);
        }))
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            workspace::init_state(app)?;
            cli::init(app);
            menu::init(app.handle())?;
            Ok(())
        })
        .register_uri_scheme_protocol("mdext", |_ctx, request| serve_extension_module(&request))
        .invoke_handler(tauri::generate_handler![
            read_extension_source,
            report_spike_result,
            cli::take_pending_cli_open,
            menu::set_workspace_menu_enabled,
            workspace::activate_workspace,
            workspace::set_ignored_directories,
            workspace::read_dir_tree,
            workspace::read_text_file,
            workspace::write_text_file,
            workspace::create_entry,
            workspace::rename_entry,
            workspace::copy_entry,
            workspace::delete_entry,
            workspace::workspace_search
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
