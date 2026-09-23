# Digital Lens™

**See what matters.**

Digital Lens is a tracking and measurement audit workspace built by **Tapasvi Dudhrejiya**.
It is deliberately split into independent audit surfaces so website detection, GTM configuration,
and GA4 property configuration do not get mixed together.

- Email: `dudhrejiyatapasvi@gmail.com`
- LinkedIn: `https://www.linkedin.com/in/tapasvi-dudhrejiya/`

## What Digital Lens does

### 1. GTM Audit

Give Digital Lens a published GTM container ID or `gtm.js` URL. It decodes the published container and presents:

- Tags
- Triggers
- Variables
- Templates
- Findings
- Statistics
- Version changes
- Raw published configuration
- Human-readable generated names

Important: GTM removes real workspace names from the published container. Digital Lens therefore generates descriptive names from the item's settings. It does not claim that generated names are the original GTM names.

### 2. GA4 Property Audit

This is a separate property-level audit. A GA4 Measurement ID such as `G-XXXXXXXXXX` is **not treated as a GTM input**.

The user connects a Google account with access to the GA4 property. Digital Lens uses Google's Analytics Admin API with read-only access to inspect the configuration exposed by the API, including:

- Property name and ID
- Currency
- Industry category
- Reporting time zone
- Creation time where available
- Web / Android / iOS data streams
- Key events
- Enhanced Measurement settings
- Reporting identity
- Data retention
- Custom dimensions
- Custom metrics
- Data filters
- Google Ads links
- BigQuery links
- Google Signals information where available
- Audiences
- Referral/acquisition configuration status, with unavailable fields explicitly marked instead of guessed

A Google OAuth **Web application** client ID is required for the hosted GA4 audit. Never place a Google OAuth client secret in this repository.

### 3. Website Insights

Give Digital Lens a public website URL. The website scanner uses the configured Cloudflare Worker to fetch the page HTML and then independently detects:

- Website/CMS platform
- GTM containers
- Google tag / GA4 / Google Ads IDs
- Meta Pixel
- TikTok Pixel
- Snapchat Pixel
- LinkedIn Insight
- Microsoft Clarity
- Pinterest
- Hotjar
- GTM/custom tracking script loaders
- On-page versus GTM-based tracking observations

Website Insights is not the GTM Audit. A website can be scanned even when no GTM container is found.

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
    ga4.js                 GA4 Admin API client/audit
    scan.js                GTM + website scan orchestration
    parser.js              Published GTM parser
    catalog.js             Platform/type catalog
    snapshots.js           Browser-local version history
worker/
  cloudflare-worker.js     CORS/fetch proxy for GitHub Pages
.github/workflows/
  deploy.yml               GitHub Pages deployment
server.js                  Local development server and local proxy
DEPLOY.md                  Detailed GitHub + Cloudflare deployment guide
test/                      Decoder regression tests
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
The official GitHub Pages documentation supports publishing static files from a repository and recommends GitHub Actions for automated deployment.

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

Make sure `.nojekyll` and `.github/workflows/deploy.yml` are included.

## Step 3 — Enable GitHub Pages

In GitHub:

1. Open the repository.
2. Go to **Settings**.
3. Open **Pages**.
4. Under **Build and deployment**, select **GitHub Actions**.
5. Open the **Actions** tab.
6. Wait for **Deploy to GitHub Pages** to finish successfully.

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
  ga4ClientId: '',
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

# GA4 Audit setup

The GA4 audit is different from the website and GTM scanners.

A Measurement ID such as:

```text
G-XXXXXXXXXX
```

does not expose the private administrative configuration of a GA4 property by itself.

To perform a real property audit:

1. Create a Google Cloud project.
2. Enable the Google Analytics Admin API.
3. Create an OAuth **Web application** client.
4. Add your GitHub Pages origin as an authorized JavaScript origin.
5. Open Digital Lens.
6. Go to **GA4 Audit**.
7. Enter the OAuth Web Client ID.
8. Connect the Google account that has access to the GA4 property.
9. Select a property or enter its GA4 Measurement ID.

Use only the client ID in the frontend. **Never put a client secret into `index.html`, `app.html`, `js/config.js`, or any GitHub repository file.**

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

The current decoder regression suite covers the fixture container, naming, triggers, variables, templates, audit findings, snapshots and input classification.

---

# Branding

**Digital Lens™**

**See what matters.**

Built by **Tapasvi Dudhrejiya**.

Email: `dudhrejiyatapasvi@gmail.com`

LinkedIn: `https://www.linkedin.com/in/tapasvi-dudhrejiya/`
