// Deployment settings for the hosted Digital Lens™ version.
// After you deploy the Cloudflare Worker (see DEPLOY.md), paste its URL here and commit.
// Every visitor will then use it automatically. Users can still override it in Settings.
window.TSD_CONFIG = {
  proxyUrl: 'https://tagscope-proxy.dudhrejiyatapasvi.workers.dev',
  // Optional: Google OAuth Web Client ID for the GA4 Audit module.
  // You can also enter it in Settings; never put a client secret here.
  ga4ClientId: '',
};
