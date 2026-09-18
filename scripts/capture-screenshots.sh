#!/usr/bin/env bash
# Captures the three README screenshots from the real md-reader app.
#
# Requirements (grant to the app that hosts this shell — e.g. Ghostty):
#   1. System Settings → Privacy & Security → Screen Recording
#   2. System Settings → Privacy & Security → Accessibility
# Screen Recording usually needs the host app to be quit and reopened.
#
# Usage: bash scripts/capture-screenshots.sh
#
# Output: docs/screenshots/{01-reader,02-split,03-dark}.png at native Retina.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEMO="$ROOT/docs/demo"
OUT="$ROOT/docs/screenshots"
APP="${MDR_APP:-$ROOT/src-tauri/target/release/bundle/macos/md-reader.app}"
BIN="$APP/Contents/MacOS/md-reader"
PROC="md-reader"

# Logical (points) geometry. The display is 2560x1440, so this leaves margin.
WIN_X=140
WIN_Y=90
WIN_W=1440
WIN_H=920
REGION="$WIN_X,$WIN_Y,$WIN_W,$WIN_H"

mkdir -p "$OUT"

say() { printf '%s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }

preflight() {
  if ! screencapture -x "$OUT/.preflight.png" 2>/dev/null; then
    cat >&2 <<'EOF'
error: screen capture is not permitted.

Grant Screen Recording (and Accessibility) to your terminal app, then
quit and reopen it:
  System Settings → Privacy & Security → Screen Recording
  System Settings → Privacy & Security → Accessibility
EOF
    exit 1
  fi
  rm -f "$OUT/.preflight.png"

  if ! osascript -e 'tell application "System Events" to get name of first process' >/dev/null 2>&1; then
    cat >&2 <<'EOF'
error: Accessibility is not permitted.

Grant Accessibility to your terminal app, then rerun:
  System Settings → Privacy & Security → Accessibility
EOF
    exit 1
  fi
}

osax() { osascript "$@" 2>/dev/null; }

activate() {
  osax -e "tell application \"System Events\" to set frontmost of process \"$PROC\" to true"
}

wait_for_window() {
  for _ in $(seq 1 60); do
    if osax -e "tell application \"System Events\" to tell process \"$PROC\" to exists window 1" | grep -q true; then
      return 0
    fi
    sleep 0.5
  done
  warn "md-reader window never appeared"
  return 1
}

set_bounds() {
  osax -e "tell application \"System Events\" to tell process \"$PROC\" to set position of window 1 to {$WIN_X, $WIN_Y}" \
       -e "tell application \"System Events\" to tell process \"$PROC\" to set size of window 1 to {$WIN_W, $WIN_H}"
}

# Clicks the first accessible control whose title matches exactly.
# Prints "clicked" on success, "missing" otherwise.
click_title() {
  osascript - "$1" <<'APPLESCRIPT' 2>/dev/null
using terms from application "System Events"
	on clickTitle(el, wanted, depth)
		if depth > 16 then return "missing"
		try
			set r to role of el
		on error
			return "missing"
		end try
		if r is "AXButton" or r is "AXCheckBox" or r is "AXRadioButton" or r is "AXPopUpButton" then
			set t to ""
			try
				set t to title of el
			end try
			if t is wanted then
				click el
				return "clicked"
			end if
		end if
		try
			set kids to UI elements of el
		on error
			return "missing"
		end try
		repeat with k in kids
			set res to my clickTitle(k, wanted, depth + 1)
			if res is "clicked" then return "clicked"
		end repeat
		return "missing"
	end clickTitle
end using terms from

on run argv
	set wanted to item 1 of argv
	tell application "System Events"
		tell process "md-reader"
			set frontmost to true
			return my clickTitle(window 1, wanted, 0)
		end tell
	end tell
end run
APPLESCRIPT
}

capture() {
  sleep 1.2
  screencapture -x -o -R"$REGION" "$OUT/$1.png"
  say "  captured $1.png"
}

# --- run --------------------------------------------------------------------

preflight

say "Stopping any running md-reader…"
pkill -f "md-reader.app/Contents/MacOS/md-reader" 2>/dev/null
sleep 1

say "Launching md-reader with the demo vault…"
nohup "$BIN" "$DEMO/Welcome.md" >/tmp/mdr-shot.log 2>&1 &
wait_for_window || exit 1
sleep 1.5
set_bounds
activate

say "Capturing reader (light)…"
capture 01-reader

say "Capturing reader (dark)…"
click_title "Settings" >/dev/null
sleep 0.6
if [ "$(click_title "Dark")" = "clicked" ]; then
  click_title "Close" >/dev/null
  activate
  capture 02-dark
  click_title "Settings" >/dev/null
  sleep 0.6
  click_title "Light" >/dev/null
  click_title "Close" >/dev/null
  sleep 0.6
else
  warn "dark appearance option not found; skipping 02-dark"
  click_title "Close" >/dev/null
fi

say "Capturing split view…"
if [ "$(click_title "Split View (⌘⌥E)")" = "clicked" ]; then
  capture 03-split
  click_title "Split View (⌘⌥E)" >/dev/null
else
  warn "split toggle not found; skipping 03-split"
fi

say "Done. Screenshots in $OUT"
