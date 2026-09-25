#!/usr/bin/env bash
# Removes the Digital Lens proxy from the phone. Use only if the phone has no internet after
# the launcher was closed without Ctrl+C.
adb shell settings put global http_proxy :0 && adb reverse --remove-all && echo "Phone proxy removed."
