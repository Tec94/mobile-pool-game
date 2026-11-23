#!/usr/bin/env bash
# All store screenshots: captures (web build served on :8765, see web.sh) into <work>/raw, slides into <out>.
# Usage: store/capture/run.sh <work-dir> <out-dir>   (run from the repo root)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd); work=$(realpath -m "$1"); out=$(realpath -m "$2"); mkdir -p "$work"
ts() { node --experimental-strip-types --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "$@"; }
ts "$here/mkrun.mts" > "$work/run.json"; ts "$here/mkstars.mts" > "$work/stars.json"
cd "$work" && node "$here/stage.mjs" && node "$here/nine.mjs" all 3.62 && node "$here/menus.mjs"
cd "$here/../.." && python3 store/compose-screenshots.py "$work/raw" "$out"
