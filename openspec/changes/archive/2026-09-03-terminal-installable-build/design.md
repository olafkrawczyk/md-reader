## Context

Tauri 2 project: `npm run tauri build` already produces `src-tauri/target/release/bundle/macos/md-reader.app`. The bundle currently contains only the app binary. There is no install or launcher story. The app is a single-window Tauri app (`app.mdr.desktop`); the Rust side has `main.rs`/`lib.rs` plus `workspace.rs`, no CLI handling.

## Goals / Non-Goals

**Goals:**
- One-command build, one-command install, one-command launch from any shell.
- Single-instance behavior so `md-reader` twice doesn't spawn duplicates.
- Keep it dumb-simple: no app store, no signing identity requirements, no auto-updates.

**Non-Goals:**
- Opening files/folders passed as CLI arguments (later change; the launcher reserves the argument slot).
- Code signing / notarization beyond ad-hoc.
- Windows/Linux bundles.
- Auto-update or version management.

## Decisions

- **Build command: `npm run build:app` → `tauri build`** with default release profile. Alternative considered: a `Makefile`-driven build; rejected — npm scripts already exist for everything else and Tauri owns the bundle pipeline.
- **Launcher: symlink, not a separate binary.** `md-reader` will be a symlink to `open`-style launching via a tiny wrapper script installed to `/usr/local/bin` (or `~/.local/bin` if not writable) that runs `open -a "md-reader" "$@"` after filtering its arguments. A dedicated Rust single-instance binary would need hand-rolled activation logic (NSRunningApplication / AppleScript) that `open -a` already provides for free. Alternative considered: symlink directly to the app binary inside the bundle; rejected — invoking the raw binary skips LaunchServices activation and creates a second instance instead of foregrounding the existing one.
- **Single instance via `open -a`.** LaunchServices deduplicates: if the app is running, `open -a` activates it. This satisfies the single-instance requirement with zero custom code. (Caveat documented below.)
- **Install step: npm script `install:app`** copying `src-tauri/target/release/bundle/macos/md-reader.app` to `/Applications` with `ditto` (preserves extended attributes and signatures better than `cp -R`) and creating the launcher link. Alternative considered: Makefile; rejected for consistency with the npm script vocabulary.
- **PATH target: `/usr/local/bin` preferred, `~/.local/bin` fallback.** No sudo when possible; script prints the export line for `~/.local/bin` if it isn't on PATH yet.

## Risks / Trade-offs

- [`open -a` single-instance relies on LaunchServices matching the installed bundle name] → Mitigation: launcher targets the app by name of the installed bundle; scenario test covers the second-run case. If LaunchServices ever spawns a duplicate, fallback is a tiny Rust launcher using the `tauri-plugin-single-instance`-style approach — noted, not built now.
- [Ad-hoc signed bundle quarantines differently across machines] → Out of scope: this is a personal build; Gatekeeper prompt on first open is acceptable and documented in the install output.
- [`/usr/local/bin` may not exist or not be writable] → Mitigation: fallback to `~/.local/bin` with a printed PATH hint; never requires sudo.
- [Bundle output path is Tauri-version dependent] → Mitigation: install script resolves the bundle path from `tauri build` output conventions in one variable, so a path change is a one-line fix.

## Migration Plan

New capability; nothing to migrate. Rollback: `rm -rf /Applications/md-reader.app $(which md-reader)`.

## Open Questions

None.