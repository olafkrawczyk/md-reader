#!/usr/bin/env bash
# Installs the built md-reader.app bundle into /Applications and puts the
# `md-reader` launcher on PATH. No sudo: /usr/local/bin is preferred when
# writable, ~/.local/bin is the fallback.
#
# Gatekeeper may prompt on first launch — this is an ad-hoc signed,
# locally built bundle.
set -euo pipefail

# Bundle path convention for Tauri 2 release builds. Single variable on
# purpose: a Tauri bump that moves the output is a one-line fix.
BUNDLE_PATH="src-tauri/target/release/bundle/macos/md-reader.app"
INSTALLED_APP="/Applications/md-reader.app"
LAUNCHER="$(cd "$(dirname "$0")" && pwd)/launch-md-reader"

if [ ! -d "$BUNDLE_PATH" ]; then
  echo "error: bundle not found at $BUNDLE_PATH — run 'npm run build:app' first" >&2
  exit 1
fi

# Replace any previous copy; ditto preserves extended attributes and the
# ad-hoc signature (a plain cp -R does not).
rm -rf "$INSTALLED_APP"
ditto "$BUNDLE_PATH" "$INSTALLED_APP"
echo "installed $INSTALLED_APP"

if [ -d /usr/local/bin ] && [ -w /usr/local/bin ]; then
  BIN_DIR="/usr/local/bin"
else
  BIN_DIR="$HOME/.local/bin"
  mkdir -p "$BIN_DIR"
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *)
      echo "note: $BIN_DIR is not on your PATH yet — add this to your shell profile:"
      echo "  export PATH=\"$BIN_DIR:\$PATH\""
      ;;
  esac
fi

ln -sf "$LAUNCHER" "$BIN_DIR/md-reader"
echo "launcher: $BIN_DIR/md-reader -> $LAUNCHER"
