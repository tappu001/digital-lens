# Digital Lens™

**See what matters.**

Digital Lens is a tracking and measurement audit workspace built by **Tapasvi Dudhrejiya**.
It is deliberately split into independent workspaces so website detection, GTM configuration,
and public Google tag / GA4 configuration do not get mixed together.

- Email: `dudhrejiyatapasvi@gmail.com`
- LinkedIn: `https://www.linkedin.com/in/tapasvi-dudhrejiya/`

## What Digital Lens does

### 1. GTM Audit

Give Digital Lens a GTM container ID, a website URL, or paste container code (a published `gtm.js` response or a container export JSON). It shows:

- **Tags**: clean names such as `Google Ads Remarketing — AW-123456789`, `Google Tag — G-XXXXXXX`, `Custom HTML — Meta Pixel`; paused tags are highlighted and keep their original type, e.g. `Custom HTML (Paused) - Custom Event — purchase`
- **Triggers**: `All Pages`, `Custom Event — purchase`, `All Clicks — Click ID contains submit`
- **Variables**: type, value and where each one is used
- **Stats**: IDs by platform (GA4, Google Ads, Meta, TikTok, LinkedIn, Pinterest, Clarity…), tags/triggers/variables by type
- Container header: tags, triggers, variables, destinations, IDs, weight, and load time when a website was given

Published containers don't keep workspace names, so names are generated from each item's settings. A container export JSON keeps the real names, and those are used as-is.

### 2. GA4 Inspector

Enter a Measurement ID (`G-XXXXXXXXXX`) or a website URL (Digital Lens finds the Measurement IDs it loads). **No Google login, OAuth or GA4 Admin API.**

Digital Lens reads the public Google tag Google serves for the ID (`https://www.googletagmanager.com/gtm.js?id=G-…`, falling back to `gtag/js?id=G-…`) and lays it out with GA4's own setting names:

- **Header**: Version, Key Events, Create Events, Modify Events, Cross-domain, Unwanted Referrals
- **Events**: Enhanced measurement, Create custom events, Modify events, Key events, Redact data
- **Google tag**: Configure your domains, Define internal traffic, List unwanted referrals, Adjust session timeout, Override cookie settings, Allow user-provided data capabilities, Connected site tags, Manage default consent settings for data collection
- **Data collection**: Google signals, Granular location and device data collection, User-provided data collection

Every row expands to show its details (event names and conditions, domains, settings). Only settings present in the public tag are shown. Cookie names and library code are never reported as events. Private GA4 settings (reports, audiences, custom definitions, retention, product links) are not in the public tag and are not shown. If the proxy is unavailable, the Google tag response can be pasted instead.

### 3. Website Insights

Give Digital Lens a public website URL. It scans the page HTML and every published GTM container on the page, then shows one **Platforms on this website** table:

| Column | Meaning |
| --- | --- |
| Platform | GA4, Google Ads, Meta Pixel, TikTok, LinkedIn, Pinterest, Snapchat, Microsoft UET, Clarity, Hotjar, Klaviyo… grouped by category |
| IDs | Measurement ID / pixel ID / partner ID, each labelled with where it was found (On page or the GTM container) |
| Implemented | **On page** (written in the HTML, hardcoded) and/or the **GTM container** it is a tag in |
| Count | How many times: `On page ×2`, `GTM-XXXX: 5 tags (1 paused)` |

A summary row shows the CMS / ecommerce platform, GTM containers with load time, and how many platforms are on page only, via GTM only, or both. GA4 IDs link straight to the GA4 Inspector.

Tools injected only after the page runs JavaScript (or by Shopify customer events) are not in the HTML and cannot be seen by a static scan.

### 4. App Inspector (Android)

GTM Preview, for mobile apps. Connect an Android phone over USB, open an app, and watch every
analytics and advertising event it sends, live: **Firebase / GA4, GA4 Measurement Protocol, Meta
App Events, Google Ads, TikTok, Snapchat, AppsFlyer and Adjust**, each with its platform, event name
and all parameters. Other tracking-like hosts appear as *Unknown tracking request*.

A web page can't read a phone's traffic, so App Inspector runs from the **Digital Lens suite**, a
download (`downloads/digital-lens-suite.zip`) with a small mitmproxy addon, launchers for Windows,
macOS and Linux, and this same web app served on `http://127.0.0.1:8088`. The phone reaches the proxy
over the USB cable (`adb reverse`). The suite points the phone at it when it is plugged in and restores
it on exit. Only analytics and ad hosts are decrypted; everything else passes through untouched.

