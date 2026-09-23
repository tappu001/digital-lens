// Copyright 2012 Google Inc. All rights reserved.
 
(function(){

var data = {
 "resource": {
  "version": "42",
  "macros": [
   {
    "function": "__e"
   },
   {
    "function": "__u",
    "vtp_component": "PATH",
    "vtp_enableMultiQueryKeys": false
   },
   {
    "function": "__v",
    "vtp_name": "gtm.elementUrl",
    "vtp_dataLayerVersion": 1
   },
   {
    "function": "__v",
    "vtp_name": "gtm.triggers",
    "vtp_dataLayerVersion": 2,
    "vtp_setDefaultValue": true,
    "vtp_defaultValue": ""
   },
   {
    "function": "__c",
    "vtp_value": "G-ABC123XYZ"
   },
   {
    "function": "__v",
    "vtp_name": "ecommerce.transaction_id",
    "vtp_dataLayerVersion": 2
   },
   {
    "function": "__gas",
    "vtp_trackingId": "UA-111111-1",
    "vtp_cookieDomain": "auto"
   },
   {
    "function": "__u",
    "vtp_component": "HOST"
   },
   {
    "function": "__jsm",
    "vtp_javascript": [
     "template",
     "(function(){ var p = ",
     [
      "escape",
      [
       "macro",
       1
      ],
      8,
      16
     ],
     "; return p.split('/')[1]; })()"
    ]
   },
   {
    "function": "__smm",
    "vtp_input": [
     "macro",
     7
    ],
    "vtp_map": [
     "list",
     [
      "map",
      "key",
      "www.example.com",
      "value",
      "prod"
     ],
     [
      "map",
      "key",
      "staging.example.com",
      "value",
      "stage"
     ]
    ],
    "vtp_setDefaultValue": false
   },
   {
    "function": "__v",
    "vtp_name": "gtm.scrollThreshold",
    "vtp_dataLayerVersion": 1
   }
  ],
  "tags": [
   {
    "function": "__googtag",
    "once_per_event": true,
    "vtp_tagId": [
     "macro",
     4
    ],
    "vtp_configSettingsTable": [
     "list",
     [
      "map",
      "parameter",
      "server_container_url",
      "parameterValue",
      "https://sst.example.com"
     ],
     [
      "map",
      "parameter",
      "send_page_view",
      "parameterValue",
      "true"
     ]
    ],
    "tag_id": 11
   },
   {
    "function": "__googtag",
    "once_per_event": true,
    "vtp_tagId": "G-ABC123XYZ",
    "tag_id": 12
   },
   {
    "function": "__gaawe",
    "once_per_event": true,
    "vtp_eventName": "purchase",
    "vtp_measurementIdOverride": [
     "macro",
     4
    ],
    "vtp_sendEcommerceData": false,
    "tag_id": 13
   },
   {
    "function": "__gaawe",
    "once_per_event": true,
    "vtp_eventName": "add_to_cart",
    "vtp_measurementIdOverride": "G-ABC123XYZ",
    "vtp_sendEcommerceData": true,
    "vtp_getEcommerceDataFrom": "dataLayer",
    "tag_id": 14
   },
   {
    "function": "__awct",
    "once_per_event": true,
    "vtp_conversionId": "123456789",
    "vtp_conversionLabel": "abcDEF",
    "vtp_conversionValue": "0",
    "tag_id": 15
   },
   {
    "function": "__html",
    "once_per_event": true,
    "vtp_html": "<script>!function(f,b,e,v){ if(f.fbq)return; n=f.fbq=function(){}; }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');\nfbq('init', \"999\"); fbq('track','PageView'); document.write('<img src=\"x\">');</script>",
    "vtp_supportDocumentWrite": false,
    "setup_tags": [
     "list",
     [
      "tag",
      10,
      0
     ]
    ],
    "tag_id": 16
   },
   {
    "function": "__cvt_999_1",
    "once_per_event": true,
    "vtp_pixelId": "C123",
    "vtp_event": "CompletePayment",
    "tag_id": 17
   },
   {
    "function": "__ua",
    "once_per_event": true,
    "vtp_trackType": "TRACK_PAGEVIEW",
    "vtp_gaSettings": [
     "macro",
     6
    ],
    "tag_id": 18
   },
   {
    "function": "__paused",
    "vtp_originalTagType": "html",
    "tag_id": 19
   },
   {
    "function": "__lcl",
    "vtp_waitForTags": false,
    "vtp_checkValidation": false,
    "vtp_uniqueTriggerId": "7_20",
    "tag_id": 20
   },
   {
    "function": "__html",
    "once_per_event": true,
    "vtp_html": "<script>window.helper = {a: \"}\"};</script>",
    "tag_id": 21
   },
   {
    "function": "__html",
    "once_per_event": true,
    "vtp_html": "<script>console.log('orphan')</script>",
    "tag_id": 22
   },
   {
    "function": "__sdl",
    "vtp_verticalThresholdUnits": "PERCENT",
    "vtp_verticalThresholdsPercent": "25,50,75,90",
    "vtp_verticalThresholdOn": true,
    "vtp_horizontalThresholdOn": false,
    "vtp_uniqueTriggerId": "7_30",
    "tag_id": 23
   },
   {
    "function": "__gaawe",
    "once_per_event": true,
    "vtp_eventName": "scroll_depth",
    "vtp_eventSettingsTable": [
     "list",
     [
      "map",
      "parameter",
      "percent",
      "parameterValue",
      [
       "macro",
       10
      ]
     ]
    ],
    "vtp_measurementIdOverride": [
     "macro",
     4
    ],
    "tag_id": 24
   },
   {
    "function": "__html",
    "once_per_event": true,
    "vtp_html": "<!-- Hotjar Tracking Code for www.example.com -->\n<script>(function(h,o,t,j,a,r){ h.hj=h.hj||function(){}; r.src=\"https://static.hotjar.com/c/hotjar-\"+h._hjSettings.hjid+\".js\";})(window,document);</script>",
    "tag_id": 25
   },
   {
    "function": "__html",
    "once_per_event": true,
    "vtp_html": "<script>fbq('track', 'Purchase', {value: {{DLV - ecommerce.value}}, currency: 'USD'});</script>",
    "tag_id": 26
   },
   {
    "function": "__tl",
    "vtp_eventName": "gtm.timer",
    "vtp_interval": "30000",
    "vtp_limit": "1",
    "vtp_uniqueTriggerId": "7_31",
    "tag_id": 27
   },
   {
    "function": "__html",
    "once_per_event": true,
    "vtp_html": "<script>gtag('event', 'conversion', {'send_to': 'AW-555/xyz'});</script>",
    "tag_id": 28
   }
  ],
  "predicates": [
   {
    "function": "_eq",
    "arg0": [
     "macro",
     0
    ],
    "arg1": "gtm.js"
   },
   {
    "function": "_eq",
    "arg0": [
     "macro",
     0
    ],
    "arg1": "purchase"
   },
   {
    "function": "_cn",
    "arg0": [
     "macro",
     1
    ],
    "arg1": "/thank-you"
   },
   {
    "function": "_eq",
    "arg0": [
     "macro",
     0
    ],
    "arg1": "gtm.linkClick"
   },
   {
    "function": "_re",
    "arg0": [
     "macro",
     3
    ],
    "arg1": "(^$|((^|,)7_20($|,)))"
   },
   {
    "function": "_cn",
    "arg0": [
     "macro",
     2
    ],
    "arg1": "/cart"
   },
   {
    "function": "_eq",
    "arg0": [
     "macro",
     0
    ],
    "arg1": "gtm.dom"
   },
   {
    "function": "_eq",
    "arg0": [
     "macro",
     7
    ],
    "arg1": "staging.example.com"
   },
   {
    "function": "_re",
    "arg0": [
     "macro",
     0
    ],
    "arg1": "^(add_to_cart|view_item)$",
    "ignore_case": true
   },
   {
    "function": "_eq",
    "arg0": [
     "macro",
     0
    ],
    "arg1": "gtm.scrollDepth"
   },
   {
    "function": "_re",
    "arg0": [
     "macro",
     3
    ],
    "arg1": "(^$|((^|,)7_30($|,)))"
   },
   {
    "function": "_eq",
    "arg0": [
     "macro",
     0
    ],
    "arg1": "gtm.timer"
   },
   {
    "function": "_re",
    "arg0": [
     "macro",
     3
    ],
    "arg1": "(^$|((^|,)7_31($|,)))"
   },
   {
    "function": "_cn",
    "arg0": [
     "macro",
     1
    ],
    "arg1": "/blog"
   }
  ],
  "rules": [
   [
    [
     "if",
     0
    ],
    [
     "add",
     0,
     1,
     5,
     7,
     9,
     12,
     14
    ]
   ],
   [
    [
     "if",
     1
    ],
    [
     "add",
     2,
     4,
     15,
     17
    ]
   ],
   [
    [
     "if",
     0,
     2
    ],
    [
     "add",
     6
    ]
   ],
   [
    [
     "if",
     3,
     4,
     5
    ],
    [
     "add",
     3
    ]
   ],
   [
    [
     "if",
     7
    ],
    [
     "block",
     5
    ]
   ],
   [
    [
     "if",
     8
    ],
    [
     "add",
     3
    ]
   ],
   [
    [
     "if",
     9,
     10
    ],
    [
     "add",
     13
    ]
   ],
   [
    [
     "if",
     0,
     13
    ],
    [
     "add",
     16
    ]
   ],
   [
    [
     "if",
     11,
     12
    ],
    [
     "add",
     13
    ]
   ]
  ]
 },
 "runtime": [
  [
   50,
   "__cvt_999_1",
   [
    46,
    "a"
   ],
   [
    52,
    "b",
    [
     "require",
     "injectScript"
    ]
   ],
   [
    2,
    [
     15,
     "b"
    ],
    "https://analytics.tiktok.com/i18n/pixel/events.js"
   ]
  ]
 ],
 "permissions": {
  "__cvt_999_1": {
   "inject_script": {
    "urls": [
     "https://analytics.tiktok.com/*"
    ]
   },
   "access_globals": {
    "keys": [
     {
      "key": "ttq",
      "read": true,
      "write": true,
      "execute": true
     }
    ]
   }
  }
 },
 "sandboxed_scripts": [
  "__cvt_999_1"
 ],
 "security_groups": {
  "google": [
   "__googtag",
   "__gaawe"
  ]
 }
};

/*
 Copyright The Closure Library Authors.
*/
var ba = function(a){ return "{" + a + "}"; }; var ctid = "GTM-TEST123";
})()
