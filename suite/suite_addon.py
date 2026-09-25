"""Digital Lens™ — App Inspector: mitmproxy addon + local web server.

Run with:  mitmdump -s suite_addon.py --listen-port 8080
The phone reaches the proxy through `adb reverse tcp:8080 tcp:8080` and a global
HTTP proxy of 127.0.0.1:8080 (the launchers set this up and remove it on exit).

What it does:
  * decodes analytics / ad SDK requests (decoders/platforms.py) into events
  * records TLS handshakes the app refused (untrusted certificate / pinning)
  * serves the Digital Lens web UI and a small JSON API on http://127.0.0.1:8088

API (localhost only):
  GET  /api/health             proxy + phone status
  GET  /api/events?since=<id>  events after <id>
  POST /api/clear              empty the event buffer
  GET  /api/apps[?all=1]       installed packages on the phone (third-party by default)
  POST /api/launch?package=…   open an app on the phone
  POST /api/phone-proxy?state=on|off   point the phone at the proxy / restore it
Mutating endpoints require the header "X-Digital-Lens: 1", so other websites open in
the browser cannot trigger them.
"""

from __future__ import annotations

import collections
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from decoders.platforms import Req, decode, is_tracking_host, tracking_allow_regex  # noqa: E402

VERSION = "1.0.0"
UI_HOST = "127.0.0.1"
UI_PORT = int(os.environ.get("DL_UI_PORT", "8088"))
PROXY_PORT = int(os.environ.get("DL_PROXY_PORT", "8080"))
# In the downloaded suite the web files sit next to this file; in the repository they are one level up.
WEB_ROOT = os.environ.get("DL_WEB_ROOT") or (HERE if os.path.isfile(os.path.join(HERE, "app.html")) else os.path.dirname(HERE))
MAX_EVENTS = 5000

PINNING_NOTE = ("The app refused the Digital Lens certificate, so this connection could not be read. "
                "Since Android 7, apps only trust user-installed certificates if their developers allow it "
                "(network security config), and some apps pin certificates. Chrome and debug/QA builds that "
                "trust user certificates work; most Play Store builds do not.")

KNOWN_APP_NAMES = {
    "com.amazon.mShop.android.shopping": "Amazon Shopping", "in.amazon.mShop.android.shopping": "Amazon India",
    "com.flipkart.android": "Flipkart", "com.myntra.android": "Myntra", "com.meesho.supply": "Meesho",
    "com.application.zomato": "Zomato", "in.swiggy.android": "Swiggy", "com.ril.ajio": "AJIO", "com.nykaa.app": "Nykaa",
    "com.bigbasket.mobileapp": "bigbasket", "com.grofers.customerapp": "Blinkit", "com.zeptoconsumerapp": "Zepto",
    "com.makemytrip": "MakeMyTrip", "com.booking": "Booking.com", "com.airbnb.android": "Airbnb", "com.ubercab": "Uber",
    "com.olacabs.customer": "Ola", "com.phonepe.app": "PhonePe", "net.one97.paytm": "Paytm", "com.google.android.apps.nbu.paisa.user": "Google Pay",
    "com.whatsapp": "WhatsApp", "com.instagram.android": "Instagram", "com.facebook.katana": "Facebook", "com.zhiliaoapp.musically": "TikTok",
    "com.snapchat.android": "Snapchat", "com.linkedin.android": "LinkedIn", "com.pinterest": "Pinterest", "com.spotify.music": "Spotify",
    "com.netflix.mediaclient": "Netflix", "com.android.chrome": "Chrome", "com.shopify.arrive": "Shop",
}


def now_ms() -> int:
    return int(time.time() * 1000)


