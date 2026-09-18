use tauri::menu::{MenuBuilder, MenuItem, Submenu, SubmenuBuilder};
use tauri::{AppHandle, Manager};

const MENU_ACTION_EVENT: &str = "menu-action";
const OPEN_FOLDER_ID: &str = "open-folder";
const NEW_FILE_ID: &str = "new-file";
const NEW_FOLDER_ID: &str = "new-folder";
const OPEN_RECENT_PREFIX: &str = "open-recent:";
const SHOW_SHORTCUTS_ID: &str = "show-shortcuts";

struct WorkspaceMenuState {
    new_file: MenuItem<tauri::Wry>,
    new_folder: MenuItem<tauri::Wry>,
    open_recent: Option<Submenu<tauri::Wry>>,
}

/// Rebuilds the Open Recent submenu's items from the current recents list.
/// Called after each record so the menu tracks the list.
pub fn refresh_recents(app: &AppHandle) {
    let Some(state) = app.try_state::<WorkspaceMenuState>() else {
        return;
    };
    let Some(submenu) = state.open_recent.as_ref() else {
        return;
    };
    while let Ok(Some(_)) = submenu.remove_at(0) {}
    for path in crate::recents::list() {
        let label = std::path::Path::new(&path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(&path)
            .to_string();
        if let Ok(item) = MenuItem::with_id(app, format!("{OPEN_RECENT_PREFIX}{path}"), label, true, None::<&str>) {
            let _ = submenu.append(&item);
        }
    }
}

#[cfg(target_os = "macos")]
// Accelerators declared below (CmdOrCtrl+O/N, Shift+CmdOrCtrl+N) must be
// mirrored in ShortcutsPanel.tsx if they change.
pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let open_folder = MenuItem::with_id(
        app,
        OPEN_FOLDER_ID,
        "Open Folder…",
        true,
        Some("CmdOrCtrl+O"),
    )?;
    let new_file = MenuItem::with_id(app, NEW_FILE_ID, "New File", false, Some("CmdOrCtrl+N"))?;
    let new_folder = MenuItem::with_id(
        app,
        NEW_FOLDER_ID,
        "New Folder",
        false,
        Some("Shift+CmdOrCtrl+N"),
    )?;

    let open_recent = Submenu::new(app, "Open Recent", true)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&open_folder)
        .item(&open_recent)
        .item(&new_file)
        .item(&new_folder)
        .build()?;

    let app_menu = SubmenuBuilder::new(app, "md-reader")
        .about(None)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View").fullscreen().build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .separator()
        .bring_all_to_front()
        .build()?;

    // Accelerator changes must be mirrored in ShortcutsPanel.tsx and the
    // keydown chain in appShellHooks.ts.
    let shortcuts = MenuItem::with_id(app, SHOW_SHORTCUTS_ID, "Keyboard Shortcuts", true, None::<&str>)?;
    let help_menu = SubmenuBuilder::new(app, "Help").item(&shortcuts).build()?;

    let menu = MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&window_menu)
        .item(&help_menu)
        .build()?;

    app.set_menu(menu)?;
    app.manage(WorkspaceMenuState {
        new_file,
        new_folder,
        open_recent: Some(open_recent),
    });
    refresh_recents(app);

    use tauri::Emitter;
    app.on_menu_event(|app, event| {
        let id = event.id().0.as_str();
        if matches!(id, OPEN_FOLDER_ID | NEW_FILE_ID | NEW_FOLDER_ID | SHOW_SHORTCUTS_ID)
            || id.starts_with(OPEN_RECENT_PREFIX)
        {
            let _ = app.emit(MENU_ACTION_EVENT, id);
        }
    });
    Ok(())
}

/// Platforms outside the macOS scope keep Tauri's default menu.
#[cfg(not(target_os = "macos"))]
pub fn init(_app: &AppHandle) {}

#[cfg(not(target_os = "macos"))]
pub fn refresh_recents(_app: &AppHandle) {}

#[tauri::command]
pub fn set_workspace_menu_enabled(app: tauri::AppHandle, enabled: bool) {
    if let Some(state) = app.try_state::<WorkspaceMenuState>() {
        let _ = state.new_file.set_enabled(enabled);
        let _ = state.new_folder.set_enabled(enabled);
    }
}
