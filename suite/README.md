# Digital Lens™ — App Inspector (Android)

See every analytics and advertising event an Android app sends, live, with all of its
parameters: **Firebase / GA4, GA4 Measurement Protocol, Meta App Events, Google Ads,
TikTok, Snapchat, AppsFlyer and Adjust**. Think GTM Preview, for mobile apps.

Built by **Tapasvi Dudhrejiya** · dudhrejiyatapasvi@gmail.com

---

## What you need

- A laptop with **Python 3.10+** ([python.org](https://www.python.org/downloads/). On Windows, tick *Add python.exe to PATH*)
- **Android platform-tools** (`adb`): [developer.android.com/tools/releases/platform-tools](https://developer.android.com/tools/releases/platform-tools). Unzip it and add the folder to PATH, or install Android Studio
- An Android phone and a USB **data** cable

## Start

| Windows | macOS / Linux |
| --- | --- |
| Double-click `start-windows.bat` | Run `./start.sh` in a terminal |

The first run installs mitmproxy into a local `.venv` folder (about a minute). The launcher
then starts the proxy and opens **http://127.0.0.1:8088** → *App Inspector*.

Press **Ctrl+C** in the launcher window to stop. The phone's normal internet is restored
automatically.

## One-time phone setup

1. **USB debugging:** Settings → About phone → tap **Build number** 7 times → back to Settings →
   Developer options → **USB debugging** on.
2. **Plug in** the cable and tap **Allow** on the phone. Digital Lens tunnels the phone's traffic
   through the cable (`adb reverse`) and sets the phone's proxy to it. You don't need Wi-Fi settings or an IP address.
3. **Install the certificate:** with the launcher running, open Chrome on the phone at
   **http://mitm.it** → *Android* → download. Then Settings → Security → *Encryption & credentials*
   → *Install a certificate* → **CA certificate** → choose the downloaded file.

## Use

1. In App Inspector, pick the app from **Apps on the phone**.
2. Tap **Open on phone** (or open it yourself).
3. Use the app. Every tracking request appears within about a second: time, platform, event name
   and the main parameters. Click a row for the full request URL and every parameter.

Filters: app, platform chips, text search (event names and parameter values), Following /
Paused, Clear, and Export JSON.

## Important limitation: which apps can be read

Since **Android 7**, apps only trust user-installed certificates (like this one) when their
developers allow it in the app's *network security config*. Some apps also pin certificates.

- ✅ **Chrome** on the phone (websites)
- ✅ **Debug / QA builds** of your or your client's app that allow user certificates. Ask the developers
  for a build with `<certificates src="user" />` in its debug network security config
- ❌ **Most Play Store production builds**. The app refuses the connection. App Inspector shows this
  as **Connection blocked · TLS handshake failed** with the host name, instead of hiding it.

Digital Lens only decrypts analytics and advertising hosts (Firebase, Google, Meta, TikTok,
Snapchat, AppsFlyer, Adjust and other tracking-like hosts). Everything else, including the app's own API,
logins and payments, passes through untouched, so the app keeps working while you test. To
decrypt every host, start with `DL_CAPTURE_ALL=1`.

## What each platform shows

| Platform | Endpoint | Notes |
| --- | --- | --- |
| Firebase / GA4 | `app-measurement.com/a` | Binary (protobuf) batches are decoded: event names, parameters, items, package name. Firebase's internal short names are translated (`_vs` → `screen_view`, `_f` → `first_open`, `_s` → `session_start`) and the original is kept in the note |
| GA4 Measurement Protocol | `google-analytics.com/mp/collect`, `/g/collect` | `api_secret` is hidden |
| Meta App Events | `graph.facebook.com/<app_id>/activities` | Every event in `custom_events`, with `_valueToSum` shown as `value` |
| Google Ads | `googleadservices.com/pagead/conversion/…` | Conversion ID, label, value, currency, bundle ID. Many app conversions are measured through Firebase instead |
| TikTok | `analytics.tiktok.com`, `business-api.tiktok.com` | Batched events with their properties |
| Snapchat | `tr.snapchat.com` | Event type and fields |
| AppsFlyer | `*.appsflyer.com`, `*.appsflyersdk.com` | Recent SDKs encrypt the body. The event is then shown as *encrypted payload* |
| Adjust | `app.adjust.com`, `adj.st` | Events are tokens. Their names live in the Adjust dashboard |
| Unknown | other tracking-like hosts | Shown as *Unknown tracking request* with host and parameters |

## Troubleshooting

- **No phone connected:** use a data cable, accept the USB debugging prompt, and run `adb devices`.
- **Phone connected but no events:** check *Phone proxy: on* in the status bar (use *Turn on*), and
  that the certificate is installed. Open any website in Chrome on the phone to confirm traffic arrives.
- **Only "Connection blocked" rows:** that app does not trust user certificates (see the limitation above).
- **Phone has no internet after closing the window** (closed without Ctrl+C): run `restore-phone.bat` /
  `./restore-phone.sh`, or on the phone: Settings → Wi-Fi → proxy → None.

## Privacy

Everything runs on your laptop. Events are kept in memory only and cleared when you stop
the launcher. Secrets in requests (API secrets, access tokens, SDK keys) are masked. The web UI
listens on 127.0.0.1 only.

## Files

```
start-windows.bat / start.sh     launchers
restore-phone.bat / .sh          remove the phone proxy manually
suite_addon.py                   mitmproxy addon + local web server and API
decoders/platforms.py            platform decoders
requirements.txt                 mitmproxy>=11
app.html, js/, assets/           the Digital Lens web app (all four workspaces work locally)
```