**Limitation:** since Android 7, apps only trust the proxy's certificate if their developers allow user
certificates. Chrome and debug/QA builds work; most Play Store builds refuse the connection, which is
shown as *Connection blocked* rather than hidden. Setup, troubleshooting and platform details:
[`suite/README.md`](suite/README.md).

Source: `suite/` (decoders in `suite/decoders/platforms.py`, addon and local API in
`suite/suite_addon.py`, tests in `suite/tests/`). After changing the suite or web files, rebuild the
download with `python suite/build_zip.py`. CI fails if the ZIP is out of date.

### Navigation

Every workspace has its own address, so browser back/forward, refresh and shared links work: `app.html#gtm?q=GTM-XXXX&view=triggers`, `app.html#ga4?id=G-XXXX`, `app.html#website?url=https://example.com`, `app.html#app`. The landing page links straight to each workspace.

---

## Project structure

```text
index.html                 Marketing / landing page
app.html                   Digital Lens audit application
favicon.svg                Digital Lens icon
assets/
  digital-lens-logo.png    Generated Digital Lens™ brand logo
  landing.css              Landing page styling
  landing.js               Landing page interaction
  styles.css               Audit application styling
js/
  app.js                   Application UI and routing
  config.js                Hosted proxy configuration
  net.js                   Fetch backend selection
  core/
    decoder.js             GTM container decoder
    naming.js              Human-readable naming engine
    audit.js               GTM audit findings
    sitescan.js             Website technology/tracking scanner
    ga4public.js           Public Google tag / GA4 configuration inspector
    scan.js                GTM + website scan orchestration
    parser.js              Published GTM parser
    catalog.js             Platform/type catalog
    snapshots.js           Browser-local version history
worker/
  cloudflare-worker.js     CORS/fetch proxy for GitHub Pages
.github/workflows/
  validate.yml             Regression tests on push / pull request
server.js                  Local development server and local proxy
DEPLOY.md                  Detailed GitHub + Cloudflare deployment guide
test/                      Decoder, website and GA4 Inspector regression tests
```

---

# Run locally in VS Code

Requirements:

- Node.js 18+
- VS Code
- Git (recommended)

Open the project folder in VS Code, then run:

```powershell
npm test
node server.js
```

Open:

```text
http://localhost:3000/
```

The root page is the Digital Lens landing page. The application itself is:

```text
http://localhost:3000/app.html
```

The local server provides the fetch proxy, so GTM ID and website scans can work without Cloudflare during development.

---

# GitHub Pages hosting

Digital Lens is a static HTML/CSS/JavaScript application, so GitHub Pages is suitable for the frontend.
The official GitHub Pages documentation supports publishing static files from a repository and recommends GitHub Pages for automated deployment.

## Step 1 — Create the repository

Create a GitHub repository. Recommended name:

```text
Digital-Lens
```

or:

```text
digital-lens
```

Public repositories can use GitHub Pages on the GitHub Free plan.

## Step 2 — Upload the project

Upload the **contents of the `digital-lens` project folder**, not the ZIP file itself.

The repository root should look like:

```text
index.html
app.html
favicon.svg
assets/
js/
worker/
.github/
.nojekyll
README.md
DEPLOY.md
package.json
server.js
```

Make sure `.nojekyll` is included. A GitHub Actions workflow is not required for the current branch-based Pages setup.

## Step 3 — Enable GitHub Pages

In GitHub:

1. Open the repository.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Select branch **main**.
5. Select folder **/(root)**.
6. Save.

The repository already follows this structure, so `index.html` is served from the Pages root.

For a repository named `digital-lens` owned by `tappu001`, the project URL will normally be:

```text
https://tappu001.github.io/digital-lens/
```

GitHub may take several minutes to publish a new deployment.

## Step 4 — Test the landing page

Open the GitHub Pages URL. You should see the new Digital Lens landing page.

Click:

```text
Open Digital Lens →
```

That opens `app.html`, which contains the actual audit workspace.

---

# Cloudflare Worker proxy

The browser cannot normally fetch arbitrary third-party website HTML or Google's `gtm.js` response because of browser CORS restrictions. The Digital Lens Worker performs that fetch server-side and returns the response with CORS headers.

Your existing Worker URL is configured in:

```text
js/config.js
```

Current configured URL:

```text
https://tagscope-proxy.dudhrejiyatapasvi.workers.dev
```

You can keep this Worker if it is still deployed and its code matches `worker/cloudflare-worker.js`.

## If you need to recreate the Worker

1. Sign in to Cloudflare.
2. Open **Workers & Pages**.
3. Create a new Worker.
4. Use a name such as:

```text
digital-lens-proxy
```

