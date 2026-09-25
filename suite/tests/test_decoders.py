"""Phase 1: decoder tests with synthetic SDK requests. Run: python -m unittest discover -s suite/tests"""
import gzip
import json
import os
import struct
import sys
import unittest
from urllib.parse import urlencode

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from decoders.platforms import Req, decode, pb_fields  # noqa: E402


# --- tiny protobuf encoder for building Firebase payloads -----------------
def varint(n):
    n &= (1 << 64) - 1
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        out.append(b | (0x80 if n else 0))
        if not n:
            return bytes(out)


def f_bytes(num, data):
    data = data.encode() if isinstance(data, str) else data
    return varint(num << 3 | 2) + varint(len(data)) + data


def f_int(num, v):
    return varint(num << 3) + varint(v)


def f_double(num, v):
    return varint(num << 3 | 1) + struct.pack("<d", v)


def fb_param(name, value=None, nested=None):
    b = f_bytes(1, name)
    if isinstance(value, str):
        b += f_bytes(2, value)
    elif isinstance(value, int):
        b += f_int(3, value)
    elif isinstance(value, float):
        b += f_double(5, value)
    for item in nested or []:
        b += f_bytes(6, b"".join(f_bytes(1, fb_param(k, v)) for k, v in item.items()))
    return b


def fb_event(name, params, ts=1727000000000, nested=None):
    b = b"".join(f_bytes(1, fb_param(k, v)) for k, v in params.items())
    if nested:
        b += f_bytes(1, fb_param("items", nested=nested))
    return b + f_bytes(2, name) + f_int(3, ts)


def fb_batch(events, package="com.example.shop", user_props=None):
    bundle = f_int(1, 1) + b"".join(f_bytes(2, e) for e in events)
    for k, v in (user_props or {}).items():
        bundle += f_bytes(3, f_int(1, 1) + f_bytes(2, k) + f_bytes(3, v))
    bundle += f_bytes(8, "android") + f_bytes(9, "14") + f_bytes(10, "Pixel 8") + f_bytes(14, package) + f_bytes(16, "5.2.0") + f_bytes(25, "1:123456:android:abc123")
    return f_bytes(1, bundle)


def by(events, name):
    return next(e for e in events if e["type"] == name)


class FirebaseTests(unittest.TestCase):
    def batch(self):
        return fb_batch([
            fb_event("_f", {"_o": "auto", "_c": 1}),
            fb_event("_vs", {"_o": "auto", "_sn": "ProductScreen", "_sc": "ProductActivity"}),
            fb_event("add_to_cart", {"currency": "INR", "value": 2499.0}, nested=[{"item_id": "SKU-4471", "item_name": "Trail Shoe", "price": 2499.0, "quantity": 1}]),
        ], user_props={"_fot": "1727000000000"})

    def test_protobuf_batch(self):
        ev = decode(Req(method="POST", host="app-measurement.com", path="/a", body=self.batch()))
        self.assertEqual([e["type"] for e in ev], ["first_open", "screen_view", "add_to_cart"])
        self.assertTrue(all(e["platform"] == "Firebase / GA4" and e["app"] == "com.example.shop" for e in ev))
        atc = by(ev, "add_to_cart")
        self.assertEqual(atc["params"]["currency"], "INR")
        self.assertEqual(atc["params"]["value"], "2499")
        self.assertEqual(atc["params"]["items[0].item_id"], "SKU-4471")
        self.assertEqual(atc["params"]["items[0].quantity"], "1")
        self.assertEqual(atc["params"]["gmp_app_id"], "1:123456:android:abc123")
        sv = by(ev, "screen_view")
        self.assertEqual(sv["params"]["firebase_screen"], "ProductScreen")
        self.assertIn("_vs", sv["note"])

    def test_gzip_body(self):
        ev = decode(Req(method="POST", host="app-measurement.com", path="/a", headers={"Content-Encoding": "gzip"}, body=gzip.compress(self.batch())))
        self.assertEqual(len(ev), 3)

    def test_unreadable_body_is_kept(self):
        ev = decode(Req(method="POST", host="app-measurement.com", path="/a", body=b"\xff\xfe\x00garbage"))
        self.assertEqual(ev[0]["type"], "upload (not decoded)")

    def test_config_fetch(self):
        ev = decode(Req(host="app-measurement.com", path="/config/app/1%3A123%3Aandroid%3Aabc", query="platform=android&gmp_version=233"))
        self.assertEqual(ev[0]["type"], "config_fetch")
        self.assertEqual(ev[0]["params"]["gmp_app_id"], "1:123:android:abc")


