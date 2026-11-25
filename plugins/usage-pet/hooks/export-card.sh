#!/bin/sh
# Clawd report card export (Linux). Reads the card SVG on stdin, screenshots it
# at 1200x675 with the first of Chrome, Chromium or Edge found on PATH, saves
# the PNG to <pictures>/Clawd Reports, puts it on the clipboard with wl-copy or
# xclip when one exists, and keeps only the latest <keep> Clawd-report-*.png
# files (older ones go to the trash, they are never deleted outright).
# Success: stdout is the PNG's full path, prefixed by "nocopy\n" when no
# clipboard tool was found. Failure: the reason on stderr, non-zero exit code.
set -eu

browser=''
for b in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge microsoft-edge-stable; do
  if command -v "$b" >/dev/null 2>&1; then
    browser=$b
    break
  fi
done
if [ -z "$browser" ]; then
  echo 'Google Chrome, Chromium or Microsoft Edge not found' >&2
  exit 1
fi

# xdg-user-dir prints $HOME when PICTURES is not configured; then default to ~/Pictures
pictures=$(xdg-user-dir PICTURES 2>/dev/null || true)
if [ -z "$pictures" ] || [ "$pictures" = "$HOME" ]; then
  pictures=$HOME/Pictures
fi
dir="$pictures/Clawd Reports"
mkdir -p "$dir"

# Work inside $dir, not /tmp: snap-packaged Chromium has a private /tmp and
# could not read the SVG otherwise.
work=$(mktemp -d "$dir/clawd-card-tmp.XXXXXX")
trap 'rm -rf "$work"' EXIT
# dash does not run the EXIT trap on signals; exit so the cleanup still runs
trap 'exit 1' HUP INT TERM
cat > "$work/card.svg"

# Chrome turns a bare path into an escaped file URL; a hand-built file:// URL breaks on #, ? or % in the path
timeout -k 5 25 "$browser" --headless --disable-gpu --no-first-run --no-default-browser-check --disable-extensions --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,675 --user-data-dir="$work/profile" --screenshot="$work/card.png" "$work/card.svg" </dev/null >/dev/null 2>"$work/browser.log" || true
if [ ! -s "$work/card.png" ]; then
  last=$(grep . "$work/browser.log" 2>/dev/null | tail -n 1)
  if [ -n "$last" ]; then
    echo "the browser did not write a screenshot ($browser): $last" >&2
  else
    echo "the browser did not write a screenshot ($browser)" >&2
  fi
  exit 1
fi

out="$dir/$1"
mv "$work/card.png" "$out"

copied=0
# wl-copy and xclip leave a background process serving the clipboard; keep its
# stdio closed so the caller's process.run does not wait on an inherited pipe.
# timeout 5: wl-copy can wait for the selection forever on a compositor without data-control.
if [ -n "${WAYLAND_DISPLAY:-}" ] && command -v wl-copy >/dev/null 2>&1; then
  if timeout 5 wl-copy --type image/png < "$out" >/dev/null 2>&1; then
    copied=1
  fi
elif [ -n "${DISPLAY:-}" ] && command -v xclip >/dev/null 2>&1; then
  if timeout 5 xclip -selection clipboard -t image/png -i "$out" </dev/null >/dev/null 2>&1; then
    copied=1
  fi
fi

ls -t "$dir"/Clawd-report-*.png | tail -n "+$(( $2 + 1 ))" | while IFS= read -r old; do
  gio trash "$old" >/dev/null 2>&1 || true
done

if [ "$copied" -eq 0 ]; then
  printf 'nocopy\n'
fi
printf %s "$out"
