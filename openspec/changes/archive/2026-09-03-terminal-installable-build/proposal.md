## Why

The app currently only runs via `npm run tauri dev` (or a dev build buried in `target/`). There is no installable artifact and no way to launch it from a terminal, which is how this app is meant to be used day-to-day. This change produces a reproducible release build that installs like a normal macOS app and opens from the terminal with a short command.

## What Changes

- Add a release build script (`npm run build:app`) producing a signed-off, debug-free `.app` bundle via `tauri build`.
- Add a `docs`/install step that copies the `.app` bundle into `/Applications` (`make install` or equivalent npm script).
- Add a small CLI launcher: a tiny Rust binary (or symlink to the bundle's launcher) installed as `md-reader` on the user's `PATH` that opens the app, activating an existing instance if one is running.
- The launcher accepts an optional path argument that opens the app; passing paths is explicitly out of scope (no file/folder argument handling).

## Capabilities

### New Capabilities
- `distribution`: Build, install, and terminal-launch story — release bundle production, installation to /Applications, and a `md-reader` CLI launcher on PATH.

## Impact

- `package.json` — new `build:app` script.
- `src-tauri/tauri.conf.json` — possibly macOS bundle settings (binary name, minimum system version).
- `Makefile` or npm scripts — install target copying the bundle and linking the launcher.
- `src-tauri/` — small launcher binary crate (separate from the app's main binary).
- No runtime behavior of the app itself changes; no breaking changes to specs.