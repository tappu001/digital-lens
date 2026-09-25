# Digital Lens™ — App Inspector (Android)

See every analytics and advertising event an Android app sends, live, with all of its
parameters: **Firebase / GA4, GA4 Measurement Protocol, Meta App Events, Google Ads,
TikTok, Snapchat, AppsFlyer and Adjust**. Think GTM Preview, for mobile apps.

Built by **Tapasvi Dudhrejiya** · dudhrejiyatapasvi@gmail.com

---

## What you need

- A Windows laptop (macOS / Linux also work with `./start.sh`). The installer adds Python and Android's adb if they are missing.
- An Android phone and a USB **data** cable

## Install (once)

1. Unzip the download.
2. Double-click **Install Digital Lens.bat**. It takes 2–5 minutes and installs:
   - Python (via winget, only if missing)
   - the Digital Lens engine (mitmproxy)
   - Android's adb (downloaded from Google, only if missing)

   It then puts a **Digital Lens App Inspector** icon on your desktop.

Nothing starts with Windows: Digital Lens only runs when you open it from the icon.
On macOS / Linux, run `./start.sh` instead.

## Every time you test

1. Double-click the **Digital Lens App Inspector** desktop icon. The browser opens App Inspector.
   No black window, no commands.
2. Plug in the phone and tap **Allow** on it. The checklist at the top turns green by itself:
   **Phone connected → Certificate → Live — capturing**.
3. First time with this phone only: click **Install certificate**. The certificate is copied to the phone
   and Settings opens. Follow the 3 steps shown, then click **Check certificate** (✓ Certificate trusted).
4. Pick your app on the left and click **Check this app**. It restarts the app and tells you:
   - **✓ Tracking is readable**: use the app and watch the events.
   - **✗ This build refuses the certificate**: click **Copy message for developer** and ask for a debug build.
5. When you're done, click **Stop testing** (the phone goes back to its normal internet), then unplug.

To close Digital Lens completely: *Setup steps and troubleshooting → Close Digital Lens*.
To remove it: **Uninstall Digital Lens.bat**, then delete the folder.

**Safety:** if you unplug without clicking *Stop testing*, Digital Lens tries to restore the phone's
internet automatically (on phones that report the USB state). If a phone ever has no internet
afterwards, plug it back in and click **Stop testing**, or run `restore-phone.bat`.

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
Install Digital Lens.bat         one-time installer (desktop icon)
Uninstall Digital Lens.bat       removes the desktop icon
run_agent.py                     the background helper
start-windows.bat / start.sh     run with a visible window (troubleshooting / macOS / Linux)
restore-phone.bat / .sh          remove the phone proxy manually
suite_addon.py                   mitmproxy addon + local web server and API
decoders/platforms.py            platform decoders
requirements.txt                 mitmproxy>=11
app.html, js/, assets/           the Digital Lens web app (all four workspaces work locally)
```
