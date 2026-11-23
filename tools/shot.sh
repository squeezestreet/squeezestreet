#!/bin/bash
# Screenshot the game in headless Chrome and print any console errors.
#   tools/shot.sh "<debug commands>" out.png [width] [height] [ms]
#   tools/shot.sh "scene,loc:beach,dayT:0.5" /tmp/beach.png 1280 720
#   tools/shot.sh "new" /tmp/prep-phone.png 390 844
# Debug commands are listed at the top of js/debug.js. ms = how long to let the page run (default 2500).
set -u
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
CMDS="${1:-}"; OUT="${2:?usage: shot.sh \"<debug commands>\" out.png [width] [height] [ms]}"
W="${3:-1280}"; H="${4:-720}"; MS="${5:-2500}"
PROFILE="$(mktemp -d)"
LOG="$(mktemp)"
URL="file://$DIR/index.html"
[ -n "$CMDS" ] && URL="$URL#debug=$CMDS"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --mute-audio --no-first-run \
  --force-device-scale-factor=1 --user-data-dir="$PROFILE" --window-size="$W,$H" \
  --virtual-time-budget="$MS" --enable-logging=stderr --v=0 \
  --screenshot="$OUT" "$URL" 2>"$LOG" >/dev/null
# console.error / uncaught exceptions only (font and favicon noise filtered out)
grep -E 'CONSOLE|Uncaught' "$LOG" | grep -Ev 'favicon|fonts\.g' | sed -E 's/^\[[^]]*\] *//' | head -40
rm -rf "$PROFILE" "$LOG"
[ -s "$OUT" ] && echo "saved $OUT (${W}x${H})" || { echo "screenshot failed"; exit 1; }
