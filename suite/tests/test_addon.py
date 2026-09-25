"""Phase 2: mitmproxy addon + local API, with synthetic flows and a fake adb (no phone needed).
Skipped automatically when mitmproxy is not installed."""
import json
import os
import stat
import sys
import tempfile
import unittest
import urllib.request
from urllib.parse import urlencode

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))

try:
    from mitmproxy.test import tflow, tutils
    HAVE_MITM = True
except ImportError:  # pragma: no cover
    HAVE_MITM = False

FAKE_ADB = r'''#!/bin/sh
case "$*" in
  "devices -l") printf 'List of devices attached\nR58N123ABC device usb:1-1 product:o1s model:SM_G991B device:o1s transport_id:1\n' ;;
  "shell pm list packages -3") printf 'package:com.example.shop\npackage:com.flipkart.android\n' ;;
  "shell pm list packages") printf 'package:com.example.shop\npackage:com.flipkart.android\npackage:com.android.settings\n' ;;
  "shell dumpsys activity activities") printf '  mResumedActivity: ActivityRecord{1 u0 com.example.shop/.MainActivity t12}\n' ;;
  "shell settings get global http_proxy") printf '127.0.0.1:8080\n' ;;
  shell\ monkey*) printf 'Events injected: 1\n' ;;
  *) exit 0 ;;
esac
'''