# ---------------------------------------------------------------------------
# Event buffer (thread-safe)
# ---------------------------------------------------------------------------
class EventBuffer:
    def __init__(self, maxlen: int = MAX_EVENTS):
        self.lock = threading.Lock()
        self.items: collections.deque = collections.deque(maxlen=maxlen)
        self.next_id = 1
        self.requests_seen = 0
        self.matched = 0
        self.blocked = 0
        self.last_request_at: Optional[int] = None

    def note_request(self) -> None:
        with self.lock:
            self.requests_seen += 1
            self.last_request_at = now_ms()

    def add(self, evt: Dict[str, Any]) -> Dict[str, Any]:
        with self.lock:
            evt = dict(evt)
            evt["id"] = self.next_id
            self.next_id += 1
            evt.setdefault("ts", now_ms())
            evt["time"] = time.strftime("%H:%M:%S", time.localtime(evt["ts"] / 1000))
            if evt.get("platform") == "Connection blocked":
                self.blocked += 1
            elif evt.get("platform") != "Unknown":
                self.matched += 1
            self.items.append(evt)
            return evt

    def since(self, last_id: int, limit: int = 1000) -> List[Dict[str, Any]]:
        with self.lock:
            return [e for e in self.items if e["id"] > last_id][:limit]

    def clear(self) -> None:
        with self.lock:
            self.items.clear()
            self.matched = self.blocked = 0

    def stats(self) -> Dict[str, Any]:
        with self.lock:
            return {"buffered": len(self.items), "last_id": self.next_id - 1, "requests_seen": self.requests_seen,
                    "matched": self.matched, "blocked": self.blocked, "last_request_at": self.last_request_at}


# ---------------------------------------------------------------------------
# ADB (Android Debug Bridge)
# ---------------------------------------------------------------------------
class Adb:
    def __init__(self) -> None:
        self.path = os.environ.get("ADB") or shutil.which("adb") or self._sdk_path()
        self._foreground = ""
        self._foreground_at = 0.0

    @staticmethod
    def _sdk_path() -> Optional[str]:
        for base in (os.environ.get("ANDROID_HOME"), os.environ.get("ANDROID_SDK_ROOT"),
                     os.path.expanduser("~/Library/Android/sdk"), os.path.expanduser("~/Android/Sdk"),
                     os.path.join(os.environ.get("LOCALAPPDATA", ""), "Android", "Sdk")):
            if base:
                for name in ("adb", "adb.exe"):
                    p = os.path.join(base, "platform-tools", name)
                    if os.path.isfile(p):
                        return p
        return None

    @property
    def available(self) -> bool:
        return bool(self.path)

    def run(self, *args: str, timeout: float = 8.0, serial: str = "") -> Dict[str, Any]:
        if not self.path:
            return {"ok": False, "out": "", "error": "adb was not found. Install Android platform-tools and add adb to PATH."}
        try:
            cmd = [self.path, *(["-s", serial] if serial else []), *args]
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
            return {"ok": p.returncode == 0, "out": p.stdout, "error": p.stderr.strip()}
        except (OSError, subprocess.TimeoutExpired) as exc:
            return {"ok": False, "out": "", "error": str(exc)}

    def devices(self) -> List[Dict[str, str]]:
        r = self.run("devices", "-l")
        out = []
        for line in r["out"].splitlines()[1:]:
            parts = line.split()
            if len(parts) >= 2:
                d = {"serial": parts[0], "state": parts[1]}
                for kv in parts[2:]:
                    if ":" in kv:
                        k, v = kv.split(":", 1)
                        d[k] = v
                out.append(d)
        return out

    def packages(self, include_system: bool = False) -> List[Dict[str, str]]:
        r = self.run("shell", "pm", "list", "packages", *([] if include_system else ["-3"]))
        pkgs = sorted({l.split(":", 1)[1].strip() for l in r["out"].splitlines() if l.startswith("package:")})
        return [{"package": p, "name": KNOWN_APP_NAMES.get(p, "")} for p in pkgs]

    def launch(self, package: str) -> Dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9._]+", package or ""):
            return {"ok": False, "error": "Invalid package name."}
        return self.run("shell", "monkey", "-p", package, "-c", "android.intent.category.LAUNCHER", "1")

    def set_phone_proxy(self, on: bool, serial: str = "") -> Dict[str, Any]:
        """on: tunnel the proxy port over USB and point the phone's global HTTP proxy at it.
        off: remove the phone proxy (restores the phone's normal internet)."""
        if on:
            r1 = self.run("reverse", f"tcp:{PROXY_PORT}", f"tcp:{PROXY_PORT}", serial=serial)
            r2 = self.run("shell", "settings", "put", "global", "http_proxy", f"127.0.0.1:{PROXY_PORT}", serial=serial)
            return {"ok": r1["ok"] and r2["ok"], "error": r1["error"] or r2["error"]}
        r = self.run("shell", "settings", "put", "global", "http_proxy", ":0", serial=serial)
        self.run("reverse", "--remove", f"tcp:{PROXY_PORT}", serial=serial)
        return {"ok": r["ok"], "error": r["error"]}

    def phone_proxy(self) -> str:
        r = self.run("shell", "settings", "get", "global", "http_proxy", timeout=4)
        return r["out"].strip() if r["ok"] else ""

    def foreground(self) -> str:
        """Package of the app on screen (cached for 2 seconds)."""
        if time.time() - self._foreground_at < 2:
            return self._foreground
        self._foreground_at = time.time()
        r = self.run("shell", "dumpsys", "activity", "activities", timeout=4)
        m = re.search(r"(?:mResumedActivity|topResumedActivity|ResumedActivity)[^\n]*?\s([A-Za-z0-9._]+)/", r["out"])
        self._foreground = m.group(1) if m else ""
        return self._foreground


