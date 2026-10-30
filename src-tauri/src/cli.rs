use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

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
                let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
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

#[derive(Clone, Serialize)]
pub struct TerminalSetup {
    pub command: String,
}

/// Shell snippet that installs a `md-reader` command, or nothing when the
/// user's login shell already finds one — or when this build has no launcher
/// script to point at. Settings shows the snippet only in the first case.
#[tauri::command]
pub fn terminal_setup(app: tauri::AppHandle) -> Option<TerminalSetup> {
    if shell_finds("md-reader") {
        return None;
    }
    let resource_dir = app.path().resource_dir().ok();
    let exe = std::env::current_exe().ok();
    let launcher = find_launcher(resource_dir.as_deref(), exe.as_deref())?;
    Some(TerminalSetup {
        command: setup_command(&launcher),
    })
}

/// Bundled script first (`Contents/Resources/launch-md-reader`), then a
/// `scripts/launch-md-reader` walked up from the executable for `tauri dev`.
fn find_launcher(resource_dir: Option<&Path>, exe: Option<&Path>) -> Option<PathBuf> {
    if let Some(dir) = resource_dir {
        let bundled = dir.join("launch-md-reader");
        if bundled.is_file() {
            return Some(bundled);
        }
    }
    let mut dir = exe?.parent()?.to_path_buf();
    for _ in 0..8 {
        let candidate = dir.join("scripts").join("launch-md-reader");
        if candidate.is_file() {
            return Some(candidate);
        }
        dir = dir.parent()?.to_path_buf();
    }
    None
}

fn setup_command(launcher: &Path) -> String {
    let quoted = shell_single_quote(&launcher.to_string_lossy());
    [
        format!("launcher={quoted}"),
        "chmod +x \"$launcher\" 2>/dev/null || true".to_string(),
        "if [ -d /usr/local/bin ] && [ -w /usr/local/bin ]; then".to_string(),
        "  ln -sf \"$launcher\" /usr/local/bin/md-reader".to_string(),
        "else".to_string(),
        "  mkdir -p \"$HOME/.local/bin\"".to_string(),
        "  ln -sf \"$launcher\" \"$HOME/.local/bin/md-reader\"".to_string(),
        "  case \":$PATH:\" in".to_string(),
        "    *\":$HOME/.local/bin:\"*) ;;".to_string(),
        "    *) printf '%s\\n' 'Add ~/.local/bin to your PATH: export PATH=\"$HOME/.local/bin:$PATH\"' ;;"
            .to_string(),
        "  esac".to_string(),
        "fi".to_string(),
    ]
    .join("\n")
}

fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

/// True when the user's login shell can resolve `name`. A GUI launch does
/// not see the terminal PATH, so this asks a non-interactive login shell
/// (`-lc`), which reads the profile without the slow interactive startup.
/// Unknown or too-slow shells count as missing, which only offers the setup note.
fn shell_finds(name: &str) -> bool {
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return false;
    }
    let shell = login_shell();
    let mut child = match Command::new(&shell)
        .args(["-lc", &format!("command -v {name}")])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => child,
        Err(_) => return false,
    };
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() < Duration::from_secs(4) => {
                thread::sleep(Duration::from_millis(30));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return false;
            }
            Err(_) => return false,
        }
    };
    if !status.success() {
        return false;
    }
    let mut stdout = String::new();
    if let Some(mut pipe) = child.stdout.take() {
        let _ = pipe.read_to_string(&mut stdout);
    }
    stdout.lines().any(|line| {
        let line = line.trim();
        line == name || line.ends_with(&format!("/{name}"))
    })
}

fn login_shell() -> PathBuf {
    if let Ok(user) = std::env::var("USER") {
        if !user.is_empty()
            && user
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            if let Ok(output) = Command::new("/usr/bin/dscl")
                .args([".", "-read", &format!("/Users/{user}"), "UserShell"])
                .output()
            {
                if let Ok(text) = String::from_utf8(output.stdout) {
                    if let Some(shell) = parse_user_shell(&text) {
                        let path = PathBuf::from(shell);
                        if path.is_file() {
                            return path;
                        }
                    }
                }
            }
        }
    }
    PathBuf::from("/bin/zsh")
}

fn parse_user_shell(output: &str) -> Option<&str> {
    let line = output.lines().find(|line| line.contains("UserShell"))?;
    let shell = line.split_whitespace().last()?;
    shell.starts_with('/').then_some(shell)
}

#[cfg(test)]
mod tests {
    use super::{find_launcher, parse_user_shell, setup_command, shell_finds, shell_single_quote};
    use std::fs;
    use std::path::Path;

    #[test]
    fn quotes_paths_for_the_shell() {
        assert_eq!(
            shell_single_quote("/Applications/md-reader.app/Contents/Resources/launch-md-reader"),
            "'/Applications/md-reader.app/Contents/Resources/launch-md-reader'"
        );
        assert_eq!(
            shell_single_quote("/Users/o'brien/app"),
            "'/Users/o'\\''brien/app'"
        );
    }

    #[test]
    fn setup_command_links_the_given_launcher() {
        let command = setup_command(Path::new(
            "/Applications/md-reader.app/Contents/Resources/launch-md-reader",
        ));
        assert!(command.starts_with(
            "launcher='/Applications/md-reader.app/Contents/Resources/launch-md-reader'"
        ));
        assert!(command.contains("ln -sf \"$launcher\" /usr/local/bin/md-reader"));
        assert!(command.contains("ln -sf \"$launcher\" \"$HOME/.local/bin/md-reader\""));
    }

    #[test]
    fn find_launcher_prefers_the_bundle_resource() {
        let root = std::env::temp_dir().join(format!("mdr-launcher-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let resources = root.join("Resources");
        let repo = root.join("repo");
        fs::create_dir_all(&resources).unwrap();
        fs::create_dir_all(repo.join("scripts")).unwrap();
        let bundled = resources.join("launch-md-reader");
        let dev = repo.join("scripts").join("launch-md-reader");
        fs::write(&bundled, "bundle").unwrap();
        fs::write(&dev, "dev").unwrap();
        assert_eq!(
            find_launcher(
                Some(resources.as_path()),
                Some(repo.join("src-tauri/target/debug/md-reader").as_path())
            ),
            Some(bundled)
        );
        assert_eq!(
            find_launcher(
                None,
                Some(repo.join("src-tauri/target/debug/md-reader").as_path())
            ),
            Some(dev)
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn parses_the_directory_services_shell() {
        assert_eq!(parse_user_shell("UserShell: /bin/zsh\n"), Some("/bin/zsh"));
        assert_eq!(parse_user_shell("no shell here"), None);
    }

    #[test]
    fn login_shell_can_see_ls_but_not_a_made_up_name() {
        assert!(shell_finds("ls"));
        assert!(!shell_finds("md-reader-not-a-real-command"));
    }
}
