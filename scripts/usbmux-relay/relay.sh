#!/bin/sh
# Lets xtool in WSL reach the iPhone through Windows' Apple Devices service instead of usbipd,
# which hangs at "[Connecting]" (xtool-org/xtool#19). Run in WSL and leave it running:
#   sudo sh scripts/usbmux-relay/relay.sh
# Needs: Apple Devices app on Windows (opened once with the phone plugged in) and Windows Python on PATH.
D=$(dirname "$(readlink -f "$0")")
PY=${WINPY:-python.exe}
pkill usbmuxd 2>/dev/null
exec python3 "$D/wsl_relay.py" "$PY" "$(wslpath -w "$D/win_relay.py")"
