"""Digital Lens™ helper: runs the App Inspector proxy in the background.

    run_agent.py              start the helper (does nothing if it is already running)
    run_agent.py --open       start it if needed, then open App Inspector in the browser
    run_agent.py --install    Windows: create the desktop icon (starts the helper hidden, opens App Inspector)
    run_agent.py --uninstall  Windows: remove the desktop icon and stop the helper

Nothing starts with Windows: the helper only runs after you open App Inspector from the icon.

The helper points a plugged-in phone at the proxy automatically (DL_MANAGE_PHONE=1) and
restores the phone when it stops. Output goes to logs/helper.log.
"""

import json
import os
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
UI_PORT = int(os.environ.get("DL_UI_PORT", "8088"))
PROXY_PORT = os.environ.get("DL_PROXY_PORT", "8080")
URL = f"http://127.0.0.1:{UI_PORT}/app.html#app"
NAME = "Digital Lens App Inspector"


def running() -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{UI_PORT}/api/health", timeout=2) as r:
            return json.loads(r.read()).get("app") == "digital-lens-suite"
    except Exception:
        return False


def port_taken() -> bool:
    """Something already listens on the UI port (for example a busy helper): never start a second one."""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1)
        return sock.connect_ex(("127.0.0.1", UI_PORT)) == 0


def open_when_ready(timeout: float = 60) -> None:
    end = time.time() + timeout
    while time.time() < end:
        if running():
            webbrowser.open(URL)
            return
        time.sleep(0.5)


# ---------------------------------------------------------------------------
# Windows: desktop icon
# ---------------------------------------------------------------------------
def pythonw() -> str:
    exe = sys.executable
    cand = os.path.join(os.path.dirname(exe), "pythonw.exe")
    return cand if os.path.isfile(cand) else exe


def vbs(open_browser: bool = True) -> str:
    """A .vbs file runs the helper without a console window."""
    args = f'""{pythonw()}"" ""{os.path.join(HERE, "run_agent.py")}""' + (" --open" if open_browser else "")
    return ('Set sh = CreateObject("WScript.Shell")\r\n'
            f'sh.CurrentDirectory = "{HERE}"\r\n'
            f'sh.Run "{args}", 0, False\r\n')


def desktop_dir() -> str:
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-Command", "[Environment]::GetFolderPath('Desktop')"],
                             capture_output=True, text=True, timeout=20).stdout.strip()
        if out:
            return out
    except Exception:
        pass
    return os.path.join(os.path.expanduser("~"), "Desktop")


def install() -> int:
    if os.name != "nt":
        print("The desktop icon is created on Windows only. On macOS / Linux run ./start.sh.")
        return 0
    open_vbs = os.path.join(HERE, "Open App Inspector.vbs")
    with open(open_vbs, "w", encoding="utf-8") as f:
        f.write(vbs(open_browser=True))
    icon = os.path.join(HERE, "favicon.ico")
    lnk = os.path.join(desktop_dir(), f"{NAME}.lnk")
    ps = ("$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:DL_LNK);"
          "$s.TargetPath='wscript.exe';$s.Arguments='\"'+$env:DL_VBS+'\"';$s.WorkingDirectory=$env:DL_DIR;"
          "if(Test-Path $env:DL_ICON){$s.IconLocation=$env:DL_ICON};$s.Description='Open Digital Lens App Inspector';$s.Save()")
    env = dict(os.environ, DL_LNK=lnk, DL_VBS=open_vbs, DL_DIR=HERE, DL_ICON=icon)
    try:
        subprocess.run(["powershell", "-NoProfile", "-Command", ps], env=env, timeout=30, check=True)
        print(f"Desktop icon created: {lnk}")
    except Exception as exc:
        print(f"Could not create the desktop icon ({exc}). Use 'Open App Inspector.vbs' in the suite folder instead.")
    return 0


def uninstall() -> int:
    for p in (os.path.join(desktop_dir(), f"{NAME}.lnk"),):
        try:
            os.remove(p)
            print(f"Removed {p}")
        except OSError:
            pass
    if running():
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{UI_PORT}/api/shutdown", data=b"", method="POST", headers={"X-Digital-Lens": "1"})
            urllib.request.urlopen(req, timeout=5)
            print("Stopped the running helper.")
        except Exception:
            pass
    return 0


# ---------------------------------------------------------------------------
def main(argv) -> int:
    if "--install" in argv:
        return install()
    if "--uninstall" in argv:
        return uninstall()
    if running() or port_taken():
        if "--open" in argv:
            webbrowser.open(URL)
        return 0
    os.environ.setdefault("DL_MANAGE_PHONE", "1")
    os.makedirs(os.path.join(HERE, "logs"), exist_ok=True)
    if sys.stdout is None or "--log" in argv or os.path.basename(sys.executable).lower().startswith("pythonw"):
        log = open(os.path.join(HERE, "logs", "helper.log"), "a", buffering=1, encoding="utf-8")
        sys.stdout = sys.stderr = log
    if "--open" in argv:
        threading.Thread(target=open_when_ready, daemon=True).start()
    os.chdir(HERE)
    from mitmproxy.tools.main import mitmdump
    return mitmdump(["-s", os.path.join(HERE, "suite_addon.py"), "--listen-host", "127.0.0.1", "--listen-port", str(PROXY_PORT),
                     "--set", "flow_detail=0", "--set", "termlog_verbosity=warn"]) or 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
