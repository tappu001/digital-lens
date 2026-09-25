"""Decoders for analytics / advertising SDK requests sent by Android apps.

Each decoder receives a ``Req`` and returns a list of event dicts:

    {"platform": "Firebase / GA4", "type": "add_to_cart",
     "params": {"item_id": "SKU-4471", "value": "2499", "currency": "INR"},
     "app": "com.example.shop", "note": ""}

``decode(req)`` runs every decoder and returns all events. A request can produce
several events (a Firebase or Meta batch). Only what is present in the request is
reported; nothing is inferred. Secrets (API secrets, access tokens) are masked.
"""

from __future__ import annotations

import gzip
import json
import re
import struct
import zlib
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import parse_qsl, unquote

MAX_PARAMS = 40

PLATFORM_FIREBASE = "Firebase / GA4"
PLATFORM_GA4 = "GA4 (Measurement Protocol)"
PLATFORM_META = "Meta App Events"
PLATFORM_GADS = "Google Ads"
PLATFORM_TIKTOK = "TikTok"
PLATFORM_SNAP = "Snapchat"
PLATFORM_APPSFLYER = "AppsFlyer"
PLATFORM_ADJUST = "Adjust"
PLATFORM_UNKNOWN = "Unknown"

SECRET_KEYS = re.compile(r"(^|_)(api_secret|access_token|app_secret|secret|client_secret|auth_token|password)$", re.I)


# ---------------------------------------------------------------------------
# Request model and helpers
# ---------------------------------------------------------------------------
@dataclass
class Req:
    method: str = "GET"
    scheme: str = "https"
    host: str = ""
    path: str = "/"          # path without the query string
    query: str = ""          # raw query string (no leading "?")
    headers: Dict[str, str] = field(default_factory=dict)
    body: bytes = b""

    def header(self, name: str) -> str:
        name = name.lower()
        for k, v in self.headers.items():
            if k.lower() == name:
                return v
        return ""

    @property
    def url(self) -> str:
        return f"{self.scheme}://{self.host}{self.path}" + (f"?{self.query}" if self.query else "")


def host_matches(host: str, *domains: str) -> bool:
    host = (host or "").lower().split(":")[0]
    return any(host == d or host.endswith("." + d) for d in domains)


def body_bytes(req: Req) -> bytes:
    """Body with gzip / deflate removed (by header or by magic bytes)."""
    data = req.body or b""
    enc = req.header("content-encoding").lower()
    try:
        if data[:2] == b"\x1f\x8b" or "gzip" in enc:
            return gzip.decompress(data)
        if "deflate" in enc:
            try:
                return zlib.decompress(data)
            except zlib.error:
                return zlib.decompress(data, -zlib.MAX_WBITS)
    except (OSError, zlib.error, EOFError):
        return data
    return data


def body_text(req: Req) -> str:
    return body_bytes(req).decode("utf-8", errors="replace")


def query_params(qs: str) -> List[Tuple[str, str]]:
    return parse_qsl(qs or "", keep_blank_values=True)


def json_body(req: Req) -> Any:
    try:
        return json.loads(body_text(req))
    except (ValueError, UnicodeDecodeError):
        return None


def multipart_fields(req: Req) -> Dict[str, str]:
    ctype = req.header("content-type")
    m = re.search(r'boundary="?([^";]+)"?', ctype or "")
    if not m:
        return {}
    boundary = ("--" + m.group(1)).encode()
    out: Dict[str, str] = {}
    for part in body_bytes(req).split(boundary):
        if b"\r\n\r\n" not in part:
            continue
        head, _, val = part.partition(b"\r\n\r\n")
        nm = re.search(rb'name="([^"]+)"', head)
        if nm:
            out[nm.group(1).decode("utf-8", "replace")] = val.rstrip(b"\r\n-").decode("utf-8", "replace")
    return out


