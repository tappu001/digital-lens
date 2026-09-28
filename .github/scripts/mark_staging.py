"""Marks the /staging/ copy: hidden from search engines, no site analytics, a STAGING badge."""

import pathlib
import re
import sys

BADGE = ('<a href="../" title="Staging copy: open the live site" style="position:fixed;left:12px;bottom:12px;z-index:9999;'
         'padding:6px 12px;border-radius:999px;background:#f5a524;color:#231600;font:700 11px/1.4 Inter,system-ui,sans-serif;'
         'letter-spacing:.1em;text-decoration:none;box-shadow:0 6px 18px rgba(0,0,0,.18)">STAGING</a>')

root = pathlib.Path(sys.argv[1])
for page in root.glob("*.html"):
    html = page.read_text(encoding="utf-8")
    html = re.sub(r"<!-- Google Tag Manager -->.*?<!-- End Google Tag Manager -->", "", html, flags=re.S)
    html = re.sub(r"<!-- Google Tag Manager \(noscript\) -->.*?<!-- End Google Tag Manager \(noscript\) -->", "", html, flags=re.S)
    html = html.replace("<head>", '<head>\n  <meta name="robots" content="noindex, nofollow">', 1)
    html = re.sub(r"(<body[^>]*>)", r"\1\n  " + BADGE.replace("\\", "\\\\"), html, count=1)
    page.write_text(html, encoding="utf-8")
    print("marked", page.name)
