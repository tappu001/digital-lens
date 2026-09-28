# Digital Lens Recorder (Chrome)

Part of **Digital Lens™ → Ecommerce Audit**. It records every `dataLayer` push on every page of a
website while you click through it, plus the GA4 hits the browser actually sends, and hands the
recording back to Digital Lens, which checks each ecommerce event against the GA4 standard (or your
client's standard) and exports the audit sheet.

Built by **Tapasvi Dudhrejiya**.

## Install (once)

1. Download **digital-lens-recorder.zip** from Digital Lens → Ecommerce Audit and unzip it.
2. Open `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `digital-lens-recorder` folder.
4. Refresh Digital Lens: Ecommerce Audit now shows **Start recording**.

## Use

1. Digital Lens → Ecommerce Audit → enter the website → **Start recording**. The site opens in a new tab.
2. Click through it like a shopper: category → product → add to cart → cart → checkout (→ test order).
3. Click the Digital Lens icon in Chrome → **Finish & open report** (or **Finish & audit** in Digital Lens).

You can also start from the icon on any site: **Start recording this tab** (the page reloads so that
events fired while the page loads are captured).

## What it records, and privacy

- `dataLayer` pushes from the recorded tab only, from the start of each page (before GTM loads),
  including `gtag()` calls. Functions and page elements are replaced by labels.
- GA4 requests (`/g/collect`, including server-side / first-party endpoints) from the recorded tab.
- Nothing is sent anywhere: the recording stays in the browser (`chrome.storage.local`) until the
  Digital Lens page reads it. Only Digital Lens pages can read it.
- Other tabs, and tabs when not recording, are not recorded.

## Files

```
manifest.json   Chrome extension manifest (MV3)
hook.js         runs in the page first and records dataLayer pushes
relay.js        passes pushes to the recorder; talks to the Digital Lens page
background.js   keeps the recording and the GA4 hits; opens the report
popup.html/js   Start / Finish from the toolbar icon
icons/          Digital Lens icons
```