class GA4Tests(unittest.TestCase):
    def test_measurement_protocol_json(self):
        body = json.dumps({"app_instance_id": "abc", "events": [{"name": "purchase", "params": {"currency": "INR", "value": 2499, "items": [{"item_id": "SKU-1"}]}}]}).encode()
        ev = decode(Req(method="POST", host="www.google-analytics.com", path="/mp/collect", query="firebase_app_id=1:1:android:x&api_secret=SECRET123", body=body))
        self.assertEqual(ev[0]["platform"], "GA4 (Measurement Protocol)")
        self.assertEqual(ev[0]["type"], "purchase")
        self.assertEqual(ev[0]["params"]["items[0].item_id"], "SKU-1")
        self.assertNotIn("SECRET123", json.dumps(ev), "api_secret must be masked")

    def test_gtag_collect_batch(self):
        q = urlencode({"v": "2", "tid": "G-ABC123", "cid": "1.2", "cu": "INR"})
        body = "en=view_item&ep.item_list=home&pr1=idSKU-9~nmShoe~pr999\nen=add_to_cart&epn.value=999"
        ev = decode(Req(method="POST", host="region1.google-analytics.com", path="/g/collect", query=q, body=body.encode()))
        self.assertEqual([e["type"] for e in ev], ["view_item", "add_to_cart"])
        self.assertEqual(ev[0]["params"]["items[0].item_id"], "SKU-9")
        self.assertEqual(ev[0]["params"]["items[0].item_name"], "Shoe")
        self.assertEqual(ev[1]["params"]["value"], "999")
        self.assertEqual(ev[1]["params"]["measurement_id"], "G-ABC123")


