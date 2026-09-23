// Lookup tables that turn GTM's compiled function codes into readable names.
// Works in the browser (window.TSD) and in Node (globalThis.TSD) for tests.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});

  // category drives icon colour and filters; short/long feed the two naming styles
  const TAG_TYPES = {
    __googtag: { name: 'Google Tag', category: 'analytics', badge: 'GT' },
    __gaawc: { name: 'GA4 Configuration (legacy)', category: 'analytics', badge: 'GA4' },
    __gaawe: { name: 'GA4 Event', category: 'analytics', badge: 'GA4' },
    __ua: { name: 'Universal Analytics', category: 'analytics', badge: 'UA' },
    __ga: { name: 'Classic Google Analytics', category: 'analytics', badge: 'GA' },
    __awct: { name: 'Google Ads Conversion Tracking', category: 'ads', badge: 'Ads' },
    __awcc: { name: 'Google Ads Calls from Website', category: 'ads', badge: 'Ads' },
    __awud: { name: 'Google Ads User-Provided Data Event', category: 'ads', badge: 'Ads' },
    __sp: { name: 'Google Ads Remarketing', category: 'ads', badge: 'Ads' },
    __gclidw: { name: 'Conversion Linker', category: 'ads', badge: 'CL' },
    __flc: { name: 'Floodlight Counter', category: 'ads', badge: 'FL' },
    __fls: { name: 'Floodlight Sales', category: 'ads', badge: 'FL' },
    __html: { name: 'Custom HTML', category: 'custom', badge: '</>' },
    __img: { name: 'Custom Image', category: 'custom', badge: 'IMG' },
    __bzi: { name: 'LinkedIn Insight', category: 'ads', badge: 'in' },
    __baut: { name: 'Microsoft Advertising UET', category: 'ads', badge: 'MS' },
    __hjtc: { name: 'Hotjar Tracking Code', category: 'analytics', badge: 'HJ' },
    __cegg: { name: 'Crazy Egg', category: 'analytics', badge: 'CE' },
    __twitter_website_tag: { name: 'X (Twitter) Base Pixel', category: 'ads', badge: 'X' },
    __crto: { name: 'Criteo OneTag', category: 'ads', badge: 'CR' },
    __asp: { name: 'AdRoll Smart Pixel', category: 'ads', badge: 'AR' },
    __opt: { name: 'Google Optimize', category: 'analytics', badge: 'OPT' },
    __paused: { name: 'Paused tag', category: 'paused', badge: '||' },
    __ogt_cross_domain: { name: 'Google tag setting: cross-domain', category: 'gtag-setting', badge: 'GT' },
    __ogt_1p_data_v2: { name: 'Google tag setting: user-provided data', category: 'gtag-setting', badge: 'GT' },
    __ogt_referral_exclusion: { name: 'Google tag setting: unwanted referrals', category: 'gtag-setting', badge: 'GT' },
    __ogt_session_timeout: { name: 'Google tag setting: session timeout', category: 'gtag-setting', badge: 'GT' },
    __ogt_google_signals: { name: 'Google tag setting: Google signals', category: 'gtag-setting', badge: 'GT' },
    __ogt_event_create: { name: 'Google tag setting: create event', category: 'gtag-setting', badge: 'GT' },
    __ogt_event_edit: { name: 'Google tag setting: modify event', category: 'gtag-setting', badge: 'GT' },
    __ogt_ip_mark: { name: 'Google tag setting: internal traffic', category: 'gtag-setting', badge: 'GT' },
    __ogt_dma: { name: 'Google tag setting: DMA', category: 'gtag-setting', badge: 'GT' },
  };

  // GTM adds these listener tags for click, form, scroll, timer, visibility and video triggers.
  const LISTENERS = {
    __cl: 'Click - All Elements',
    __lcl: 'Click - Just Links',
    __fsl: 'Form Submission',
    __sdl: 'Scroll Depth',
    __tl: 'Timer',
    __ytl: 'YouTube Video',
    __evl: 'Element Visibility',
    __hl: 'History Change',
    __jel: 'JavaScript Error',
  };

  // Friendly labels for listener settings shown in the trigger sheet
  const LISTENER_SETTINGS = {
    waitForTags: 'Wait for tags',
    waitForTagsTimeout: 'Max wait time (ms)',
    checkValidation: 'Check validation',
    verticalThresholdsPercent: 'Vertical scroll depths (%)',
    verticalThresholdsPixels: 'Vertical scroll depths (px)',
    verticalThresholdUnits: 'Vertical depth units',
    verticalThresholdOn: 'Vertical scroll depths on',
    horizontalThresholdsPercent: 'Horizontal scroll depths (%)',
    horizontalThresholdsPixels: 'Horizontal scroll depths (px)',
    horizontalThresholdOn: 'Horizontal scroll depths on',
    triggerStartOption: 'Enable trigger on',
    interval: 'Interval (ms)',
    limit: 'Limit',
    eventName: 'Event name',
    elementSelector: 'Element selector',
    elementId: 'Element ID',
    selectorType: 'Selection method',
    firingFrequency: 'When to fire',
    onScreenRatio: 'Minimum percent visible',
    useOnScreenDuration: 'Set minimum on-screen duration',
    onScreenDuration: 'On-screen duration (ms)',
    useDomChangeListener: 'Observe DOM changes',
    captureStart: 'Capture start',
    captureComplete: 'Capture complete',
    capturePause: 'Capture pause, seeking, and buffering',
    captureProgress: 'Capture progress',
    progressThresholdsPercent: 'Progress thresholds (%)',
    progressThresholdsTimeInSeconds: 'Progress thresholds (seconds)',
    fixMissingApi: 'Add JavaScript API support to all YouTube videos',
    uniqueTriggerId: 'Listener reference',
  };

  const VAR_TYPES = {
    __e: 'Custom Event',
    __v: 'Data Layer Variable',
    __u: 'URL',
    __f: 'HTTP Referrer',
    __c: 'Constant',
    __jsm: 'Custom JavaScript',
    __j: 'JavaScript Variable',
    __k: '1st-Party Cookie',
    __d: 'DOM Element',
    __aev: 'Auto-Event Variable',
    __smm: 'Lookup Table',
    __remm: 'RegEx Table',
    __gas: 'Google Analytics Settings (UA)',
    __cid: 'Container ID',
    __ctv: 'Container Version Number',
    __dbg: 'Debug Mode',
    __r: 'Random Number',
    __gtes: 'Google Tag: Event Settings',
    __gtcs: 'Google Tag: Configuration Settings',
    __uv: 'Undefined Value',
    __awec: 'User-Provided Data',
    __vis: 'Element Visibility',
    __t: 'Environment Name',
    __hid: 'HTML ID',
    __gtcq: 'Google Tag: Command Queue',
    __ctv2: 'Container Version',
  };

  // Google's own gallery/consent value templates ship with these function codes.
  // GTM shows them as "Google Analytics Value - <key>" etc., not as raw codes.
  const GOOGLE_VALUE_VARS = {
    __analytics_storage: 'Analytics Storage',
    __ad_storage: 'Ad Storage',
    __ad_user_data: 'Ad User Data',
    __ad_personalization: 'Ad Personalization',
    __functionality_storage: 'Functionality Storage',
    __personalization_storage: 'Personalization Storage',
    __security_storage: 'Security Storage',
  };

  const BUILTIN_DLV = {
    'gtm.element': 'Click Element',
    'gtm.elementClasses': 'Click Classes',
    'gtm.elementId': 'Click ID',
    'gtm.elementTarget': 'Click Target',
    'gtm.elementUrl': 'Click URL',
    'gtm.triggers': '_triggers',
    'gtm.scrollThreshold': 'Scroll Depth Threshold',
    'gtm.scrollUnits': 'Scroll Depth Units',
    'gtm.scrollDirection': 'Scroll Direction',
    'gtm.visibleRatio': 'Percent Visible',
    'gtm.visibleTime': 'On-Screen Duration',
    'gtm.videoTitle': 'Video Title',
    'gtm.videoPercent': 'Video Percent',
    'gtm.videoStatus': 'Video Status',
    'gtm.videoUrl': 'Video URL',
    'gtm.videoProvider': 'Video Provider',
    'gtm.videoCurrentTime': 'Video Current Time',
    'gtm.videoDuration': 'Video Duration',
    'gtm.videoVisible': 'Video Visible',
    'gtm.newUrl': 'New History URL',
    'gtm.oldUrl': 'Old History URL',
    'gtm.newUrlFragment': 'New History Fragment',
    'gtm.oldUrlFragment': 'Old History Fragment',
    'gtm.newHistoryState': 'New History State',
    'gtm.oldHistoryState': 'Old History State',
    'gtm.historyChangeSource': 'History Source',
    'gtm.errorMessage': 'Error Message',
    'gtm.errorUrl': 'Error URL',
    'gtm.errorLine': 'Error Line',
  };

  const AEV_TYPES = {
    TEXT: 'Click Text',
    CLASSES: 'Click Classes',
    ID: 'Click ID',
    URL: 'Click URL',
    ELEMENT: 'Click Element',
    TARGET: 'Click Target',
    HISTORY_NEW_URL_FRAGMENT: 'New History Fragment',
    HISTORY_OLD_URL_FRAGMENT: 'Old History Fragment',
  };

  const URL_COMPONENTS = {
    URL: 'Page URL',
    PATH: 'Page Path',
    HOST: 'Page Hostname',
    QUERY: 'URL Query',
    FRAGMENT: 'URL Fragment',
    PROTOCOL: 'URL Protocol',
    PORT: 'URL Port',
    EXTENSION: 'URL File Extension',
  };

  // short = convention style, long = readable style, icon = trigger glyph, all = label when no filters
  const TRIGGER_KINDS = {
    'gtm.init_consent': { short: 'Consent Init', long: 'Consent Initialization', icon: 'init', all: 'All Pages' },
    'gtm.init': { short: 'Init', long: 'Initialization', icon: 'init', all: 'All Pages' },
    'gtm.js': { short: 'PV', long: 'Page View', icon: 'page', all: 'All Pages' },
    'gtm.dom': { short: 'DOM', long: 'DOM Ready', icon: 'page', all: 'All Pages' },
    'gtm.load': { short: 'WL', long: 'Window Loaded', icon: 'page', all: 'All Pages' },
    'gtm.click': { short: 'Click', long: 'Click - All Elements', icon: 'click', all: 'All Clicks' },
    'gtm.linkClick': { short: 'Link Click', long: 'Click - Just Links', icon: 'click', all: 'All Links' },
    'gtm.formSubmit': { short: 'Form', long: 'Form Submission', icon: 'form', all: 'All Forms' },
    'gtm.scrollDepth': { short: 'Scroll', long: 'Scroll Depth', icon: 'scroll', all: 'All Pages' },
    'gtm.timer': { short: 'Timer', long: 'Timer', icon: 'timer', all: 'All Pages' },
    'gtm.historyChange': { short: 'History', long: 'History Change', icon: 'history', all: 'All Changes' },
    'gtm.historyChange-v2': { short: 'History', long: 'History Change', icon: 'history', all: 'All Changes' },
    'gtm.video': { short: 'YT', long: 'YouTube Video', icon: 'video', all: 'All Videos' },
    'gtm.elementVisibility': { short: 'Visibility', long: 'Element Visibility', icon: 'eye', all: 'All Elements' },
    'gtm.pageError': { short: 'JS Error', long: 'JavaScript Error', icon: 'error', all: 'All Errors' },
    'gtm.triggerGroup': { short: 'Group', long: 'Trigger Group', icon: 'group', all: '' },
  };
  const CUSTOM_EVENT_KIND = { short: 'CE', long: 'Custom Event', icon: 'event', all: '' };

  const OPERATORS = {
    _eq: ['equals', 'does not equal'],
    _cn: ['contains', 'does not contain'],
    _sw: ['starts with', 'does not start with'],
    _ew: ['ends with', 'does not end with'],
    _re: ['matches RegEx', 'does not match RegEx'],
    _css: ['matches CSS selector', 'does not match CSS selector'],
    _lt: ['less than', 'not less than'],
    _le: ['less than or equal to', 'greater than'],
    _gt: ['greater than', 'not greater than'],
    _ge: ['greater than or equal to', 'less than'],
  };

  // Recognise what Custom HTML, Custom Image, and community templates load.
  // Quoted global names ("fbq") catch template permissions such as access_globals.
  const PLATFORM_SIGNATURES = [
    { name: 'Meta Pixel', short: 'Meta', re: /connect\.facebook\.net|fbq\s*\(|["']fbq["']|facebook\.com\/tr/i, kind: 'ads', badge: 'M' },
    { name: 'TikTok Pixel', short: 'TikTok', re: /analytics\.tiktok\.com|ttq\.(load|track|page|identify)|["']ttq["']/i, kind: 'ads', badge: 'TT' },
    { name: 'Snapchat Pixel', short: 'Snap', re: /sc-static\.net|snaptr\s*\(|["']snaptr["']/i, kind: 'ads', badge: 'SC' },
    { name: 'Pinterest Tag', short: 'Pinterest', re: /s\.pinimg\.com|ct\.pinterest\.com|pintrk\s*\(|["']pintrk["']/i, kind: 'ads', badge: 'P' },
    { name: 'LinkedIn Insight', short: 'LinkedIn', re: /snap\.licdn\.com|px\.ads\.linkedin\.com|_linkedin_partner_id|lintrk\s*\(|["']lintrk["']/i, kind: 'ads', badge: 'in' },
    { name: 'Microsoft UET', short: 'MSADS', re: /bat\.bing\.com|uetq/i, kind: 'ads', badge: 'MS' },
    { name: 'X (Twitter) Pixel', short: 'X', re: /static\.ads-twitter\.com|twq\s*\(|["']twq["']/i, kind: 'ads', badge: 'X' },
    { name: 'Reddit Pixel', short: 'Reddit', re: /redditstatic\.com|rdt\s*\(|["']rdt["']/i, kind: 'ads', badge: 'R' },
    { name: 'OpenAI Pixel', short: 'OpenAI', re: /oaiq|openai\.com\/pixel|["']oaiq["']/i, kind: 'ads', badge: 'AI' },
    { name: 'Quora Pixel', short: 'Quora', re: /a\.quora\.com|qp\s*\(\s*['"]track/i, kind: 'ads', badge: 'Q' },
    { name: 'Criteo', short: 'Criteo', re: /criteo/i, kind: 'ads', badge: 'CR' },
    { name: 'Taboola', short: 'Taboola', re: /taboola/i, kind: 'ads', badge: 'TB' },
    { name: 'Outbrain', short: 'Outbrain', re: /outbrain/i, kind: 'ads', badge: 'OB' },
    { name: 'Amazon Ads', short: 'Amazon', re: /amazon-adsystem/i, kind: 'ads', badge: 'AMZ' },
    { name: 'Microsoft Clarity', short: 'Clarity', re: /clarity\.ms|clarity\s*\(\s*['"]|["']clarity["']/i, kind: 'analytics', badge: 'CL' },
    { name: 'Hotjar', short: 'Hotjar', re: /hotjar/i, kind: 'analytics', badge: 'HJ' },
    { name: 'Klaviyo', short: 'Klaviyo', re: /klaviyo|_learnq/i, kind: 'marketing', badge: 'K' },
    { name: 'HubSpot', short: 'HubSpot', re: /hs-scripts|hs-analytics|hubspot|["']_hsq["']/i, kind: 'marketing', badge: 'HS' },
    { name: 'MoEngage', short: 'MoEngage', re: /moengage/i, kind: 'marketing', badge: 'MO' },
    { name: 'Stape', short: 'Stape', re: /stape/i, kind: 'analytics', badge: 'ST' },
    { name: 'Cookiebot', short: 'Cookiebot', re: /cookiebot/i, kind: 'consent', badge: 'CB' },
    { name: 'OneTrust', short: 'OneTrust', re: /onetrust|otSDKStub|cookielaw\.org/i, kind: 'consent', badge: 'OT' },
    { name: 'Usercentrics', short: 'Usercentrics', re: /usercentrics/i, kind: 'consent', badge: 'UC' },
    { name: 'CookieYes', short: 'CookieYes', re: /cookieyes/i, kind: 'consent', badge: 'CY' },
    { name: 'Complianz', short: 'Complianz', re: /complianz/i, kind: 'consent', badge: 'CZ' },
    { name: 'iubenda', short: 'iubenda', re: /iubenda/i, kind: 'consent', badge: 'IU' },
    { name: 'Termly', short: 'Termly', re: /termly/i, kind: 'consent', badge: 'TE' },
    { name: 'Didomi', short: 'Didomi', re: /didomi/i, kind: 'consent', badge: 'DI' },
    { name: 'Osano', short: 'Osano', re: /osano/i, kind: 'consent', badge: 'OS' },
    { name: 'Consent Mode (gtag)', short: 'Consent', re: /gtag\s*\(\s*['"]consent['"]/i, kind: 'consent', badge: 'CM' },
    { name: 'Consent Mode (template)', short: 'Consent', re: /setDefaultConsentState|updateConsentState|access_consent/i, kind: 'consent', badge: 'CM' },
    { name: 'Google tag (gtag.js)', short: 'gtag', re: /googletagmanager\.com\/gtag\/js|gtag\s*\(\s*['"](config|event)['"]/i, kind: 'analytics', badge: 'GT' },
  ];

  // Pull event names out of Custom HTML so names read like "Meta Pixel - Purchase"
  const PIXEL_EVENTS = {
    'Meta Pixel': [/fbq\(\s*['"](?:track|trackCustom)['"]\s*,\s*['"]([^'"]+)['"]/g, /fbq\(\s*['"](?:trackSingle|trackSingleCustom)['"]\s*,\s*['"][^'"]*['"]\s*,\s*['"]([^'"]+)['"]/g],
    'TikTok Pixel': [/ttq\.track\(\s*['"]([^'"]+)['"]/g],
    'Snapchat Pixel': [/snaptr\(\s*['"]track['"]\s*,\s*['"]([^'"]+)['"]/g],
    'Pinterest Tag': [/pintrk\(\s*['"]track['"]\s*,\s*['"]([^'"]+)['"]/g],
    'LinkedIn Insight': [/lintrk\(\s*['"]track['"]\s*,\s*\{[^}]*?conversion_id['"]?\s*:\s*['"]?(\d+)/g],
    'Microsoft UET': [/uetq\.push\(\s*['"]event['"]\s*,\s*['"]([^'"]+)['"]/g],
    'X (Twitter) Pixel': [/twq\(\s*['"](?:event|track)['"]\s*,\s*['"]([^'"]+)['"]/g],
    'Reddit Pixel': [/rdt\(\s*['"]track['"]\s*,\s*['"]([^'"]+)['"]/g],
    'Quora Pixel': [/qp\(\s*['"]track['"]\s*,\s*['"]([^'"]+)['"]/g],
    'Google tag (gtag.js)': [/gtag\(\s*['"]event['"]\s*,\s*['"]([^'"]+)['"]/g],
  };

  function detectPlatforms(text) {
    if (!text) return [];
    return PLATFORM_SIGNATURES.filter((s) => s.re.test(text)).map((s) => ({ name: s.name, short: s.short, kind: s.kind, badge: s.badge }));
  }

  function platformShort(name) {
    const s = PLATFORM_SIGNATURES.find((x) => x.name === name);
    return s ? s.short : name;
  }

  TSD.catalog = {
    TAG_TYPES, LISTENERS, LISTENER_SETTINGS, VAR_TYPES, BUILTIN_DLV, AEV_TYPES, URL_COMPONENTS,
    TRIGGER_KINDS, CUSTOM_EVENT_KIND, OPERATORS, PLATFORM_SIGNATURES, PIXEL_EVENTS, GOOGLE_VALUE_VARS,
    detectPlatforms, platformShort,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