5. Open **Edit code**.
6. Replace the Worker code with:

```text
worker/cloudflare-worker.js
```

7. Deploy it.

## How to find the Worker URL

After deployment, open the Worker overview page. Cloudflare shows the Worker endpoint, normally in this form:

```text
https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev
```

The exact URL is provided by Cloudflare; do not invent the subdomain.

Test it by opening:

```text
https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev/health
```

A healthy Worker returns JSON similar to:

```json
{"ok":true,"app":"digital-lens-proxy"}
```

## Restrict the Worker to your GitHub Pages site

In the Worker settings, create an environment variable:

```text
ALLOWED_ORIGINS
```

For a GitHub Pages project owned by `tappu001`, use the **origin only**:

```text
https://tappu001.github.io
```

Do not add the repository path or a trailing slash.

If you later use a custom domain, add that exact origin instead.

The Worker uses this value to reject browser requests coming from other origins.

## Connect the Worker to Digital Lens

Edit:

```text
js/config.js
```

Set:

```js
window.TSD_CONFIG = {
  proxyUrl: 'https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev',
};
```

Commit and push the change.

The hosted application will automatically use the Worker.

You can also open **Digital Lens → Settings → Fetch proxy**, enter the Worker URL, and click **Test**. This stores the override in the current browser only.

---

# Why the website scanner needs the Worker

The website flow is:

```text
User enters website URL
        ↓
Digital Lens frontend
        ↓
Cloudflare Worker
        ↓
Target website HTML
        ↓
Digital Lens scanner
        ↓
Website Insights
        ↓
Detected platform / GTM / pixels / IDs / scripts
```

If the Worker is not reachable, Digital Lens will intentionally show a proxy error instead of pretending that the scan succeeded.

---

# GA4 Inspector notes

The GA4 Inspector needs no Google Cloud project, OAuth client or API key. It only uses the same Cloudflare Worker (or local server) as the other workspaces to read Google's public `gtm.js` / `gtag.js` response.

If a value is not in the Google tag response (for example `send_page_view` or consent defaults, which live in the website code), add the website URL so the page HTML and its GTM containers can be inspected too.

---

# Website scan troubleshooting

### “Proxy unreachable”

Check:

1. The Worker URL in `js/config.js`.
2. Open the Worker `/health` URL directly.
3. Confirm `ALLOWED_ORIGINS` contains the GitHub Pages origin exactly.
4. Make sure there is no trailing slash in `ALLOWED_ORIGINS`.
5. Hard refresh the GitHub Pages site after deployment.

### The website loads but no GTM is found

That does not necessarily mean the site has no GTM. The scanner is analyzing the HTML it receives. A site may load GTM dynamically, through a first-party loader, through a tag-management platform, or through a framework after the initial HTML response.

### A website blocks the scan

Some websites use bot protection or require JavaScript execution before returning useful HTML. The Worker cannot turn a static HTTP fetch into a full browser. Use the GTM ID directly, or use the local/browser DevTools workflow for sites that require a real browser session.

### GTM ID works but names look strange

The published GTM container does not preserve the original workspace names. Digital Lens now uses a more consistent plain-English naming style, for example:

```text
GA4 · Purchase
Google Ads · Conversion · purchase
Meta Pixel · Purchase
Page view · URL contains /thank-you
Click - Just Links · Click URL contains /cart
Data Layer · ecommerce.transaction_id
Constant · G-XXXXXXXXXX
```

The generated names are descriptions, not claims about the original GTM workspace names.

---

# Cloudflare Worker security notes

The Worker blocks local/private IP targets and restricts browser origins through `ALLOWED_ORIGINS`.
Keep the allowed-origin list narrow. Do not turn it into a public unrestricted proxy unless you deliberately accept the abuse risk.

Cloudflare's documentation provides a CORS proxy pattern that follows the same basic architecture: receive the request, fetch the remote resource from the Worker, and add appropriate CORS response headers.

---

# Testing

Run the regression suite before pushing changes:

```powershell
npm test
```

The regression suite covers the GTM fixture container (naming, triggers, variables, templates, audit findings, snapshots, input classification), website scanning, and the GA4 Inspector (ID validation, gtm.js request with gtag.js fallback, destination / consent / linker / routing / campaign / cookie parsing, PII redaction, error handling, and a guard that cookie names and library strings are never reported as events).

---

# Branding

**Digital Lens™**

**See what matters.**

Built by **Tapasvi Dudhrejiya**.

Email: `dudhrejiyatapasvi@gmail.com`

LinkedIn: `https://www.linkedin.com/in/tapasvi-dudhrejiya/`