class PhoneManager:
    """With DL_MANAGE_PHONE=1 (set by the launchers): every phone that is plugged in with USB
    debugging allowed is pointed at the proxy automatically, and restored when the proxy stops."""

    def __init__(self, adb: Adb, interval: float = 3.0):
        self.adb = adb
        self.interval = interval
        self.configured: set = set()
        self._stop = threading.Event()

    def tick(self) -> None:
        ready = {d["serial"] for d in self.adb.devices() if d.get("state") == "device"}
        for serial in ready - self.configured:
            if self.adb.set_phone_proxy(True, serial=serial)["ok"]:
                self.configured.add(serial)
                print(f"  Phone {serial}: traffic now goes through Digital Lens.", flush=True)
        self.configured &= ready

    def start(self) -> None:
        def loop():
            while not self._stop.is_set():
                try:
                    self.tick()
                except Exception:
                    pass
                self._stop.wait(self.interval)
        threading.Thread(target=loop, name="digital-lens-phone", daemon=True).start()

    def restore(self) -> None:
        self._stop.set()
        for serial in list(self.configured):
            self.adb.set_phone_proxy(False, serial=serial)
            print(f"  Phone {serial}: proxy removed, normal internet restored.", flush=True)
        self.configured.clear()


# ---------------------------------------------------------------------------
# /proxy — lets the GTM Audit, GA4 Inspector and Website Insights workspaces fetch
# gtm.js / website HTML when Digital Lens is served by this suite (same contract as
# server.js and the Cloudflare Worker: {ok, status, url, text}).
# ---------------------------------------------------------------------------
PRIVATE_HOST = re.compile(r"^(localhost|.*\.localhost|.*\.local|.*\.internal|\[.*\]|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|0\.\d+\.\d+\.\d+|169\.254\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$", re.I)
FETCH_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
MAX_FETCH = 15 * 1024 * 1024


