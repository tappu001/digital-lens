"""Builds downloads/digital-lens-suite.zip: the App Inspector suite plus the Digital Lens web app.

    python suite/build_zip.py           build the ZIP
    python suite/build_zip.py --check   fail if the committed ZIP is out of date with the source
"""

import io
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUITE = os.path.join(ROOT, "suite")
OUT = os.path.join(ROOT, "downloads", "digital-lens-suite.zip")
PREFIX = "digital-lens-suite/"

SUITE_FILES = ["Install Digital Lens.bat", "Uninstall Digital Lens.bat", "run_agent.py", "suite_addon.py", "decoders/__init__.py",
               "decoders/platforms.py", "requirements.txt", "README.md", "start.sh", "start-windows.bat", "restore-phone.sh", "restore-phone.bat"]
WEB_FILES = ["index.html", "app.html", "app-inspector.html", "favicon.svg"]
WEB_DIRS = ["assets", "js"]
EXECUTABLE = {"start.sh", "restore-phone.sh"}
FIXED_TIME = (2026, 1, 1, 0, 0, 0)


def entries():
    """[(archive name, absolute path)] in a stable order."""
    out = [(PREFIX + f, os.path.join(SUITE, f)) for f in SUITE_FILES]
    out += [(PREFIX + f, os.path.join(ROOT, f)) for f in WEB_FILES]
    for d in WEB_DIRS:
        for base, dirs, files in os.walk(os.path.join(ROOT, d)):
            dirs.sort()
            for f in sorted(files):
                p = os.path.join(base, f)
                out.append((PREFIX + os.path.relpath(p, ROOT).replace(os.sep, "/"), p))
    return out


def build_bytes():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, path in entries():
            info = zipfile.ZipInfo(name, FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = ((0o755 if os.path.basename(name) in EXECUTABLE else 0o644) | 0o100000) << 16
            with open(path, "rb") as f:
                z.writestr(info, f.read())
    return buf.getvalue()


def check():
    if not os.path.isfile(OUT):
        return ["downloads/digital-lens-suite.zip is missing"]
    problems = []
    with zipfile.ZipFile(OUT) as z:
        names = set(z.namelist())
        expected = entries()
        for name, path in expected:
            if name not in names:
                problems.append(f"missing {name}")
            else:
                with open(path, "rb") as f:
                    if z.read(name) != f.read():
                        problems.append(f"out of date: {name}")
        extra = names - {n for n, _ in expected}
        problems += [f"unexpected {n}" for n in sorted(extra)]
    return problems


if __name__ == "__main__":
    if "--check" in sys.argv:
        issues = check()
        if issues:
            print("digital-lens-suite.zip is not up to date. Run: python suite/build_zip.py\n  " + "\n  ".join(issues[:20]))
            sys.exit(1)
        print("digital-lens-suite.zip is up to date.")
    else:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, "wb") as f:
            f.write(build_bytes())
        print(f"Wrote {os.path.relpath(OUT, ROOT)} ({len(entries())} files)")