def form_fields(req: Req) -> Dict[str, str]:
    """Form body fields (urlencoded or multipart), merged over the query string."""
    out = dict(query_params(req.query))
    ctype = req.header("content-type").lower()
    if "multipart/form-data" in ctype:
        out.update(multipart_fields(req))
    elif req.body:
        text = body_text(req)
        if "=" in text and not text.lstrip().startswith(("{", "[")):
            out.update(dict(query_params(text)))
    return out


def scalar(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float):
        return repr(v).rstrip("0").rstrip(".") if v != int(v) else str(int(v))
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False, separators=(",", ":"))
    return str(v)


def flatten(obj: Any, prefix: str = "", out: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """Flatten nested dicts / lists into "a.b" / "items[0].item_id" keys."""
    out = {} if out is None else out
    if isinstance(obj, dict):
        for k, v in obj.items():
            key = f"{prefix}.{k}" if prefix else str(k)
            if isinstance(v, (dict, list)) and v:
                flatten(v, key, out)
            else:
                out[key] = scalar(v)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            key = f"{prefix}[{i}]"
            if isinstance(v, (dict, list)) and v:
                flatten(v, key, out)
            else:
                out[key] = scalar(v)
    else:
        out[prefix or "value"] = scalar(obj)
    return out


def clean_params(params: Dict[str, Any]) -> Dict[str, str]:
    """String values, secrets masked, at most MAX_PARAMS entries."""
    out: Dict[str, str] = {}
    for k, v in params.items():
        if len(out) >= MAX_PARAMS:
            break
        val = scalar(v)
        if SECRET_KEYS.search(str(k)):
            val = "•••• (hidden)"
        out[str(k)] = val
    return out


def event(platform: str, etype: str, params: Dict[str, Any], app: str = "", note: str = "") -> Dict[str, Any]:
    return {"platform": platform, "type": etype or "(unnamed)", "params": clean_params(params), "app": app or "", "note": note or ""}


def maybe_json(v: Any) -> Any:
    if isinstance(v, str) and v[:1] in "[{":
        try:
            return json.loads(v)
        except ValueError:
            return v
    return v


# ---------------------------------------------------------------------------
# Protocol buffers (schema-less wire format reader, used for Firebase)
# ---------------------------------------------------------------------------
def _varint(buf: bytes, i: int) -> Tuple[int, int]:
    shift = result = 0
    while True:
        if i >= len(buf):
            raise ValueError("truncated varint")
        b = buf[i]
        i += 1
        result |= (b & 0x7F) << shift
        if not b & 0x80:
            return result, i
        shift += 7
        if shift > 70:
            raise ValueError("varint too long")


def pb_fields(buf: bytes) -> List[Tuple[int, int, Any]]:
    """[(field_number, wire_type, value)] — value is int, bytes, or raw 4/8 bytes."""
    out = []
    i = 0
    while i < len(buf):
        key, i = _varint(buf, i)
        fnum, wt = key >> 3, key & 7
        if fnum == 0:
            raise ValueError("field 0")
        if wt == 0:
            v, i = _varint(buf, i)
        elif wt == 1:
            v, i = buf[i:i + 8], i + 8
        elif wt == 2:
            ln, i = _varint(buf, i)
            v, i = buf[i:i + ln], i + ln
            if i > len(buf):
                raise ValueError("truncated bytes")
        elif wt == 5:
            v, i = buf[i:i + 4], i + 4
        else:
            raise ValueError(f"wire type {wt}")
        out.append((fnum, wt, v))
    return out


def _pb_str(v: Any) -> Optional[str]:
    if not isinstance(v, (bytes, bytearray)):
        return None
    try:
        s = bytes(v).decode("utf-8")
    except UnicodeDecodeError:
        return None
    return s if s and all(c.isprintable() for c in s) else None


def _pb_int(v: int) -> int:
    return v - (1 << 64) if v >= (1 << 63) else v


# Firebase uses short internal names for automatically collected events / params.
FIREBASE_EVENTS = {
    "_s": "session_start", "_ssr": "session_start", "_e": "user_engagement", "_vs": "screen_view", "_f": "first_open",
    "_v": "first_visit", "_ab": "app_background", "_au": "app_update", "_ui": "app_remove", "_in": "app_install",
    "_ou": "os_update", "_cd": "app_clear_data", "_ae": "app_exception", "_err": "error", "_iap": "in_app_purchase",
    "_cmp": "firebase_campaign", "_nr": "notification_receive", "_nf": "notification_foreground",
    "_no": "notification_open", "_nd": "notification_dismiss", "_ai": "ad_impression", "_ac": "ad_click",
    "_xa": "ad_exposure", "_xu": "ad_query", "_aq": "ad_query", "_ar": "ad_reward", "_ec": "app_exception",
}
FIREBASE_PARAMS = {
    "_o": "origin", "_sc": "firebase_screen_class", "_sn": "firebase_screen", "_si": "firebase_screen_id",
    "_pc": "firebase_previous_class", "_pn": "firebase_previous_screen", "_pi": "firebase_previous_id",
    "_et": "engagement_time_msec", "_c": "firebase_conversion", "_r": "realtime", "_dbg": "ga_debug",
    "_sid": "ga_session_id", "_sno": "ga_session_number", "_fr": "first_run", "_mst": "manual_tracking",
    "_ev": "firebase_error_value", "_err": "firebase_error", "_el": "firebase_error_length", "_ltv_USD": "ltv_usd",
    "_fot": "first_open_time", "_lte": "lifetime_user_engagement", "_se": "session_user_engagement", "_npa": "non_personalized_ads",
    "_id": "user_id", "_fi": "first_install", "_uwa": "update_with_analytics", "_lgclid": "last_gclid", "_pfo": "previous_first_open_count",
}


def _fb_param(buf: bytes) -> Tuple[Optional[str], Any]:
    """Firebase event parameter: 1 name, 2 string, 3 int, 4 float, 5 double, 6 nested params."""
    name = None
    val: Any = None
    nested: List[Any] = []
    for f, wt, v in pb_fields(buf):
        if f == 1 and wt == 2:
            name = _pb_str(v)
        elif f == 2 and wt == 2:
            val = _pb_str(v) if _pb_str(v) is not None else bytes(v).decode("utf-8", "replace")
        elif f == 3 and wt == 0:
            val = _pb_int(v)
        elif f == 4 and wt == 5:
            val = round(struct.unpack("<f", v)[0], 6)
        elif f == 5 and wt == 1:
            val = struct.unpack("<d", v)[0]
        elif f == 6 and wt == 2:
            nested.append(v)
    if nested:
        # items: each nested entry is a bundle of params (an item)
        items = []
        for n in nested:
            item = {}
            for f2, wt2, v2 in pb_fields(n):
                if f2 == 1 and wt2 == 2:
                    k, x = _fb_param(v2)
                    if k:
                        item[FIREBASE_PARAMS.get(k, k)] = x
            if not item:
                k, x = _fb_param(n)
                if k:
                    item[FIREBASE_PARAMS.get(k, k)] = x
            items.append(item)
        val = items
    return name, val


def _fb_event(buf: bytes) -> Optional[Dict[str, Any]]:
    """Firebase event: 1 params, 2 name, 3 timestamp_millis, 4 previous_timestamp, 5 count."""
    name = None
    params: Dict[str, Any] = {}
    ts = None
    for f, wt, v in pb_fields(buf):
        if f == 2 and wt == 2:
            name = _pb_str(v)
        elif f == 1 and wt == 2:
            k, x = _fb_param(v)
            if k:
                params[k] = x
        elif f == 3 and wt == 0:
            ts = v
    if not name:
        return None
    return {"name": name, "params": params, "ts": ts}


def _fb_bundle(buf: bytes) -> Optional[Dict[str, Any]]:
    """Firebase measurement bundle: 2 events, 3 user properties, 8 platform, 9 os_version,
    10 device_model, 14 app_id (package), 16 app_version, 25 gmp_app_id."""
    events = []
    user_props: Dict[str, Any] = {}
    meta: Dict[str, Any] = {}
    for f, wt, v in pb_fields(buf):
        if f == 2 and wt == 2:
            e = _fb_event(v)
            if e:
                events.append(e)
        elif f == 3 and wt == 2:
            nm = None
            val: Any = None
            for f2, wt2, v2 in pb_fields(v):
                if f2 == 2 and wt2 == 2:
                    nm = _pb_str(v2)
                elif f2 == 3 and wt2 == 2:
                    val = _pb_str(v2)
                elif f2 == 4 and wt2 == 0:
                    val = _pb_int(v2)
                elif f2 == 6 and wt2 == 1:
                    val = struct.unpack("<d", v2)[0]
            if nm:
                user_props[nm] = val
        elif wt == 2 and f in (8, 9, 10, 14, 16, 25):
            s = _pb_str(v)
            if s:
                meta[{8: "platform", 9: "os_version", 10: "device_model", 14: "app_id", 16: "app_version", 25: "gmp_app_id"}[f]] = s
    if not events:
        return None
    return {"events": events, "user_properties": user_props, "meta": meta}


def decode_firebase(req: Req) -> List[Dict[str, Any]]:
    if not host_matches(req.host, "app-measurement.com"):
        return []
    path = req.path or "/"
    if path.startswith("/config"):
        m = re.search(r"/config/app/([^/?]+)", path)
        q = dict(query_params(req.query))
        return [event(PLATFORM_FIREBASE, "config_fetch", {"gmp_app_id": unquote(m.group(1)) if m else "", **q},
                      note="Firebase Analytics downloading its configuration.")]
    if req.method.upper() != "POST" or not req.body:
        return [event(PLATFORM_FIREBASE, "request", dict(query_params(req.query)), note=f"{req.method} {path}")]
    data = body_bytes(req)
    bundles = []
    try:
        for f, wt, v in pb_fields(data):
            if f == 1 and wt == 2:
                b = _fb_bundle(v)
                if b:
                    bundles.append(b)
    except (ValueError, struct.error):
        bundles = []
    if not bundles:
        return [event(PLATFORM_FIREBASE, "upload (not decoded)", {"bytes": len(data)},
                      note="Firebase upload whose binary format could not be read. The raw request is kept.")]
    out = []
    for b in bundles:
        meta = b["meta"]
        app = meta.get("app_id", "")
        for e in b["events"]:
            raw = e["name"]
            nice = FIREBASE_EVENTS.get(raw, raw)
            params: Dict[str, Any] = {}
            for k, v in e["params"].items():
                key = FIREBASE_PARAMS.get(k, k)
                if isinstance(v, list):
                    for i, item in enumerate(v):
                        for ik, iv in (item.items() if isinstance(item, dict) else []):
                            params[f"{key}[{i}].{ik}"] = iv
                else:
                    params[key] = v
            if meta.get("gmp_app_id"):
                params.setdefault("gmp_app_id", meta["gmp_app_id"])
            if meta.get("app_version"):
                params.setdefault("app_version", meta["app_version"])
            note = f"Firebase internal name: {raw}" if raw != nice else ""
            out.append(event(PLATFORM_FIREBASE, nice, params, app=app, note=note))
    return out


# ---------------------------------------------------------------------------
# GA4 Measurement Protocol / gtag collect
# ---------------------------------------------------------------------------
ITEM_KEYS = {"id": "item_id", "nm": "item_name", "pr": "price", "qt": "quantity", "br": "item_brand", "ca": "item_category",
             "c2": "item_category2", "c3": "item_category3", "c4": "item_category4", "c5": "item_category5", "va": "item_variant",
             "af": "affiliation", "cp": "coupon", "ds": "discount", "ln": "item_list_name", "li": "item_list_id", "lp": "index", "ps": "promotion_id"}
GA4_KEYS = {"tid": "measurement_id", "cid": "client_id", "uid": "user_id", "cu": "currency", "dl": "page_location", "dt": "page_title",
            "dr": "page_referrer", "sid": "ga_session_id", "sct": "ga_session_number", "seg": "session_engaged", "_et": "engagement_time_msec"}


def _collect_event(p: List[Tuple[str, str]]) -> Tuple[str, Dict[str, Any]]:
    name = ""
    params: Dict[str, Any] = {}
    for k, v in p:
        if k == "en":
            name = v
        elif k.startswith(("ep.", "epn.")):
            params[k.split(".", 1)[1]] = v
        elif k.startswith(("up.", "upn.")):
            params["user." + k.split(".", 1)[1]] = v
        elif re.fullmatch(r"pr\d+", k):
            n = int(k[2:]) - 1
            for part in v.split("~"):
                key, val = part[:2], part[2:]
                params[f"items[{n}].{ITEM_KEYS.get(key, key)}"] = val
        elif k in GA4_KEYS:
            params[GA4_KEYS[k]] = v
    return name, params


def decode_ga4(req: Req) -> List[Dict[str, Any]]:
    if not host_matches(req.host, "google-analytics.com", "analytics.google.com"):
        return []
    path = req.path
    if path.endswith("/mp/collect") or path.endswith("/debug/mp/collect"):
        q = dict(query_params(req.query))
        body = json_body(req) or {}
        base = {"measurement_id": q.get("measurement_id", ""), "firebase_app_id": q.get("firebase_app_id", ""),
                "client_id": body.get("client_id", ""), "app_instance_id": body.get("app_instance_id", ""), "user_id": body.get("user_id", ""),
                "api_secret": q.get("api_secret", "")}
        base = {k: v for k, v in base.items() if v}
        out = []
        for e in body.get("events", []) or []:
            params = dict(base)
            params.update(flatten(e.get("params", {}) or {}))
            out.append(event(PLATFORM_GA4, e.get("name", ""), params, note="Measurement Protocol (server / app to GA4)"))
        return out or [event(PLATFORM_GA4, "mp_request", base, note="Measurement Protocol request without events")]
    if path.endswith("/g/collect") or path.endswith("/collect"):
        base = query_params(req.query)
        lines = [l for l in body_text(req).splitlines() if l.strip()] if req.body else []
        out = []
        for line in lines or [""]:
            name, params = _collect_event(base + query_params(line))
            out.append(event(PLATFORM_GA4, name or "hit", params))
        return out
    return []


# ---------------------------------------------------------------------------
# Meta (Facebook) App Events
# ---------------------------------------------------------------------------
META_EVENTS = {"fb_mobile_activate_app": "fb_mobile_activate_app", "MOBILE_APP_INSTALL": "MOBILE_APP_INSTALL"}


def decode_meta(req: Req) -> List[Dict[str, Any]]:
    if not host_matches(req.host, "facebook.com", "facebook.net"):
        return []
    m = re.match(r"^/(?:v[\d.]+/)?(\d+)/activities/?$", req.path)
    if not m:
        m2 = re.match(r"^/(?:v[\d.]+/)?(\d+)/?$", req.path)
        if m2 and host_matches(req.host, "graph.facebook.com"):
            q = dict(query_params(req.query))
            return [event(PLATFORM_META, "sdk_settings", {"app_id": m2.group(1), "fields": q.get("fields", "")},
                          note="Meta SDK downloading app settings.")]
        return []
    app_id = m.group(1)
    f = form_fields(req)
    ext = maybe_json(f.get("extinfo", ""))
    package = ext[1] if isinstance(ext, list) and len(ext) > 1 and isinstance(ext[1], str) else f.get("application_package_name", "")
    base: Dict[str, Any] = {"app_id": app_id}
    for k in ("advertiser_id", "anon_id", "application_tracking_enabled", "advertiser_tracking_enabled", "app_user_id"):
        if f.get(k):
            base[k] = f[k]
    if isinstance(ext, list) and len(ext) > 3:
        base["app_version"] = scalar(ext[3])
    kind = f.get("event", "")
    customs = maybe_json(f.get("custom_events", ""))
    out = []
    if isinstance(customs, list) and customs:
        for ce in customs:
            if not isinstance(ce, dict):
                continue
            name = ce.get("_eventName", "")
            params = dict(base)
            if "_valueToSum" in ce:
                params["value"] = ce["_valueToSum"]
            for k, v in ce.items():
                if k in ("_eventName", "_valueToSum", "_eventName_md5"):
                    continue
                params[k] = maybe_json(v) if not isinstance(maybe_json(v), (dict, list)) else scalar(maybe_json(v))
            note = "Logged automatically by the Meta SDK" if str(ce.get("_implicitlyLogged", "")) in ("1", "true") else ""
            out.append(event(PLATFORM_META, name, params, app=package, note=note))
        return out
    if kind:
        return [event(PLATFORM_META, kind, base, app=package, note="Install / activation ping" if kind == "MOBILE_APP_INSTALL" else "")]
    return [event(PLATFORM_META, "activities", base, app=package)]


# ---------------------------------------------------------------------------
# Google Ads app conversions
# ---------------------------------------------------------------------------
def decode_google_ads(req: Req) -> List[Dict[str, Any]]:
    if not host_matches(req.host, "googleadservices.com", "googleads.g.doubleclick.net", "googlesyndication.com"):
        return []
    if "/pagead/conversion" not in req.path and "/pagead/1p-conversion" not in req.path:
        return []
    f = form_fields(req)
    m = re.search(r"/pagead/(?:1p-)?conversion/(\d+)", req.path)
    params: Dict[str, Any] = {}
    if m:
        params["conversion_id"] = "AW-" + m.group(1)
    rename = {"label": "conversion_label", "value": "value", "currency_code": "currency", "bundleid": "bundle_id", "appversion": "app_version",
              "osversion": "os_version", "rdid": "advertising_id", "lat": "limit_ad_tracking", "timestamp": "timestamp", "usage_tracking_id": "usage_tracking_id",
              "ev": "event", "data": "data", "gclid": "gclid", "gbraid": "gbraid", "remarketing_only": "remarketing_only"}
    for k, v in f.items():
        params[rename.get(k, k)] = v
    app = f.get("bundleid", "")
    return [event(PLATFORM_GADS, "app conversion", params, app=app,
                  note="Many Google Ads app conversions are measured through Firebase instead, so they appear as Firebase events.")]


# ---------------------------------------------------------------------------
# TikTok
# ---------------------------------------------------------------------------
def decode_tiktok(req: Req) -> List[Dict[str, Any]]:
    if not host_matches(req.host, "analytics.tiktok.com", "business-api.tiktok.com", "analytics-sg.tiktok.com", "log.tiktokv.com"):
        return []
    body = json_body(req)
    if body is None:
        f = form_fields(req)
        if not f:
            return [event(PLATFORM_TIKTOK, "request", {}, note=f"{req.method} {req.path}")]
        body = f
    lists = []
    if isinstance(body, list):
        lists = body
    elif isinstance(body, dict):
        for key in ("batch", "data", "events", "event_list"):
            if isinstance(body.get(key), list):
                lists = body[key]
                break
        if not lists and (body.get("event") or body.get("event_name")):
            lists = [body]
    common_app = ""
    if isinstance(body, dict):
        a = body.get("app") or {}
        common_app = (a.get("package_name") or a.get("id") or a.get("app_id") or "") if isinstance(a, dict) else ""
        common_app = common_app or body.get("app_id", "") or body.get("package_name", "")
    out = []
    for e in lists:
        if not isinstance(e, dict):
            continue
        name = e.get("event") or e.get("event_name") or e.get("type") or ""
        params: Dict[str, Any] = {}
        props = e.get("properties") or e.get("props") or e.get("event_data") or {}
        if isinstance(props, dict):
            params.update(flatten(props))
        for k in ("timestamp", "event_id", "tiktok_app_id", "app_id"):
            if e.get(k):
                params[k] = e[k]
        app = ""
        a = e.get("app") or {}
        if isinstance(a, dict):
            app = a.get("package_name") or a.get("id") or ""
        out.append(event(PLATFORM_TIKTOK, str(name), params, app=app or str(common_app or "")))
    if not out:
        return [event(PLATFORM_TIKTOK, "request", flatten(body) if isinstance(body, dict) else {}, app=str(common_app or ""), note=f"{req.method} {req.path}")]
    return out


# ---------------------------------------------------------------------------
# Snapchat
# ---------------------------------------------------------------------------
def decode_snapchat(req: Req) -> List[Dict[str, Any]]:
    if not host_matches(req.host, "tr.snapchat.com", "tr-shadow.snapchat.com", "app-analytics.snapchat.com"):
        return []
    body = json_body(req)
    if body is None:
        body = form_fields(req)
    items = body if isinstance(body, list) else (body.get("data") if isinstance(body, dict) and isinstance(body.get("data"), list) else [body])
    out = []
    for e in items:
        if not isinstance(e, dict):
            continue
        name = e.get("event_type") or e.get("event_name") or e.get("ev") or e.get("event") or ""
        app = e.get("app_id") if isinstance(e.get("app_id"), str) and "." in e.get("app_id", "") else ""
        params = {k: v for k, v in flatten(e).items() if k not in ("event_type", "event_name", "ev", "event")}
        out.append(event(PLATFORM_SNAP, str(name) or "request", params, app=app or e.get("package_name", "")))
    return out or [event(PLATFORM_SNAP, "request", {}, note=f"{req.method} {req.path}")]


# ---------------------------------------------------------------------------
# AppsFlyer
# ---------------------------------------------------------------------------
def decode_appsflyer(req: Req) -> List[Dict[str, Any]]:
    if not host_matches(req.host, "appsflyer.com", "appsflyersdk.com"):
        return []
    q = dict(query_params(req.query))
    app = q.get("app_id", "")
    body = json_body(req)
    kind = "launch" if "launch" in req.host or "/launch" in req.path else ("event" if "inapp" in req.host or "event" in req.path else "request")
    if isinstance(body, dict):
        app = app or body.get("app_id", "") or body.get("appid", "")
        name = body.get("eventName") or ("af_app_opened" if kind == "launch" else "") or kind
        params: Dict[str, Any] = {}
        ev = maybe_json(body.get("eventValue", ""))
        if isinstance(ev, dict):
            params.update(flatten(ev))
        elif ev:
            params["eventValue"] = ev
        for k in ("af_timestamp", "appsflyerKey", "uid", "advertiserId", "counter", "iaecounter", "af_currency", "currency", "brand", "model", "sdk", "app_version_name"):
            if body.get(k) not in (None, ""):
                params[k] = body[k]
        if "appsflyerKey" in params:
            params["appsflyerKey"] = "•••• (hidden)"
        return [event(PLATFORM_APPSFLYER, str(name), params, app=app)]
    if req.body:
        return [event(PLATFORM_APPSFLYER, f"{kind} (encrypted payload)", {"bytes": len(req.body), **q}, app=app,
                      note="This AppsFlyer SDK encrypts its request body, so the event name and values cannot be read from the network.")]
    return [event(PLATFORM_APPSFLYER, kind, q, app=app)]


# ---------------------------------------------------------------------------
# Adjust
# ---------------------------------------------------------------------------
def decode_adjust(req: Req) -> List[Dict[str, Any]]:
    if not host_matches(req.host, "adjust.com", "adj.st", "adjust.net.in", "adjust.world", "adjust.cn", "adjust.io"):
        return []
    f = form_fields(req)
    path = req.path.strip("/") or "request"
    app = f.get("package_name", "") or f.get("bundle_id", "")
    params: Dict[str, Any] = {}
    for k, v in f.items():
        if k in ("callback_params", "partner_params"):
            j = maybe_json(v)
            if isinstance(j, dict):
                for kk, vv in j.items():
                    params[f"{k.split('_')[0]}.{kk}"] = vv
                continue
        params[k] = v
    if "app_secret" in params or "secret_id" in params:
        params.pop("app_secret", None)
    kind = path.split("/")[0]
    if kind == "event":
        name = f.get("event_token", "event")
        note = "Adjust event token. Its readable name is defined in the Adjust dashboard."
    else:
        name = kind
        note = ""
    return [event(PLATFORM_ADJUST, name, params, app=app, note=note)]


# ---------------------------------------------------------------------------
# Unknown tracking requests
# ---------------------------------------------------------------------------
TRACKING_HOSTS = (
    "branch.io", "amplitude.com", "mixpanel.com", "segment.io", "segment.com", "braze.com", "appboy.com", "clevertap-prod.com", "wzrkt.com",
    "moengage.com", "onesignal.com", "singular.net", "kochava.com", "firebaselogging-pa.googleapis.com", "firebaselogging.googleapis.com",
    "crashlytics.com", "doubleclick.net", "googlesyndication.com", "google-analytics.com", "ads.linkedin.com", "ct.pinterest.com",
    "bat.bing.com", "clarity.ms", "hotjar.com", "smartlook.com", "uxcam.com", "newrelic.com", "datadoghq.com", "unity3d.com",
    "applovin.com", "ironsrc.com", "chartboost.com", "vungle.com", "inmobi.com", "mopub.com", "criteo.com", "taboola.com", "outbrain.com",
    "adsrvr.org", "rubiconproject.com", "pubmatic.com", "adnxs.com", "tapjoy.com", "airbridge.io", "tenjin.com", "webengage.com", "netcore.co.in",
)
TRACKING_HINT = re.compile(r"(^|[.-])(analytics|tracking|tracker|telemetry|metrics|pixel|collect|events?|log|ads?|adservice|measurement)([.-]|$)", re.I)


def is_tracking_host(host: str) -> bool:
    h = (host or "").lower()
    return host_matches(h, *TRACKING_HOSTS) or bool(TRACKING_HINT.search(h))


def decode_unknown(req: Req) -> List[Dict[str, Any]]:
    if not is_tracking_host(req.host):
        return []
    params: Dict[str, Any] = {"host": req.host, "path": req.path}
    for k, v in query_params(req.query)[:30]:
        params[k] = v
    return [event(PLATFORM_UNKNOWN, "Unknown tracking request", params, note="Tracking-like endpoint without a decoder. Host and parameters are shown as sent.")]


# Domains decoded above: used by the proxy's tracking-only mode (only these are decrypted).
DECODED_DOMAINS = (
    "app-measurement.com", "google-analytics.com", "analytics.google.com", "facebook.com", "facebook.net",
    "googleadservices.com", "googleads.g.doubleclick.net", "googlesyndication.com", "analytics.tiktok.com", "business-api.tiktok.com",
    "analytics-sg.tiktok.com", "log.tiktokv.com", "tr.snapchat.com", "tr-shadow.snapchat.com", "app-analytics.snapchat.com",
    "appsflyer.com", "appsflyersdk.com", "adjust.com", "adj.st", "adjust.net.in", "adjust.world", "adjust.cn", "adjust.io",
)


def tracking_allow_regex() -> str:
    """mitmproxy allow_hosts pattern: known SDK domains, tracking-like hosts and mitm.it (certificate page)."""
    doms = sorted(set(DECODED_DOMAINS + TRACKING_HOSTS + ("mitm.it",)))
    alt = "|".join(re.escape(d) for d in doms)
    hint = TRACKING_HINT.pattern.replace("(^|[.-])", "(^|[.-])").replace("([.-]|$)", "[.-]")
    return rf"^(?:(?:[^:]*\.)?(?:{alt})|[^:]*{hint}[^:]*)(?::\d+)?$"


DECODERS: List[Callable[[Req], List[Dict[str, Any]]]] = [
    decode_firebase, decode_ga4, decode_meta, decode_google_ads, decode_tiktok, decode_snapchat, decode_appsflyer, decode_adjust,
]


def decode(req: Req) -> List[Dict[str, Any]]:
    """Run every platform decoder; unmatched tracking-like hosts become 'Unknown tracking request'."""
    out: List[Dict[str, Any]] = []
    for d in DECODERS:
        try:
            out.extend(d(req))
        except Exception as exc:  # a malformed payload must never break the stream
            out.append(event(PLATFORM_UNKNOWN, "decode error", {"host": req.host, "path": req.path}, note=f"{d.__name__}: {exc}"))
    if not out:
        out.extend(decode_unknown(req))
    return out
