## 1. Release build

- [x] 1.1 Add `build:app` npm script (`tauri build`) to `package.json`; confirm `tauri.conf.json` bundle settings produce `md-reader.app` at the standard bundle path
- [x] 1.2 Verify the bundle launches standalone in release mode (no dev server), and record the resolved output path convention for the install script

## 2. Launcher

- [x] 2.1 Add `scripts/launch-md-reader` wrapper script: filters args (currently ignoring them), runs `open -a "md-reader"`; executable bit set
- [x] 2.2 Confirm `open -a` activates the existing instance when the app is already running (manual check; document fallback if not)

## 3. Install step

- [x] 3.1 Add `install:app` npm script that `ditto`s the bundle to `/Applications/md-reader.app` (replacing previous) and links the launcher into `/usr/local/bin`, falling back to `~/.local/bin` with a PATH hint when `/usr/local/bin` is not writable
- [x] 3.2 Make the bundle path in the install script a single resolved variable per design.md

## 4. Verification

- [x] 4.1 Fresh-install flow: clean build → install → `md-reader` opens the app from a new terminal session
- [x] 4.2 Single-instance flow: launch app, run `md-reader` again, confirm foreground activation and no second process
- [x] 4.3 Run `npm run lint`, `npm run typecheck`, and `npm run build` clean
- [x] 4.4 Validate change: `openspec validate terminal-installable-build --strict`