def proxy_fetch(url: str) -> Dict[str, Any]:
    import urllib.error
    import urllib.request
    try:
        parts = urlsplit(url)
    except ValueError:
        return {"ok": False, "error": "Add a valid ?url= parameter."}
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return {"ok": False, "error": "Only http and https URLs can be fetched."}
    if PRIVATE_HOST.match(parts.hostname):
        return {"ok": False, "error": "Private and local addresses are blocked."}
    req = urllib.request.Request(url, headers={"User-Agent": FETCH_UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = r.read(MAX_FETCH + 1)
            if len(data) > MAX_FETCH:
                return {"ok": False, "error": "The response is larger than 15 MB."}
            charset = r.headers.get_content_charset() or "utf-8"
            return {"ok": True, "status": r.status, "url": r.geturl(), "text": data.decode(charset, "replace")}
    except urllib.error.HTTPError as e:
        return {"ok": False, "status": e.code, "url": url, "text": e.read(MAX_FETCH).decode("utf-8", "replace")}
    except Exception as exc:
        return {"ok": False, "error": f"Couldn't reach {parts.hostname}: {exc}"}


# ---------------------------------------------------------------------------
# Web server (UI + API)
# ---------------------------------------------------------------------------
class State:
    def __init__(self, adb: Optional[Adb] = None, buffer: Optional[EventBuffer] = None):
        self.adb = adb or Adb()
        self.buffer = buffer or EventBuffer()
        self.started_at = now_ms()


def make_handler(state: State, web_root: str):
    class Handler(SimpleHTTPRequestHandler):
        server_version = "DigitalLensSuite/" + VERSION

        def __init__(self, *a, **kw):
            super().__init__(*a, directory=web_root, **kw)

        def log_message(self, fmt, *args):  # keep the terminal quiet
            pass

        def end_headers(self):
            if self.path.startswith("/api/") or self.path.endswith((".html", ".js", ".css")):
                self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def _json(self, body: Any, status: int = 200) -> None:
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _args(self) -> Dict[str, str]:
            return {k: v[-1] for k, v in parse_qs(urlsplit(self.path).query).items()}

        def do_GET(self):
            path = urlsplit(self.path).path
            if path in ("/", "/index-local"):
                self.send_response(302)
                self.send_header("Location", "/app.html#app")
                self.end_headers()
                return
            if path.startswith("/api/"):
                return self._api("GET", path)
            if path == "/proxy":
                return self._json(proxy_fetch(self._args().get("url", "")))
            return super().do_GET()

        def do_POST(self):
            path = urlsplit(self.path).path
            if not path.startswith("/api/"):
                return self._json({"ok": False, "error": "Not found"}, 404)
            if self.headers.get("X-Digital-Lens") != "1":
                return self._json({"ok": False, "error": "Missing X-Digital-Lens header."}, 403)
            return self._api("POST", path)

        def _api(self, method: str, path: str):
            a = self._args()
            s, adb = state.buffer, state.adb
            if path == "/api/health":
                devices = adb.devices() if adb.available else []
                ready = [d for d in devices if d.get("state") == "device"]
                return self._json({"ok": True, "app": "digital-lens-suite", "version": VERSION, "proxy_port": PROXY_PORT,
                                   "adb": {"available": adb.available, "devices": devices,
                                           "phone_proxy": adb.phone_proxy() if ready else ""},
                                   **s.stats()})
            if path == "/api/events":
                try:
                    since = int(a.get("since", "0") or 0)
                except ValueError:
                    since = 0
                return self._json({"ok": True, "events": s.since(since), **s.stats()})
            if path == "/api/apps":
                if not adb.available:
                    return self._json({"ok": False, "error": "adb was not found.", "apps": []})
                return self._json({"ok": True, "apps": adb.packages(include_system=a.get("all") == "1"), "foreground": adb.foreground()})
            if path == "/api/foreground":
                return self._json({"ok": True, "package": adb.foreground() if adb.available else ""})
            if method == "POST" and path == "/api/clear":
                s.clear()
                return self._json({"ok": True, **s.stats()})
            if method == "POST" and path == "/api/launch":
                return self._json(adb.launch(a.get("package", "")))
            if method == "POST" and path == "/api/phone-proxy":
                return self._json(adb.set_phone_proxy(a.get("state") == "on"))
            if method == "GET" and path in ("/api/clear", "/api/launch", "/api/phone-proxy"):
                return self._json({"ok": False, "error": "Use POST."}, 405)
            return self._json({"ok": False, "error": "Not found"}, 404)

    return Handler


def start_server(state: State, host: str = UI_HOST, port: int = UI_PORT, web_root: str = WEB_ROOT) -> ThreadingHTTPServer:
    httpd = ThreadingHTTPServer((host, port), make_handler(state, web_root))
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, name="digital-lens-ui", daemon=True).start()
    return httpd


# ---------------------------------------------------------------------------
# mitmproxy addon
# ---------------------------------------------------------------------------
def flow_to_req(flow) -> Req:
    r = flow.request
    path, _, query = r.path.partition("?")
    try:
        body = r.get_content(strict=False) or b""
    except Exception:
        body = r.raw_content or b""
    headers = {k: v for k, v in r.headers.items() if k.lower() != "content-encoding"}
    return Req(method=r.method, scheme=r.scheme, host=r.pretty_host, path=path or "/", query=query, headers=headers, body=body)


class DigitalLensAddon:
    def __init__(self, state: Optional[State] = None, serve: bool = True):
        self.state = state or State()
        self.serve = serve
        self.httpd: Optional[ThreadingHTTPServer] = None
        self._blocked_seen: Dict[str, float] = {}
        self.phones: Optional[PhoneManager] = None

    # mitmproxy lifecycle -------------------------------------------------
    def configure(self, updated):
        # Tracking-only mode (default): only analytics / ad SDK hosts are decrypted. Everything
        # else passes through untouched, so the app keeps working even if it pins its own API.
        # Set DL_CAPTURE_ALL=1 to decrypt every host.
        try:
            from mitmproxy import ctx
            if os.environ.get("DL_CAPTURE_ALL") != "1" and "allow_hosts" in ctx.options.keys() and not ctx.options.allow_hosts and not ctx.options.ignore_hosts:
                ctx.options.allow_hosts = [tracking_allow_regex()]
        except Exception:
            pass

    def running(self):
        if self.serve and not self.httpd:
            try:
                self.httpd = start_server(self.state)
                print(f"\n  Digital Lens App Inspector: http://{UI_HOST}:{UI_PORT}\n  Proxy listening on port {PROXY_PORT}.\n", flush=True)
            except OSError as exc:
                print(f"  Could not start the web UI on port {UI_PORT}: {exc}", flush=True)
        if os.environ.get("DL_MANAGE_PHONE") == "1" and self.state.adb.available and not self.phones:
            self.phones = PhoneManager(self.state.adb)
            self.phones.start()
        elif os.environ.get("DL_MANAGE_PHONE") == "1" and not self.state.adb.available:
            print("  adb was not found, so the phone cannot be connected automatically. Install Android platform-tools.", flush=True)

    def done(self):
        if self.phones:
            self.phones.restore()
        if self.httpd:
            self.httpd.shutdown()

    # traffic -------------------------------------------------------------
    def request(self, flow):
        host = flow.request.pretty_host
        if host in ("mitm.it",):
            return
        self.state.buffer.note_request()
        req = flow_to_req(flow)
        try:
            events = decode(req)
        except Exception as exc:  # never break the proxy
            events = [{"platform": "Unknown", "type": "decode error", "params": {"host": host}, "app": "", "note": str(exc)}]
        fg = ""
        if events and self.state.adb.available:
            fg = self.state.adb.foreground()
        for e in events:
            e = dict(e)
            e.update({"method": req.method, "host": req.host, "path": req.path, "url": req.url[:2000], "foreground": fg})
            self.state.buffer.add(e)

    def tls_failed_client(self, data):
        """The app rejected our certificate (not trusted, or pinned)."""
        try:
            host = data.conn.sni or (data.context.server.address[0] if data.context.server.address else "")
        except Exception:
            host = ""
        host = host or "unknown host"
        last = self._blocked_seen.get(host, 0)
        if time.time() - last < 30:
            return
        self._blocked_seen[host] = time.time()
        fg = self.state.adb.foreground() if self.state.adb.available else ""
        self.state.buffer.add({"platform": "Connection blocked", "type": "TLS handshake failed", "params": {"host": host},
                               "app": "", "note": PINNING_NOTE, "host": host, "path": "", "url": f"https://{host}/",
                               "method": "CONNECT", "foreground": fg, "tracking": is_tracking_host(host)})


addons = [DigitalLensAddon()] if "mitmproxy" in sys.modules else []
