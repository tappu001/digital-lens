#!/usr/bin/env bash
# Digital Lens™ App Inspector — macOS / Linux launcher.
# Sets up Python + mitmproxy (first run only), starts the proxy, connects the phone over USB
# and opens http://127.0.0.1:8088. Press Ctrl+C to stop; the phone's normal internet is restored.
set -e
cd "$(dirname "$0")"

PY="$(command -v python3 || command -v python || true)"
if [ -z "$PY" ]; then
  echo "Python 3.10+ is required: https://www.python.org/downloads/"
  exit 1
fi
if [ ! -x .venv/bin/python ]; then
  echo "Setting up the Python environment (first run only)..."
  "$PY" -m venv .venv
fi
. .venv/bin/activate
python -m pip install -q --disable-pip-version-check --upgrade pip setuptools wheel
python -m pip install -q --disable-pip-version-check -r requirements.txt

if ! command -v adb >/dev/null 2>&1; then
  for d in "$ANDROID_HOME/platform-tools" "$HOME/Library/Android/sdk/platform-tools" "$HOME/Android/Sdk/platform-tools"; do
    [ -x "$d/adb" ] && export PATH="$d:$PATH" && break
  done
fi
if command -v adb >/dev/null 2>&1; then
  adb start-server >/dev/null 2>&1 || true
else
  echo "WARNING: adb was not found. Install Android platform-tools: https://developer.android.com/tools/releases/platform-tools"
fi

export DL_MANAGE_PHONE=1
( sleep 4; (command -v open >/dev/null && open http://127.0.0.1:8088) || (command -v xdg-open >/dev/null && xdg-open http://127.0.0.1:8088) || true ) >/dev/null 2>&1 &
echo
echo "  Digital Lens App Inspector is starting: http://127.0.0.1:8088"
echo "  Press Ctrl+C to stop (the phone's normal internet is restored)."
echo
mitmdump -s suite_addon.py --listen-host 127.0.0.1 --listen-port 8080 --set flow_detail=0
