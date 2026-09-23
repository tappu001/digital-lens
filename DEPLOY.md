# Digital Lens™ — Deployment Guide

This guide gets the new Digital Lens landing page and audit application onto GitHub Pages and connects the existing Cloudflare Worker proxy.

## Architecture

```text
GitHub Pages
│
├── index.html      → Digital Lens landing page
└── app.html        → Audit workspace
        │
        └──────────────→ Cloudflare Worker
                              │
                              ├── Fetch website HTML
                              └── Fetch published gtm.js
```

The GA4 property audit is separate and uses Google OAuth + the Analytics Admin API.

## 1. GitHub repository

Create a repository such as `digital-lens`.

Upload the contents of this project to the repository root. Do not upload only the ZIP file.

The root must contain `index.html`, `app.html`, `assets/`, `js/`, `worker/`, `.github/`, `.nojekyll`, `README.md`, and the other project files.

## 2. GitHub Pages

1. Repository → **Settings** → **Pages**.
2. Under **Build and deployment**, choose **GitHub Actions**.
3. Push to `main`.
4. The included `.github/workflows/deploy.yml` deploys the entire repository.
5. Open the generated Pages URL.

The landing page is `/` and the application is `/app.html`.

For a project repository, the normal URL is:

```text
https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/
```

## 3. Cloudflare Worker

The existing Worker can be reused. The frontend currently points to:

```text
https://tagscope-proxy.dudhrejiyatapasvi.workers.dev
```

If that Worker is still deployed, you do not need to create another one.

### Recreate it if needed

1. Cloudflare Dashboard → **Workers & Pages**.
2. Create a Worker.
3. Open **Edit code**.
4. Paste `worker/cloudflare-worker.js`.
5. Deploy.
6. Copy the `workers.dev` URL shown by Cloudflare.

Test:

```text
https://YOUR-WORKER-URL/health
```

### Allow the GitHub Pages origin

Add an environment variable named:

```text
ALLOWED_ORIGINS
```

For example:

```text
https://tappu001.github.io
```

Use the origin only — no repository path and no trailing slash.

If you use several frontend origins, separate them with commas.

## 4. Configure the frontend

Edit `js/config.js`:

```js
window.TSD_CONFIG = {
  proxyUrl: 'https://YOUR-WORKER-URL',
  ga4ClientId: '',
};
```

Commit and push.

## 5. Verify the website scanner

Open the hosted site → **Open Digital Lens** → **Website Insights**.

Enter a public website such as:

```text
https://example.com
```

The top status should say **Hosted proxy**.

If it says **Proxy unreachable**, test `/health` and check `ALLOWED_ORIGINS`.

## 6. Verify GTM

Open **GTM Audit** and enter a published container ID such as:

```text
GTM-XXXXXXX
```

The application requests the published `gtm.js` through the Cloudflare Worker and decodes it in the browser.

You can also paste a captured `gtm.js` response, which does not require the Worker.

## 7. GA4 OAuth

For the GA4 audit:

1. Create/select a Google Cloud project.
2. Enable the Google Analytics Admin API.
3. Create an OAuth Web application client.
4. Add the GitHub Pages origin to Authorized JavaScript origins.
5. Put the **client ID only** into Digital Lens Settings or the GA4 Audit screen.
6. Do not commit a client secret.
7. Connect a Google account that has access to the GA4 property.

## 8. Updating the product

After making changes locally:

```powershell
npm test
git add .
git commit -m "Update Digital Lens"
git push origin main
```

GitHub Actions publishes the new version automatically.

## 9. Cloudflare changes

You only need to redeploy the Worker when `worker/cloudflare-worker.js` changes or when you need to change its environment variables/secrets.

Changing frontend files such as `index.html`, `app.html`, `js/app.js`, or `js/config.js` only requires a GitHub Pages deployment.
