# Digital Lens™ — Deployment Guide

## Current production setup

**Frontend:** GitHub Pages  
**Repository:** `tappu001/digital-lens`  
**Branch:** `main`  
**Pages folder:** `/(root)`  
**Landing page:** `index.html`  
**Workspace:** `app.html`

The repository is intentionally configured as a static GitHub Pages site. **Do not switch Pages to GitHub Actions** unless a deployment workflow is added later.

## 1. GitHub Pages settings

In **Repository → Settings → Pages**:

- **Source:** Deploy from a branch
- **Branch:** `main`
- **Folder:** `/(root)`

The expected URL is:

`https://tappu001.github.io/digital-lens/`

Workspace:

`https://tappu001.github.io/digital-lens/app.html`

The project root must contain:

```text
index.html
app.html
favicon.svg
.nojekyll
assets/
js/
worker/
test/
README.md
DEPLOY.md
package.json
server.js
```

## 2. Cloudflare Worker

The hosted scanner uses this Worker:

`https://tagscope-proxy.dudhrejiyatapasvi.workers.dev`

The frontend configuration is in `js/config.js`.

The Worker must allow this origin:

`https://tappu001.github.io`

Cloudflare Worker environment variable:

```text
ALLOWED_ORIGINS=https://tappu001.github.io
```

Do not add the repository path or trailing slash.

Test the Worker:

`https://tagscope-proxy.dudhrejiyatapasvi.workers.dev/health`

Expected response:

```json
{"ok":true,"app":"digital-lens-proxy"}
```

If `/health` works but Digital Lens reports **Proxy unreachable**, check the `ALLOWED_ORIGINS` value.

## 3. Website Insights

The flow is:

```text
Website URL
    ↓
Digital Lens
    ↓
Cloudflare Worker
    ↓
Website HTML
    ↓
Digital Lens scanner
    ↓
Website Insights
```

Website Insights independently detects the website platform, verifies GTM containers against Google's published `gtm.js`, ignores known placeholder IDs such as `GTM-OVERRIDE`, and detects Google tags, Meta, TikTok, Snapchat, LinkedIn, Clarity, Pinterest, Hotjar and other tracking signals.

## 4. GTM Audit

GTM Audit accepts:

- Published GTM container ID
- Published `gtm.js` URL
- Pasted `gtm.js` response

The Cloudflare Worker is used when the browser needs to fetch a published `gtm.js`.

The audit generates human-readable names because published GTM configuration does not reliably contain the original workspace names.

## 5. GA4 Inspector

The GA4 Inspector is separate from GTM Audit and Website Insights. It takes a public Measurement ID and reads Google's public Google tag response through the same Worker:

`https://www.googletagmanager.com/gtm.js?id=G-…`, falling back to `https://www.googletagmanager.com/gtag/js?id=G-…`

No OAuth client, Google login or GA4 Admin API is used, and no Worker change is required. Private GA4 property settings are never shown.

## 6. Local development

Requirements:

- Node.js 18+
- npm

Run:

```powershell
npm test
node server.js
```

Open:

`http://localhost:3000/`

Workspace:

`http://localhost:3000/app.html`

## 7. Updating the hosted product

Because Pages is configured as **Deploy from a branch → main → /(root)**, changes pushed to `main` are published by GitHub Pages automatically.

After changing frontend files, wait for the Pages deployment and hard-refresh the browser with:

`Ctrl + Shift + R`

## 8. Cloudflare changes

Only redeploy the Worker when `worker/cloudflare-worker.js` changes or Worker environment variables change.

Frontend changes do not require a Cloudflare redeployment.

## 9. Important

Keep the project files at the repository root. Do **not** put them inside a `tagscope-decoder/` or other nested folder, otherwise the Pages root will not find `index.html` and the relative CSS/JS paths will break.