@unittest.skipUnless(HAVE_MITM, "mitmproxy not installed")
class AddonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        adb = os.path.join(cls.tmp, "adb")
        with open(adb, "w") as f:
            f.write(FAKE_ADB)
        os.chmod(adb, os.stat(adb).st_mode | stat.S_IEXEC)
        os.environ["ADB"] = adb
        with open(os.path.join(cls.tmp, "app.html"), "w") as f:
            f.write("<html>Digital Lens</html>")
        import suite_addon
        cls.sa = suite_addon
        cls.state = suite_addon.State()
        cls.addon = suite_addon.DigitalLensAddon(state=cls.state, serve=False)
        cls.httpd = suite_addon.start_server(cls.state, port=0, web_root=cls.tmp)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def get(self, path):
        with urllib.request.urlopen(self.base + path, timeout=5) as r:
            return json.loads(r.read())

    def post(self, path, header=True):
        req = urllib.request.Request(self.base + path, data=b"", method="POST", headers={"X-Digital-Lens": "1"} if header else {})
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def flow(self, host, path, method=b"GET", content=b"", headers=()):
        f = tflow.tflow(req=tutils.treq(host=host, port=443, scheme=b"https", path=path.encode(), method=method, content=content))
        f.request.host = host
        for k, v in headers:
            f.request.headers[k] = v
        return f

    def test_1_flows_become_events(self):
        self.post("/api/clear")
        from test_decoders import fb_batch, fb_event
        self.addon.request(self.flow("app-measurement.com", "/a", b"POST", fb_batch([fb_event("add_to_cart", {"currency": "INR", "value": 2499.0})])))
        meta = urlencode({"custom_events": json.dumps([{"_eventName": "fb_mobile_add_to_cart", "_valueToSum": 2499, "fb_currency": "INR"}]),
                          "extinfo": json.dumps(["a2", "com.example.shop", 1, "1.0"])}).encode()
        self.addon.request(self.flow("graph.facebook.com", "/v18.0/123/activities", b"POST", meta, [("Content-Type", "application/x-www-form-urlencoded")]))
        self.addon.request(self.flow("business-api.tiktok.com", "/open_api/v1.3/app/batch/", b"POST", json.dumps({"batch": [{"event": "AddToCart", "properties": {"value": 2499}}]}).encode()))
        self.addon.request(self.flow("www.googleadservices.com", "/pagead/conversion/987/?label=abc&value=2499&bundleid=com.example.shop"))
        self.addon.request(self.flow("api.example.com", "/v1/cart"))  # app API: not tracking
        self.addon.request(self.flow("mitm.it", "/"))  # certificate page: ignored
        r = self.get("/api/events?since=0")
        got = [(e["platform"], e["type"]) for e in r["events"]]
        self.assertEqual(got, [("Firebase / GA4", "add_to_cart"), ("Meta App Events", "fb_mobile_add_to_cart"), ("TikTok", "AddToCart"), ("Google Ads", "app conversion")])
        e0 = r["events"][0]
        self.assertRegex(e0["time"], r"^\d\d:\d\d:\d\d$")
        self.assertEqual(e0["url"], "https://app-measurement.com/a")
        self.assertEqual(e0["foreground"], "com.example.shop", "foreground app from adb")
        self.assertEqual(r["matched"], 4)
        self.assertEqual(r["requests_seen"], 5)
        # incremental polling
        last = r["last_id"]
        self.assertEqual(self.get(f"/api/events?since={last}")["events"], [])
        self.addon.request(self.flow("app.adjust.com", "/event", b"POST", b"event_token=tok1&package_name=com.example.shop"))
        newer = self.get(f"/api/events?since={last}")["events"]
        self.assertEqual([(e["platform"], e["type"]) for e in newer], [("Adjust", "tok1")])

    def test_2_blocked_tls_is_reported(self):
        class Conn:
            sni = "inapps.appsflyersdk.com"

        class Data:
            conn = Conn()
        before = self.get("/api/health")["blocked"]
        self.addon.tls_failed_client(Data())
        self.addon.tls_failed_client(Data())  # de-duplicated within 30s
        ev = self.get("/api/events?since=0")["events"]
        blocked = [e for e in ev if e["platform"] == "Connection blocked"]
        self.assertEqual(len(blocked), 1)
        self.assertEqual(blocked[0]["params"]["host"], "inapps.appsflyersdk.com")
        self.assertIn("Android 7", blocked[0]["note"])
        self.assertEqual(self.get("/api/health")["blocked"], before + 1)

    def test_3_health_and_apps(self):
        h = self.get("/api/health")
        self.assertTrue(h["ok"])
        self.assertEqual(h["app"], "digital-lens-suite")
        self.assertTrue(h["adb"]["available"])
        self.assertEqual(h["adb"]["devices"][0]["serial"], "R58N123ABC")
        self.assertEqual(h["adb"]["devices"][0]["model"], "SM_G991B")
        self.assertEqual(h["adb"]["phone_proxy"], "127.0.0.1:8080")
        apps = self.get("/api/apps")
        self.assertEqual([a["package"] for a in apps["apps"]], ["com.example.shop", "com.flipkart.android"])
        self.assertEqual(apps["apps"][1]["name"], "Flipkart")
        self.assertEqual(len(self.get("/api/apps?all=1")["apps"]), 3)

    def test_4_mutations_need_header(self):
        code, body = self.post("/api/clear", header=False)
        self.assertEqual(code, 403)
        code, body = self.post("/api/launch?package=com.example.shop")
        self.assertEqual(code, 200)
        self.assertTrue(body["ok"])
        code, body = self.post("/api/launch?package=bad%3Brm%20-rf")
        self.assertFalse(body["ok"])
        code, body = self.post("/api/phone-proxy?state=on")
        self.assertTrue(body["ok"])
        code, body = self.post("/api/clear")
        self.assertEqual(body["buffered"], 0)

    def test_5_serves_ui(self):
        with urllib.request.urlopen(self.base + "/app.html", timeout=5) as r:
            self.assertIn(b"Digital Lens", r.read())
        with urllib.request.urlopen(self.base + "/", timeout=5) as r:  # redirect to the App Inspector
            self.assertIn("/app.html", r.geturl())

    def test_5b_proxy_endpoint_blocks_private_hosts(self):
        self.assertIn("blocked", self.get("/proxy?url=http%3A%2F%2F127.0.0.1%3A8088%2F")["error"])
        self.assertIn("http and https", self.get("/proxy?url=file%3A%2F%2F%2Fetc%2Fpasswd")["error"])

    def test_5c_phone_manager_configures_and_restores(self):
        calls = []

        class FakeAdb:
            available = True

            def devices(self):
                return [{"serial": "R58N123ABC", "state": "device"}, {"serial": "X1", "state": "unauthorized"}]

            def set_phone_proxy(self, on, serial=""):
                calls.append((on, serial))
                return {"ok": True, "error": ""}
        pm = self.sa.PhoneManager(FakeAdb())
        pm.tick()
        pm.tick()  # already configured: not repeated
        self.assertEqual(calls, [(True, "R58N123ABC")], "only authorised devices, once")
        pm.restore()
        self.assertEqual(calls[-1], (False, "R58N123ABC"))

    def test_7_certificate_check(self):
        sa = self.sa
        sa.save_saved({})
        self.state.checks = sa.Checks()
        code, body = self.post("/api/check-certificate")
        self.assertTrue(body["ok"])
        self.assertEqual(self.get("/api/health")["checks"]["cert"]["state"], "running")
        # Chrome's request to the test page arrives decrypted -> certificate trusted
        self.addon.request(self.flow("www.google-analytics.com", "/?digital-lens-check=1"))
        c = self.get("/api/health")["checks"]["cert"]
        self.assertEqual((c["state"], c["trusted"]), ("ok", True))
        # a failed check marks it untrusted
        self.post("/api/check-certificate")

        class Conn:
            sni = "www.google-analytics.com"

        class Data:
            conn = Conn()
        self.addon._blocked_seen.clear()
        self.addon.tls_failed_client(Data())
        c = self.get("/api/health")["checks"]["cert"]
        self.assertEqual((c["state"], c["trusted"]), ("failed", False))

    def test_8_app_check(self):
        sa = self.sa
        self.state.checks = sa.Checks()
        code, body = self.post("/api/check-app?package=com.example.shop")
        self.assertTrue(body["ok"])
        self.assertEqual(self.get("/api/health")["checks"]["app"]["state"], "running")
        self.addon.request(self.flow("www.googleadservices.com", "/pagead/conversion/1/?label=x&bundleid=com.example.shop"))
        a = self.get("/api/health")["checks"]["app"]
        self.assertEqual((a["state"], a["package"], a["events"]), ("ok", "com.example.shop", 1))
        # blocked: only TLS failures on tracking hosts, after the grace period
        self.post("/api/check-app?package=com.example.shop")

        class Conn:
            sni = "app-measurement.com"

        class Data:
            conn = Conn()
        self.addon._blocked_seen.clear()
        self.addon.tls_failed_client(Data())
        self.state.checks.app["started"] -= 11
        a = self.get("/api/health")["checks"]["app"]
        self.assertEqual(a["state"], "blocked")
        self.assertEqual(a["hosts"], ["app-measurement.com"])
        code, body = self.post("/api/check-app?package=bad%3Bid")
        self.assertFalse(body["ok"])

    def test_9_testing_toggle_install_cert_shutdown_cors(self):
        sa = self.sa
        calls = []

        class FakeAdb(sa.Adb):
            def set_phone_proxy(self, on, serial=""):
                calls.append(on)
                return {"ok": True, "error": ""}
        self.state.phones = sa.PhoneManager(FakeAdb())
        self.state.phones.configured = {"R58N123ABC"}
        self.post("/api/phone-proxy?state=off")
        self.assertFalse(self.get("/api/health")["testing"])
        self.assertEqual(calls, [False])
        self.post("/api/phone-proxy?state=on")
        self.assertTrue(self.get("/api/health")["testing"])
        self.state.phones = None
        # certificate install: copies the mitmproxy CA to the phone (or explains why not)
        code, body = self.post("/api/install-certificate")
        if sa.mitm_ca_file():
            self.assertEqual(body["file"], "Download/DigitalLens-certificate.crt")
        else:
            self.assertIn("certificate file was not found", body["error"])
        # shutdown only works inside mitmproxy
        called = []
        self.state.shutdown = lambda: called.append(1)
        code, body = self.post("/api/shutdown")
        self.assertTrue(body["ok"])
        import time
        time.sleep(0.5)
        self.assertEqual(called, [1])
        self.state.shutdown = None
        # no cross-site access: other websites cannot read the local API
        req = urllib.request.Request(self.base + "/api/health", headers={"Origin": "https://tappu001.github.io"})
        with urllib.request.urlopen(req, timeout=5) as r:
            self.assertIsNone(r.headers["Access-Control-Allow-Origin"])

    def test_6_no_adb(self):
        s = self.sa.State(adb=self.sa.Adb())
        s.adb.path = None
        a = self.sa.DigitalLensAddon(state=s, serve=False)
        a.request(self.flow("app-measurement.com", "/config/app/1%3A2", b"GET"))
        self.assertEqual(s.buffer.since(0)[0]["foreground"], "")


if __name__ == "__main__":
    unittest.main()