class MetaTests(unittest.TestCase):
    def fields(self):
        return {
            "event": "CUSTOM_APP_EVENTS",
            "custom_events": json.dumps([
                {"_eventName": "fb_mobile_add_to_cart", "_valueToSum": 2499, "fb_currency": "INR", "fb_content_id": "SKU-4471", "fb_content_type": "product", "_logTime": 1727000000},
                {"_eventName": "fb_mobile_activate_app", "_implicitlyLogged": "1"},
            ]),
            "extinfo": json.dumps(["a2", "com.example.shop", 52, "5.2.0", "14", "Pixel 8"]),
            "advertiser_id": "38400000-8cf0-11bd-b23e-10b96e40000d",
            "access_token": "123|secret",
        }

    def test_urlencoded(self):
        ev = decode(Req(method="POST", host="graph.facebook.com", path="/v18.0/1234567890/activities", headers={"Content-Type": "application/x-www-form-urlencoded"}, body=urlencode(self.fields()).encode()))
        atc = by(ev, "fb_mobile_add_to_cart")
        self.assertEqual(atc["platform"], "Meta App Events")
        self.assertEqual(atc["app"], "com.example.shop")
        self.assertEqual(atc["params"]["value"], "2499")
        self.assertEqual(atc["params"]["fb_currency"], "INR")
        self.assertEqual(atc["params"]["fb_content_id"], "SKU-4471")
        self.assertEqual(atc["params"]["app_id"], "1234567890")
        self.assertIn("automatically", by(ev, "fb_mobile_activate_app")["note"])
        self.assertNotIn("123|secret", json.dumps(ev))

    def test_multipart(self):
        b = "3i2ndDfv2rTHiSisAbouNdArYfORhtTPEefj3q2f"
        body = "".join(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n' for k, v in self.fields().items()) + f"--{b}--\r\n"
        ev = decode(Req(method="POST", host="graph.facebook.com", path="/v18.0/1234567890/activities", headers={"Content-Type": f"multipart/form-data; boundary={b}"}, body=body.encode()))
        self.assertEqual([e["type"] for e in ev], ["fb_mobile_add_to_cart", "fb_mobile_activate_app"])

    def test_install_ping(self):
        ev = decode(Req(method="POST", host="graph.facebook.com", path="/v18.0/1234567890/activities", body=urlencode({"event": "MOBILE_APP_INSTALL"}).encode()))
        self.assertEqual(ev[0]["type"], "MOBILE_APP_INSTALL")


class GoogleAdsTests(unittest.TestCase):
    def test_app_conversion(self):
        q = urlencode({"label": "AbC-D_efG", "value": "2499", "currency_code": "INR", "bundleid": "com.example.shop", "appversion": "5.2.0"})
        ev = decode(Req(host="www.googleadservices.com", path="/pagead/conversion/987654321/", query=q))
        e = ev[0]
        self.assertEqual((e["platform"], e["type"], e["app"]), ("Google Ads", "app conversion", "com.example.shop"))
        self.assertEqual(e["params"]["conversion_id"], "AW-987654321")
        self.assertEqual(e["params"]["conversion_label"], "AbC-D_efG")
        self.assertEqual(e["params"]["currency"], "INR")


class TikTokTests(unittest.TestCase):
    def test_batch(self):
        body = {"app": {"id": "7123456789", "package_name": "com.example.shop"}, "batch": [
            {"type": "track", "event": "AddToCart", "properties": {"currency": "INR", "value": 2499, "contents": [{"content_id": "SKU-4471", "quantity": 1}]}},
            {"type": "track", "event": "CompletePayment", "properties": {"currency": "INR", "value": 4998}}]}
        ev = decode(Req(method="POST", host="business-api.tiktok.com", path="/open_api/v1.3/app/batch/", body=json.dumps(body).encode()))
        self.assertEqual([e["type"] for e in ev], ["AddToCart", "CompletePayment"])
        self.assertEqual(ev[0]["params"]["contents[0].content_id"], "SKU-4471")
        self.assertEqual(ev[0]["app"], "com.example.shop")
        self.assertEqual(ev[0]["platform"], "TikTok")


class SnapchatTests(unittest.TestCase):
    def test_event(self):
        body = {"data": [{"event_type": "ADD_CART", "app_id": "com.example.shop", "snap_app_id": "abc-123", "price": 2499, "currency": "INR", "item_ids": ["SKU-4471"]}]}
        ev = decode(Req(method="POST", host="tr.snapchat.com", path="/v2/conversion", body=json.dumps(body).encode()))
        self.assertEqual((ev[0]["platform"], ev[0]["type"], ev[0]["app"]), ("Snapchat", "ADD_CART", "com.example.shop"))
        self.assertEqual(ev[0]["params"]["item_ids[0]"], "SKU-4471")


class AppsFlyerTests(unittest.TestCase):
    def test_json_event(self):
        body = {"eventName": "af_add_to_cart", "eventValue": json.dumps({"af_price": 2499, "af_currency": "INR", "af_content_id": "SKU-4471"}), "appsflyerKey": "KEY", "uid": "1-2"}
        ev = decode(Req(method="POST", host="inapps.appsflyersdk.com", path="/api/v6.9/androidevent", query="app_id=com.example.shop&buildnumber=6.9.0", body=json.dumps(body).encode()))
        e = ev[0]
        self.assertEqual((e["platform"], e["type"], e["app"]), ("AppsFlyer", "af_add_to_cart", "com.example.shop"))
        self.assertEqual(e["params"]["af_content_id"], "SKU-4471")
        self.assertNotIn('"KEY"', json.dumps(ev))

    def test_encrypted(self):
        ev = decode(Req(method="POST", host="inapps.appsflyersdk.com", path="/api/v6.12/androidevent", query="app_id=com.example.shop", body=os.urandom(64)))
        self.assertIn("encrypted", ev[0]["type"])
        self.assertEqual(ev[0]["app"], "com.example.shop")


class AdjustTests(unittest.TestCase):
    def test_event(self):
        body = urlencode({"event_token": "abc123", "revenue": "24.99", "currency": "EUR", "app_token": "xyz", "package_name": "com.example.shop",
                          "callback_params": json.dumps({"order_id": "A-1"}), "app_secret": "s"})
        ev = decode(Req(method="POST", host="app.adjust.com", path="/event", body=body.encode()))
        e = ev[0]
        self.assertEqual((e["platform"], e["type"], e["app"]), ("Adjust", "abc123", "com.example.shop"))
        self.assertEqual(e["params"]["revenue"], "24.99")
        self.assertEqual(e["params"]["callback.order_id"], "A-1")
        self.assertNotIn("app_secret", e["params"])
        self.assertIn("token", e["note"])

    def test_session(self):
        ev = decode(Req(method="POST", host="app.adjust.com", path="/session", body=b"app_token=xyz&package_name=com.example.shop"))
        self.assertEqual(ev[0]["type"], "session")


class OtherTests(unittest.TestCase):
    def test_unknown_tracking(self):
        ev = decode(Req(host="api2.branch.io", path="/v1/open", query="branch_key=key_live_x"))
        self.assertEqual((ev[0]["platform"], ev[0]["type"]), ("Unknown", "Unknown tracking request"))
        self.assertEqual(ev[0]["params"]["host"], "api2.branch.io")

    def test_non_tracking_ignored(self):
        self.assertEqual(decode(Req(host="images.example-cdn.com", path="/p/1.jpg")), [])
        self.assertEqual(decode(Req(host="api.example.com", path="/v1/cart")), [])

    def test_param_cap(self):
        body = json.dumps({"events": [{"name": "big", "params": {f"p{i}": i for i in range(100)}}]}).encode()
        ev = decode(Req(method="POST", host="www.google-analytics.com", path="/mp/collect", body=body))
        self.assertLessEqual(len(ev[0]["params"]), 40)

    def test_protobuf_reader_rejects_garbage(self):
        with self.assertRaises(ValueError):
            pb_fields(b"\x07")

    def test_add_to_cart_across_platforms(self):
        """The core use case: one Add to Cart, every platform's event decoded."""
        reqs = [
            Req(method="POST", host="app-measurement.com", path="/a", body=fb_batch([fb_event("add_to_cart", {"currency": "INR", "value": 2499.0})])),
            Req(method="POST", host="graph.facebook.com", path="/v18.0/1/activities", body=urlencode({"custom_events": json.dumps([{"_eventName": "fb_mobile_add_to_cart", "_valueToSum": 2499}])}).encode()),
            Req(method="POST", host="business-api.tiktok.com", path="/open_api/v1.3/app/batch/", body=json.dumps({"batch": [{"event": "AddToCart", "properties": {"value": 2499}}]}).encode()),
            Req(host="www.googleadservices.com", path="/pagead/conversion/1/", query="label=x&value=2499"),
        ]
        got = [(e["platform"], e["type"]) for r in reqs for e in decode(r)]
        self.assertEqual(got, [("Firebase / GA4", "add_to_cart"), ("Meta App Events", "fb_mobile_add_to_cart"), ("TikTok", "AddToCart"), ("Google Ads", "app conversion")])


if __name__ == "__main__":
    unittest.main()
